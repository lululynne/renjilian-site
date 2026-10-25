import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../rj-api.js', import.meta.url), 'utf8');
const A = 's_' + 'a'.repeat(32);
const B = 's_' + 'b'.repeat(32);

function runtime({ webLocks, storage, activity, fetcher, objectURLs } = {}) {
  const values = storage || new Map();
  const requests = [];
  let active = 0, maxActive = 0, lockCalls = 0;
  const sharedActivity = activity || { active: 0, maxActive: 0 };
  const context = {
    URLSearchParams, URL: class extends URL {
      static createObjectURL(blob) {
        const value = `blob:test-${(objectURLs || []).length + 1}`;
        if (objectURLs) objectURLs.push({ value, blob, revoked: false });
        return value;
      }
      static revokeObjectURL(value) {
        const row = objectURLs && objectURLs.find((item) => item.value === value);
        if (row) row.revoked = true;
      }
    }, Response, Headers, Blob, AbortController,
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
    if (fetcher) return fetcher(_url, init);
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

test('pending media uses the selected session, validates image bytes, and revokes its Blob URL', async () => {
  const values = new Map([['rj_session_selector', JSON.stringify({ session_id: A, generation: 7 })]]);
  const objectURLs = [], requests = [];
  const r = runtime({ webLocks: true, storage: values, objectURLs, fetcher: async (url, init) => {
    requests.push({ url, init });
    return new Response(new Blob(['image'], { type: 'image/png' }), {
      status: 200, headers: { 'content-type': 'image/png' },
    });
  } });
  const preview = await r.api.mediaPreview({ url: '/api/media/m_pending', state: 'pending' });
  assert.equal(preview.ok, true);
  assert.equal(preview.src, 'blob:test-1');
  assert.equal(requests[0].url, 'https://api.example.test/api/media/m_pending');
  assert.equal(requests[0].init.credentials, 'include');
  assert.equal(requests[0].init.redirect, 'error');
  assert.equal(requests[0].init.headers['X-RJ-Session'], A);
  assert.equal(requests[0].url.includes(A), false, 'selector must never enter the URL');
  preview.release();
  assert.equal(objectURLs[0].revoked, true);
});

test('approved media remains a public URL and pending media rejects redirects/non-images', async () => {
  const publicPreview = await runtime({ webLocks: true }).api.mediaPreview({
    url: '/api/media/m_approved', state: 'approved',
  });
  assert.deepEqual({ ok: publicPreview.ok, src: publicPreview.src, public: publicPreview.public },
    { ok: true, src: 'https://api.example.test/api/media/m_approved', public: true });

  const redirected = new Response(new Blob(['x'], { type: 'image/png' }), {
    status: 200, headers: { 'content-type': 'image/png' },
  });
  Object.defineProperty(redirected, 'redirected', { value: true });
  for (const response of [
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    redirected,
  ]) {
    const r = runtime({ webLocks: true, fetcher: async () => response });
    const preview = await r.api.mediaPreview({ url: '/api/media/m_pending', state: 'pending' });
    assert.equal(preview.ok, false);
  }
});

test('a pending media response from an old selector generation cannot reach the new UI', async () => {
  const values = new Map([['rj_session_selector', JSON.stringify({ session_id: A, generation: 3 })]]);
  const objectURLs = [];
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const r = runtime({ webLocks: true, storage: values, objectURLs, fetcher: async () => {
    await waiting;
    return new Response(new Blob(['old'], { type: 'image/webp' }), {
      status: 200, headers: { 'content-type': 'image/webp' },
    });
  } });
  const pending = r.api.mediaPreview({ url: '/api/media/m_old', state: 'pending' });
  values.set('rj_session_selector', JSON.stringify({ session_id: B, generation: 4 }));
  release();
  const preview = await pending;
  assert.equal(preview.ok, false);
  assert.equal(preview.stale, true);
  assert.equal(objectURLs.length, 0, 'stale bytes must not create a Blob URL');
});

test('an expected identity already replaced by another account cannot start a private write', async () => {
  const values=new Map([['rj_session_selector',JSON.stringify({session_id:B,generation:4})]]);
  const r=runtime({storage:values});
  const response=await r.api.put('/api/me/card/display',{expected_owner_id:'account-a'},
    {expectedIdentity:{session_id:A,generation:3}});
  assert.equal(r.requests.length,0,'A intent must never be sent with B credentials');
  assert.equal(response.stale,true);
});

test('identity changes in the fetch microtask prevent the request, rather than only hiding its response', async () => {
  const values=new Map([['rj_session_selector',JSON.stringify({session_id:A,generation:3})]]);
  const r=runtime({storage:values});
  const pending=r.api.put('/api/me/card/display',{expected_owner_id:'account-a'},
    {expectedIdentity:{session_id:A,generation:3}});
  values.set('rj_session_selector',JSON.stringify({session_id:B,generation:4}));
  const response=await pending;
  assert.equal(r.requests.length,0,'a delayed fetch must recheck the expected selector');
  assert.equal(response.stale,true);
});

test('a frozen non-secret identity snapshot pins its own selector without changing legacy calls', async () => {
  const values=new Map([['rj_session_selector',JSON.stringify({session_id:A,generation:3})]]);
  const r=runtime({storage:values});
  const identity=r.api.identitySnapshot();
  assert.equal(Object.isFrozen(identity),true);
  assert.equal(identity.session_id,A); assert.equal(identity.generation,3);
  assert.deepEqual(Object.keys(identity).sort(),['generation','session_id']);
  const response=await r.api.get('/api/me/chest',{expectedIdentity:identity});
  assert.equal(response.ok,true); assert.equal(r.requests[0].headers['X-RJ-Session'],A);
  await r.api.get('/api/config');
  assert.equal(r.requests.length,2);
});
