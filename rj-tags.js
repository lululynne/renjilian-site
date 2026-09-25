/* 票根标签（P2-c）：账号页的「我的配置」和配置页 profile.html 共用。
   后端只存标签 id；中英文字和颜色永远从 data/llm-cost-tags.json 来，跟成本页同一份。
   语言跟成本页同一个 localStorage 键（renjilian-cost-lang），在成本页切了英文，这里的标签也是英文。
   渲染一律 createElement + textContent。 */
window.RJ_TAGS = (function () {
  "use strict";
  var LANG_KEY = "renjilian-cost-lang";
  var POOLS = ["subscription", "device", "route"];
  var POOL_LABEL = {
    zh: { subscription: "月订阅配置", device: "设备", route: "路线" },
    en: { subscription: "Monthly plans", device: "Devices", route: "Route" }
  };
  var FALLBACK_TONE = { subscription: "mist", device: "device", route: "slate" };
  var loading = null;
  var byId = {};
  var lists = { subscription: [], device: [], route: [] };

  function lang() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      if (v === "en" || v === "zh") return v;
    } catch (e) { /* 读不到就用中文 */ }
    return "zh";
  }

  function load() {
    if (loading) return loading;
    loading = fetch("data/llm-cost-tags.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }).then(function (data) {
      POOLS.forEach(function (pool) {
        lists[pool] = (data && data[pool]) || [];
        lists[pool].forEach(function (row) { byId[row.id] = { row: row, pool: pool }; });
      });
      return lists;
    });
    return loading;
  }

  function known(id) { return !!byId[id]; }

  function label(id) {
    var hit = byId[id];
    if (!hit) return id;
    return (lang() === "en" && hit.row.label_en) ? hit.row.label_en : (hit.row.label || id);
  }

  function tone(id, pool) {
    var hit = byId[id];
    return (hit && hit.row.tone) || FALLBACK_TONE[pool] || "mist";
  }

  function poolLabel(pool) { return (POOL_LABEL[lang()] || POOL_LABEL.zh)[pool] || pool; }

  /** 一枚只读的票根 */
  function badge(id, pool) {
    var s = document.createElement("span");
    s.className = "fare-tag";
    s.setAttribute("data-tone", tone(id, pool));
    s.textContent = label(id);
    return s;
  }

  /** 三行徽章。站上已经没有的标签 id（下架的套餐）不显示；三池全空就返回 null */
  function rows(tags, emptyText) {
    var body = document.createElement("div");
    body.className = "setup-body";
    var any = false;
    POOLS.forEach(function (pool) {
      var ids = ((tags && tags[pool]) || []).filter(known);
      if (!ids.length) return;
      any = true;
      var row = document.createElement("div");
      row.className = "setup-row " + pool;
      var lab = document.createElement("span");
      lab.className = "row-label";
      lab.textContent = poolLabel(pool);
      var wrap = document.createElement("div");
      wrap.className = "setup-tags";
      ids.forEach(function (id) { wrap.appendChild(badge(id, pool)); });
      row.appendChild(lab);
      row.appendChild(wrap);
      body.appendChild(row);
    });
    if (!any) {
      if (emptyText == null) return null;
      var p = document.createElement("p");
      p.className = "setup-empty";
      p.textContent = emptyText;
      body.appendChild(p);
    }
    return body;
  }

  return {
    POOLS: POOLS,
    load: load,
    lists: lists,
    known: known,
    label: label,
    tone: tone,
    poolLabel: poolLabel,
    badge: badge,
    rows: rows,
    lang: lang
  };
})();
