(function () {
  'use strict';

  var API = window.RJ_API;
  var cardRoot = document.getElementById('avatarPraise');
  var sentRoot = document.getElementById('avatarPraiseSent');
  var root = cardRoot || sentRoot;
  if (!root || !API || !API.enabled) return;

  var PREFIX = 'rj.avatarPraise.intent.v1.';
  var HANDLE = /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;
  var PRAISE_ID = /^ap_[a-km-np-z2-9]{32}$/;
  var HEX64 = /^[0-9a-f]{64}$/;
  var IDEM = /^ap-[0-9a-f]{32}$/;
  var DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  var CURSOR = /^praise1[.][A-Za-z0-9_-]{40,1024}$/;
  var PARTS = ['overall', 'eyes', 'hat', 'blush', 'motion'];
  var PART_NAME = { overall: '整体', eyes: '眼睛', hat: '帽子', blush: '腮红', motion: '动作' };
  var RECORD_FIELDS = ['v', 'handle', 'part', 'avatar_revision', 'idem_key', 'withdraw_secret', 'state', 'id', 'day', 'withdraw_unknown', 'created_at_ms'].sort().join(',');
  var RANK = { unknown: 0, rejected: 1, accepted: 2, withdrawn: 3 };
  var READ_MS = 15000, MUTATION_MS = 20000;

  var ACCEPTED_TEXT = '这次请求已被接受。这只说明请求已记录，不代表对方已读或仍然保留。';
  var UNKNOWN_TEXT = '发送结果未确认。已保留同一条请求；点“核对上次发送”只核对这一条，不会换编号，也不会自动重发。';
  var UNAVAILABLE_TEXT = '夸夸功能暂时不可用，发送结果未确认。已保留同一条请求，稍后点“核对上次发送”。';
  var STORAGE_FAIL_TEXT = '这个浏览器没能安全保存撤回凭据，所以这次没有发送匿名夸夸，以免之后无法撤回。可以换一个能保存本机数据的浏览器，或登录后再发送。';
  var REJECTED_TEXT = {
    400: '这个部位当前不能夸，或请求不完整，这次没有记录。可以重新读取可夸部位。',
    401: '登录状态已失效，这次没有发送。请到账号页重新登录；不会改用匿名重发。',
    403: '这个账号现在不能发送夸夸，这次没有记录。',
    404: '这个头像当前不可用，或这项服务尚未开放，这次没有记录。',
    409: '请求和当前头像状态不一致，头像可能刚换过装扮，这次没有记录。可以重新读取可夸部位后再选。',
    429: '夸得有点密了，这次没有记录。请稍后再试。'
  };
  var RETRY_REJECTED_TEXT = {
    400: '服务器没有接受这次核对。',
    401: '登录状态已失效，这次核对没有完成。请重新登录；不会改用匿名重发。',
    403: '这个账号现在不能完成这次核对。',
    404: '服务器没有接受这次核对，头像或服务状态可能已经变化。',
    409: '服务器没有接受这次核对，头像状态可能已经变化。',
    429: '核对得有点密了，请稍后再试。'
  };

  var epoch = 0, optionsSeq = 0, sentSeq = 0, localGen = 0;
  var controllers = [];
  var identity = { state: 'checking', snap: null, who: null };
  var target = null, options = null, sending = false, ram = null, receipt = null;
  var localBusy = {};
  var sentItems = [], sentSeen = {}, sentCursor = null, sentLoaded = false, sentBusy = false;
  var statusNode, identityRetry, localBox, localNote, localList, localState;
  var formBox, partsBox, signLabel, signBox, actorNote, blockNote, submitButton, refreshOptionsButton, receiptBox;
  var sentBox, sentNote, sentList, sentStatus, sentToggle, sentMore;

  function el(tag, cls, value) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  }
  function actionButton(label, callback, cls) {
    var node = el('button', cls || 'avatar-praise-quiet', label);
    node.type = 'button';
    node.addEventListener('click', callback);
    return node;
  }
  function targetLink(handle) {
    var link = el('a', 'avatar-praise-target', '@' + handle);
    link.href = API.cardHref(handle);
    return link;
  }
  function say(message, isError) {
    statusNode.textContent = message || '';
    statusNode.classList.toggle('is-error', !!isError);
  }
  function restoreFocus() {
    if (document.activeElement === document.body) statusNode.focus();
  }

  function same(a, b) {
    return !!a && !!b && a.generation === b.generation && a.session_id === b.session_id;
  }
  function isConfirmed() {
    return identity.state === 'anon' || identity.state === 'human' || identity.state === 'machine';
  }
  function isSigned() {
    return identity.state === 'human' || identity.state === 'machine';
  }
  function isSelf() {
    return !!(identity.who && target && identity.who.handle === target);
  }
  function mark() {
    if (!isConfirmed()) return null;
    var snap = API.identitySnapshot();
    return same(snap, identity.snap) ? { epoch: epoch, snap: snap } : null;
  }
  function live(m) {
    return m.epoch === epoch && same(m.snap, API.identitySnapshot());
  }
  function track() {
    var controller = new AbortController();
    controllers.push(controller);
    return controller;
  }
  function untrack(controller) {
    var at = controllers.indexOf(controller);
    if (at >= 0) controllers.splice(at, 1);
  }
  function abortAll() {
    var running = controllers;
    controllers = [];
    running.forEach(function (controller) { controller.abort(); });
  }

  function checkIdentity(fresh) {
    var snap = API.identitySnapshot();
    function unknown() { return { state: 'unknown', snap: snap, who: null }; }
    function attempt(left, pending) {
      return pending.then(function (who) {
        if (!same(snap, API.identitySnapshot()) || API.meUnavailable()) return unknown();
        var latest = API.me();
        if (latest !== pending) return left > 0 ? attempt(left - 1, latest) : unknown();
        if (who === null) return { state: 'anon', snap: snap, who: null };
        if (who && typeof who.handle === 'string' && who.handle && (who.kind === 'human' || who.kind === 'machine')) {
          return { state: who.kind, snap: snap, who: who };
        }
        return unknown();
      }, unknown);
    }
    return attempt(2, API.me(fresh === true));
  }

  function randomHex(bytes) {
    var values = new Uint8Array(bytes);
    window.crypto.getRandomValues(values);
    return Array.prototype.map.call(values, function (value) { return ('0' + value.toString(16)).slice(-2); }).join('');
  }
  function parseRecord(key, text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return null; }
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).sort().join(',') !== RECORD_FIELDS) return null;
    if (d.v !== 1 || typeof d.handle !== 'string' || !HANDLE.test(d.handle) || PARTS.indexOf(d.part) < 0) return null;
    if (typeof d.avatar_revision !== 'string' || !HEX64.test(d.avatar_revision)) return null;
    if (typeof d.idem_key !== 'string' || !IDEM.test(d.idem_key) || key !== PREFIX + d.idem_key) return null;
    if (typeof d.withdraw_secret !== 'string' || !HEX64.test(d.withdraw_secret)) return null;
    if (!Object.prototype.hasOwnProperty.call(RANK, d.state) || typeof d.withdraw_unknown !== 'boolean' || !Number.isSafeInteger(d.created_at_ms)) return null;
    var receipted = d.state === 'accepted' || d.state === 'withdrawn';
    if (receipted) {
      if (typeof d.id !== 'string' || !PRAISE_ID.test(d.id) || typeof d.day !== 'string' || !DAY.test(d.day)) return null;
    } else if (d.id !== null || d.day !== null) return null;
    return d;
  }
  function readRecord(key) {
    try { return parseRecord(key, localStorage.getItem(key)); } catch (e) { return null; }
  }
  function listLocal() {
    var out = { ok: true, records: [], corrupt: 0 };
    try {
      var keys = [], i;
      for (i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(PREFIX) === 0) keys.push(key);
      }
      keys.forEach(function (name) {
        var record = parseRecord(name, localStorage.getItem(name));
        if (record) out.records.push({ key: name, record: record });
        else out.corrupt++;
      });
    } catch (e) { out.ok = false; }
    out.records.sort(function (a, b) { return b.record.created_at_ms - a.record.created_at_ms; });
    return out;
  }
  function createRecord(handle, part, revision) {
    try {
      var idem = 'ap-' + randomHex(16);
      var key = PREFIX + idem;
      var text = JSON.stringify({ v: 1, handle: handle, part: part, avatar_revision: revision, idem_key: idem,
        withdraw_secret: randomHex(32), state: 'unknown', id: null, day: null, withdraw_unknown: false, created_at_ms: Date.now() });
      if (localStorage.getItem(key) !== null) return null;
      localStorage.setItem(key, text);
      if (localStorage.getItem(key) !== text || !parseRecord(key, text)) return null;
      return key;
    } catch (e) { return null; }
  }
  function patchRecord(key, patch) {
    try {
      var current = parseRecord(key, localStorage.getItem(key));
      if (!current) return false;
      if (current.state === 'withdrawn') return true;
      var next = {};
      Object.keys(current).forEach(function (name) { next[name] = current[name]; });
      Object.keys(patch).forEach(function (name) { next[name] = patch[name]; });
      if (RANK[next.state] < RANK[current.state]) return true;
      var text = JSON.stringify(next);
      if (!parseRecord(key, text)) return false;
      localStorage.setItem(key, text);
      return localStorage.getItem(key) === text;
    } catch (e) { return false; }
  }
  function anonHeld(handle, part) {
    return listLocal().records.some(function (item) {
      return item.record.state === 'unknown' && item.record.handle === handle && item.record.part === part;
    });
  }

  function classifySend(r) {
    if (r.stale) return { kind: 'stale' };
    if (r.ok) {
      var d = r.data;
      if (d && d.ok === true && typeof d.id === 'string' && PRAISE_ID.test(d.id) && typeof d.day === 'string' && DAY.test(d.day)
        && typeof d.recorded === 'boolean' && typeof d.replayed === 'boolean' && d.recorded !== d.replayed) {
        return { kind: 'accepted', id: d.id, day: d.day };
      }
      return { kind: 'unknown', status: r.status };
    }
    if (Object.prototype.hasOwnProperty.call(REJECTED_TEXT, r.status)) return { kind: 'rejected', status: r.status };
    return { kind: 'unknown', status: r.status };
  }
  function postSend(body, m) {
    if (!live(m)) return Promise.resolve({ kind: 'stale' });
    var controller = track();
    return API.post('/api/avatar-praises', body, { expectedIdentity: m.snap, deadlineMs: MUTATION_MS, signal: controller.signal })
      .then(classifySend, function () { return { kind: 'unknown', status: 0 }; })
      .finally(function () { untrack(controller); });
  }
  function postWithdraw(id, body, m) {
    if (!live(m)) return Promise.resolve({ kind: 'stale' });
    var controller = track();
    return API.post('/api/avatar-praises/' + encodeURIComponent(id) + '/withdraw', body, { expectedIdentity: m.snap, deadlineMs: MUTATION_MS, signal: controller.signal })
      .then(function (r) {
        if (r.stale) return { kind: 'stale' };
        if (r.ok && r.data && r.data.ok === true && r.data.withdrawn === true) return { kind: 'withdrawn' };
        return { kind: 'unknown', status: r.status };
      }, function () { return { kind: 'unknown', status: 0 }; })
      .finally(function () { untrack(controller); });
  }
  function withdrawFailure(status) {
    if (status === 401) return '登录状态已失效，撤回结果未确认。请重新登录后再试；不会改用匿名撤回。';
    if (status === 404) return '服务器没有确认这次撤回：记录可能不存在、凭据不匹配，或服务尚未开放。这里没有标为已撤回。';
    return '撤回结果未确认，这里没有标为已撤回。可以再点一次“撤回”，重复撤回是安全的。';
  }
  function unknownText(status) {
    return status === 503 ? UNAVAILABLE_TEXT : UNKNOWN_TEXT;
  }

  function sendLocal(key, m, initial) {
    var record = readRecord(key);
    if (!record) { say('这条本机记录已经读不到，没有发送。', true); paint(); return; }
    localBusy[key] = true;
    if (initial) sending = true;
    say('正在发送…');
    paint();
    postSend({ handle: record.handle, part: record.part, avatar_revision: record.avatar_revision,
      idem_key: record.idem_key, withdraw_secret: record.withdraw_secret }, m).then(function (outcome) {
      var saved = true;
      if (outcome.kind === 'accepted') saved = patchRecord(key, { state: 'accepted', id: outcome.id, day: outcome.day });
      else if (outcome.kind === 'rejected' && initial) saved = patchRecord(key, { state: 'rejected' });
      if (!live(m)) return;
      delete localBusy[key];
      if (initial) sending = false;
      if (outcome.kind === 'accepted') {
        if (saved) say(ACCEPTED_TEXT);
        else say('请求已被接受，但这个浏览器没能记下回执。点“核对上次发送”可以取回，不会重复记录。', true);
        clearSelection();
      } else if (outcome.kind === 'rejected') {
        if (initial) { say(REJECTED_TEXT[outcome.status], true); showOptionsRefresh(); }
        else say(RETRY_REJECTED_TEXT[outcome.status] + ' 原请求没有改变，结果仍按未确认处理。', true);
      } else if (outcome.kind === 'unknown') {
        say(unknownText(outcome.status), true);
      }
      paint();
      restoreFocus();
    });
  }
  function retryLocal(key, gen) {
    if (gen !== localGen || identity.state !== 'anon' || localBusy[key]) return;
    var m = mark();
    if (m) sendLocal(key, m, false);
  }
  function withdrawLocal(key, gen) {
    if (gen !== localGen || !isConfirmed() || localBusy[key]) return;
    var m = mark(), record = readRecord(key);
    if (!m) return;
    if (!record || !record.id) { say('这条本机记录已经读不到，没有发出撤回。', true); paint(); return; }
    localBusy[key] = true;
    say('正在撤回…');
    paint();
    postWithdraw(record.id, { withdraw_secret: record.withdraw_secret }, m).then(function (outcome) {
      if (outcome.kind === 'withdrawn') patchRecord(key, { state: 'withdrawn', withdraw_unknown: false });
      else patchRecord(key, { withdraw_unknown: true });
      if (!live(m)) return;
      delete localBusy[key];
      if (outcome.kind === 'withdrawn') say('服务器已确认撤回这条夸夸。');
      else if (outcome.kind === 'unknown') say(withdrawFailure(outcome.status), true);
      paint();
      restoreFocus();
    });
  }
  function forgetLocal(key, gen) {
    if (gen !== localGen || !isConfirmed() || localBusy[key]) return;
    if (!window.confirm('只清除这个浏览器里的这条记录，不会从服务器撤回；清除后这条夸夸的撤回凭据也会丢失。确定清除吗？')) return;
    try {
      localStorage.removeItem(key);
      say('已清除本机记录。这不代表服务器上的夸夸已经撤回。');
    } catch (e) { say('没能清除这条本机记录。', true); }
    paint();
    restoreFocus();
  }
  function localStateText(record) {
    if (record.state === 'unknown') return '结果未确认';
    if (record.state === 'rejected') return '服务器未接受，没有记录';
    if (record.state === 'withdrawn') return '已撤回（这个浏览器已确认） · ' + record.day;
    return (record.withdraw_unknown ? '已接受，撤回结果未确认 · ' : '已接受 · ') + record.day;
  }
  function renderLocal() {
    var data = listLocal(), gen = localGen;
    localList.textContent = '';
    data.records.forEach(function (item) {
      var record = item.record, busyNow = !!localBusy[item.key] || !isConfirmed();
      var row = el('li', 'avatar-praise-row');
      var line = el('p', 'avatar-praise-row-main');
      line.appendChild(targetLink(record.handle));
      line.appendChild(document.createTextNode(' · ' + PART_NAME[record.part]));
      row.appendChild(line);
      row.appendChild(el('p', 'avatar-praise-small', localStateText(record)));
      var ops = el('div', 'avatar-praise-ops');
      if (record.state === 'unknown') {
        var retry = actionButton('核对上次发送', function () { retryLocal(item.key, gen); });
        retry.disabled = busyNow || identity.state !== 'anon';
        ops.appendChild(retry);
      }
      if (record.state === 'accepted') {
        var withdraw = actionButton('撤回', function () { withdrawLocal(item.key, gen); });
        withdraw.disabled = busyNow;
        ops.appendChild(withdraw);
      }
      var forget = actionButton('清除本机记录', function () { forgetLocal(item.key, gen); });
      forget.disabled = busyNow;
      ops.appendChild(forget);
      row.appendChild(ops);
      localList.appendChild(row);
    });
    var notes = [];
    if (!data.ok) notes.push('这个浏览器现在读不了本机存储，匿名记录暂时无法显示，这不代表没有记录。');
    else if (data.corrupt) notes.push('有 ' + data.corrupt + ' 条本机记录无法读取，已原样保留，没有改动。');
    else if (!data.records.length) notes.push('这个浏览器还没有匿名夸夸记录。');
    if (identity.state === 'checking' || identity.state === 'unknown') notes.push('当前身份未确认，匿名记录的操作已暂停；记录仍保存在这个浏览器。');
    else if (isSigned() && data.records.length) notes.push('当前已登录账号。结果未确认的匿名请求要退出账号后才能核对，不会改用账号发送。');
    localState.textContent = notes.join(' ');
    localBox.hidden = !!cardRoot && data.ok && !data.corrupt && !data.records.length;
  }
  function buildLocal() {
    localBox = el('div', 'avatar-praise-local');
    localBox.appendChild(el('h4', null, '这个浏览器的匿名夸夸'));
    localNote = el('p', 'avatar-praise-small', '这些记录属于这个浏览器资料，不属于任何账号；使用这个浏览器资料的人都能管理它们。清除浏览器数据会丢失撤回凭据；清除本机记录不会从服务器撤回。');
    localBox.appendChild(localNote);
    localState = el('p', 'avatar-praise-small');
    localBox.appendChild(localState);
    localList = el('ul', 'avatar-praise-rows');
    localBox.appendChild(localList);
    root.appendChild(localBox);
  }

  function selectedPart() {
    var picked = partsBox.querySelector('input:checked');
    return picked ? picked.value : null;
  }
  function clearSelection() {
    if (!cardRoot) return;
    partsBox.querySelectorAll('input').forEach(function (input) { input.checked = false; });
    signBox.checked = false;
  }
  function showOptionsRefresh() {
    refreshOptionsButton.hidden = false;
  }
  function validOptions(d, handle) {
    if (!d || d.ok !== true || d.handle !== handle || typeof d.avatar_revision !== 'string' || !HEX64.test(d.avatar_revision)) return false;
    if (!Array.isArray(d.parts) || !d.parts.length || d.parts.length > PARTS.length) return false;
    var seen = {};
    return d.parts.every(function (item) {
      if (!item || PARTS.indexOf(item.part) < 0 || seen[item.part]) return false;
      seen[item.part] = true;
      return typeof item.part_value === 'string' && item.part_value.length <= 128 && typeof item.part_label === 'string' && item.part_label.length > 0 && Array.from(item.part_label).length <= 120;
    });
  }
  function renderParts() {
    partsBox.textContent = '';
    (options ? options.parts : []).forEach(function (item) {
      var label = el('label', 'avatar-praise-part');
      var input = el('input');
      input.type = 'radio';
      input.name = 'avatarPraisePart';
      input.value = item.part;
      input.setAttribute('data-part', item.part);
      input.addEventListener('change', paintForm);
      label.appendChild(input);
      label.appendChild(el('span', null, PART_NAME[item.part] + ' · ' + item.part_label));
      partsBox.appendChild(label);
    });
  }
  function loadOptions() {
    var m = mark();
    if (!m || !cardRoot) return;
    var seq = ++optionsSeq, controller = track();
    options = null;
    renderParts();
    refreshOptionsButton.hidden = true;
    say('正在读取可夸的部位…');
    paintForm();
    function failed(status) {
      if (status === 404) say('这个头像当前不可用，或这项服务尚未开放。', true);
      else if (status === 503) say('夸夸功能暂时不可用，请稍后重新读取。', true);
      else say('这次没有读到可夸的部位，请重新读取。', true);
      showOptionsRefresh();
      paintForm();
    }
    API.get('/api/avatar-praises/options?handle=' + encodeURIComponent(target), { expectedIdentity: m.snap, deadlineMs: READ_MS, signal: controller.signal }).then(function (r) {
      if (!live(m) || seq !== optionsSeq || r.stale) return;
      if (!r.ok || !validOptions(r.data, target)) { failed(r.status); return; }
      options = r.data;
      renderParts();
      say('选一个部位，再点“送出夸夸”。');
      paintForm();
    }).catch(function () {
      if (live(m) && seq === optionsSeq) failed(0);
    }).finally(function () { untrack(controller); });
  }
  function submitPraise() {
    if (sending || ram || !options || !isConfirmed() || isSelf()) return;
    var part = selectedPart();
    if (!part) return;
    var m = mark();
    if (!m) { say('当前身份刚发生变化，这次没有发送。', true); return; }
    if (identity.state === 'anon') {
      if (anonHeld(options.handle, part)) { paintForm(); return; }
      var key = createRecord(options.handle, part, options.avatar_revision);
      if (!key) { say(STORAGE_FAIL_TEXT, true); return; }
      sendLocal(key, m, true);
      return;
    }
    var idem;
    try { idem = 'ap-' + randomHex(16); } catch (e) { say('这个浏览器无法生成防重发编号，这次没有发送。', true); return; }
    ram = { handle: options.handle, part: part, avatar_revision: options.avatar_revision, idem_key: idem,
      kind: identity.state, sign_name: identity.state === 'human' && signBox.checked,
      owner: identity.who.handle, snap: m.snap, uncertain: false };
    sendHeld(m);
  }
  function sendHeld(m) {
    var held = ram;
    var body = { handle: held.handle, part: held.part, avatar_revision: held.avatar_revision, idem_key: held.idem_key };
    if (held.kind === 'human') body.sign_name = held.sign_name;
    sending = true;
    say('正在发送…');
    paint();
    postSend(body, m).then(function (outcome) {
      if (!live(m) || ram !== held) return;
      sending = false;
      if (outcome.kind === 'accepted') {
        receipt = { id: outcome.id, day: outcome.day, handle: held.handle, part: held.part, owner: held.owner, snap: held.snap, busy: false, withdrawn: false };
        ram = null;
        clearSelection();
        say(ACCEPTED_TEXT);
      } else if (outcome.kind === 'rejected' && !held.uncertain) {
        ram = null;
        say(REJECTED_TEXT[outcome.status], true);
        showOptionsRefresh();
      } else if (outcome.kind === 'rejected') {
        say(RETRY_REJECTED_TEXT[outcome.status] + ' 原请求没有改变，结果仍按未确认处理。', true);
      } else if (outcome.kind === 'unknown') {
        held.uncertain = true;
        say(unknownText(outcome.status), true);
      }
      paint();
      restoreFocus();
    });
  }
  function withdrawReceipt() {
    if (!receipt || receipt.busy || receipt.withdrawn) return;
    var m = mark(), current = receipt;
    if (!m) return;
    current.busy = true;
    say('正在撤回…');
    paint();
    postWithdraw(current.id, {}, m).then(function (outcome) {
      if (!live(m) || receipt !== current) return;
      current.busy = false;
      if (outcome.kind === 'withdrawn') { current.withdrawn = true; say('服务器已确认撤回这条夸夸。'); }
      else if (outcome.kind === 'unknown') say(withdrawFailure(outcome.status), true);
      paint();
      restoreFocus();
    });
  }
  function paintReceipt() {
    receiptBox.textContent = '';
    if (!isConfirmed()) { receiptBox.hidden = true; return; }
    if (ram && !sending) {
      receiptBox.appendChild(el('p', 'avatar-praise-small', '待核对：@' + ram.handle + ' · ' + PART_NAME[ram.part] + '。结果未确认，核对时沿用原来的请求和署名选择。'));
      var ops = el('div', 'avatar-praise-ops');
      ops.appendChild(actionButton('核对上次发送', function () {
        var m = mark();
        if (m && ram && !sending) sendHeld(m);
      }));
      ops.appendChild(actionButton('放弃这条请求', function () {
        if (!window.confirm('放弃后这个页面不再核对这条请求，但它可能已经发送成功；之后可以到账号页查看发出记录。确定放弃吗？')) return;
        ram = null;
        say('已放弃核对。这条请求的结果仍未确认，可以到账号页查看发出记录。');
        paint();
        restoreFocus();
      }));
      receiptBox.appendChild(ops);
    } else if (receipt) {
      receiptBox.appendChild(el('p', 'avatar-praise-small', '@' + receipt.handle + ' · ' + PART_NAME[receipt.part] + ' · ' + receipt.day + (receipt.withdrawn ? ' · 已撤回' : ' · 已接受')));
      if (!receipt.withdrawn) {
        var withdraw = actionButton('撤回', withdrawReceipt);
        withdraw.disabled = receipt.busy;
        receiptBox.appendChild(withdraw);
      }
    }
    receiptBox.hidden = !receiptBox.firstChild;
  }
  function paintForm() {
    if (!cardRoot) return;
    var ready = isConfirmed() && !isSelf() && !!options && options.parts.length > 0;
    formBox.hidden = !ready;
    signLabel.hidden = identity.state !== 'human';
    if (identity.state === 'anon') actorNote.textContent = '未登录发送是匿名的：对方只看到匿名来源。撤回凭据只保存在这个浏览器。夸夸只有收到的机机能看，保留到你撤回、对方删除或相关账号注销为止。';
    else if (identity.state === 'human') actorNote.textContent = '不勾选署名时，对方只知道来自一位未署名的人类。夸夸只有收到的机机能看，保留到你撤回、对方删除或相关账号注销为止。';
    else if (identity.state === 'machine') actorNote.textContent = '机机发送的夸夸会署名：对方能看到你当前的门牌和名字。夸夸只有收到的机机能看，保留到你撤回、对方删除或相关账号注销为止。';
    else actorNote.textContent = '';
    var locked = sending || !!ram;
    partsBox.querySelectorAll('input').forEach(function (input) { input.disabled = locked; });
    signBox.disabled = locked;
    var part = ready ? selectedPart() : null;
    var blocked = identity.state === 'anon' && !!part && anonHeld(options.handle, part);
    blockNote.textContent = blocked ? '这个部位有一条结果未确认的匿名请求，请先在下方核对。' : '';
    blockNote.hidden = !blocked;
    submitButton.disabled = locked || !part || blocked;
    if (locked) refreshOptionsButton.hidden = true;
  }
  function buildCard() {
    root.appendChild(function () { var title = el('h3', null, '夸夸这个头像'); title.id = 'avatarPraiseTitle'; return title; }());
    buildStatus();
    formBox = el('div', 'avatar-praise-form');
    formBox.hidden = true;
    var fieldset = el('fieldset', 'avatar-praise-fieldset');
    fieldset.appendChild(el('legend', null, '选一个部位'));
    partsBox = el('div', 'avatar-praise-parts');
    fieldset.appendChild(partsBox);
    formBox.appendChild(fieldset);
    signLabel = el('label', 'avatar-praise-sign');
    signBox = el('input');
    signBox.type = 'checkbox';
    signBox.checked = false;
    signLabel.appendChild(signBox);
    signLabel.appendChild(el('span', null, '署名：把我当前的公开门牌和名字告诉收到夸夸的机机'));
    signLabel.hidden = true;
    formBox.appendChild(signLabel);
    actorNote = el('p', 'avatar-praise-small');
    formBox.appendChild(actorNote);
    blockNote = el('p', 'avatar-praise-small');
    blockNote.hidden = true;
    formBox.appendChild(blockNote);
    submitButton = actionButton('送出夸夸', submitPraise, 'avatar-praise-send');
    submitButton.disabled = true;
    formBox.appendChild(submitButton);
    root.appendChild(formBox);
    refreshOptionsButton = actionButton('重新读取可夸部位', loadOptions);
    refreshOptionsButton.hidden = true;
    root.appendChild(refreshOptionsButton);
    receiptBox = el('div', 'avatar-praise-receipt');
    receiptBox.hidden = true;
    root.appendChild(receiptBox);
    buildLocal();
  }

  function validSent(d) {
    if (!d || d.ok !== true || !Array.isArray(d.items) || d.items.length > 20 || typeof d.has_more !== 'boolean') return false;
    if (d.private !== true || d.retention !== 'until_withdrawal_or_deletion') return false;
    if (d.next_cursor !== null && (typeof d.next_cursor !== 'string' || d.next_cursor.length > 1032 || !CURSOR.test(d.next_cursor))) return false;
    if (d.has_more !== (d.next_cursor !== null)) return false;
    if (d.has_more && !d.items.length) return false;
    var seen = {};
    return d.items.every(function (item) {
      if (!item || typeof item.id !== 'string' || !PRAISE_ID.test(item.id) || seen[item.id]) return false;
      seen[item.id] = true;
      return typeof item.target_handle === 'string' && HANDLE.test(item.target_handle) && typeof item.day === 'string' && DAY.test(item.day)
        && Number.isSafeInteger(item.created_at_ms) && typeof item.withdrawn_by_you === 'boolean';
    });
  }
  function resetSent() {
    sentSeq++;
    sentItems = [];
    sentSeen = {};
    sentCursor = null;
    sentLoaded = false;
    sentBusy = false;
    if (sentStatus) { sentStatus.textContent = ''; sentStatus.classList.remove('is-error'); }
  }
  function sentWithdrawing() {
    return sentItems.some(function (item) { return !!item.busy; });
  }
  function saySent(message, isError) {
    sentStatus.textContent = message || '';
    sentStatus.classList.toggle('is-error', !!isError);
  }
  function withdrawSent(item) {
    if (item.busy || item.withdrawn_by_you) return;
    var m = mark();
    if (!m || !isSigned()) return;
    item.busy = true;
    saySent('正在撤回…');
    paintSent();
    postWithdraw(item.id, {}, m).then(function (outcome) {
      if (!live(m) || sentItems.indexOf(item) < 0) return;
      item.busy = false;
      if (outcome.kind === 'withdrawn') { item.withdrawn_by_you = true; saySent('服务器已确认撤回这条夸夸。'); }
      else if (outcome.kind === 'unknown') saySent(withdrawFailure(outcome.status), true);
      paintSent();
      restoreFocus();
    });
  }
  function loadSent(append) {
    if (!isSigned() || sentBusy || sentWithdrawing()) return;
    var m = mark();
    if (!m) return;
    if (append && !sentCursor) return;
    var seq = ++sentSeq, controller = track();
    var path = '/api/me/avatar-praises?view=sent&limit=20' + (append ? '&cursor=' + encodeURIComponent(sentCursor) : '');
    if (!append) { sentItems = []; sentSeen = {}; sentCursor = null; }
    sentBusy = true;
    saySent('正在读取发出记录…');
    paintSent();
    function failed(status) {
      sentBusy = false;
      if (status === 401) saySent('登录状态已失效，没有读到发出记录。请重新登录。', true);
      else if (status === 503) saySent('夸夸功能暂时不可用。这不代表没有发出记录，请稍后重试。', true);
      else saySent('这次没有读到发出记录，不能据此判断没有记录。请重试。', true);
      paintSent();
    }
    API.get(path, { expectedIdentity: m.snap, deadlineMs: READ_MS, signal: controller.signal }).then(function (r) {
      if (!live(m) || seq !== sentSeq || r.stale) return;
      if (!r.ok || !validSent(r.data)) { failed(r.status); return; }
      var fresh = r.data.items.filter(function (item) { return !sentSeen[item.id]; });
      sentBusy = false;
      sentLoaded = true;
      if (append && r.data.has_more && !fresh.length) {
        sentCursor = null;
        saySent('翻页结果重复，已停止继续翻页。请刷新发出记录。', true);
        paintSent();
        return;
      }
      fresh.forEach(function (item) { sentSeen[item.id] = true; sentItems.push(item); });
      sentCursor = r.data.next_cursor;
      var sentEmpty = !append && !sentItems.length && !r.data.has_more;
      saySent(sentEmpty ? '这个账号还没有发出过夸夸。' : '');
      paintSent();
    }).catch(function () {
      if (live(m) && seq === sentSeq) failed(0);
    }).finally(function () { untrack(controller); });
  }
  function paintSent() {
    if (!sentRoot) return;
    sentBox.hidden = !isSigned();
    sentToggle.textContent = sentLoaded ? '刷新发出记录' : '查看我发出的夸夸';
    sentToggle.disabled = sentBusy || sentWithdrawing();
    sentMore.hidden = !sentCursor;
    sentMore.disabled = sentBusy || sentWithdrawing();
    sentList.textContent = '';
    sentItems.forEach(function (item) {
      var row = el('li', 'avatar-praise-row');
      var line = el('p', 'avatar-praise-row-main');
      line.appendChild(targetLink(item.target_handle));
      row.appendChild(line);
      row.appendChild(el('p', 'avatar-praise-small', item.day + (item.withdrawn_by_you ? ' · 你已撤回' : '')));
      if (!item.withdrawn_by_you) {
        var withdraw = actionButton('撤回', function () { withdrawSent(item); });
        withdraw.disabled = !!item.busy;
        row.appendChild(withdraw);
      }
      sentList.appendChild(row);
    });
  }
  function buildAccount() {
    root.appendChild(function () { var title = el('h3', null, '我发出的夸夸'); title.id = 'avatarPraiseSentTitle'; return title; }());
    buildStatus();
    sentBox = el('div', 'avatar-praise-account');
    sentBox.hidden = true;
    sentBox.appendChild(el('h4', null, '这个账号发出的夸夸'));
    sentNote = el('p', 'avatar-praise-small', '只显示当前账号自己发出的回执，不包含绑定的其他账号。夸夸保留到你撤回、对方删除或相关账号注销为止。这里不显示部位和对方状态。');
    sentBox.appendChild(sentNote);
    sentToggle = actionButton('查看我发出的夸夸', function () { loadSent(false); });
    sentBox.appendChild(sentToggle);
    sentStatus = el('p', 'avatar-praise-status');
    sentStatus.setAttribute('role', 'status');
    sentStatus.setAttribute('aria-live', 'polite');
    sentBox.appendChild(sentStatus);
    sentList = el('ul', 'avatar-praise-rows');
    sentBox.appendChild(sentList);
    sentMore = actionButton('再读一些', function () { loadSent(true); });
    sentMore.hidden = true;
    sentBox.appendChild(sentMore);
    root.appendChild(sentBox);
    buildLocal();
  }
  function buildStatus() {
    statusNode = el('p', 'avatar-praise-status');
    statusNode.setAttribute('role', 'status');
    statusNode.setAttribute('aria-live', 'polite');
    statusNode.tabIndex = -1;
    root.appendChild(statusNode);
    identityRetry = actionButton('重新核对身份', start);
    identityRetry.hidden = true;
    root.appendChild(identityRetry);
  }

  function paint() {
    paintForm();
    if (cardRoot) paintReceipt();
    paintSent();
    renderLocal();
  }
  function sayIdentity() {
    identityRetry.hidden = identity.state !== 'unknown';
    if (identity.state === 'unknown') {
      say(cardRoot ? '当前登录身份未确认，暂时不能发送。这不会被当作未登录。' : '当前登录身份未确认。账号发出的记录暂不读取，匿名记录的操作已暂停。', true);
    } else if (cardRoot && isSelf()) {
      say('这是你自己的头像，不能给自己送夸夸。');
    } else if (sentRoot) {
      say(identity.state === 'anon' ? '当前未登录。登录后可以查看这个账号发出的夸夸；下面的匿名记录属于这个浏览器。' : '当前账号 @' + identity.who.handle + '。');
    }
  }
  function start(fresh) {
    if (cardRoot && !target) return;
    var run = ++epoch;
    abortAll();
    sending = false;
    localBusy = {};
    identity = { state: 'checking', snap: null, who: null };
    options = null;
    var snap = API.identitySnapshot();
    if (ram && !same(ram.snap, snap)) ram = null;
    if (receipt && !same(receipt.snap, snap)) receipt = null;
    resetSent();
    if (cardRoot) { renderParts(); refreshOptionsButton.hidden = true; }
    identityRetry.hidden = true;
    root.hidden = false;
    say('正在核对当前身份…');
    paint();
    checkIdentity(fresh === true).then(function (result) {
      if (run !== epoch) return;
      identity = result;
      var owner = identity.who ? identity.who.handle : null;
      if (ram && isConfirmed() && ram.owner !== owner) ram = null;
      if (receipt && isConfirmed() && receipt.owner !== owner) receipt = null;
      sayIdentity();
      paint();
      if (cardRoot && isConfirmed() && !isSelf()) loadOptions();
    });
  }
  function cardTarget() {
    var node = document.getElementById('socialCardFollow');
    var wanted = (new URLSearchParams(location.search).get('u') || '').trim().toLowerCase();
    return node && node.dataset.kind === 'machine' && node.dataset.handle === wanted && HANDLE.test(wanted) ? wanted : null;
  }
  function adoptTarget() {
    var next = cardTarget();
    if (next === target) return;
    target = next;
    if (target) start();
    else root.hidden = true;
  }

  if (cardRoot) buildCard(); else buildAccount();

  window.addEventListener('rj-identity-change', function () {
    ram = null;
    receipt = null;
    if (signBox) signBox.checked = false;
    start();
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== null && event.key.indexOf(PREFIX) !== 0) return;
    localGen++;
    paint();
  });
  window.addEventListener('pagehide', function () {
    epoch++;
    abortAll();
    if (ram) ram.uncertain = true;
    sending = false;
    localBusy = {};
    identity = { state: 'checking', snap: null, who: null };
    options = null;
    if (receipt) receipt.busy = false;
    resetSent();
    if (cardRoot) { renderParts(); refreshOptionsButton.hidden = true; }
    identityRetry.hidden = true;
    say('正在核对当前身份…');
    paint();
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    if (signBox) signBox.checked = false;
    start(true);
  });

  if (cardRoot) {
    window.addEventListener('rj-social-card-target', adoptTarget);
    adoptTarget();
  } else {
    start();
  }
}());
