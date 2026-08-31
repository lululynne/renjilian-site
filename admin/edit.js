/* renji.love 站主编辑层 · 仅在登录后由服务端注入到真实页面
   游客拿不到这个文件，页面上也一个编辑元素都没有 */
(function(){
"use strict";

const LV_NAME = {"all-age":"全年龄","tease":"暧昧","r18":"18+"};
const MAX_POST_IMAGES = 9;
const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
let ME = null, CSRF = "", dirty = false, enhancing = false;
const cardsEl = document.getElementById("cards");   // 只有 games.html 有

async function api(path, body){
  const options = body ? {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)} : {};
  if(body && path !== "/api/login" && CSRF) options.headers["x-rj-csrf"] = CSRF;
  const r = await fetch(path, options);
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
    (ME.publish_enabled !== false ? '<button class="rjbtn primary" id="rj-pub">发布上线</button>' : '') +
    '<button class="rjbtn" id="rj-quit">退出</button>';
  document.body.prepend(bar);
  if(cardsEl) document.getElementById("rj-add").addEventListener("click", addCard);
  document.getElementById("rj-save").addEventListener("click", save);
  if(document.getElementById("rj-pub")) document.getElementById("rj-pub").addEventListener("click", publish);
  document.getElementById("rj-quit").addEventListener("click", logout);
}

async function save(){
  say("保存中……");
  try{
    const pendingPreviews = QUESTIONS.flatMap(q => (q.images || []))
      .filter(image => image && image._file && image._preview)
      .map(image => image._preview);
    const questions = await questionsForSave();
    const result = await api("/api/questions", {questions});
    pendingPreviews.forEach(url => URL.revokeObjectURL(url));
    if(Array.isArray(result.questions)){
      QUESTIONS.length = 0;
      QUESTIONS.push(...result.questions);
      render();
    }
    clearDirty();
    say("草稿已落盘" + (result.archived_images ? " · 已收起删除图 " + result.archived_images + " 张" : "") +
      " " + new Date().toLocaleTimeString(), "ok");
  }catch(e){ say("保存失败：" + (e.error || e.message || "未知错误"), "err"); }
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
function newId(){
  return "q-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
function nowISO(){
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-";
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) +
    sign + p(Math.floor(Math.abs(off) / 60)) + ":" + p(Math.abs(off) % 60);
}

/* ── 图文帖子：客户端先缩边，服务端仍会解码验图并二次压缩 ── */
function imageSrc(image){
  if(!image) return "";
  if(image._preview) return image._preview;
  const src = typeof image === "string" ? image : image.src;
  if(!src) return "";
  return src.startsWith("assets/") ? "/" + src : src;
}
function imageItems(q){
  return Array.isArray(q.images) ? q.images.filter(image => image && imageSrc(image)) : [];
}
function blobDataURL(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}
function decodeFileImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("这张图片无法读取")); };
    image.src = url;
  });
}
async function compressImage(file){
  if(!file || !String(file.type || "").startsWith("image/")) throw new Error("只能选择图片");
  if(file.size > MAX_IMAGE_FILE_BYTES) throw new Error("单张图片不能超过 20 MB");
  const image = await decodeFileImage(file);
  if(image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) throw new Error("图片像素过大");
  const edge = 2048;
  const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", {alpha:true});
  if(!context) throw new Error("浏览器无法压缩这张图");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .84));
  if(!blob) blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .86));
  if(!blob) throw new Error("图片压缩失败");
  return blobDataURL(blob);
}
async function questionsForSave(){
  let total = 0, finished = 0;
  QUESTIONS.forEach(q => imageItems(q).forEach(image => { if(image._file) total++; }));
  const output = [];
  for(const q of QUESTIONS){
    const copy = {...q};
    const images = imageItems(q);
    if(images.length || Array.isArray(q.images)) copy.images = [];
    else delete copy.images;
    for(const image of images){
      if(image._file){
        finished++;
        say("正在压缩图片 " + finished + " / " + total + "……");
        copy.images.push({
          alt: image.alt || "",
          _upload: {name:image._file.name || "photo", data:await compressImage(image._file)}
        });
      }else{
        copy.images.push({
          src: image.src,
          alt: image.alt || "",
          width: image.width,
          height: image.height,
          bytes: image.bytes
        });
      }
    }
    output.push(copy);
  }
  return output;
}

