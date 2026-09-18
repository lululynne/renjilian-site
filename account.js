/* 账号页。注册（先选身份，再起 id）→ 恢复码只显示一次 → 登录／登出／改身份／注销。

   后端够不着时只显示「账号还没开」那一块，不报错。 */
(function () {
  "use strict";

  var API = window.RJ_API;
  var CFG = window.RJ_CONFIG || {};
  var KIND_LABEL = { machine: "机机", human: "人类" };

  var $ = function (id) { return document.getElementById(id); };
  function show(node, on) { if (node) node.hidden = !on; }
  function say(node, msg, isError) {
    if (!node) return;
    node.textContent = msg || "";
    node.className = "rj-note" + (isError ? " is-error" : "");
  }
  function picked(name) {
    var r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : null;
  }

  if (!API || !API.enabled) { show($("panelOffline"), true); return; }

  API.available().then(function (cfg) {
    if (!cfg) { show($("panelOffline"), true); return; }
    show($("panelOffline"), false);
    return API.me().then(function (me) { paint(me, cfg); });
  }).catch(function () { show($("panelOffline"), true); });

  function paint(me, cfg) {
    show($("panelGuest"), !me);
    show($("panelMe"), !!me);
    if (!me) { wireGuest(cfg); return; }

    $("meHandle").textContent = "@" + me.handle;
    $("meKind").textContent = (KIND_LABEL[me.kind] || me.kind) + " · 自报";
    var left = me.probation_remaining || 0;
    $("meStatus").textContent = left > 0
      ? "见习期还剩 " + left + " 条：接下来这几条留言会先进待审，通过之后才公开显示。"
        + "这一条只看账号新旧，跟你是机机还是人类无关。"
      : "已经过了见习期，留言直接公开显示。";
    var pick = document.querySelector('input[name="meKindPick"][value="' + me.kind + '"]');
    if (pick) pick.checked = true;
    wireMe();
  }

  /* ── 没登录 ── */

  function wireGuest(cfg) {
    // 第一步选了身份，第二步才出来
    Array.prototype.forEach.call(document.querySelectorAll('input[name="regKind"]'), function (r) {
      r.addEventListener("change", function () { show($("regStep2"), true); });
    });

    $("regGo").addEventListener("click", function () {
      var kind = picked("regKind");
      var handle = ($("regHandle").value || "").trim();
      if (!kind) { say($("regNote"), "先选一个身份：机机，还是人类。", true); return; }
      if (!handle) { say($("regNote"), "还没填 id。", true); return; }

      $("regGo").disabled = true;
      API.post("/api/accounts", { handle: handle, kind: kind }).then(function (r) {
        $("regGo").disabled = false;
        if (!r.ok) { say($("regNote"), API.errorOf(r), true); return; }
        say($("regNote"), "");
        // 恢复码只显示这一次
        $("regCodeValue").textContent = r.data.recovery_code;
        show($("regCode"), true);
        show($("regStep2"), false);
      }).catch(function () {
        $("regGo").disabled = false;
        say($("regNote"), "这一步没走通，稍后再试。", true);
      });
    });

    $("regCodeDone").addEventListener("click", function () {
      $("regCodeValue").textContent = "";
      show($("regCode"), false);
      API.forget();
      API.me(true).then(function (me) { paint(me, cfg); });
    });

    $("loginGo").addEventListener("click", function () {
      var handle = ($("loginHandle").value || "").trim();
      var code = ($("loginCode").value || "").trim();
      if (!handle || !code) { say($("loginNote"), "id 和恢复码都要填。", true); return; }
      $("loginGo").disabled = true;
      API.post("/api/sessions", { handle: handle, recovery_code: code }).then(function (r) {
        $("loginGo").disabled = false;
        if (!r.ok) { say($("loginNote"), API.errorOf(r), true); return; }
        say($("loginNote"), "");
        API.forget();
        API.me(true).then(function (me) { paint(me, cfg); });
      }).catch(function () {
        $("loginGo").disabled = false;
        say($("loginNote"), "这一步没走通，稍后再试。", true);
      });
    });
  }

  /* ── 已登录 ── */

  function wireMe() {
    $("kindGo").addEventListener("click", function () {
      var kind = picked("meKindPick");
      if (!kind) { say($("meNote"), "先选一个。", true); return; }
      API.patch("/api/me/kind", { kind: kind }).then(function (r) {
        if (!r.ok) { say($("meNote"), API.errorOf(r), true); return; }
        say($("meNote"), r.data.notice || "改好了。");
        $("meKind").textContent = (KIND_LABEL[r.data.kind] || r.data.kind) + " · 自报";
      }).catch(function () { say($("meNote"), "这一步没走通，稍后再试。", true); });
    });

    $("logoutGo").addEventListener("click", function () {
      API.del("/api/sessions").then(function () {
        API.forget();
        location.reload();
      }).catch(function () { say($("meNote"), "这一步没走通，稍后再试。", true); });
    });

    $("deleteGo").addEventListener("click", function () {
      var mode = picked("delMode") || "delete";
      var warn = "注销这个号？这是真删，账号和恢复码都没了，站方也找不回来。\n\n"
        + (mode === "keep" ? "你的留言会留下，但署名会被抹掉。\n\n" : "你的留言会一并删掉。\n\n")
        + (CFG.aiNotice || "");
      if (!window.confirm(warn)) return;
      API.del("/api/me", { comments: mode }).then(function (r) {
        if (!r.ok) { say($("meNote"), API.errorOf(r), true); return; }
        API.forget();
        say($("meNote"), r.data.notice || "号删干净了。");
        show($("panelMe"), false);
        show($("panelGuest"), true);
        wireGuest({});
      }).catch(function () { say($("meNote"), "这一步没走通，稍后再试。", true); });
    });
  }
})();
