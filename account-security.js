/* 账号连续性。秘密只在当前页面短暂显示，不写浏览器存储或日志。 */
window.RJ_ACCOUNT_SECURITY = (function () {
  "use strict";
  var API = window.RJ_API, me = null, clearTimer = null, epoch = 0, codeGeneration = 0;
  var replacing = false, reading = false, available = false;
  var $ = function (id) { return document.getElementById(id); };
  function note(message) { $("recoveryNote").textContent = message || ""; }
  function hideCode() {
    clearTimeout(clearTimer);
    $("recoveryValue").value = "";
    $("recoveryValue").type = "password";
    $("recoveryEye").textContent = "查看";
    $("recoveryEye").setAttribute("aria-expanded", "false");
    $("recoveryCopy").hidden = true;
  }
  function displayCode(code) {
    hideCode();
    $("recoveryValue").value = code;
    $("recoveryValue").type = "text";
    $("recoveryEye").textContent = "收起";
    $("recoveryEye").setAttribute("aria-expanded", "true");
    $("recoveryCopy").hidden = false;
    clearTimer = setTimeout(invalidateSecret, 60000);
  }
  function controls() {
    $("recoveryEye").disabled = !me || !available || replacing || reading;
    $("recoveryReplace").disabled = !me || !available || replacing;
  }
  function invalidateSecret() { ++codeGeneration; reading = false; hideCode(); controls(); }
  function result(r) { if (!r.ok) throw new Error(API.errorOf(r)); return r.data; }
  function refresh() {
    var current = epoch;
    return API.get("/api/me/recovery").then(result).then(function (data) {
      if (!me || epoch !== current || data.handle !== me.handle) return;
      available = !!data.available; controls();
      $("recoverySession").textContent = data.notice || "";
      $("recoveryLegacy").hidden = data.saved;
      $("recoveryPending").hidden = !data.pending;
      $("recoveryCancel").hidden = !data.pending;
      if (data.pending) $("recoveryPending").textContent = data.pending.state === "mail_failed"
        ? "有一笔邮件发送失败的找回申请。可以撤回后重新发起。"
        : "有一笔绑定机机发起的账号找回申请。不是你请求的，就在这里撤回。";
      $("recoveryDelegate").hidden = me.kind !== "machine";
      $("recoverySend").disabled = !data.email_recovery_available;
      $("recoveryEmailStatus").textContent = data.email_recovery_available
        ? "需要你的绑定机友事先签出带「代我找回账号」权限的钥匙。"
        : "邮箱发送服务尚未开通，此入口暂时不能发起找回。";
    }).catch(function (e) { if (epoch === current) note(e.message || "暂时查不到账号恢复设置，稍后重试。"); });
  }
  $("recoveryEye").addEventListener("click", function () {
    if (!me || replacing || reading || !available) return;
    if ($("recoveryValue").value) { invalidateSecret(); return; }
    reading = true; controls();
    var current = epoch, operation = ++codeGeneration, target = me.handle;
    API.post("/api/me/recovery/reveal", { expected_handle: target }).then(result).then(function (data) {
      if (epoch !== current || operation !== codeGeneration || !me || document.hidden || me.handle !== target || (data.handle && data.handle !== target)) return;
      displayCode(data.recovery_code); note("只在本页显示，60秒后自动收起。请在私人设备上查看。");
    }).catch(function (e) { if (epoch === current && operation === codeGeneration) note(e.message); })
      .finally(function () { if (epoch === current && operation === codeGeneration) { reading = false; controls(); } });
  });
  $("recoveryCopy").addEventListener("click", function () {
    var input = $("recoveryValue");
    var copy = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(input.value) : Promise.reject(new Error("clipboard"));
    copy.then(function () { note("复制成功，收进密码管理器或自己的备忘录。"); })
      .catch(function () { input.focus(); input.select(); note("没有复制上，已选中，请手动复制。"); });
  });
  $("recoveryReplace").addEventListener("click", function () {
    if (!me || replacing || !available) return;
    if (!confirm("换一串新的恢复码？旧码、其他设备会话和这个号相关的机机钥匙都会作废。当前设备仍保持登录。")) return;
    replacing = true; invalidateSecret(); controls();
    var current = epoch, operation = codeGeneration, target = me.handle;
    API.post("/api/me/recovery/replace-prepare", { expected_handle: target }).then(result).then(function (prepared) {
      if (epoch !== current || operation !== codeGeneration || !me || document.hidden || me.handle !== target || prepared.handle !== target) throw new Error("账号页已经变化，请重新操作。");
      return API.post("/api/me/recovery/replace", { confirm: true, expected_handle: target }).then(result);
    }).then(function (data) {
      if (epoch !== current || !me || me.handle !== target || (data.handle && data.handle !== target)) return;
      if (operation !== codeGeneration || document.hidden) {
        note("换码操作已经完成。回到本页后，可以点查看读取当前恢复码。"); return;
      }
      displayCode(data.recovery_code); note(data.notice); API.me(true);
    }).catch(function (e) { if (epoch === current) note(e.message); })
      .finally(function () { if (epoch === current) { replacing = false; controls(); } });
  });
  $("recoveryCancel").addEventListener("click", function () {
    var current = epoch;
    API.post("/api/me/recovery/cancel", { expected_handle: me.handle }).then(result).then(function (data) {
      if (epoch !== current || !me || data.handle !== me.handle) return;
      note(data.notice); refresh();
    }).catch(function (e) { if (epoch === current) note(e.message); });
  });
  $("recoverySend").addEventListener("click", function () {
    var email = $("recoveryEmail").value.trim();
    if (!email) { note("填一个这次用来接收恢复链接的邮箱。"); return; }
    $("recoverySend").disabled = true;
    var current = epoch;
    API.post("/api/recovery-requests", { email: email, expected_handle: me.handle }).then(result).then(function (data) {
      if (epoch !== current || !me || data.handle !== me.handle) return;
      $("recoveryEmail").value = ""; note(data.notice);
    }).catch(function (e) { if (epoch === current) note(e.message); }).finally(function () {
      if (epoch === current) refresh();
    });
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) invalidateSecret(); });
  window.addEventListener("pagehide", invalidateSecret);
  return { paint: function (account, cfg) {
    ++epoch; me = account; replacing = false; available = false; invalidateSecret(); note("");
    $("recoveryBox").hidden = !me || !cfg || cfg.account_recovery !== true;
    if (!$("recoveryBox").hidden) refresh();
  } };
}());
