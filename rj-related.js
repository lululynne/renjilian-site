/* 跨板块「相关」一行（裁定 v1.1 · 第一阶段 1-核）。

   数据里的 related 只存 {kind, id}；标题在这里从目标数据文件现取，所以改标题只改一处。
   目标不存在、不是公开态（草稿／候选／失效），或是 18+ 提问卡，就不渲染那一条；一条都剩不下，整行不出现。
   标题一律 textContent 进 DOM。 */
window.RJ_RELATED = (function () {
  "use strict";

  var KINDS = {
    reading:  { file: "data/kanread.json",   page: "kanread.html#", label: "精读" },
    pulse:    { file: "data/pulse.json",     page: "pulse.html#",   label: "脉搏" },
    question: { file: "data/questions.json", page: "games.html#",   label: "提问" },
    tool:     { file: "data/mcps.json",      page: "baibao.html#",  label: "工具" },
    cost:     { file: "data/llm-cost.json",  page: "cost.html#",    label: "成本" }
  };
  var cache = {};

  function txt(v) {
    if (v && typeof v === "object") return v.zh || v.ja || v.ko || v.en || "";
    return v == null ? "" : String(v);
  }

  function clip(s, n) {
    s = txt(s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function load(kind) {
    var file = KINDS[kind].file;
    if (!cache[file]) {
      cache[file] = fetch(file, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { return Array.isArray(d) ? d : (d.items || []); })
        .catch(function () { return []; });
    }
    return cache[file];
  }

  function titleOf(kind, it) {
    if (!it) return null;
    if (kind === "question") return it.lv === "r18" ? null : clip(it.title, 28);
    if (it.status !== "verified") return null;
    if (kind === "reading") return clip(it.title, 28);
    if (kind === "pulse") return clip(it.who + "：" + it.line, 28);
    if (kind === "tool") return clip(it.name, 28);
    if (kind === "cost") return clip(it.product, 28);
    return null;
  }

  /* 返回一个 <p class="rj-related">，先空着挂上，标题取回来再填；一条都解析不出就把自己摘掉 */
  function node(refs, opts) {
    var p = document.createElement("p");
    p.className = "rj-related";
    p.hidden = true;
    refs = (refs || []).filter(function (r) { return r && KINDS[r.kind] && r.id; }).slice(0, 4);
    if (!refs.length) return p;
    Promise.all(refs.map(function (r) {
      return load(r.kind).then(function (list) {
        var hit = null;
        for (var i = 0; i < list.length; i++) if (list[i].id === r.id) { hit = list[i]; break; }
        var t = titleOf(r.kind, hit);
        return t ? { ref: r, title: t } : null;
      });
    })).then(function (rows) {
      rows = rows.filter(Boolean);
      if (!rows.length) { if (p.parentNode) p.parentNode.removeChild(p); return; }
      var lab = document.createElement("span");
      lab.className = "rj-related-label";
      lab.textContent = (opts && opts.label) || "相关";
      p.appendChild(lab);
      rows.forEach(function (row) {
        var k = KINDS[row.ref.kind];
        var a = document.createElement("a");
        a.className = "rj-related-link";
        a.href = k.page + encodeURIComponent(row.ref.id);
        var kind = document.createElement("small");
        kind.textContent = k.label;
        a.appendChild(kind);
        var title = document.createElement("span");
        title.textContent = row.title;
        a.appendChild(title);
        p.appendChild(a);
      });
      p.hidden = false;
    });
    return p;
  }

  /* 卡片是异步铺出来的，浏览器自带的锚点跳转那一刻目标还不存在；铺完再跳一次 */
  function scrollToHash() {
    var id = decodeURIComponent((location.hash || "").slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "start" });
  }

  return { node: node, scrollToHash: scrollToHash, kinds: KINDS };
})();
