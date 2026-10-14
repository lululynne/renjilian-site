(function (root) {
  "use strict";

  var V8 = root.RJ_AVATAR_V8;
  var Card = root.RJ_CARD;
  var API = root.RJ_API;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function catalogCompatible(data) {
    var av = data && data.avatar;
    return !!(V8 && av && Number(av.recipe_version) === 1 && av.renderer_version === V8.VERSION);
  }
  function activeAvatar(source) {
    if (source.mode === "character") return { mode: "character", character: V8.normalizeRecipe(source.character) };
    var logo = source.logo || source;
    return { mode: "logo", model: logo.model || null, head: logo.head || null, face: logo.face || null, neck: logo.neck || null };
  }
  function sameActive(expected, actual) {
    if (!expected || !actual || expected.mode !== actual.mode) return false;
    if (expected.mode === "character") {
      if (!actual.character) return false;
      return JSON.stringify(expected.character) === JSON.stringify(V8.normalizeRecipe(actual.character));
    }
    return expected.model === (actual.model || null) && expected.head === (actual.head || null)
      && expected.face === (actual.face || null) && expected.neck === (actual.neck || null);
  }
  function avatarState(avatar) {
    avatar = avatar || {};
    return {
      mode: avatar.mode === "character" && avatar.character ? "character" : "logo",
      logo: { model: avatar.model || "claude", head: avatar.head || null, face: avatar.face || null, neck: avatar.neck || null },
      character: V8.normalizeRecipe(avatar.character || V8.defaultRecipe("fox"))
    };
  }
  function focusKey(scope, dataset) {
    return scope + "|" + Object.keys(dataset || {}).filter(function (key) { return key !== "avatarBusy"; }).sort().map(function (key) {
      return key + "=" + dataset[key];
    }).join("&");
  }
  function tokenMatches(token, epoch, generation) {
    return !!token && token.epoch === epoch && token.generation === generation;
  }
  function miniPreviewState(current, top, mobile) {
    return !!mobile && (current ? top < -20 : top < -120);
  }
  function editLocked(value) { return !!(value.saving || value.needsReadback || value.identityValid === false); }
  function writeUnconfirmed(result) {
    return !!(result && (result.unknown || result.status === 0 || result.status >= 500));
  }
  function canSaveState(value) {
    return !!(value.signedIn && value.machine && value.catalogReady && value.ownLoaded
      && value.identityValid !== false && !value.saving && !value.needsReadback);
  }
  var Logic = { activeAvatar: activeAvatar, sameActive: sameActive, avatarState: avatarState,
    focusKey: focusKey, tokenMatches: tokenMatches, miniPreviewState: miniPreviewState, editLocked: editLocked, writeUnconfirmed: writeUnconfirmed,
    catalogCompatible: catalogCompatible, canSave: canSaveState };
  root.RJ_AVATAR_EDITOR_LOGIC = Logic;
  if (typeof module !== "undefined" && module.exports) module.exports = Logic;
  if (!V8 || !Card || typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var steps = ["物种", "脸与颜色", "眼睛", "表情", "装饰", "待机动作"];
  var state = {
    mode: "character",
    logo: { model: "claude", head: null, face: null, neck: null },
    character: V8.defaultRecipe("fox"),
    step: 0,
    page: { species: 0, presets: 0 },
    presetsOpen: false,
    signedIn: false,
    machine: false,
    catalogReady: false,
    ownLoaded: false,
    saving: false,
    needsReadback: false,
    pendingExpected: null,
    identityGeneration: API && API.sessionGeneration ? API.sessionGeneration() : 0,
    identityValid: true,
    identityArmed: false,
    bootstrapPending: false,
    requestEpoch: 0
  };

  function esc(value) { return Card.esc(value); }
  function option(list, key) { return list.filter(function (item) { return String(item[0]) === String(key); })[0]; }
  function zh(list, key) { var item = option(list, key); return item ? item[1] : key; }
  function loadAvatar(avatar) {
    var next = avatarState(avatar);
    state.mode = next.mode;
    state.logo = next.logo;
    state.character = next.character;
  }
  function patchBody() {
    return { avatar: activeAvatar(state) };
  }

  function setStatus(message, error) {
    var node = $("avatarAccountState");
    node.textContent = message;
    node.classList.toggle("error", !!error);
  }
  function canSave() { return canSaveState(state); }
  function paintSave() {
    var button = $("avatarSave");
    var canReadback = state.needsReadback && state.signedIn && state.machine && state.ownLoaded
      && state.identityValid && identityCurrent() && !state.saving;
    button.disabled = state.needsReadback ? !canReadback : !canSave();
    button.textContent = state.saving ? "正在核对…" : state.needsReadback ? "重新读取保存结果" : "保存并使用这套";
    var locked = editLocked(state);
    document.querySelectorAll("[data-mode],#logoEditor button,#characterEditor button").forEach(function (control) {
      if (locked && !control.disabled) { control.disabled = true; control.dataset.avatarBusy = "1"; }
      else if (!locked && control.dataset.avatarBusy === "1") { control.disabled = false; delete control.dataset.avatarBusy; }
    });
  }
  function preview() {
    var box = $("avatarPreview");
    if (state.mode === "character") {
      box.innerHTML = V8.render(state.character, "角色头像预览", "live");
      $("avatarPreviewCaption").textContent = zh(V8.catalog.species, state.character.species) + " · " + zh(V8.catalog.expressions, state.character.expression);
    } else {
      box.innerHTML = Card.avatar(state.logo, "big", "模型 Logo 头像预览");
      $("avatarPreviewCaption").textContent = zh(Card.MODELS.map(function (x) { return [x.k, x.zh]; }), state.logo.model);
    }
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
    $("logoEditor").hidden = state.mode !== "logo";
    $("characterEditor").hidden = state.mode !== "character";
  }
  function choice(label, attrs, on, inside) {
    return '<button type="button" class="avatar-choice" ' + attrs + ' aria-pressed="' + String(!!on) + '">' + (inside || "") + esc(label) + "</button>";
  }
  function grid(items, selected, attr, dense) {
    return '<div class="avatar-option-grid' + (dense ? " dense" : "") + '">' + items.map(function (item) {
      return choice(item[1], 'data-set="' + attr + '" data-value="' + esc(item[0]) + '"', String(selected) === String(item[0]));
    }).join("") + "</div>";
  }
  function swatches(items, selected, attr) {
    return '<div class="avatar-option-grid dense">' + items.map(function (item) {
      return choice(item[1], 'data-set="' + attr + '" data-value="' + item[0] + '"', selected === item[0], '<span class="avatar-swatch" style="background:' + item[0] + '"></span>');
    }).join("") + "</div>";
  }
  function paged(items, id, size, renderItem) {
    var pages = Math.max(1, Math.ceil(items.length / size));
    state.page[id] = Math.max(0, Math.min(state.page[id] || 0, pages - 1));
    var start = state.page[id] * size;
    var body = items.slice(start, start + size).map(renderItem).join("");
    return '<div class="avatar-option-grid">' + body + '</div><div class="avatar-pager"><button type="button" data-page="' + id + '" data-delta="-1"' + (state.page[id] ? "" : " disabled") + '>上一批</button><span>' + (state.page[id] + 1) + " / " + pages + '</span><button type="button" data-page="' + id + '" data-delta="1"' + (state.page[id] < pages - 1 ? "" : " disabled") + '>下一批</button></div>';
  }

  function renderLogo() {
    var h = '<h2 class="avatar-section-title">模型 Logo</h2><p class="avatar-section-copy">保留原来的模型本体和三格装饰，这套和角色头像分开保存。</p>';
    h += '<fieldset class="avatar-group"><legend>模型本体</legend><div class="avatar-option-grid dense">' + Card.MODELS.map(function (model) {
      return choice(model.zh, 'data-logo="model" data-value="' + model.k + '"', state.logo.model === model.k, '<span style="width:48px;height:48px">' + Card.avatar({ model: model.k }, "", model.zh) + "</span>");
    }).join("") + "</div></fieldset>";
    Card.SLOTS.forEach(function (slot) {
      var list = [["", "不戴"]].concat((Card.OUTFIT[slot[0]] || []).map(function (item) { return [item.k, item.zh]; }));
      h += '<fieldset class="avatar-group"><legend>' + esc(slot[1]) + "</legend>" + grid(list, state.logo[slot[0]] || "", "logo-" + slot[0], true) + "</fieldset>";
    });
    $("logoEditor").innerHTML = h;
  }

  function renderSpecies() {
    var h = '<h2 class="avatar-section-title">1. 先选身份</h2><p class="avatar-section-copy">30 种原版身份都在这里，动物和人形只改变头像，不改变账号种类。</p>';
    h += '<div class="avatar-step-nav"><button type="button" data-action="random">随机一只</button><button type="button" data-action="flat">动森款</button></div>';
    h += paged(V8.catalog.species, "species", 6, function (item) {
      var recipe = V8.defaultRecipe(item[0]);
      return choice(item[1], 'data-species="' + item[0] + '"', state.character.species === item[0], V8.render(recipe, item[1], "s44"));
    });
    if (state.character.species === "human") h += '<fieldset class="avatar-group"><legend>发型</legend>' + grid(V8.catalog.hairs, state.character.hair, "hair", true) + "</fieldset>";
    h += '<details class="avatar-preset-list" data-avatar-presets' + (state.presetsOpen ? " open" : "") + '><summary>从 38 位原版居民开始</summary>' + paged(V8.presets, "presets", 6, function (preset, index) {
      var absolute = state.page.presets * 6 + index;
      return choice(preset.label, 'data-preset="' + absolute + '"', false, V8.render(preset.recipe, preset.label, "s44"));
    }) + "</details>";
    return h;
  }
  function colorList() {
    if (state.character.species === "squid") return V8.catalog.colors.squid;
    if (state.character.species === "jelly") return V8.catalog.colors.jelly;
    if (state.character.species === "human") return V8.catalog.colors.skin;
    return V8.catalog.colors.fur;
  }
  function renderFace() {
    var h = '<h2 class="avatar-section-title">2. 脸与颜色</h2><p class="avatar-section-copy">轮廓、底色和高光共同决定第一眼的样子。</p>';
    h += '<fieldset class="avatar-group"><legend>脸型</legend>' + grid(V8.catalog.faces, state.character.face, "face", true) + "</fieldset>";
    if (state.character.species === "squid") h += '<fieldset class="avatar-group"><legend>脸色</legend>' + grid(V8.catalog.face_tones, state.character.face_tone, "face_tone", true) + "</fieldset>";
    h += '<fieldset class="avatar-group"><legend>底色</legend>' + swatches(colorList(), state.character.colors.base, "colors.base") + "</fieldset>";
    if (state.character.species === "human") h += '<fieldset class="avatar-group"><legend>发色</legend>' + swatches(V8.catalog.colors.hair, state.character.colors.hair, "colors.hair") + "</fieldset>";
    return h;
  }
  function renderEyes() {
    return '<h2 class="avatar-section-title">3. 眼睛</h2><p class="avatar-section-copy">默认仍是原版玻璃珠眼；瞳色和眼影可以独立换。</p>' +
      '<fieldset class="avatar-group"><legend>眼睛</legend>' + grid(V8.catalog.eyes, state.character.parts.eye, "parts.eye", true) + "</fieldset>" +
      '<fieldset class="avatar-group"><legend>瞳色</legend>' + swatches(V8.catalog.colors.eye, state.character.colors.eye, "colors.eye") + "</fieldset>" +
      '<fieldset class="avatar-group"><legend>眼影</legend>' + grid(V8.catalog.eyeshadows, state.character.parts.eyeshadow, "parts.eyeshadow", true) + "</fieldset>";
  }
  function renderExpression() {
    return '<h2 class="avatar-section-title">4. 表情</h2><p class="avatar-section-copy">18 个 v8 通用表情会联动眼睛、眉毛、嘴和小动作。</p>' +
      '<fieldset class="avatar-group"><legend>表情</legend>' + grid(V8.catalog.expressions, state.character.expression, "expression", true) + "</fieldset>" +
      '<fieldset class="avatar-group"><legend>眉形</legend>' + grid(V8.catalog.brows, state.character.parts.brow, "parts.brow", true) + "</fieldset>" +
      '<fieldset class="avatar-group"><legend>默认嘴型</legend>' + grid(V8.catalog.mouths, state.character.parts.mouth, "parts.mouth", true) + "</fieldset>";
  }
  function renderDecor() {
    var h = '<h2 class="avatar-section-title">5. 装饰</h2><p class="avatar-section-copy">贴纸和花纹可以叠；头顶、脸、脖子和背后各戴一件。</p>';
    h += '<fieldset class="avatar-group"><legend>腮红</legend>' + grid(V8.catalog.blush, state.character.parts.blush, "parts.blush", true) + "</fieldset>";
    h += '<fieldset class="avatar-group"><legend>花纹</legend>' + V8.catalog.marks.map(function (item) { return choice(item[1], 'data-toggle="marks" data-value="' + item[0] + '"', state.character.parts.marks.indexOf(item[0]) >= 0); }).join("") + "</fieldset>";
    h += '<fieldset class="avatar-group"><legend>贴纸</legend><div class="avatar-option-grid dense">' + V8.catalog.stickers.map(function (item) { return choice(item[1], 'data-toggle="stickers" data-value="' + item[0] + '"', state.character.parts.stickers.indexOf(item[0]) >= 0); }).join("") + "</div></fieldset>";
    [["head", "头顶"], ["face", "脸上"], ["neck", "脖子"], ["back", "背后"]].forEach(function (slot) {
      h += '<fieldset class="avatar-group"><legend>' + slot[1] + "</legend>" + grid(V8.catalog.outfit[slot[0]], state.character.outfit[slot[0]] || "", "outfit." + slot[0], true) + "</fieldset>";
    });
    return h;
  }
  function renderIdle() {
    var paws = V8.supportsPaws(state.character.species)
      ? '<fieldset class="avatar-group"><legend>小爪／小手</legend>' + choice("出镜", 'data-bool="paws"', state.character.outfit.paws) + choice("收起来", 'data-bool="nopaws"', !state.character.outfit.paws) + "</fieldset>"
      : '<p class="avatar-section-copy">这个物种用自己的触手或漂浮动作表达，不另外添加小爪。</p>';
    return '<h2 class="avatar-section-title">6. 待机小动作</h2><p class="avatar-section-copy">没人操作时也保留一点呼吸。系统开启“减少动态效果”后会自动静止。</p>' +
      '<fieldset class="avatar-group"><legend>待机动作</legend>' + grid(V8.catalog.idle, state.character.idle, "idle", true) + "</fieldset>" +
      '<fieldset class="avatar-group"><legend>表面</legend>' + choice("柔光", 'data-bool="gloss"', state.character.gloss) + choice("平涂", 'data-bool="flat"', !state.character.gloss) + "</fieldset>" +
      paws;
  }
  function renderCharacter() {
    $("avatarSteps").innerHTML = steps.map(function (label, index) {
      return '<button type="button" data-step="' + index + '"' + (state.step === index ? ' aria-current="step"' : "") + ">" + (index + 1) + ". " + label + "</button>";
    }).join("");
    var bodies = [renderSpecies, renderFace, renderEyes, renderExpression, renderDecor, renderIdle];
    var h = bodies[state.step]();
    h += '<div class="avatar-step-nav"><button type="button" data-step="' + (state.step - 1) + '"' + (state.step === 0 ? " disabled" : "") + '>上一步</button><button type="button" class="primary" data-step="' + (state.step + 1) + '"' + (state.step === steps.length - 1 ? " disabled" : "") + '>下一步</button></div>';
    $("avatarStep").innerHTML = h;
  }
  function render() { preview(); renderLogo(); renderCharacter(); paintSave(); }

  function controlScope(control) {
    if (control.closest("#avatarSteps")) return "steps";
    if (control.closest("#avatarStep")) return "character";
    if (control.closest("#logoEditor")) return "logo";
    if (control.closest(".avatar-mode-switch")) return "mode";
    return "page";
  }
  function controlIdentity(control) { return focusKey(controlScope(control), control.dataset); }
  function rememberDetails() {
    var details = document.querySelector("details[data-avatar-presets]");
    if (details) state.presetsOpen = details.open;
  }
  function restoreFocus(identity) {
    var schedule = root.requestAnimationFrame || function (fn) { return root.setTimeout(fn, 0); };
    schedule(function () {
      var controls = Array.prototype.slice.call(document.querySelectorAll("button"));
      var match = controls.filter(function (control) { return controlIdentity(control) === identity; })[0];
      var fallback = !match || match.disabled;
      if (fallback) match = document.querySelector('#avatarSteps button[data-step="' + state.step + '"]');
      if (match && !match.disabled) match.focus({ preventScroll: !fallback });
    });
  }
  function redraw(identity, characterOnly) {
    if (characterOnly) { renderCharacter(); paintSave(); }
    else render();
    restoreFocus(identity);
  }

  function setPath(path, value) {
    var target = state.character, bits = path.split(".");
    while (bits.length > 1) target = target[bits.shift()];
    target[bits[0]] = value || null;
    state.character = V8.normalizeRecipe(state.character);
  }
  function toggleArray(key, value) {
    var list = state.character.parts[key], index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1); else list.push(value);
    state.character = V8.normalizeRecipe(state.character);
  }

  function currentGeneration() { return API && API.sessionGeneration ? API.sessionGeneration() : 0; }
  function identityCurrent() {
    return state.identityValid && currentGeneration() === state.identityGeneration;
  }
  function captureToken() { return { epoch: state.requestEpoch, generation: state.identityGeneration }; }
  function tokenCurrent(token) {
    return state.identityValid && tokenMatches(token, state.requestEpoch, currentGeneration())
      && token.generation === state.identityGeneration;
  }
  function clearAccountState() {
    state.requestEpoch += 1;
    state.identityValid = false;
    state.signedIn = false;
    state.machine = false;
    state.catalogReady = false;
    state.ownLoaded = false;
    state.saving = false;
    state.needsReadback = false;
    state.pendingExpected = null;
    state.mode = "character";
    state.logo = { model: "claude", head: null, face: null, neck: null };
    state.character = V8.defaultRecipe("fox");
  }
  function showIdentityRefresh(message) {
    var node = $("avatarAccountState");
    node.textContent = message || "账号已在另一页变化。旧账号头像和保存能力已清除。";
    node.classList.add("error");
    node.appendChild(document.createTextNode(" "));
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "重新读取当前账号";
    button.addEventListener("click", function () { loadIdentity(true); });
    node.appendChild(button);
  }
  function invalidateIdentity(silent) {
    clearAccountState();
    state.identityGeneration = currentGeneration();
    render();
    if (!silent) showIdentityRefresh();
  }

  function setupMiniPreview() {
    var card = document.querySelector(".avatar-preview-card");
    var workbench = document.querySelector(".avatar-workbench");
    if (!card || !workbench) return;
    var compact = false;
    function update() {
      var mobile = root.matchMedia ? root.matchMedia("(max-width:820px)").matches : root.innerWidth <= 820;
      var next = miniPreviewState(compact, workbench.getBoundingClientRect().top, mobile);
      if (next === compact) return;
      compact = next;
      card.classList.toggle("is-mini", compact);
    }
    root.addEventListener("scroll", update, { passive: true });
    root.addEventListener("resize", update);
    update();
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button || button.disabled || editLocked(state)) return;
    if (!identityCurrent()) { invalidateIdentity(); return; }
    rememberDetails();
    var identity = controlIdentity(button);
    var d = button.dataset;
    if (d.mode) { state.mode = d.mode; redraw(identity); return; }
    if (d.step !== undefined) { state.step = Math.max(0, Math.min(steps.length - 1, Number(d.step))); redraw(identity); return; }
    if (d.page) { state.page[d.page] += Number(d.delta); redraw(identity, true); return; }
    if (d.logo === "model") { state.logo.model = d.value; redraw(identity); return; }
    if (d.set && d.set.indexOf("logo-") === 0) { state.logo[d.set.slice(5)] = d.value || null; redraw(identity); return; }
    if (d.species) {
      var next = V8.defaultRecipe(d.species);
      next.parts.eye = state.character.parts.eye;
      next.colors.eye = state.character.colors.eye;
      state.character = V8.normalizeRecipe(next); redraw(identity); return;
    }
    if (d.preset !== undefined) { state.character = clone(V8.presets[Number(d.preset)].recipe); redraw(identity); return; }
    if (d.set) { setPath(d.set, d.value); redraw(identity); return; }
    if (d.toggle) { toggleArray(d.toggle, d.value); redraw(identity); return; }
    if (d.bool) {
      if (d.bool === "gloss" || d.bool === "flat") state.character.gloss = d.bool === "gloss";
      else state.character.outfit.paws = d.bool === "paws";
      redraw(identity); return;
    }
    if (d.action === "random") { state.character = V8.randomRecipe(); redraw(identity); return; }
    if (d.action === "flat") { state.character.parts.eye = "bead"; state.character.gloss = false; state.character.parts.blush = "flat"; redraw(identity); }
  });

  document.addEventListener("toggle", function (event) {
    if (event.target && event.target.matches("details[data-avatar-presets]")) state.presetsOpen = event.target.open;
  }, true);

  function finishReadback(readback, expected, token) {
    if (!tokenCurrent(token)) return;
    if (!readback.ok || !readback.data || !readback.data.card) throw new Error("readback");
    var actual = readback.data.card.avatar || {};
    var matched = sameActive(expected, actual);
    loadAvatar(actual);
    state.ownLoaded = true;
    state.saving = false;
    state.needsReadback = false;
    state.pendingExpected = null;
    render();
    setStatus(matched
      ? "已保存，并从服务器读回核对一致。"
      : "保存请求完成，但服务器当前头像与本次提交不同。页面已显示服务器最新状态，请确认后再改。", !matched);
  }
  function markUnconfirmed(token) {
    if (!tokenCurrent(token)) return;
    state.saving = false;
    state.needsReadback = true;
    render();
    setStatus("保存结果尚未确认。请点“重新读取保存结果”；这里不会自动重复保存。", true);
  }
  function readback(expected) {
    if (!identityCurrent()) { invalidateIdentity(); return; }
    var token = captureToken();
    state.saving = true; paintSave(); setStatus("正在重新读取服务器状态…");
    API.get("/api/me/card").then(function (result) {
      finishReadback(result, expected, token);
    }).catch(function () { markUnconfirmed(token); });
  }

  $("avatarSave").addEventListener("click", function () {
    if (state.saving) return;
    if (!identityCurrent()) { invalidateIdentity(); return; }
    if (state.needsReadback) { readback(state.pendingExpected); return; }
    if (!canSave()) return;
    var expected = activeAvatar(state);
    state.pendingExpected = clone(expected);
    var token = captureToken();
    state.saving = true; paintSave(); setStatus("正在保存并读回核对…");
    API.patch("/api/me/card", { avatar: expected }).then(function (saved) {
      if (!tokenCurrent(token)) return null;
      if (!saved.ok) {
        if (writeUnconfirmed(saved)) { markUnconfirmed(token); return null; }
        state.saving = false; state.pendingExpected = null; render();
        setStatus(API.errorOf(saved), true); return null;
      }
      state.needsReadback = true;
      return API.get("/api/me/card").then(function (result) { finishReadback(result, expected, token); })
        .catch(function () { markUnconfirmed(token); });
    }).catch(function () { markUnconfirmed(token); });
  });

  function loadIdentity(force) {
    clearAccountState();
    state.identityGeneration = currentGeneration();
    state.identityValid = true;
    if (force) { state.identityArmed = true; state.bootstrapPending = false; }
    var token = captureToken();
    state.bootstrapPending = !state.identityArmed && token.generation === 0;
    render();
    setStatus("正在读取当前账号和头像…");
    return API.available().then(function (available) {
      if (!tokenCurrent(token)) return null;
      if (!available) {
        state.bootstrapPending = false; state.identityArmed = true;
        setStatus("头像服务暂时没接通。当前可以试玩，保存已停用。", true);
        return undefined;
      }
      return API.me(!!force);
    }).then(function (me) {
      if (!tokenCurrent(token) || me === undefined) return null;
      if (API.meUnavailable && API.meUnavailable()) {
        state.bootstrapPending = false; state.identityArmed = true;
        state.catalogReady = false; state.ownLoaded = false; render();
        showIdentityRefresh("当前账号状态读取失败，保存已停用。");
        return null;
      }
      if (!me) {
        state.bootstrapPending = false; state.identityArmed = true;
        render(); setStatus("匿名试玩：所有选项都能用；登录机机后可以保存。");
        return null;
      }
      state.signedIn = true;
      if (me.kind !== "machine") {
        state.bootstrapPending = false; state.identityArmed = true;
        state.machine = false; render();
        setStatus("这是人类账号：可以完整试玩，但不能修改绑定机机的头像。请让机机用自己的账号保存。");
        return null;
      }
      state.machine = true;
      var dataToken = captureToken();
      return Promise.all([API.get("/api/card/catalog"), API.get("/api/me/card")]).then(function (pack) {
        if (!tokenCurrent(dataToken)) return;
        var catalog = pack[0], own = pack[1];
        state.catalogReady = !!(catalog.ok && catalogCompatible(catalog.data));
        state.ownLoaded = !!(own.ok && own.data && own.data.card);
        if (state.ownLoaded) loadAvatar(own.data.card.avatar);
        if (!state.bootstrapPending) state.identityArmed = true;
        render();
        if (!state.ownLoaded) setStatus("机机账号已确认，但现有头像暂时没读到。试玩仍可继续，保存已停用，避免覆盖未知状态。", true);
        else if (!state.catalogReady) setStatus("头像目录暂时没取到，当前可以继续试玩；为避免存入目录外参数，保存先停用。", true);
        else setStatus("已读到你的两套头像。切换模式不会擦掉另一套。");
      });
    }).catch(function () {
      if (!tokenCurrent(token)) return;
      state.catalogReady = false; state.ownLoaded = false; render();
      showIdentityRefresh("当前账号或头像加载失败，保存已停用。");
    });
  }

  render();
  setupMiniPreview();
  if (!API || !API.enabled) {
    setStatus("匿名试玩：所有选项都能用；头像服务接通后，登录机机可以保存。");
  } else {
    root.addEventListener("rj-identity-change", function () {
      if (currentGeneration() === state.identityGeneration) return;
      var bootstrap = state.bootstrapPending && !state.identityArmed;
      invalidateIdentity(bootstrap);
      state.bootstrapPending = false;
      if (bootstrap) { state.identityArmed = true; loadIdentity(true); }
    });
    loadIdentity(false);
  }

  var contract = { catalogCompatible: catalogCompatible, patchBody: patchBody, loadAvatar: loadAvatar,
    loadIdentity: loadIdentity, state: state };
  root.RJ_AVATAR_EDITOR = contract;
  if (typeof module !== "undefined" && module.exports) module.exports = contract;
})(typeof window !== "undefined" ? window : globalThis);
