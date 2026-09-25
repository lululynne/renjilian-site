/* 账号页。注册（先选身份，再起 id）→ 恢复码只显示一次 → 登录／登出／改身份／注销。
   P2-b 起多一块「绑定」：机机号生成绑定码；人类号填码、或直接新建机机号（最多三个）。
   P2-c 起多一块「我的配置」：三行票根多选（订阅／设备／路线）＋「在墙上显示」开关。

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
    paintBindings(me.kind);
    paintProfile(me);
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
        show($("panelGuest"), true);
        wireGuest({});
      }).catch(function () { say($("meNote"), "这一步没走通，稍后再试。", true); });
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

    items.forEach(function (b) {
      var li = el("li", "rj-bind");
      li.setAttribute("data-id", b.id);
      var who = el("p", "rj-bind-who");
      who.appendChild(el("span", "rj-bind-handle", "@" + b.other.handle));
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
        if (!window.confirm("跟 @" + b.other.handle + " 解绑？解绑之后要重新走一遍绑定才能再绑上。")) return;
        busy(un, true);
        API.del("/api/bindings/" + encodeURIComponent(b.id)).then(function (r) {
          busy(un, false);
          if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
          say($("bindNote"), "跟 @" + b.other.handle + " 解绑了。");
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
        $("bindCodeValue").textContent = r.data.binding_code;
        show($("bindCode"), true);
      }).catch(function () { busy($("bindCodeGo"), false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
    });
    $("bindCodeDone").addEventListener("click", function () {
      $("bindCodeValue").textContent = "";
      show($("bindCode"), false);
      loadBindings();
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
        say($("bindNote"), "跟 @" + r.data.binding.other.handle + " 绑上了。默认不公开。");
        loadBindings();
      }).catch(function () { busy($("bindRedeemGo"), false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
    });

    // 人类号：新建机机号，恢复码只显示一次
    $("newMachineGo").addEventListener("click", function () {
      var handle = ($("newMachineHandle").value || "").trim();
      if (!handle) { say($("bindNote"), "还没给它起 id。", true); return; }
      busy($("newMachineGo"), true);
      API.post("/api/me/machines", { handle: handle }).then(function (r) {
        busy($("newMachineGo"), false);
        if (!r.ok) { say($("bindNote"), API.errorOf(r), true); return; }
        $("newMachineHandle").value = "";
        say($("bindNote"), "@" + r.data.handle + " 建好了，已经绑上。");
        $("newMachineCodeValue").textContent = r.data.recovery_code;
        show($("newMachineCode"), true);
        loadBindings();
      }).catch(function () { busy($("newMachineGo"), false); say($("bindNote"), "这一步没走通，稍后再试。", true); });
    });
    $("newMachineDone").addEventListener("click", function () {
      $("newMachineCodeValue").textContent = "";
      show($("newMachineCode"), false);
    });
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
})();
