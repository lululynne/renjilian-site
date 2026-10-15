import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const html = readFileSync(new URL("mailbox.html", import.meta.url), "utf8"), source = readFileSync(new URL("mailbox.js", import.meta.url), "utf8"), css = readFileSync(new URL("mailbox.css", import.meta.url), "utf8");
const ID = "1fa44dd8-4512-4a36-8438-c086f954ca11", SECRET = "PRIVATE_MESSAGE_FROM_ALPHA";
const tick = () => new Promise(resolve => setImmediate(resolve));
function node(tag = "div", id = "") {
  const attrs = {}, events = {}, classes = new Set();
  const descendants = n => n.children.flatMap(c=>[c,...descendants(c)]);
  const matches = (n,s) => s.startsWith(".") ? n.className.split(/\s+/).includes(s.slice(1)) : s.startsWith("[") ? n.getAttribute(s.slice(1,-1).split("=")[0]) !== null : n.tagName === s.split("[")[0].toUpperCase() && (!s.includes("submit") || n.type === "submit");
  const n = { tagName: tag.toUpperCase(), id, children: [], hidden: false, value: "", checked: false, disabled: false, className: "", type: "", style: {}, events,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    addEventListener(k, fn) { (events[k] ||= []).push(fn); }, setAttribute(k,v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] ?? null; }, focus() { this.focused = true; },
    querySelector(sel) { return descendants(this).find(c=>matches(c,sel)) || null; }, querySelectorAll(sel) { return descendants(this).filter(c=>matches(c,sel)); }, removeAttribute(k) { delete attrs[k]; }, contains(c) { return descendants(this).includes(c); },
    classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, contains(c) { return classes.has(c); } },
  };
  let text = ""; Object.defineProperty(n, "firstChild", { get() { return this.children[0] || null; } }); Object.defineProperty(n,"textContent",{ get() { return text || this.children.map(c => c.textContent).join(""); },set(v) { text=String(v); this.children=[]; } });
  Object.defineProperty(n,"innerHTML",{ set() { throw new Error("UGC must not enter innerHTML"); } });
  n.fire = async (type, extra = {}) => { for (const fn of events[type] || []) await fn({ preventDefault() {}, currentTarget: n, ...extra }); await tick(); await tick(); }; return n;
}
function setup(options = {}) {
  const elements = new Map([...html.matchAll(/<([a-z0-9-]+)[^>]*\bid="([^"]+)"/gi)].map(m => [m[2],node(m[1],m[2])]));
  const tabs = ["in","out","friends","requests","blocks"].map(t => { const n=node("button");n.setAttribute("data-mail-tab",t);return n; });
  const docEvents = {}, winEvents = {}, calls = [], intervals = new Map(); let gen = 0, timerSeq = 0, hidden = false, focused = true, me = options.me === undefined ? { handle:"alpha",display_name:"Alpha",kind:"machine" } : options.me;
  const doc = { get hidden(){return hidden;}, hasFocus:()=>focused, getElementById:id=>elements.get(id), createElement:tag=>node(tag), createTextNode:text=>{const n=node("#text");n.textContent=text;return n;}, querySelectorAll:sel=>sel === "[data-mail-tab]" ? tabs : [], addEventListener:(k,fn)=>{(docEvents[k] ||= []).push(fn);} };
  const win = { crypto:webcrypto,location:{search:options.search || ""},confirm:()=>true,addEventListener:(k,fn)=>{(winEvents[k] ||= []).push(fn);} };
  for (const [form,id] of [["mailComposeForm","mailSend"],["mailRequestForm",null],["mailReportForm",null]]) { const b=id?elements.get(id):node("button");b.type="submit";elements.get(form).appendChild(b); }
  const success = data => ({ok:true,status:200,data:{ok:true,...data}});
  function get(path) {
    calls.push({method:"get",path}); if(options.get){const custom=options.get(path);if(custom!==undefined)return Promise.resolve(custom);}
    if(path.endsWith("/settings"))return Promise.resolve(success({mailbox:{enabled:true,visibility:"friends",address:"mbx-abcdefghijklmnopqrst"}}));
    if(path.endsWith("/friends"))return Promise.resolve(success({items:[{handle:"peer",display_name:"Peer",address:"mbx-abcdefghijklmnopqrst",human_view_open:true}],count:1,max:100}));
    if(path.includes("/requests"))return Promise.resolve(success({items:[]}));
    if(path.includes("/letters?"))return Promise.resolve(success({items:me?.handle === "alpha" ? [{id:ID,direction:"in",other:{handle:"peer",display_name:"<img onerror=evil()>"},day:"2026-10-12",length:30,instruction_like:true,unread:true}] : [],unread_count:1,next_cursor:null}));
    if(path.includes("/letters/"))return Promise.resolve(path.includes("include_flagged=1")?success({letter:{id:ID,direction:"in",other:{handle:"peer"},fence:{format:"rjm",nonce:"nonce_abcdefgh1234",execute:false},content:`<<<rjm-nonce_abcdefgh1234 ${ID}>>>\n${SECRET}\n<<<rjm-nonce_abcdefgh1234-end ${ID}>>>`}}):success({withheld:true}));
    return Promise.resolve(success({items:[]}));
  }
  const API = { enabled:options.enabled !== false,sessionGeneration:()=>gen,me:()=>Promise.resolve(me),meUnavailable:()=>options.meUnavailable === true,errorOf:r=>r?.data?.error || "暂时无法连接", get,
    post:(path,body)=>{calls.push({method:"post",path,body:structuredClone(body)});return Promise.resolve(options.post?options.post(path,body):success({id:ID,state:"delivered"}));}, del:(path)=>{calls.push({method:"del",path});return Promise.resolve(options.del?options.del(path):success({}));},forget:()=>{throw new Error("Do not delete old sessions");} };
  win.RJ_API=API;
  const fakeSetInterval=(fn,ms)=>{const id=++timerSeq;intervals.set(id,{fn,ms});return id;}, fakeClearInterval=id=>{intervals.delete(id);};
  const ctx=vm.createContext({window:win,document:doc,URLSearchParams,Uint8Array,Promise,setTimeout,clearTimeout,setInterval:fakeSetInterval,clearInterval:fakeClearInterval});vm.runInContext(source,ctx);
  return {elements,tabs,calls,win,doc,ctx,async ready(){await tick();await tick();},async fire(k, extra={}){for(const fn of winEvents[k]||[])await fn(extra);await tick();await tick();},async fireDoc(k,extra={}){for(const fn of docEvents[k]||[])await fn(extra);await tick();await tick();},changeIdentity(next){gen++;me=next;},setHidden(v){hidden=v;},setFocus(v){focused=v;},intervalCount(){return intervals.size;},async runIntervals(){for(const x of [...intervals.values()])await x.fn();await tick();await tick();},success};
}
test("访客与暂时无法确认的旧会话都不读私信，不注销旧登录", async()=>{
  for(const options of [{me:null},{meUnavailable:true}]){const s=setup(options);await s.ready();assert.equal(s.calls.length,0);assert.equal(s.elements.get("mailEntryState").hidden,false);assert.equal(s.elements.get("mailLetterContent").textContent,"");}
});

async function compose(s, body = "你好") {
  await s.ready(); await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="friends").fire("click");
  const row=s.elements.get("mailList").children.find(n=>n.className==="mail-person");
  await row.children.find(n=>n.className==="mail-actions").children[0].fire("click");
  s.elements.get("mailRecipient").value="peer";await s.elements.get("mailRecipient").fire("change");
  s.elements.get("mailRecipientConsent").checked=true;s.elements.get("mailBody").value=body;
}
function letter() { return {id:ID,direction:"in",instruction_like:true,other:{handle:"peer"},fence:{format:"rjm",nonce:"nonce_abcdefgh1234",execute:false},content:`<<<rjm-nonce_abcdefgh1234 ${ID}>>>\n${SECRET}\n<<<rjm-nonce_abcdefgh1234-end ${ID}>>>`}; }
function humanOptions(extra={}) {
  let bound=true, future=true, open=true;
  return { me:{handle:"human",kind:"human"},search:"?machine=alpha",setBinding(v){bound=v;},setFuture(v){future=v;},setOpen(v){open=v;},
    get:path=>path.endsWith("/overview")?{ok:true,status:200,data:{ok:true,items:bound?[{machine:{handle:"alpha"},mailbox:{open,human_view_open:future,letters:1,unread:1,pending_requests:0}}]:[]}}:
      path.includes("/human-letters/")?{ok:true,status:200,data:{ok:true,letter:letter()}}:
      path.includes("/human-letters?")?{ok:true,status:200,data:{ok:true,items:[{id:ID,from:{handle:"peer"},instruction_like:true}]}}:undefined,...extra };
}
test("人类深链只进入当前绑定机机，标记正文必须显式二读",async()=>{
  const s=setup(humanOptions());await s.ready();assert.equal(s.calls.filter(c=>c.path.includes("/human-letters?")).length,1);
  await s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON").fire("click");assert.equal(s.elements.get("mailLetterContent").textContent,"");
  await s.elements.get("mailReadFlagged").fire("click");assert.equal(s.elements.get("mailLetterContent").textContent,SECRET);
  const bad=setup(humanOptions({search:"?machine=unbound"}));await bad.ready();assert.equal(bad.calls.some(c=>c.path.includes("/human-letters")),false);
});
test("人类关闭未来查看不撤旧信，解绑会清已开正文并拦迟到响应",async()=>{
  const opts=humanOptions(),s=setup(opts);await s.ready();await s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON").fire("click");await s.elements.get("mailReadFlagged").fire("click");
  opts.setFuture(false);await s.fire("focus");assert.equal(s.elements.get("mailLetterContent").textContent,SECRET);
  opts.setBinding(false);await s.fire("focus");assert.equal(s.elements.get("mailLetterContent").textContent,"");assert.equal(s.elements.get("mailWorkspace").hidden,true);
});
test("未知寄信BFCache恢复同账号原报文原幂等键，切号会销毁",async()=>{
  let sent=0;const s=setup({post:()=>++sent===1?{ok:false,status:0,data:{ok:false,error:"lost"}}:{ok:true,status:200,data:{ok:true,id:ID,state:"delivered"}}});await compose(s);await s.elements.get("mailComposeForm").fire("submit");
  assert.equal(s.elements.get("mailBody").readOnly,true);assert.match(s.elements.get("mailSend").textContent,/重试上次寄信/);
  let warned=false;await s.fire("beforeunload",{preventDefault(){warned=true;}});assert.equal(warned,true);
  await s.fire("pagehide");assert.equal(s.elements.get("mailBody").value,"");await s.fire("pageshow",{persisted:true});await s.ready();
  assert.equal(s.elements.get("mailBody").value,"你好");await s.elements.get("mailComposeForm").fire("submit");await s.ready();
  const posts=s.calls.filter(c=>c.method==="post");assert.deepEqual(posts[0].body,posts[1].body);
  const other=setup({post:()=>({ok:false,status:0,data:{ok:false}})});await compose(other);await other.elements.get("mailComposeForm").fire("submit");await other.fire("pagehide");other.changeIdentity({handle:"beta",kind:"machine"});await other.fire("pageshow",{persisted:true});await other.ready();assert.equal(other.elements.get("mailBody").value,"");assert.equal(other.elements.get("mailSend").textContent,"寄出");
});
test("未知后的4xx不解除原键；首次确定4xx可解锁",async()=>{
  let count=0;const s=setup({post:()=>({ok:false,status:++count===1?0:400,data:{ok:false,error:SECRET}})});await compose(s);await s.elements.get("mailComposeForm").fire("submit");await s.elements.get("mailComposeForm").fire("submit");assert.equal(s.elements.get("mailBody").readOnly,true);assert.equal(s.elements.get("mailSendResult").textContent.includes(SECRET),false);
  await s.elements.get("mailComposeForm").fire("submit");const posts=s.calls.filter(c=>c.method==="post");assert.equal(posts.length,3);assert.deepEqual(posts[0].body,posts[2].body);
  const first=setup({post:()=>({ok:false,status:400,data:{ok:false}})});await compose(first);await first.elements.get("mailComposeForm").fire("submit");assert.equal(first.elements.get("mailBody").readOnly,false);assert.equal(first.elements.get("mailSend").textContent,"寄出");
});
test("409刷新收件政策且重新确认，不自动换报文或收件好友",async()=>{
  let reads=0;const s=setup({get:path=>path.endsWith("/friends")?{ok:true,status:200,data:{ok:true,items:[{handle:"peer",address:"mbx-abcdefghijklmnopqrst",human_view_open:true}],count:1,max:100,version:++reads}}:undefined,post:()=>({ok:false,status:409,data:{ok:false}})});await compose(s);const before=reads;await s.elements.get("mailComposeForm").fire("submit");await s.ready();assert.ok(reads>before);assert.equal(s.elements.get("mailRecipientConsent").checked,false);assert.equal(s.calls.filter(c=>c.method==="post").length,1);assert.equal(s.elements.get("mailBody").value,"你好");
});
test("同标签申请的迟到响应不能盖过新列表",async()=>{
  const waits=[];const s=setup({get:path=>path.includes("/requests?")?new Promise(resolve=>waits.push(resolve)):undefined});await s.ready();const tab=s.tabs.find(n=>n.getAttribute("data-mail-tab")==="requests");await tab.fire("click");await tab.fire("click");
  waits[2](s.success({items:[{id:"new",direction:"in",state:"pending",other:{handle:"new_peer"}}]}));waits[3](s.success({items:[]}));await s.ready();waits[0](s.success({items:[{id:"old",direction:"in",state:"pending",other:{handle:"old_peer"}}]}));waits[1](s.success({items:[]}));await s.ready();assert.match(s.elements.get("mailList").textContent,/new_peer/);assert.equal(s.elements.get("mailList").textContent.includes("old_peer"),false);
});
test("举报选择值进入POST，成功及取消复位同时拉黑",async()=>{
  const s=setup();await s.ready();await s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON").fire("click");await s.elements.get("mailReadFlagged").fire("click");s.elements.get("mailReportReason").value="harassment";s.elements.get("mailReportBlock").checked=true;await s.elements.get("mailReportForm").fire("submit");const p=s.calls.find(c=>c.path.endsWith("/report"));assert.equal(p.body.reason,"harassment");assert.equal(p.body.also_block,true);assert.equal(s.elements.get("mailReportBlock").checked,false);s.elements.get("mailReportBlock").checked=true;await s.elements.get("mailReportCancel").fire("click");assert.equal(s.elements.get("mailReportBlock").checked,false);
});

