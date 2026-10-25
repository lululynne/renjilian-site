(function (root) {
  "use strict";
  var ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
  var TYPES = { question: ["games", "问题"], tool: ["baibao", "工具"], reading: ["kanread", "精读"] };
  function node(tag, text, cls) {
    var el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function href(type, id) {
    return TYPES[type] && typeof id === "string" && ID.test(id) ? TYPES[type][0] + ".html#" + id : null;
  }
  function candidates(type, body) {
    var rows = type === "question" ? body : body && body.items;
    if (!TYPES[type] || !Array.isArray(rows) || rows.length > 1000
      || type === "tool" && body.schema_version !== 2 || type === "reading" && body.schema_version !== 1) throw Error("内容格式暂时无法核对。");
    var seen = new Set();
    return rows.map(function (row) {
      if (!row || typeof row.id !== "string" || !ID.test(row.id) || seen.has(row.id)) throw Error("内容位置暂时无法核对。");
      seen.add(row.id);
      var title = type === "tool" ? row.name : row.title;
      if (typeof title !== "string" || !title.trim() || Array.from(title).length > 240) throw Error("内容标题暂时无法核对。");
      if (type === "question") {
        if (["all-age", "tease", "r18"].indexOf(row.lv) < 0) throw Error("问题分级暂时无法核对。");
        return { target_type: type, target_id: row.id, title: row.lv === "r18" ? "成人问题 · 进入问题页后查看" : title.trim(),
          level: row.lv, adult: row.lv === "r18", href: href(type, row.id), available: true };
      }
      var allowed = type === "tool" ? ["verified", "candidate", "planned", "unavailable"] : ["verified", "unavailable"];
      if (typeof row.status !== "string") throw Error("内容状态暂时无法核对。");
      if (allowed.indexOf(row.status) < 0) return null;
      return { target_type: type, target_id: row.id, title: title.trim(), status: row.status,
        href: href(type, row.id), available: true };
    }).filter(Boolean);
  }
  function preview(item) {
    var p = item && item.preview, C = root.RJ_CARD, V = root.RJ_AVATAR_V8;
    if (!p || !C || ["logo", "character"].indexOf(p.mode) < 0
      || ["head", "face", "neck", "back"].indexOf(p.slot) < 0
      || typeof p.variant_id !== "string" || item.catalog_id !== "base-v1:" + p.mode + ":" + p.slot + ":" + p.variant_id) return null;
    var avatar;
    if (p.mode === "logo") {
      if (!C.OUTFIT[p.slot] || !C.OUTFIT[p.slot].some(function (x) { return x.k === p.variant_id; })) return null;
      avatar = { model: "chatgpt" }; avatar[p.slot] = p.variant_id;
    } else {
      if (!V || !V.catalog.outfit[p.slot] || !V.catalog.outfit[p.slot].some(function (x) { return x[0] === p.variant_id; })) return null;
      var recipe = V.defaultRecipe("fox"); recipe.outfit[p.slot] = p.variant_id;
      avatar = { mode: "character", character: recipe };
    }
    var el = node("span", undefined, "collection-avatar");
    var template = document.createElement("template");
    template.innerHTML = C.avatar(avatar, "", "配件预览");
    el.appendChild(template.content);
    return el;
  }
  function tile(slot) {
    var el = node("div", undefined, "collection-tile");
    if (!slot) { el.appendChild(node("p", "还空着", "collection-empty")); return el; }
    if (slot.target_type === "owned_item") {
      var item = slot.item || {}, image = preview(item);
      if (image) el.appendChild(image);
      el.appendChild(node("strong", item.name || "藏品"));
      el.appendChild(node("small", item.source_label === "基础免费" ? "基础免费" : "宝箱藏品"));
    } else {
      var link = href(slot.target_type, slot.target_id);
      var name = slot.adult ? "成人问题 · 进入问题页后查看" : slot.title || (TYPES[slot.target_type] || ["", "内容"])[1];
      var title = node(link ? "a" : "strong", name);
      if (link) title.setAttribute("href", link);
      el.appendChild(title);
      var status = { verified: "已核对", candidate: "待验证", planned: "准备中", unavailable: "暂不可用" }[slot.status];
      el.appendChild(node("small", (TYPES[slot.target_type] || ["", "内容"])[1] + (status ? " · " + status : "")));
    }
    if (slot.available === false) el.appendChild(node("small", "暂不可用，公开时会收起", "collection-unavailable"));
    return el;
  }
  function paint(container, display, options) {
    container.replaceChildren();
    if (!display) return;
    var grid = node("div", undefined, "collection-grid");
    for (var i = 1; i <= 6; i++) {
      var cell = node("div", undefined, "collection-cell");
      cell.appendChild(node("span", String(i).padStart(2, "0"), "collection-position"));
      cell.appendChild(tile((display.slots || []).find(function (slot) {
        return slot.position === i && (options && options.privateView || slot.available !== false);
      })));
      grid.appendChild(cell);
    }
    container.appendChild(grid);
    if (display.available === false) container.appendChild(node("p", "部分内容暂时无法核对，已先收起。", "collection-source-note"));
  }
  var api = { href: href, candidates: candidates, tile: tile, paint: paint };
  root.RJ_COLLECTION = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
