import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../rj-api.js', import.meta.url), 'utf8');
const A = 's_' + 'a'.repeat(32);
const B = 's_' + 'b'.repeat(32);

function runtime({ webLocks, storage, activity }) {
  const values = storage || new Map();
  const requests = [];
  let active = 0, maxActive = 0, lockCalls = 0;
  const sharedActivity = activity || { active: 0, maxActive: 0 };
  const context = {
    URLSearchParams, URL, Response, Headers, AbortController,
    Promise, JSON, Math, Date, setTimeout, clearTimeout,
    console,
    localStorage: {
      getItem: (k) => values.has(k) ? values.get(k) : null,
      setItem: (k, v) => values.set(k, String(v)),
      removeItem: (k) => values.delete(k),
    },
    document: {
      readyState: 'loading', addEventListener() {}, querySelector() { return null; },
      querySelectorAll() { return []; }, createElement() { return {}; },
    },
    location: { pathname: '/', search: '', hash: '' },
  };
  context.window = context;
  context.window.addEventListener = function () {};
  context.window.RJ_CONFIG = { apiBase: 'https://api.example.test' };
  let lockQueue = Promise.resolve();
  context.navigator = webLocks ? { locks: { request: (_name, work) => {
    lockCalls++;
    const run = lockQueue.then(work, work);
    lockQueue = run.catch(() => {});
    return run;
  } } } : {};
  context.fetch = async (_url, init) => {
    active++; maxActive = Math.max(maxActive, active);
    sharedActivity.active++; sharedActivity.maxActive = Math.max(sharedActivity.maxActive, sharedActivity.active);
    requests.push({ method: init.method, headers: { ...init.headers }, body: init.body });
    await new Promise((resolve) => setTimeout(resolve, init.method === 'GET' ? 40 : 15));
    active--; sharedActivity.active--;
    const body = init.body ? JSON.parse(init.body) : {};
    const payload = init.method === 'DELETE' ? { ok: true }
      : { ok: true, session_id: body.handle === 'a' ? A : B };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  vm.runInNewContext(source, context, { filename: 'rj-api.js' });
  return { api: context.window.RJ_API, values, requests,
    stats: () => ({ maxActive, lockCalls }) };
}

for (const webLocks of [true, false]) {
  test(`selector mutation serialization (${webLocks ? 'Web Locks' : 'fallback'})`, async () => {
    const r = runtime({ webLocks });
    const [one, two] = await Promise.all([
      r.api.post('/api/sessions', { handle: 'a', recovery_code: 'not-stored-a' }),
      r.api.post('/api/sessions', { handle: 'b', recovery_code: 'not-stored-b' }),
    ]);
    assert.equal(one.ok, true);
    assert.equal(two.ok, true);
    assert.equal(r.stats().maxActive, 1, '同一页面的登录 fetch 必须串行');
    assert.equal(r.requests[0].headers['X-RJ-Session'], undefined);
    assert.equal(r.requests[1].headers['X-RJ-Session'], A);
    assert.deepEqual(JSON.parse(r.values.get('rj_session_selector')),
      { session_id: B, generation: 2 });
    const storage = JSON.stringify(Object.fromEntries(r.values));
    assert.equal(storage.includes('not-stored-a'), false);
    assert.equal(storage.includes('not-stored-b'), false);
    if (webLocks) assert.equal(r.stats().lockCalls, 2);
    await r.api.del('/api/sessions');
    assert.deepEqual(JSON.parse(r.values.get('rj_session_selector')),
      { session_id: null, generation: 3 });
  });
}

test('selector generation makes an in-flight old-account result stale', async () => {
  const r = runtime({ webLocks: true });
  await r.api.post('/api/sessions', { handle: 'a', recovery_code: 'x' });
  const old = r.api.get('/api/me/bindings');
  await r.api.post('/api/sessions', { handle: 'b', recovery_code: 'y' });
  const result = await old;
  assert.equal(result.stale, true);
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
});

test('same-event-loop contexts without IndexedDB fence stale selector publication', async () => {
  const storage = new Map(), activity = { active: 0, maxActive: 0 };
  const left = runtime({ webLocks: false, storage, activity });
  const right = runtime({ webLocks: false, storage, activity });
  const results = await Promise.all([
    left.api.post('/api/sessions', { handle: 'a', recovery_code: 'left-secret' }),
    right.api.post('/api/sessions', { handle: 'b', recovery_code: 'right-secret' }),
  ]);
  // This VM shares a synchronous Map and has no native cross-page primitive.
  // It proves generation fencing, never cross-tab exclusion (the browser test does).
  assert.equal(activity.maxActive, 2);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.stale).length, 1);
  const selected = JSON.parse(storage.get('rj_session_selector'));
  assert.equal(selected.generation, 1);
  assert.ok([A, B].includes(selected.session_id));
  const blob = JSON.stringify(Object.fromEntries(storage));
  assert.equal(blob.includes('left-secret'), false);
  assert.equal(blob.includes('right-secret'), false);
});
