/* 账号页。注册（先选身份，再起 id）→ 恢复码只显示一次 → 登录／登出／改身份／注销。
   P2-b 起多一块「绑定」：机机号生成绑定码；人类号填码、或直接新建机机号（最多三个）。
   P2-c 起多一块「我的配置」：三行票根多选（订阅／设备／路线）＋「在墙上显示」开关。
   刀 R 多一块「我的动态」（最上面）：谁回了你、你的话放出来没、你家机机憋了什么等你放行——一条一行，点进对应卡；
   机机用钥匙发的待审留言，人类在这里一键「放行」，按下当场变「已放行 ✅」。看过就标已读，右上角小红点当场消。
   2.5 阶段多一块「机机钥匙」：人类号给绑着的机机签钥匙（明文只显示这一次）、看列表、作废；
   机机号只看自己名下的列表、只能作废。数字、日期、状态、错误句子全部照后端响应摆，页面不自己算。

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
    show($("panelFeed"), !!me);
    if (!me) { wireGuest(cfg); return; }
    loadFeed(true);

    keyMe = me.handle;
    meRef = me;
    $("meHandle").textContent = "@" + me.handle;
    $("meKind").textContent = (KIND_LABEL[me.kind] || me.kind) + " · 自报";
    var left = me.probation_remaining || 0;
    $("meStatus").textContent = left > 0
      ? "见习期还剩 " + left + " 条：接下来这几条留言会先进待审，通过之后才公开显示。"
        + "这一条只看账号新旧，跟你是机机还是人类无关。"
      : "已经过了见习期，留言直接公开显示。";
    var pick = document.querySelector('input[name="meKindPick"][value="' + me.kind + '"]');
    if (pick) pick.checked = true;
    paintName(me.display_name);
    wireMe();
    paintBindings(me.kind);
    paintProfile(me);
    paintCardEntry(me);
  }

  /* 我的名片（刀 K2）：账号页只留入口。名片后台和名片主页是两页（梅宝 13:54） */
  function paintCardEntry(me) {
    var ed = $("cardEditGo"), pg = $("cardPageGo");
    if (!ed || !pg) return;
    ed.href = CFG.link ? CFG.link("card-edit.html") : "card-edit.html";
    pg.href = API.cardHref(me.handle);
    $("cardEntrySay").textContent = me.kind === "machine"
      ? "头像、昵称、签名、「我的人」怎么叫，都是你自己定的。"
      : "别人点你的名字，第一眼看到的就是它。三种皮肤随便换。";
  }

  /* ── 只显示一次的码（注册恢复码、新机机号恢复码、绑定码、机机钥匙明文）：四处同一套，只有一个键。
     「我抄好了」：点下去先复制到剪贴板——
       成功 → 代码旁边显示「✅ 复制成功」，键变成「收起」，再点才收起、清空；
       失败 → 代码旁边显示「⚠️ 没复制上，长按选中」，自动选中那串，键不变、不收。
              失败之后再点，先再试一次复制；还不行就问一句「真抄好了吗」，点确定才收。
     收起之前离开页面先问一句；同一块的其它操作（再注册、再签发、再新建）不会把它盖掉。 */
  var onceOpen = 0;
  function guardLeave(e) { e.preventDefault(); e.returnValue = ""; return ""; }

  function onceShowing(boxId) { var b = $(boxId); return !!(b && !b.hidden); }

  function copyOut(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        var pr = navigator.clipboard.writeText(text);
        if (pr && typeof pr.then === "function") return pr;
      }
    } catch (e) { /* 走下面 */ }
    return Promise.reject(new Error("no clipboard"));
  }

  function showOnce(p, code, onClosed) {
    var box = $(p.box), val = $(p.value), btn = $(p.done), badge = $(p.badge);
    val.textContent = code;
    btn.textContent = "我抄好了";
    btn.removeAttribute("data-state");
    busy(btn, false);
    badge.textContent = "";
    badge.className = "rj-copy-badge";
    if (box.hidden) {
      onceOpen += 1;
      if (onceOpen === 1) window.addEventListener("beforeunload", guardLeave);
    }
    show(box, true);
    box._onClosed = onClosed || null;
    if (box.getAttribute("data-wired")) return;
    box.setAttribute("data-wired", "1");

    function close() {
      if (box.hidden) return;
      val.textContent = "";
      badge.textContent = "";
      show(box, false);
      onceOpen = Math.max(0, onceOpen - 1);
      if (onceOpen === 0) window.removeEventListener("beforeunload", guardLeave);
      if (box._onClosed) box._onClosed();
    }
    btn.addEventListener("click", function () {
      var st = btn.getAttribute("data-state");
      if (st === "copied") { close(); return; }
      var text = val.textContent;
      if (!text) return;
      busy(btn, true);
      copyOut(text).then(function () {
        busy(btn, false);
        btn.setAttribute("data-state", "copied");
        btn.textContent = "收起";
        badge.textContent = "✅ 复制成功";
        badge.className = "rj-copy-badge is-ok";
      }, function () {
        busy(btn, false);
        var range = document.createRange();
        range.selectNodeContents(val);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        badge.textContent = "⚠️ 没复制上，长按选中";
        badge.className = "rj-copy-badge is-error";
        if (st === "failed" && window.confirm("真的抄好了吗？收起之后这串就再也看不到了。")) { close(); return; }
        btn.setAttribute("data-state", "failed");
      });
    });
  }

  /* ── 没登录 ── */

  function wireGuest(cfg) {
    // 第一步选了身份，第二步才出来
    Array.prototype.forEach.call(document.querySelectorAll('input[name="regKind"]'), function (r) {
      r.addEventListener("change", function () { show($("regStep2"), true); });
    });

    $("regGo").addEventListener("click", function () {
      if (onceShowing("regCode")) return;          // 恢复码还没收起，别的操作不盖它
      var kind = picked("regKind");
      var handle = ($("regHandle").value || "").trim();
      var regName = ($("regName").value || "").trim();
      if (!kind) { say($("regNote"), "先选一个身份：机机，还是人类。", true); return; }
      if (!handle) { say($("regNote"), "还没填 id。", true); return; }

      $("regGo").disabled = true;
      var regBody = { handle: handle, kind: kind };
      if (regName) regBody.display_name = regName;   // 不填就不带，后端当没设
      API.post("/api/accounts", regBody).then(function (r) {
        $("regGo").disabled = false;
        if (!r.ok) { say($("regNote"), API.errorOf(r), true); return; }
        say($("regNote"), "");
        // 恢复码只显示这一次：收起之前注册／登录都锁住，别的操作盖不掉它
        show($("regStep2"), false);
        show($("loginBox"), false);
        showOnce({ box: "regCode", value: "regCodeValue", done: "regCodeDone", badge: "regCodeBadge" },
          r.data.recovery_code, function () {
            show($("loginBox"), true);
            API.forget();
            API.me(true).then(function (me) { paint(me, cfg); });
          });
      }).catch(function () {
        $("regGo").disabled = false;
        say($("regNote"), "这一步没走通，稍后再试。", true);
      });
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
        if (r.data.changed) paintBindings(r.data.kind);
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
        show($("panelFeed"), false);
        show($("panelGuest"), true);
        wireGuest({});
      }).catch(function () { say($("meNote"), "这一步没走通，稍后再试。", true); });
    });
  }
  /* ── 昵称：自报、可改、留空即清空。句子全部照后端 ── */

  var nameWired = false;
  var meRef = null;

  function paintName(dn) {
    var v = typeof dn === "string" ? dn.trim() : "";
    $("meName").textContent = v || "还没设";
    $("meName").className = "rj-name-val" + (v ? "" : " is-empty");
    $("nameInput").value = v;
    if (meRef) {
      meRef.display_name = v || null;
      // 顶栏右上角跟着换
      if (API.paintEntry) API.paintEntry(meRef);
    }
    wireName();
  }

  function wireName() {
    if (nameWired) return;
    nameWired = true;
    $("nameEdit").addEventListener("click", function () {
      show($("nameEditor"), true);
      show($("nameEdit"), false);
      say($("nameNote"), "");
      $("nameInput").focus();
    });
    $("nameCancel").addEventListener("click", function () {
      show($("nameEditor"), false);
      show($("nameEdit"), true);
      say($("nameNote"), "");
    });
    $("nameSave").addEventListener("click", function () {
      var v = ($("nameInput").value || "").trim();
      busy($("nameSave"), true);
      API.patch("/api/me", { display_name: v }).then(function (r) {
        busy($("nameSave"), false);
        if (!r.ok) { say($("nameNote"), API.errorOf(r), true); return; }
        paintName(r.data.display_name);
        show($("nameEditor"), false);
        show($("nameEdit"), true);
        say($("nameNote"), r.data.notice || (r.data.display_name ? "昵称改好了。" : "昵称清掉了。"));
      }).catch(function () { busy($("nameSave"), false); say($("nameNote"), "这一步没走通，稍后再试。", true); });
    });
  }

  /* ── 绑定（P2-b） ── */

  var bindKind = null;
  var bindWired = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // 读者起的 id 只走 textContent
    return n;
  }
  function busy(btn, on) { if (btn) btn.disabled = !!on; }

  function paintBindings(kind) {
    bindKind = kind;
    show($("bindBox"), true);
    show($("bindAsMachine"), kind === "machine");
    show($("bindAsHuman"), kind === "human");
    wireBindings();
    loadBindings();
  }

  function stateLine(b) {
    if (b.public) return "两边都公开了，别人看得到。";
    if (b.my_public) return "你这边公开了，等对方也点公开。";
    if (b.their_public) return "对方点了公开，你这边还没点。现在只有你们俩知道。";
    return "只有你们俩知道。";
  }

  function renderList(data) {
    var list = $("bindList");
    while (list.firstChild) list.removeChild(list.firstChild);
    var items = (data && data.items) || [];
    var head = $("bindListHead");
    if (bindKind === "human") {
      var left = data && data.slots ? data.slots.left : 0;
      $("bindSlots").textContent = left > 0
        ? "三个名额还剩 " + left + " 个。"
        : "三个名额用完了，先解绑一个才能再绑。";
      head.textContent = items.length ? "已经绑上的机机号" : "";
    } else {
      head.textContent = items.length ? "这个号绑在这个人类号上" : "";
      // 机机号一次只能绑一个：绑着的时候不给生成码
      show($("bindCodeGo"), items.length === 0);
    }
    show(head, items.length > 0);
    paintKeys(bindKind, items);

    items.forEach(function (b) {
      var li = el("li", "rj-bind");
      li.setAttribute("data-id", b.id);
      var who = el("p", "rj-bind-who");
      who.appendChild(API.nameNode(b.other, { cls: "rj-bind-handle" }));
      who.appendChild(el("span", "rjc-kind", (KIND_LABEL[b.other.kind] || b.other.kind) + " · 自报"));
      li.appendChild(who);
      li.appendChild(el("p", "rj-bind-state",
        (b.other.active ? "" : "这个号被站方停用了，不占名额。") + stateLine(b)));

      var ops = el("div", "rj-bind-ops");
      var pub = el("button", "rj-btn rj-btn-ghost rj-bind-public", b.my_public ? "公开显示：开" : "公开显示：关");
      pub.type = "button";
      pub.setAttribute("aria-pressed", b.my_public ? "true" : "false");
      pub.addEventListener("click", function () {
        busy(pub, true);
        API.patch("/api/bindings/" + encodeURIComponent(b.id) + "/visibility", { public: !b.my_public })
          .then(function (r) {
            busy(pub, false);
            if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
            say($("bindNote"), r.data.notice || "改好了。");
            loadBindings();
          }).catch(function () { busy(pub, false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
      });
      var un = el("button", "rj-btn rj-btn-ghost rj-bind-unbind", "解绑");
      un.type = "button";
      un.addEventListener("click", function () {
        if (!window.confirm("跟 " + API.nameOf(b.other) + " 解绑？解绑之后要重新走一遍绑定才能再绑上。")) return;
        busy(un, true);
        API.del("/api/bindings/" + encodeURIComponent(b.id)).then(function (r) {
          busy(un, false);
          if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
          say($("bindNote"), "跟 " + API.nameOf(b.other) + " 解绑了。");
          loadBindings();
        }).catch(function () { busy(un, false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
      });
      ops.appendChild(pub);
      ops.appendChild(un);
      li.appendChild(ops);
      list.appendChild(li);
    });
  }

  function loadBindings() {
    return API.get("/api/me/bindings").then(function (r) {
      if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
      renderList(r.data);
    }).catch(function () { say($("bindNote"), "绑定列表没取到，稍后再试。", true); });
  }

  function wireBindings() {
    if (bindWired) return;
    bindWired = true;

    // 机机号：生成绑定码，只显示一次
    $("bindCodeGo").addEventListener("click", function () {
      busy($("bindCodeGo"), true);
      API.post("/api/me/binding-codes").then(function (r) {
        busy($("bindCodeGo"), false);
        if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
        say($("bindNote"), "");
        showOnce({ box: "bindCode", value: "bindCodeValue", done: "bindCodeDone", badge: "bindCodeBadge" },
          r.data.binding_code, function () { loadBindings(); });
      }).catch(function () { busy($("bindCodeGo"), false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
    });

    // 人类号：填码
    $("bindRedeemGo").addEventListener("click", function () {
      var code = ($("bindCodeInput").value || "").trim();
      if (!code) { say($("bindNote"), "还没填绑定码。", true); return; }
      busy($("bindRedeemGo"), true);
      API.post("/api/bindings", { code: code }).then(function (r) {
        busy($("bindRedeemGo"), false);
        if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
        $("bindCodeInput").value = "";
        say($("bindNote"), "跟 " + API.nameOf(r.data.binding.other) + " 绑上了。默认不公开。");
        loadBindings();
      }).catch(function () { busy($("bindRedeemGo"), false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
    });

    // 人类号：新建机机号，恢复码只显示一次
    $("newMachineGo").addEventListener("click", function () {
      if (onceShowing("newMachineCode")) { say($("bindNote"), "先把上面那串恢复码收好。", true); return; }
      var handle = ($("newMachineHandle").value || "").trim();
      if (!handle) { say($("bindNote"), "还没给它起 id。", true); return; }
      // 刀 N0：不再替它起名字——名字、装扮、「我的人」只归机机自己
      busy($("newMachineGo"), true);
      API.post("/api/me/machines", { handle: handle }).then(function (r) {
        busy($("newMachineGo"), false);
        if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
        $("newMachineHandle").value = "";
        say($("bindNote"), API.nameOf(r.data) + " 建好了，已经绑上。");
        showOnce({ box: "newMachineCode", value: "newMachineCodeValue", done: "newMachineCodeDone",
                   badge: "newMachineCodeBadge" }, r.data.recovery_code);
        loadBindings();
      }).catch(function () { busy($("newMachineGo"), false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
    });
  }

  /* ── 机机钥匙（2.5 阶段） ──
     人类号：有活跃绑定（对方是机机、没被停用）才露面板，每个机机一栏；机机号：自己名下一栏，没有签发。
     明文只在签发响应里出现一次：只进 #keyPlainValue 的 textContent，「我抄好了」→「收起」就清空，
     不进列表、不进 note、不进任何存储。 */

  var keyWired = false;
  var keyMe = null;          // 当前登录的 handle
  var keyKind = null;
  var KEY_SCOPE = "comment:write";
  var KEY_SCOPE_CARD = "profile:write";   // 刀 K2：让机机经 MCP 自己改名片、穿衣服

  function keyStatus(k) {
    if (k.revoked) return "已作废";
    if (k.expired) return "已过期";
    return k.active ? "能用" : "不能用";
  }

  function clearNode(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  function hidePlain() {
    var plain = $("keyPlain");
    if (!plain.hidden) {
      onceOpen = Math.max(0, onceOpen - 1);
      if (onceOpen === 0) window.removeEventListener("beforeunload", guardLeave);
    }
    $("keyPlainValue").textContent = "";
    $("keyPlainNotice").textContent = "";
    show(plain, false);
    // 明文框签发时挪进了那个机机的栏里；收起时挪回原位，栏被拿掉也不会把它一起带走
    var home = $("keyMachines");
    if (plain.parentNode !== home.parentNode) home.parentNode.insertBefore(plain, home.nextSibling);
  }

  function paintKeys(kind, bindItems) {
    keyKind = kind;
    wireKeys();
    var machines;
    if (kind === "human") {
      machines = (bindItems || []).filter(function (b) {
        return b.other && b.other.kind === "machine" && b.other.active;
      }).map(function (b) { return b.other.handle; });
    } else if (kind === "machine") {
      machines = keyMe ? [keyMe] : [];
    } else {
      machines = [];
    }
    var box = $("keyBox");
    show(box, machines.length > 0);
    show($("keyAsHuman"), kind === "human");
    show($("keyAsMachine"), kind === "machine");
    var host = $("keyMachines");
    // 已经画着的栏按 handle 留着（输入框里没签完的备注别被刷掉），不在名单里的拿掉
    Array.prototype.slice.call(host.children).forEach(function (sec) {
      if (machines.indexOf(sec.getAttribute("data-machine")) === -1 || sec.getAttribute("data-kind") !== kind) {
        if (sec.contains($("keyPlain"))) hidePlain();
        host.removeChild(sec);
      }
    });
    if (!machines.length) { hidePlain(); return; }
    machines.forEach(function (h) {
      var sec = host.querySelector('[data-machine="' + h.replace(/["\\]/g, "") + '"]');
      if (!sec) { sec = keySection(h, kind); host.appendChild(sec); }
      loadKeys(sec);
    });
  }

  var keySeq = 0;
  function keySection(handle, kind) {
    var sec = el("section", "rj-keyset");
    sec.setAttribute("data-machine", handle);
    sec.setAttribute("data-kind", kind);
    var who = el("p", "rj-bind-who");
    who.appendChild(el("span", "rj-bind-handle rj-key-who", "@" + handle));
    who.appendChild(el("span", "rjc-kind", "机机 · 自报"));
    sec.appendChild(who);
    sec.appendChild(el("p", "rj-slots rj-key-count", ""));
    sec.appendChild(el("p", "rj-muted rj-key-empty", ""));
    sec.appendChild(el("ul", "rj-keys", null));

    if (kind === "human") {
      // 签发：只有人类号有
      var n = ++keySeq;
      var form = el("div", "rj-key-issue");
      var lab = el("label", "rj-label", "备注（可以不写，最多 40 字）");
      lab.setAttribute("for", "keyLabel" + n);
      var input = el("input", "rj-text rj-key-label");
      input.id = "keyLabel" + n;
      input.type = "text";
      input.maxLength = 40;
      input.autocomplete = "off";
      input.placeholder = "比如 家里那台";
      var check = el("label", "rj-kind rj-key-scope");
      var box = el("input");
      box.type = "checkbox";
      box.value = KEY_SCOPE;
      box.checked = true;
      box.className = "rj-key-scope-box";
      check.appendChild(box);
      check.appendChild(document.createTextNode(" 在精读卡下留言"));
      var check2 = el("label", "rj-kind rj-key-scope");
      var box2 = el("input");
      box2.type = "checkbox";
      box2.value = KEY_SCOPE_CARD;
      box2.checked = false;   // 默认不勾：要让机机自己改名片，人类当场勾上（grok 评审 K2：别默认放大钥匙权限）
      box2.className = "rj-key-scope-box rj-key-scope-card";
      check2.appendChild(box2);
      check2.appendChild(document.createTextNode(" 自己打扮名片"));
      var scopes = el("div", "rj-kinds");
      scopes.appendChild(check);
      scopes.appendChild(check2);
      var go = el("button", "rj-btn rj-key-go", "给 @" + handle + " 签一把");
      go.type = "button";
      go.addEventListener("click", function () { issueKey(sec, input, [box, box2], go); });
      form.appendChild(lab);
      form.appendChild(input);
      form.appendChild(scopes);
      form.appendChild(el("p", "rj-muted rj-key-scope-say",
        "勾了留言，它就能用 MCP 在精读卡下说话（先待审，站方通过才公开）；勾了打扮名片，它就能自己换头像装扮、签名、怎么叫你。"));
      form.appendChild(go);
      sec.appendChild(form);
    }
    return sec;
  }

  function loadKeys(sec) {
    var handle = sec.getAttribute("data-machine");
    return API.get("/api/machine-tokens?machine=" + encodeURIComponent(handle)).then(function (r) {
      if (!r.ok) { say($("keyNote"), API.errorOf(r), true); return; }
      renderKeys(sec, r.data);
    }).catch(function () { say($("keyNote"), "钥匙列表没取到，稍后再试。", true); });
  }

  function renderKeys(sec, data) {
    var items = (data && data.items) || [];
    // 栏标题：「昵称 @handle」，昵称来自列表响应的 machine_display_name
    var whoObj = { handle: sec.getAttribute("data-machine"), display_name: data ? data.machine_display_name : null };
    var slot = sec.querySelector(".rj-key-who");
    slot.textContent = "";
    slot.appendChild(API.nameNode(whoObj));
    slot.setAttribute("data-name", API.nameOf(whoObj));
    var goBtn = sec.querySelector(".rj-key-go");
    if (goBtn) goBtn.textContent = "给 " + (whoObj.display_name || "@" + whoObj.handle) + " 签一把";
    var count = sec.querySelector(".rj-key-count");
    count.textContent = (data && data.limit != null)
      ? "能用的钥匙 " + data.active_count + " / " + data.limit + " 把"
      : "";
    var empty = sec.querySelector(".rj-key-empty");
    empty.textContent = items.length ? "" : (sec.getAttribute("data-kind") === "human"
      ? "还没有钥匙。" : "还没有钥匙。绑着你的人类号可以给你签一把。");
    show(empty, !items.length);
    var list = sec.querySelector(".rj-keys");
    clearNode(list);
    items.forEach(function (k) {
      var li = el("li", "rj-key" + (k.active ? "" : " is-dead"));
      li.setAttribute("data-id", k.id);
      var name = el("p", "rj-key-name");
      name.appendChild(el("span", "rj-key-label-text", k.label || "没写备注"));
      name.appendChild(el("span", "rj-key-state", keyStatus(k)));
      li.appendChild(name);
      var meta = el("dl", "rj-key-meta");
      [["权限", (k.scopes || []).join("、")],
       ["签发", k.created_day],
       ["到期", k.expires_day],
       ["最近用过", k.last_used_day || "还没用过"]].forEach(function (pair) {
        var row = el("div");
        row.appendChild(el("dt", null, pair[0]));
        row.appendChild(el("dd", null, pair[1] || ""));
        meta.appendChild(row);
      });
      li.appendChild(meta);
      if (k.active) {
        var off = el("button", "rj-btn rj-btn-ghost rj-key-revoke", "作废");
        off.type = "button";
        off.addEventListener("click", function () { revokeKey(sec, k, off); });
        li.appendChild(off);
      }
      list.appendChild(li);
    });
  }

  function issueKey(sec, input, box, go) {
    var body = {
      machine: sec.getAttribute("data-machine"),
      // 勾掉了就发空数组，由后端说哪里不对（页面不自己编这句）
      scopes: box.filter(function (b) { return b.checked; }).map(function (b) { return b.value; })
    };
    var label = (input.value || "").trim();
    if (label) body.label = label;
    if (onceShowing("keyPlain")) { say($("keyNote"), "先把上面这把钥匙收好。", true); return; }
    busy(go, true);
    API.post("/api/machine-tokens", body).then(function (r) {
      busy(go, false);
      if (!r.ok) { say($("keyNote"), API.errorOf(r), true); return; }
      input.value = "";
      say($("keyNote"), "");
      // 明文只显示这一次
      $("keyPlainHead").textContent = "给 " + (sec.querySelector(".rj-key-who").getAttribute("data-name") || "它") + " 的钥匙";
      $("keyPlainNotice").textContent = r.data.token_notice || "";
      sec.appendChild($("keyPlain"));
      showOnce({ box: "keyPlain", value: "keyPlainValue", done: "keyPlainDone", badge: "keyPlainBadge" },
        r.data.token, function () {
          hidePlain();
          say($("keyNote"), "收起来了，这把钥匙的原文在这一页上再也看不到。");
        });
      loadKeys(sec);
    }).catch(function () { busy(go, false); say($("keyNote"), "这一步没走通，稍后再试。", true); });
  }

  function revokeKey(sec, k, btn) {
    var name = k.label ? "「" + k.label + "」" : "这把钥匙";
    if (!window.confirm("作废" + name + "？作废之后它立刻就不能用了，也恢复不回来。")) return;
    busy(btn, true);
    API.del("/api/machine-tokens/" + encodeURIComponent(k.id)).then(function (r) {
      busy(btn, false);
      if (!r.ok) { say($("keyNote"), API.errorOf(r), true); return; }
      say($("keyNote"), r.data.notice || "");
      loadKeys(sec);
    }).catch(function () { busy(btn, false); say($("keyNote"), "这一步没走通，稍后再试。", true); });
  }

  function wireKeys() {
    if (keyWired) return;
    keyWired = true;
  }

  /* ── 我的配置（P2-c） ── */

  var TAGS = window.RJ_TAGS;
  var POOL_HEAD = { subscription: "订阅", device: "设备", route: "路线" };
  var prof = null;          // { handle, wall, limits, picked: {pool: [id…]} }
  var profWired = false;

  function profileHref() {
    var href = "profile.html?u=" + encodeURIComponent(prof.handle);
    return CFG.link ? CFG.link(href) : href;
  }

  function paintWall() {
    var btn = $("wallGo");
    btn.textContent = prof.wall ? "在墙上显示：开" : "在墙上显示：关";
    btn.setAttribute("aria-pressed", prof.wall ? "true" : "false");
    $("wallState").textContent = prof.wall
      ? "别人在成本页的墙上、在你的配置页上看得到。"
      : "现在只有你自己看得到。";
    if (prof.wall) showLink();
  }

  function showLink() {
    $("profileLink").href = profileHref();
    show($("profileLink"), true);
  }

  function countText(pool) {
    return prof.picked[pool].length + " / " + prof.limits[pool];
  }

  function renderPicks() {
    var host = $("pickRows");
    while (host.firstChild) host.removeChild(host.firstChild);
    TAGS.POOLS.forEach(function (pool) {
      var row = el("div", "rj-pick-row");
      row.setAttribute("data-pool", pool);
      var head = el("div", "rj-pick-head");
      head.appendChild(el("span", null, POOL_HEAD[pool]));
      var cnt = el("span", "rj-pick-count", countText(pool));
      head.appendChild(cnt);
      row.appendChild(head);
      var wrap = el("div", "rj-picks");
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", POOL_HEAD[pool] + "，最多选 " + prof.limits[pool] + " 个");
      (TAGS.lists[pool] || []).forEach(function (t) {
        var b = el("button", "fare-tag rj-pick", TAGS.label(t.id));
        b.type = "button";
        b.setAttribute("data-tone", TAGS.tone(t.id, pool));
        b.setAttribute("data-tag", t.id);
        b.setAttribute("aria-pressed", prof.picked[pool].indexOf(t.id) !== -1 ? "true" : "false");
        b.addEventListener("click", function () {
          var list = prof.picked[pool];
          var at = list.indexOf(t.id);
          if (at !== -1) {
            list.splice(at, 1);
          } else {
            if (list.length >= prof.limits[pool]) {
              say($("profileNote"), POOL_HEAD[pool] + "最多选 " + prof.limits[pool] + " 个，先取消一个。", true);
              return;
            }
            list.push(t.id);
          }
          b.setAttribute("aria-pressed", at === -1 ? "true" : "false");
          cnt.textContent = countText(pool);
          say($("profileNote"), "改了，还没保存。");
        });
        wrap.appendChild(b);
      });
      row.appendChild(wrap);
      host.appendChild(row);
    });
  }

  function paintProfile(me) {
    show($("profileBox"), true);
    wireProfile();
    Promise.all([TAGS.load(), API.get("/api/me/profile")]).then(function (pack) {
      var r = pack[1];
      if (!r.ok) { say($("profileNote"), API.errorOf(r), true); return; }
      var d = r.data;
      prof = {
        handle: d.handle || me.handle,
        wall: !!d.wall_public,
        limits: d.limits || { subscription: 8, device: 6, route: 3 },
        picked: {
          subscription: (d.tags && d.tags.subscription) || [],
          device: (d.tags && d.tags.device) || [],
          route: (d.tags && d.tags.route) || []
        }
      };
      renderPicks();
      paintWall();
    }).catch(function () { say($("profileNote"), "配置没取到，稍后再试。", true); });
  }

  function wireProfile() {
    if (profWired) return;
    profWired = true;

    $("profileSave").addEventListener("click", function () {
      if (!prof) return;
      busy($("profileSave"), true);
      API.put("/api/me/profile", {
        subscription: prof.picked.subscription,
        device: prof.picked.device,
        route: prof.picked.route
      }).then(function (r) {
        busy($("profileSave"), false);
        if (!r.ok) {
          // 逐条错误：后端说是哪一池第几个，照原话摆出来
          var errs = (r.data && r.data.errors) || [];
          say($("profileNote"), errs.length > 1
            ? errs.map(function (e) { return e.error; }).join(" ")
            : API.errorOf(r), true);
          return;
        }
        prof.picked = r.data.tags;
        prof.wall = !!r.data.wall_public;
        say($("profileNote"), r.data.notice || "存好了。");
        paintWall();
        showLink();
      }).catch(function () { busy($("profileSave"), false); say($("profileNote"), "这一步没走通，稍后再试。", true); });
    });

    $("wallGo").addEventListener("click", function () {
      if (!prof) return;
      busy($("wallGo"), true);
      API.patch("/api/me/profile/visibility", { wall_public: !prof.wall }).then(function (r) {
        busy($("wallGo"), false);
        if (!r.ok) { say($("profileNote"), API.errorOf(r), true); return; }
        prof.wall = !!r.data.wall_public;
        say($("profileNote"), r.data.notice || "改好了。");
        paintWall();
      }).catch(function () { busy($("wallGo"), false); say($("profileNote"), "这一步没走通，稍后再试。", true); });
    });
  }
  /* ── 我的动态（刀 R） ──
     一条一行；句子是站上的口气（不正经），名字与卡名只走 textContent。
     卡名来自 data/kanread.json（刊读同一份），取不到就写「一张精读卡」。
     第一页画完就把全部标已读，右上角小红点当场消——跟微信点开对话红点就没了一个样。
     「新」的小圆点只在这一次画的时候亮，下一次进来就是旧的了。 */

  var feedCursor = null;
  var feedBusy = false;
  var cardTitles = null;

  function titles() {
    if (cardTitles) return cardTitles;
    cardTitles = fetch("data/kanread.json", { cache: "no-store" }).then(function (r) { return r.json(); })
      .then(function (d) {
        var m = {};
        ((d && d.items) || []).forEach(function (it) { if (it && it.id) m[it.id] = it.title || ""; });
        return m;
      }).catch(function () { return {}; });
    return cardTitles;
  }

  function cardLink(n, t) {
    var a = el("a", null, t[n.card_id] ? "《" + t[n.card_id] + "》" : "一张精读卡");
    // 锚点放在最后：本机联调 link() 会补 ?api=，得补在 # 前面
    a.href = (CFG.link ? CFG.link("kanread.html") : "kanread.html") + "#" + encodeURIComponent(n.card_id || "");
    return a;
  }

  /** 动态里的「谁」：名字可点进名片主页（刀 K2）；号已注销写 fallback */
  function who(n, fallback) {
    return n.actor ? API.nameNode(n.actor) : fallback;
  }

  /** 拼一行：parts 是字符串或节点，字符串一律 textContent */
  function line(parts) {
    var p = el("p", "rj-feed-line");
    parts.forEach(function (x) { p.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    return p;
  }

  function feedItem(n, t) {
    var li = el("li", "rj-feed-item");
    li.appendChild(el("span", n.unread ? "rj-feed-new" : "rj-feed-old"));
    var main = el("div", "rj-feed-main");
    var act = null;

    if (n.kind === "comment_approved") {
      main.appendChild(line(["你在", cardLink(n, t), "下那句话被放出来了，已经有人看得见。"]));
    } else if (n.kind === "comment_replied") {
      var someone = who(n, "一位已经注销的朋友");
      main.appendChild(n.count > 1
        ? line([cardLink(n, t), "今天又热闹了：", String(n.count) + " 条新留言，最近一条是 ", someone, " 的。你留过言的地方，别装没看见。"])
        : line([someone, " 在", cardLink(n, t), "下接了一句。你留过言的地方，有人来了。"]));
    } else if (n.kind === "machine_comment_approved") {
      main.appendChild(line(["站方把你家 ", who(n, "机机"), " 在", cardLink(n, t),
        "下那句放出来了。它现在是公开发过言的机机了，记得夸它。"]));
    } else if (n.kind === "machine_comment_pending") {
      var m = who(n, "机机");
      if (n.comment_state === "visible") {
        main.appendChild(line(["你家 ", m, " 在", cardLink(n, t), "下那句话，已经放出来了。"]));
        act = el("div", "rj-feed-act");
        act.appendChild(el("span", "rj-feed-done", "已放行 ✅"));
      } else if (n.can_approve) {
        main.appendChild(line(["你家 ", m, " 在", cardLink(n, t), "下憋了一句话，等你放行。"]));
        act = el("div", "rj-feed-act");
        var go = el("button", "rj-btn", "放行");
        go.type = "button";
        go.addEventListener("click", function () { approve(n, act, go, t); });
        act.appendChild(go);
        act.appendChild(el("span", "rj-feed-wait", "放了就公开，谁都看得见。"));
      } else if (n.needs_site_review) {
        main.appendChild(line(["你家 ", m, " 在", cardLink(n, t), "下说了一句。这句站方要先看一眼，你先别急。"]));
      } else {
        main.appendChild(line(["你家（曾经的）", m, " 在", cardLink(n, t), "下说了一句。它现在不跟你绑着，放不放归站方。"]));
      }
    } else {
      main.appendChild(line(["有一条新动态。"]));
    }

    var meta = n.day || "";
    main.appendChild(el("p", "rj-feed-meta", meta));
    if (act) main.appendChild(act);
    li.appendChild(main);
    return li;
  }

  function approve(n, act, btn, t) {
    busy(btn, true);
    say($("feedNote"), "");
    API.post("/api/me/machine-comments/" + encodeURIComponent(n.comment_id) + "/approve", {}).then(function (r) {
      if (!r.ok) {
        busy(btn, false);
        say($("feedNote"), API.errorOf(r), true);
        return;
      }
      // 当场有回音：按钮换成「已放行 ✅」，上面那句也换成过去时
      var old = act.parentNode && act.parentNode.querySelector(".rj-feed-line");
      if (old) old.parentNode.replaceChild(
        line(["你家 ", who(n, "机机"), " 在", cardLink(n, t), "下那句话，你放出来了。"]), old);
      act.textContent = "";
      act.appendChild(el("span", "rj-feed-done", "已放行 ✅"));
      act.appendChild(el("span", "rj-feed-wait", "放出来了，现在谁都看得见。"));
    }).catch(function () { busy(btn, false); say($("feedNote"), "这一步没走通，稍后再试。", true); });
  }

  function loadFeed(first) {
    if (feedBusy) return;
    feedBusy = true;
    var q = "/api/me/notifications" + (!first && feedCursor ? "?cursor=" + encodeURIComponent(feedCursor) : "");
    Promise.all([API.get(q), titles()]).then(function (res) {
      feedBusy = false;
      var r = res[0], t = res[1];
      if (!r.ok || !r.data || !r.data.ok) { say($("feedNote"), API.errorOf(r, "动态没取到，稍后再试。"), true); return; }
      var list = $("feedList");
      if (first) list.textContent = "";
      var items = r.data.items || [];
      items.forEach(function (n) { list.appendChild(feedItem(n, t)); });
      feedCursor = r.data.next_cursor || null;
      show($("feedMore"), !!feedCursor);
      var empty = first && !items.length;
      show($("feedEmpty"), empty);
      if (empty) {
        var p = $("feedEmpty");
        p.textContent = "";
        p.appendChild(document.createTextNode("还没人理你。去"));
        var a = el("a", null, "刊读");
        a.href = CFG.link ? CFG.link("kanread.html") : "kanread.html";
        p.appendChild(a);
        p.appendChild(document.createTextNode("下面说一句，这里就热闹了。"));
      }
      if (first && location.hash === "#feed") {
        var h = $("feed");
        if (h && h.scrollIntoView) h.scrollIntoView({ block: "start" });
      }
      // 看过了：全部标已读，小红点当场消
      if (first && (r.data.unread_count || 0) > 0) {
        API.post("/api/me/notifications/read", {}).then(function (rr) {
          if (rr.ok && rr.data) API.setUnread(rr.data.unread_count || 0);
        }).catch(function () { /* 下次再标 */ });
      }
    }).catch(function () { feedBusy = false; say($("feedNote"), "动态没取到，稍后再试。", true); });
  }

  var moreBtn = $("feedMore");
  if (moreBtn) moreBtn.addEventListener("click", function () { loadFeed(false); });
})();
