/* 第二人称 · 公开额度观察
   只读取公开数据源；个人恢复时间仅保存在当前浏览器 localStorage。 */
(function () {
  "use strict";

  var CODEX_FORECAST = "https://codex-reset.com/api/forecast";
  var CLAUDE_SUMMARY = "https://claude-resets.com/data/summary.json";
  var CLAUDE_EVENTS = "https://claude-resets.com/data/resets.json";
  var CLOCK_KEY = "second-person.reset-clocks.v1";

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

  function syncPublicSources() {
    var codex = fetchJson(CODEX_FORECAST);
    var claudeSummary = fetchJson(CLAUDE_SUMMARY);
    var claudeEvents = fetchJson(CLAUDE_EVENTS);
    return Promise.allSettled([codex, claudeSummary, claudeEvents]).then(function (rows) {
      var ok = 0, fresh = true;
      if (rows[0].status === "fulfilled") {
        try { fresh = renderCodex(rows[0].value) && fresh; ok++; } catch (_) { markCodexFailure(); fresh = false; }
      } else { markCodexFailure(); fresh = false; }
      if (rows[1].status === "fulfilled" && rows[2].status === "fulfilled") {
        try { fresh = renderClaude(rows[1].value, rows[2].value) && fresh; ok++; } catch (_) { markClaudeFailure(); fresh = false; }
      } else { markClaudeFailure(); fresh = false; }
      var state = byId("syncState");
      if (state) {
        state.textContent = ok === 2 && fresh ? "公开数据已同步" : (ok ? "部分数据可能过期" : "公开源暂不可用");
        state.className = "source-state " + (ok === 2 && fresh ? "fresh" : "stale");
      }
      setText("syncTime", "本页核查 " + new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
      document.body.dataset.resetBoard = ok === 2 ? "ready" : "degraded";
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

  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", function () { copyText(button.dataset.copy || "", button); });
  });
  wireClocks();
  syncPublicSources();
}());
