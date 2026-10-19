(function () {
  "use strict";
  function text(v) { return typeof v === "string" ? v : ""; }
  function esc(v) {
    return text(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function strings(v) { return Array.isArray(v) ? v.filter(function (s) { return typeof s === "string" && s.trim(); }) : []; }
  function isV3(e) { return !!e && typeof e.what === "string" && Array.isArray(e.use_tags); }
  function isPublished(e) { return !!e && e.status === "verified"; }
  function state(e) { return e.lifecycle && typeof e.lifecycle === "object" ? e.lifecycle : {}; }
  function company(e) { return e.company && typeof e.company === "object" ? e.company : {}; }
  function join(values) { return values.map(text).filter(Boolean).join("；"); }
  function questionsHtml(e) {
    if (!isV3(e)) return "";
    var rows = [
      ["干嘛的", e.what], ["对你有啥用", e.helps_with], ["要什么设备", e.device],
      ["上手难度", e.difficulty], ["面向谁、哪能用", join([e.for_whom, e.region])],
      ["强在哪", e.edge], ["谁家的、现在", join([e.owner, state(e).state])]
    ];
    return '<dl class="an-questions">' + rows.map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(text(r[1]) || "待核") + "</dd>";
    }).join("") + "</dl>";
  }
  function sourceLink(s) {
    if (!s || !text(s.name)) return "";
    try {
      var u = new URL(s.url);
      if (u.protocol === "https:") return '<a href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + "</a>";
    } catch (_) {}
    return esc(s.name);
  }
  function titleOf(s) { return s.replace(/\.md$/i, "").replace(/^年轮-/, ""); }
  function detailsHtml(e) {
    if (!isV3(e)) return "";
    var html = '<div class="an-fields">';
    function row(label, value) {
      if (text(value).trim()) html += '<section class="an-field"><h5>' + esc(label) + '</h5><p>' + esc(value) + "</p></section>";
    }
    row("同属词", strings(e.aliases).join("、"));
    var uses = strings(e.use_tags);
    if (uses.length) row("用途", "主要：" + uses[0] + (uses.length > 1 ? "；也适合：" + uses.slice(1).join("、") : ""));
    row("在哪用", e.where_used);
    row("怎么使用", e.access);
    row("公开与更新时间线", e.timeline);
    row("谁在用、评价", e.reception);
    var c = company(e);
    row("公司资料", join([c.full_name, c.type, c.business]));
    var l = state(e), status = join([l.state, l.date, l.note]);
    if (status || (l.source && text(l.source.name))) {
      html += '<section class="an-field"><h5>产品状态</h5><p>' + esc(status) + '</p>';
      if (l.source) html += '<p class="an-state-source">' + sourceLink(l.source) + '</p>';
      html += "</section>";
    }
    // 历史题名不等于公网路由；没有已发布ID时保留文字，不猜链接。
    row("年轮记录", strings(e.nianlun_seen).map(titleOf).join("；"));
    row("编辑来源", strings(e.seen_in).filter(function (s) { return !/^kr-[a-z0-9-]+$/.test(s); }).map(titleOf).join("；"));
    row("收录日期", e.added_at);
    return html + "</div>";
  }
  function searchText(e) {
    if (!isV3(e)) return [];
    var c = company(e), l = state(e);
    return [e.for_whom, e.helps_with, e.device, e.difficulty, e.region, e.edge, e.owner,
      e.what, e.where_used, e.access, e.timeline, e.reception, c.full_name, c.type, c.business,
      l.state, l.note].concat(strings(e.use_tags)).filter(function (v) { return text(v); });
  }
  window.RJ_AINOTES_FIELDS = { isV3: isV3, isPublished: isPublished,
    questionsHtml: questionsHtml, detailsHtml: detailsHtml, searchText: searchText };
})();
