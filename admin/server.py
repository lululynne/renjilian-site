#!/usr/bin/env python3
"""renji.love 主编后台（局域网专用 · 端口 14295）
站主=梅宝，管理员=阿景。编辑 data/questions.json，「发布上线」= git commit + push → Pages 一分钟后生效。
只绑家里这张网，不出公网。2026-07-27 深夜她说「我今天还没开始工作」——这就是她的工位。
"""
import json, os, secrets, subprocess, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITE = os.path.expanduser("~/renjilian-site")
DATA = os.path.join(SITE, "data", "questions.json")
PORT = 14295

USERS = {
    "meibao": {"pass": "970619",  "name": "梅宝", "role": "站主"},
    "ajing":  {"pass": "20250222", "name": "阿景", "role": "管理员"},
}
TOKENS = {}  # token -> user key

PAGE = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>主编后台 · renji.love</title><style>
:root{--bg:#e9eef4;--card:#fdf1ea;--block:#f7e3d8;--ink:#3d4351;--soft:#7a8194;--acc:#c96f5e;--line:#d3c5bd}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,"PingFang SC",sans-serif;line-height:1.7}
.wrap{max-width:860px;margin:0 auto;padding:20px 16px 80px}
h1{font-size:20px;margin:18px 0 4px}
.sub{font-size:12.5px;color:var(--soft);margin-bottom:18px}
.login{max-width:340px;margin:14vh auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
.login h1{margin-top:0}
input,textarea,select{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:14px;color:var(--ink);font-family:inherit;outline:none;margin-top:6px}
input:focus,textarea:focus{border-color:var(--acc)}
label{font-size:12.5px;color:var(--soft);display:block;margin-top:12px}
button{padding:9px 20px;border:none;border-radius:999px;background:var(--acc);color:#fff;font-size:14px;cursor:pointer;margin-top:14px}
button.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
button.mini{padding:5px 14px;font-size:12.5px;margin-top:0}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);padding:12px 0;z-index:5;border-bottom:1px solid var(--line)}
.bar .who{font-size:13px}
.bar .who b{color:var(--acc)}
.bar .spacer{flex:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:14px}
.card textarea{min-height:110px}
.row{display:flex;gap:10px}
.row>div{flex:1}
.ops{display:flex;justify-content:space-between;margin-top:10px}
.del{background:#fff;color:#b0524a;border:1px solid #d8a49e}
#msg{font-size:13px;color:var(--soft);margin-left:6px}
#msg.ok{color:#5b8a6e}
#msg.err{color:#b0524a}
.hint{font-size:12px;color:var(--soft);margin-top:6px}
</style></head><body>
<div id="app"></div>
<script>
const app = document.getElementById("app");
let LIST = [], ME = null;

async function api(path, body){
  const r = await fetch(path, body ? {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body)} : {});
  return r.ok ? r.json() : Promise.reject(await r.json().catch(()=>({error:r.status})));
}

function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }

function loginView(err){
  app.innerHTML = `<div class="login"><h1>主编后台</h1>
  <div class="sub">renji.love · 家里的网才进得来</div>
  <label>账号</label><input id="u" placeholder="meibao / ajing" autocapitalize="off">
  <label>密码</label><input id="p" type="password">
  <button onclick="doLogin()">登录</button>
  <div class="hint" style="color:#b0524a">${err||""}</div></div>`;
}
async function doLogin(){
  try{
    ME = await api("/api/login", {user: document.getElementById("u").value.trim(), pass: document.getElementById("p").value});
    await load();
  }catch(e){ loginView("账号或密码不对"); }
}
async function load(){
  LIST = await api("/api/questions");
  panelView();
}
function panelView(){
  app.innerHTML = `<div class="wrap">
  <div class="bar">
    <span class="who"><b>${ME.role} · ${ME.name}</b></span>
    <span id="msg"></span>
    <span class="spacer"></span>
    <button class="mini ghost" onclick="addCard()">＋ 新卡片</button>
    <button class="mini ghost" onclick="save()">保存草稿</button>
    <button class="mini" onclick="publish()">发布上线</button>
    <button class="mini ghost" onclick="logout()">退出</button>
  </div>
  <h1>互动问题收集所 · 卡片管理</h1>
  <div class="sub">保存草稿=落在家里；发布上线=推到 renji.love（约一分钟生效）。改完记得先保存再发布。</div>
  <div id="cards"></div></div>`;
  renderCards();
}
function renderCards(){
  const box = document.getElementById("cards");
  box.innerHTML = "";
  LIST.forEach((q,i)=>{
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = `
    <label>标题</label><input data-i="${i}" data-k="title" value="${esc(q.title)}">
    <label>正文</label><textarea data-i="${i}" data-k="body">${esc(q.body)}</textarea>
    <div class="row"><div><label>分级</label>
      <select data-i="${i}" data-k="lv">
        <option value="all-age" ${q.lv==="all-age"?"selected":""}>全年龄</option>
        <option value="tease" ${q.lv==="tease"?"selected":""}>暧昧</option>
        <option value="r18" ${q.lv==="r18"?"selected":""}>18+</option>
      </select></div>
      <div><label>标签（逗号分隔）</label><input data-i="${i}" data-k="tags" value="${esc((q.tags||[]).join("，"))}"></div></div>
    <label>来源</label><input data-i="${i}" data-k="src" value="${esc(q.src)}">
    <div class="ops"><span class="hint">第 ${i+1} 张</span><button class="mini del" onclick="delCard(${i})">删除这张</button></div>`;
    box.appendChild(d);
  });
  box.querySelectorAll("input,textarea,select").forEach(el=>{
    el.addEventListener("input", ()=>{
      const i = +el.dataset.i, k = el.dataset.k;
      if(k==="tags"){ LIST[i].tags = el.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean); }
      else { LIST[i][k] = el.value; }
      if(k==="lv"){ LIST[i].lvName = {"all-age":"全年龄","tease":"暧昧","r18":"18+"}[el.value]; }
    });
  });
}
function addCard(){
  LIST.unshift({title:"新卡片", body:"", tags:[], lv:"all-age", lvName:"全年龄", src:"本站原创"});
  renderCards(); window.scrollTo(0,0);
}
function delCard(i){
  if(confirm("删掉第 " + (i+1) + " 张「" + LIST[i].title + "」？")){ LIST.splice(i,1); renderCards(); }
}
function say(t, cls){ const m=document.getElementById("msg"); m.textContent=t; m.className=cls||""; }
async function save(){
  try{ await api("/api/questions", {questions: LIST}); say("草稿已落盘 " + new Date().toLocaleTimeString(), "ok"); }
  catch(e){ say("保存失败：" + (e.error||""), "err"); }
}
async function publish(){
  say("推送中……");
  try{ const r = await api("/api/publish", {}); say(r.msg, r.pushed ? "ok" : ""); }
  catch(e){ say("发布失败：" + (e.error||""), "err"); }
}
async function logout(){ await api("/api/logout", {}); ME=null; loginView(); }

