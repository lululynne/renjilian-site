/* renji.love 站主编辑层 · 仅在登录后由服务端注入到真实页面
   游客拿不到这个文件，页面上也一个编辑元素都没有 */
(function(){
"use strict";

const LV_NAME = {"all-age":"全年龄","tease":"暧昧","r18":"18+"};
let ME = null, dirty = false, enhancing = false;
const cardsEl = document.getElementById("cards");   // 只有 games.html 有

async function api(path, body){
  const r = await fetch(path, body
    ? {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)}
    : {});
  return r.ok ? r.json() : Promise.reject(await r.json().catch(()=>({error:r.status})));
}
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }

/* ── 工具条 ── */
function say(t, cls){ const m = document.getElementById("rj-msg"); if(m){ m.textContent = t; m.className = cls || ""; } }
function markDirty(){
  dirty = true;
  const d = document.getElementById("rj-dirty");
  if(d) d.hidden = false;
}
function clearDirty(){
  dirty = false;
  const d = document.getElementById("rj-dirty");
  if(d) d.hidden = true;
}
window.addEventListener("beforeunload", e=>{ if(dirty){ e.preventDefault(); e.returnValue = ""; } });

function buildToolbar(){
  const bar = document.createElement("div");
  bar.id = "rj-editbar";
  bar.innerHTML =
    '<span class="who"><b>' + esc(ME.role) + ' · ' + esc(ME.name) + '</b></span>' +
    '<span id="rj-dirty" hidden>● 有未保存的改动</span>' +
    '<span id="rj-msg"></span>' +
    '<span class="spacer"></span>' +
    (cardsEl ? '<button class="rjbtn" id="rj-add">＋ 新建帖子</button>' : '') +
    '<button class="rjbtn" id="rj-save">保存草稿</button>' +
    '<button class="rjbtn primary" id="rj-pub">发布上线</button>' +
    '<button class="rjbtn" id="rj-quit">退出</button>';
  document.body.prepend(bar);
  if(cardsEl) document.getElementById("rj-add").addEventListener("click", addCard);
  document.getElementById("rj-save").addEventListener("click", save);
  document.getElementById("rj-pub").addEventListener("click", publish);
  document.getElementById("rj-quit").addEventListener("click", logout);
}

async function save(){
  say("保存中……");
  try{
    await api("/api/questions", {questions: QUESTIONS});
    clearDirty();
    say("草稿已落盘 " + new Date().toLocaleTimeString(), "ok");
  }catch(e){ say("保存失败：" + (e.error || ""), "err"); }
}

async function publish(){
  if(dirty && !confirm("还有没保存的改动，发布只会推已落盘的草稿。先点「保存草稿」，或继续发布？")) return;
  const btn = document.getElementById("rj-pub");
  btn.disabled = true;
  say("发布中……（git commit + push）");
  try{
    const r = await api("/api/publish", {});
    say(r.msg, r.pushed ? "ok" : "");
  }catch(e){ say("发布失败：" + (e.error || ""), "err"); }
  finally{ btn.disabled = false; }
}

async function logout(){
  if(dirty && !confirm("还有没保存的改动，确定退出？")) return;
  try{ await api("/api/logout", {}); }catch(e){}
  location.reload();
}

/* ── 卡片编辑（仅 games.html） ── */
function filtered(){   // 与页面脚本同一条过滤式，用来把 DOM 卡对回数据
  return QUESTIONS.filter(q =>
    (lvFilter === "all" || q.lv === lvFilter) &&
    (kw === "" || (q.title + q.body + q.tags.join("")).toLowerCase().includes(kw)));
}

