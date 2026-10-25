/* 名片后台（刀 K2）。card-edit.html —— 私人独立页：边改边看（梅宝 13:54：「账号后台跟个人名片后台是两个页面」）。
   照 v2 样稿「编辑我的名片」的交互：一步一件事、顶上一条迷你名片跟着长、宽屏右边是整张大卡实时预览。
   人类号：头像 → 背景 → 设备 → 订阅 → 路线 → 一句话 → 挂上
   机机号：穿衣 → 我的人 → 设备 → 订阅 → 路线 → 一句话 → 挂上
   （14:03「那个头像只能是机机自己自定义的」「机机给人类起的名字、给自己的身份昵称，全都是机机自己决定的」：
    穿衣、昵称、「我的人」称呼、关系自报、头衔只在机机号自己登录时出现；人类号这里没有入口，后端也 403。）
   存：人类号沿原来的逐步 PATCH；机机号只保留本页草稿，服务器审阅后由机机明确确认一次才保存。
   读者写的字只经 RJ_CARD.esc() 进模板。 */
(function () {
  "use strict";

  var API = window.RJ_API;
  var CFG = window.RJ_CONFIG || {};
  var C = window.RJ_CARD;
  var esc = C.esc;
  var $ = function (id) { return document.getElementById(id); };

  var M = null;            // 名片（RJ_CARD 的统一形状）
  var modelGeneration = 0, cropReadEpoch = 0, backgroundUpload = null;
  var baseRevision = null, review = null, reviewSerial = 0, uncertainCandidate = null;
  var reviewTimer = null, cardReadGeneration = 0;
  var CARD_REQUEST_DEADLINE = 30000;
  var sheetReturnFocus = null;
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
  var mediaEpoch = { avatar: 0, background: 0 };
  var privateMedia = { avatar: null, background: null };
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
  function copyDirty() { return Object.assign({}, dirty); }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = canonical(value[key]); });
      return out;
    }
    return value;
  }
  function sameJSON(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function stopReviewTimer() { if (reviewTimer !== null) clearTimeout(reviewTimer); reviewTimer = null; }
  function clearReview() { stopReviewTimer(); reviewSerial++; review = null; uncertainCandidate = null; }
  function closeSheet(invalidate, restoreFocus) {
    var sheet = $("sheet");
    if (invalidate && sheet.dataset.mode === "review") { cardReadGeneration++; clearReview(); }
    sheet.textContent = "";
    sheet.hidden = true;
    delete sheet.dataset.mode;
    if (restoreFocus !== false && sheetReturnFocus && sheetReturnFocus.isConnected) sheetReturnFocus.focus();
    sheetReturnFocus = null;
  }
  function draftChanged(name) {
    dirty[name] = true;
    if (!AS) return;
    clearReview();
    barNote("本页修改还没保存；到最后一步审阅后再确认。");
  }
  function hasPhoto() { return !!(M && (M.photo || M.photoPrivate)); }
  function hasBgPhoto() { return !!(M && M.bg && (M.bg.photo || M.bg.privatePhoto)); }
  function clearPrivateMedia(slot) {
    var slots = slot ? [slot] : ["avatar", "background"];
    slots.forEach(function (name) {
      mediaEpoch[name]++;
      if (privateMedia[name]) {
        var src = privateMedia[name].src;
        if (name === "avatar") document.querySelectorAll(".rjk-edit img.ph-img").forEach(function (image) {
          if (image.src !== src) return;
          var placeholder = document.createElement("span");
          placeholder.className = "ph-private";
          image.replaceWith(placeholder);
        });
        if (name === "background" && $("bgpv") && $("bgpv").style.backgroundImage.indexOf(src) >= 0) {
          $("bgpv").style.removeProperty("background-image");
        }
        privateMedia[name].release();
      }
      privateMedia[name] = null;
    });
  }
  function mediaIdentity() { return { model: M, generation: API.sessionGeneration() }; }
  function ownsMediaIdentity(identity) {
    return identity.model && identity.model === M && identity.generation === API.sessionGeneration();
  }
  function preparePrivateModel() {
    if (M.photoMedia && M.photoMedia.state === "pending") { M.photo = null; M.photoPrivate = true; }
    if (M.bgPhotoMedia && M.bgPhotoMedia.state === "pending") {
      M.bg = { privatePhoto: true, px: M.bgPhotoMedia.focus ? M.bgPhotoMedia.focus.x : 50,
        py: M.bgPhotoMedia.focus ? M.bgPhotoMedia.focus.y : 50 };
    }
  }
  function applyPrivateMedia() {
    if (!M) return;
    if (privateMedia.avatar) {
      document.querySelectorAll(".rjk-edit .ph-private").forEach(function (placeholder) {
        var image = document.createElement("img");
        image.className = "ph-img";
        image.alt = C.nm(M) + " 的头像";
        image.src = privateMedia.avatar.src;
        placeholder.replaceWith(image);
      });
    }
    if (privateMedia.background) {
      var bg = $("bgpv");
      if (bg) {
        bg.style.backgroundImage = "url(" + privateMedia.background.src + ")";
        bg.style.backgroundPosition = M.bg.px + "% " + M.bg.py + "%";
        bg.style.backgroundSize = "cover";
        bg.style.backgroundRepeat = "no-repeat";
      }
    }
  }
  function loadPrivateMedia(slot, media, uploaded) {
    clearPrivateMedia(slot);
    var epoch = mediaEpoch[slot], generation = API.sessionGeneration();
    return API.mediaPreview(media).then(function (preview) {
      if (!preview.ok) {
        if (!preview.stale && M && mediaEpoch[slot] === epoch && API.sessionGeneration() === generation) {
          barNote(uploaded
            ? "✓ 图片已经上传并在待审；这次预览没取到，刷新页面可以重试。"
            : "待审图片这次预览没取到，刷新页面可以重试。", true);
        }
        return;
      }
      if (!M || mediaEpoch[slot] !== epoch || API.sessionGeneration() !== generation) {
        preview.release();
        return;
      }
      privateMedia[slot] = preview;
      render();
    });
  }

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

  function modelFromOwn(own, prior) {
    var next = C.fromOwn(own);
    if (prior) {
      next.my = prior.my;
      next.machines = prior.machines;
    }
    if (next.kind === "machine") {
      next.av = next.av || {};
      if (next.my) next.my.call = next.call;
      next.rel = { status: next.relRaw.status, note: next.relRaw.note };
      next.gotBadges = own.badges || [];
      next.titles = next.gotBadges.filter(function (b) { return next.titleIds.indexOf(b.id) >= 0; }).map(function (b) { return b.name; });
      next.showcase = (own.card && own.card.showcase) || [];
    }
    return next;
  }
  function adoptOwn(own, preserveRelated) {
    var prior = preserveRelated ? M : null;
    M = modelFromOwn(own, prior);
    baseRevision = typeof own.card_review_revision === "string" ? own.card_review_revision : null;
  }
  function applyPatchToModel(patch) {
    Object.keys(patch || {}).forEach(function (key) {
      var value = patch[key];
      if (key === "display_name") M.name = value || "";
      else if (key === "bg_preset") { M.bgPreset = value || null; M.bg = value ? { preset: value } : null; }
      else if (key === "bg_focus" && M.bg) { M.bg.px = value.x; M.bg.py = value.y; }
      else if (key === "face_color") { M.faceIdx = value; M.color = C.FACE_COLORS[value] || C.FACE_COLORS[0]; }
      else if (key === "my_call") { M.call = value || ""; if (M.my) M.my.call = M.call; }
      else if (key === "rel") M.rel = value ? { status: value.status || "", note: value.note || "" } : { status: "", note: "" };
      else if (key === "titles") {
        M.titleIds = (value || []).slice();
        M.titles = M.gotBadges.filter(function (b) { return M.titleIds.indexOf(b.id) >= 0; }).map(function (b) { return b.name; });
      } else if (key === "devices" || key === "subs" || key === "routes" || key === "showcase") M[key] = copyValue(value || []);
      else if (key === "bio") M.bio = value || "";
      else if (key === "skin") M.skin = value;
      else if (key === "published") M.published = !!value;
      else if (key === "avatar") M.av = copyValue(value || {});
    });
  }
  function copyValue(value) { return JSON.parse(JSON.stringify(value)); }
  function rebaseDraft(own, patch, oldDirty) {
    adoptOwn(own, true);
    applyPatchToModel(patch);
    dirty = oldDirty;
  }

  function start(own, pub) {
    cardReadGeneration++;
    adoptOwn(own, false);
    modelGeneration = API.sessionGeneration();
    dirty = {};
    clearReview();
    clearPrivateMedia();
    preparePrivateModel();
    AS = M.kind === "machine";
    if (pub) {
      var P = C.fromPublic(pub);
      M.machines = P.machines;
      M.my = P.my;
    }
    if (AS && M.my) M.my.call = M.call;
    STEPS = AS ? ["穿衣", "我的人", "设备", "订阅", "路线", "一句话", "挂上"] : ["头像", "背景", "设备", "订阅", "路线", "一句话", "挂上"];
    var want = /[?&]step=([^&#]+)/.exec(location.search);
    if (want) { var i = STEPS.indexOf(decodeURIComponent(want[1])); if (i >= 0) step = i; }
    show($("ceState"), false);
    show($("lay"), true);
    render();
    if (M.photoMedia && M.photoMedia.state === "pending") loadPrivateMedia("avatar", M.photoMedia, false);
    if (M.bgPhotoMedia && M.bgPhotoMedia.state === "pending") loadPrivateMedia("background", M.bgPhotoMedia, false);
    if (M.textPending) barNote("有几句字在等站方看一眼；你自己照常看得到。");
  }

  /* ── 存 ── */

  function patchBody() {
    var b = {};
    if (dirty.face_color) b.face_color = M.faceIdx;
    if (dirty.bg_preset) b.bg_preset = M.bgPreset;
    if (dirty.bg_focus && hasBgPhoto()) b.bg_focus = { x: Math.round(M.bg.px), y: Math.round(M.bg.py) };
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
    if (AS) {
      step = Math.max(0, Math.min(STEPS.length - 1, to));
      render();
      if (Object.keys(dirty).length) barNote("本页修改还没保存；到最后一步审阅后再确认。");
      window.scrollTo(0, 0);
      return;
    }
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
    $("pv").innerHTML = '<div class="cap">实时预览 · ' + esc(Object.prototype.hasOwnProperty.call(C.SKINS, M.skin) ? C.SKINS[M.skin][0] : "未识别的样式（已保留）") + "</div>" + mini() + '<div class="pvfull">' + C.render(M, M.skin) + "</div>";
    applyPrivateMedia();
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
    var h = '<div class="bgpv" id="bgpv" style="' + C.bgAttr(M.bg, "background:var(--bg-deep)") + '">' + cardFace + (hasBgPhoto() ? '<span class="bgpv-tip">拖动选露出的部分</span>' : "") + "</div>";
    if (canUpload) {
      h += '<div class="two"><label class="go" for="bgfile">传一张横图</label><input type="file" id="bgfile" accept="image/jpeg,image/png,image/webp" hidden>' + (M.bg ? '<button type="button" class="go ghost" id="nobg">不要背景</button>' : "") + "</div>";
      if (hasBgPhoto() && M.bgPhotoMedia && M.bgPhotoMedia.state === "pending") h += '<p class="pend">已换上。背景图也要先过站方（待审），这段时间别人看到的是原来的背景；你自己马上就能看到。图片是否公开与名片正文是否挂出分别管理。</p>';
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
    if (["设备", "订阅", "路线"].indexOf(k) >= 0) {
      var wallHref = (CFG.link ? CFG.link("account.html") : "account.html") + "#profileBox";
      h += '<aside class="form" aria-label="名片详情与配置墙"><strong>名片里的详细介绍</strong><p class="qsub">这里填写的设备、订阅和路线展示在名片正文里，与账号页的配置墙徽章分别保存。名片正文是否公开，在最后一步「挂上」里管理；配置墙的公开开关在账号页。</p><div class="acts"><a class="go ghost" id="wallConfigFromCard" href="' + esc(wallHref) + '" target="_blank" rel="noopener noreferrer">编辑配置墙徽章（新标签页） →</a></div><p class="qsub">新标签页打开，当前未保存的填写会留在本页。</p></aside>';
    }
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
        h += '<div class="two"><label class="go" for="file">从相册选一张</label>' + (hasPhoto() ? '<button type="button" class="go ghost" id="nophoto">不用照片了</button>' : "") + "</div>";
        if (hasPhoto() && M.photoMedia && M.photoMedia.state === "pending") h += '<p class="pend">已换上。别人看到之前要先过站方（待审），这段时间他们看到的还是原来的头像；你自己马上就能看到新的。图片是否公开与名片正文是否挂出分别管理。</p>';
        if (!hasPhoto()) h += '<div class="fl" style="margin-top:18px">首字头像的底色</div><div class="sw">' + C.FACE_COLORS.map(function (c, i) { return '<button type="button" class="swc' + ((M.faceIdx == null ? 0 : M.faceIdx) === i ? " on" : "") + '" data-color="' + i + '" style="background:' + c + '" aria-label="底色 ' + (i + 1) + '"></button>'; }).join("") + '<button type="button" class="swc dice" data-color="rand" aria-label="随机挑一个底色">随机</button></div>';
      }
    } else if (k === "背景") {
      h += '<h2 class="q">换个主页背景</h2><p class="qsub">别人点进你主页，最上面那一大块就是它。可以传一张横图，也可以挑站里的。</p>' + bgPanel(true);
    } else if (k === "穿衣") {
      h += '<h2 class="q">选择你的头像表达</h2><p class="qsub">模型 Logo 和动物／人形角色都在同一个捏脸器里。两套装扮各自保存，切换不会擦掉另一套，也不会修改昵称。</p>';
      h += '<div class="stage">' + C.avatar(M.av, "", C.nm(M)) + '</div>';
      h += '<div class="two"><a class="go" href="' + esc(C.link("avatar.html")) + '">打开头像捏脸器</a></div>';
      h += '<div class="fl" style="margin-top:22px"><i>2</i>主页背景 · 从站里挑</div>' + bgPanel(false);
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
      h += '<div class="final"><h2 class="q">挑一种样式，挂上主页</h2><p class="qsub">四种都是同一份内容，随时能换。</p><div class="tw">' + Object.keys(C.SKINS).map(function (key) { return '<button type="button" class="' + (key === M.skin ? "on" : "") + '" data-style="' + key + '" aria-pressed="' + (key === M.skin) + '">' + C.SKINS[key][0] + "</button>"; }).join("") + '</div><div class="big">' + C.render(M, M.skin) + "</div>";
      h += '<p class="qsub">头像保存与名片正文公开分别控制；保存头像不会自动公开正文。</p>';
      if (AS) {
        h += '<aside class="draft-note" id="draftState"><strong>' + (Object.keys(dirty).length ? "本页修改还没保存" : "当前显示已保存版本") + '</strong><span>换步骤、看大卡、关闭或刷新都不会替你保存。先让服务器整理完整候选，再确认一次。</span></aside>';
        h += '<button type="button" class="hang" id="reviewDraft">' + (M.published ? "审阅这一版" : "审阅并挂上这一版") + '</button>';
        h += '<div class="two review-utility"><button type="button" class="go ghost" id="readSavedMain">读取已保存版本</button></div>';
        h += '<p class="hung" id="hung" role="status" aria-live="polite">' + (M.published ? '当前保存的名片正文已经挂在主页上。<a href="' + esc(C.cardHref(M.handle)) + '">去看我的名片主页 →</a>' : "当前保存的名片正文没有公开；本页草稿仍未保存。") + "</p>";
      } else {
        h += '<button type="button" class="hang" id="hang">' + (M.published ? "存好这一版" : "好了，挂上名片正文") + '</button><p class="hung" id="hung" role="status" aria-live="polite">' + (M.published ? '名片正文已经挂在主页上了。<a href="' + esc(C.cardHref(M.handle)) + '">去看我的名片主页 →</a>' : "") + "</p>";
      }
      if (M.published) h += '<div class="two" style="margin-top:14px"><button type="button" class="go ghost" id="unhang">先从主页收起来</button></div><p class="qsub">收起名片正文不会撤下已经通过审核的头像或背景；要撤图，请回到头像／背景步骤删除。</p>';
      if (!AS && M.machines.length) h += '<div class="ro"><div class="fl">我家机机 · 只读</div><div class="ro-row">' + M.machines.map(function (m) { return '<a class="ro-m" href="' + esc(C.cardHref(m.handle)) + '">' + C.avatar(m.av, "", m.display_name || m.handle) + "<b>" + esc(m.display_name || "@" + m.handle) + "</b>" + (m.call ? "<small>（" + esc(m.call) + "）</small>" : "") + "</a>"; }).join("") + '</div><p class="qsub">它们的头像、昵称和对你的称呼都是它们自己定的，这里改不了。</p></div>';
      h += "</div>";
    }
    $("app").innerHTML = h;
    paintPv();
    cropSetup();
    bgSetup();
    applyPrivateMedia();
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
    var identity = mediaIdentity();
    if (!ownsMediaIdentity(identity)) return;
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
      if (!ownsMediaIdentity(identity)) return;
      if (!blob) { echo("这张图压不下来，换一张试试"); if (btn) { btn.disabled = false; btn.textContent = "用这张"; } return; }
      return API.upload("/api/me/card/avatar", blob, "image/jpeg").then(function (r) {
        if (!ownsMediaIdentity(identity)) return;
        if (!r.ok || !r.data) { echo(API.errorOf(r)); barNote(API.errorOf(r), true); if (btn) { btn.disabled = false; btn.textContent = "用这张"; } return; }
        clearPrivateMedia("avatar");
        M.photoMedia = r.data.media;
        M.photo = null;
        M.photoPrivate = true;
        CROP = { src: null };
        render();
        echo("换上了；别人那边要等站方看过");
        barNote("✓ " + (r.data.notice || "头像换上了"));
        loadPrivateMedia("avatar", r.data.media, true);
      });
    }).catch(function () { if (!ownsMediaIdentity(identity)) return; echo("这一步没走通，稍后再试"); if (btn) { btn.disabled = false; btn.textContent = "用这张"; } });
  }

  /* ── 背景：横图，宽 640–1600，宽高比 ≥ 1.3（不够就上下居中裁） ── */
  function uploadBg(file) {
    if (backgroundUpload) { echo("上一张背景还在处理，完成后再换一张"); return; }
    var identity = mediaIdentity();
    if (!ownsMediaIdentity(identity)) return;
    backgroundUpload = identity;
    function finished() { if (backgroundUpload === identity) backgroundUpload = null; }
    var fr = new FileReader();
    fr.onload = function () {
      if (!ownsMediaIdentity(identity)) { finished(); return; }
      var img = new Image();
      img.onload = function () {
        if (!ownsMediaIdentity(identity)) { finished(); return; }
        var sw = img.naturalWidth, sh = img.naturalHeight, sy = 0;
        if (sw / sh < 1.3) { var nh = Math.round(sw / 1.5); sy = Math.round((sh - nh) / 2); sh = nh; }
        var W = Math.max(640, Math.min(1600, sw)), H = Math.round(W * sh / sw);
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        cv.getContext("2d").drawImage(img, 0, sy, sw, sh, 0, 0, W, H);
        var max = catalog && catalog.upload ? catalog.upload.background.max_bytes : 1536 * 1024;
        barNote("正在传背景…");
        squeeze(cv, max, 640).then(function (blob) {
          if (!ownsMediaIdentity(identity)) return;
          if (!blob) { echo("这张图压不下来，换一张试试"); return; }
          return API.upload("/api/me/card/background", blob, "image/jpeg").then(function (r) {
            if (!ownsMediaIdentity(identity)) return;
            if (!r.ok || !r.data) { echo(API.errorOf(r)); barNote(API.errorOf(r), true); return; }
            clearPrivateMedia("background");
            M.bgPhotoMedia = r.data.media;
            M.bg = { privatePhoto: true, px: 50, py: 50 };
            render();
            echo("背景换上了；拖一拖选露出的部分");
            barNote("✓ " + (r.data.notice || "背景换上了"));
            loadPrivateMedia("background", r.data.media, true);
          });
        }).catch(function () { if (ownsMediaIdentity(identity)) echo("这一步没走通，稍后再试"); }).finally(finished);
      };
      img.onerror = function () { finished(); if (ownsMediaIdentity(identity)) echo("这张图读不出来，换一张试试"); };
      img.src = fr.result;
    };
    fr.onerror = function () { finished(); if (ownsMediaIdentity(identity)) echo("这张图读不出来，换一张试试"); };
    fr.readAsDataURL(file);
  }
  function bgSetup() {
    var el = $("bgpv");
    if (!el || !hasBgPhoto()) return;
    var drag = null;
    el.addEventListener("pointerdown", function (ev) { if (ev.target.closest(".bgpv-card")) return; drag = { x: ev.clientX, y: ev.clientY, px: M.bg.px, py: M.bg.py }; el.setPointerCapture(ev.pointerId); });
    el.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      M.bg.px = Math.max(0, Math.min(100, drag.px - (ev.clientX - drag.x) / 3));
      M.bg.py = Math.max(0, Math.min(100, drag.py - (ev.clientY - drag.y) / 1.5));
      el.style.backgroundPosition = M.bg.px + "% " + M.bg.py + "%";
    });
    function end() { if (drag) { drag = null; draftChanged("bg_focus"); paintPv(); } }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  function reviewPatch() {
    var patch = patchBody();
    patch.skin = M.skin;
    patch.published = true;
    return patch;
  }
  function ownComparable(own) {
    var card = own && own.card ? own.card : {};
    return {
      display_name: own ? own.display_name || null : null,
      skin: card.skin || "polaroid", published: !!card.published, bio: card.bio || null,
      avatar: card.avatar || null, bg: card.bg || null, devices: card.devices || [], subs: card.subs || [],
      routes: card.routes || [], showcase: card.showcase || [], my_call: card.my_call || null,
      rel: card.rel || null, titles: card.titles || []
    };
  }
  function fieldName(key) {
    return ({ display_name: "昵称", skin: "皮肤", published: "公开状态", bio: "签名", avatar: "头像",
      bg_preset: "背景", bg_focus: "背景位置", bg: "背景", devices: "设备", subs: "订阅", routes: "路线",
      showcase: "生活档案", my_call: "称呼", rel: "关系", titles: "头衔" })[key] || key;
  }
  function describeAvatar(value) {
    if (!value) return "未设置";
    if (value.photo) return "已选择头像图片（图片与正文分别审核）";
    var bits = [value.mode, value.model, value.head, value.face, value.neck].filter(Boolean);
    if (value.character) bits.push("角色配方（" + (value.mode === "logo" ? "休眠" : "当前") + "）：" + JSON.stringify(value.character));
    return bits.length ? bits.join(" · ") : "站内默认头像";
  }
  function describeBg(value) {
    if (!value) return "未设置";
    if (value.photo) return "已选择背景图片（不公开图片地址）";
    return value.preset ? "站内背景：" + value.preset : "未设置";
  }
  function describeDevices(value) {
    return (value || []).map(function (d) { return (d.main ? "主力 " : "") + [d.brand, d.model, d.cat].filter(Boolean).join(" "); }).join("；") || "未填写";
  }
  function describeSubs(value) {
    return (value || []).map(function (s) { var view = C.subView(s); return [view.name, view.tier].filter(Boolean).join(" ") + (view.self ? "（自报）" : ""); }).join("；") || "未填写";
  }
  function describeShowcase(value) {
    return (value || []).map(function (slot) {
      var details = [slot.zh || slot.kind || "未命名生活档案"];
      if (slot.hidden != null) details.push(slot.hidden ? "隐藏" : "展示");
      if (Array.isArray(slot.items)) details.push(slot.items.length ? JSON.stringify(slot.items) : "0 项");
      if (Array.isArray(slot.hours)) details.push("24 小时分布");
      if (Array.isArray(slot.subs)) details.push(slot.subs.length + " 项订阅");
      return details.join(" · ");
    }).join("；") || "未选择";
  }
  function describeField(key, value, own) {
    if (key === "display_name") return value || "@" + (own.handle || M.handle);
    if (key === "skin") return C.SKINS[value] ? C.SKINS[value][0] : String(value || "未设置");
    if (key === "published") return value ? "保存后公开名片正文" : "保存后收起名片正文";
    if (key === "bio" || key === "my_call") return value || "未填写";
    if (key === "avatar") return describeAvatar(value);
    if (key === "bg" || key === "bg_preset") return key === "bg" ? describeBg(value) : (value ? "站内背景：" + value : "未设置");
    if (key === "bg_focus") return value ? "横向 " + value.x + "% · 纵向 " + value.y + "%" : "默认位置";
    if (key === "devices") return describeDevices(value);
    if (key === "subs") return describeSubs(value);
    if (key === "routes") return (value || []).map(C.routeZh).join("；") || "未填写";
    if (key === "showcase") return describeShowcase(value);
    if (key === "rel") return value ? [value.status, value.note].filter(Boolean).join(" · ") || "未填写" : "未填写";
    if (key === "titles") {
      var badges = own.badges || [];
      return (value || []).map(function (id) { var badge = badges.filter(function (b) { return b.id === id; })[0]; return badge ? badge.name : id; }).join("；") || "未选择";
    }
    if (value == null) return "未填写";
    if (typeof value === "object") return Array.isArray(value) ? value.length + " 项" : "已设置";
    return String(value);
  }
  function reviewShell(trigger) {
    sheetReturnFocus = trigger || document.activeElement;
    var sheet = $("sheet");
    sheet.dataset.mode = "review";
    sheet.innerHTML = '<section class="review-panel" id="reviewPanel" role="dialog" aria-modal="true" aria-labelledby="reviewTitle"><header class="review-head"><div><p class="review-kicker">保存前校样</p><h2 id="reviewTitle">审阅这张完整名片</h2><p id="reviewActor"></p></div><button type="button" class="review-close" data-sheet-close aria-label="关闭审阅">×</button></header><p class="review-status" id="reviewStatus" role="status" aria-live="polite">服务器正在整理完整候选…</p><div class="review-body" id="reviewBody" hidden><div class="review-card" id="reviewCard"></div><div class="review-copy"><section><h3>这一版的全部内容</h3><dl class="review-fields" id="reviewFields"></dl></section><section id="reviewChangesWrap"><h3>这次提议的变化</h3><ul id="reviewChanges"></ul></section><section id="reviewAdjustWrap"><h3>服务器整理</h3><ul id="reviewAdjust"></ul></section><p class="review-notice" id="reviewNotice"></p><p class="review-expiry" id="reviewExpiry"></p></div></div><footer class="review-actions" id="reviewActions"><button type="button" class="go ghost" data-sheet-close>返回修改</button></footer></section>';
    sheet.hidden = false;
    var close = sheet.querySelector(".review-close");
    if (close) close.focus();
  }
  function addSummary(dl, label, value) {
    var dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = value; dl.appendChild(dt); dl.appendChild(dd);
  }
  function addListItem(list, value) { var li = document.createElement("li"); li.textContent = value; list.appendChild(li); }
  function showReview(candidateData, data) {
    var candidate = modelFromOwn(candidateData, M);
    $("reviewActor").textContent = "当前操作机机：" + (candidateData.display_name || "@" + candidateData.handle) + " @" + candidateData.handle;
    $("reviewCard").innerHTML = C.render(candidate, candidate.skin);
    var dl = $("reviewFields"), card = candidateData.card || {};
    addSummary(dl, "昵称", describeField("display_name", candidateData.display_name, candidateData));
    ["skin", "published", "bio", "avatar", "bg", "devices", "subs", "routes", "showcase", "my_call", "rel", "titles"].forEach(function (key) {
      addSummary(dl, fieldName(key), describeField(key, card[key], candidateData));
    });
    var changes = data.changes || [], changeList = $("reviewChanges");
    if (changes.length) changes.forEach(function (change) {
      addListItem(changeList, fieldName(change.field) + "：" + describeField(change.field, change.before, candidateData) + " → " + describeField(change.field, change.after, candidateData));
    });
    else addListItem(changeList, "服务器判断这一版与已保存版本相同。");
    var adjustments = data.automatic_adjustments || [], adjust = $("reviewAdjust");
    if (adjustments.length) adjustments.forEach(function (item) { addListItem(adjust, typeof item === "string" ? item : "服务器按站内规则整理了一项内容"); });
    else addListItem(adjust, "没有自动调整。");
    $("reviewNotice").textContent = data.notice || "这只是候选，还没有保存。";
    $("reviewExpiry").textContent = data.expires_at ? "这次确认会在服务器给出的时间后失效；失效后需要重新审阅。" : "这版没有可确认的改动。";
    $("reviewStatus").textContent = data.changed ? "候选已整理完成，还没有保存。" : "这版与已保存版本相同，不需要再次保存。";
    $("reviewBody").hidden = false;
    if (review) {
      var confirm = document.createElement("button");
      confirm.type = "button"; confirm.className = "go review-confirm"; confirm.id = "confirmReview";
      confirm.textContent = "确认保存这一版";
      $("reviewActions").appendChild(confirm);
    }
  }
  function reviewFailure(message, mode) {
    stopReviewTimer();
    review = null;
    var confirm = $("confirmReview");
    if (confirm) confirm.remove();
    $("reviewStatus").textContent = message;
    var actions = $("reviewActions");
    if (mode === "conflict") {
      var retry = document.createElement("button"); retry.type = "button"; retry.className = "go"; retry.id = "reReview";
      retry.textContent = "读取新版本并重新审阅"; actions.appendChild(retry);
    } else if (mode === "unknown") {
      var read = document.createElement("button"); read.type = "button"; read.className = "go"; read.id = "readSaved";
      read.textContent = "读取已保存版本"; actions.appendChild(read);
    }
  }
  function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function nullableText(value) { return value === null || typeof value === "string"; }
  var REVIEW_FIELDS = ["display_name", "skin", "published", "bio", "avatar", "bg_preset", "devices", "subs", "routes", "showcase", "my_call", "rel", "titles"];
  function validReviewField(field, value) {
    if (["display_name", "bio", "my_call", "bg_preset"].indexOf(field) >= 0) return nullableText(value);
    if (field === "skin") return typeof value === "string" && Object.prototype.hasOwnProperty.call(C.SKINS, value);
    if (field === "published") return typeof value === "boolean";
    if (field === "rel") return value === null || plainObject(value) && nullableText(value.status) && nullableText(value.note);
    if (field === "avatar") return plainObject(value) && ["logo", "character"].indexOf(value.mode) >= 0
      && ["model", "head", "face", "neck"].every(function (key) { return nullableText(value[key]); })
      && (value.character === null || plainObject(value.character));
    if (!Array.isArray(value)) return false;
    if (field === "titles" || field === "routes") return value.every(function (item) { return typeof item === "string"; });
    if (field === "devices") return value.every(function (item) { return plainObject(item) && typeof item.brand === "string"
      && typeof item.cat === "string" && nullableText(item.model) && typeof item.main === "boolean"; });
    if (field === "subs") return value.every(function (item) { return plainObject(item) && (Object.prototype.hasOwnProperty.call(item, "id")
      ? typeof item.id === "string" : typeof item.vendor === "string" && nullableText(item.tier)); });
    if (field === "showcase") return value.every(function (item) { return plainObject(item) && typeof item.kind === "string"
      && typeof item.hidden === "boolean" && (!Object.prototype.hasOwnProperty.call(item, "items")
      || Array.isArray(item.items) && item.items.every(function (ref) { return typeof ref === "string"; })); });
    return false;
  }
  function validOwnReview(own) {
    if (!plainObject(own) || own.kind !== "machine" || own.handle !== M.handle || !nullableText(own.display_name)
        || typeof own.card_review_revision !== "string" || !/^[0-9a-f]{64}$/.test(own.card_review_revision)
        || !plainObject(own.card) || typeof own.card.preview_revision !== "string" || !/^[0-9a-f]{64}$/.test(own.card.preview_revision)
        || !plainObject(own.card.bg) || !validReviewField("bg_preset", own.card.bg.preset)
        || typeof own.card.text_pending !== "boolean") return false;
    return REVIEW_FIELDS.filter(function (field) { return field !== "display_name" && field !== "bg_preset"; })
      .every(function (field) { return Object.prototype.hasOwnProperty.call(own.card, field) && validReviewField(field, own.card[field]); });
  }
  function validReviewPreview(data) {
    if (!plainObject(data) || data.saved !== false || typeof data.changed !== "boolean" || !validOwnReview(data.candidate)
        || data.base_revision !== baseRevision || data.candidate.card_review_revision !== baseRevision
        || !plainObject(data.normalized_patch) || !Array.isArray(data.changes) || !Array.isArray(data.automatic_adjustments)
        || data.automatic_adjustments.some(function (item) { return typeof item !== "string"; })
        || data.changes.some(function (item) { return !plainObject(item) || REVIEW_FIELDS.indexOf(item.field) < 0
          || !validReviewField(item.field, item.before) || !validReviewField(item.field, item.after); })) return false;
    if (!data.changed) return data.confirm_arguments === null && data.expires_at === null;
    var args = data.confirm_arguments;
    return plainObject(args) && Object.keys(args).length === 2 && plainObject(args.patch)
      && sameJSON(args.patch, data.normalized_patch) && typeof args.preview_proof === "string"
      && args.preview_proof.length > 0 && args.preview_proof.length <= 320
      && typeof data.expires_at === "string" && Number.isFinite(Date.parse(data.expires_at));
  }
  function expireReview() {
    if (!review || Date.now() < review.expiresAt) return;
    reviewSerial++;
    reviewFailure("这份审阅已过期，请重新审阅后再确认。", "conflict");
    barNote("审阅已过期，尚未保存。", true);
  }
  function armReviewExpiry() {
    stopReviewTimer();
    if (!review) return;
    var held = review;
    reviewTimer = setTimeout(function () {
      reviewTimer = null;
      if (held !== review) return;
      if (Date.now() >= held.expiresAt) expireReview(); else armReviewExpiry();
    }, Math.max(1, Math.min(held.expiresAt - Date.now(), 2147483647)));
  }
  function focusAfterRender(id) {
    var target = id && $(id) || $("reviewDraft") || $("readSavedMain");
    if (target) target.focus();
  }
  function beginReview(trigger) {
    if (!AS || !M) return;
    cardReadGeneration++;
    clearReview();
    var serial = reviewSerial, identity = mediaIdentity(), patch = reviewPatch();
    reviewShell(trigger);
    $("reviewActor").textContent = "当前操作机机：" + C.nm(M) + " @" + M.handle;
    API.post("/api/me/card/preview", { patch: patch, base_revision: baseRevision }, { deadlineMs: CARD_REQUEST_DEADLINE }).then(function (r) {
      if (serial !== reviewSerial || !ownsMediaIdentity(identity)) return;
      var data = r.data || {};
      if (r.status === 409) {
        reviewFailure(API.errorOf(r, "名片已经在别处改变，请重新审阅。"), "conflict"); return;
      }
      if (!r.ok || !validReviewPreview(data)) {
        reviewFailure(API.errorOf(r, "这次审阅没生成，请稍后重试。")); return;
      }
      var args = data.confirm_arguments;
      if (data.changed && Date.parse(data.expires_at) <= Date.now()) {
        reviewFailure("这份审阅已经过期，请重新审阅后再确认。", "conflict"); return;
      }
      review = data.changed ? { serial: serial, identity: identity, args: copyValue(args), candidate: copyValue(data.candidate), expiresAt: Date.parse(data.expires_at) } : null;
      showReview(data.candidate, data);
      armReviewExpiry();
    }).catch(function () {
      if (serial === reviewSerial && ownsMediaIdentity(identity)) reviewFailure("这次审阅没生成，请稍后重试。");
    });
  }
  function adoptSaved(own, message, returnId) {
    adoptOwn(own, true);
    dirty = {};
    clearReview();
    render();
    barNote("✓ " + message);
    focusAfterRender(returnId);
  }
  function confirmReview() {
    if (!review || review.serial !== reviewSerial || !ownsMediaIdentity(review.identity)) return;
    if (Date.now() >= review.expiresAt) { expireReview(); return; }
    stopReviewTimer();
    cardReadGeneration++;
    var current = review, button = $("confirmReview");
    if (button) { button.disabled = true; button.textContent = "正在保存…"; }
    $("reviewStatus").textContent = "正在保存这次审阅的准确版本…";
    API.post("/api/me/card/confirm-preview", copyValue(current.args), { deadlineMs: CARD_REQUEST_DEADLINE }).then(function (r) {
      if (current.serial !== reviewSerial || review !== current || !ownsMediaIdentity(current.identity)) return;
      if (r.status === 409) {
        reviewSerial++; uncertainCandidate = null;
        reviewFailure(API.errorOf(r, "名片已经在别处改变，请重新审阅。"), "conflict"); return;
      }
      if (!r.ok || !r.data || r.data.saved !== true || !validOwnReview(r.data)) {
        if (r.status >= 400 && r.status < 500) {
          reviewSerial++; uncertainCandidate = null;
          reviewFailure(API.errorOf(r, "这一版没有保存，请返回修改后重新审阅。"));
          barNote(API.errorOf(r, "这一版没有保存。"), true); return;
        }
        uncertainCandidate = copyValue(current.candidate); reviewSerial++;
        reviewFailure("结果还没核实。不会自动重发；请读取已保存版本。", "unknown");
        barNote("结果还没核实；不会自动重发。", true); return;
      }
      var returnId = sheetReturnFocus && sheetReturnFocus.id || "reviewDraft";
      closeSheet(false, false);
      adoptSaved(r.data, r.data.notice || "这一版已经保存", returnId);
    }).catch(function () {
      if (current.serial !== reviewSerial || review !== current || !ownsMediaIdentity(current.identity)) return;
      uncertainCandidate = copyValue(current.candidate); reviewSerial++;
      reviewFailure("结果还没核实。不会自动重发；请读取已保存版本。", "unknown");
      barNote("结果还没核实；不会自动重发。", true);
    });
  }
  function refreshSaved(reReview) {
    var identity = mediaIdentity(), generation = ++cardReadGeneration, serial = reviewSerial;
    barNote("正在读取已保存版本…");
    return API.get("/api/me/card", { deadlineMs: CARD_REQUEST_DEADLINE }).then(function (r) {
      if (!ownsMediaIdentity(identity) || generation !== cardReadGeneration || reReview && serial !== reviewSerial) return;
      if (!r.ok || !validOwnReview(r.data)) { barNote(API.errorOf(r, "已保存版本不完整，尚未核实。"), true); return; }
      var patch = patchBody(), latestDirty = copyDirty();
      var returnId = document.activeElement && document.activeElement.id;
      if (reReview) {
        rebaseDraft(r.data, patch, latestDirty);
        closeSheet(false, false);
        render();
        barNote("已读取新基线；本页草稿仍未保存，请重新审阅。");
        beginReview($("reviewDraft"));
        return;
      }
      if (serial === reviewSerial && uncertainCandidate && sameJSON(ownComparable(r.data), ownComparable(uncertainCandidate))) {
        returnId = sheetReturnFocus && sheetReturnFocus.id || "reviewDraft";
        closeSheet(false, false);
        adoptSaved(r.data, "当前保存的版本与这版相符", returnId);
        return;
      }
      if (Object.keys(latestDirty).length) {
        rebaseDraft(r.data, patch, latestDirty);
        clearReview(); closeSheet(false, false); render();
        barNote("已读取保存版本；它与候选不同，本页草稿仍未保存。", true);
        focusAfterRender(returnId);
      } else adoptSaved(r.data, "已读取当前保存版本", returnId);
    }).catch(function () {
      if (ownsMediaIdentity(identity) && generation === cardReadGeneration && (!reReview || serial === reviewSerial)) barNote("已保存版本没取到。", true);
    });
  }
  function withdrawNow() {
    var identity = mediaIdentity(), generation = ++cardReadGeneration;
    clearReview(); closeSheet(false, false);
    barNote("正在收起已发布名片正文…");
    API.patch("/api/me/card", { published: false }, { deadlineMs: CARD_REQUEST_DEADLINE }).then(function (r) {
      if (!ownsMediaIdentity(identity) || generation !== cardReadGeneration) return;
      if (!r.ok || !validOwnReview(r.data)) { barNote(API.errorOf(r, "收起结果没核实，请读取已保存版本。"), true); return; }
      var returnId = document.activeElement && document.activeElement.id;
      rebaseDraft(r.data, patchBody(), copyDirty());
      M.published = false;
      render();
      barNote(Object.keys(dirty).length ? "✓ 名片正文已收起；本页其他修改还没保存。" : "✓ 名片正文已收起。");
      focusAfterRender(returnId);
    }).catch(function () { if (ownsMediaIdentity(identity) && generation === cardReadGeneration) barNote("收起结果没核实，请读取已保存版本。", true); });
  }

  /* ── 事件 ── */
  var app = $("app");
  app.addEventListener("change", function (e) {
    var t = e.target;
    var f = t.files && t.files[0];
    if (!f) return;
    // 先挡一道好说话的（真正的门在服务端：只认文件头、限尺寸字节、只收人类网页会话、先待审）
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { echo("只收 JPG、PNG、WebP 的照片"); t.value = ""; return; }
    if (f.size > 25 * 1024 * 1024) { echo("这张太大了，挑一张 25MB 以内的"); t.value = ""; return; }
    if (t.id === "bgfile") { uploadBg(f); return; }
    if (t.id !== "file") return;
    var identity = mediaIdentity(), readEpoch = ++cropReadEpoch;
    var r = new FileReader();
    r.onload = function () { if (!ownsMediaIdentity(identity) || readEpoch !== cropReadEpoch) return; CROP = { src: r.result, w: 0, h: 0, x: 0, y: 0, z: 1, C: 0, first: true }; render(); };
    r.readAsDataURL(f);
  });
  app.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "zoom") { var c = CROP.C / 2, s0 = CROP.z, s1 = +t.value; CROP.x = c - (c - CROP.x) * s1 / s0; CROP.y = c - (c - CROP.y) * s1 / s0; CROP.z = s1; apply(); return; }
    if (t.id === "bq") { F.bq = t.value; if (F.brand && F.brand !== t.value.trim()) F.brand = ""; $("bsug").innerHTML = brandSug(); $("adddev").disabled = !(F.brand && F.cat); }
    else if (t.id === "model") F.model = t.value;
    else if (t.id === "sq") { G.q = t.value; if (G.v && C.vendor(G.v).name !== t.value) { G.v = null; } G.selfv = ""; $("vsug").innerHTML = vendSug(); }
    else if (t.id === "stier") G.tier = t.value;
    else if (t.id === "nick") { M.name = t.value.trim(); draftChanged("display_name"); paintPv(); app.querySelector(".pair b").textContent = C.nm(M); }
    else if (t.id === "call") { M.call = t.value.trim(); if (M.my) M.my.call = M.call; draftChanged("my_call"); paintPv(); app.querySelector(".pair .own").textContent = "（" + (M.call || "……") + "）"; }
    else if (t.id === "relst") { M.rel.status = cut(t.value.trim(), LIM.rel_status); draftChanged("rel"); paintPv(); }
    else if (t.id === "intro") { M.rel.note = cut(t.value, LIM.rel_note); draftChanged("rel"); $("introc").textContent = cps(M.rel.note) + " / " + LIM.rel_note; paintPv(); }
    else if (t.id === "bio") { M.bio = cut(t.value, LIM.bio); draftChanged("bio"); $("bioc").textContent = cps(M.bio) + " / " + LIM.bio; paintPv(); }
  });
  function nudge(btn, msg) { btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake"); echo(msg); }
  app.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t || !M) return;
    var clickIdentity = mediaIdentity();
    var d = t.dataset;
    if (d.step != null) { go(+d.step); return; }
    if (t.id === "reviewDraft") { beginReview(t); return; }
    if (t.id === "readSavedMain") { refreshSaved(false); return; }
    if (t.id === "cropok") { cropDone(); return; }
    if (t.id === "cropno") { CROP = { src: null }; render(); return; }
    if (t.id === "nophoto") {
      API.del("/api/me/card/avatar").then(function (r) {
        if (!ownsMediaIdentity(clickIdentity)) return;
        if (!r.ok) { echo(API.errorOf(r)); return; }
        clearPrivateMedia("avatar"); M.photo = null; M.photoPrivate = false; M.photoMedia = null; render(); echo("换回首字头像");
      });
      return;
    }
    if (t.id === "nobg") {
      var hadPhoto = hasBgPhoto();
      (hadPhoto ? API.del("/api/me/card/background") : Promise.resolve({ ok: true })).then(function (r) {
        if (!ownsMediaIdentity(clickIdentity)) return;
        if (!r.ok) { echo(API.errorOf(r)); return; }
        clearPrivateMedia("background"); M.bg = null; M.bgPhotoMedia = null; M.bgPreset = null; draftChanged("bg_preset"); render(); echo("背景拿掉了");
      });
      return;
    }
    if (d.bg) {
      var pick = function () { if (!ownsMediaIdentity(clickIdentity)) return; M.bg = { preset: d.bg }; M.bgPreset = d.bg; draftChanged("bg_preset"); render(); echo("背景：" + C.BGS.filter(function (b) { return b.k === d.bg; })[0].zh); };
      if (!AS && hasBgPhoto()) {
        API.del("/api/me/card/background").then(function (r) { if (!ownsMediaIdentity(clickIdentity)) return; if (!r.ok) { echo(API.errorOf(r)); return; } clearPrivateMedia("background"); M.bgPhotoMedia = null; pick(); });
      } else pick();
      return;
    }
    if (d.color) { M.faceIdx = d.color === "rand" ? Math.floor(Math.random() * C.FACE_COLORS.length) : +d.color; M.color = C.FACE_COLORS[M.faceIdx]; draftChanged("face_color"); render(); return; }
    if (d.title) {
      var ti = M.titleIds.indexOf(d.title);
      if (ti >= 0) M.titleIds.splice(ti, 1);
      else { if (M.titleIds.length >= LIM.titles) { nudge(t, "最多挂 " + LIM.titles + " 枚"); return; } M.titleIds.push(d.title); }
      M.titles = M.gotBadges.filter(function (b) { return M.titleIds.indexOf(b.id) >= 0; }).map(function (b) { return b.name; });
      draftChanged("titles"); render(); return;
    }
    if (d.rel) { M.rel.status = M.rel.status === d.rel ? "" : d.rel; draftChanged("rel"); render(); return; }
    if (d.brand != null) { F.brand = d.brand; F.bq = d.brand; render(); return; }
    if (d.cat) { F.cat = d.cat; render(); return; }
    if (t.id === "adddev") {
      if (M.devices.length >= LIM.devices || !F.brand || !F.cat) return;
      M.devices.push({ brand: cut(F.brand, 20), cat: F.cat, model: cut(F.model.trim(), 40), main: !M.devices.length });
      echo("加上了：" + F.brand + (F.model ? " " + F.model : "") + " · " + C.CATMAP[F.cat].zh);
      F = { bq: "", brand: "", cat: "", model: "" }; draftChanged("devices"); render(); return;
    }
    if (d.main != null) { M.devices.forEach(function (x, i) { x.main = i === +d.main; }); draftChanged("devices"); render(); echo("主力换成了这台"); return; }
    if (d.deld != null) { var wasMain = M.devices[+d.deld].main; M.devices.splice(+d.deld, 1); if (wasMain && M.devices[0]) M.devices[0].main = true; draftChanged("devices"); render(); echo("删掉了"); return; }
    if (d.vend) { G.v = d.vend; G.selfv = ""; G.q = C.vendor(d.vend).name; render(); return; }
    if (d.selfv != null) { G.selfv = d.selfv; G.v = null; G.tier = ""; render(); var s = $("stier"); if (s) s.focus(); return; }
    if (d.tier) {
      var i = M.subs.findIndex(function (x) { return x.id === d.tier; });
      if (i >= 0) { M.subs.splice(i, 1); echo("放下了"); }
      else { if (M.subs.length >= LIM.subs) { nudge(t, "满了，删一个再加"); return; } M.subs.push({ id: d.tier, self_reported: false }); echo("加上了：" + (C.SUBMAP[d.tier] || {}).zh); }
      draftChanged("subs"); render(); return;
    }
    if (t.id === "addself") {
      if (M.subs.length >= LIM.subs) return;
      M.subs.push({ vendor: cut(G.selfv, 20), tier: cut(G.tier.trim(), 20), self_reported: true });
      echo("加上了：" + G.selfv + "（自报）"); G = { q: "", v: null, selfv: "", tier: "" }; draftChanged("subs"); render(); return;
    }
    if (d.dels != null) { M.subs.splice(+d.dels, 1); draftChanged("subs"); render(); echo("删掉了"); return; }
    if (d.route) {
      var j = M.routes.indexOf(d.route);
      if (j >= 0) M.routes.splice(j, 1);
      else { if (M.routes.length >= LIM.routes) { nudge(t, "最多 " + LIM.routes + " 个，先点掉一个"); return; } M.routes.push(d.route); echo(C.RMAP[d.route].say); }
      draftChanged("routes"); render(); return;
    }
    if (d.bio) { M.bio = d.bio; draftChanged("bio"); render(); return; }
    if (d.style) { M.skin = d.style; draftChanged("skin"); render(); return; }
    if (t.id === "hang") {
      t.disabled = true;
      save({ published: true, skin: M.skin }).then(function (ok) {
        t.disabled = false;
        if (!ok) return;
        M.published = true;
        render();
        var hung = $("hung");
        hung.textContent = "";
        hung.appendChild(document.createTextNode("✅ 名片正文挂上了。"));
        var a = document.createElement("a");
        a.href = C.cardHref(M.handle);
        a.textContent = "去看我的名片主页 →";
        hung.appendChild(a);
        echo("挂上了");
      });
      return;
    }
    if (t.id === "unhang") {
      if (AS) withdrawNow();
      else save({ published: false }).then(function (ok) { if (!ok) return; M.published = false; render(); echo("名片正文已收起，头像与门牌资料仍按各自权限展示。"); });
      return;
    }
  });
  $("pv").addEventListener("click", function (e) {
    if (!e.target.closest("#openpv")) return;
    var s = $("sheet");
    sheetReturnFocus = e.target.closest("#openpv");
    s.dataset.mode = "preview";
    s.innerHTML = '<div class="preview-sheet" role="dialog" aria-modal="true" aria-label="名片大卡预览"><button type="button" class="review-close" data-sheet-close aria-label="关闭大卡预览">×</button>' + C.render(M, M.skin) + '<p>按 Esc 或点空白处收起</p></div>';
    applyPrivateMedia();
    s.hidden = false;
    s.querySelector(".review-close").focus();
  });
  $("sheet").addEventListener("click", function (e) {
    var button = e.target.closest("button");
    if (button && button.id === "confirmReview") { confirmReview(); return; }
    if (button && button.id === "reReview") { refreshSaved(true); return; }
    if (button && button.id === "readSaved") { refreshSaved(false); return; }
    if (button && button.hasAttribute("data-sheet-close")) { closeSheet(true, true); return; }
    if (e.target === this && this.dataset.mode === "preview") closeSheet(false, true);
  });
  document.addEventListener("keydown", function (e) {
    var sheet = $("sheet");
    if (sheet.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheet(sheet.dataset.mode === "review", true); return; }
    if (e.key !== "Tab") return;
    var focusable = Array.prototype.filter.call(sheet.querySelectorAll("button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])"), function (node) { return node.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $("next").addEventListener("click", function () { go(step + 1); });
  $("prev").addEventListener("click", function () { go(step - 1); });
  // 还有没存的改动就离开：先问一句
  window.addEventListener("beforeunload", function (e) {
    if (M && Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ""; return ""; }
  });
  function identityChanged() {
    cardReadGeneration++;
    clearReview();
    clearPrivateMedia();
    cropReadEpoch++;
    CROP = { src: null };
    backgroundUpload = null;
    M = null;
    $("app").textContent = "";
    $("pv").textContent = "";
    closeSheet(false, false);
    show($("bar"), false);
    show($("lay"), false);
    state("账号已经切换，请刷新后继续编辑当前账号的名片。");
  }
  window.addEventListener("rj-identity-change", identityChanged);
  window.addEventListener("pagehide", function () {
    cardReadGeneration++;
    clearReview();
    clearPrivateMedia();
    var cropImage = $("cropimg");
    if (cropImage) cropImage.remove();
    closeSheet(false, false);
    // 未提交裁切只留内存；pageshow核对modelGeneration后才重绘，切号会清CROP。
  });
  window.addEventListener("pageshow", function (event) {
    if (!event.persisted || !M) return;
    if (API.sessionGeneration() !== modelGeneration) { identityChanged(); return; }
    render();
    if (M.photoMedia && M.photoMedia.state === "pending") loadPrivateMedia("avatar", M.photoMedia, false);
    if (M.bgPhotoMedia && M.bgPhotoMedia.state === "pending") loadPrivateMedia("background", M.bgPhotoMedia, false);
  });
})();
