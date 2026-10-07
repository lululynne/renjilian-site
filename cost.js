(function () {
  "use strict";

  var LANG_KEY = "renjilian-cost-lang";
  var CALC_KEY = "renjilian-cost-calc-v1";
  var lang = "zh";
  var calc = { region: "cn", selected: [],
    manual: { cn: Object.create(null), us: Object.create(null) },
    draft: { cn: Object.create(null), us: Object.create(null) },
    invalid: { cn: Object.create(null), us: Object.create(null) } };
  var cache = {
    sub: null, api: null, tags: null, setups: null, wall: null,
    wallCursor: null, wallLoading: false, wallError: false, wallExhausted: false
  };

  var I18N = {
    zh: {
      pageTitle: "大模型成本",
      pageLede: "把你和机机共同过日子的订阅账，摊开在桌上：中国价、美国价、再加一个全球均价，留一条小曲线占位。这一页只是价格的风向标——主要大模型的订阅费在涨还是在降、背后还有哪些隐性条件；用哪家机机，你自己权衡。",
      metaLoading: "正在打开账单…",
      navSubs: "月订阅对照",
      navSubsSmall: "主表 · 中国 / 美国 / 全球均价",
      navCalc: "配一配",
      navCalcSmall: "把几档订阅放在一起算",
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
      secCalc: "配一配",
      ledeCalc: "挑几档订阅，看看一个月大约要留多少。只把同档同周期、已核过的价格算进去；缺价的档可以填你实际每次扣款的金额。试算只留在当前浏览器。",
      calcPickTitle: "挑订阅",
      calcLoading: "正在摆订阅票根…",
      calcReceiptTitle: "你的试算",
      calcRegionLabel: "试算币种",
      calcFootnote: "这是按页面已核标价和你自行填入的金额作的试算，不是实际账单；年费和季费按 12／3 个月摊开。设备、API 用量和全球均价不计入。",
      calcEmpty: "还没选订阅。",
      calcTotal: "月均试算",
      calcCounted: "已计入部分",
      calcUnpriced: "另 {n} 档待核价",
      calcNoPrice: "暂无可核价",
      calcDerived: "含汇率折算，不是中国大陆官方售价",
      calcManualLabel: "我每次实际付（{period}，{currency}）",
      calcMonthly: "月费总额",
      calcQuarterly: "季费总额",
      calcYearly: "年费总额",
      calcCurrencyCn: "人民币",
      calcCurrencyUs: "美元",
      calcQuote: "已核标价 {amount}／月 · {date}",
      calcQuoteDerived: "已核来源价按汇率折算 {amount}／月 · {date}",
      calcSource: "来源",
      calcNoQuote: "这档没有同周期已核价，填实际扣款额才会计入。",
      calcMyPrice: "你填的每{period}实付 {amount}，已折成月均",
      calcBadAmount: "金额填 0 到 1000000，最多两位小数；这档暂未计入。",
      calcCopy: "复制试算",
      calcReset: "清空",
      calcCopied: "已复制这份试算。",
      calcCopyFail: "复制失败，可以直接选中上面的文字。",
      secApi: "API 参考单价",
      ledeApi: "按每 100 万 tokens 的公开参考价。币种以厂商标价为准；多数仍是 draft。",
      thModel: "模型",
      thIn: "输入 / 1M",
      thOut: "输出 / 1M",
      loadingApi: "正在对照单价…",
      secSetups: "机友怎么配",
      ledeSetups: "站点用户叫<strong>机友</strong>，模型与助手叫<strong>机机</strong>。每张卡是一个号自己挑的配置：一行月订阅、一行设备、一行路线。在账号页挑好配置、打开「在墙上显示」，你的卡就会出现在这里。",
      wallCostNote: "卡片月费沿用上方试算的币种，只按已核价的同档订阅估算；缺价的档会单独数出来，不会当成零。卡片是本人自报配置，不代表真实扣款。",
      wallCostLabel: "月费标价估算",
      wallNote: "墙上的号是它们自己报的配置。",
      wallNoteSample: "现在墙上还没有真号，下面是虚构的示例卡。",
      wallMore: "再看 30 张",
      wallLoadingMore: "正在取下一页…",
      wallMoreFail: "下一页没取到。已加载的卡还在，可以重试。",
      wallEnd: "已经到底了。",
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
      wallCtaGuest: "没号？注册后挑好配置就能上墙 →",
      derivedTag: "折算",
      avgScope: "{n} 区",
      avgScopeHint: "全球均价统计了 {n} 个国家和地区的官方 App Store 店面价，折成人民币后平均",
      hiddenCostTitle: "看不见的那部分账",
      hiddenCost: "海外大模型的订阅费只是明面上的一半：走官方渠道订阅，通常还要一套能连通海外服务的网络环境、一个海外 Apple ID、一张海外信用卡，往往不止一样；再加上地区可用性和支付方式的限制，总体使用成本和门槛都高于国内可以直接订阅的大模型。上表的折算价只换算了订阅费本身，不含这些隐性成本。",
      derivedHintUs: "中国大陆无官方渠道：美国官方价按汇率折算",
      derivedHintAvg: "中国大陆无官方渠道：取全球均价",
      sparkAria: "价格走势占位",
      related: "相关"
    },
    en: {
      pageTitle: "LLM costs",
      pageLede: "The subscription ledger you and your machine share, laid on the table: China price, US price, a global average price, and a small sparkline placeholder. This page is only a weathervane for prices—whether the main models’ subscriptions are rising or falling, and which hidden conditions sit behind them. Which machine you live with is your call.",
      metaLoading: "Opening the ledger…",
      navSubs: "Monthly plans",
      navSubsSmall: "Main · CN / US / global avg",
      navCalc: "Mix a setup",
      navCalcSmall: "Add plans and see a monthly estimate",
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
      secCalc: "Mix a setup",
      ledeCalc: "Pick plans to estimate a month together. Only exact plans with checked prices are counted; you can enter what you actually pay for the others. This draft stays in this browser.",
      calcPickTitle: "Pick plans",
      calcLoading: "Laying out plans…",
      calcReceiptTitle: "Your estimate",
      calcRegionLabel: "Estimate currency",
      calcFootnote: "This uses checked list prices and amounts you enter, not your actual bill. Annual and quarterly payments are spread over 12 or 3 months. Devices, API usage and global averages are excluded.",
      calcEmpty: "No plans picked yet.",
      calcTotal: "Estimated per month",
      calcCounted: "Counted so far",
      calcUnpriced: "{n} plan(s) still unpriced",
      calcNoPrice: "No checked price yet",
      calcDerived: "Includes FX conversion; not an official mainland China price",
      calcManualLabel: "What you pay each {period} ({currency})",
      calcMonthly: "month",
      calcQuarterly: "quarter",
      calcYearly: "year",
      calcCurrencyCn: "CNY",
      calcCurrencyUs: "USD",
      calcQuote: "Checked list price {amount}/mo · {date}",
      calcQuoteDerived: "Checked source price converted by FX {amount}/mo · {date}",
      calcSource: "Source",
      calcNoQuote: "No checked price for this exact plan and period. Enter your payment to count it.",
      calcMyPrice: "Your {amount} payment each {period}, shown as a monthly equivalent",
      calcBadAmount: "Use 0 to 1000000 with up to two decimals. This plan is not counted yet.",
      calcCopy: "Copy estimate",
      calcReset: "Clear",
      calcCopied: "Estimate copied.",
      calcCopyFail: "Could not copy; you can select the text above.",
      secApi: "API unit prices",
      ledeApi: "Public reference rates per 1M tokens. Currency follows each vendor's listed price; most rows are still draft.",
      thModel: "Model",
      thIn: "Input / 1M",
      thOut: "Output / 1M",
      loadingApi: "Loading API rates…",
      secSetups: "How readers set up",
      ledeSetups: "People on this site are <strong>机友</strong> (readers); models and assistants are <strong>机机</strong> (machines). Each card is one account’s own setup: a monthly-plans row, a devices row, a route row. Pick yours on the account page and turn on “show on the wall” to put your card here.",
      wallCostNote: "Card costs follow the currency selected in the calculator above and use only checked list prices for exact plans. Unpriced plans are counted separately, never treated as zero. Setups are self-reported, not actual charges.",
      wallCostLabel: "List-price estimate per month",
      wallNote: "Accounts on this wall report their own setups.",
      wallNoteSample: "No real accounts on the wall yet; the cards below are fictional samples.",
      wallMore: "See 30 more",
      wallLoadingMore: "Loading the next page…",
      wallMoreFail: "Could not load the next page. Your loaded cards are still here; try again.",
      wallEnd: "You’ve reached the end.",
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
      wallCtaGuest: "No account? Sign up, pick your setup, and you’re on the wall →",
      derivedTag: "converted",
      avgScope: "{n} regions",
      avgScopeHint: "Global average across official App Store storefronts in {n} countries and regions, converted to CNY",
      hiddenCostTitle: "The part of the bill you don’t see",
      hiddenCost: "For overseas models the subscription fee is only half the story: subscribing through official channels usually also takes a network setup that can reach overseas services, an overseas Apple ID, an overseas credit card, and often more than one of these; regional availability and payment limits add friction on top. Overall cost and hurdles run higher than for domestic models you can subscribe to directly. The converted prices above cover the fee only, not these hidden costs.",
      derivedHintUs: "No official channel in mainland China: US price converted at the current rate",
      derivedHintAvg: "No official channel in mainland China: global average shown",
      sparkAria: "Price sparkline placeholder",
      related: "Related"
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
      return '<tr id="' + esc(it.id) + '" class="' + (draft ? "is-draft" : "") + '"' + (draft ? ' title="' + esc(t("draftHint")) + '"' : "") + ">" +
        "<td><span class=\"product\">" + esc(it.product) + "</span>" +
        '<span class="vendor">' + esc(it.vendor) + "</span></td>" +
        '<td class="num">' + money(it.prices && it.prices.cn) + "</td>" +
        '<td class="num">' + money(it.prices && it.prices.us) + "</td>" +
        '<td class="num">' + avgCell(it.global_avg) + "</td>" +
        "<td>" + sparklineSvg(it.sparkline) + "</td>" +
        "<td>" + statusBadge(it.status) + "</td>" +
        "</tr>";
    }).join("");
    // 「相关」挂在产品名那一格底下（只有已核对、带 related 的行才有）
    if (window.RJ_RELATED) {
      items.forEach(function (it) {
        if (it.status !== "verified" || !it.related || !it.related.length) return;
        var row = document.getElementById(it.id);
        if (row) row.cells[0].appendChild(window.RJ_RELATED.node(it.related, { label: t("related") }));
      });
    }
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

  /* 配一配：只有主价表明写 calculator_tag_id 的同档月价可自动计入。
     其他档保留缺价，个人试算可以在本机填每次实付；公开卡永远不用这份私有自填价。 */
  function calcVendor(tagId) {
    return window.RJ_TAGS.subscriptionVendor(tagId, lang);
  }

  function calcPeriod(tagId) {
    if (/-yearly$/.test(tagId)) return { months: 12, label: t("calcYearly") };
    if (/-quarterly$/.test(tagId)) return { months: 3, label: t("calcQuarterly") };
    return { months: 1, label: t("calcMonthly") };
  }

  function calcPrice(tagId, region) {
    var rows = (cache.sub && cache.sub.items) || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var side = row.prices && row.prices[region];
      if (row.calculator_tag_id !== tagId || row.status !== "verified" ||
          !side || side.unit !== "month" || side.amount == null ||
          side.currency !== (region === "cn" ? "CNY" : "USD") ||
          !Number.isFinite(Number(side.amount)) || Number(side.amount) < 0 ||
          side.as_of !== row.last_verified || !/^https:\/\//.test(side.source_url || "")) continue;
      return { amount: Number(side.amount), date: side.as_of,
        derived: !!side.derived_from, source: side.source_url || "" };
    }
    return null;
  }

  function manualCents(raw) {
    if (typeof raw !== "string" || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(raw)) return null;
    var n = Number(raw);
    return Number.isFinite(n) && n <= 1000000 ? Math.round(n * 100) : null;
  }

  function calcBill(ids, withManual) {
    var seen = Object.create(null);
    var sumCents = 0, missing = 0, derived = false;
    var lines = [];
    (ids || []).forEach(function (id) {
      if (typeof id !== "string" || seen[id]) return;
      seen[id] = true;
      var quote = calcPrice(id, calc.region);
      var raw = withManual ? calc.manual[calc.region][id] : null;
      var cents = raw != null ? manualCents(raw) : null;
      var period = calcPeriod(id);
      var monthlyCents = null, source = "missing";
      if (withManual && calc.invalid[calc.region][id]) {
        // 正在修改但尚未填对的金额，不能沿用旧值或退回标价冒充已计入。
      } else if (cents != null) {
        monthlyCents = Math.round(cents / period.months);
        source = "manual";
      } else if (quote) {
        monthlyCents = Math.round(quote.amount * 100);
        source = "quote";
        derived = derived || quote.derived;
      }
      if (monthlyCents == null) missing += 1; else sumCents += monthlyCents;
      lines.push({ id: id, monthly: monthlyCents == null ? null : monthlyCents / 100, source: source, quote: quote,
        period: period });
    });
    return { amount: sumCents / 100,
      missing: missing, derived: derived, lines: lines };
  }

  function calcMoney(amount) {
    return (calc.region === "cn" ? "¥" : "$") + Number(amount).toFixed(2);
  }

  function calcSummary(bill, empty) {
    if (empty) return t("calcEmpty");
    var value = bill.derived ? "≈" + calcMoney(bill.amount) : calcMoney(bill.amount);
    var main = bill.missing ? (bill.lines.length === bill.missing ? t("calcNoPrice") : t("calcCounted") + " " + value + t("perMonth"))
      : t("calcTotal") + " " + value + t("perMonth");
    if (bill.missing) main += (lang === "en" ? "; " : "；") +
      t("calcUnpriced").replace("{n}", String(bill.missing));
    return main;
  }

  function saveCalc() {
    try { localStorage.setItem(CALC_KEY, JSON.stringify({ region: calc.region,
      selected: calc.selected, manual: calc.manual })); } catch (e) { /* 本机存储不可用时当前页面照常算 */ }
  }

  function restoreCalc() {
    try {
      var saved = JSON.parse(localStorage.getItem(CALC_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      calc.region = saved.region === "us" ? "us" : "cn";
      calc.selected = Array.isArray(saved.selected) ? saved.selected.filter(function (x) { return typeof x === "string"; }) : [];
      ["cn", "us"].forEach(function (region) {
        var values = saved.manual && saved.manual[region];
        if (!values || typeof values !== "object" || Array.isArray(values)) return;
        Object.keys(values).forEach(function (id) {
          if (manualCents(values[id]) != null) calc.manual[region][id] = values[id];
        });
      });
    } catch (e) { /* 存坏了就从空试算开始 */ }
  }

  function paintCalcResult() {
    var result = document.getElementById("calcResult");
    if (!result) return;
    var bill = calcBill(calc.selected, true);
    var summary = calcSummary(bill, !calc.selected.length);
    result.innerHTML = '<strong class="calc-total">' + esc(summary) + "</strong>" +
      (bill.derived ? '<span class="calc-result-note">' + esc(t("calcDerived")) + "</span>" : "");
  }

  function renderCalcRegion() {
    var group = document.querySelector(".calc-region");
    if (group) group.setAttribute("aria-label", t("calcRegionLabel"));
    ["cn", "us"].forEach(function (region) {
      var b = document.getElementById(region === "cn" ? "calcRegionCny" : "calcRegionUsd");
      if (!b) return;
      b.textContent = region === "cn" ? (lang === "en" ? "CNY ¥" : "人民币 ¥") : (lang === "en" ? "USD $" : "美元 $");
      b.setAttribute("aria-pressed", calc.region === region ? "true" : "false");
    });
  }

  function renderCalcLines() {
    var host = document.getElementById("calcLines");
    if (!host || !cache.tags) return;
    host.textContent = "";
    var labels = Object.create(null);
    (cache.tags.subscription || []).forEach(function (tag) { labels[tag.id] = tag; });
    calc.selected.forEach(function (id) {
      var line = calcBill([id], true).lines[0];
      var li = document.createElement("li");
      li.className = "calc-line";
      var head = document.createElement("div");
      head.className = "calc-line-head";
      var name = document.createElement("strong");
      name.textContent = labels[id] ? (lang === "en" ? labels[id].label_en : labels[id].label) : id;
      var amount = document.createElement("span");
      head.appendChild(name); head.appendChild(amount); li.appendChild(head);
      var note = document.createElement("p");
      note.className = "calc-line-note";
      function paintLine(current) {
        amount.textContent = current.monthly == null ? t("calcNoPrice") :
          (current.quote && current.source === "quote" && current.quote.derived ? "≈" : "") + calcMoney(current.monthly) + t("perMonth");
        var actual = calc.manual[calc.region][id];
        note.textContent = calc.invalid[calc.region][id] ? t("calcBadAmount") : current.source === "manual" ? t("calcMyPrice")
          .replace("{amount}", calcMoney(manualCents(actual) / 100))
          .replace("{period}", current.period.label) :
          current.quote && current.source === "quote"
            ? t(current.quote.derived ? "calcQuoteDerived" : "calcQuote")
              .replace("{amount}", calcMoney(current.quote.amount)).replace("{date}", current.quote.date)
            : t("calcNoQuote");
        if (current.source === "quote" && /^https:\/\//.test(current.quote.source)) {
          note.appendChild(document.createTextNode(" · "));
          var link = document.createElement("a");
          link.href = current.quote.source;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = t("calcSource");
          note.appendChild(link);
        }
      }
      paintLine(line);
      li.appendChild(note);
      var label = document.createElement("label");
      label.className = "calc-manual";
      label.textContent = t("calcManualLabel")
        .replace("{period}", line.period.label)
        .replace("{currency}", t(calc.region === "cn" ? "calcCurrencyCn" : "calcCurrencyUs"));
      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.setAttribute("data-manual-tag", id);
      input.setAttribute("autocomplete", "off");
      input.setAttribute("aria-label", name.textContent + " · " + label.textContent);
      input.placeholder = line.quote ? line.quote.amount.toFixed(2) : "0.00";
      input.value = calc.draft[calc.region][id] != null ? calc.draft[calc.region][id] : (calc.manual[calc.region][id] || "");
      if (calc.invalid[calc.region][id]) input.setAttribute("aria-invalid", "true");
      input.addEventListener("input", function () {
        var raw = input.value.trim();
        var state = document.getElementById("calcState");
        if (raw && manualCents(raw) == null) {
          calc.invalid[calc.region][id] = true;
          calc.draft[calc.region][id] = raw;
          delete calc.manual[calc.region][id];
          input.setAttribute("aria-invalid", "true");
          if (state) state.textContent = t("calcBadAmount");
        } else {
          delete calc.invalid[calc.region][id];
          delete calc.draft[calc.region][id];
          input.removeAttribute("aria-invalid");
          if (raw) calc.manual[calc.region][id] = raw;
          else delete calc.manual[calc.region][id];
          if (state) state.textContent = "";
        }
        var current = calcBill([id], true).lines[0];
        paintLine(current);
        paintCalcResult();
        saveCalc();
      });
      label.appendChild(input);
      li.appendChild(label);
      host.appendChild(li);
    });
    var state = document.getElementById("calcState");
    if (state) state.textContent = calc.selected.some(function (id) { return calc.invalid[calc.region][id]; }) ? t("calcBadAmount") : "";
  }

  function renderCalcPicks() {
    var host = document.getElementById("calcPicks");
    if (!host || !cache.tags) return;
    host.textContent = "";
    var groups = [], byKey = Object.create(null);
    var tags = cache.tags.subscription || [];
    var known = Object.create(null);
    tags.forEach(function (tag) {
      known[tag.id] = true;
      var v = calcVendor(tag.id);
      if (!byKey[v.key]) { byKey[v.key] = { vendor: v, tags: [] }; groups.push(byKey[v.key]); }
      byKey[v.key].tags.push(tag);
    });
    calc.selected = calc.selected.filter(function (id, i, all) { return known[id] && all.indexOf(id) === i; });
    ["cn", "us"].forEach(function (region) {
      Object.keys(calc.manual[region]).forEach(function (id) {
        if (!known[id]) delete calc.manual[region][id];
      });
    });
    var anyPicked = calc.selected.length > 0;
    groups.forEach(function (group, index) {
      var details = document.createElement("details");
      details.className = "calc-vendor";
      details.setAttribute("data-calc-vendor", group.vendor.key);
      details.open = group.tags.some(function (tag) { return calc.selected.indexOf(tag.id) !== -1; }) || (!anyPicked && index === 0);
      var summary = document.createElement("summary");
      var name = document.createElement("span");
      name.className = "calc-vendor-name";
      name.textContent = group.vendor.name;
      var count = document.createElement("span");
      count.className = "calc-vendor-count";
      function paintCount() {
        var n = group.tags.filter(function (tag) { return calc.selected.indexOf(tag.id) !== -1; }).length;
        count.textContent = n + " / " + group.tags.length;
        summary.setAttribute("aria-label", group.vendor.name + (lang === "en" ? ", " + n + " selected of " : "，已选 " + n + " 个，共 ") + group.tags.length + (lang === "en" ? "" : " 个"));
      }
      paintCount();
      summary.appendChild(name); summary.appendChild(count); details.appendChild(summary);
      var options = document.createElement("div");
      options.className = "calc-options";
      group.tags.forEach(function (tag) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-calc-tag", tag.id);
        b.setAttribute("data-tone", tag.tone || "mist");
        b.setAttribute("aria-pressed", calc.selected.indexOf(tag.id) === -1 ? "false" : "true");
        b.textContent = lang === "en" ? (tag.label_en || tag.label) : tag.label;
        b.addEventListener("click", function () {
          var at = calc.selected.indexOf(tag.id);
          if (at >= 0) {
            calc.selected.splice(at, 1);
            ["cn", "us"].forEach(function (region) {
              delete calc.invalid[region][tag.id];
              delete calc.draft[region][tag.id];
            });
          } else calc.selected.push(tag.id);
          b.setAttribute("aria-pressed", at >= 0 ? "false" : "true");
          paintCount();
          renderCalcLines(); paintCalcResult(); saveCalc();
        });
        options.appendChild(b);
      });
      details.appendChild(options);
      host.appendChild(details);
    });
  }

  function renderCalc() {
    if (!cache.tags || !cache.sub) return;
    renderCalcRegion();
    renderCalcPicks();
    renderCalcLines();
    paintCalcResult();
  }

  function wireCalcControls() {
    ["cn", "us"].forEach(function (region) {
      var b = document.getElementById(region === "cn" ? "calcRegionCny" : "calcRegionUsd");
      if (!b) return;
      b.addEventListener("click", function () {
        if (calc.region === region) return;
        calc.region = region;
        saveCalc();
        renderCalcRegion(); renderCalcLines(); paintCalcResult();
        refreshWallEstimates();
      });
    });
    var reset = document.getElementById("calcReset");
    if (reset) reset.addEventListener("click", function () {
      calc.selected = [];
      calc.manual = { cn: Object.create(null), us: Object.create(null) };
      calc.draft = { cn: Object.create(null), us: Object.create(null) };
      calc.invalid = { cn: Object.create(null), us: Object.create(null) };
      try { localStorage.removeItem(CALC_KEY); } catch (e) { /* 本机存储不可用 */ }
      renderCalc();
      var state = document.getElementById("calcState");
      if (state) state.textContent = "";
    });
    var copy = document.getElementById("calcCopy");
    if (copy) copy.addEventListener("click", function () {
      var state = document.getElementById("calcState");
      var labels = Object.create(null);
      ((cache.tags && cache.tags.subscription) || []).forEach(function (tag) {
        labels[tag.id] = lang === "en" ? (tag.label_en || tag.label) : tag.label;
      });
      var bill = calcBill(calc.selected, true);
      var lines = [t("calcReceiptTitle"), calcSummary(bill, !calc.selected.length)];
      bill.lines.forEach(function (line) {
        var detail = line.monthly == null ? t("calcNoPrice") :
          (line.quote && line.source === "quote" && line.quote.derived ? "≈" : "") + calcMoney(line.monthly) + t("perMonth");
        if (line.source === "manual") detail += " · " + t("calcMyPrice")
          .replace("{amount}", calcMoney(manualCents(calc.manual[calc.region][line.id]) / 100))
          .replace("{period}", line.period.label);
        lines.push((labels[line.id] || line.id) + "：" + detail);
      });
      lines.push(t("calcFootnote"));
      var content = lines.join("\n");
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        if (state) state.textContent = t("calcCopyFail");
        return;
      }
      navigator.clipboard.writeText(content).then(function () {
        if (state) state.textContent = t("calcCopied");
      }).catch(function () { if (state) state.textContent = t("calcCopyFail"); });
    });
  }

  function estimateInner(ids) {
    var bill = calcBill(ids, false);
    var summary = calcSummary(bill, false);
    return esc(t("wallCostLabel")) + "：<strong>" + esc(summary) + "</strong>" +
      (bill.derived ? " · " + esc(t("calcDerived")) : "");
  }

  function estimateHtml(ids) {
    return ids && ids.length ? '<p class="setup-estimate">' + estimateInner(ids) + "</p>" : "";
  }

  function refreshWallEstimates() {
    document.querySelectorAll("#setupWall .setup-card").forEach(function (card) {
      var target = card.querySelector(".setup-estimate");
      if (!target || !card.dataset.costSubs) return;
      target.innerHTML = estimateInner(JSON.parse(card.dataset.costSubs));
    });
  }

  /* 「昵称 @handle」；没昵称只有「@handle」。昵称是读者写的字，进 innerHTML 前一律 esc */
  function who(o) {
    var dn = o && typeof o.display_name === "string" ? o.display_name.trim() : "";
    return (dn ? dn + " " : "") + "@" + (o && o.handle ? o.handle : "?");
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
      return who(b) + " · " + (b.kind === "machine" ? t("kindWordMachine") : t("kindWordHuman"));
    });
    var a = document.createElement("a");
    a.className = "setup-card is-real";
    a.dataset.costSubs = JSON.stringify(tags.subscription || []);
    a.href = href;
    a.innerHTML =
      '<div class="setup-card-top">' +
        '<div class="setup-head">' +
          '<div class="setup-avatar"><div class="setup-mono" data-kind="' + esc(it.kind) + '" aria-hidden="true">' +
            esc(String(it.handle || "?").charAt(0)) + "</div></div>" +
          '<div><strong class="is-handle">' + esc(who(it)) + "</strong>" +
          '<div class="who">' + esc(it.kind === "machine" ? t("kindMachine") : t("kindHuman")) + "</div></div>" +
        "</div>" +
      "</div>" +
      '<div class="setup-body">' +
        row("subs", "rowSubs", tags.subscription, maps.sub, "mist") +
        row("devices", "rowDevices", tags.device, maps.dev, "device") +
        row("routes", "rowRoute", tags.route, maps.route, "slate") +
      "</div>" +
      (bound.length ? '<p class="setup-bound">' + esc(t("boundWith") + " " + bound.join("，")) + "</p>" : "") +
      estimateHtml(tags.subscription);
    return a;
  }

  function renderWallControls() {
    var btn = document.getElementById("wallMore");
    var status = document.getElementById("wallPageNote");
    if (!btn || !status) return;
    var hasReal = !!(cache.wall && cache.wall.length);
    btn.hidden = !hasReal || (!cache.wallCursor && !cache.wallLoading);
    btn.disabled = !!cache.wallLoading;
    btn.textContent = cache.wallLoading ? t("wallLoadingMore") : t("wallMore");
    status.className = "wall-page-note" + (cache.wallError ? " is-error" : "");
    if (!hasReal) status.textContent = "";
    else if (cache.wallLoading) status.textContent = t("wallLoadingMore");
    else if (cache.wallError) status.textContent = t("wallMoreFail");
    else if (cache.wallExhausted) status.textContent = t("wallEnd");
    else status.textContent = "";
  }

  function appendWallItems(items) {
    var seen = Object.create(null);
    var added = [];
    (cache.wall || []).forEach(function (it) { if (it && it.handle) seen[it.handle] = true; });
    (items || []).forEach(function (it) {
      if (!it || !it.handle || seen[it.handle]) return;
      seen[it.handle] = true;
      cache.wall.push(it);
      added.push(it);
    });
    return added;
  }

  function wallTagMaps(tags) {
    var maps = { sub: {}, dev: {}, route: {} };
    ((tags && tags.subscription) || []).forEach(function (row) { maps.sub[row.id] = row; });
    ((tags && tags.device) || []).forEach(function (row) { maps.dev[row.id] = row; });
    ((tags && tags.route) || []).forEach(function (row) { maps.route[row.id] = row; });
    return maps;
  }

  function appendRealWallCards(items, tags) {
    var wall = document.getElementById("setupWall");
    if (!wall) return;
    var maps = wallTagMaps(tags);
    (items || []).forEach(function (it) { wall.appendChild(realCard(it, maps)); });
  }

  function renderSetups(setups, tags) {
    var wall = document.getElementById("setupWall");
    var note = document.getElementById("wallNote");
    var maps = wallTagMaps(tags);

    // 墙上有真号就只摆真号；没有、或者后端不通，退回三张示例卡
    if (cache.wall && cache.wall.length) {
      if (note) note.textContent = t("wallNote");
      wall.innerHTML = "";
      cache.wall.forEach(function (it) {
        wall.appendChild(realCard(it, maps));
      });
      renderWallControls();
      return;
    }
    renderWallControls();
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
      card.dataset.costSubs = JSON.stringify(it.subscription_tags || []);
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
            '<div class="setup-tags">' + fareTags(it.subscription_tags, maps.sub, "mist") + "</div>" +
          "</div>" +
          '<div class="setup-row devices">' +
            '<span class="row-label">' + esc(t("rowDevices")) + "</span>" +
            '<div class="setup-tags">' + fareTags(it.device_tags, maps.dev, "device") + "</div>" +
          "</div>" +
          ((it.route_tags && it.route_tags.length) ?
            '<div class="setup-row routes">' +
              '<span class="row-label">' + esc(t("rowRoute")) + "</span>" +
              '<div class="setup-tags">' + fareTags(it.route_tags, maps.route, "slate") + "</div>" +
          "</div>" : "") +
        "</div>" +
        estimateHtml(it.subscription_tags) +
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
    renderCalc();
    if (cache.setups && cache.tags) renderSetups(cache.setups, cache.tags);
    else renderWallControls();
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

  restoreCalc();
  wireLangButtons();
  wireCalcControls();
  renderCalcRegion();
  applyStaticI18n();

  // 真墙（P2-c）：后端在就取一页；不在、取不到，墙上照旧摆示例卡，不报错
  var RJ = window.RJ_API;
  function getWallPage(path) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    return Promise.race([
      RJ.get(path, controller ? { signal: controller.signal } : undefined),
      new Promise(function (_resolve, reject) {
        timer = window.setTimeout(function () {
          if (controller) controller.abort();
          reject(new Error("wall page timeout"));
        }, 12000);
      })
    ]).then(function (value) {
      if (timer !== null) window.clearTimeout(timer);
      return value;
    }, function (error) {
      if (timer !== null) window.clearTimeout(timer);
      throw error;
    });
  }
  function loadMoreWall() {
    if (!RJ || cache.wallLoading || !cache.wallCursor || !cache.wall || !cache.wall.length) return;
    var focusBeganOnMore = document.activeElement === wallMore;
    var focusMoved = false;
    function noteFocusMove(event) {
      if (event.target !== wallMore && event.target !== document.body && event.target !== document.documentElement) {
        focusMoved = true;
      }
    }
    if (focusBeganOnMore) document.addEventListener("focusin", noteFocusMove, true);
    function stopWatchingFocus() {
      if (focusBeganOnMore) document.removeEventListener("focusin", noteFocusMove, true);
    }
    cache.wallLoading = true;
    cache.wallError = false;
    renderWallControls();
    getWallPage("/api/wall?limit=30&cursor=" + encodeURIComponent(cache.wallCursor)).then(function (r) {
      if (!r || !r.ok || !r.data || !Array.isArray(r.data.items)) throw new Error("wall page");
      var added = appendWallItems(r.data.items);
      cache.wallCursor = r.data.next_cursor || null;
      cache.wallExhausted = !cache.wallCursor;
      cache.wallLoading = false;
      cache.wallError = false;
      stopWatchingFocus();
      var moveFocusWhenDone = focusBeganOnMore && !focusMoved;
      if (cache.setups && cache.tags) appendRealWallCards(added, cache.tags);
      renderWallControls();
      if (cache.wallExhausted && moveFocusWhenDone) {
        var status = document.getElementById("wallPageNote");
        if (status) {
          status.setAttribute("tabindex", "-1");
          status.focus();
        }
      } else if (moveFocusWhenDone) {
        wallMore.focus();
      }
    }).catch(function () {
      stopWatchingFocus();
      cache.wallLoading = false;
      cache.wallError = true;
      renderWallControls();
      if (focusBeganOnMore && !focusMoved) wallMore.focus();
    });
  }
  var wallMore = document.getElementById("wallMore");
  if (wallMore) wallMore.addEventListener("click", loadMoreWall);
  if (RJ && RJ.enabled) {
    RJ.available().then(function (cfg) {
      if (!cfg) return null;
      return RJ.get("/api/wall?limit=30");
    }).then(function (r) {
      if (!r || !r.ok || !r.data || !Array.isArray(r.data.items) || !r.data.items.length) return;
      cache.wall = [];
      appendWallItems(r.data.items);
      cache.wallCursor = r.data.next_cursor || null;
      cache.wallExhausted = !cache.wallCursor;
      cache.wallError = false;
      if (cache.setups && cache.tags) renderSetups(cache.setups, cache.tags);
    }).catch(function () { /* 后端不通：留着示例卡 */ });
    // 墙按钮：默认对没号的人说清楚「先注册」；已登录的号换成「去挑配置」
    RJ.available().then(function (cfg) {
      return cfg ? RJ.me() : null;
    }).then(function (me) {
      var cta = document.getElementById("wallCta");
      if (!me || !cta) return;
      cta.setAttribute("data-i18n", "wallCta");
      cta.textContent = t("wallCta");
    }).catch(function () { /* 探不到就保持没号的那句 */ });
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
    if (window.RJ_RELATED) window.RJ_RELATED.scrollToHash();   // cost.html#<行 id> 从别的板块链过来
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
    fail(document.getElementById("calcPicks"), t("failSubs"));
    document.getElementById("calcResult").textContent = t("failSubs");
  });
})();
