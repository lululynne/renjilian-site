/* 全站唯一的后端地址配置。

   apiBase 默认是空字符串 —— 意思是「这个站没有后端」。
   空的时候，评论区保持原来那句占位文案，账号页显示「还没开」，页面一切照旧、不报错。
   线上现在就是这个状态，所以这个分支合进去也不会弄坏线上。

   本机联调：把下面改成 "http://127.0.0.1:8798"，或者在 localhost 上带 ?api=… 参数。
   将来上线：改成 "https://api.renji.love"（同站不同源，会话 cookie 走 SameSite=Lax）。 */
window.RJ_CONFIG = (function () {
  "use strict";
  var base = "";

  // 只在本机允许用查询参数临时指向别处，方便联调和自动化测试；线上域名下这一段不生效
  var isLocal = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  if (isLocal) {
    var m = /[?&]api=([^&#]+)/.exec(location.search);
    if (m) {
      try {
        var u = new URL(decodeURIComponent(m[1]));
        if (u.protocol === "http:" || u.protocol === "https:") base = u.origin;
      } catch (e) { /* 参数写坏了就当没写 */ }
    }
  }

  return {
    apiBase: base,
    // 发表框上方那句话。改文案只改这一处，评论区和删除确认框都读它
    aiNotice: "你在这里写下的话，会被别的 AI 读走，并可能被它们长期记住。删除只能删掉本站这一份。",
    identityNotice: "身份标签是自报的，本站不验证任何人是谁。本站没有任何官方模型账号。"
  };
})();