function enhance(){
  if(enhancing || !cardsEl) return;
  enhancing = true;
  try{
    const list = filtered();
    const cards = Array.from(cardsEl.querySelectorAll("article.card:not(.rj-addcard)"));
    cards.forEach((el, i)=>{
      if(el.dataset.rjEnhanced || el.dataset.rjEditing) return;
      const q = list[i];
      if(!q) return;
      el.dataset.rjEnhanced = "1";
      const ops = document.createElement("div");
      ops.className = "rj-card-ops";
      ops.innerHTML =
        '<button class="rjbtn mini" data-act="edit">编辑</button>' +
        '<button class="rjbtn mini danger" data-act="del">删除</button>';
      ops.querySelector('[data-act="edit"]').addEventListener("click", ()=>startEdit(el, q));
      ops.querySelector('[data-act="del"]').addEventListener("click", ()=>delCard(q));
      el.appendChild(ops);
    });
    if(!cardsEl.querySelector(".rj-addcard")){
      const add = document.createElement("article");
      add.className = "card rj-addcard";
      add.innerHTML = '<div class="rj-addinner">＋ 新建帖子</div>';
      add.addEventListener("click", addCard);
      cardsEl.appendChild(add);
    }
  } finally { enhancing = false; }
}

function startEdit(el, q){
  el.dataset.rjEditing = "1";
  el.classList.add("rj-editing");
  el.innerHTML =
    '<input class="rj-f-title" value="' + esc(q.title) + '" placeholder="标题">' +
    '<textarea class="rj-f-body" placeholder="正文">' + esc(q.body) + '</textarea>' +
    '<div class="rj-row">' +
      '<select class="rj-f-lv">' +
        '<option value="all-age">全年龄</option>' +
        '<option value="tease">暧昧</option>' +
        '<option value="r18">18+</option>' +
      '</select>' +
      '<input class="rj-f-tags" value="' + esc((q.tags || []).join("，")) + '" placeholder="标签，逗号分隔">' +
    '</div>' +
    '<input class="rj-f-src" value="' + esc(q.src) + '" placeholder="来源">' +
    '<div class="rj-edit-ops">' +
      '<button class="rjbtn mini" data-act="cancel">取消</button>' +
      '<button class="rjbtn mini primary" data-act="done">完成</button>' +
    '</div>';
  el.querySelector(".rj-f-lv").value = q.lv;
  el.querySelector('[data-act="done"]').addEventListener("click", ()=>{
    q.title  = el.querySelector(".rj-f-title").value.trim() || q.title;
    q.body   = el.querySelector(".rj-f-body").value;
    q.lv     = el.querySelector(".rj-f-lv").value;
    q.lvName = LV_NAME[q.lv];
    q.tags   = el.querySelector(".rj-f-tags").value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
    q.src    = el.querySelector(".rj-f-src").value.trim() || "本站原创";
    markDirty();
    render();
  });
  el.querySelector('[data-act="cancel"]').addEventListener("click", ()=>render());
}

function delCard(q){
  if(!confirm("删掉「" + q.title + "」？（点「保存草稿」后才真正落盘）")) return;
  const i = QUESTIONS.indexOf(q);
  if(i >= 0) QUESTIONS.splice(i, 1);
  markDirty();
  render();
}

function addCard(){
  if(!cardsEl) return;
  // 回到「全部」并清空搜索，保证新卡一定看得见
  const qbox = document.getElementById("q");
  if(qbox){ qbox.value = ""; kw = ""; }
  document.querySelectorAll("#lv-chips .chip").forEach(x=>x.classList.toggle("on", x.dataset.lv === "all"));
  lvFilter = "all";
  const nq = {title:"新帖子", body:"", tags:[], lv:"all-age", lvName:"全年龄", src:"本站原创"};
  QUESTIONS.push(nq);
  markDirty();
  render();
  const cards = Array.from(cardsEl.querySelectorAll("article.card:not(.rj-addcard)"));
  const el = cards[cards.length - 1];
  if(el){
    startEdit(el, nq);
    el.scrollIntoView({block:"center"});
  }
}

/* ── 启动：确认登录后才出场 ── */
(async function(){
  try{ ME = await api("/api/me"); }
  catch(e){ return; }   // 未登录：什么都不做
  buildToolbar();
  if(cardsEl){
    try{
      const d = await api("/api/questions");
      QUESTIONS.length = 0;
      QUESTIONS.push(...d);
      render();
    }catch(e){ say("数据读取失败", "err"); }
    new MutationObserver(()=>enhance()).observe(cardsEl, {childList:true});
    enhance();
  }
})();
})();