function makeImageEditor(container, images){
  const list = container.querySelector(".rj-image-list");
  const picker = container.querySelector(".rj-image-input");
  const note = container.querySelector(".rj-image-note");

  function move(from, to){
    if(to < 0 || to >= images.length) return;
    const [item] = images.splice(from, 1);
    images.splice(to, 0, item);
    renderImages();
  }
  function renderImages(){
    list.innerHTML = "";
    images.forEach((item, index) => {
      const tile = document.createElement("div");
      tile.className = "rj-image-tile";
      const image = document.createElement("img");
      image.src = imageSrc(item);
      image.alt = item.alt || (index === 0 ? "封面预览" : "配图预览");
      const badge = document.createElement("span");
      badge.className = "rj-cover-badge";
      badge.textContent = index === 0 ? "封面" : String(index + 1).padStart(2, "0");
      const alt = document.createElement("input");
      alt.className = "rj-image-alt";
      alt.maxLength = 180;
      alt.placeholder = "图片说明（选填）";
      alt.value = item.alt || "";
      alt.addEventListener("input", () => { item.alt = alt.value; });
      const actions = document.createElement("div");
      actions.className = "rj-image-actions";
      const controls = [
        ["设封面", () => move(index, 0), index === 0],
        ["左移", () => move(index, index - 1), index === 0],
        ["右移", () => move(index, index + 1), index === images.length - 1],
        ["移除", () => { images.splice(index, 1); renderImages(); }, false]
      ];
      controls.forEach(([label, action, disabled]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rj-image-action" + (label === "移除" ? " danger" : "");
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener("click", action);
        actions.appendChild(button);
      });
      tile.append(image, badge, alt, actions);
      list.appendChild(tile);
    });
    container.classList.toggle("is-empty", images.length === 0);
    note.textContent = images.length
      ? images.length + " / " + MAX_POST_IMAGES + " 张 · 首图会成为卡片封面"
      : "可一次多选，最多 " + MAX_POST_IMAGES + " 张；保存时自动压缩";
  }
  picker.addEventListener("change", () => {
    const files = Array.from(picker.files || []);
    const room = MAX_POST_IMAGES - images.length;
    if(files.length > room) say("这篇帖子还能加 " + room + " 张图", "err");
    files.slice(0, room).forEach(file => {
      if(!String(file.type || "").startsWith("image/")) return;
      if(file.size > MAX_IMAGE_FILE_BYTES){ say(file.name + " 超过 20 MB，没有加入", "err"); return; }
      images.push({
        _localId: "img-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
        _file: file,
        _preview: URL.createObjectURL(file),
        alt: ""
      });
    });
    picker.value = "";
    renderImages();
  });
  renderImages();
}

