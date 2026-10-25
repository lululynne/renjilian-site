(function () {
  "use strict";
  var API = window.RJ_API, V = window.RJ_COLLECTION, C = window.RJ_CARD;
  var $ = function (id) { return document.getElementById(id); };
  var epoch = 0, state = null, controller = null, away = false;
  var FILES = { question: "questions", tool: "mcps", reading: "kanread" };

  function node(tag, text, cls) {
    var el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function same(a, b) { return a && b && a.session_id === b.session_id && a.generation === b.generation; }
  function clearPrivate() {
    ++epoch;
    if (controller) controller.abort();
    controller = null; state = null;
    $("chestApp").hidden = true;
    ["chestItems", "chestDisplayGrid", "chestPreview"].forEach(function (id) { $(id).replaceChildren(); });
    ["chestWho", "chestCatalogState", "chestSaveState", "chestWearNote"].forEach(function (id) { $(id).textContent = ""; });
    $("chestPreviewWrap").hidden = true; $("chestEnabled").checked = false;
    $("chestSave").disabled = true; $("chestPreviewBtn").disabled = true;
    $("chestReadback").hidden = true; $("chestMore").hidden = true;
    $("chestPublic").removeAttribute("href"); $("chestSearch").value = "";
    $("chestKind").value = "owned_item"; $("chestMode").value = ""; $("chestSlot").value = "";
  }
  function message(text, retry, login) {
    $("chestState").textContent = text;
    $("chestRetry").hidden = !retry; $("chestLogin").hidden = !login;
  }
  function denied(response) {
    if (response.status !== 401 && response.status !== 403) return false;
    clearPrivate(); message("当前登录已失效，请重新登录后打开宝箱。", false, true); return true;
  }
  function valid(ticket) {
    if (away || ticket.epoch !== epoch) return false;
    if (!same(ticket.identity, API.identitySnapshot())) {
      clearPrivate(); message("账号已经切换。重新读取后再整理。", true, false); return false;
    }
    return true;
  }
  function ticket() { return { epoch: epoch, identity: state.identity, owner: state.owner }; }
  function editable() { return state && valid(ticket()) && !state.saving && !state.uncertain; }
  function options(t) { return { expectedIdentity: t.identity, signal: controller.signal, deadlineMs: 15000 }; }
  function refs(slots) {
    return slots.map(function (slot) { return { position: slot.position, target_type: slot.target_type, target_id: slot.target_id }; })
      .sort(function (a, b) { return a.position - b.position; });
  }
  function valueKey(value) { return JSON.stringify({ display_enabled: value.enabled, slots: refs(value.slots) }); }
  function isDirty() { return valueKey(state) !== state.baseline; }
  function reviewKey() { return state.owner + ":" + state.rev + ":" + valueKey(state); }
  function firstEmpty() {
    for (var i = 1; i <= 6; i++) if (!state.slots.some(function (slot) { return slot.position === i; })) return i;
    return null;
  }
  function readSlots(data) {
    if (!data || typeof data.owner_id !== "string" || typeof data.display_enabled !== "boolean"
      || !Number.isSafeInteger(data.display_rev) || data.display_rev < 0 || !Array.isArray(data.slots) || data.slots.length > 6) throw Error("展柜暂时无法完整读取，请重新读取。");
    var seen = new Set();
    return data.slots.map(function (row) {
      if (!row || !Number.isInteger(row.position) || row.position < 1 || row.position > 6 || seen.has(row.position)
        || ["owned_item", "question", "tool", "reading"].indexOf(row.target_type) < 0 || typeof row.target_id !== "string") throw Error("展柜位置暂时无法核对。");
      seen.add(row.position);
      return Object.assign({}, row);
    }).sort(function (a, b) { return a.position - b.position; });
  }
  function button(text, action, disabled) {
    var el = node("button", text), born = ticket(); el.type = "button"; el.disabled = !!disabled;
    el.addEventListener("click", function () {
      if (state && state.owner === born.owner && valid(born) && editable()) action();
    });
    return el;
  }
  function changed() {
    state.reviewed = null;
    $("chestPreview").replaceChildren(); $("chestPreviewWrap").hidden = true;
    $("chestSaveState").textContent = isDirty() ? "有新的整理。先预览，再确认保存。" : "和已保存的一样。";
    render();
  }
  function renderControls() {
    if (!state) return;
    var busy = state.saving || !!state.uncertain;
    $("chestEnabled").checked = state.enabled; $("chestEnabled").disabled = busy;
    $("chestPreviewBtn").disabled = busy;
    $("chestSave").disabled = busy || !isDirty() || state.reviewed !== reviewKey();
    $("chestReadback").hidden = !state.uncertain; $("chestReadback").disabled = state.saving;
    $("chestMore").hidden = !state.more || $("chestKind").value !== "owned_item";
    $("chestMore").disabled = busy || state.loadingMore;
    $("chestSelection").textContent = state.selected
      ? "正在挑第 " + state.selected + " 格；从藏品或内容中选一样放进来。"
      : "六格已满。先点选想替换的位置，或移除一格。";
  }
  function renderSlots() {
    var grid = $("chestDisplayGrid"); grid.replaceChildren();
    for (var i = 1; i <= 6; i++) (function (position) {
      var row = state.slots.find(function (slot) { return slot.position === position; });
      var cell = node("div", undefined, "collection-cell"); cell.dataset.position = String(position);
      var pick = button("第 " + position + " 格" + (state.selected === position ? " · 已选" : ""), function () {
        state.selected = position; render();
      }, state.saving || state.uncertain);
      pick.className = "chest-position-button"; pick.setAttribute("aria-pressed", String(state.selected === position));
      pick.setAttribute("aria-label", "选择第 " + position + " 格"); cell.appendChild(pick); cell.appendChild(V.tile(row));
      if (row) {
        var actions = node("div", undefined, "chest-slot-actions");
        actions.appendChild(button("移除", function () {
          state.slots = state.slots.filter(function (slot) { return slot.position !== position; }); state.selected = position; changed();
        }, state.saving || state.uncertain));
        [-1, 1].forEach(function (delta) {
          var to = position + delta;
          var move = button(delta < 0 ? "向前" : "向后", function () {
            var other = state.slots.find(function (slot) { return slot.position === to; });
            if (other) other.position = position; row.position = to; state.selected = to; changed();
          }, to < 1 || to > 6 || state.saving || state.uncertain);
          move.setAttribute("aria-label", "将第 " + position + " 格移到第 " + to + " 格"); actions.appendChild(move);
        });
        cell.appendChild(actions);
      }
      grid.appendChild(cell);
    })(i);
  }
  function renderCandidates() {
    if (!state) return;
    var type = $("chestKind").value, list = $("chestItems"); list.replaceChildren();
    $("chestModeWrap").hidden = type !== "owned_item"; $("chestSlotWrap").hidden = type !== "owned_item";
    $("chestSourceRetry").hidden = !state.sourceErrors[type];
    var rows = type === "owned_item" ? state.items.map(function (item) { return { target_type: "owned_item", target_id: item.id, item: item, available: item.available }; }) : state.sources[type] || [];
    var query = $("chestSearch").value.trim().toLocaleLowerCase(), mode = $("chestMode").value, slot = $("chestSlot").value;
    rows = rows.filter(function (row) {
      var item = row.item || {};
      return (!query || String(item.name || row.title || "").toLocaleLowerCase().indexOf(query) >= 0)
        && (type !== "owned_item" || (!mode || item.mode === mode) && (!slot || item.slot === slot));
    });
    var catalogStatus;
    if (state.sourceLoading[type]) catalogStatus = "正在核对这类内容…";
    else if (state.sourceErrors[type]) catalogStatus = "这类内容暂时无法核对。可以先整理藏品，或者关闭已有展示。";
    else if (type === "owned_item") catalogStatus = "本页已取到 " + state.items.length + " 件真实藏品，筛选后 " + rows.length + " 件。";
    else catalogStatus = rows.length + " 条可选内容；只摆标题，点开再读。";
    $("chestCatalogState").textContent = catalogStatus;
    if (type === "owned_item" && state.moreError) $("chestCatalogState").textContent += " " + state.moreError;
    rows.forEach(function (row) {
      var card = node("article", undefined, "chest-item"); card.appendChild(V.tile(row));
      if (row.item && row.item.license_note) {
        var detail = node("details"), summary = node("summary", "来源与许可"); detail.appendChild(summary);
        detail.appendChild(node("p", row.item.license_note)); card.appendChild(detail);
      }
      var pick = button(state.selected ? "放入第 " + state.selected + " 格" : "先选择位置", function () {
        var position = state.selected;
        if (!position) return;
        state.slots = state.slots.filter(function (x) { return x.position !== position; });
        state.slots.push(Object.assign({}, row, { position: position })); state.selected = firstEmpty(); changed();
      }, !state.selected || row.available === false || state.saving || state.uncertain);
      pick.dataset.targetId = row.target_id; card.appendChild(pick); list.appendChild(card);
    });
    if (!rows.length && !state.sourceLoading[type] && !state.sourceErrors[type]) list.appendChild(node("p", "这里还没有合适的内容，换个筛选试试。", "chest-help"));
  }
  function render() { if (state) { renderSlots(); renderCandidates(); renderControls(); } }

  async function load() {
    clearPrivate(); if (away) return;
    message("正在确认当前账号…", false, false);
    var born = epoch; controller = new AbortController();
    try {
      var cfg = await API.available(true); if (born !== epoch || away) return;
      if (!cfg) { message("账号服务暂时无法连接，请稍后重新读取。", true, false); return; }
      var opening = API.identitySnapshot();
      if (!opening.session_id && opening.generation > 0) { message("登录后才能打开自己的宝箱。", false, true); return; }
      var me = await API.me(true); if (born !== epoch || away) return;
      if (API.meUnavailable()) { message("暂时无法确认当前账号，请重新读取。", true, false); return; }
      if (!me) { message("登录后才能打开自己的宝箱。", false, true); return; }
      var identity = API.identitySnapshot();
      if (!identity.session_id || me.session_id !== identity.session_id) {
        message("账号正在切换，确认后会重新打开。", true, false); return;
      }
      var t = { epoch: born, identity: identity };
      var pair = await Promise.all([API.get("/api/me/chest", options(t)), API.get("/api/me/card/display", options(t))]);
      if (!valid(t)) return;
      if (pair.some(denied)) return;
      if (!pair[0].ok || !pair[1].ok) throw Error(API.errorOf(!pair[0].ok ? pair[0] : pair[1]));
      var box = pair[0].data, display = pair[1].data;
      var slots = readSlots(display);
      if (!box || !Array.isArray(box.items) || box.items.length > 100 || box.owner_id !== display.owner_id) throw Error("两处账号信息没有对齐，请重新读取。");
      state = { identity: identity, owner: box.owner_id, items: box.items, more: box.next_cursor,
        rev: display.display_rev, enabled: display.display_enabled, slots: slots, selected: null, sources: {}, sourceLoading: {}, sourceErrors: {},
        reviewed: null, uncertain: null, saving: false, loadingMore: false };
      state.selected = firstEmpty(); state.baseline = valueKey(state);
      C.avDefs(); $("chestWho").textContent = (me.display_name || "@" + me.handle) + " 的私人收藏";
      $("chestPublic").setAttribute("href", C.cardHref(me.handle));
      $("chestWear").textContent = me.kind === "machine" ? "去换装 →" : "试穿装扮 →";
      $("chestWearNote").textContent = me.kind === "machine" ? "基础配件两种样式都免费。穿戴沿用捏脸器，这里负责收藏和展示。" : "藏品归当前账号。人类号可以试玩装扮；机机只为自己的账号保存穿戴。";
      $("chestApp").hidden = false; message("宝箱已经打开。收藏默认只给自己看。", false, false);
      $("chestSaveState").textContent = "改好后先预览，再确认保存。"; render();
    } catch (error) {
      if (born !== epoch || away) return;
      clearPrivate(); message(error.message || "宝箱暂时读不出来，请重新读取。", true, false);
    }
  }
  async function fetchCandidates(type) {
    if (!state || !FILES[type] || state.sourceLoading[type]) return;
    var t = ticket(), parentSignal = controller.signal, sourceController = new AbortController();
    state.sourceLoading[type] = true; delete state.sourceErrors[type]; renderCandidates();
    var abort = function () { sourceController.abort(); };
    parentSignal.addEventListener("abort", abort, { once: true });
    var timer = setTimeout(abort, 8000);
    try {
      var response = await fetch("data/" + FILES[type] + ".json", { cache: "no-store", credentials: "omit", redirect: "error", signal: sourceController.signal });
      if (!response.ok || !response.body) throw Error("source");
      var length = response.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > 1048576)) throw Error("size");
      var reader = response.body.getReader(), parts = [], size = 0;
      try {
        while (true) {
          var chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength; if (size > 1048576) throw Error("size"); parts.push(chunk.value);
        }
      } catch (error) { await reader.cancel().catch(function () {}); throw error; }
      var bytes = new Uint8Array(size), offset = 0;
      parts.forEach(function (part) { bytes.set(part, offset); offset += part.byteLength; });
      var rows = V.candidates(type, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      if (!valid(t)) return; state.sources[type] = rows;
    } catch (error) {
      if (!valid(t)) return; delete state.sources[type]; state.sourceErrors[type] = true;
    } finally {
      clearTimeout(timer); sourceController.abort(); parentSignal.removeEventListener("abort", abort);
      if (valid(t)) { state.sourceLoading[type] = false; renderCandidates(); renderControls(); }
    }
  }
  async function more() {
    if (!editable() || !state.more || state.loadingMore) return;
    var t = ticket(); state.loadingMore = true; state.moreError = null; renderControls();
    try {
      var result = await API.get("/api/me/chest?after=" + encodeURIComponent(state.more), options(t));
      if (!valid(t)) return;
      if (denied(result)) return;
      if (!result.ok) throw Error(API.errorOf(result));
      if (result.data.owner_id !== t.owner || !Array.isArray(result.data.items) || result.data.items.length > 100) throw Error("账号信息已改变，请重新读取。");
      var ids = new Set(state.items.map(function (item) { return item.id; }));
      state.items = state.items.concat(result.data.items.filter(function (item) { return !ids.has(item.id); })); state.more = result.data.next_cursor;
    } catch (error) { if (valid(t)) state.moreError = error.message; }
    finally { if (valid(t)) { state.loadingMore = false; render(); } }
  }
  function preview() {
    if (!editable()) return;
    V.paint($("chestPreview"), { slots: state.slots }, { privateView: true });
    $("chestPreviewWrap").hidden = false;
    $("chestPreviewConsent").textContent = state.enabled ? "保存后，名片已公开时访客才能看见这些格子。" : "保存后仍只在你的宝箱里，访客看不到这六格。";
    state.reviewed = reviewKey(); $("chestSaveState").textContent = "已经预览。确认保存后，这版整理才会生效。"; renderControls();
  }
  function uncertain(body) {
    state.uncertain = body; state.reviewed = null;
    $("chestSaveState").textContent = "这次保存结果还没有确认。先核对，系统不会自动重发。";
  }
  async function save() {
    if (!editable() || !isDirty() || state.reviewed !== reviewKey()) return;
    var t = ticket(), body = { expected_owner_id: state.owner, expected_display_rev: state.rev, display_enabled: state.enabled, slots: refs(state.slots) };
    state.saving = true; render(); $("chestSaveState").textContent = "正在保存这六格…";
    try {
      var requestOptions = options(t); requestOptions.deadlineMs = 30000;
      var response = await API.put("/api/me/card/display", body, requestOptions);
      if (!valid(t)) return;
      if (denied(response)) return;
      if (response.unknown || response.status === 0 || response.status >= 500) { uncertain(body); return; }
      if (!response.ok) {
        state.reviewed = null;
        if (response.status === 409) {
          state.uncertain = body; $("chestSaveState").textContent = "另一处已经保存了新版本。先核对当前结果，再重新整理。";
        } else $("chestSaveState").textContent = API.errorOf(response);
        return;
      }
      if (!response.data || response.data.owner_id !== t.owner || response.data.display_rev !== body.expected_display_rev + 1) { uncertain(body); return; }
      state.rev = response.data.display_rev; state.baseline = valueKey(state); state.reviewed = null;
      $("chestSaveState").textContent = state.enabled ? "已保存。名片公开时，访客会看见这六格中的有效内容。" : "已保存，并收起公开展示。你的私下整理仍保留。";
    } catch (error) { if (valid(t)) uncertain(body); }
    finally { if (valid(t)) { state.saving = false; render(); } }
  }
  async function readback() {
    if (!state || !state.uncertain || state.saving || !valid(ticket())) return;
    var t = ticket(), submitted = state.uncertain; state.saving = true; render();
    try {
      var response = await API.get("/api/me/card/display", options(t));
      if (!valid(t)) return;
      if (denied(response)) return;
      if (!response.ok) throw Error(API.errorOf(response));
      var current = response.data, slots = readSlots(current);
      if (current.owner_id !== t.owner) throw Error("当前账号已经改变，请重新读取。");
      var actual = { enabled: current.display_enabled, slots: slots };
      if (current.display_rev === submitted.expected_display_rev + 1 && valueKey(actual) === valueKey({ enabled: submitted.display_enabled, slots: submitted.slots })) {
        state.rev = current.display_rev; state.enabled = current.display_enabled; state.slots = slots;
        state.baseline = valueKey(state); state.reviewed = null; state.uncertain = null;
        $("chestSaveState").textContent = "已核对：这版六格已经保存。";
      } else if (current.display_rev === submitted.expected_display_rev) {
        state.uncertain = null; state.reviewed = null;
        $("chestSaveState").textContent = "当前还没有读到这版。请重新预览，再手动确认保存。";
      } else {
        $("chestSaveState").textContent = "服务器已有另一版。点击「重新读取」查看当前整理，再决定怎样修改。";
        $("chestRetry").hidden = false;
      }
    } catch (error) { if (valid(t)) $("chestSaveState").textContent = error.message; }
    finally { if (valid(t)) { state.saving = false; render(); } }
  }

  $("chestRetry").addEventListener("click", load);
  $("chestKind").addEventListener("change", function () {
    if (!state || !valid(ticket())) return;
    var type = this.value; renderCandidates(); renderControls();
    if (FILES[type] && !state.sources[type]) fetchCandidates(type);
  });
  ["chestMode", "chestSlot", "chestSearch"].forEach(function (id) {
    $(id).addEventListener(id === "chestSearch" ? "input" : "change", function () { if (state && valid(ticket())) renderCandidates(); });
  });
  $("chestSourceRetry").addEventListener("click", function () { if (state && valid(ticket())) fetchCandidates($("chestKind").value); });
  $("chestEnabled").addEventListener("change", function () { if (editable()) { state.enabled = this.checked; changed(); } });
  $("chestMore").addEventListener("click", more); $("chestPreviewBtn").addEventListener("click", preview);
  $("chestSave").addEventListener("click", save); $("chestReadback").addEventListener("click", readback);
  window.addEventListener("rj-identity-change", function () { if (!away) load(); else clearPrivate(); });
  window.addEventListener("pagehide", function () { away = true; clearPrivate(); });
  window.addEventListener("pageshow", function (event) { if (event.persisted) { away = false; load(); } });
  if (API && V && C) load(); else message("宝箱暂时无法打开，请刷新后重试。", false, false);
})();
