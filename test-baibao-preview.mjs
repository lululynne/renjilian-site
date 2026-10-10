// 百宝箱限时预览壳的纯逻辑（node test-baibao-preview.mjs）。
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const P = require("./rj-baibao-preview.js");
const root = dirname(fileURLToPath(import.meta.url));

let fail = 0;
const t = (name, cond) => {
  if (!cond) {
    fail += 1;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`ok   ${name}`);
  }
};

const HEX32 = "ab".repeat(16);
const PROJECT = "sound-apple-music";
const GOOD = `https://${HEX32}.renji-preview.com/`;
const NOW = Date.parse("2026-10-10T12:00:00.000Z");

function fakeDoc() {
  function El(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.rel = "";
    this.href = "";
    this.target = "";
  }
  El.prototype.setAttribute = function (name, value) {
    this.attributes[name] = String(value);
  };
  El.prototype.getAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  };
  El.prototype.appendChild = function (child) {
    this.children.push(child);
    return child;
  };
  return {createElement: (tag) => new El(tag)};
}

function mockFetch(status, body, options = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({url, init});
    if (options.network) throw new Error("offline");
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        calls[calls.length - 1].readBody = true;
        if (options.badJson) throw new Error("bad json");
        return body;
      },
    };
  };
  return {impl, calls};
}

t("domain constant", P.PREVIEW_DOMAIN === "renji-preview.com");
t("sandbox token exact", P.IFRAME_SANDBOX === "allow-scripts");
t("referrer exact", P.IFRAME_REFERRER === "no-referrer");
for (const token of P.FORBIDDEN_SANDBOX_TOKENS) {
  t(`constant excludes ${token}`, !P.IFRAME_SANDBOX.split(/\s+/).includes(token));
}

t("url canonical", P.validatePreviewUrl(GOOD) === GOOD);
t("url uppercase host", P.validatePreviewUrl(`https://${HEX32.toUpperCase()}.RENJI-PREVIEW.COM/`) === GOOD);
t("url without slash", P.validatePreviewUrl(`https://${HEX32}.renji-preview.com`) === GOOD);
t("url default port", P.validatePreviewUrl(`https://${HEX32}.renji-preview.com:443/`) === GOOD);

const rejected = [
  ["multi label", `https://aa.${HEX32}.renji-preview.com/`],
  ["extra label", `https://${HEX32}.preview.renji-preview.com/`],
  ["suffix attack", `https://${HEX32}.renji-preview.com.evil.com/`],
  ["double suffix", `https://${HEX32}.renji-preview.com.renji-preview.com/`],
  ["foreign", "https://evil.example/"],
  ["http", `http://${HEX32}.renji-preview.com/`],
  ["path", `https://${HEX32}.renji-preview.com/extra`],
  ["query", `https://${HEX32}.renji-preview.com/?<script>`],
  ["hash", `https://${HEX32}.renji-preview.com/#x`],
  ["userinfo", `https://user:pass@${HEX32}.renji-preview.com/`],
  ["port", `https://${HEX32}.renji-preview.com:8443/`],
  ["javascript", "javascript:alert(1)"],
  ["newline", `https://${HEX32}.renji-preview.com/\n`],
  ["backslash", `https://${HEX32}.renji-preview.com\\@evil.com`],
  ["space", `https://${HEX32}.renji-preview.com/ `],
  ["short label", `https://${"ab".repeat(15)}.renji-preview.com/`],
  ["long label", `https://${"ab".repeat(17)}.renji-preview.com/`],
  ["empty", ""],
  ["null", null],
];
for (const [name, value] of rejected) {
  t(`reject ${name}`, P.validatePreviewUrl(value) === null);
}

t("project id ok", P.validateProjectId(PROJECT) === PROJECT);
t("project id short", P.validateProjectId("ab") === null);
t("project id upper", P.validateProjectId("Sound") === null);
t("project id slash", P.validateProjectId("sound/apple") === null);
t("project id newline", P.validateProjectId(`${PROJECT}\n`) === null);
t("project id empty", P.validateProjectId("") === null);

const future = new Date(NOW + 90_000).toISOString();
t("start", P.transition({type: "start", now: NOW}).text === "启动中");

const missing = P.transition({type: "response", status: 404, body: {ok: false, error: "找不到。"}, now: NOW});
t("404 phase", missing.phase === "missing" && missing.text === "已过期或不存在" && missing.previewUrl === null);

const ready = P.transition({
  type: "response",
  status: 200,
  body: {ok: true, previewUrl: GOOD, expiresAt: future},
  now: NOW,
});
t("ready", ready.phase === "ready" && ready.text === "就绪" && ready.previewUrl === GOOD);