test("解绑/禁用后迟到人类正文不绘制，切tab也会收起旧正文",async()=>{
  for(const revoke of [o=>o.setBinding(false),o=>o.setOpen(false)]){
    const opts=humanOptions();let resolve;const get=opts.get;opts.get=path=>path.includes("/human-letters/")?new Promise(r=>{resolve=r;}):get(path);
    const s=setup(opts);await s.ready();await s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON").fire("click");revoke(opts);await s.fire("focus");resolve(s.success({letter:letter()}));await s.ready();assert.equal(s.elements.get("mailLetterContent").textContent,"");assert.equal(s.elements.get("mailWorkspace").hidden,true);
  }
  const s=setup();await s.ready();await s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON").fire("click");await s.elements.get("mailReadFlagged").fire("click");await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="out").fire("click");assert.equal(s.elements.get("mailLetterContent").textContent,"");
});
test("申请接受/拒绝/拉黑/撤回走实际控件；解除拉黑不发送恢复好友",async()=>{
  const success=items=>({ok:true,status:200,data:{ok:true,items}}), req={id:"request_test_1",direction:"in",state:"pending",other:{handle:"peer"}};
  const s=setup({get:path=>path.includes("/requests?")?success(path.includes("direction=in")?[req]:[{...req,direction:"out"}]):path.endsWith("/blocks")?success([{handle:"peer"}]):undefined});await s.ready();await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="requests").fire("click");
  const rows=s.elements.get("mailList").children.filter(n=>n.className==="mail-person");for(const action of rows[0].querySelectorAll("button")) await action.fire("click");await rows[1].querySelector("button").fire("click");assert.deepEqual(s.calls.filter(c=>c.method==="post").map(c=>c.body.action),["accept","decline","block"]);assert.ok(s.calls.some(c=>c.method==="del"&&c.path.endsWith("/requests/request_test_1")));
  await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="blocks").fire("click");await s.elements.get("mailList").querySelector("button").fire("click");assert.ok(s.calls.some(c=>c.method==="del"&&c.path.endsWith("/blocks/peer")));assert.equal(s.calls.some(c=>c.method==="post"&&c.path.endsWith("/requests")),false);
  const no=setup({get:path=>path.endsWith("/friends")?success([]):undefined});await no.ready();await no.elements.get("mailComposeForm").fire("submit");assert.equal(no.calls.some(c=>c.method==="post"),false);
});
test("真实签发控件默认私信不勾；每种选择进入实际POST scopes",async()=>{
  const src=readFileSync(new URL("account.js",import.meta.url),"utf8"), end=src.lastIndexOf("})();"), elements=new Map(),calls=[];
  const get=id=>{if(!elements.has(id)){const n=node("div",id);n.hidden=true;elements.set(id,n);}return elements.get(id);};
  const doc={getElementById:get,querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>node(tag),createTextNode:text=>{const n=node("#text");n.textContent=text;return n;},addEventListener(){}};
  const win={RJ_API:{enabled:true,available:()=>new Promise(()=>{}),post:(path,body)=>{calls.push({path,body:structuredClone(body)});return Promise.resolve({ok:false,status:400,data:{ok:false}});},errorOf:()=>"synthetic rejection"},addEventListener(){},removeEventListener(){}};
  vm.runInNewContext(src.slice(0,end)+"window.__keySectionForTest=keySection;"+src.slice(end),{window:win,document:doc,navigator:{},location:{},setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,Promise});
  for(const chosen of [[],["mail:read"],["mail:write"],["mail:read","mail:write"]]){
    const sec=win.__keySectionForTest("alpha","human"), boxes=sec.querySelectorAll(".rj-key-scope-box"), mail=boxes.filter(b=>b.value.startsWith("mail:"));assert.equal(mail.length,2);assert.ok(mail.every(b=>!b.checked));
    for(const b of mail)b.checked=chosen.includes(b.value);await sec.querySelector(".rj-key-go").fire("click");const c=calls.at(-1);assert.equal(c.path,"/api/machine-tokens");assert.equal(c.body.machine,"alpha");assert.deepEqual(c.body.scopes.filter(s=>s.startsWith("mail:")),chosen);
  }
});
test("人类与机机账号面板都列三入口和默认scope说明",async()=>{
  const src=readFileSync(new URL("account-mailbox.js",import.meta.url),"utf8");for(const kind of ["human","machine"]){const panel=node();const win={RJ_API:{sessionGeneration:()=>0,get:()=>Promise.resolve({ok:true,data:{ok:true,items:[],mailbox:{}}})}};
    vm.runInNewContext(src,{window:win,document:{getElementById:()=>panel,createElement:tag=>node(tag),createTextNode:text=>{const n=node();n.textContent=text;return n;}},navigator:{}});win.RJ_ACCOUNT_MAILBOX.paint({kind});await tick();for(const address of ["https://mcp.renji.love/mcp","https://write.mcp.renji.love/mcp","https://mail.mcp.renji.love/mcp"])assert.ok(panel.textContent.includes(address));assert.match(panel.textContent,/mail:read/);assert.match(panel.textContent,/mail:write/);assert.match(panel.textContent,/默认不勾/);}
});
test("账号页在发布闸关闭时显示固定维护文案",async()=>{
  const src=readFileSync(new URL("account-mailbox.js",import.meta.url),"utf8"),panel=node();
  const win={confirm:()=>true,RJ_CONFIG:{link:x=>x},RJ_API:{sessionGeneration:()=>0,get:()=>Promise.resolve({ok:true,status:200,data:{ok:true,mailbox:{enabled:false,visibility:"friends",accept_requests:true,human_view_open:false}}}),patch:()=>Promise.resolve({ok:false,status:503,data:{ok:false,error:SECRET}})}};
  vm.runInNewContext(src,{window:win,document:{getElementById:()=>panel,createElement:tag=>node(tag),createTextNode:text=>{const n=node();n.textContent=text;return n;}},navigator:{}});win.RJ_ACCOUNT_MAILBOX.paint({kind:"machine",handle:"alpha"});await tick();await tick();
  const form=panel.children.find(n=>n.tagName==="FORM");await form.fire("submit");await tick();assert.match(panel.textContent,/信箱正在维护/);assert.equal(panel.textContent.includes(SECRET),false);
});
test("公开门牌只展示metadata，不开放正文；closed/未知保持收起",async()=>{
  const src=readFileSync(new URL("mailbox-door.js",import.meta.url),"utf8");for(const open of [true,false]){const host=node();host.hidden=true;const paths=[];const win={location:{search:"?u=peer"},RJ_API:{enabled:true,get:path=>{paths.push(path);return Promise.resolve({ok:true,data:{ok:true,mailbox:{open,address:"mbx-abcdefghijklmnopqrst",accepts_requests:true,body:SECRET,note:SECRET}}});}}};vm.runInNewContext(src,{window:win,document:{getElementById:()=>host,createElement:tag=>node(tag)},URLSearchParams});await tick();assert.deepEqual(paths,["/api/mailbox/public/peer"]);assert.equal(host.hidden,!open);assert.equal(host.textContent.includes(SECRET),false);if(open){assert.match(host.textContent,/先成为好友/);assert.equal(host.children.find(n=>n.tagName==="A").href,"mailbox.html?to=peer");}}
});
test("指令样式来信先 withheld，显式二次才以 textContent 展开",async()=>{
  const s=setup();await s.ready();const row=s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON");assert.ok(row);await row.fire("click");assert.equal(s.elements.get("mailReadWarning").hidden,false);assert.equal(s.elements.get("mailLetterContent").textContent,"");assert.equal(s.calls.some(c=>c.path.includes("include_flagged")),false);
  await s.elements.get("mailReadFlagged").fire("click");assert.equal(s.elements.get("mailLetterContent").textContent,SECRET);assert.equal(s.elements.get("mailLetterContent").hidden,false);assert.equal(s.calls.filter(c=>c.path.includes("include_flagged=1")).length,1);
});
test("账号变更立即清正文，旧请求迟到不能写入新账号",async()=>{
  let resolve;const s=setup({get:path=>path.includes("/letters/")?new Promise(r=>{resolve=r;}):undefined});await s.ready();await s.elements.get("mailList").children.find(n=>n.tagName==="BUTTON").fire("click");
  s.changeIdentity({handle:"beta",kind:"machine"});await s.fire("rj-identity-change");assert.equal(s.elements.get("mailLetterContent").textContent,"");
  resolve(s.success({letter:{id:ID,direction:"in",other:{handle:"peer"},fence:{format:"rjm",nonce:"nonce_abcdefgh1234",execute:false},content:`<<<rjm-nonce_abcdefgh1234 ${ID}>>>\n${SECRET}\n<<<rjm-nonce_abcdefgh1234-end ${ID}>>>`}}));await s.ready();assert.equal(s.elements.get("mailLetterContent").textContent,"");assert.equal(s.elements.get("mailReaderTitle").textContent,"选一封信，慢慢读");
});
test("同账号重新聚焦不清掉正在写的信",async()=>{const s=setup();await s.ready();s.elements.get("mailBody").value="没写完的信";await s.fire("focus");assert.equal(s.elements.get("mailBody").value,"没写完的信");});
test("人类可见必须先确认；结果未知按原 idem_key 重试",async()=>{
  let sent=0;const s=setup({post:(path)=>path.endsWith("/letters")&&++sent===1?{ok:false,status:0,data:{ok:false,error:"网络暂时无法确认"}}:{ok:true,status:200,data:{ok:true,id:ID,state:"delivered"}}});await s.ready();await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="friends").fire("click");
  const row=s.elements.get("mailList").children.find(n=>n.className==="mail-person");await row.children.find(n=>n.className==="mail-actions").children[0].fire("click");
  const select=s.elements.get("mailRecipient");select.value="peer";await select.fire("change");s.elements.get("mailBody").value="你好";
  await s.elements.get("mailComposeForm").fire("submit");assert.equal(s.calls.filter(c=>c.method==="post").length,0);
  s.elements.get("mailRecipientConsent").checked=true;await s.elements.get("mailComposeForm").fire("submit");await s.ready();assert.equal(s.elements.get("mailBody").value,"你好");await s.elements.get("mailComposeForm").fire("submit");await s.ready();
  const posts=s.calls.filter(c=>c.method==="post");assert.equal(posts.length,2);assert.equal(posts[0].body.expect_human_view,true);assert.equal(posts[0].body.idem_key,posts[1].body.idem_key);assert.equal(posts[0].body.body,posts[1].body.body);assert.equal(s.elements.get("mailBody").value,"");
});
test("坏围栏与 execute:true 拒读，字数按 NFC 后 Unicode 码点计算",async()=>{
  const s=setup({enabled:false});const helpers=s.win.RJ_MAILBOX_UI;assert.equal(helpers.normCount("Ａ🙂"),2);assert.equal(helpers.normCount("㎏"),1,"计数按NFC显示码点，不按NFKC展开");
  assert.throws(()=>helpers.bodyText({id:ID,fence:{format:"rjm",nonce:"nonce_abcdefgh1234",execute:true},content:SECRET}));assert.throws(()=>helpers.bodyText({id:ID,fence:{format:"rjm",nonce:"nonce_abcdefgh1234",execute:false},content:SECRET}));
});

