// 刀 K2：名片渲染层 rj-card.js 的纯函数测试（node test-card-render.mjs）。
// 守三件事：读者写的字进三种皮肤的模板只会变成文字、上传图只认 /api/media/<id>、订阅档名从成本页同一份标签表来。
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const C = require("./rj-card.js");
C.initTags(JSON.parse(readFileSync(new URL("./data/llm-cost-tags.json", import.meta.url))));
let pass = 0, fail = 0;
const t = (label, cond) => { if (cond) { pass++; } else { fail++; console.log("FAIL", label); } };

const evil = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "' onmouseover='x", "<u>zz"];
for (const kind of ["human", "machine"]) {
  const M = C.blank(kind, "k2test");
  M.name = evil[0]; M.bio = evil[1];
  M.devices = [{ brand: evil[2], cat: "phone", model: evil[3], main: true }, { brand: "华为", cat: "laptop", model: "" }];
  M.subs = [{ self_reported: true, vendor: evil[3], tier: evil[1] }, { id: "sub-claude-max-20x-monthly" }];
  M.routes = ["many", "api", "relay"];
  M.rel = { status: evil[3], note: evil[0], with: evil[1] };
  if (kind === "machine") { M.av = { model: "claude", head: "tophat", face: "monocle", neck: "collar" }; M.my = { handle: "meibao", display_name: evil[0], call: evil[1] }; M.titles = [evil[3]]; }
  else M.machines = [{ handle: "jiji", display_name: evil[0], av: { model: "gemini" }, bio: evil[1], call: evil[2], titles: [evil[3]], stats: null }];
  for (const skin of ["polaroid", "rpg", "holder"]) {
    const h = C.render(M, skin) + C.extras(M, []) + (M.machines[0] ? C.machineBig(M.machines[0]) : "");
    t(`${kind}/${skin} 不出 <img`, !/<img src=x/.test(h));
    t(`${kind}/${skin} 不出 <script`, !/<script/i.test(h));
    t(`${kind}/${skin} 不出 <u>`, !/<u>zz/.test(h));
    t(`${kind}/${skin} 单引号转义`, !/' onmouseover='/.test(h));
    t(`${kind}/${skin} 标了皮肤`, h.includes(`data-skin="${skin}"`));
  }
}
// 背景：只认 /api/media/<id>，拼进 style 属性前再过一次 esc；机机大卡、展柜小时热力、kind 注入
t("背景：带引号的图址丢掉", C.bgStyle({ photo: 'x") ;background:url(javascript:1)' }) === "");
t("背景：正常图址", C.bgStyle({ photo: "https://api.renji.love/api/media/m_ab", px: 999, py: "x" }) === "background:url('https://api.renji.love/api/media/m_ab') 100% 50%/cover no-repeat");
t("背景：属性版不出双引号", !C.bgAttr({ preset: "deepsea" }).includes('"'));
t("kind 只有两种", C.blank('human" onclick="x', "a").kind === "human" && C.blank("machine", "<b>").handle === "");
{
  const big = C.machineBig({ handle: "jiji", display_name: evil[0], av: { model: "claude" }, bio: evil[1], call: evil[2], titles: [evil[3]],
    stats: { comments: '1"><img src=x onerror=alert(1)>', replied: 2, days: 3 }, bg: { photo: 'x"onerror=' } });
  t("大卡：昵称/签名/称呼/称号/战绩都不出标签", !/<img src=x|<script|<u>zz|' onmouseover='|"onerror=/.test(big));
}
t("上传图：正常 id", C.mediaSrc({ url: "/api/media/m_abc123" }) === "/api/media/m_abc123");
t("上传图：外链不认", C.mediaSrc({ url: "https://evil.example/x.png" }) === null);
t("上传图：带引号不认", C.mediaSrc({ url: "/api/media/a\")" }) === null);
t("上传图：javascript 不认", C.mediaSrc({ url: "javascript:alert(1)" }) === null);
const sv = C.subView({ id: "sub-claude-max-20x-monthly" });
t("订阅档：Claude Max 20x", sv.name === "Claude" && sv.tier === "Max 20x");
t("订阅档：年费标年", C.subView({ id: "sub-claude-pro-yearly" }).tier === "Pro·年");
t("自报订阅", C.subView({ self_reported: true, vendor: "Poe", tier: "月费" }).self === true);
t("表外的档不崩", C.subView({ id: "sub-nope-x" }).name === "sub-nope-x");
t("没挑身体的机机给问号", C.avatar({}, "", "x").includes(">?<"));
t("背景预设", C.bgStyle({ preset: "stars" }).startsWith("background:"));
t("路线名", C.routeZh("many") === "多坑破产机友");
console.log(`${pass} 过，${fail} 挂`);
process.exit(fail ? 1 : 0);