const readyWithoutOk = P.transition({
  type: "response",
  status: 200,
  body: {previewUrl: `https://${HEX32.toUpperCase()}.RENJI-PREVIEW.COM/`, expiresAt: future},
  now: NOW,
});
t("ok omitted", readyWithoutOk.phase === "ready" && readyWithoutOk.previewUrl === GOOD);

const badOk = P.transition({
  type: "response",
  status: 200,
  body: {ok: false, previewUrl: GOOD, expiresAt: future},
  now: NOW,
});
t("ok false", badOk.phase === "network" && badOk.text === "网络错误" && badOk.previewUrl === null);

const badUrl = P.transition({
  type: "response",
  status: 200,
  body: {ok: true, previewUrl: "https://evil.example/", expiresAt: future},
  now: NOW,
});
t("bad preview url", badUrl.phase === "network" && badUrl.previewUrl === null);

const stale = P.transition({
  type: "response",
  status: 200,
  body: {ok: true, previewUrl: GOOD, expiresAt: new Date(NOW - 1000).toISOString()},
  now: NOW,
});
t("already expired", stale.phase === "destroyed" && stale.text === "已销毁" && stale.previewUrl === null);

t("tick waiting", P.transition({type: "tick", phase: "ready", expiresAt: future, now: NOW}) === null);
const burned = P.transition({type: "tick", phase: "ready", expiresAt: future, now: NOW + 90_000});
t("tick burned", burned.phase === "destroyed" && burned.text === "已销毁" && burned.previewUrl === null);

t("503", P.transition({type: "response", status: 503, now: NOW}).text === "网络错误");

const line = P.limitedLine(future, NOW);
t("countdown", line.includes("限时预览") && line.includes("还剩") && line.includes("1:30"));
t("due", P.limitedLine(new Date(NOW - 1).toISOString(), NOW).includes("已到时"));

const banner = P.paintBanner(fakeDoc(), P.bannerModel({
  repoUrl: "https://github.com/seayniclabs/sound",
  expiresAt: future,
  now: NOW,
}));
const texts = banner.children.map((child) => child.textContent);
t("banner demo", texts.includes("演示数据"));
t("banner third", texts.includes("第三方内容"));
t("banner limit", texts.some((text) => text.includes("限时预览") && text.includes("还剩") && text.includes("1:30")));
t("banner back", texts.includes("返回原仓库"));
const link = banner.children.find((child) => child.tagName === "A");
t("repo rel", link && link.rel === "noopener noreferrer" && link.target === "_blank");
t("repo href", link && link.href === "https://github.com/seayniclabs/sound");
const unsafe = P.paintBanner(fakeDoc(), P.bannerModel({repoUrl: "http://example.com/repo", now: NOW}));
t("http repo is not a link", unsafe.children.every((child) => child.tagName !== "A"));
t("http repo still labeled", unsafe.children.some((child) => child.textContent === "返回原仓库"));

const frame = P.paintIframe(fakeDoc(), GOOD);
t("iframe sandbox", frame.getAttribute("sandbox") === "allow-scripts");
t("iframe referrer", frame.getAttribute("referrerpolicy") === "no-referrer");
t("iframe title", frame.getAttribute("title") === "限时预览");
t("iframe src", frame.getAttribute("src") === GOOD);
t("iframe allow absent", frame.getAttribute("allow") === null);
for (const token of ["allow-same-origin", "allow-downloads", "allow-popups", "allow-top-navigation"]) {
  t(`iframe excludes ${token}`, !frame.getAttribute("sandbox").split(/\s+/).includes(token));
}
t("iframe rejects foreign", P.paintIframe(fakeDoc(), "https://evil.example/") === null);
t("iframe rejects http", P.paintIframe(fakeDoc(), `http://${HEX32}.renji-preview.com/`) === null);

const verified = {id: PROJECT, status: "verified", experiences: [{type: "sandbox", label: "限时", caption: "演示"}]};
t("entry verified", P.entryFor(verified)?.projectId === PROJECT);
t("entry candidate", P.entryFor({...verified, status: "candidate"}) === null);
t("entry planned", P.entryFor({...verified, status: "planned"}) === null);
t("entry unavailable", P.entryFor({...verified, status: "unavailable"}) === null);
t("entry no sandbox", P.entryFor({status: "verified", experiences: [{level: "remote", url: "https://example.com"}]}) === null);
t("entry bad project id", P.entryFor({id: "Bad Id", status: "verified", experiences: [{type: "sandbox"}]}) === null);
t("entry r18 still logical", P.entryFor({...verified, rating: "r18"})?.projectId === PROJECT);

