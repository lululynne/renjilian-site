(function () {
  "use strict";
  var API = window.RJ_API;
  var token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  history.replaceState(null, "", location.pathname + location.search);
  var notice = document.getElementById("recoverNotice");
  var go = document.getElementById("recoverComplete");
  var value = document.getElementById("recoverCode");
  var generation = 0, completed = false, busy = false;
  function reread() {
    go.hidden = !token; go.textContent = "读取这次的新恢复码";
    notice.textContent = "这次操作已完成。回到本页后，可以重读同一串新恢复码。";
  }
  function clearSecret() {
    ++generation; value.value = "";
    document.getElementById("recoverResult").hidden = true;
    window.onbeforeunload = null;
    if (completed && token) reread();
  }
  function status(r) { if (!r.ok) throw new Error(API.errorOf(r)); return r.data; }
  API.post("/api/account-recovery/check", { token: token }).then(status).then(function (data) {
    go.hidden = !data.ready;
    go.textContent = data.completed ? "读取这次的新恢复码" : "生成新的恢复码";
    notice.textContent = data.completed ? "这次链接已重设过，可以重读同一串新码。"
      : data.ready ? "链接有效，可以生成新恢复码。"
      : "还在可撤回期，请在 " + data.ready_at + " 之后重新打开邮件中的链接。";
  }).catch(function (e) { notice.textContent = e.message || "暂时核验不了，稍后再试。"; });
  go.addEventListener("click", function () {
    if (busy || !token) return;
    busy = true; go.disabled = true;
    var current = generation;
    API.post("/api/account-recovery/complete", { token: token }).then(status).then(function (data) {
      completed = true;
      if (!token) return;
      if (document.hidden || current !== generation) { reread(); return; }
      value.value = data.recovery_code;
      document.getElementById("recoverResult").hidden = false;
      go.hidden = true; notice.textContent = data.notice;
      window.onbeforeunload = function (e) { e.preventDefault(); e.returnValue = ""; };
    }).catch(function (e) { if (token) notice.textContent = e.message; })
      .finally(function () { busy = false; go.disabled = !token; });
  });
  document.getElementById("recoverCopy").addEventListener("click", function () {
    var copy = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(value.value) : Promise.reject(new Error("clipboard"));
    copy.then(function () { notice.textContent = "复制成功，先保存好新码。"; window.onbeforeunload = null; })
      .catch(function () { value.focus(); value.select(); notice.textContent = "没有复制上，已选中，请手动保存。"; });
  });
  document.getElementById("recoverAck").addEventListener("click", function () {
    if (!confirm("确认已经保存新恢复码？关闭后这次邮件链接不再显示它。")) return;
    API.post("/api/account-recovery/ack", { token: token }).then(status).then(function (data) {
      token = ""; clearSecret();
      document.getElementById("recoverResult").hidden = true; notice.textContent = data.notice;
    }).catch(function (e) { notice.textContent = e.message; });
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearSecret(); });
  window.addEventListener("pagehide", function () { token = ""; clearSecret(); go.disabled = true; });
}());
