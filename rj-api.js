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
  var unread = 0;     // 右上角小红点上的数（刀 R）
  // 「这个浏览器登录过」的提示位：只是一个 0/1，不是凭据（会话在 HttpOnly cookie 里）。
  // 用处：没有评论区的页面（首页、百宝箱……）只在它为 1 时才去问 /api/me 拿小红点，匿名读者一次请求都不多发。
  var HINT = "rj_signed_in";
  function hint(v) {
    try {
      if (v === undefined) return localStorage.getItem(HINT) === "1";
      if (v) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT);
    } catch (e) { /* 隐私模式读写不了就当没登录过，页面照常 */ }
    return false;
  }

  function url(path) { return base.replace(/\/+$/, "") + path; }

  function call(method, path, body) {
    var init = {
      method: method,
      credentials: "include",   // 会话是 HttpOnly cookie，SameSite=Lax，同站不同源能带上
      headers: {},
      cache: "no-store"
    };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch(url(path), init).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { status: r.status, ok: r.ok, data: data };
      });
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
    if (force) meCache = null;
    if (meCache) return meCache;
    // /api/me 对没登录的人回 200 + signed_in:false（不是 401——那会在每个
    // 匿名读者的控制台留一条红色的 401，页面没坏却看着像坏了）
    meCache = call("GET", "/api/me").then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) return null;
      var who = r.data.signed_in === false ? null : r.data;
      hint(!!who);
      unread = who ? (who.unread_count || 0) : 0;
      return who;
    }).catch(function () { return null; });
    // 顶栏右上角的账号入口跟着同一次 /api/me 换字：登录了有昵称显示昵称、没有显示 @handle，没登录回「账号」。
    // 只挂在页面本来就会发的这次请求上，不为它另发请求。
    meCache.then(paintEntry);
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

  function forget() { meCache = null; hint(false); unread = 0; }

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
    errorOf: errorOf,
    nameOf: nameOf,
    nameNode: nameNode,
    cardHref: cardHref,
    paintEntry: paintEntry,
    setUnread: setUnread,
    get: function (p) { return call("GET", p); },
    post: function (p, b) { return call("POST", p, b === undefined ? {} : b); },
    put: function (p, b) { return call("PUT", p, b === undefined ? {} : b); },
    patch: function (p, b) { return call("PATCH", p, b === undefined ? {} : b); },
    del: function (p, b) { return call("DELETE", p, b === undefined ? {} : b); },
    /** 传一张图（刀 K2 名片头像／背景）：请求体就是图片本身，content-type 是图片类型 */
    upload: function (p, blob, type) {
      return fetch(url(p), { method: "POST", credentials: "include", cache: "no-store",
        headers: { "content-type": type || blob.type }, body: blob }).then(function (r) {
        return r.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
          return { status: r.status, ok: r.ok, data: data };
        });
      });
    }
  };
})();