const notFound = mockFetch(404, {ok: false, error: "找不到。"});
const notFoundState = await P.loadPreview(`https://api.renji.love/ignored/path?x=1`, PROJECT, notFound.impl, NOW, async () => {});
t("load 404", notFoundState.phase === "missing" && notFoundState.text === "已过期或不存在");
t("load 404 skips body", notFound.calls[0].readBody !== true);
t("credentials omit", notFound.calls[0].init.credentials === "omit");
t("redirect error", notFound.calls[0].init.redirect === "error");
t("cache no-store", notFound.calls[0].init.cache === "no-store");
t("method post", notFound.calls[0].init.method === "POST");
t("json body", notFound.calls[0].init.body === JSON.stringify({project_id: PROJECT}));
t("content type", notFound.calls[0].init.headers["content-type"] === "application/json");
t("no cookie header", notFound.calls[0].init.headers.cookie == null);
t("origin only", notFound.calls[0].url === "https://api.renji.love/api/baibao/previews/open");

const down = mockFetch(503, {ok: false, error: "忙"});
const downState = await P.loadPreview("https://api.renji.love", PROJECT, down.impl, NOW, async () => {});
t("load 503", downState.text === "网络错误" && down.calls[0].readBody !== true);

const offline = mockFetch(200, {}, {network: true});
const offlineState = await P.loadPreview("http://127.0.0.1:8799", PROJECT, offline.impl, NOW, async () => {});
t("load offline", offlineState.phase === "network" && offlineState.text === "网络错误");

const garbage = mockFetch(200, null, {badJson: true});
const garbageState = await P.loadPreview("https://api.renji.love", PROJECT, garbage.impl, NOW, async () => {});
t("load bad json", garbageState.phase === "network");

const accepted = mockFetch(200, {previewUrl: GOOD, expiresAt: future});
const acceptedState = await P.loadPreview("https://api.renji.love", PROJECT, accepted.impl, NOW, async () => {});
t("load without ok flag", acceptedState.phase === "ready" && acceptedState.previewUrl === GOOD);

let pollCount = 0;
const polledState = await P.loadPreview("https://api.renji.love", PROJECT, async () => {
  pollCount += 1;
  if (pollCount === 1) return {status: 202};
  return {status: 200, json: async () => ({ok: true, previewUrl: GOOD, expiresAt: future})};
}, NOW, async () => {});
t("202 polls until ready", pollCount === 2 && polledState.phase === "ready");

let called = false;
const emptyBase = await P.loadPreview("", PROJECT, () => {
  called = true;
}, NOW);
t("empty apiBase", called === false && emptyBase.phase === "network" && emptyBase.text === "网络错误");

called = false;
const badCap = await P.loadPreview("https://api.renji.love", "Bad Id", () => {
  called = true;
}, NOW);
t("bad project id skips fetch", called === false && badCap.phase === "missing");

called = false;
const userinfo = await P.loadPreview("https://user:pass@api.renji.love", PROJECT, () => {
  called = true;
}, NOW);
t("userinfo apiBase", called === false && userinfo.phase === "network");

const html = readFileSync(join(root, "baibao.html"), "utf8");
const previewAt = html.indexOf('src="rj-baibao-preview.js"');
const pageAt = html.indexOf('src="baibao.js"');
t("script order", previewAt !== -1 && pageAt !== -1 && previewAt < pageAt);

const pageJs = readFileSync(join(root, "baibao.js"), "utf8");
const moduleJs = readFileSync(join(root, "rj-baibao-preview.js"), "utf8");
t("page has no innerHTML", !pageJs.includes("innerHTML"));
t("module has no innerHTML", !moduleJs.includes("innerHTML"));
t("page has no baked preview", !/https:\/\/[0-9a-f]{32}\.renji-preview\.com/.test(pageJs));
t("module has no baked preview", !/https:\/\/[0-9a-f]{32}\.renji-preview\.com/.test(moduleJs));

const catalog = readFileSync(join(root, "data/mcps.json"), "utf8");
t("catalog has no capability", !/bp_[0-9a-f]{64}/.test(catalog));
t("catalog has no sandbox entry", !catalog.includes('"type": "sandbox"') && !catalog.includes('"type":"sandbox"'));

if (fail) {
  console.error(`${fail} failed`);
  process.exit(1);
}
console.log("baibao preview logic ok");
