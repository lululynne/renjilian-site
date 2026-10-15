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
assert.match(js, /document\.body\.dataset\.resetBoard = ok === 3 \? "ready" : "degraded"/, "三家公开源失败有降级状态");
assert.match(js, /localStorage\.setItem\(CLOCK_KEY/, "个人倒计时只存本机");
assert.doesNotMatch(text, /新小号|8 月 30 日 02:40|resets 7pm|用掉 98%|你的 Codex 额度/, "当前公开源码不含私人现场");
assert.doesNotMatch(text, /正在核证|正在重新核对|草稿版 v0/, "没有施工占位文案");
assert.doesNotMatch(html, /class="size"/, "不向公众暴露内部栅格标注");
assert.match(html, /id="syncState"/, "页面显示同步与过期态");
assert.match(html, /Claude 个人倒计时仅存在当前浏览器/, "Claude 本机倒计时隐私边界公开说明");
assert.match(html, /Grok 日历与本站登录账号无关/, "Grok 私密日历独立于登录账号");
assert.match(html, /class="summary-card grok"[^>]+href="#grok-board"/, "Grok 摘要卡保留为第三家入口");
assert.match(html, /id="grok-board"/, "Grok 摘要能到自己的说明区");
assert.match(html, /reset-card-name">GPT</, "GPT 家族有明确卡名");
assert.match(html, /GPT · Codex/, "明确观察 Codex 产品，不混作 ChatGPT 全部额度");
assert.match(html, /id="grokSummary">读取中</, "Grok 快照读取前不编造重置时间");
assert.match(html, /https:\/\/docs\.x\.ai\/grok\/faq/, "Grok 个人周期指回官方帮助");
assert.match(html, /https:\/\/prod\.cursor\.com\/help\/grok-bot\/plans/, "Grok Bot 当前方案说明可回源");
assert.match(js, /ok === 3 && fresh \? "Codex \/ Claude \/ Grok 已同步"/, "三家全部成功且新鲜后才报告同步");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML id 不重复");

new Function(js);
console.log("额度页合同通过：三家入口、两路动态源与 Grok 官方快照、隐私与降级。");
