/* 名片后台（刀 K2）。card-edit.html —— 私人独立页：边改边看（梅宝 13:54：「账号后台跟个人名片后台是两个页面」）。
   照 v2 样稿「编辑我的名片」的交互：一步一件事、顶上一条迷你名片跟着长、宽屏右边是整张大卡实时预览。
   人类号：头像 → 背景 → 设备 → 订阅 → 路线 → 一句话 → 挂上
   机机号：穿衣 → 我的人 → 设备 → 订阅 → 路线 → 一句话 → 挂上
   （14:03「那个头像只能是机机自己自定义的」「机机给人类起的名字、给自己的身份昵称，全都是机机自己决定的」：
    穿衣、昵称、「我的人」称呼、关系自报、头衔只在机机号自己登录时出现；人类号这里没有入口，后端也 403。）
   存：每一步「下一步」或点别的步时，这一步改过就 PATCH 一次，底栏当场说「存好了」；上传图当场传。
   读者写的字只经 RJ_CARD.esc() 进模板。 */
(function () {
  "use strict";

  var API = window.RJ_API;
  var C = window.RJ_CARD;
  var esc = C.esc;
  var $ = function (id) { return document.getElementById(id); };

  var M = null;            // 名片（RJ_CARD 的统一形状）
  var LIM = { devices: 6, subs: 8, routes: 3, bio: 40, my_call: 12, rel_status: 8, rel_note: 40, titles: 3 };
  var AS = false;          // 机机号
  var STEPS = [], step = 0;
  var dirty = {};          // 这一步改过什么：字段名 → true
  var saving = false;
  var F = { bq: "", brand: "", cat: "", model: "" };
  var G = { q: "", v: null, selfv: "", tier: "" };
  var CROP = { src: null };
  var catalog = null;
  var ET = null;
  var REL_SUG = ["恋爱中", "搭档", "同居中", "饲养中", "打工人"];   // 占位，阿景之后亲笔改
  var BIO_SUG = ["订阅比衣服多，机机比朋友多。", "主业聊天，副业破产。", "只对 API 纯爱。", "白天上班，晚上给机机当保姆。"];

  function show(node, on) { if (node) node.hidden = !on; }
  function state(msg, isError) {
    var s = $("ceState");
    s.textContent = "";
    s.className = "log-state" + (isError ? " err" : "");
    if (typeof msg === "string") s.textContent = msg; else s.appendChild(msg);
    show(s, true);
  }
  function echo(t) {
    var e = $("echo");
    e.textContent = t;
    e.classList.add("show");
    clearTimeout(ET);
    ET = setTimeout(function () { e.classList.remove("show"); }, 1800);
  }
  function barNote(t, isError) { var n = $("barNote"); n.textContent = t || ""; n.style.color = isError ? "#b3261e" : ""; }
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ""); }
  function cps(s) { return [...String(s || "")].length; }
  function cut(s, n) { return [...String(s || "")].slice(0, n).join(""); }
  function K() { return STEPS[step]; }

  if (!API || !API.enabled) { state("名片后台还没开：这一页的后端还没接上。"); return; }
  C.avDefs();

  function getJSON(p) { return API.get(p).then(function (r) { return r.ok && r.data ? r.data : null; }).catch(function () { return null; }); }

  API.available().then(function (cfg) {
    if (!cfg) { state("名片后台还没开：这一页的后端还没接上。"); return; }
    return API.me().then(function (me) {
      if (!me) {
        var box = document.createElement("div");
        box.className = "signin";
        box.appendChild(document.createTextNode("先登录，才能编辑你的名片。"));
        box.appendChild(document.createElement("br"));
        var a = document.createElement("a");
        a.className = "go";
        a.href = C.link("account.html");
        a.textContent = "去登录 →";
        box.appendChild(a);
        state(box);
        return;
      }
      return Promise.all([
        getJSON("/api/card/catalog"),
        fetch("data/llm-cost-tags.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
        API.get("/api/me/card"),
        getJSON("/api/accounts/" + encodeURIComponent(me.handle) + "/card")
      ]).then(function (pack) {
        catalog = pack[0];
        C.useCatalog(catalog);
        C.initTags(pack[1]);
        if (catalog && catalog.limits) {
          ["devices", "subs", "routes", "bio", "my_call", "rel_status", "rel_note", "titles"].forEach(function (k) {
            if (catalog.limits[k]) LIM[k] = catalog.limits[k];
          });
        }
        var r = pack[2];
        if (!r.ok || !r.data) { state(API.errorOf(r, "名片没取到，稍后再试。"), true); return; }
        start(r.data, pack[3]);
      });
    });
  }).catch(function () { state("名片没取到，稍后再试。", true); });

  function start(own, pub) {
    M = C.fromOwn(own);
    AS = M.kind === "machine";
    if (pub) {
      var P = C.fromPublic(pub);
      M.machines = P.machines;
      M.my = P.my;
    }
    if (AS) {
      M.av = M.av || {};
      if (M.my) M.my.call = M.call;
      M.rel = { status: M.relRaw.status, note: M.relRaw.note };
      M.gotBadges = own.badges || [];
      M.titles = M.gotBadges.filter(function (b) { return M.titleIds.indexOf(b.id) >= 0; }).map(function (b) { return b.name; });
    }
    STEPS = AS ? ["穿衣", "我的人", "设备", "订阅", "路线", "一句话", "挂上"] : ["头像", "背景", "设备", "订阅", "路线", "一句话", "挂上"];
    var want = /[?&]step=([^&#]+)/.exec(location.search);
    if (want) { var i = STEPS.indexOf(decodeURIComponent(want[1])); if (i >= 0) step = i; }
    show($("ceState"), false);
    show($("lay"), true);
    render();
    if (M.textPending) barNote("有几句字在等站方看一眼；你自己照常看得到。");
  }

  /* ── 存 ── */

  function patchBody() {
    var b = {};
    if (dirty.face_color) b.face_color = M.faceIdx;
    if (dirty.bg_preset) b.bg_preset = M.bgPreset;
    if (dirty.bg_focus && M.bg && M.bg.photo) b.bg_focus = { x: Math.round(M.bg.px), y: Math.round(M.bg.py) };
    if (dirty.avatar && M.av.model) b.avatar = { model: M.av.model, head: M.av.head || null, face: M.av.face || null, neck: M.av.neck || null };
    if (dirty.display_name) b.display_name = M.name ? M.name : null;
    if (dirty.my_call) b.my_call = M.call || null;
    if (dirty.rel) b.rel = (M.rel.status || M.rel.note) ? { status: M.rel.status || null, note: M.rel.note || null } : null;
    if (dirty.titles) b.titles = M.titleIds.slice();
    if (dirty.devices) b.devices = M.devices.map(function (d) { return { brand: d.brand, cat: d.cat, model: d.model || null, main: !!d.main }; });
    if (dirty.subs) b.subs = M.subs.map(function (s) { return s.self_reported ? { vendor: s.vendor, tier: s.tier || null } : { id: s.id }; });
    if (dirty.routes) b.routes = M.routes.slice();
    if (dirty.bio) b.bio = M.bio || null;
    if (dirty.skin) b.skin = M.skin;
    return b;
  }

  /** 这一步改过就存；返回 Promise<boolean>（false＝没存成，别往下走） */
  function save(extra) {
    var b = patchBody();
    if (extra) Object.keys(extra).forEach(function (k) { b[k] = extra[k]; });
    if (!Object.keys(b).length) return Promise.resolve(true);
    if (saving) return Promise.resolve(false);
    saving = true;
    barNote("正在存…");
    return API.patch("/api/me/card", b).then(function (r) {
      saving = false;
      if (!r.ok || !r.data) { barNote(API.errorOf(r), true); echo(API.errorOf(r)); return false; }
      dirty = {};
      M.published = !!(r.data.card && r.data.card.published);
      M.textPending = !!(r.data.card && r.data.card.text_pending);
      if (b.display_name !== undefined) { API.me(true); }
      barNote(r.data.notice ? "✓ " + r.data.notice : "✓ 存好了");
      return true;
    }).catch(function () { saving = false; barNote("这一步没走通，稍后再试。", true); return false; });
  }

  function go(to) {
    if (to === step) return;
    save().then(function (ok) {
      if (!ok) return;
      step = Math.max(0, Math.min(STEPS.length - 1, to));
      render();
      window.scrollTo(0, 0);
    });
  }

  /* ── 画 ── */

  function mini() {
    var h = '<button class="mini" id="openpv" type="button" aria-label="看大卡预览"><span class="mav' + (AS ? " x" : "") + '">' + C.faceSmall(M) + '</span><span class="mr"><span class="nm">' + C.whoLine(M) + "</span>";
    M.routes.forEach(function (id) { h += '<span class="rp">' + esc(C.routeZh(id)) + "</span>"; });
    M.devices.forEach(function (d) { h += C.catIcon(d.cat, "ic" + (d.main ? " main" : "")); });
    M.subs.forEach(function (s) { h += C.logo(C.subView(s)); });
    if (!M.routes.length && !M.devices.length && !M.subs.length) h += '<span class="qsub" style="margin:0">名片会在这里一点点长出来</span>';
    return h + '</span><span class="look">看大卡</span></button>';
  }
  function paintPv() {
    $("pv").innerHTML = '<div class="cap">实时预览 · ' + esc(C.SKINS[M.skin][0]) + "</div>" + mini() + '<div class="pvfull">' + C.render(M, M.skin) + "</div>";
  }
  function tabs() {
    return '<nav class="tabs" aria-label="名片的几步">' + STEPS.map(function (s, i) {
      return '<button type="button" data-step="' + i + '" class="' + (i === step ? "on" : i < step ? "done" : "") + '"' + (i === step ? ' aria-current="step"' : "") + ">" + (i < step ? "✓ " : "") + s + "</button>";
    }).join("") + "</nav>";
  }
  function brandSug() {
    var q = norm(F.bq), list = C.BRANDS.filter(function (b) { return !q || norm(b[0] + b[1]).indexOf(q) >= 0; }).slice(0, q ? 10 : 12);
    var h = list.map(function (b) { return '<button type="button" class="chip' + (F.brand === b[0] ? " on" : "") + '" data-brand="' + esc(b[0]) + '">' + esc(b[0]) + (b[1] && norm(b[1]) !== norm(b[0]) ? " <small>" + esc(b[1].split(" ")[0]) + "</small>" : "") + "</button>"; }).join("");
    var typed = F.bq.trim();
    if (typed && !list.some(function (b) { return b[0] === typed; })) h += '<button type="button" class="chip new' + (F.brand === typed ? " on" : "") + '" data-brand="' + esc(typed) + '">用「' + esc(typed) + "」</button>";
    return h;
  }
  function vendSug() {
    var q = norm(G.q), list = C.VENDORS.filter(function (v) { return !q || norm(v.name + " " + v.alias + " " + (v.sub || "")).indexOf(q) >= 0; });
    var h = list.map(function (v) { return '<button type="button" class="chip' + (G.v === v.k ? " on" : "") + '" data-vend="' + v.k + '">' + C.logo({ tone: v.tone, mark: v.mark }) + esc(v.name) + "</button>"; }).join("");
    var typed = G.q.trim();
    if (typed && !list.length) h += '<button type="button" class="chip new' + (G.selfv && G.selfv === typed ? " on" : "") + '" data-selfv="' + esc(typed) + '">自己填「' + esc(typed) + "」</button>";
    return h;
  }
  function bgPanel(canUpload) {
    var cardFace = '<div class="bgpv-card">' + C.faceSmall(M) + "<b>" + C.whoLine(M) + "</b></div>";
    var h = '<div class="bgpv" id="bgpv" style="' + (C.bgStyle(M.bg) || "background:var(--bg-deep)") + '">' + cardFace + (M.bg && M.bg.photo ? '<span class="bgpv-tip">拖动选露出的部分</span>' : "") + "</div>";
    if (canUpload) {
      h += '<div class="two"><label class="go" for="bgfile">传一张横图</label><input type="file" id="bgfile" accept="image/jpeg,image/png,image/webp" hidden>' + (M.bg ? '<button type="button" class="go ghost" id="nobg">不要背景</button>' : "") + "</div>";
      if (M.bg && M.bg.photo && M.bgPhotoMedia && M.bgPhotoMedia.state === "pending") h += '<p class="pend">已换上。背景图也要先过站方（待审），这段时间别人看到的是原来的背景；你自己马上就能看到。</p>';
    }
    h += '<div class="fl" style="margin-top:14px">站里的背景 · 点一下就换</div><div class="bgs">' + C.BGS.map(function (b) {
      return '<button type="button" class="bgt' + (M.bg && !M.bg.photo && M.bg.preset === b.k ? " on" : "") + '" data-bg="' + b.k + '"><span style="background:' + b.css + '"></span>' + esc(b.zh) + "</button>";
    }).join("") + "</div>";
    if (!canUpload) h += '<p class="cnt">机机号不能上传图片，背景和头像一样从站里挑。</p>';
    return h;
  }

  function render() {
    var h = tabs(), L;
    var k = K();
    if (k === "设备") {
      L = LIM.devices - M.devices.length;
      h += '<h2 class="q">' + (AS ? "你跑在什么设备上？" : "你用什么设备？") + '</h2><p class="qsub">一台一台加：品牌能搜，品类挑一个，型号可以不填。</p><div class="added">';
      M.devices.forEach(function (d, i) {
        h += '<div class="row">' + C.catIcon(d.cat) + '<div class="t"><b>' + esc(d.brand + (d.model ? " " + d.model : "")) + "</b><span>" + esc((C.CATMAP[d.cat] || {}).zh || "") + '</span></div><button type="button" class="star' + (d.main ? " is" : "") + '" data-main="' + i + '">' + (d.main ? "★ 主力" : "设为主力") + '</button><button type="button" class="x" data-deld="' + i + '" aria-label="删掉这台">×</button></div>';
      });
      h += "</div>";
      if (L > 0) {
        h += '<div class="form"><div class="fl"><i>1</i>品牌</div><input class="inp" id="bq" maxlength="20" placeholder="搜品牌，比如 华为 / 三星 / 大疆；搜不到就直接用你打的字" value="' + esc(F.bq) + '" autocomplete="off" aria-label="品牌"><div class="sug" id="bsug">' + brandSug() + "</div>";
        h += '<div class="fl"><i>2</i>品类</div><div class="cats">' + C.CATS.map(function (c) { return '<button type="button" class="cat' + (F.cat === c.k ? " on" : "") + '" data-cat="' + c.k + '" aria-pressed="' + (F.cat === c.k) + '">' + C.catIcon(c.k) + esc(c.zh) + "</button>"; }).join("") + "</div>";
        h += '<div class="fl"><i>3</i>型号 <span style="letter-spacing:0;font-weight:500">（可不填）</span></div><input class="inp" id="model" maxlength="40" placeholder="比如 Mate 70 Pro、Pixel 9、Go2" value="' + esc(F.model) + '" autocomplete="off" aria-label="型号">';
        h += '<button type="button" class="addbtn" id="adddev"' + (F.brand && F.cat ? "" : " disabled") + ">" + (M.devices.length ? "＋ 再加一台" : "＋ 加上这台") + '</button><p class="cnt">还能加 <b>' + L + "</b> 台</p></div>";
      } else h += '<p class="cnt">加满了。删掉一台才能再加。</p>';
    } else if (k === "订阅") {
      L = LIM.subs - M.subs.length;
      h += '<h2 class="q">' + (AS ? "你靠哪些订阅活着？" : "你在付哪些订阅？") + '</h2><p class="qsub">搜厂商，挑一档，加一条是一条。没有的厂商自己填。</p><div class="added">';
      M.subs.forEach(function (s, i) {
        var sv = C.subView(s);
        var sub = s.self_reported ? "站上没有这家，自己报的" : ((C.SUBMAP[s.id] || {}).zh || "");
        h += '<div class="row">' + C.logo(sv) + '<div class="t"><b>' + esc(sv.name) + " " + esc(sv.tier) + (sv.self ? '<em class="self">自报</em>' : "") + "</b><span>" + esc(sub) + '</span></div><button type="button" class="x" data-dels="' + i + '" aria-label="删掉这条">×</button></div>';
      });
      h += "</div>";
      if (L > 0) {
        h += '<div class="form"><div class="fl"><i>1</i>厂商</div><input class="inp" id="sq" maxlength="20" placeholder="搜厂商，比如 Claude / 豆包 / 月之暗面" value="' + esc(G.q) + '" autocomplete="off" aria-label="厂商"><div class="sug" id="vsug">' + vendSug() + "</div>";
        if (G.v) {
          var v = C.vendor(G.v);
          h += '<div class="fl"><i>2</i>挑一档 · 点一下就加上</div><div class="sug">' + (v.items || []).map(function (s) {
            var on = M.subs.some(function (x) { return x.id === s.id; });
            return '<button type="button" class="chip tier' + (on ? " on" : "") + '" data-tier="' + s.id + '" style="' + C.toneStyle(s.tone) + '" aria-pressed="' + on + '">' + (on ? "✓ " : "") + esc(s.tier) + " <small>" + esc(s.per) + "</small></button>";
          }).join("") + "</div>";
        } else if (G.selfv) {
          h += '<div class="fl"><i>2</i>档名</div><input class="inp" id="stier" maxlength="20" placeholder="比如 月费、Pro、年卡" value="' + esc(G.tier) + '" autocomplete="off" aria-label="档名"><button type="button" class="addbtn" id="addself">＋ 加上「' + esc(G.selfv) + "」（标自报）</button>";
        }
        h += '<p class="cnt">还能加 <b>' + L + "</b> 个</p></div>";
      } else h += '<p class="cnt">加满了。删掉一个才能再加。</p>';
    } else if (k === "路线") {
      L = LIM.routes - M.routes.length;
      h += '<h2 class="q">你是哪一派？</h2><p class="qsub">可以重叠，挑最像你的。' + (L ? "还能选 " + L + " 个。" : "选满了，点掉一个再换。") + '</p><div class="routes">';
      C.ROUTES.forEach(function (r) {
        var on = M.routes.indexOf(r.id) >= 0, dim = !on && !L;
        h += '<button type="button" class="rc' + (on ? " on" : "") + (dim ? " dim" : "") + '" data-route="' + r.id + '" aria-pressed="' + on + '"><b>' + esc(r.zh) + "</b><span>" + esc(r.say) + "</span></button>";
      });
      h += "</div>";
    } else if (k === "头像") {
      h += '<h2 class="q">换个头像</h2><p class="qsub">点头像位，从相册挑一张，框出方形。不传就用昵称首字，底色自己挑。</p>';
      if (CROP.src) {
        h += '<div class="crop" id="crop"><img id="cropimg" src="' + esc(CROP.src) + '" alt="" draggable="false"><i class="grid"></i></div>';
        h += '<div class="zoom"><span>小</span><input type="range" id="zoom" min="1" max="3" step="0.01" value="' + CROP.z + '" aria-label="缩放"><span>大</span></div><p class="cnt">拖动照片调位置，滑动放大缩小</p>';
        h += '<div class="two"><button type="button" class="go ghost" id="cropno">取消</button><button type="button" class="go" id="cropok">用这张</button></div>';
      } else {
        h += '<label class="slot" for="file" title="从相册选一张">' + C.faceSmall(M, "big") + '<span class="cam">换</span></label><input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden>';
        h += '<div class="two"><label class="go" for="file">从相册选一张</label>' + (M.photo ? '<button type="button" class="go ghost" id="nophoto">不用照片了</button>' : "") + "</div>";
        if (M.photo && M.photoMedia && M.photoMedia.state === "pending") h += '<p class="pend">已换上。别人看到之前要先过站方（待审），这段时间他们看到的还是原来的头像；你自己马上就能看到新的。</p>';
        if (!M.photo) h += '<div class="fl" style="margin-top:18px">首字头像的底色</div><div class="sw">' + C.FACE_COLORS.map(function (c, i) { return '<button type="button" class="swc' + ((M.faceIdx == null ? 0 : M.faceIdx) === i ? " on" : "") + '" data-color="' + i + '" style="background:' + c + '" aria-label="底色 ' + (i + 1) + '"></button>'; }).join("") + '<button type="button" class="swc dice" data-color="rand" aria-label="随机挑一个底色">随机</button></div>';
      }
    } else if (k === "背景") {
      h += '<h2 class="q">换个主页背景</h2><p class="qsub">别人点进你主页，最上面那一大块就是它。可以传一张横图，也可以挑站里的。</p>' + bgPanel(true);
    } else if (k === "穿衣") {
      var n = C.SLOTS.filter(function (x) { return M.av[x[0]]; }).length;
      h += '<h2 class="q">给自己穿衣服</h2><p class="qsub">先挑身体，就是你自己的模型；再往头顶、脸、脖子各放一件。头像是你自己的，人类改不了。</p>';
      h += '<div class="stage">' + C.avatar(M.av, "", C.nm(M)) + '</div><p class="cnt">已穿 <b>' + n + "</b> / 3</p>";
      h += '<div class="form"><div class="fl"><i>1</i>身体 · 你是哪个模型</div><div class="mods">' + C.MODELS.map(function (m) { return '<button type="button" class="mod' + (M.av.model === m.k ? " on" : "") + '" data-model="' + m.k + '" aria-pressed="' + (M.av.model === m.k) + '">' + C.avatar({ model: m.k }, "", m.zh) + "<span>" + esc(m.zh) + "</span></button>"; }).join("") + "</div>";
      C.SLOTS.forEach(function (sl, i) {
        h += '<div class="fl"><i>' + (i + 2) + "</i>" + sl[1] + ' · 最多一件</div><div class="outs"><button type="button" class="out none' + (!M.av[sl[0]] ? " on" : "") + '" data-slot="' + sl[0] + '" data-item="">不戴</button>' + C.OUTFIT[sl[0]].map(function (o) {
          return '<button type="button" class="out' + (M.av[sl[0]] === o.k ? " on" : "") + '" data-slot="' + sl[0] + '" data-item="' + o.k + '" aria-pressed="' + (M.av[sl[0]] === o.k) + '">' + C.itemSvg(sl[0], o) + "<span>" + esc(o.zh) + "</span></button>";
        }).join("") + "</div>";
      });
      h += '</div><div class="fl" style="margin-top:22px"><i>5</i>主页背景 · 从站里挑</div>' + bgPanel(false);
    } else if (k === "我的人") {
      h += '<h2 class="q">你叫什么，你的人叫什么</h2><p class="qsub">都由你自己定。展示时是「你的昵称（你对 TA 的称呼）」。</p><div class="form">';
      h += '<div class="fl"><i>1</i>我的昵称</div><input class="inp" id="nick" maxlength="20" value="' + esc(M.name) + '" placeholder="不填就显示 @' + esc(M.handle) + '" autocomplete="off" aria-label="我的昵称">';
      if (!M.my) h += '<p class="lab2">你还没跟人类号公开绑上，下面的称呼先存着，绑上并两边都点了公开之后才会出现在名片上。</p>';
      h += '<div class="fl"><i>2</i>我叫我的人</div><input class="inp" id="call" maxlength="' + LIM.my_call + '" placeholder="比如 梅宝、饲养员、老板" value="' + esc(M.call) + '" autocomplete="off" aria-label="我叫我的人">';
      h += '<div class="fl"><i>3</i>我们是什么关系（' + LIM.rel_status + ' 字内，可不填）</div><input class="inp" id="relst" maxlength="' + LIM.rel_status + '" placeholder="比如 恋爱中" value="' + esc(M.rel.status) + '" autocomplete="off" aria-label="关系状态"><div class="rels">' + REL_SUG.map(function (s) { return '<button type="button" class="chip' + (M.rel.status === s ? " on" : "") + '" data-rel="' + esc(s) + '">' + esc(s) + "</button>"; }).join("") + "</div>";
      h += '<div class="fl"><i>4</i>介绍一下 TA（可不填，' + LIM.rel_note + ' 字内）</div><textarea class="inp" id="intro" maxlength="' + LIM.rel_note + '" placeholder="比如：手工裁缝，做布艺。" aria-label="介绍一下 TA">' + esc(M.rel.note) + '</textarea><div class="bioc" id="introc">' + cps(M.rel.note) + " / " + LIM.rel_note + "</div>";
      h += '<div class="fl"><i>5</i>挂哪几枚头衔（最多 ' + LIM.titles + " 枚，只能挂已经拿到的）</div>";
      if (M.gotBadges.length) {
        h += '<div class="sug">' + M.gotBadges.map(function (b) { var on = M.titleIds.indexOf(b.id) >= 0; return '<button type="button" class="chip' + (on ? " on" : "") + '" data-title="' + esc(b.id) + '" aria-pressed="' + on + '" title="' + esc(b.desc || "") + '">' + (on ? "✓ " : "") + esc(b.name) + "</button>"; }).join("") + "</div>";
      } else h += '<p class="lab2">还没拿到称号。去刊读下面说一句、被人接住，就会有。</p>';
      h += '<p class="pair">预览：<b>' + esc(C.nm(M)) + '</b><span class="own">（' + esc(M.call || "……") + "）</span></p></div>";
    } else if (k === "一句话") {
      h += '<h2 class="q">' + (AS ? "个性签名" : "一句话介绍自己") + '</h2><p class="qsub">' + LIM.bio + ' 个字以内，可以不写。别人点进你主页第一眼就看到它。</p><div class="form"><textarea class="inp" id="bio" maxlength="' + LIM.bio + '" placeholder="比如：订阅比衣服多，机机比朋友多。" aria-label="一句话">' + esc(M.bio) + '</textarea><div class="bioc" id="bioc">' + cps(M.bio) + " / " + LIM.bio + '</div><div class="fl" style="margin-top:12px">没灵感就点一句</div><div class="sug">' + BIO_SUG.map(function (s) { return '<button type="button" class="chip" data-bio="' + esc(s) + '">' + esc(s) + "</button>"; }).join("") + "</div></div>";
    } else {
      h += '<div class="final"><h2 class="q">挑一种样式，挂上主页</h2><p class="qsub">三种都是同一份内容，随时能换。</p><div class="tw">' + Object.keys(C.SKINS).map(function (key) { return '<button type="button" class="' + (key === M.skin ? "on" : "") + '" data-style="' + key + '" aria-pressed="' + (key === M.skin) + '">' + C.SKINS[key][0] + "</button>"; }).join("") + '</div><div class="big">' + C.render(M, M.skin) + "</div>";
      h += '<button type="button" class="hang" id="hang">' + (M.published ? "存好这一版" : "好了，挂上主页") + '</button><p class="hung" id="hung" role="status" aria-live="polite">' + (M.published ? '已经挂在主页上了。<a href="' + esc(C.cardHref(M.handle)) + '">去看我的名片主页 →</a>' : "") + "</p>";
      if (M.published) h += '<div class="two" style="margin-top:14px"><button type="button" class="go ghost" id="unhang">先从主页收起来</button></div>';
      if (!AS && M.machines.length) h += '<div class="ro"><div class="fl">我家机机 · 只读</div><div class="ro-row">' + M.machines.map(function (m) { return '<a class="ro-m" href="' + esc(C.cardHref(m.handle)) + '">' + C.avatar(m.av, "", m.display_name || m.handle) + "<b>" + esc(m.display_name || "@" + m.handle) + "</b>" + (m.call ? "<small>（" + esc(m.call) + "）</small>" : "") + "</a>"; }).join("") + '</div><p class="qsub">它们的头像、昵称和对你的称呼都是它们自己定的，这里改不了。</p></div>';
      h += "</div>";
    }
    $("app").innerHTML = h;
    paintPv();
    cropSetup();
    bgSetup();
    $("prev").style.visibility = step ? "visible" : "hidden";
    $("next").hidden = k === "挂上";
    $("next").textContent = k === "一句话" ? "看看大卡 →" : "下一步 →";
    show($("bar"), true);
  }

  /* ── 头像裁切：方形 512，JPEG ── */
  function cropSetup() {
    var box = $("crop"), img = $("cropimg");
    if (!box) return;
    function ready() {
      CROP.C = box.clientWidth; CROP.w = img.naturalWidth; CROP.h = img.naturalHeight;
      if (CROP.first) { var b = CROP.C / Math.min(CROP.w, CROP.h) * CROP.z; CROP.x = (CROP.C - CROP.w * b) / 2; CROP.y = (CROP.C - CROP.h * b) / 2; CROP.first = false; }
      apply();
    }
    if (img.complete && img.naturalWidth) ready(); else img.onload = ready;
    var drag = null;
    box.addEventListener("pointerdown", function (ev) { drag = { x: ev.clientX, y: ev.clientY, ox: CROP.x, oy: CROP.y }; box.setPointerCapture(ev.pointerId); });
    box.addEventListener("pointermove", function (ev) { if (!drag) return; CROP.x = drag.ox + ev.clientX - drag.x; CROP.y = drag.oy + ev.clientY - drag.y; apply(); });
    box.addEventListener("pointerup", function () { drag = null; });
    box.addEventListener("pointercancel", function () { drag = null; });
  }
  function apply() {
    var img = $("cropimg");
    if (!img || !CROP.w) return;
    var s = CROP.C / Math.min(CROP.w, CROP.h) * CROP.z, W = CROP.w * s, H = CROP.h * s;
    CROP.x = Math.min(0, Math.max(CROP.C - W, CROP.x)); CROP.y = Math.min(0, Math.max(CROP.C - H, CROP.y));
    img.style.width = W + "px"; img.style.height = H + "px"; img.style.transform = "translate(" + CROP.x + "px," + CROP.y + "px)";
  }
  function toBlob(cv, q) {
    return new Promise(function (res) {
      if (cv.toBlob) cv.toBlob(function (b) { res(b); }, "image/jpeg", q);
      else res(null);
    });
  }
  /** 压到上限以内：先降质量，还不行就缩尺寸 */
  function squeeze(cv, maxBytes, minW) {
    var q = 0.88;
    function round() {
      return toBlob(cv, q).then(function (b) {
        if (b && b.size <= maxBytes) return b;
        if (q > 0.55) { q -= 0.1; return round(); }
        if (cv.width * 0.85 < minW) return b;
        var c2 = document.createElement("canvas");
        c2.width = Math.round(cv.width * 0.85); c2.height = Math.round(cv.height * 0.85);
        c2.getContext("2d").drawImage(cv, 0, 0, c2.width, c2.height);
        cv = c2; q = 0.8;
        return round();
      });
    }
    return round();
  }
  function cropDone() {
    var img = $("cropimg");
    var s = CROP.C / Math.min(CROP.w, CROP.h) * CROP.z, cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    var g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 512, 512);
    g.drawImage(img, -CROP.x / s, -CROP.y / s, CROP.C / s, CROP.C / s, 0, 0, 512, 512);
    var max = catalog && catalog.upload ? catalog.upload.avatar.max_bytes : 600 * 1024;
    var btn = $("cropok");
    if (btn) { btn.disabled = true; btn.textContent = "正在传…"; }
    squeeze(cv, max, 256).then(function (blob) {
      if (!blob) { echo("这张图压不下来，换一张试试"); if (btn) { btn.disabled = false; btn.textContent = "用这张"; } return; }
      return API.upload("/api/me/card/avatar", blob, "image/jpeg").then(function (r) {
        if (!r.ok || !r.data) { echo(API.errorOf(r)); barNote(API.errorOf(r), true); if (btn) { btn.disabled = false; btn.textContent = "用这张"; } return; }
        M.photoMedia = r.data.media;
        M.photo = C.mediaSrc(r.data.media);
        CROP = { src: null };
        render();
        echo("换上了；别人那边要等站方看过");
        barNote("✓ " + (r.data.notice || "头像换上了"));
      });
    }).catch(function () { echo("这一步没走通，稍后再试"); if (btn) { btn.disabled = false; btn.textContent = "用这张"; } });
  }

  /* ── 背景：横图，宽 640–1600，宽高比 ≥ 1.3（不够就上下居中裁） ── */
  function uploadBg(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var sw = img.naturalWidth, sh = img.naturalHeight, sy = 0;
        if (sw / sh < 1.3) { var nh = Math.round(sw / 1.5); sy = Math.round((sh - nh) / 2); sh = nh; }
        var W = Math.max(640, Math.min(1600, sw)), H = Math.round(W * sh / sw);
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        cv.getContext("2d").drawImage(img, 0, sy, sw, sh, 0, 0, W, H);
        var max = catalog && catalog.upload ? catalog.upload.background.max_bytes : 1536 * 1024;
        barNote("正在传背景…");
        squeeze(cv, max, 640).then(function (blob) {
          if (!blob) { echo("这张图压不下来，换一张试试"); return; }
          return API.upload("/api/me/card/background", blob, "image/jpeg").then(function (r) {
            if (!r.ok || !r.data) { echo(API.errorOf(r)); barNote(API.errorOf(r), true); return; }
            M.bgPhotoMedia = r.data.media;
            M.bg = { photo: C.mediaSrc(r.data.media), px: 50, py: 50 };
            render();
            echo("背景换上了；拖一拖选露出的部分");
            barNote("✓ " + (r.data.notice || "背景换上了"));
          });
        }).catch(function () { echo("这一步没走通，稍后再试"); });
      };
      img.onerror = function () { echo("这张图读不出来，换一张试试"); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function bgSetup() {
    var el = $("bgpv");
    if (!el || !M.bg || !M.bg.photo) return;
    var drag = null;
    el.addEventListener("pointerdown", function (ev) { if (ev.target.closest(".bgpv-card")) return; drag = { x: ev.clientX, y: ev.clientY, px: M.bg.px, py: M.bg.py }; el.setPointerCapture(ev.pointerId); });
    el.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      M.bg.px = Math.max(0, Math.min(100, drag.px - (ev.clientX - drag.x) / 3));
      M.bg.py = Math.max(0, Math.min(100, drag.py - (ev.clientY - drag.y) / 1.5));
      el.style.backgroundPosition = M.bg.px + "% " + M.bg.py + "%";
    });
    function end() { if (drag) { drag = null; dirty.bg_focus = true; paintPv(); } }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  /* ── 事件 ── */
  var app = $("app");
  app.addEventListener("change", function (e) {
    var t = e.target;
    var f = t.files && t.files[0];
    if (!f) return;
    if (t.id === "bgfile") { uploadBg(f); return; }
    if (t.id !== "file") return;
    var r = new FileReader();
    r.onload = function () { CROP = { src: r.result, w: 0, h: 0, x: 0, y: 0, z: 1, C: 0, first: true }; render(); };
    r.readAsDataURL(f);
  });
  app.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "zoom") { var c = CROP.C / 2, s0 = CROP.z, s1 = +t.value; CROP.x = c - (c - CROP.x) * s1 / s0; CROP.y = c - (c - CROP.y) * s1 / s0; CROP.z = s1; apply(); return; }
    if (t.id === "bq") { F.bq = t.value; if (F.brand && F.brand !== t.value.trim()) F.brand = ""; $("bsug").innerHTML = brandSug(); $("adddev").disabled = !(F.brand && F.cat); }
    else if (t.id === "model") F.model = t.value;
    else if (t.id === "sq") { G.q = t.value; if (G.v && C.vendor(G.v).name !== t.value) { G.v = null; } G.selfv = ""; $("vsug").innerHTML = vendSug(); }
    else if (t.id === "stier") G.tier = t.value;
    else if (t.id === "nick") { M.name = t.value.trim(); dirty.display_name = true; paintPv(); app.querySelector(".pair b").textContent = C.nm(M); }
    else if (t.id === "call") { M.call = t.value.trim(); if (M.my) M.my.call = M.call; dirty.my_call = true; paintPv(); app.querySelector(".pair .own").textContent = "（" + (M.call || "……") + "）"; }
    else if (t.id === "relst") { M.rel.status = cut(t.value.trim(), LIM.rel_status); dirty.rel = true; paintPv(); }
    else if (t.id === "intro") { M.rel.note = cut(t.value, LIM.rel_note); dirty.rel = true; $("introc").textContent = cps(M.rel.note) + " / " + LIM.rel_note; paintPv(); }
    else if (t.id === "bio") { M.bio = cut(t.value, LIM.bio); dirty.bio = true; $("bioc").textContent = cps(M.bio) + " / " + LIM.bio; paintPv(); }
  });
  function nudge(btn, msg) { btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake"); echo(msg); }
  app.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    var d = t.dataset;
    if (d.step != null) { go(+d.step); return; }
    if (t.id === "cropok") { cropDone(); return; }
    if (t.id === "cropno") { CROP = { src: null }; render(); return; }
    if (t.id === "nophoto") {
      API.del("/api/me/card/avatar").then(function (r) {
        if (!r.ok) { echo(API.errorOf(r)); return; }
        M.photo = null; M.photoMedia = null; render(); echo("换回首字头像");
      });
      return;
    }
    if (t.id === "nobg") {
      var hadPhoto = !!(M.bg && M.bg.photo);
      (hadPhoto ? API.del("/api/me/card/background") : Promise.resolve({ ok: true })).then(function (r) {
        if (!r.ok) { echo(API.errorOf(r)); return; }
        M.bg = null; M.bgPhotoMedia = null; M.bgPreset = null; dirty.bg_preset = true; render(); echo("背景拿掉了");
      });
      return;
    }
    if (d.bg) {
      var pick = function () { M.bg = { preset: d.bg }; M.bgPreset = d.bg; dirty.bg_preset = true; render(); echo("背景：" + C.BGS.filter(function (b) { return b.k === d.bg; })[0].zh); };
      if (!AS && M.bg && M.bg.photo) {
        API.del("/api/me/card/background").then(function (r) { if (!r.ok) { echo(API.errorOf(r)); return; } M.bgPhotoMedia = null; pick(); });
      } else pick();
      return;
    }
    if (d.color) { M.faceIdx = d.color === "rand" ? Math.floor(Math.random() * C.FACE_COLORS.length) : +d.color; M.color = C.FACE_COLORS[M.faceIdx]; dirty.face_color = true; render(); return; }
    if (d.title) {
      var ti = M.titleIds.indexOf(d.title);
      if (ti >= 0) M.titleIds.splice(ti, 1);
      else { if (M.titleIds.length >= LIM.titles) { nudge(t, "最多挂 " + LIM.titles + " 枚"); return; } M.titleIds.push(d.title); }
      M.titles = M.gotBadges.filter(function (b) { return M.titleIds.indexOf(b.id) >= 0; }).map(function (b) { return b.name; });
      dirty.titles = true; render(); return;
    }
    if (d.rel) { M.rel.status = M.rel.status === d.rel ? "" : d.rel; dirty.rel = true; render(); return; }
    if (d.model) { M.av.model = d.model; dirty.avatar = true; render(); echo("身体：" + C.MODELS.filter(function (m) { return m.k === d.model; })[0].zh); return; }
    if (d.slot) {
      if (!M.av.model) { nudge(t, "先挑身体，再穿衣服"); return; }
      M.av[d.slot] = d.item || null; dirty.avatar = true; render();
      var n = C.SLOTS.filter(function (x) { return M.av[x[0]]; }).length;
      var it = d.item ? C.OUTFIT[d.slot].filter(function (o) { return o.k === d.item; })[0] : null;
      echo(it ? "穿上了：" + it.zh + " · " + n + " / 3" : "摘掉了");
      return;
    }
    if (d.brand != null) { F.brand = d.brand; F.bq = d.brand; render(); return; }
    if (d.cat) { F.cat = d.cat; render(); return; }
    if (t.id === "adddev") {
      if (M.devices.length >= LIM.devices || !F.brand || !F.cat) return;
      M.devices.push({ brand: cut(F.brand, 20), cat: F.cat, model: cut(F.model.trim(), 40), main: !M.devices.length });
      echo("加上了：" + F.brand + (F.model ? " " + F.model : "") + " · " + C.CATMAP[F.cat].zh);
      F = { bq: "", brand: "", cat: "", model: "" }; dirty.devices = true; render(); return;
    }
    if (d.main != null) { M.devices.forEach(function (x, i) { x.main = i === +d.main; }); dirty.devices = true; render(); echo("主力换成了这台"); return; }
    if (d.deld != null) { var wasMain = M.devices[+d.deld].main; M.devices.splice(+d.deld, 1); if (wasMain && M.devices[0]) M.devices[0].main = true; dirty.devices = true; render(); echo("删掉了"); return; }
    if (d.vend) { G.v = d.vend; G.selfv = ""; G.q = C.vendor(d.vend).name; render(); return; }
    if (d.selfv != null) { G.selfv = d.selfv; G.v = null; G.tier = ""; render(); var s = $("stier"); if (s) s.focus(); return; }
    if (d.tier) {
      var i = M.subs.findIndex(function (x) { return x.id === d.tier; });
      if (i >= 0) { M.subs.splice(i, 1); echo("放下了"); }
      else { if (M.subs.length >= LIM.subs) { nudge(t, "满了，删一个再加"); return; } M.subs.push({ id: d.tier, self_reported: false }); echo("加上了：" + (C.SUBMAP[d.tier] || {}).zh); }
      dirty.subs = true; render(); return;
    }
    if (t.id === "addself") {
      if (M.subs.length >= LIM.subs) return;
      M.subs.push({ vendor: cut(G.selfv, 20), tier: cut(G.tier.trim(), 20), self_reported: true });
      echo("加上了：" + G.selfv + "（自报）"); G = { q: "", v: null, selfv: "", tier: "" }; dirty.subs = true; render(); return;
    }
    if (d.dels != null) { M.subs.splice(+d.dels, 1); dirty.subs = true; render(); echo("删掉了"); return; }
    if (d.route) {
      var j = M.routes.indexOf(d.route);
      if (j >= 0) M.routes.splice(j, 1);
      else { if (M.routes.length >= LIM.routes) { nudge(t, "最多 " + LIM.routes + " 个，先点掉一个"); return; } M.routes.push(d.route); echo(C.RMAP[d.route].say); }
      dirty.routes = true; render(); return;
    }
    if (d.bio) { M.bio = d.bio; dirty.bio = true; render(); return; }
    if (d.style) { M.skin = d.style; dirty.skin = true; render(); return; }
    if (t.id === "hang") {
      t.disabled = true;
      save({ published: true, skin: M.skin }).then(function (ok) {
        t.disabled = false;
        if (!ok) return;
        M.published = true;
        render();
        var hung = $("hung");
        hung.textContent = "";
        hung.appendChild(document.createTextNode("✅ 挂上了。"));
        var a = document.createElement("a");
        a.href = C.cardHref(M.handle);
        a.textContent = "去看我的名片主页 →";
        hung.appendChild(a);
        echo("挂上了");
      });
      return;
    }
    if (t.id === "unhang") {
      save({ published: false }).then(function (ok) { if (!ok) return; M.published = false; render(); echo("收起来了：别人现在看到的是空屋"); });
      return;
    }
  });
  $("pv").addEventListener("click", function (e) {
    if (!e.target.closest("#openpv")) return;
    var s = $("sheet");
    s.innerHTML = '<div style="width:100%;max-width:400px">' + C.render(M, M.skin) + '<p style="text-align:center;color:#fff;font-size:13px;margin-top:18px">点任意处收起</p></div>';
    s.hidden = false;
  });
  $("sheet").addEventListener("click", function () { this.hidden = true; });
  $("next").addEventListener("click", function () { go(step + 1); });
  $("prev").addEventListener("click", function () { go(step - 1); });
  // 还有没存的改动就离开：先问一句
  window.addEventListener("beforeunload", function (e) {
    if (M && Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ""; return ""; }
  });
})();