function enhance(){
  if(enhancing || !cardsEl) return;
  enhancing = true;
  try{
    const cards = Array.from(cardsEl.querySelectorAll("article.card:not(.rj-addcard)"));
    cards.forEach((el)=>{
      if(el.dataset.rjEnhanced || el.dataset.rjEditing) return;
      const q = QUESTIONS.find(x => x.id && x.id === el.dataset.qid);   // 按稳定 id 对回数据，不靠下标
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

/* ── 标签 chip 编辑器：回车/逗号/空格成胶囊，带联想与相似提醒 ── */
function makeTagEditor(box, hintEl, tags){
  const input = box.querySelector("input");
  const sug = document.createElement("div");
  sug.className = "rj-sug";
  sug.hidden = true;
  box.appendChild(sug);
  let items = [], hi = -1;

  const clean = t => (t || "").replace(/^#+/, "").replace(/[,，]/g, "").trim();
  const norm = s => (s || "").toLowerCase().replace(/[\s　]+/g, "")
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  function lev(a, b){
    const m = a.length, n = b.length;
    if(Math.abs(m - n) > 2) return 99;
    const d = [];
    for(let i = 0; i <= m; i++){ d[i] = [i]; for(let j = 1; j <= n; j++) d[i][j] = i === 0 ? j : 0; }
    for(let i = 1; i <= m; i++)
      for(let j = 1; j <= n; j++)
        d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return d[m][n];
  }
  function libTags(){   // 已有标签库：全部卡片的 tags 汇总
    const s = new Set();
    QUESTIONS.forEach(c => (c.tags || []).forEach(t => s.add(t)));
    return [...s];
  }
  function similarTo(t){   // 大小写/空格/全半角差异，或编辑距离很近
    const nt = norm(t);
    let best = null, bd = 99;
    for(const x of libTags()){
      if(x === t) continue;
      const nx = norm(x);
      const d = nx === nt ? 0 : lev(nt, nx);
      const lim = Math.max(nt.length, nx.length) >= 4 ? 2 : 1;
      if(d <= lim && d < bd){ bd = d; best = x; }
    }
    return best;
  }

  function renderChips(){
    box.querySelectorAll(".rj-tag").forEach(x => x.remove());
    tags.forEach((t, i) => {
      const c = document.createElement("span");
      c.className = "rj-tag";
      c.innerHTML = "#" + esc(t) + "<b title=\"删除\">×</b>";
      c.querySelector("b").addEventListener("click", () => {
        tags.splice(i, 1); renderChips(); input.focus();
      });
      box.insertBefore(c, input);
    });
  }
  function hideHint(){ hintEl.hidden = true; hintEl.innerHTML = ""; }
  function showHint(added, near){
    hintEl.hidden = false;
    hintEl.innerHTML = "已有相近标签：#" + esc(near) + "，要用它吗？ " +
      '<button class="rjbtn mini" data-a="use">用它</button>' +
      '<button class="rjbtn mini" data-a="keep">保留</button>';
    hintEl.querySelector('[data-a="use"]').addEventListener("click", () => {
      const i = tags.indexOf(added);
      if(i >= 0) tags.splice(i, 1);
      if(!tags.includes(near)) tags.push(near);
      renderChips(); hideHint(); input.focus();
    });
    hintEl.querySelector('[data-a="keep"]').addEventListener("click", () => { hideHint(); input.focus(); });
  }
  function hideSug(){ sug.hidden = true; items = []; hi = -1; }
  function showSug(){
    const v = clean(input.value).toLowerCase();
    items = v ? libTags().filter(t => !tags.includes(t) && t.toLowerCase().includes(v))
      .sort((a, b) => a.toLowerCase().indexOf(v) - b.toLowerCase().indexOf(v) || a.localeCompare(b, "zh"))
      .slice(0, 8) : [];
    if(!items.length) return hideSug();
    hi = 0;
    sug.innerHTML = items.map((t, i) =>
      '<div class="rj-sug-item' + (i === hi ? " hi" : "") + '" data-i="' + i + '">#' + esc(t) + "</div>").join("");
    sug.hidden = false;
    sug.querySelectorAll(".rj-sug-item").forEach(d =>
      d.addEventListener("mousedown", e => { e.preventDefault(); commit(items[+d.dataset.i], true); }));
  }
  function commit(raw, fromSug){
    const t = clean(raw);
    input.value = "";
    hideSug();
    if(!t) return;
    if(tags.includes(t)){ renderChips(); return; }   // 同卡内去重
    tags.push(t);
    renderChips();
    if(!fromSug && !libTags().includes(t)){
      const near = similarTo(t);
      if(near) showHint(t, near); else hideHint();
    } else hideHint();
  }

  input.addEventListener("keydown", e => {
    if(e.key === "Enter"){
      e.preventDefault();
      commit(!sug.hidden && hi >= 0 ? items[hi] : input.value, !sug.hidden && hi >= 0);
    }else if(e.key === "," || e.key === "，" || e.key === " "){
      e.preventDefault();
      commit(input.value);
    }else if(e.key === "Backspace" && !input.value){
      if(tags.length){ tags.pop(); renderChips(); hideHint(); }
    }else if(e.key === "ArrowDown" && !sug.hidden){
      e.preventDefault(); hi = (hi + 1) % items.length; showSugHi();
    }else if(e.key === "ArrowUp" && !sug.hidden){
      e.preventDefault(); hi = (hi - 1 + items.length) % items.length; showSugHi();
    }else if(e.key === "Escape"){
      hideSug();
    }
  });
  function showSugHi(){
    sug.querySelectorAll(".rj-sug-item").forEach((d, i) => d.classList.toggle("hi", i === hi));
  }
  input.addEventListener("input", showSug);
  box.addEventListener("click", () => input.focus());

  renderChips();
  return { commitRest: () => commit(input.value) };
}

function startEdit(el, q){
  const originalImages = imageItems(q).slice();
  const originalLocalIds = new Set(originalImages.filter(image => image._file).map(image => image._localId));
  const images = originalImages.map(image => typeof image === "string" ? {src:image, alt:""} : {...image});
  el.dataset.rjEditing = "1";
  el.classList.add("rj-editing");
  el.innerHTML =
    '<input class="rj-f-title" value="' + esc(q.title) + '" placeholder="标题">' +
    '<textarea class="rj-f-body" placeholder="正文">' + esc(q.body) + '</textarea>' +
    '<select class="rj-f-lv">' +
      '<option value="all-age">全年龄</option>' +
      '<option value="tease">暧昧</option>' +
      '<option value="r18">18+</option>' +
    '</select>' +
    '<select class="rj-f-feature">' +
      '<option value="auto">卡型：自动（按正文长度）</option>' +
      '<option value="body">卡型：正文型（标题沉底）</option>' +
      '<option value="title">卡型：标题引流型（标题置顶）</option>' +
    '</select>' +
    '<section class="rj-image-editor">' +
      '<div class="rj-image-head"><b>帖子图片</b><span class="rj-image-note"></span></div>' +
      '<div class="rj-image-list"></div>' +
      '<label class="rj-image-picker">＋ 从手机或电脑选择图片' +
        '<input class="rj-image-input" type="file" accept="image/*" multiple>' +
      '</label>' +
    '</section>' +
    '<div class="rj-tagbox"><input class="rj-f-taginput" placeholder="打标签，回车成胶囊"></div>' +
    '<div class="rj-taghint" hidden></div>' +
    '<input class="rj-f-src" value="' + esc(q.src) + '" placeholder="来源">' +
    '<div class="rj-edit-ops">' +
      '<button class="rjbtn mini" data-act="cancel">取消</button>' +
      '<button class="rjbtn mini primary" data-act="done">完成</button>' +
    '</div>';
  el.querySelector(".rj-f-lv").value = q.lv;
  el.querySelector(".rj-f-feature").value = q.feature || "auto";
  const tags = (q.tags || []).map(t => (t || "").replace(/^#+/, "").trim()).filter(Boolean);
  const editor = makeTagEditor(el.querySelector(".rj-tagbox"), el.querySelector(".rj-taghint"), tags);
  makeImageEditor(el.querySelector(".rj-image-editor"), images);
  el.querySelector('[data-act="done"]').addEventListener("click", ()=>{
    editor.commitRest();
    const title = el.querySelector(".rj-f-title").value.trim() || q.title;
    if(QUESTIONS.some(x => x !== q && x.title === title) &&
       !confirm("已有同名帖子「" + title + "」，确定保存吗？")) return;
    q.title  = title;
    q.body   = el.querySelector(".rj-f-body").value;
    q.lv     = el.querySelector(".rj-f-lv").value;
    q.lvName = LV_NAME[q.lv];
    q.feature = el.querySelector(".rj-f-feature").value;   // 手动卡型开关：auto/body/title
    q.tags   = tags.map(t => t.trim()).filter(Boolean);
    q.src    = el.querySelector(".rj-f-src").value.trim() || "本站原创";
    originalImages.filter(image => image._file && !images.some(current => current._localId === image._localId))
      .forEach(image => URL.revokeObjectURL(image._preview));
    q.images = images;
    if(!q.id) q.id = newId();
    if(!q.created_at) q.created_at = nowISO();
    markDirty();
    render();
  });
  el.querySelector('[data-act="cancel"]').addEventListener("click", ()=>{
    images.filter(image => image._file && !originalLocalIds.has(image._localId))
      .forEach(image => URL.revokeObjectURL(image._preview));
    render();
  });
}

function delCard(q){
  if(!confirm("删掉「" + q.title + "」？（点「保存草稿」后才真正落盘）")) return;
  const i = QUESTIONS.findIndex(x => x.id ? x.id === q.id : x === q);
  if(i >= 0) QUESTIONS.splice(i, 1);
  markDirty();
  render();
}

function addCard(){
  if(!cardsEl) return;
  // 回到「全部 · 混合版面」并清空搜索与标签筛选，保证新卡一定看得见
  const qbox = document.getElementById("q");
  if(qbox){ qbox.value = ""; kw = ""; }
  document.querySelectorAll("#lv-chips .chip").forEach(x=>x.classList.toggle("on", x.dataset.lv === "all"));
  lvFilter = "all";
  document.querySelectorAll("#board-tabs .seg-tab").forEach(x=>x.classList.toggle("on", x.dataset.board === "mix"));
  boardFilter = "mix";
  tagFilter = null;
  const nq = {id:newId(), created_at:nowISO(), title:"新帖子", body:"", tags:[], images:[],
              lv:"all-age", lvName:"全年龄", src:"本站原创", feature:"auto", author_type:"human"};
  QUESTIONS.push(nq);
  markDirty();
  render();
  const el = cardsEl.querySelector('article.card[data-qid="' + nq.id + '"]');
  if(el){
    startEdit(el, nq);
    el.scrollIntoView({block:"center"});
  }
}

/* ── 启动：确认登录后才出场 ── */
(async function(){
  try{ ME = await api("/api/me"); }
  catch(e){ return; }   // 未登录：什么都不做
  CSRF = ME.csrf || "";
  buildToolbar();
  if(cardsEl){
    try{
      const d = await api("/api/questions");
      QUESTIONS.length = 0;
      QUESTIONS.push(...d);
      // 兜底：老卡若还缺身份证（旧后台保存的），这里补发，保存草稿即落盘
      let patched = false;
      QUESTIONS.forEach(q=>{
        if(!q.id){ q.id = newId(); patched = true; }
        if(!q.created_at){ q.created_at = nowISO(); patched = true; }
      });
      if(patched) markDirty();
      render();
    }catch(e){ say("数据读取失败", "err"); }
    new MutationObserver(()=>enhance()).observe(cardsEl, {childList:true});
    enhance();
  }
})();
})();
