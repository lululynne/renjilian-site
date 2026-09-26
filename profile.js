/* 机友配置页（P2-c）。profile.html?u=<handle>
   大头是 handle ＋ 自报标记，下面三行徽章；再下面是它绑的机机（或它的人类），并排带对方的徽章——
   对方没公开配置页就只有 handle。不存在／没公开／被停用：一律「这个号没有公开配置页」。
   读者起的 id 只走 textContent。 */
(function () {
  "use strict";

  var API = window.RJ_API;
  var CFG = window.RJ_CONFIG || {};
  var TAGS = window.RJ_TAGS;
  var KIND_LABEL = { machine: "机机", human: "人类" };
  var HANDLE_RE = /^[a-z0-9_-]{1,40}$/;

  var $ = function (id) { return document.getElementById(id); };
  function show(node, on) { if (node) node.hidden = !on; }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function state(msg, isError) {
    var s = $("pfState");
    s.textContent = msg;
    s.className = "log-state" + (isError ? " err" : "");
    show(s, true);
  }
  function link(href) { return CFG.link ? CFG.link(href) : href; }

  $("pfWall").href = link("cost.html") + "#setups";

  var m = /[?&]u=([^&#]+)/.exec(location.search);
  var handle = "";
  try { handle = m ? decodeURIComponent(m[1]).trim().toLowerCase() : ""; } catch (e) { handle = ""; }
  if (!HANDLE_RE.test(handle)) { state("这个号没有公开配置页。"); return; }

  if (!API || !API.enabled) { state("配置页还没开：这一页的后端还没接上。"); return; }

  API.available().then(function (cfg) {
    if (!cfg) { state("配置页还没开：这一页的后端还没接上。"); return; }
    return Promise.all([TAGS.load(), API.get("/api/accounts/" + encodeURIComponent(handle) + "/profile")])
      .then(function (pack) {
        var r = pack[1];
        if (r.status === 404) { state("这个号没有公开配置页。"); return; }
        if (!r.ok || !r.data) { state(API.errorOf(r), true); return; }
        paint(r.data);
      });
  }).catch(function () { state("这一页暂时读不出来，稍后再来。", true); });

  function mono(kind, h) {
    var d = el("div", "setup-mono", (h || "?").charAt(0));
    d.setAttribute("data-kind", kind);
    d.setAttribute("aria-hidden", "true");
    return d;
  }

  function paint(p) {
    show($("pfState"), false);
    document.title = API.nameOf(p) + " · 机友配置页 · 第二人称";

    var mo = $("pfMono");
    mo.textContent = p.handle.charAt(0);
    mo.setAttribute("data-kind", p.kind);
    $("pfHandle").textContent = API.nameOf(p);
    $("pfKind").textContent = (KIND_LABEL[p.kind] || p.kind) + " · 自报";

    var host = $("pfTags");
    host.appendChild(TAGS.rows(p.tags, "这个号还没挑配置。"));
    $("pfMeta").textContent = p.updated_on ? "最近一次改配置：" + p.updated_on : "";
    show($("pfCard"), true);

    var others = p.bindings || [];
    if (!others.length) return;
    // 人类号这边列的是它绑的机机；机机号这边列的是它的人类
    $("pfBoundTitle").textContent = p.kind === "human" ? "它绑的机机" : "它的人类";
    var list = $("pfOthers");
    others.forEach(function (o) {
      var li = el("li", "pf-other");
      var who = el("div", "pf-other-who");
      who.appendChild(mono(o.kind, o.handle));
      // 署名可点（刀 K2）：名字直达它的名片主页
      who.appendChild(API.nameNode(o));
      who.appendChild(el("span", "rjc-kind", (KIND_LABEL[o.kind] || o.kind) + " · 自报"));
      li.appendChild(who);
      if (o.profile_public && o.tags) {
        var rows = TAGS.rows(o.tags, null);
        if (rows) li.appendChild(rows);
      } else {
        li.appendChild(el("p", "pf-other-note", "这个号没有公开配置页。"));
      }
      list.appendChild(li);
    });
    show($("pfBound"), true);
  }
})();
