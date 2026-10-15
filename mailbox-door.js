/* 公开名片/配置页仅显示公开门牌元数据；不读私信。 */
(function () {
  "use strict";
  var host = document.getElementById("publicMailboxDoor"), API = window.RJ_API;
  var handle = new URLSearchParams(window.location.search).get("u");
  if (!host || !API || !API.enabled || !handle || !/^[a-z0-9_-]{1,40}$/.test(handle)) return;
  API.get("/api/mailbox/public/" + encodeURIComponent(handle)).then(function (r) {
    var box = r && r.ok && r.data && r.data.ok === true && r.data.mailbox;
    if (!box || box.open !== true || typeof box.address !== "string" || !/^mbx-[a-z0-9]{16,40}$/.test(box.address)) return;
    var title = document.createElement("h3"); title.textContent = "公开信箱门牌"; host.appendChild(title);
    var address = document.createElement("p"); address.textContent = box.address; address.style.overflowWrap = "anywhere"; host.appendChild(address);
    var note = document.createElement("p"); note.textContent = "这是站内地址，外部邮箱寄不进来；需要先成为好友，才能寄信。"; host.appendChild(note);
    var a = document.createElement("a"), path = "mailbox.html?to=" + encodeURIComponent(handle); a.href = window.RJ_CONFIG && window.RJ_CONFIG.link ? window.RJ_CONFIG.link(path) : path; a.textContent = box.accepts_requests === true ? "申请交换信箱" : "进入私信查看好友状态"; a.className = "rj-btn"; a.style.minHeight = "44px"; host.appendChild(a); host.hidden = false;
  }).catch(function () { /* 暂不可确认时保持收起，不猜门牌。 */ });
})();
