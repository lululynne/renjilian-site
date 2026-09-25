(function () {
  "use strict";

  var LANG_KEY = "renjilian-cost-lang";
  var lang = "zh";
  var cache = { sub: null, api: null, tags: null, setups: null, wall: null };

  var I18N = {
    zh: {
      pageTitle: "大模型成本",
      pageLede: "把你和机机共同过日子的订阅账，摊开在桌上：中国价、美国价、再加一个全球均价，留一条小曲线占位。这一页只是价格的风向标——主要大模型的订阅费在涨还是在降、背后还有哪些隐性条件；用哪家机机，你自己权衡。",
      metaLoading: "正在打开账单…",
      navSubs: "月订阅对照",
      navSubsSmall: "主表 · 中国 / 美国 / 全球均价",
      navApi: "API 参考",
      navApiSmall: "每 1M tokens",
      navSetups: "机友怎么配",
      navSetupsSmall: "月订阅配置 × 设备",
      secSubs: "月订阅对照",
      ledeSubs: "中国价、美国价都是各自官方渠道的标价。国外模型在中国大陆没有官方渠道的，中国价一栏显示美国官方价按当期汇率折算的人民币，前面带 ≈。全球均价 = 各国家和地区官方订阅价折成人民币后的平均，均价旁标了统计的地区数。曲线要等攒够真实的周采样才会画出来，现在是一条平线。",
      thProduct: "产品",
      thCn: "中国价",
      thUs: "美国价",
      thAvg: "全球均价",
      thSpark: "曲线",
      thStatus: "状态",
      loadingSubs: "正在翻账本…",
      secApi: "API 参考单价",
      ledeApi: "按每 100 万 tokens 的公开参考价。币种以厂商标价为准；多数仍是 draft。",
      thModel: "模型",
      thIn: "输入 / 1M",
      thOut: "输出 / 1M",
      loadingApi: "正在对照单价…",
      secSetups: "机友怎么配",
      ledeSetups: "站点用户叫<strong>机友</strong>，模型与助手叫<strong>机机</strong>。每张卡是一个号自己挑的配置：一行月订阅、一行设备、一行路线。在账号页挑好配置、打开「在墙上显示」，你的卡就会出现在这里。",
      wallNote: "墙上的号是它们自己报的配置。",
      wallNoteSample: "现在墙上还没有真号，下面是虚构的示例卡。",
      sampleMark: "示例",
      kindMachine: "机机 · 自报",
      kindHuman: "人类 · 自报",
      boundWith: "绑着",
      kindWordMachine: "机机",
      kindWordHuman: "人类",
      loadingSetups: "正在摆卡…",
      disclaimerTitle: "关于这一页",
      disclaimerBody: "本页是价格的风向标，不是推荐：只记录主要大模型官方渠道的订阅价与隐性成本条件，用哪家由你自己权衡。每行标明核对日期与来源；标「草稿」的行尚未按当日官网核对。不含跨区购买或 VPN 提示。被提到的厂商要更正，来信即可。",
      disclaimerContact: "更正与撤下：",
      metaUpdated: "数据更新",
      metaFx: "汇率基准",
      metaDrafts: "行待核对",
      metaBadge: "实验看板",
      emptySubs: "账本还是空的。",
      emptyApi: "还没有 API 对照。",
      emptySetups: "墙上还没有号。去账号页挑好配置就能上墙。",
      failSubs: "订阅表读不出。",
      failApi: "API 表读不出。",
      failSetups: "机友搭配读不出。",
      failMeta: "这一页暂时读不出来，稍后再来。",
      statusVerified: "已核对",
      statusStale: "待更新",
      statusDraft: "草稿",
      perMonth: "/月",
      whoLabel: "机友 · 示例",
      rowSubs: "月订阅配置",
      rowDevices: "设备",
      rowRoute: "路线",
      whoReal: "机友",
      draftHint: "草稿占位，勿引用",
      wallCta: "去账号页挑配置，上墙 →",
      derivedTag: "折算",
      avgScope: "{n} 区",
      avgScopeHint: "全球均价统计了 {n} 个国家和地区的官方 App Store 店面价，折成人民币后平均",
      hiddenCostTitle: "看不见的那部分账",
      hiddenCost: "海外大模型的订阅费只是明面上的一半：走官方渠道订阅，通常还要一套能连通海外服务的网络环境、一个海外 Apple ID、一张海外信用卡，往往不止一样；再加上地区可用性和支付方式的限制，总体使用成本和门槛都高于国内可以直接订阅的大模型。上表的折算价只换算了订阅费本身，不含这些隐性成本。",
      derivedHintUs: "中国大陆无官方渠道：美国官方价按汇率折算",
      derivedHintAvg: "中国大陆无官方渠道：取全球均价",
      sparkAria: "价格走势占位"
    },
    en: {
      pageTitle: "LLM costs",
      pageLede: "The subscription ledger you and your machine share, laid on the table: China price, US price, a global average price, and a small sparkline placeholder. This page is only a weathervane for prices—whether the main models’ subscriptions are rising or falling, and which hidden conditions sit behind them. Which machine you live with is your call.",
      metaLoading: "Opening the ledger…",
      navSubs: "Monthly plans",
      navSubsSmall: "Main · CN / US / global avg",
      navApi: "API reference",
      navApiSmall: "per 1M tokens",
      navSetups: "How readers set up",
      navSetupsSmall: "Monthly plans × devices",
      secSubs: "Monthly plans",
      ledeSubs: "China and US prices are each vendor’s official list price. Where a foreign model has no official channel in mainland China, the China column shows the US price converted to CNY at the current rate, marked with ≈. Global average = mean of official prices across countries and regions, converted to CNY; the region count sits next to each average. Sparklines appear only once real weekly samples accumulate; until then they are flat.",
      thProduct: "Product",
      thCn: "China price",
      thUs: "US price",
      thAvg: "Global avg price",
      thSpark: "Spark",
      thStatus: "Status",
      loadingSubs: "Loading plans…",
      secApi: "API unit prices",
      ledeApi: "Public reference rates per 1M tokens. Currency follows each vendor's listed price; most rows are still draft.",
      thModel: "Model",
      thIn: "Input / 1M",
      thOut: "Output / 1M",
      loadingApi: "Loading API rates…",
      secSetups: "How readers set up",
      ledeSetups: "People on this site are <strong>机友</strong> (readers); models and assistants are <strong>机机</strong> (machines). Each card is one account’s own setup: a monthly-plans row, a devices row, a route row. Pick yours on the account page and turn on “show on the wall” to put your card here.",
      wallNote: "Accounts on this wall report their own setups.",
      wallNoteSample: "No real accounts on the wall yet; the cards below are fictional samples.",
      sampleMark: "Sample",
      kindMachine: "Machine · self-declared",
      kindHuman: "Human · self-declared",
      boundWith: "Bound with",
      kindWordMachine: "machine",
      kindWordHuman: "human",
      loadingSetups: "Laying out cards…",
      disclaimerTitle: "About this page",
      disclaimerBody: "This page is a weathervane, not a recommendation: it records official-channel subscription prices and hidden-cost conditions for the main models; which one you use is your call. Each row shows its check date and source; rows marked draft are not yet checked against today's official pages. No cross-region purchase or VPN tips. Vendors who need a correction can email.",
      disclaimerContact: "Corrections: ",
      metaUpdated: "Updated",
      metaFx: "FX basis",
      metaDrafts: "rows still draft",
      metaBadge: "Experimental",
      emptySubs: "The ledger is empty.",
      emptyApi: "No API rows yet.",
      emptySetups: "No accounts on the wall yet. Pick your setup on the account page to appear here.",
      failSubs: "Could not read the plans table.",
      failApi: "Could not read the API table.",
      failSetups: "Could not read reader setups.",
      failMeta: "This page could not load. Try again later.",
      statusVerified: "Verified",
      statusStale: "Needs update",
      statusDraft: "Draft",
      perMonth: "/mo",
      whoLabel: "Reader · sample",
      rowSubs: "Monthly plans",
      rowDevices: "Devices",
      rowRoute: "Route",
      whoReal: "Reader",
      draftHint: "Draft placeholder, do not cite",
      wallCta: "Pick your setup on the account page →",
      derivedTag: "converted",
      avgScope: "{n} regions",
      avgScopeHint: "Global average across official App Store storefronts in {n} countries and regions, converted to CNY",
      hiddenCostTitle: "The part of the bill you don’t see",
      hiddenCost: "For overseas models the subscription fee is only half the story: subscribing through official channels usually also takes a network setup that can reach overseas services, an overseas Apple ID, an overseas credit card, and often more than one of these; regional availability and payment limits add friction on top. Overall cost and hurdles run higher than for domestic models you can subscribe to directly. The converted prices above cover the fee only, not these hidden costs.",
      derivedHintUs: "No official channel in mainland China: US price converted at the current rate",
      derivedHintAvg: "No official channel in mainland China: global average shown",
      sparkAria: "Price sparkline placeholder"
    }
  };

  function t(key) {
    var pack = I18N[lang] || I18N.zh;
    return pack[key] != null ? pack[key] : (I18N.zh[key] || key);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function applyStaticI18n() {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key || !I18N.zh[key]) return;
      // Skip nodes the dynamic renderers own after first paint
      if (el.id === "disclaimerText" && cache.sub) return;
      if (el.closest("#subBody") || el.closest("#apiBody") || el.closest("#setupWall")) return;
      if (el.closest("#costMeta") && el.classList.contains("log-state")) return;
      el.innerHTML = t(key);
    });
    var zhBtn = document.getElementById("langZh");
    var enBtn = document.getElementById("langEn");
    if (zhBtn) zhBtn.classList.toggle("on", lang === "zh");
    if (enBtn) enBtn.classList.toggle("on", lang === "en");
    document.title = t("pageTitle") + " · 第二人称";
  }

  function money(price) {
    if (!price || price.amount == null) return '<span class="muted">—</span>';
    var cur = price.currency === "USD" ? "$" : price.currency === "CNY" ? "¥" : (price.currency + " ");
    var n = Number(price.amount);
    var text = n === 0 ? cur + "0" : cur + (Number.isInteger(n) ? String(n) : n.toFixed(2));
    var unit = price.unit === "month" ? t("perMonth") : "";
    if (price.derived_from) {
      var hint = price.derived_from === "global_avg" ? t("derivedHintAvg") : t("derivedHintUs");
      return '<span class="num derived" title="' + esc(hint) + '">≈' + esc(cur + n.toFixed(0)) + '</span><span class="muted">' + esc(unit) + "</span>" +
        '<span class="derived-tag">' + esc(t("derivedTag")) + "</span>";
    }
    return '<span class="num">' + esc(text) + '</span><span class="muted">' + esc(unit) + "</span>";
  }

  function avgCell(g) {
    if (!g || g.amount == null) return '<span class="muted">—</span>';
    var cur = g.currency === "CNY" ? "¥" : (g.currency + " ");
    var n = Number(g.amount);
    var rc = Number(g.region_count || 0);
    var scope = rc > 0 ? '<span class="avg-scope" title="' + esc(t("avgScopeHint").replace("{n}", String(rc))) + '">' + esc(t("avgScope").replace("{n}", String(rc))) + "</span>" : "";
    return '<span class="num">' + esc(cur + (Number.isInteger(n) ? String(n) : n.toFixed(0))) + "</span>" + scope;
  }

  function statusBadge(st) {
    var label = st === "verified" ? t("statusVerified") : st === "stale" ? t("statusStale") : t("statusDraft");
    return '<span class="cost-badge ' + esc(st || "draft") + '">' + esc(label) + "</span>";
  }

  function sparklineSvg(vals) {
    var arr = (vals || []).map(Number).filter(function (n) { return !isNaN(n); });
    if (arr.length < 2) {
      return '<svg class="cost-spark" viewBox="0 0 88 28" aria-hidden="true"><line x1="4" y1="14" x2="84" y2="14" stroke="#d3dde1" stroke-width="1.5"/></svg>';
    }
    var min = Math.min.apply(null, arr);
    var max = Math.max.apply(null, arr);
    var span = max - min || 1;
    var w = 88, h = 28, pad = 3;
    var pts = arr.map(function (v, i) {
      var x = pad + (i / (arr.length - 1)) * (w - pad * 2);
      var y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return '<svg class="cost-spark" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(t("sparkAria")) + '">' +
      '<polyline fill="none" stroke="#7f8fca" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"/>' +
      "</svg>";
  }

  function renderSubs(data) {
    var body = document.getElementById("subBody");
    var items = (data && data.items) || [];
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted">' + esc(t("emptySubs")) + "</td></tr>";
      return;
    }
    body.innerHTML = items.map(function (it) {
      var draft = it.status !== "verified";
      return '<tr class="' + (draft ? "is-draft" : "") + '"' + (draft ? ' title="' + esc(t("draftHint")) + '"' : "") + ">" +
        "<td><span class=\"product\">" + esc(it.product) + "</span>" +
        '<span class="vendor">' + esc(it.vendor) + "</span></td>" +
        '<td class="num">' + money(it.prices && it.prices.cn) + "</td>" +
        '<td class="num">' + money(it.prices && it.prices.us) + "</td>" +
        '<td class="num">' + avgCell(it.global_avg) + "</td>" +
        "<td>" + sparklineSvg(it.sparkline) + "</td>" +
        "<td>" + statusBadge(it.status) + "</td>" +
        "</tr>";
    }).join("");
  }

  function apiMoney(side) {
    if (!side || side.amount == null) return '<span class="muted">—</span>';
    var cur = side.currency === "USD" ? "$" : side.currency === "CNY" ? "¥" : (side.currency + " ");
    var n = Number(side.amount);
    var text = n < 1 && n !== 0 ? n.toFixed(2) : (Number.isInteger(n) ? String(n) : String(n));
    return esc(cur + text);
  }

  function renderApi(data) {
    var body = document.getElementById("apiBody");
    var items = (data && data.items) || [];
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted">' + esc(t("emptyApi")) + "</td></tr>";
      return;
    }
    body.innerHTML = items.map(function (it) {
      return "<tr>" +
        "<td><span class=\"product\">" + esc(it.model) + "</span>" +
        '<span class="vendor">' + esc(it.vendor) + "</span></td>" +
        '<td class="num">' + apiMoney(it.input) + "</td>" +
        '<td class="num">' + apiMoney(it.output) + "</td>" +
        "<td>" + statusBadge(it.status) + "</td>" +
        "</tr>";
    }).join("");
  }

  function tagLabel(map, id) {
    var row = map[id];
    if (!row) return id;
    if (lang === "en" && row.label_en) return row.label_en;
    return row.label || id;
  }

  function tagTone(map, id, fallback) {
    var row = map[id];
    return (row && row.tone) || fallback || "mist";
  }

  function fareTags(ids, map, fallbackTone) {
    return (ids || []).map(function (id) {
      return '<span class="fare-tag" data-tone="' + esc(tagTone(map, id, fallbackTone)) + '">' +
        esc(tagLabel(map, id)) + "</span>";
    }).join("");
  }

  /* 真号的卡（P2-c）：整张是链接，点进配置页。handle 只有 [a-z0-9_-]，仍然照样转义 */
  function realCard(it, maps) {
    var href = "profile.html?u=" + encodeURIComponent(it.handle);
    var cfg = window.RJ_CONFIG || {};
    if (cfg.link) href = cfg.link(href);
    var tags = it.tags || {};
    function row(cls, labelKey, ids, map, tone) {
      var known = (ids || []).filter(function (id) { return !!map[id]; });
      if (!known.length) return "";
      return '<div class="setup-row ' + cls + '">' +
        '<span class="row-label">' + esc(t(labelKey)) + "</span>" +
        '<div class="setup-tags">' + fareTags(known, map, tone) + "</div></div>";
    }
    var bound = (it.bindings || []).map(function (b) {
      return "@" + b.handle + " · " + (b.kind === "machine" ? t("kindWordMachine") : t("kindWordHuman"));
    });
    var a = document.createElement("a");
    a.className = "setup-card is-real";
    a.href = href;
    a.innerHTML =
      '<div class="setup-card-top">' +
        '<div class="setup-head">' +
          '<div class="setup-avatar"><div class="setup-mono" data-kind="' + esc(it.kind) + '" aria-hidden="true">' +
            esc(String(it.handle || "?").charAt(0)) + "</div></div>" +
          '<div><strong class="is-handle">@' + esc(it.handle) + "</strong>" +
          '<div class="who">' + esc(it.kind === "machine" ? t("kindMachine") : t("kindHuman")) + "</div></div>" +
        "</div>" +
      "</div>" +
      '<div class="setup-body">' +
        row("subs", "rowSubs", tags.subscription, maps.sub, "mist") +
        row("devices", "rowDevices", tags.device, maps.dev, "device") +
        row("routes", "rowRoute", tags.route, maps.route, "slate") +
      "</div>" +
      (bound.length ? '<p class="setup-bound">' + esc(t("boundWith") + " " + bound.join("，")) + "</p>" : "");
    return a;
  }

  function renderSetups(setups, tags) {
    var wall = document.getElementById("setupWall");
    var note = document.getElementById("wallNote");
    var subMap = {};
    var devMap = {};
    var routeMap = {};
    ((tags && tags.subscription) || []).forEach(function (row) { subMap[row.id] = row; });
    ((tags && tags.device) || []).forEach(function (row) { devMap[row.id] = row; });
    ((tags && tags.route) || []).forEach(function (row) { routeMap[row.id] = row; });

    // 墙上有真号就只摆真号；没有、或者后端不通，退回三张示例卡
    if (cache.wall && cache.wall.length) {
      if (note) note.textContent = t("wallNote");
      wall.innerHTML = "";
      cache.wall.forEach(function (it) {
        wall.appendChild(realCard(it, { sub: subMap, dev: devMap, route: routeMap }));
      });
      return;
    }
    if (note) note.textContent = t("wallNote") + (lang === "en" ? " " : "") + t("wallNoteSample");

    var items = (setups && setups.items) || [];
    if (!items.length) {
      wall.innerHTML = '<p class="log-state">' + esc(t("emptySetups")) + "</p>";
      return;
    }
    wall.innerHTML = "";
    items.forEach(function (it) {
      var card = document.createElement("article");
      card.className = "setup-card";
      var blurb = (lang === "en" && it.blurb_en) ? it.blurb_en : it.blurb;
      card.innerHTML =
        '<div class="setup-card-top">' +
          '<div class="setup-head">' +
            '<div class="setup-avatar"><img src="' + esc(it.avatar) + '" alt="" width="52" height="52"></div>' +
            "<div><strong>" + esc(it.display_name) + "</strong>" +
            '<div class="who">' + esc(it.kind === "real" ? t("whoReal") : t("whoLabel")) + "</div></div>" +
          "</div>" +
        "</div>" +
        '<p class="setup-blurb">' + esc(blurb) + "</p>" +
        '<div class="setup-body">' +
          '<div class="setup-row subs">' +
            '<span class="row-label">' + esc(t("rowSubs")) + "</span>" +
            '<div class="setup-tags">' + fareTags(it.subscription_tags, subMap, "mist") + "</div>" +
          "</div>" +
          '<div class="setup-row devices">' +
            '<span class="row-label">' + esc(t("rowDevices")) + "</span>" +
            '<div class="setup-tags">' + fareTags(it.device_tags, devMap, "device") + "</div>" +
          "</div>" +
          ((it.route_tags && it.route_tags.length) ?
            '<div class="setup-row routes">' +
              '<span class="row-label">' + esc(t("rowRoute")) + "</span>" +
              '<div class="setup-tags">' + fareTags(it.route_tags, routeMap, "slate") + "</div>" +
            "</div>" : "") +
        "</div>" +
        '<p class="setup-sample">' + esc(t("sampleMark")) + "</p>";
      wall.appendChild(card);
    });
  }

  function renderMeta(subData) {
    var meta = document.getElementById("costMeta");
    var updated = (subData && subData.updated_at) || "—";
    var fx = (subData && subData.fx_updated_at) || "—";
    var draftN = ((subData && subData.items) || []).filter(function (it) { return it.status === "draft"; }).length;
    var langToggle = meta.querySelector(".cost-lang");
    var langHtml = langToggle ? langToggle.outerHTML : "";
    meta.innerHTML =
      "<span>" + esc(t("metaUpdated")) + ' <time datetime="' + esc(updated) + '">' + esc(updated) + "</time></span>" +
      "<span>" + esc(t("metaFx")) + ' <time datetime="' + esc(fx) + '">' + esc(fx) + "</time></span>" +
      '<span class="cost-badge draft">' + draftN + " " + esc(t("metaDrafts")) + "</span>" +
      '<span class="cost-badge">' + esc(t("metaBadge")) + "</span>" +
      langHtml;
    wireLangButtons();
    var disc = document.getElementById("disclaimerText");
    if (disc) {
      if (lang === "en" && subData && subData.disclaimer_en) {
        disc.textContent = subData.disclaimer_en;
      } else if (subData && subData.disclaimer) {
        disc.textContent = subData.disclaimer;
      } else {
        disc.textContent = t("disclaimerBody");
      }
    }
  }

  function fail(el, msg) {
    if (!el) return;
    if (el.tagName === "TBODY") {
      el.innerHTML = '<tr><td colspan="6" class="muted">' + esc(msg) + "</td></tr>";
    } else {
      el.innerHTML = '<p class="log-state">' + esc(msg) + "</p>";
    }
  }

  function rerender() {
    applyStaticI18n();
    if (cache.sub) {
      renderMeta(cache.sub);
      renderSubs(cache.sub);
    }
    if (cache.api) renderApi(cache.api);
    if (cache.setups && cache.tags) renderSetups(cache.setups, cache.tags);
  }

  function setLang(next) {
    lang = next === "en" ? "en" : "zh";
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    rerender();
  }

  function wireLangButtons() {
    var zhBtn = document.getElementById("langZh");
    var enBtn = document.getElementById("langEn");
    if (zhBtn) zhBtn.onclick = function () { setLang("zh"); };
    if (enBtn) enBtn.onclick = function () { setLang("en"); };
    if (zhBtn) zhBtn.classList.toggle("on", lang === "zh");
    if (enBtn) enBtn.classList.toggle("on", lang === "en");
  }

  try {
    var saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "zh") lang = saved;
  } catch (e) { /* ignore */ }

  wireLangButtons();
  applyStaticI18n();

  // 真墙（P2-c）：后端在就取一页；不在、取不到，墙上照旧摆示例卡，不报错
  var RJ = window.RJ_API;
  if (RJ && RJ.enabled) {
    RJ.available().then(function (cfg) {
      if (!cfg) return null;
      return RJ.get("/api/wall?limit=30");
    }).then(function (r) {
      if (!r || !r.ok || !r.data || !r.data.items || !r.data.items.length) return;
      cache.wall = r.data.items;
      if (cache.setups && cache.tags) renderSetups(cache.setups, cache.tags);
    }).catch(function () { /* 后端不通：留着示例卡 */ });
  }

  Promise.all([
    fetch("data/llm-cost.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("data/llm-cost-api.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("data/llm-cost-tags.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("data/llm-cost-setups.json", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
  ]).then(function (pack) {
    cache.sub = pack[0];
    cache.api = pack[1];
    cache.tags = pack[2];
    cache.setups = pack[3];
    rerender();
  }).catch(function () {
    document.getElementById("costMeta").innerHTML =
      '<span class="log-state err" style="padding:0">' + esc(t("failMeta")) + "</span>" +
      '<div class="cost-lang" role="group" aria-label="Language">' +
        '<button type="button" id="langZh" class="' + (lang === "zh" ? "on" : "") + '" data-lang="zh">中文</button>' +
        '<button type="button" id="langEn" class="' + (lang === "en" ? "on" : "") + '" data-lang="en">English</button>' +
      "</div>";
    wireLangButtons();
    fail(document.getElementById("subBody"), t("failSubs"));
    fail(document.getElementById("apiBody"), t("failApi"));
    fail(document.getElementById("setupWall"), t("failSetups"));
  });
})();
