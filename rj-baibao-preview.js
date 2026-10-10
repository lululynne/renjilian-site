/* 百宝箱限时预览。纯逻辑，不读目录、不写死 preview id。
   baibao.js 只负责把这些函数接到卡片上。

   previewUrl 的合法 host 写死为「恰好一个 32 位小写 hex label + .renji-preview.com」。
   来源：renji-api/src/baibao-preview.js 的 PREVIEW_DOMAIN（2026-10-10）。
   点击时：POST {origin}/api/baibao/previews/open，正文只带稳定的目录 item id，credentials 必须是 omit。
   后端把伪造、过期、已销毁收成同一句 404。父页面读成「已过期或不存在」。
   「已销毁」只来自父页面自己的时钟，或者 200 体里的 expiresAt 已经过去。
   iframe 里面的 503 / 404 跨源读不到，不回写这里的状态。 */
(function (root) {
  "use strict";

  var PREVIEW_DOMAIN = "renji-preview.com";
  var IFRAME_SANDBOX = "allow-scripts";
  var IFRAME_REFERRER = "no-referrer";
  var FORBIDDEN_SANDBOX_TOKENS = [
    "allow-same-origin",
    "allow-downloads",
    "allow-popups",
    "allow-top-navigation",
  ];
  var PROJECT_ID = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
  var LABEL = /^[0-9a-f]{32}$/;

  var copy = {
    starting: "启动中",
    ready: "就绪",
    missing: "已过期或不存在",
    destroyed: "已销毁",
    network: "网络错误",
    demo: "演示数据",
    third: "第三方内容",
    limited: "限时预览",
    back: "返回原仓库",
    tryLabel: "先试玩",
    frameTitle: "限时预览",
  };

  function state(phase, previewUrl, expiresAt) {
    return {
      phase: phase,
      text: copy[phase] || copy.network,
      previewUrl: previewUrl || null,
      expiresAt: expiresAt || null,
    };
  }

  function validateProjectId(value) {
    return typeof value === "string" && PROJECT_ID.test(value) ? value : null;
  }

  function validatePreviewUrl(value) {
    if (typeof value !== "string" || !value) return null;
    if (/[\u0000-\u001f\u007f\\\s]/.test(value)) return null;
    var url;
    try {
      url = new URL(value);
    } catch (_error) {
      return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port) return null;
    if (url.pathname !== "/") return null;
    if (url.search || url.hash) return null;
    var suffix = "." + PREVIEW_DOMAIN;
    if (!url.hostname.endsWith(suffix)) return null;
    var label = url.hostname.slice(0, -suffix.length);
    if (!LABEL.test(label)) return null;
    var canonical = "https://" + label + suffix + "/";
    if (url.href !== canonical) return null;
    return canonical;
  }

  function parseExpiry(value) {
    if (typeof value !== "string" || !value) return null;
    var ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }

  function transition(event) {
    var now = event && typeof event.now === "number" ? event.now : Date.now();
    if (!event || !event.type) return state("network");
    if (event.type === "start") return state("starting");
    if (event.type === "tick") {
      var tickAt = parseExpiry(event.expiresAt);
      if (event.phase === "ready" && tickAt !== null && now >= tickAt) {
        return state("destroyed", null, new Date(tickAt).toISOString());
      }
      return null;
    }
    if (event.type === "failure") return state("network");
    if (event.type !== "response") return state("network");
    if (event.status === 202) return state("starting");
    if (event.status === 404) return state("missing");
    if (event.status !== 200) return state("network");
    var body = event.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return state("network");
    if (body.ok !== undefined && body.ok !== true) return state("network");
    var href = validatePreviewUrl(body.previewUrl);
    var exp = parseExpiry(body.expiresAt);
    if (!href || exp === null) return state("network");
    var iso = new Date(exp).toISOString();
    if (exp <= now) return state("destroyed", null, iso);
    return state("ready", href, iso);
  }

  function openUrl(apiBase, projectId) {
    if (!validateProjectId(projectId)) return null;
    if (typeof apiBase !== "string" || !apiBase) return null;
    var base;
    try {
      base = new URL(apiBase);
    } catch (_error) {
      return null;
    }
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    if (base.username || base.password) return null;
    if (!base.origin || base.origin === "null") return null;
    return base.origin + "/api/baibao/previews/open";
  }

  function loadPreview(apiBase, projectId, fetchImpl, now, waitImpl) {
    projectId = validateProjectId(projectId);
    if (!projectId) return Promise.resolve(state("missing"));
    var url = openUrl(apiBase, projectId);
    if (!url) return Promise.resolve(state("network"));
    var impl = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!impl) return Promise.resolve(state("network"));
    var init = {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({project_id: projectId}),
    };
    var wait = waitImpl || function (ms) {
      return new Promise(function (resolve) { root.setTimeout(resolve, ms); });
    };
    function attempt(index) {
      return Promise.resolve().then(function () { return impl(url, init); })
      .then(function (response) {
        var status = response && typeof response.status === "number" ? response.status : 0;
        if (status === 404) return state("missing");
        if (status === 202) {
          if (index >= 39) return state("network");
          return Promise.resolve(wait(750)).then(function () { return attempt(index + 1); });
        }
        if (status !== 200) return state("network");
        return Promise.resolve()
          .then(function () {
            return response.json();
          })
          .then(function (body) {
            return transition({type: "response", status: 200, body: body, now: now});
          })
          .catch(function () {
            return state("network");
          });
      })
      .catch(function () {
        return state("network");
      });
    }
    return attempt(0);
  }

  function limitedLine(expiresAt, now) {
    var exp = parseExpiry(expiresAt);
    if (exp === null) return copy.limited;
    var clock = typeof now === "number" ? now : Date.now();
    var left = exp - clock;
    if (left <= 0) return copy.limited + " · 已到时";
    var total = Math.ceil(left / 1000);
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return copy.limited + " · 还剩 " + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  function repoHref(repoUrl) {
    if (typeof repoUrl !== "string" || !repoUrl) return null;
    var url;
    try {
      url = new URL(repoUrl);
    } catch (_error) {
      return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.href;
  }

  function bannerModel(input) {
    var source = input || {};
    return {
      demo: copy.demo,
      third: copy.third,
      limited: limitedLine(source.expiresAt, source.now),
      back: copy.back,
      repoUrl: repoHref(source.repoUrl),
    };
  }

  function paragraph(doc, className, text) {
    var element = doc.createElement("p");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function paintBanner(doc, model) {
    var banner = doc.createElement("div");
    banner.className = "treasure-sandbox-banner";
    banner.setAttribute("role", "note");
    banner.appendChild(paragraph(doc, "treasure-sandbox-demo", model.demo));
    banner.appendChild(paragraph(doc, "treasure-sandbox-third", model.third));
    var limit = paragraph(doc, "treasure-sandbox-limit", model.limited);
    limit.setAttribute("data-sandbox-limit", "");
    banner.appendChild(limit);
    if (model.repoUrl) {
      var anchor = doc.createElement("a");
      anchor.className = "treasure-sandbox-repo";
      anchor.textContent = model.back;
      anchor.href = model.repoUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      banner.appendChild(anchor);
    } else {
      banner.appendChild(paragraph(doc, "treasure-sandbox-repo", model.back));
    }
    return banner;
  }

  function paintIframe(doc, previewUrl) {
    var href = validatePreviewUrl(previewUrl);
    if (!href) return null;
    var frame = doc.createElement("iframe");
    frame.className = "treasure-sandbox-frame";
    frame.setAttribute("sandbox", IFRAME_SANDBOX);
    frame.setAttribute("referrerpolicy", IFRAME_REFERRER);
    frame.setAttribute("title", copy.frameTitle);
    frame.setAttribute("src", href);
    return frame;
  }

  function entryFor(item) {
    if (!item || item.status !== "verified" || !Array.isArray(item.experiences)) return null;
    for (var i = 0; i < item.experiences.length; i += 1) {
      var experience = item.experiences[i];
      if (!experience || experience.type !== "sandbox") continue;
      var projectId = validateProjectId(item.id);
      if (!projectId) continue;
      return {
        projectId: projectId,
        label: typeof experience.label === "string" ? experience.label : copy.tryLabel,
        caption: typeof experience.caption === "string" ? experience.caption : "",
      };
    }
    return null;
  }

  var api = {
    PREVIEW_DOMAIN: PREVIEW_DOMAIN,
    IFRAME_SANDBOX: IFRAME_SANDBOX,
    IFRAME_REFERRER: IFRAME_REFERRER,
    FORBIDDEN_SANDBOX_TOKENS: FORBIDDEN_SANDBOX_TOKENS,
    copy: copy,
    validateProjectId: validateProjectId,
    validatePreviewUrl: validatePreviewUrl,
    transition: transition,
    openUrl: openUrl,
    loadPreview: loadPreview,
    bannerModel: bannerModel,
    limitedLine: limitedLine,
    paintBanner: paintBanner,
    paintIframe: paintIframe,
    entryFor: entryFor,
  };
  root.RJ_BAIBAO_PREVIEW = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
