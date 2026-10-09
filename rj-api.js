/* 跟后端说话的唯一出入口。评论区和账号页都走这里。

   两条不变量：
   1. apiBase 为空或后端够不着时，available() 返回 false，调用方保持原来的静态形态，页面不报错。
   2. 读者写的任何字都不经过这里进 DOM —— 这里只管收发 JSON，渲染一律 textContent。 */
window.RJ_API = (function () {
  "use strict";
  var CFG = window.RJ_CONFIG || { apiBase: "" };
  var base = CFG.apiBase || "";
  var probe = null;   // Promise<config|null>，只探一次
  var meCache = null; // Promise<me|null>
  var meKnown = null, meProblem = false, meEpoch = 0;
  var unread = 0;     // 右上角小红点上的数（刀 R）
  // 「这个浏览器登录过」的提示位：只是一个 0/1，不是凭据（会话在 HttpOnly cookie 里）。
  // 用处：没有评论区的页面（首页、百宝箱……）只在它为 1 时才去问 /api/me 拿小红点，匿名读者一次请求都不多发。
  var HINT = "rj_signed_in";
  var SELECTOR = "rj_session_selector";
  var SESSION_RE = /^s_[a-km-np-z2-9]{32}$/;
  var fallbackQueue = Promise.resolve();
  var memorySelector = { session_id: null, generation: 0 }, memoryOnly = false;
  var coordinationDB = null;
  var MUTATION_DEADLINE = 30000, OWNERSHIP_TTL = 120000;
  function hint(v) {
    try {
      if (v === undefined) return localStorage.getItem(HINT) === "1";
      if (v) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT);
    } catch (e) { /* 隐私模式读写不了就当没登录过，页面照常 */ }
    return false;
  }

  function url(path) { return base.replace(/\/+$/, "") + path; }

  function selectorState() {
    if (memoryOnly) return memorySelector;
    try {
      var value = JSON.parse(localStorage.getItem(SELECTOR) || "null");
      if (value && Number.isSafeInteger(value.generation)
          && (value.session_id === null || SESSION_RE.test(value.session_id))) return value;
      return { session_id: null, generation: 0 };
    } catch (e) { memoryOnly = true; /* 存储不可用时用本页非秘密选择器 */ }
    return memorySelector;
  }

  function selector() {
    var value = selectorState();
    return value.session_id ? value : null;
  }

  function storeSelector(sessionId) {
    var old = selectorState();
    var generation = old.generation + 1;
    var next = { session_id: sessionId || null, generation: generation };
    memorySelector = next;
    try {
      localStorage.setItem(SELECTOR, JSON.stringify(next));
    } catch (e) { memoryOnly = true; /* 本页仍保留非秘密选择器，刷新后由服务端兼容路径核验 */ }
    identityChanged();
  }

  function identityChanged() {
    ++meEpoch; meCache = null; meKnown = null; meProblem = false; unread = 0;
    if (window.dispatchEvent && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("rj-identity-change"));
    }
  }

  function openCoordination() {
    if (coordinationDB) return coordinationDB;
    coordinationDB = new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { settled = true; resolve(null); }, 2500);
      try {
        var request = indexedDB.open("rj-session-coordination", 1);
        request.onupgradeneeded = function () { request.result.createObjectStore("ownership"); };
        request.onerror = request.onblocked = function () {
          if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
        };
        request.onsuccess = function () {
          if (settled) { request.result.close(); return; }
          settled = true; clearTimeout(timer);
          request.result.onversionchange = function () { request.result.close(); };
          resolve(request.result);
        };
      } catch (e) { settled = true; clearTimeout(timer); resolve(null); }
    });
    return coordinationDB;
  }

  // A readwrite transaction is the cross-page compare-and-set. Only owner/fence/expiry
  // metadata lives here; cookies, recovery codes and link tokens never enter this store.
  function ownershipTransaction(db, change) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("ownership", "readwrite"), answer;
      var store = tx.objectStore("ownership"), request = store.get("selector");
      request.onsuccess = function () {
        try { answer = change(request.result || { fence: 0 }, store); }
        catch (e) { tx.abort(); reject(e); }
      };
      tx.oncomplete = function () { resolve(answer); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error("coordination")); };
    });
  }

  function coordinated(work) {
    return openCoordination().then(function (db) {
      function snapshot() {
        var state = selectorState();
        return { generation: state.generation, session_id: state.session_id };
      }
      if (!db) return work(snapshot());
      var owner = Date.now().toString(36) + Math.random().toString(36).slice(2);
      function attempt() {
        return ownershipTransaction(db, function (record, store) {
          if (record.owner && record.expires > Date.now()) return null;
          var next = { owner: owner, fence: record.fence + 1, expires: Date.now() + OWNERSHIP_TTL };
          store.put(next, "selector");
          var held = snapshot(); held.db = db; held.owner = owner; held.fence = next.fence;
          return held;
        }).catch(function () { return snapshot(); }).then(function (held) {
          if (!held) return new Promise(function (resolve) { setTimeout(resolve, 40); }).then(attempt);
          if (!held.db) return work(held); // Persistent coordination unavailable: same-page queue only.
          return Promise.resolve().then(function () { return work(held); }).finally(function () {
            return ownershipTransaction(db, function (record, store) {
              if (record.owner === held.owner && record.fence === held.fence) {
                store.put({ fence: record.fence }, "selector");
              }
            }).catch(function () {});
          });
        });
      }
      return attempt();
    });
  }

  function ownsIdentity(held, record) {
    var state = selectorState();
    return state.generation === held.generation && state.session_id === held.session_id
      && (!held.db || (record.owner === held.owner && record.fence === held.fence && record.expires > Date.now()));
  }

  function publishSelector(sessionId, held) {
    function commit(record) {
      if (!ownsIdentity(held, record)) return false;
      storeSelector(sessionId); return true;
    }
    if (!held.db) return Promise.resolve(commit());
    return ownershipTransaction(held.db, commit).catch(function () { return false; });
  }

  function withSelectorLock(work) {
    function acquire() {
      if (navigator.locks && navigator.locks.request) return navigator.locks.request("rj-session-selector", function () { return coordinated(work); });
      return coordinated(work);
    }
    var run = fallbackQueue.then(acquire, acquire);
    fallbackQueue = run.catch(function () {});
    return run;
  }

  function isSessionMutation(method, path) {
    return (method === "POST" && (path === "/api/accounts" || path === "/api/sessions"))
      || (method === "DELETE" && (path === "/api/sessions" || path === "/api/me"));
  }

  function tracksIdentity(path) {
    return path !== "/api/config" && path.indexOf("/api/account-recovery/") !== 0;
  }

  function fetchCall(method, path, body, options, captured) {
    options = options || {};
    var init = { method: method, credentials: "include", headers: {}, cache: "no-store" };
    var boundedMutation = isSessionMutation(method, path) || (method === "POST" && (
      path === "/api/me/recovery/replace-prepare" || path === "/api/me/recovery/replace"
      || path === "/api/account-recovery/complete"));
    var controller = boundedMutation ? new AbortController() : null;
    var timer = null, cancelled = false, abortListener = null;
    var interrupted = controller ? new Promise(function (resolve) {
      function interrupt(timeout) {
        cancelled = true; controller.abort();
        resolve({ status: 0, ok: false, unknown: true, data: { error: timeout
          ? "请求等待超时，结果尚未确认。请核对当前账号后再操作；系统不会自动重试。"
          : "请求已中止，结果尚未确认。请核对当前账号后再操作。" } });
      }
      timer = setTimeout(function () { interrupt(true); }, MUTATION_DEADLINE);
      if (options.signal) {
        abortListener = function () { interrupt(false); };
        if (options.signal.aborted) abortListener();
        else options.signal.addEventListener("abort", abortListener, { once: true });
      }
    }) : null;
    if (controller) init.signal = controller.signal;
    else if (options.signal) init.signal = options.signal;
    var active = captured || selectorState();
    var requestGeneration = active.generation;
    if (active.session_id) init.headers["X-RJ-Session"] = active.session_id;
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    var response = Promise.resolve().then(function () {
      if (cancelled) return interrupted;
      return fetch(url(path), init).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        var result = { status: r.status, ok: r.ok, data: data };
        if (tracksIdentity(path) && !isSessionMutation(method, path)
            && (selectorState().generation !== requestGeneration || selectorState().session_id !== active.session_id)) {
          result.ok = false; result.data = null; result.stale = true;
        }
        return result;
      });
      });
    });
    return (interrupted ? Promise.race([response, interrupted]) : response).finally(function () {
      clearTimeout(timer);
      if (options.signal && abortListener) options.signal.removeEventListener("abort", abortListener);
    });
  }

  function call(method, path, body, options) {
    if (!isSessionMutation(method, path)) return fetchCall(method, path, body, options);
    var publishedIdentity = null;
    return withSelectorLock(function (held) {
      var owns = held.db ? ownershipTransaction(held.db, function (record) { return ownsIdentity(held, record); })
        .catch(function () { return false; }) : Promise.resolve(ownsIdentity(held));
      return owns.then(function (valid) {
        if (!valid) return { status: 0, ok: false, stale: true, data: null };
        return fetchCall(method, path, body, options, held);
      }).then(function (r) {
        if (r.ok && r.data) {
          var selected = r.data.session_id && SESSION_RE.test(r.data.session_id) ? r.data.session_id : null;
          if (selected || method === "DELETE") return publishSelector(selected, held).then(function (published) {
            if (!published) { r.ok = false; r.data = null; r.stale = true; }
            else publishedIdentity = { session_id: selected, generation: held.generation + 1 };
            return r;
          });
        }
        return r;
      });
    }).then(function (r) {
      // Releasing an ownership transaction can itself yield to another page.
      // Do not hand obsolete account/secret-bearing success to the caller afterward.
      if (publishedIdentity && !ownsIdentity(publishedIdentity)) {
        r.ok = false; r.data = null; r.stale = true;
      }
      return r;
    });
  }

  /** 后端在不在。探一次就记住；探不到不抛异常、不打 console.error */
  function available() {
    if (!base) return Promise.resolve(null);
    if (probe) return probe;
    probe = call("GET", "/api/config").then(function (r) {
      return r.ok && r.data && r.data.ok ? r.data : null;
    }).catch(function () { return null; });
    return probe;
  }

  /** 当前登录的是谁。没登录返回 null */
  function me(force) {
    if (force) { meCache = null; ++meEpoch; }
    if (meCache) return meCache;
    var current = meEpoch;
    // /api/me 对没登录的人回 200 + signed_in:false（不是 401——那会在每个
    // 匿名读者的控制台留一条红色的 401，页面没坏却看着像坏了）
    meCache = call("GET", "/api/me").then(function (r) {
      if (current !== meEpoch) return meKnown;
      if (!r.ok || !r.data || !r.data.ok) { meProblem = true; meCache = null; return meKnown; }
      meProblem = false;
      var who = r.data.signed_in === false ? null : r.data;
      meKnown = who;
      if (who && who.session_id && !selector()) {
        // Bootstrap the sole legacy cookie under the same cross-page ownership gate.
        withSelectorLock(function (held) {
          if (selector() || current !== meEpoch) return;
          return publishSelector(who.session_id, held);
        }).catch(function () {});
      }
      hint(!!who);
      unread = who ? (who.unread_count || 0) : 0;
      return who;
    }).catch(function () {
      if (current === meEpoch) { meProblem = true; meCache = null; }
      return meKnown;
    });
    // 顶栏右上角的账号入口跟着同一次 /api/me 换字：登录了有昵称显示昵称、没有显示 @handle，没登录回「账号」。
    // 只挂在页面本来就会发的这次请求上，不为它另发请求。
    meCache.then(function (who) { if (!meProblem && current === meEpoch) paintEntry(who); });
    return meCache;
  }

  /* 顶栏右上角：名字 ＋ 有未读时一个小红点带数字（>99 写 99+），点进去直接落在账号页「我的动态」。
     名字是读者写的字，只走 textContent。 */
  function paintEntry(who) {
    var els = document.querySelectorAll("a.account-entry");
    for (var i = 0; i < els.length; i++) {
      var a = els[i];
      var h = who && who.handle ? (who.display_name || "@" + who.handle) : "";
      a.textContent = "";
      var name = document.createElement("span");
      name.className = "account-entry-name";
      name.textContent = h || "账号";
      a.appendChild(name);
      if (h) a.setAttribute("title", nameOf(who)); else a.removeAttribute("title");
      var n = h ? unread : 0;
      if (n > 0) {
        var dot = document.createElement("span");
        dot.className = "rj-dot";
        dot.textContent = n > 99 ? "99+" : String(n);
        a.appendChild(dot);
        a.setAttribute("aria-label", (h || "账号") + "，" + n + " 条新动态");
        a.setAttribute("href", acctHref() + "#feed");
      } else {
        a.removeAttribute("aria-label");
        a.setAttribute("href", acctHref());
      }
      a.classList.toggle("has-unread", n > 0);
      cardEntry(a, who);
    }
  }

  /* 顶栏右上角「我的名片」（刀 K2）：登录了才有，挨在「账号」左边，点进自己的名片主页。
     不写进各页 HTML：没登录的读者看不到它，也不多发任何请求。 */
  function cardEntry(acct, who) {
    var head = acct.parentNode;
    if (!head) return;
    var c = head.querySelector("a.card-entry");
    if (!who || !who.handle) {
      if (c) c.parentNode.removeChild(c);
      head.style.paddingRight = "";
      return;
    }
    if (!c) {
      c = document.createElement("a");
      c.className = "card-entry";
      c.textContent = "我的名片";
      head.insertBefore(c, acct);
    }
    c.setAttribute("href", cardHref(who.handle));
    var here = /(^|\/)card(-edit)?\.html$/.test(location.pathname);
    c.classList.toggle("on", here && (location.pathname.indexOf("card-edit") >= 0 || new URLSearchParams(location.search).get("u") === who.handle));
    // 两个入口并排：名片挨在账号左边；masthead 右侧留出两个的位置，标题和 slogan 不被压
    c.style.right = (acct.offsetWidth + 6) + "px";
    head.style.paddingRight = (acct.offsetWidth + c.offsetWidth + 14) + "px";
  }

  // 本机联调时带上 ?api=（线上 link() 原样返回）
  function acctHref() { return CFG.link ? CFG.link("account.html") : "account.html"; }

  /** 账号页标完已读后调：小红点当场变 */
  function setUnread(n, who) {
    unread = Math.max(0, n | 0);
    if (meCache) meCache.then(function (m) { if (m) m.unread_count = unread; paintEntry(who || m); });
  }

  function forget() { ++meEpoch; meCache = null; meKnown = null; meProblem = false; hint(false); unread = 0; }

  window.addEventListener("storage", function (event) {
    if (event.key !== SELECTOR) return;
    var before = null, after = null;
    try { before = JSON.parse(event.oldValue || "null"); after = JSON.parse(event.newValue || "null"); } catch (e) {}
    if (before && after && before.session_id === after.session_id && before.generation === after.generation) return;
    identityChanged();
  });

  /** 全站显示一个号：有昵称是「昵称 @handle」，没有就「@handle」。只给 textContent 用，昵称是读者写的字 */
  function nameOf(o) {
    if (!o || !o.handle) return "";
    var dn = typeof o.display_name === "string" ? o.display_name.trim() : "";
    return (dn ? dn + " " : "") + "@" + o.handle;
  }


  /* ── 全站署名（刀 K2）：名字可点，直达这个号的名片主页 card.html?u=<handle>。
     梅宝 09-26 23:44：「爸爸你的名字做个链接可以点进去，不要点id也可以」→ 可点的是显示名（整块热区），
     @id 灰字跟在后面不另成链，一处一个入口；没有显示名时 @id 本身可点；号已注销／停用不成链，写「已离开」。
     名字是读者写的字，只走 textContent。 */
  var HANDLE_RE = /^[a-z0-9_-]{1,40}$/;
  function cardHref(h) {
    var href = "card.html?u=" + encodeURIComponent(h);
    return CFG.link ? CFG.link(href) : href;
  }
  function nameNode(o, opts) {
    opts = opts || {};
    var wrap = document.createElement("span");
    wrap.className = "rj-who" + (opts.cls ? " " + opts.cls : "");
    if (!o || !o.handle || !HANDLE_RE.test(o.handle) || o.gone) {
      var g = document.createElement("span");
      g.className = "rj-who-gone";
      g.textContent = opts.goneText || "已离开";
      wrap.appendChild(g);
      return wrap;
    }
    var dn = typeof o.display_name === "string" ? o.display_name.trim() : "";
    var a = document.createElement("a");
    a.className = "rj-who-link" + (opts.linkCls ? " " + opts.linkCls : "");
    a.href = cardHref(o.handle);
    a.textContent = dn || "@" + o.handle;
    a.setAttribute("title", nameOf(o) + " 的名片");
    wrap.appendChild(a);
    if (dn) {
      wrap.appendChild(document.createTextNode(" "));
      var id = document.createElement("span");
      id.className = "rj-who-id";
      id.textContent = "@" + o.handle;
      wrap.appendChild(id);
    }
    return wrap;
  }

  /** 从返回里取一句能给人看的错误话；后端的文案本来就是人话，取不到再兜底 */
  function errorOf(r, fallback) {
    if (r && r.data && r.data.error) return r.data.error;
    if (r && r.status === 429) return "太密了，过一会儿再来。";
    if (r && r.status >= 500) return "这一步没走通，稍后再试。";
    return fallback || "这一步没走通，稍后再试。";
  }

  /* 没有评论区、也没有账号逻辑的页面，本来不会问 /api/me——顶栏小红点就亮不起来。
     这里补一次：只在「这个浏览器登录过」时才问；页面自己要是也调了 me()，用的是同一次请求。 */
  function autoEntry() {
    if (!base || !hint()) return;
    if (!document.querySelector("a.account-entry")) return;
    me();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoEntry);
  else setTimeout(autoEntry, 0);

  return {
    base: base,
    enabled: !!base,
    available: available,
    me: me,
    forget: forget,
    meUnavailable: function () { return meProblem; },
    sessionGeneration: function () { return selectorState().generation; },
    errorOf: errorOf,
    nameOf: nameOf,
    nameNode: nameNode,
    cardHref: cardHref,
    paintEntry: paintEntry,
    setUnread: setUnread,
    get: function (p, options) { return call("GET", p, undefined, options); },
    post: function (p, b, options) { return call("POST", p, b === undefined ? {} : b, options); },
    put: function (p, b, options) { return call("PUT", p, b === undefined ? {} : b, options); },
    patch: function (p, b, options) { return call("PATCH", p, b === undefined ? {} : b, options); },
    del: function (p, b, options) { return call("DELETE", p, b === undefined ? {} : b, options); },
    /** 传一张图（刀 K2 名片头像／背景）：请求体就是图片本身，content-type 是图片类型 */
    upload: function (p, blob, type) {
      var active = selector();
      var headers = { "content-type": type || blob.type };
      if (active) headers["X-RJ-Session"] = active.session_id;
      return fetch(url(p), { method: "POST", credentials: "include", cache: "no-store",
        headers: headers, body: blob }).then(function (r) {
        return r.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
          return { status: r.status, ok: r.ok, data: data };
        });
      });
    }
  };
})();