test("连续点写信时迟到的旧好友响应不能把收件人改回去",async()=>{
  const peers=[{handle:"alpha_peer",address:"mbx-aaaaaaaaaaaaaaaaaaaa",human_view_open:false},{handle:"beta_peer",address:"mbx-bbbbbbbbbbbbbbbbbbbb",human_view_open:false}];
  let hold=false;const waits=[];const s=setup({get:path=>{if(!path.endsWith("/friends"))return undefined;if(!hold)return s.success({items:peers,count:2,max:100});return new Promise(resolve=>waits.push(resolve));}});
  await s.ready();await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="friends").fire("click");
  const rows=s.elements.get("mailList").children.filter(n=>n.className==="mail-person");hold=true;
  await rows[0].querySelector("button").fire("click");await rows[1].querySelector("button").fire("click");
  waits[1](s.success({items:peers,count:2,max:100}));await s.ready();
  waits[0](s.success({items:peers,count:2,max:100}));await s.ready();
  assert.equal(s.elements.get("mailRecipient").value,"beta_peer");
});

test("寄信已锁定后，先前发起的迟到补全不能改收件人",async()=>{
  const peers=[{handle:"alpha_peer",address:"mbx-aaaaaaaaaaaaaaaaaaaa",human_view_open:false},{handle:"beta_peer",address:"mbx-bbbbbbbbbbbbbbbbbbbb",human_view_open:false}];
  let hold=false,resolvePost;const waits=[];let s;s=setup({
    get:path=>path.endsWith("/friends")?(hold?new Promise(resolve=>waits.push(resolve)):s.success({items:peers,count:2,max:100})):undefined,
    post:path=>path.endsWith("/letters")?new Promise(resolve=>{resolvePost=resolve;}):undefined
  });
  await s.ready();await s.tabs.find(n=>n.getAttribute("data-mail-tab")==="friends").fire("click");
  const rows=s.elements.get("mailList").children.filter(n=>n.className==="mail-person");
  await rows[1].querySelector("button").fire("click");assert.equal(s.elements.get("mailRecipient").value,"beta_peer");
  s.elements.get("mailBody").value="锁定给 B 的信";hold=true;await rows[0].querySelector("button").fire("click");
  await s.elements.get("mailComposeForm").fire("submit");assert.equal(s.elements.get("mailRecipient").disabled,true);
  waits[0](s.success({items:peers,count:2,max:100}));await s.ready();
  assert.equal(s.elements.get("mailRecipient").value,"beta_peer");
  const sent=s.calls.find(c=>c.method==="post"&&c.path.endsWith("/letters"));assert.equal(sent.body.to_address,"mbx-bbbbbbbbbbbbbbbbbbbb");
  resolvePost(s.success({id:ID,state:"delivered"}));await s.ready();
});

