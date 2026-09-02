/* 额度重置公开页的静态合同：来源、隐私、入口和失效态不能回退。 */
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./codex.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("./reset-board.js", import.meta.url), "utf8");
const text = html + "\n" + js;

assert.match(js, /https:\/\/codex-reset\.com\/api\/forecast/, "Codex 读取公开预测 API");
assert.match(js, /https:\/\/claude-resets\.com\/data\/summary\.json/, "Claude 读取公开摘要");
assert.match(js, /https:\/\/claude-resets\.com\/data\/resets\.json/, "Claude 读取公开事件档案");
assert.match(html, /id="claudeEventBadge"/, "Claude 官方公告状态在前");
assert.match(html, /id="claudeTier"/, "Claude 有低中高判断");
assert.match(html, /href="https:\/\/claude\.ai\/settings\/usage"/, "Claude 网页 Usage 入口存在");
assert.match(html, /<code>\/usage<\/code>/, "Claude Code 原生命令正确");
assert.doesNotMatch(html, /<code>\/usage-credits<\/code>/, "不再教错误命令");
assert.match(html, /Scorpio3310\/claude-code-usage-statusline/, "可信额度条项目有链接");
assert.match(html, /api\.anthropic\.com/, "第三方远程读取有供应链提醒");
assert.match(js, /document\.body\.dataset\.resetBoard = ok === 2 \? "ready" : "degraded"/, "公开源失败有降级状态");
assert.match(js, /localStorage\.setItem\(CLOCK_KEY/, "个人倒计时只存本机");
assert.doesNotMatch(text, /新小号|8 月 30 日 02:40|resets 7pm|用掉 98%|你的 Codex 额度/, "当前公开源码不含私人现场");
assert.doesNotMatch(text, /正在核证|正在重新核对|草稿版 v0/, "没有施工占位文案");
assert.doesNotMatch(html, /class="size"/, "不向公众暴露内部栅格标注");
assert.match(html, /id="syncState"/, "页面显示同步与过期态");
assert.match(html, /个人倒计时仅保存在当前浏览器/, "隐私边界公开说明");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML id 不重复");

new Function(js);
console.log("结果：18 过，0 挂 · 双源、Claude 三级、额度入口、隐私与降级合同全通");
