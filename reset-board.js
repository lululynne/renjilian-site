/* 第二人称 · 公开额度观察
   Codex / Claude 读取公开源；Grok 规则读本站的有日期核验快照。
   Claude 个人时间只在 localStorage；Grok 可选私密日历只向本站 API 发送最小日历字段。 */
(function () {
  "use strict";

  var CODEX_FORECAST = "https://codex-reset.com/api/forecast";
  var CLAUDE_SUMMARY = "https://claude-resets.com/data/summary.json";
  var CLAUDE_EVENTS = "https://claude-resets.com/data/resets.json";
  var GROK_RULES = "data/grok-reset.json";
  var CLOCK_KEY = "second-person.reset-clocks.v1";
  var GROK_REMINDER_KEY = "second-person.grok-reminder.v1";

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { var el = byId(id); if (el) el.textContent = value; }
  function finitePercent(value) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
  }
  function dateTime(value) {
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "时间未确认";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(d) + "（本地时间）";
  }
  function dateOnly(value) {
    var plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (plain) return Number(plain[1]) + "年" + Number(plain[2]) + "月" + Number(plain[3]) + "日";
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "日期未确认";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(d);
  }
  function ageText(value) {
    var ms = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(ms)) return "时间未确认";
    if (ms < 0) return "时间待核";
    var hours = ms / 3600000;
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + " 分钟前";
    if (hours < 48) return Math.round(hours) + " 小时前";
    return Math.floor(hours / 24) + " 天前";
  }
  function safeXLink(id, value) {
    var el = byId(id);
    if (el && /^https:\/\/x\.com\//.test(String(value || ""))) el.href = value;
  }
  function fetchJson(url) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 9000);
    return fetch(url, { cache: "no-store", signal: controller.signal }).then(function (response) {
      if (!response.ok) throw new Error("公开源返回 " + response.status);
      return response.json().then(function (data) {
        return { data: data, modified: response.headers.get("last-modified") || "" };
      });
    }).finally(function () { window.clearTimeout(timer); });
  }

  function renderCodex(result) {
    var data = result.data || {};
    var probs = data.probabilities || {};
    var p24 = finitePercent(probs.rounded_24h);
    var p48 = finitePercent(probs.rounded_48h);
    if (p24 === null || p48 === null) throw new Error("Codex 预测字段不完整");
    setText("codex24", p24 + "%");
    setText("codex48", p48 + "%");
    setText("codexSummary", p24 + "%");
    setText("codexSummaryNote", "48 小时 " + p48 + "% · 实验性预测");
    setText("codexConfidence", "模型置信度：" + ({ low: "低", medium: "中", high: "高" }[data.confidence] || "未标注"));
    setText("codexForecastNote", data.backtest && data.backtest.status === "experimental"
      ? "实验模型还没有稳定超过基准，只能看方向，不能当作重置确认。"
      : "公开模型给方向，不替代官方公告。");
    setText("codexLastReset", dateTime(data.last_reset_at));
    setText("codexUpdated", "预测更新 " + ageText(data.updated_at));
    var alert = data.latest_alert || {};
    setText("codexEventBadge", "已确认");
    setText("codexEventSummary", alert.summary
      ? "公开源已确认这次属于额外额度重置；完整范围与措辞请查看原帖。"
      : "最近一次公开重置已经由来源站核验。");
    safeXLink("codexOriginal", alert.url || (data.evidence && data.evidence[1] && data.evidence[1].href));
    return Date.now() - new Date(data.updated_at).getTime() <= 6 * 3600000;
  }

  function renderClaude(summaryResult, eventsResult) {
    var summary = summaryResult.data || {};
    var provider = eventsResult.data && eventsResult.data.providers && eventsResult.data.providers.claude;
    var events = provider && Array.isArray(provider.events) ? provider.events.slice() : [];
    if (!events.length || !summary.lastResetAt) throw new Error("Claude 公告档案不完整");
    events.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var latest = events[events.length - 1];
    var resets = events.filter(function (event) { return event.kind === "reset"; });
    var lastReset = resets[resets.length - 1];
    var latestAgeHours = (Date.now() - new Date(latest.date).getTime()) / 3600000;
    var level = "low", word = "低", reason = "没有新的官方重置或补偿措辞。单纯等得久，不会自动把等级调高。";
    if (latest.kind === "reset" && latestAgeHours <= 24) {
      level = "high"; word = "高"; reason = "官方开发账号刚发布重置公告，直接查看原帖与实际到账。";
    } else if (latest.kind === "policy" && latestAgeHours <= 72) {
      level = "medium"; word = "中"; reason = "官方刚调整限额政策，但尚未明确承诺额外重置。";
    }
    setText("claudeSummary", word);
    setText("claudeTier", word);
    setText("claudeTierReason", reason);
    var track = byId("claudeLevelTrack");
    if (track) track.dataset.level = level;
    setText("claudeLastReset", "最近重置 " + dateOnly(lastReset.date));
    setText("claudeEventSummary", latest.kind === "reset"
      ? "最近一条官方开发账号动态确认了额度重置。"
      : "最近一条公开动态是限额政策调整，不是把计数器清零重来。");
    setText("claudeEventBadge", latest.kind === "reset" && latestAgeHours <= 24 ? "已确认重置" : "未发现新重置公告");
    var badge = byId("claudeEventBadge");
    if (badge) badge.className = "status-pill " + (level === "high" ? "warn" : "wait");
    setText("claudeUpdated", "公开档案最新事件 " + dateTime(latest.date) + " · " + ageText(latest.date));
    safeXLink("claudeOriginal", latest.url || summary.lastResetUrl);
    return resultFresh(summaryResult.modified, 14 * 24 * 3600000);
  }

  function renderGrok(result) {
    var data = result.data || {};
    var rules = Array.isArray(data.rules) ? data.rules : [];
    var prediction = data.prediction || {};
    var fresh = !!data.updated_at
      && Date.now() - new Date(data.updated_at + "T23:59:59Z").getTime() <= 45 * 24 * 3600000;
    var current = rules.find(function (rule) { return rule.id === "grok-current-shared"; });
    var legacyApp = rules.find(function (rule) { return rule.id === "grok-app-legacy"; });
    var legacyBot = rules.find(function (rule) { return rule.id === "grok-bot-legacy"; });
    if (!fresh || !current || !legacyApp || !legacyBot
        || prediction.state !== "insufficient_public_history") {
      throw new Error("Grok 核验快照字段不完整");
    }
    setText("grokSummary", "规则已核");
    setText("grokSummaryNote", "公开样本不足 · 不输出概率");
    setText("grokVerifiedAt", dateOnly(data.updated_at));
    setText("grokRuleLede", "当前方案与旧版账号并存：先在用量页认清自己的方案，再抄时间。Plus／Free 不含 Grok Bot；当前 Premium、Super、Ultra 的 Bot 才跟 Grok／Cursor 共用周池。旧版 Grok 网页／App 和旧版 Bot 仍要分别记两个钟。");
    setText("grokCurrentTitle", current.label);
    setText("grokCurrentBody", current.statement);
    setText("grokLegacyTitle", "旧版 Grok 与旧版 Bot：两块表、两个钟");
    setText("grokLegacyBody", legacyApp.statement + " " + legacyBot.statement);
    setText("grokPredictionBadge", "样本不足");
    setText("grokPredictionValue", "不出概率");
    setText("grokPredictionNote", prediction.statement);
    return true;
  }

  function resultFresh(modified, maxAge) {
    var time = new Date(modified).getTime();
    return Number.isFinite(time) && Date.now() - time <= maxAge;
  }

  function markCodexFailure() {
    setText("codex24", "暂不可用");
    setText("codex48", "暂不可用");
    setText("codexSummary", "源站未返回");
    setText("codexSummaryNote", "请直接打开预测源查看");
    setText("codexConfidence", "数据可能过期");
    setText("codexUpdated", "本次同步失败");
    setText("codexEventBadge", "待核");
    setText("codexEventSummary", "公开源没有返回，本页不沿用旧快照冒充今天。 ");
  }
  function markClaudeFailure() {
    setText("claudeEventBadge", "数据可能过期");
    setText("claudeLastReset", "请查看 @ClaudeDevs");
    setText("claudeEventSummary", "公开档案没有返回；当前保持低等级，不用缓存数据冒充最新公告。");
    setText("claudeUpdated", "本次同步失败");
  }
  function markGrokFailure() {
    setText("grokSummary", "快照未返回");
    setText("grokSummaryNote", "请直接打开官方用量页");
    setText("grokVerifiedAt", "本次读取失败");
    setText("grokPredictionBadge", "待核");
    setText("grokPredictionValue", "—");
    setText("grokPredictionNote", "规则快照没有返回；本页不沿用旧数据，也不补写概率。");
    setText("grokRuleLede", "规则快照没有返回或已经过期。请直接打开官方 Usage 页面；本站此刻不判断当前／旧版额度关系。");
    setText("grokCurrentTitle", "当前方案待核");
    setText("grokCurrentBody", "没有新鲜快照，不沿用页面缓存里的旧结论。");
    setText("grokLegacyTitle", "旧版方案待核");
    setText("grokLegacyBody", "请分别打开 Grok Usage 与 Grok Bot Usage & Billing 核对自己的账户。 ");
  }

  function syncPublicSources() {
    var codex = fetchJson(CODEX_FORECAST);
    var claudeSummary = fetchJson(CLAUDE_SUMMARY);
    var claudeEvents = fetchJson(CLAUDE_EVENTS);
    var grok = fetchJson(GROK_RULES);
    return Promise.allSettled([codex, claudeSummary, claudeEvents, grok]).then(function (rows) {
      var ok = 0, fresh = true;
      if (rows[0].status === "fulfilled") {
        try { fresh = renderCodex(rows[0].value) && fresh; ok++; } catch (_) { markCodexFailure(); fresh = false; }
      } else { markCodexFailure(); fresh = false; }
      if (rows[1].status === "fulfilled" && rows[2].status === "fulfilled") {
        try { fresh = renderClaude(rows[1].value, rows[2].value) && fresh; ok++; } catch (_) { markClaudeFailure(); fresh = false; }
      } else { markClaudeFailure(); fresh = false; }
      if (rows[3].status === "fulfilled") {
        try { fresh = renderGrok(rows[3].value) && fresh; ok++; } catch (_) { markGrokFailure(); fresh = false; }
      } else { markGrokFailure(); fresh = false; }
      var state = byId("syncState");
      if (state) {
        state.textContent = ok === 3 && fresh ? "Codex / Claude / Grok 已同步" : (ok ? "公开数据有一部分未同步" : "公开数据暂不可用");
        state.className = "source-state " + (ok === 3 && fresh ? "fresh" : "stale");
      }
      setText("syncTime", "本页核查 " + new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
      document.body.dataset.resetBoard = ok === 3 ? "ready" : "degraded";
    });
  }

  function copyText(text, button) {
    var done = function () {
      var before = button.textContent;
      button.textContent = "已复制";
      window.setTimeout(function () { button.textContent = before; }, 1200);
    };
    var fallback = function () {
      var area = document.createElement("textarea");
      area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); done(); } catch (_) {}
      area.remove();
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
      return;
    }
    fallback();
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function toInputValue(value) {
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function countdown(value) {
    if (!value) return "尚未设置";
    var ms = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(ms)) return "时间格式不正确";
    if (ms <= 0) return "已到时间，请回 /usage 复查";
    var days = Math.floor(ms / 86400000); ms %= 86400000;
    var hours = Math.floor(ms / 3600000); ms %= 3600000;
    var minutes = Math.floor(ms / 60000);
    return (days ? days + " 天 " : "") + pad(hours) + " 小时 " + pad(minutes) + " 分";
  }
  function readClocks() {
    try { return JSON.parse(localStorage.getItem(CLOCK_KEY) || "{}"); } catch (_) { return {}; }
  }
  function paintClocks() {
    var values = readClocks();
    setText("fiveHourCountdown", countdown(values.five));
    setText("weeklyCountdown", countdown(values.weekly));
  }
  function wireClocks() {
    var five = byId("fiveHourAt"), weekly = byId("weeklyAt");
    var values = readClocks();
    if (five) five.value = toInputValue(values.five);
    if (weekly) weekly.value = toInputValue(values.weekly);
    byId("saveClocks").addEventListener("click", function () {
      var next = { five: five.value ? new Date(five.value).toISOString() : "", weekly: weekly.value ? new Date(weekly.value).toISOString() : "" };
      try { localStorage.setItem(CLOCK_KEY, JSON.stringify(next)); } catch (_) {}
      paintClocks();
      this.textContent = "已保存在这台设备";
      var button = this; window.setTimeout(function () { button.textContent = "保存在这台设备"; }, 1400);
    });
    byId("clearClocks").addEventListener("click", function () {
      try { localStorage.removeItem(CLOCK_KEY); } catch (_) {}
      five.value = ""; weekly.value = ""; paintClocks();
    });
    paintClocks();
    window.setInterval(paintClocks, 30000);
  }

  function reminderApiBase() {
    return window.RJ_CONFIG && typeof window.RJ_CONFIG.apiBase === "string"
      ? window.RJ_CONFIG.apiBase.replace(/\/+$/, "") : "";
  }
  var REMINDER_LABELS = {
    grok_shared: "当前共用周池",
    grok_app_legacy: "旧版 Grok 网页／App 周池",
    grok_bot_legacy: "旧版 Grok Bot 周池"
  };
  var TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
  var reminderMemoryStore = null;
  function emptyReminderStore() { return { version: 2, items: {} }; }
  function normalizeReminderStore(raw) {
    if (raw && raw.version === 2 && raw.items && typeof raw.items === "object") return raw;
    if (raw && raw.product) {
      var migrated = emptyReminderStore();
      migrated.items[raw.product] = raw;
      return migrated;
    }
    return emptyReminderStore();
  }
  function readGrokReminders() {
    try {
      var parsed = normalizeReminderStore(JSON.parse(localStorage.getItem(GROK_REMINDER_KEY) || "null"));
      reminderMemoryStore = parsed;
      return parsed;
    } catch (_) { return reminderMemoryStore || emptyReminderStore(); }
  }
  function saveGrokReminders(store) {
    reminderMemoryStore = store;
    try {
      var serialized = JSON.stringify(store);
      localStorage.setItem(GROK_REMINDER_KEY, serialized);
      return localStorage.getItem(GROK_REMINDER_KEY) === serialized;
    } catch (_) { return false; }
  }
  function browserToken(prefix) {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error("这个浏览器不能生成安全日历凭据。");
    var bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    var out = prefix;
    bytes.forEach(function (byte) { out += TOKEN_ALPHABET[byte & 31] + TOKEN_ALPHABET[(byte >> 5) & 31]; });
    return out;
  }
  function reminderStatus(message, state) {
    var el = byId("grokReminderStatus");
    if (!el) return;
    el.textContent = message;
    if (state) el.dataset.state = state; else delete el.dataset.state;
  }
  function reminderRequest(path, method, body) {
    var base = reminderApiBase();
    if (!base) return Promise.reject(new Error("本机预览尚未连接 API；正式站可直接建立提醒。"));
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 12000);
    return fetch(base + path, {
      method: method,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || "日历服务暂时没走通。");
          error.status = response.status;
          throw error;
        }
        return data;
      });
    }).finally(function () { window.clearTimeout(timer); });
  }
  function selectedReminders() {
    return Array.from(document.querySelectorAll('input[name="grok-reminder"]:checked'))
      .map(function (input) { return Number(input.value); });
  }
  function applyReminderChecks(values) {
    var selected = new Set(Array.isArray(values) ? values.map(Number) : [1440, 60, 0]);
    document.querySelectorAll('input[name="grok-reminder"]').forEach(function (input) {
      input.checked = selected.has(Number(input.value));
    });
  }
  function zoneParts(value, timezone) {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(value));
    var out = {};
    parts.forEach(function (part) { if (part.type !== "literal") out[part.type] = Number(part.value); });
    return out;
  }
  function wallParts(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
    return match ? { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5], second: 0 } : null;
  }
  function sameWall(a, b) {
    return a && b && ["year", "month", "day", "hour", "minute"].every(function (key) { return a[key] === b[key]; });
  }
  function zonedWallToIso(value, timezone) {
    var desired = wallParts(value);
    if (!desired) throw new Error("这个时间认不出来，请重新选择。");
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date()); }
    catch (_) { throw new Error("这个 IANA 时区认不出来，请照 Usage 页面重填。"); }
    var wallUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, 0);
    var candidate = wallUtc;
    for (var i = 0; i < 3; i++) {
      var seen = zoneParts(candidate, timezone);
      var seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second || 0);
      candidate += wallUtc - seenUtc;
    }
    if (!sameWall(zoneParts(candidate, timezone), desired)) {
      throw new Error("这个时刻落在夏令时跳时里，请换成 Usage 页面显示的有效时刻。");
    }
    return new Date(candidate).toISOString();
  }
  function toZoneInputValue(value, timezone) {
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    try {
      var p = zoneParts(d, timezone);
      return p.year + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour) + ":" + pad(p.minute);
    } catch (_) { return toInputValue(value); }
  }
  function reminderPayload(item) { return item && item.draft ? item.draft : item; }
  function sameReminderPayload(a, b) {
    return a && b && a.product === b.product && a.reset_at === b.reset_at && a.timezone === b.timezone
      && JSON.stringify(a.reminders || []) === JSON.stringify(b.reminders || []);
  }
  function selectedItem(store, product) { return store.items && store.items[product] || null; }
  function activeCount(store) {
    return Object.keys(store.items || {}).filter(function (key) { return store.items[key]; }).length;
  }
  function paintReminderCount(store) {
    var count = activeCount(store);
    setText("grokReminderCount", count ? "此浏览器保存了 " + count + " 份 Grok 日历记录（含待重试）；切换上面的用量表分别管理。" : "此浏览器还没有保存 Grok 日历。");
  }
  function paintGrokReminder(value, store) {
    var active = byId("grokReminderActive");
    var save = byId("saveGrokReminder");
    paintReminderCount(store || readGrokReminders());
    if (!value || !value.id || !value.manage_token) {
      if (active) active.hidden = true;
      if (save) save.textContent = value && value.draft ? "重试建立这份日历" : "建立私密日历";
      var emptyLink = byId("grokCalendarLink");
      if (emptyLink) { emptyLink.removeAttribute("href"); emptyLink.removeAttribute("aria-disabled"); }
      return;
    }
    if (active) active.hidden = false;
    if (save) save.textContent = "更新这份日历";
    setText("grokReminderActiveName", (REMINDER_LABELS[value.product] || "这份日历") + "已经准备好。");
    var link = byId("grokCalendarLink");
    if (link) {
      var calendarHref = value.calendar_url || value.feed_url || "";
      if (calendarHref) { link.href = calendarHref; link.removeAttribute("aria-disabled"); }
      else { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); }
    }
    setText("grokReminderExpiry", value.expires_at
      ? "这份订阅会在 " + dateOnly(value.expires_at) + " 后自动结束；重置时间变化时直接在上面更新。"
      : "重置时间变化时，直接在上面更新同一份订阅。");
  }
  function loadSelectedReminder(store, product, at, timezone) {
    var value = selectedItem(store, product.value);
    var payload = reminderPayload(value);
    if (payload) {
      timezone.value = payload.timezone || (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      at.value = toZoneInputValue(payload.reset_at, timezone.value);
      applyReminderChecks(payload.reminders);
      reminderStatus(value.id ? "这块用量表已经有一份日历；修改后会更新同一事件。" : "上次创建结果未确认；点重试会用同一组凭据找回，不会多建一份。", value.id ? "ok" : "error");
    } else {
      timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      at.value = "";
      applyReminderChecks([1440, 60, 0]);
      reminderStatus("这块用量表还没有建立提醒。");
    }
    paintGrokReminder(value, store);
  }
  function withReminderLock(product, work) {
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request("second-person.grok-reminder:" + product, work);
    }
    return Promise.reject(new Error("这个浏览器缺少防重复锁，本站不会冒险创建可能无法退订的日历。请换当前版 Safari、Chrome 或 Edge。"));
  }
  function managementReceipt(value) {
    return JSON.stringify({
      version: 1, product: value.product, id: value.id, manage_token: value.manage_token,
      feed_url: value.feed_url, calendar_url: value.calendar_url, reset_at: value.reset_at,
      timezone: value.timezone, reminders: value.reminders, expires_at: value.expires_at
    }, null, 2);
  }
  function wireGrokReminder() {
    var form = byId("grokReminderForm");
    if (!form) return;
    var product = byId("grokReminderProduct");
    var at = byId("grokReminderAt");
    var timezone = byId("grokReminderTimezone");
    var save = byId("saveGrokReminder");
    var store = readGrokReminders();
    Object.keys(store.items).forEach(function (key) {
      var item = store.items[key];
      if (item && item.id && item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) delete store.items[key];
    });
    saveGrokReminders(store);
    loadSelectedReminder(store, product, at, timezone);
    product.addEventListener("change", function () {
      loadSelectedReminder(readGrokReminders(), product, at, timezone);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var productKey = product.value;
      save.disabled = true;
      withReminderLock(productKey, function () {
        var reminders = selectedReminders();
        if (!at.value) throw new Error("先从官方 Usage 页面抄下下一次重置时间。");
        if (!reminders.length) throw new Error("至少选一个提醒时刻。");
        var desired = {
          product: productKey,
          reset_at: zonedWallToIso(at.value, timezone.value.trim()),
          timezone: timezone.value.trim(),
          reminders: reminders
        };
        var currentStore = readGrokReminders();
        var current = selectedItem(currentStore, productKey);
        if (current && current.id && current.manage_token) {
          reminderStatus("正在更新同一份日历……");
          return reminderRequest("/api/reset-reminders/" + encodeURIComponent(current.id), "PATCH", {
            manage_token: current.manage_token,
            product: desired.product, reset_at: desired.reset_at, timezone: desired.timezone, reminders: desired.reminders
          }).then(function (data) {
            var sub = data.subscription || {};
            Object.assign(current, desired, { reset_at: sub.reset_at || desired.reset_at, expires_at: sub.expires_at || current.expires_at });
            currentStore.items[productKey] = current;
            if (!saveGrokReminders(currentStore)) throw new Error("日历已更新，但浏览器没能保存管理回执；请立刻复制管理回执。");
            paintGrokReminder(current, currentStore);
            reminderStatus("同一份日历已经更新。", "ok");
          });
        }

        var draftItem = current && current.draft ? current : null;
        if (!draftItem) {
          draftItem = {
            draft: desired,
            feed_token: browserToken("rrf_"),
            manage_token: browserToken("rrm_"),
            created_at: new Date().toISOString()
          };
          currentStore.items[productKey] = draftItem;
        }
        // 必须先持久保存两把令牌，再允许 POST；否则响应丢失会留下无法退订的服务器行。
        if (!saveGrokReminders(currentStore)) {
          throw new Error("浏览器拒绝保存管理码，所以没有向服务器建日历。请允许本站本地存储后再试。");
        }
        var original = draftItem.draft;
        reminderStatus("正在建立或找回同一份私密日历……");
        return reminderRequest("/api/reset-reminders", "POST", {
          feed_token: draftItem.feed_token,
          manage_token: draftItem.manage_token,
          product: original.product, reset_at: original.reset_at, timezone: original.timezone, reminders: original.reminders
        }).then(function (data) {
          var sub = data.subscription || {};
          var feedUrl = data.feed_url || (reminderApiBase() + String(data.feed_path || ""));
          var next = {
            id: sub.id,
            product: sub.product || original.product,
            manage_token: draftItem.manage_token,
            feed_url: feedUrl,
            calendar_url: data.calendar_url || String(feedUrl || "").replace(/^https?:\/\//, "webcal://"),
            reset_at: sub.reset_at || original.reset_at,
            timezone: sub.timezone || original.timezone,
            reminders: sub.reminders || original.reminders,
            expires_at: sub.expires_at
          };
          currentStore.items[productKey] = next;
          var durable = saveGrokReminders(currentStore);
          paintGrokReminder(next, currentStore);
          if (!durable) {
            reminderStatus("服务器已建好，但浏览器没能保存管理回执。关闭页面前先复制管理回执。", "error");
            return;
          }
          reminderStatus(data.idempotent_replay ? "找回了刚才同一份日历，没有新建重复项。" : "日历源已建好；还要在日历客户端完成订阅并允许通知。", "ok");
          if (!sameReminderPayload(original, desired)) {
            reminderStatus("先找回了原日历；再点一次更新成你刚改的时间。", "error");
          }
        });
      }).catch(function (error) {
        reminderStatus(error.name === "AbortError" ? "响应超时；管理码已保存在本机，点重试会找回同一份，不会多建。" : error.message, "error");
      }).finally(function () { save.disabled = false; });
    });

    byId("copyGrokCalendar").addEventListener("click", function () {
      var current = selectedItem(readGrokReminders(), product.value);
      if (current && current.feed_url) copyText(current.feed_url, this);
      else reminderStatus("本机没有可复制的订阅地址。", "error");
    });
    byId("copyGrokManagement").addEventListener("click", function () {
      var current = selectedItem(readGrokReminders(), product.value);
      if (current && current.id && current.manage_token) copyText(managementReceipt(current), this);
      else reminderStatus("这块用量表还没有可导出的管理回执。", "error");
    });
    byId("cancelGrokReminder").addEventListener("click", function () {
      var currentStore = readGrokReminders();
      var currentProduct = product.value;
      var current = selectedItem(currentStore, currentProduct);
      if (!current || !current.id || !current.manage_token) return;
      if (!window.confirm("取消这份 Grok 重置日历？已订阅的日历会收到取消回执。")) return;
      this.disabled = true;
      reminderStatus("正在取消……");
      reminderRequest("/api/reset-reminders/" + encodeURIComponent(current.id), "DELETE", {
        manage_token: current.manage_token
      }).then(function () {
        delete currentStore.items[currentProduct];
        saveGrokReminders(currentStore);
        paintGrokReminder(null, currentStore);
        at.value = "";
        applyReminderChecks([1440, 60, 0]);
        reminderStatus("已经取消；个人日程与管理码哈希已删除，只留两周最小取消回执。", "ok");
      }).catch(function (error) {
        reminderStatus(error.name === "AbortError" ? "取消请求超时，请稍后再试。" : error.message, "error");
      }).finally(function () { byId("cancelGrokReminder").disabled = false; });
    });
  }

  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () { copyText(button.dataset.copy || "", button); });
  });
  wireClocks();
  wireGrokReminder();
  syncPublicSources();
}());