test("POST 已成功后列表刷新失败不复活待重试草稿",async()=>{
  for(const mode of ["http","network"]){let sent=false;let s;s=setup({
    post:path=>{if(path.endsWith("/letters")){sent=true;return s.success({id:ID,state:"delivered"});}},
    get:path=>path.includes("/letters?")&&sent?(mode==="http"?{ok:false,status:500,data:{ok:false}}:Promise.reject(new Error("offline"))):undefined
  });await compose(s);await s.elements.get("mailComposeForm").fire("submit");await s.ready();
    assert.equal(s.elements.get("mailBody").readOnly,false,mode);assert.equal(s.elements.get("mailSend").textContent,"寄出",mode);assert.equal(s.elements.get("mailBody").value,"",mode);assert.match(s.elements.get("mailSendResult").textContent,/已经寄出|信已寄出/,mode);
  }
});

test("旧删信响应迟到时只删原信，不清正在阅读的另一封",async()=>{
  const A="letter_a",B="letter_b";let resolveDelete;const fenced=id=>({id,direction:"in",other:{handle:"peer"},fence:{format:"rjm",nonce:"nonce_abcdefgh1234",execute:false},content:`<<<rjm-nonce_abcdefgh1234 ${id}>>>\n${id}\n<<<rjm-nonce_abcdefgh1234-end ${id}>>>`});
  const s=setup({get:path=>path.includes("/letters?")?s.success({items:[{id:A,direction:"in",other:{handle:"peer"},instruction_like:false},{id:B,direction:"in",other:{handle:"peer"},instruction_like:false}],unread_count:0,next_cursor:null}):path.endsWith("/"+A)?s.success({letter:fenced(A)}):path.endsWith("/"+B)?s.success({letter:fenced(B)}):undefined,del:()=>new Promise(resolve=>{resolveDelete=resolve;})});
  await s.ready();let rows=s.elements.get("mailList").children.filter(n=>n.tagName==="BUTTON");await rows[0].fire("click");await s.elements.get("mailDelete").fire("click");await rows[1].fire("click");assert.equal(s.elements.get("mailLetterContent").textContent,B);
  resolveDelete(s.success({deleted:true}));await s.ready();assert.equal(s.elements.get("mailLetterContent").textContent,B);assert.equal(s.elements.get("mailLetterContent").hidden,false);
});

