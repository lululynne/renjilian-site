/* 小纸条频道页（刀 4，2026-09-30）：人机百科查词页。
   搜索与筛选只在本机比对文字，不联网、不记录；简洁/详细两档与刊读共用 rj.ainotes.mode。 */
(function () {
  "use strict";

  var listEl = document.getElementById("bkList");
  var emptyEl = document.getElementById("bkEmpty");
  var emptyText = document.getElementById("bkEmptyText");
  var startersEl = document.getElementById("bkStarters");
  var emptyReset = document.getElementById("bkEmptyReset");
  var qEl = document.getElementById("bkQ");
  var clearEl = document.getElementById("bkClear");
  var countEl = document.getElementById("bkCount");
  var noticeEl = document.getElementById("bkNotice");
  var tagsEl = document.getElementById("bkTags");
  var tagsWrap = document.getElementById("bkTagsWrap");
  var tagsPicked = document.getElementById("bkTagsPicked");
  var tagsClear = document.getElementById("bkTagsClear");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var PIN = '<svg class="bk-pin" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="currentColor" d="M16 3l5 5-3 1-3 3 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 3-3z"/></svg>';

  /* ── 查词规则（页面与将来的 MCP 共用；SITE-MAP「查词规则」一节照这份写） ── */
  var PUNCT = /[\s\-_.·•・\/\\|,，。、:：;；!！?？'"‘’“”`()（）\[\]【】{}「」『』<>《》+&]+/g;
  function norm(s) { return String(s == null ? "" : s).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(); }
  function compact(s) { return norm(s).replace(PUNCT, ""); }

  // 拼音首字母分组；Intl.Collator 不可用时退回码点序（中文归「#」组）
  var COLL = (function () {
    try {
      if (Intl.Collator.supportedLocalesOf(["zh-CN"]).length)
        return new Intl.Collator("zh-CN", { sensitivity: "base", numeric: true });
    } catch (_) {}
    return null;
  })();
  var PY_L = "ABCDEFGHJKLMNOPQRSTWXYZ", PY_B = "阿八嚓哒妸发旮哈讥咔垃痳拏噢妑七呥扨它穵夕丫帀";
  function letterOf(zh) {
    var c = norm(zh).charAt(0);
    if (/[a-z]/.test(c)) return c.toUpperCase();
    if (COLL && /[一-鿿]/.test(c)) for (var i = PY_B.length - 1; i >= 0; i--)
      if (COLL.compare(c, PY_B[i]) >= 0) return PY_L[i];
    return "#";
  }
  // 基础序：先按字母（# 排最后），同字母内按 COLL（没有就按码点），再按 id 兜底
  function baseCompare(a, b) {
    if (a._letter !== b._letter) {
      if (a._letter === "#") return 1;
      if (b._letter === "#") return -1;
      return a._letter < b._letter ? -1 : 1;
    }
    var c = COLL ? COLL.compare(a.zh, b.zh)
      : (norm(a.zh) < norm(b.zh) ? -1 : norm(a.zh) > norm(b.zh) ? 1 : 0);
    return c || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  // 标签表 v0（录入规范第五节），27 个；表外的防御性进「其他」——静态测试守着它现在为空
  var TAG_GROUPS = [
    ["类型", ["概念", "公司", "产品", "模型", "人物", "事件"]],
    ["话题", ["计费", "编程", "设计", "写作与办公", "建站", "生图", "语音", "记忆", "陪伴", "人机恋相关"]],
    ["形态", ["终端", "桌面", "网页", "插件", "云端", "开源"]],
    ["地区", ["国产", "国内可用"]],
    ["厂商", ["OpenAI", "Anthropic", "Google"]]
  ];
  var TAG_TO_GROUP = {};
  TAG_GROUPS.forEach(function (g) { g[1].forEach(function (t) { TAG_TO_GROUP[t] = g[0]; }); });

  var STARTERS = ["bk-usage", "bk-sub", "bk-api", "bk-agent", "bk-credits", "bk-openai"];

  // 跟 kanread.html enPart 同一规则，改一处要改两处：en 为空、与 zh 完全相同（不分大小写）、
  // 或 zh 里已经括着 en（中英文括号都算）时，不渲染英文名那一行
  function enShown(zh, en) {
    zh = String(zh == null ? "" : zh);
    en = String(en == null ? "" : en);
    if (!en) return false;
    var z = zh.toLowerCase(), n = en.toLowerCase();
    if (z === n) return false;
    if (z.indexOf("(" + n + ")") !== -1 || z.indexOf("（" + n + "）") !== -1) return false;
    return true;
  }

  /* ── 状态 ── */
  var READY = false, ITEMS = [], BY_ID = {}, LETTER_NODES = {};
  var TITLES = {}, UPDATED = "";
  var Q = "", PICKED = {};   // {组名: {tag: true}}
  var FULL = false, COMPOSING = false, LAST_SIG = null;

  var LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) &&
    new URLSearchParams(location.search).get("preview") === "1";

  function hashId() {
    var raw = location.hash.slice(1);
    if (!raw) return "";
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
  }

  /* ── 两档：读 rj.ainotes.mode；没有就读旧键 rj.ainotes.on（只读不迁移，迁移归 kanread）。
     显示档：full 就是 full，其余（含 off、没有键）一律 brief。加载时不写存储。 ── */
  function storedMode() {
    try {
      var m = localStorage.getItem("rj.ainotes.mode");
      if (m === "off" || m === "brief" || m === "full") return m;
      var old = localStorage.getItem("rj.ainotes.on");
      if (old !== null) return old === "0" ? "off" : "brief";
    } catch (_) {}
    return null;
  }

  function syncModeUI() {
    document.body.classList.toggle("bk-full", FULL);
    var radios = document.querySelectorAll(".bk-modes .an-mode"), i;
    for (i = 0; i < radios.length; i++) {
      var on = radios[i].getAttribute("data-mode") === (FULL ? "full" : "brief");
      radios[i].setAttribute("aria-checked", on ? "true" : "false");
      radios[i].setAttribute("tabindex", on ? "0" : "-1");
    }
    // 换档会重置单卡的「说详细点」状态
    var full_cards = listEl.querySelectorAll(".bk-card.is-full");
    for (i = 0; i < full_cards.length; i++) full_cards[i].classList.remove("is-full");
  }

  function setDisplay(full) {
    FULL = full;
    syncModeUI();
    // Q1：重新读一次存储；当前值是 off 时不写回（本页选择只在内存里生效）
    if (storedMode() === "off") return;
    try { localStorage.setItem("rj.ainotes.mode", full ? "full" : "brief"); } catch (_) {}
  }

  document.querySelector(".bk-modes").addEventListener("click", function (e) {
    var r = e.target && e.target.closest ? e.target.closest(".an-mode") : null;
    if (r) setDisplay(r.getAttribute("data-mode") === "full");
  });
  document.querySelector(".bk-modes").addEventListener("keydown", function (e) {
    var r = e.target && e.target.closest ? e.target.closest(".an-mode") : null;
    if (!r) return;
    var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    var all = document.querySelectorAll(".bk-modes .an-mode");
    var idx = Array.prototype.indexOf.call(all, r);
    var next = all[(idx + step + all.length) % all.length];
    next.focus();
    setDisplay(next.getAttribute("data-mode") === "full");
  });
  // 跨标签页同步：别的页改了档位，这页跟着换显示，不写存储
  window.addEventListener("storage", function (e) {
    if (e.key !== "rj.ainotes.mode") return;
    FULL = storedMode() === "full";
    syncModeUI();
  });

  /* ── 匹配与筛选 ── */
  function prepEntry(e) {
    e._nm = [{ n: norm(e.zh), c: compact(e.zh) }, { n: norm(e.en || ""), c: compact(e.en || "") }];
    e._al = (e.aliases || []).map(function (a) { return { raw: a, n: norm(a), c: compact(a) }; });
    e._tx = [e.brief || "", e.line || ""].map(function (t) { return { n: norm(t), c: compact(t) }; });
    e._names = e._nm.concat(e._al);
    e._letter = letterOf(e.zh);
  }

  function hit(pair, t) { return pair.n.indexOf(t.n) !== -1 || (t.c.length >= 2 && pair.c.indexOf(t.c) !== -1); }
  function termsOf(q) { return norm(q).split(" ").filter(Boolean).map(function (t) { return { n: t, c: compact(t) }; }); }
  function everyTerm(pairs, terms) {
    return terms.every(function (t) { return pairs.some(function (p) { return hit(p, t); }); });
  }

  function rankOf(e, terms, W) {
    var names = e._names, i;
    for (i = 0; i < names.length; i++)
      if (names[i].n === W.n || (W.c && names[i].c === W.c)) return 0;
    for (i = 0; i < names.length; i++)
      if (names[i].n.indexOf(W.n) === 0 || (W.c && names[i].c.indexOf(W.c) === 0)) return 1;
    return everyTerm(names, terms) ? 2 : 3;
  }

  function pickedList() {
    var out = [];
    TAG_GROUPS.forEach(function (g) {
      g[1].forEach(function (t) { if (PICKED[g[0]] && PICKED[g[0]][t]) out.push(t); });
    });
    Object.keys(PICKED["其他"] || {}).forEach(function (t) { out.push(t); });
    return out;
  }
  function hasPicks() { return pickedList().length > 0; }

  function tagPass(e) {
    var groups = Object.keys(PICKED);
    for (var i = 0; i < groups.length; i++) {
      var picks = Object.keys(PICKED[groups[i]]);
      if (!picks.length) continue;
      var ok = false;
      for (var j = 0; j < picks.length; j++)
        if ((e.tags || []).indexOf(picks[j]) !== -1) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }

  /* ── 卡片与展开区 ── */
  function cardHtml(e) {
    var out = '<article class="card bk-card" id="' + esc(e.id) + '" data-letter="' + e._letter + '" tabindex="-1">';
    out += '<p class="bk-here" hidden>' + PIN + "就是这一条</p>";
    out += '<h4 class="bk-name">' + (e._draft ? "【草稿】" : "") + esc(e.zh) + "</h4>";
    if (enShown(e.zh, e.en)) out += '<p class="bk-en">' + esc(e.en) + "</p>";
    out += '<p class="bk-aka" hidden></p>';
    if (e.tags && e.tags.length)
      out += '<p class="chips bk-card-tags">' +
        e.tags.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") + "</p>";
    var brief = typeof e.brief === "string" && e.brief && e.brief !== e.line ? e.brief : "";
    if (brief) {
      out += '<p class="bk-text" tabindex="-1"><span class="bk-b">' + esc(brief) + '</span><span class="bk-f">' +
        esc(e.line) + "</span></p>";
      out += '<p class="bk-detail-row"><button type="button" class="bk-detail-btn">看不太懂？说详细点</button></p>';
    } else {
      out += '<p class="bk-text" tabindex="-1"><span class="bk-f bk-only">' + esc(e.line) + "</span></p>";
    }
    var sum = e.more ? "展开来龙去脉" : (e.for_us ? "展开：对我们、来源" : "来源与核对日期");
    out += '<details class="bk-more-wrap"><summary>' + sum + '</summary><div class="bk-more-body"></div></details>';
    return out + "</article>";
  }

  // 展开区懒加载：第一次打开时才建；锚点定位也调这个
  function buildMore(card, e) {
    var body = card.querySelector(".bk-more-body");
    if (body.dataset.built) return;
    body.dataset.built = "1";
    var html = "";
    if (e.more) html += '<p class="bk-sec"><b class="bk-sec-label">来龙去脉</b>' + esc(e.more) + "</p>";
    if (e.for_us) html += '<p class="bk-sec"><b class="bk-sec-label">对我们</b>' + esc(e.for_us) + "</p>";
    var srcs = [];
    (e.sources || []).forEach(function (s) {
      if (s && typeof s.url === "string" && s.url.indexOf("https://") === 0) {
        srcs.push('<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name) + "</a>");
      } else if (s && s.name) {
        srcs.push("<span>" + esc(s.name) + "</span>");
      }
    });
    if (srcs.length) html += '<p class="an-srcs bk-srcs">' + srcs.join("") + "</p>";
    var seen = (e.seen_in || []).filter(function (id) { return /^kr-[a-z0-9-]+$/.test(id) && TITLES[id]; });
    if (seen.length)
      html += '<p class="bk-seen"><b class="bk-sec-label">出现在</b>' + seen.map(function (id) {
        return '<a class="bk-link" href="kanread.html' + (LOCAL ? "?preview=1" : "") + "#" +
          encodeURIComponent(id) + '">' + esc(TITLES[id]) + "</a>";
      }).join("") + "</p>";
    var rel = (e.related || []).filter(function (id) { return BY_ID[id]; });   // 悬空的跳过
    if (rel.length)
      html += '<p class="bk-rel"><b class="bk-sec-label">相关</b>' + rel.map(function (id) {
        return '<a class="bk-link" href="#' + esc(id) + '">' + esc(BY_ID[id].zh) + "</a>";
      }).join("") + "</p>";
    html += '<p class="an-verified">最后核对 ' + esc(e.last_verified || "") + "</p>";
    body.innerHTML = html;
  }

  document.addEventListener("toggle", function (e) {
    var d = e.target;
    if (d && d.classList && d.classList.contains("bk-more-wrap") && d.open) {
      var card = d.closest(".bk-card");
      if (card && BY_ID[card.id]) buildMore(card, BY_ID[card.id]);
    }
  }, true);

  /* ── 渲染与筛选应用 ── */
  function updateAka(terms) {
    ITEMS.forEach(function (e) {
      var aka = e._node.querySelector(".bk-aka");
      if (!terms.length || everyTerm(e._nm, terms)) { aka.hidden = true; return; }
      var alias = null;
      for (var i = 0; i < e._al.length; i++) {
        if (terms.some(function (t) { return hit(e._al[i], t); })) { alias = e._al[i].raw; break; }
      }
      if (alias) { aka.textContent = "也叫「" + alias + "」"; aka.hidden = false; }
      else aka.hidden = true;
    });
  }

  var countTimer = null, COUNT_FIRST = true;
  function updateCount() {
    var m = ITEMS.filter(function (e) { return e._show; }).length;
    countEl.textContent = (!Q && !hasPicks())
      ? "共 " + ITEMS.length + " 条 · 更新于 " + UPDATED
      : (m ? "找到 " + m + " 条" : "没找到");
  }
  function updateCountSoon() {
    if (COUNT_FIRST) { COUNT_FIRST = false; updateCount(); return; }   // 第一次立即，之后停手 350ms 再播
    clearTimeout(countTimer);
    countTimer = setTimeout(updateCount, 350);
  }

  function starterIds() {
    var ids = STARTERS.filter(function (id) { return BY_ID[id]; });
    if (ids.length < 3) {
      for (var i = 0; i < ITEMS.length && ids.length < 6; i++)
        if ((ITEMS[i].tags || []).indexOf("概念") !== -1 && ids.indexOf(ITEMS[i].id) === -1) ids.push(ITEMS[i].id);
    }
    return ids;
  }

  function updateEmpty(m) {
    if (m > 0) { emptyEl.hidden = true; return; }
    emptyEl.hidden = false;
    var picks = hasPicks();
    if (Q && picks) {
      emptyText.textContent = "没找到「" + Q + "」。小纸条现在收了 " + ITEMS.length +
        " 个词，这个词可能还没收进来；换成英文名、缩写或者别的叫法试试。也可能是标签筛得太窄了。先从这几个基础词看起：";
      emptyReset.textContent = "清空搜索和标签";
      emptyReset.hidden = false;
    } else if (Q) {
      emptyText.textContent = "没找到「" + Q + "」。小纸条现在收了 " + ITEMS.length +
        " 个词，这个词可能还没收进来；换成英文名、缩写或者别的叫法试试。先从这几个基础词看起：";
      emptyReset.hidden = true;
    } else {
      emptyText.textContent = "这几个标签放在一起，还没有词条。";
      emptyReset.textContent = "清除标签";
      emptyReset.hidden = false;
    }
    startersEl.textContent = "";
    if (Q) {
      starterIds().forEach(function (id) {
        var a = document.createElement("a");
        a.className = "bk-link";
        a.setAttribute("href", "#" + id);
        a.textContent = BY_ID[id].zh;
        startersEl.appendChild(a);
      });
    }
  }

  function apply() {
    var terms = termsOf(Q);
    var W = { n: norm(Q), c: compact(Q) };
    var i;
    for (i = 0; i < ITEMS.length; i++) {
      var e = ITEMS[i];
      e._show = tagPass(e) && (!terms.length || everyTerm(e._names.concat(e._tx), terms));
      e._rank = terms.length ? rankOf(e, terms, W) : 0;
    }
    var vis = ITEMS.filter(function (e) { return e._show; });
    if (terms.length) vis.sort(function (a, b) { return a._rank - b._rank || baseCompare(a, b); });
    var sig = (terms.length ? "!" : "|") + vis.map(function (e) { return e.id; }).join(",");
    if (sig !== LAST_SIG) {
      LAST_SIG = sig;
      var frag = document.createDocumentFragment();
      if (!terms.length) {
        var last = null;
        ITEMS.forEach(function (e2) {          // 全部留在 DOM，字母小标题平级插在组首
          if (e2._letter !== last) { last = e2._letter; frag.appendChild(LETTER_NODES[e2._letter]); }
          frag.appendChild(e2._node);
        });
      } else {
        Object.keys(LETTER_NODES).forEach(function (L) { frag.appendChild(LETTER_NODES[L]); });
        vis.forEach(function (e2) { frag.appendChild(e2._node); });
        ITEMS.forEach(function (e2) { if (!e2._show) frag.appendChild(e2._node); });
      }
      listEl.appendChild(frag);   // appendChild 移动既有节点，不重建 DOM
    }
    ITEMS.forEach(function (e2) { e2._node.hidden = !e2._show; });
    Object.keys(LETTER_NODES).forEach(function (L) {
      LETTER_NODES[L].hidden = terms.length > 0 ||
        !ITEMS.some(function (e2) { return e2._letter === L && e2._show; });
    });
    updateAka(terms);
    updateCountSoon();
    updateEmpty(vis.length);
  }

  /* ── URL 读写 ── */
  function writeback(keepHash) {
    try {
      var p = new URLSearchParams(location.search);
      if (Q) p.set("q", Q); else p.delete("q");
      p.delete("tag");
      pickedList().forEach(function (t) { p.append("tag", t); });
      var s = p.toString();
      history.replaceState(history.state, "",
        location.pathname + (s ? "?" + s : "") + (keepHash ? location.hash : ""));
    } catch (_) {}
  }
  var wbTimer = null;
  function writebackSoon() { clearTimeout(wbTimer); wbTimer = setTimeout(function () { writeback(false); }, 400); }

  /* ── 锚点 ── */
  function route() {
    if (!READY) return;
    var id = hashId();
    if (!/^bk-/.test(id)) return;   // 别的 hash 不管、不提示
    var e = BY_ID[id];
    var card = e && e._node;
    if (!card) {
      noticeEl.textContent = "没找到这个词条，可能还没收进小纸条，或者链接写错了。";
      noticeEl.hidden = false;
      try { history.replaceState(history.state, "", location.pathname + location.search); } catch (_) {}
      return;
    }
    if (card.hidden) {
      Q = ""; qEl.value = ""; clearEl.hidden = true;
      PICKED = {}; syncTagsUI();
      apply();
      noticeEl.textContent = "已清空搜索和标签，显示「" + e.zh + "」这一条。";
      noticeEl.hidden = false;
      writeback(true);   // 清掉 q/tag，留住这个 hash
    } else {
      noticeEl.hidden = true;
    }
    var old = listEl.querySelector(".is-target");
    if (old) { old.classList.remove("is-target"); old.querySelector(".bk-here").hidden = true; }
    card.classList.add("is-target");
    card.querySelector(".bk-here").hidden = false;
    buildMore(card, e);
    card.querySelector(".bk-more-wrap").open = true;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "start" });
  }
  window.addEventListener("hashchange", route);

  /* ── 标签栏 ── */
  function syncTagsUI() {
    var tags = tagsEl.querySelectorAll(".bk-tag"), i;
    var n = 0;
    for (i = 0; i < tags.length; i++) {
      var t = tags[i].getAttribute("data-tag");
      var on = !!(PICKED[TAG_TO_GROUP[t] || "其他"] && PICKED[TAG_TO_GROUP[t] || "其他"][t]);
      tags[i].setAttribute("aria-pressed", on ? "true" : "false");
      tags[i].classList.toggle("on", on);
      if (on) n++;
    }
    tagsPicked.textContent = n ? " · 已选 " + n + " 个" : "";
    tagsClear.hidden = !n;
  }

  function buildTags() {
    var inData = {};
    ITEMS.forEach(function (e) { (e.tags || []).forEach(function (t) { inData[t] = true; }); });
    var html = "";
    TAG_GROUPS.forEach(function (g, gi) {
      var tags = g[1].filter(function (t) { return inData[t]; });
      if (!tags.length) return;   // 整组都没有的，这一组不渲染
      html += '<div class="bk-tag-group" role="group" aria-labelledby="bkt-' + gi + '">' +
        '<span class="bk-tag-legend" id="bkt-' + gi + '">' + esc(g[0]) + "</span>" +
        tags.map(function (t) {
          return '<button type="button" class="chip bk-tag" data-tag="' + esc(t) + '" aria-pressed="false">' +
            esc(t) + "</button>";
        }).join("") + "</div>";
    });
    var others = Object.keys(inData).filter(function (t) { return !(t in TAG_TO_GROUP); }).sort();
    if (others.length) {
      html += '<div class="bk-tag-group" role="group" aria-labelledby="bkt-other">' +
        '<span class="bk-tag-legend" id="bkt-other">其他</span>' +
        others.map(function (t) {
          return '<button type="button" class="chip bk-tag" data-tag="' + esc(t) + '" aria-pressed="false">' +
            esc(t) + "</button>";
        }).join("") + "</div>";
    }
    tagsEl.innerHTML = html;
    // 宽屏默认展开，手机收起
    if (window.matchMedia && matchMedia("(min-width:761px)").matches) tagsWrap.open = true;
  }

  tagsEl.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".bk-tag") : null;
    if (!b) return;
    var t = b.getAttribute("data-tag");
    var g = TAG_TO_GROUP[t] || "其他";
    PICKED[g] = PICKED[g] || {};
    if (PICKED[g][t]) delete PICKED[g][t]; else PICKED[g][t] = true;
    if (!Object.keys(PICKED[g]).length) delete PICKED[g];
    syncTagsUI();
    apply();
    writebackSoon();
  });
  tagsClear.addEventListener("click", function () {
    PICKED = {};
    syncTagsUI();
    apply();
    writebackSoon();
    tagsWrap.querySelector("summary").focus();
  });

  /* ── 搜索框 ── */
  var rafPending = false;
  function applyQuery() {
    Q = qEl.value.slice(0, 64);
    clearEl.hidden = !Q;
    apply();
    writebackSoon();
  }
  qEl.addEventListener("input", function (e) {
    if (COMPOSING || e.isComposing) return;   // 输入法拼到一半不筛
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; applyQuery(); });
  });
  qEl.addEventListener("compositionstart", function () { COMPOSING = true; });
  qEl.addEventListener("compositionend", function () { COMPOSING = false; applyQuery(); });
  qEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { qEl.blur(); }
    else if (e.key === "Escape" && Q) { qEl.value = ""; applyQuery(); }
  });
  clearEl.addEventListener("click", function () {
    qEl.value = "";
    applyQuery();
    qEl.focus();
  });
  emptyReset.addEventListener("click", function () {
    qEl.value = ""; Q = ""; clearEl.hidden = true;
    PICKED = {}; syncTagsUI();
    apply();
    writebackSoon();
    qEl.focus();
  });

  // 卡片里的事件：说详细点 / 同 hash 的锚点链接
  listEl.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".bk-detail-btn") : null;
    if (b) {
      var card = b.closest(".bk-card");
      card.classList.add("is-full");
      card.querySelector(".bk-text").focus();
      return;
    }
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#bk-"]') : null;
    if (a && a.hash === location.hash) { e.preventDefault(); route(); }
  });

  /* ── 加载 ── */
  function getJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  var VALID_ID = /^bk-[a-z0-9-]+$/;
  function sanitize(e) {
    if (!e || !VALID_ID.test(e.id)) return null;
    if (typeof e.zh !== "string" || !e.zh.trim()) return null;
    if (typeof e.line !== "string") return null;
    return e;
  }

  Promise.all([
    getJson("data/ainotes.json"),
    getJson("data/kanread.json").catch(function () { return null; }),   // 取不到则「出现在」整行不显示
    LOCAL ? getJson("data/ainotes.drafts.json").catch(function () { return null; }) : Promise.resolve(null)
  ]).then(function (rs) {
    var data = rs[0];
    UPDATED = data.updated_at || "";
    ((rs[1] && rs[1].items) || []).forEach(function (it) {
      if (it.status !== "draft") TITLES[it.id] = it.title;
    });
    var entries = [];
    ((data && data.items) || []).forEach(function (e) {
      if (e.status === "draft") return;
      e = sanitize(e);
      if (e) entries.push(e);
    });
    ((rs[2] && rs[2].items) || []).forEach(function (e) {
      e = sanitize(e);
      if (!e) return;
      if (entries.some(function (x) { return x.id === e.id; })) return;   // 公开优先，重名草稿跳过
      e._draft = true;
      entries.push(e);
    });
    entries.forEach(prepEntry);
    entries.sort(baseCompare);
    ITEMS = entries;
    ITEMS.forEach(function (e) { BY_ID[e.id] = e; });

    if (!ITEMS.length) {
      listEl.innerHTML = '<p class="log-state">第一批词条还在写。</p>';
      return;
    }
    // 一次性拼出全部卡片与字母小标题
    var html = "", last = null;
    ITEMS.forEach(function (e) {
      if (e._letter !== last) {
        last = e._letter;
        html += '<h3 class="kr-month-head bk-letter" id="bkg-' + e._letter + '" data-letter="' + e._letter + '">' +
          e._letter + "</h3>";
      }
      html += cardHtml(e);
    });
    listEl.innerHTML = html;
    ITEMS.forEach(function (e) { e._node = document.getElementById(e.id); });
    listEl.querySelectorAll(".bk-letter").forEach(function (n) {
      LETTER_NODES[n.getAttribute("data-letter")] = n;
    });
    buildTags();
    // URL 参数：q 填进搜索框；tag 选中认识的
    try {
      var p = new URLSearchParams(location.search);
      var q0 = p.get("q");
      if (q0) { qEl.value = q0.slice(0, 64); Q = qEl.value; clearEl.hidden = !Q; }
      p.getAll("tag").forEach(function (t) {
        var g = TAG_TO_GROUP[t];
        if (!g) return;   // 不认识的忽略
        PICKED[g] = PICKED[g] || {};
        PICKED[g][t] = true;
      });
    } catch (_) {}
    syncTagsUI();
    FULL = storedMode() === "full";
    syncModeUI();
    apply();
    READY = true;
    route();
  }).catch(function () {
    listEl.innerHTML = '<p class="log-state">小纸条暂时读不出来，稍后再来。</p>';
  });
})();
