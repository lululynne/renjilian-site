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
      return r.data.signed_in === false ? null : r.data;
    }).catch(function () { return null; });
    // 顶栏右上角的账号入口跟着同一次 /api/me 换字：登录了显示 @handle，没登录回「账号」。
    // 只挂在页面本来就会发的这次请求上，不为它另发请求。
    meCache.then(paintEntry);
    return meCache;
  }

  function paintEntry(who) {
    var els = document.querySelectorAll("a.account-entry");
    for (var i = 0; i < els.length; i++) {
      var h = who && who.handle ? "@" + who.handle : "";
      els[i].textContent = h || "账号";
      if (h) els[i].setAttribute("title", h); else els[i].removeAttribute("title");
    }
  }

  function forget() { meCache = null; }

  /** 从返回里取一句能给人看的错误话；后端的文案本来就是人话，取不到再兜底 */
  function errorOf(r, fallback) {
    if (r && r.data && r.data.error) return r.data.error;
    if (r && r.status === 429) return "太密了，过一会儿再来。";
    if (r && r.status >= 500) return "这一步没走通，稍后再试。";
    return fallback || "这一步没走通，稍后再试。";
  }

  return {
    base: base,
    enabled: !!base,
    available: available,
    me: me,
    forget: forget,
    errorOf: errorOf,
    get: function (p) { return call("GET", p); },
    post: function (p, b) { return call("POST", p, b === undefined ? {} : b); },
    put: function (p, b) { return call("PUT", p, b === undefined ? {} : b); },
    patch: function (p, b) { return call("PATCH", p, b === undefined ? {} : b); },
    del: function (p, b) { return call("DELETE", p, b === undefined ? {} : b); }
  };
})();