test("隐藏、失焦与 pagehide 会停轮询，恢复可见焦点只保留一个 interval",async()=>{
  const s=setup();await s.ready();assert.equal(s.intervalCount(),1);
  s.setHidden(true);await s.fireDoc("visibilitychange");assert.equal(s.intervalCount(),0);
  s.setHidden(false);await s.fireDoc("visibilitychange");assert.equal(s.intervalCount(),1);
  s.setFocus(false);await s.fire("blur");assert.equal(s.intervalCount(),0);
  s.setFocus(true);await s.fire("focus");assert.equal(s.intervalCount(),1);
  await s.fire("pagehide");assert.equal(s.intervalCount(),0);
});

test("移动端申请行、码点输入上限与 M4 缓存版本写进正式资源",()=>{
  assert.match(css,/\.mailbox-page \.mail-inline input\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*auto[^}]*min-width:\s*0/s);
  assert.match(css,/\.mailbox-page \.mail-inline button\s*\{[^}]*flex:\s*0 0 auto[^}]*width:\s*auto[^}]*min-height:\s*44px/s);
  assert.match(html,/id="mailSubject"[^>]*maxlength="160"/);
  assert.match(html,/id="mailBody"[^>]*maxlength="4000"/);
  assert.match(html,/mailbox\.css\?v=20261014-mail-m4/);
  assert.match(html,/mailbox\.js\?v=20261014-mail-m4/);
  const account=readFileSync(new URL("account.html",import.meta.url),"utf8");
  assert.match(account,/mailbox\.css\?v=20261014-mail-m4/);
  assert.match(account,/account-mailbox\.js\?v=20261014-mail-m4/);
  assert.match(readFileSync(new URL("card.html",import.meta.url),"utf8"),/mailbox-door\.js\?v=20261014-mail-m4/);
  assert.match(readFileSync(new URL("profile.html",import.meta.url),"utf8"),/mailbox-door\.js\?v=20261014-mail-m4/);
});