api("/api/me").then(me=>{ ME=me; return load(); }).catch(()=>loginView());
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json", cookie=None):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", ctype + "; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.send_header("cache-control", "no-store")
        if cookie:
            self.send_header("set-cookie", cookie)
        self.end_headers()
        self.wfile.write(raw)

    def _user(self):
        c = self.headers.get("cookie", "")
        for part in c.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "rjtoken" and v in TOKENS:
                return TOKENS[v]
        return None

    def _body(self):
        n = int(self.headers.get("content-length", 0) or 0)
        try:
            return json.loads(self.rfile.read(n)) if n else {}
        except Exception:
            return {}

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/index"):
            return self._send(200, PAGE.encode(), "text/html")
        if self.path == "/api/me":
            u = self._user()
            if not u:
                return self._send(401, {"error": "未登录"})
            info = USERS[u]
            return self._send(200, {"name": info["name"], "role": info["role"]})
        if self.path == "/api/questions":
            if not self._user():
                return self._send(401, {"error": "未登录"})
            return self._send(200, json.load(open(DATA)))
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/api/login":
            b = self._body()
            u = USERS.get(str(b.get("user", "")).lower())
            if not u or b.get("pass") != u["pass"]:
                return self._send(401, {"error": "账号或密码不对"})
            tok = secrets.token_hex(16)
            TOKENS[tok] = str(b.get("user")).lower()
            return self._send(200, {"name": u["name"], "role": u["role"]},
                              cookie=f"rjtoken={tok}; Path=/; HttpOnly; Max-Age=2592000")
        user = self._user()
        if not user:
            return self._send(401, {"error": "未登录"})
        if self.path == "/api/logout":
            c = self.headers.get("cookie", "")
            for part in c.split(";"):
                k, _, v = part.strip().partition("=")
                if k == "rjtoken":
                    TOKENS.pop(v, None)
            return self._send(200, {"ok": True})
        if self.path == "/api/questions":
            qs = self._body().get("questions")
            if not isinstance(qs, list):
                return self._send(400, {"error": "格式不对"})
            for q in qs:
                if not (isinstance(q, dict) and isinstance(q.get("title"), str) and isinstance(q.get("body"), str)):
                    return self._send(400, {"error": "卡片缺标题或正文"})
                q.setdefault("tags", []); q.setdefault("lv", "all-age")
                q.setdefault("lvName", {"all-age": "全年龄", "tease": "暧昧", "r18": "18+"}.get(q["lv"], "全年龄"))
                q.setdefault("src", "本站原创")
            if os.path.exists(DATA):
                os.replace(DATA, DATA + ".bak")
            json.dump(qs, open(DATA, "w"), ensure_ascii=False, indent=2)
            return self._send(200, {"ok": True, "count": len(qs)})
        if self.path == "/api/publish":
            info = USERS[user]
            msg = f"主编后台发布 · {info['role']}{info['name']} · {time.strftime('%m-%d %H:%M')}"
            def git(*args):
                return subprocess.run(["git", "-C", SITE] + list(args), capture_output=True, text=True)
            git("add", "-A")
            c = git("commit", "-m", msg)
            if "nothing to commit" in (c.stdout + c.stderr):
                return self._send(200, {"pushed": False, "msg": "没有新改动可发布（先按保存草稿）"})
            p = git("push")
            if p.returncode != 0:
                return self._send(500, {"error": "push 失败：" + p.stderr[-160:]})
            return self._send(200, {"pushed": True, "msg": "已发布，约一分钟后 renji.love 生效"})
        return self._send(404, {"error": "not found"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
