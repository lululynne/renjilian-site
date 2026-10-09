#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Real Chromium pages/IndexedDB, mock HTTP contracts; no production or D1 claim."""
import json
import os
import tarfile
import unittest

from test_account_security import (BrowserRig, SecurityBackend, RecoverBackend, MOCK,
                                   CODE, NEW_CODE, TOKEN, REPLACE_NOTICE, REREAD_NOTICE)

A = "s_" + "a" * 32
B = "s_" + "b" * 32


def settle(page, condition):
    page.wait_for_function(condition, timeout=5000)


def hidden(page, value):
    page.evaluate("v => { Object.defineProperty(document, 'hidden', {configurable:true, value:v});"
                  " document.dispatchEvent(new Event('visibilitychange')); }", value)


class CoordinationBrowser(BrowserRig, unittest.TestCase):
    def pages(self, unavailable=False, short_deadline=False):
        ctx = self.browser.new_context()
        ctx.add_init_script("Object.defineProperty(navigator, 'locks', {value:undefined});")
        if unavailable:
            ctx.add_init_script("Object.defineProperty(window, 'indexedDB', {get(){throw Error('denied')}});"
                                "Object.defineProperty(window, 'localStorage', {get(){throw Error('denied')}});")
        if short_deadline:
            ctx.add_init_script("const originalTimeout = window.setTimeout;"
                                "window.setTimeout = (fn,ms,...args) => originalTimeout(fn, ms === 30000 ? 80 : ms, ...args);")
        pages = []
        for _ in range(2):
            p = ctx.new_page()
            p.route(self.site + "/a0-fixture", lambda r: r.fulfill(body="<!doctype html><html></html>"))
            p.goto(self.site + "/a0-fixture")
            p.evaluate("base => { window.RJ_CONFIG = {apiBase:base}; }", MOCK)
            baseline = os.environ.get("A0_BASELINE_ARCHIVE")
            if baseline:
                with tarfile.open(baseline) as archive:
                    member = next(m for m in archive.getmembers() if m.name.endswith("/rj-api.js") or m.name == "rj-api.js")
                    p.add_script_tag(content=archive.extractfile(member).read().decode())
            else:
                p.add_script_tag(url=self.site + "/rj-api.js")
            pages.append(p)
        return ctx, pages

    def start(self, page, handle, method="POST"):
        page.evaluate("arg => { window.outcome = null; window.pending = RJ_API[arg.method === 'DELETE' ? 'del' : 'post']("
                      " '/api/sessions', {handle:arg.handle, recovery_code:'fixture-only'})"
                      ".then(r => window.outcome = r); }", {"handle": handle, "method": method})

    def answer(self, route, session):
        route.fulfill(status=200, content_type="application/json",
                      headers={"Access-Control-Allow-Origin": self.site,
                               "Access-Control-Allow-Credentials": "true"},
                      body=json.dumps({"ok": True, "session_id": session}))

    def test_real_separate_pages_use_indexeddb_and_serialize_without_web_locks(self):
        ctx, (left, right) = self.pages()
        held = []
        ctx.route(MOCK + "/**", lambda r: r.fulfill(status=204, headers={
            "Access-Control-Allow-Origin": self.site, "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "content-type,x-rj-session"}) if r.request.method == "OPTIONS" else held.append(r))
        try:
            self.start(left, "a")
            left.wait_for_timeout(100)
            self.assertEqual(len(held), 1)
            self.start(right, "b")
            right.wait_for_timeout(120)
            self.assertEqual(len(held), 1, "competing independently scheduled page entered the owned request")
            self.assertIn("rj-session-coordination", left.evaluate("async () => (await indexedDB.databases()).map(x=>x.name)"))
            self.answer(held[0], A)
            settle(left, "window.outcome !== null")
            right.wait_for_timeout(150)
            self.assertEqual(len(held), 2)
            self.assertEqual(held[1].request.headers.get("x-rj-session"), A)
            self.answer(held[1], B)
            settle(right, "window.outcome !== null")
            state = left.evaluate("JSON.parse(localStorage.getItem('rj_session_selector'))")
            self.assertEqual(state, {"session_id": B, "generation": 2})
            self.assertNotIn("fixture-only", left.evaluate("JSON.stringify(localStorage)"))
            stored = left.evaluate("async () => { const db=await new Promise(resolve=>{const r=indexedDB.open('rj-session-coordination');"
                                   "r.onsuccess=()=>resolve(r.result);});const value=await new Promise(resolve=>{"
                                   "const r=db.transaction('ownership').objectStore('ownership').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return value; }")
            self.assertEqual(set(stored[0]), {"fence"}, "released durable record retains only a non-secret fence")
        finally:
            ctx.close()

    def takeover(self, method="POST"):
        ctx, (left, right) = self.pages()
        try:
            # Fetch is controlled inside each real page so an obsolete owner can finish last.
            for p in (left, right):
                p.evaluate("() => { window.fetch = () => new Promise(resolve => window.respond = resolve); }")
            self.start(left, "a", method)
            settle(left, "typeof window.respond === 'function'")
            left.evaluate("async () => { const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('rj-session-coordination',1);"
                          "r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});"
                          " await new Promise((resolve,reject)=>{const tx=db.transaction('ownership','readwrite');"
                          "const s=tx.objectStore('ownership'),r=s.get('selector');r.onsuccess=()=>{"
                          "if(!r.result){tx.abort();return;} const v=r.result;v.expires=Date.now()-1;s.put(v,'selector');};"
                          "tx.oncomplete=resolve;tx.onabort=()=>reject(Error('ownership missing'));});db.close(); }")
            self.start(right, "b")
            settle(right, "typeof window.respond === 'function'")
            right.evaluate("s => respond(new Response(JSON.stringify({ok:true,session_id:s})))", B)
            settle(right, "window.outcome !== null")
            left.evaluate("arg => respond(new Response(JSON.stringify(arg)))",
                          {"ok": True, "session_id": A} if method == "POST" else {"ok": True})
            settle(left, "window.outcome !== null")
            self.assertTrue(left.evaluate("window.outcome.stale"))
            self.assertEqual(left.evaluate("JSON.parse(localStorage.rj_session_selector).session_id"), B)
        finally:
            ctx.close()

    def test_expired_owner_cannot_publish_after_takeover(self):
        self.takeover()

    def test_expired_logout_cannot_clear_takeover(self):
        self.takeover("DELETE")

    def test_stalled_headers_and_body_release_queue_without_replay(self):
        for stall in ("headers", "body"):
            with self.subTest(stall=stall):
                ctx, (left, right) = self.pages(short_deadline=True)
                try:
                    left.evaluate("stall => { window.calls = 0; window.fetch = () => { calls++;"
                                  "if(calls===1) return stall==='headers' ? new Promise(()=>{})"
                                  ": Promise.resolve({ok:true,status:200,text:()=>new Promise(()=>{})});"
                                  "return Promise.resolve(new Response(JSON.stringify({ok:true,session_id:'" + B + "'}))); }; }", stall)
                    self.start(left, "a")
                    settle(left, "window.calls === 1")
                    right.evaluate("s => localStorage.setItem('rj_session_selector', JSON.stringify({session_id:s,generation:9}))", B)
                    settle(left, "window.outcome !== null")
                    self.assertTrue(left.evaluate("window.outcome.unknown"))
                    self.assertEqual(left.evaluate("JSON.parse(localStorage.rj_session_selector).generation"), 9)
                    self.start(left, "b")
                    settle(left, "window.outcome !== null")
                    self.assertTrue(left.evaluate("window.outcome.ok"))
                    self.assertEqual(left.evaluate("window.calls"), 2)
                finally:
                    ctx.close()

    def test_storage_unavailable_keeps_basic_same_page_login(self):
        ctx, (left, _) = self.pages(unavailable=True)
        try:
            left.evaluate("() => { window.fetch = () => Promise.resolve(new Response(JSON.stringify({ok:true,session_id:'" + A + "'}))); }")
            self.start(left, "a")
            settle(left, "window.outcome !== null")
            self.assertTrue(left.evaluate("window.outcome.ok"))
            left.evaluate("() => { window.selected = null; window.fetch = (url, init) => { selected=init.headers['X-RJ-Session'];"
                          "return Promise.resolve(new Response('{}')); }; window.read = RJ_API.get('/api/me'); }")
            settle(left, "window.selected !== null")
            self.assertEqual(left.evaluate("window.selected"), A)
        finally:
            ctx.close()


class SecretRaceBrowser(BrowserRig, unittest.TestCase):
    def test_automatic_clear_and_pagehide_invalidate_pending_reads(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        held = []
        try:
            page.clock.install()
            page.locator("#recoveryEye").click()
            settle(page, "document.getElementById('recoveryValue').value !== ''")
            page.clock.fast_forward(60001)
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
            page.route(MOCK + "/api/me/recovery/reveal", lambda r: held.append(r))
            page.locator("#recoveryEye").click()
            settle(page, "document.getElementById('recoveryEye').disabled")
            page.wait_for_timeout(100)
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "recovery_code": CODE}), headers=fake.cors(held[0]))
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
        finally:
            ctx.close()

    def test_old_reveal_cannot_overwrite_replacement(self):
        fake = SecurityBackend()
        ctx, page, errors, _ = self.open_account(fake)
        held = []
        page.route(MOCK + "/api/me/recovery/reveal", lambda r: held.append(r))
        try:
            page.locator("#recoveryEye").click()
            page.wait_for_timeout(100)
            self.assertEqual(len(held), 1)
            page.locator("#recoveryReplace").click()
            settle(page, "document.getElementById('recoveryValue').value === " + json.dumps(NEW_CODE))
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "handle": fake.handle, "recovery_code": CODE}), headers=fake.cors(held[0]))
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), NEW_CODE)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_prepare_blocks_reveal_and_unknown_replace_restores_reread(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        held = []
        page.route(MOCK + "/api/me/recovery/replace-prepare", lambda r: held.append(r))
        try:
            page.locator("#recoveryReplace").click()
            page.wait_for_timeout(100)
            self.assertTrue(page.locator("#recoveryEye").is_disabled())
            page.route(MOCK + "/api/me/recovery/replace", lambda r: r.abort())
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "handle": fake.handle, "prepared": True}), headers=fake.cors(held[0]))
            settle(page, "!document.getElementById('recoveryReplace').disabled")
            self.assertFalse(page.locator("#recoveryEye").is_disabled())
        finally:
            ctx.close()

    def test_stalled_replacement_body_restores_explicit_reveal_without_replay(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        try:
            page.evaluate("() => { const timer=window.setTimeout, request=window.fetch;window.replaceCount=0;"
                          "window.setTimeout=(fn,ms,...args)=>timer(fn,ms===30000?100:ms,...args);"
                          "window.fetch=(url,init)=>{if(url.endsWith('/api/me/recovery/replace')){replaceCount++;"
                          "return Promise.resolve({ok:true,status:200,text:()=>new Promise(()=>{})});}return request(url,init);}; }")
            page.locator("#recoveryReplace").click()
            settle(page, "document.getElementById('recoveryNote').textContent.includes('结果尚未确认')")
            self.assertFalse(page.locator("#recoveryEye").is_disabled())
            self.assertFalse(page.locator("#recoveryReplace").is_disabled())
            self.assertEqual(page.evaluate("window.replaceCount"), 1)
        finally:
            ctx.close()

    def test_hide_then_show_invalidates_inflight_secret_read(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        held = []
        page.route(MOCK + "/api/me/recovery/reveal", lambda r: held.append(r))
        try:
            page.locator("#recoveryEye").click()
            page.wait_for_timeout(100)
            hidden(page, True)
            hidden(page, False)
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "recovery_code": CODE}), headers=fake.cors(held[0]))
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
            self.assertFalse(page.locator("#recoveryEye").is_disabled())
        finally:
            ctx.close()

    def test_real_storage_event_clears_visible_secret_and_repaints_identity(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        other = ctx.new_page()
        other.goto(self.site + "/privacy.html")
        held = []
        try:
            page.locator("#recoveryEye").click()
            settle(page, "document.getElementById('recoveryValue').value !== ''")
            page.route(MOCK + "/api/me", lambda r: held.append(r))
            fake.handle = "fake-human-b"
            other.evaluate("s => localStorage.setItem('rj_session_selector', JSON.stringify({session_id:s,generation:9}))", B)
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
            self.assertTrue(page.locator("#panelMe").is_hidden())
            self.assertEqual(len(held), 1)
            fake.handle_route(held[0])
            settle(page, "document.getElementById('meHandle').textContent === '@fake-human-b'")
            self.assertTrue(page.locator("#panelMe").is_visible())
        finally:
            ctx.close()

    def test_lease_only_storage_write_keeps_visible_identity_secret(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        try:
            page.evaluate("s => localStorage.setItem('rj_session_selector', JSON.stringify({session_id:s,generation:1}))", A)
            page.locator("#recoveryEye").click()
            settle(page, "document.getElementById('recoveryValue').value !== ''")
            other = ctx.new_page()
            other.goto(self.site + "/privacy.html")
            other.evaluate("s => localStorage.setItem('rj_session_selector', JSON.stringify({session_id:s,generation:1,lock_owner:'lease-only',lock_expires:Date.now()+1000}))", A)
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), CODE)
            self.assertTrue(page.locator("#panelMe").is_visible())
        finally:
            ctx.close()

    def test_queued_delete_retains_displayed_account_target(self):
        fake = SecurityBackend()
        ctx, page, _, _ = self.open_account(fake)
        try:
            page.evaluate("() => { const original = window.fetch; window.deleteBody = null; window.fetch = (url,init) => {"
                          "if(url.endsWith('/api/sessions') && init.method==='POST') return new Promise(r => window.finishLogin=r);"
                          "if(url.endsWith('/api/me') && init.method==='DELETE') { deleteBody=JSON.parse(init.body);"
                          "return Promise.resolve(new Response(JSON.stringify({ok:false,error:'identity changed'}),{status:409})); }"
                          "return original(url,init); }; window.login = RJ_API.post('/api/sessions',{handle:'b',recovery_code:'fixture'}); }")
            settle(page, "typeof window.finishLogin === 'function'")
            page.locator("#deleteGo").click()
            page.evaluate("s => finishLogin(new Response(JSON.stringify({ok:true,session_id:s})))", B)
            settle(page, "window.deleteBody !== null")
            self.assertEqual(page.evaluate("window.deleteBody.expected_handle"), fake.handle)
            self.assertEqual(page.evaluate("window.deleteBody.comments"), "delete")
        finally:
            ctx.close()

    def test_hidden_completion_can_explicitly_reread_same_code(self):
        fake = RecoverBackend(check={"ready": True})
        ctx, page, _ = self.open_recover(fake, fragment="token=" + TOKEN)
        held = []
        page.route(MOCK + "/api/account-recovery/complete", lambda r: held.append(r))
        try:
            page.locator("#recoverComplete").click()
            page.wait_for_timeout(100)
            hidden(page, True)
            hidden(page, False)
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "recovery_code": NEW_CODE, "notice": REREAD_NOTICE}), headers=fake.cors(held[0]))
            settle(page, "!document.getElementById('recoverComplete').disabled")
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            self.assertIn("读取", page.locator("#recoverComplete").inner_text())
            page.unroute(MOCK + "/api/account-recovery/complete")
            fake.complete = {"recovery_code": NEW_CODE, "notice": REREAD_NOTICE}
            page.locator("#recoverComplete").click()
            settle(page, "document.getElementById('recoverCode').value !== ''")
            self.assertEqual(page.locator("#recoverCode").input_value(), NEW_CODE)
            self.assertEqual(page.evaluate("location.hash"), "")
        finally:
            ctx.close()

    def test_success_while_hidden_restores_action_and_pagehide_blocks_late_code(self):
        fake = RecoverBackend(check={"ready": True})
        ctx, page, _ = self.open_recover(fake, fragment="token=" + TOKEN)
        held = []
        page.route(MOCK + "/api/account-recovery/complete", lambda r: held.append(r))
        try:
            page.locator("#recoverComplete").click()
            page.wait_for_timeout(100)
            hidden(page, True)
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "recovery_code": NEW_CODE}), headers=fake.cors(held[0]))
            settle(page, "!document.getElementById('recoverComplete').disabled")
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            hidden(page, False)
            page.locator("#recoverComplete").click()
            page.wait_for_timeout(100)
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
            held[1].fulfill(status=200, body=json.dumps({"ok": True, "recovery_code": NEW_CODE}), headers=fake.cors(held[1]))
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            self.assertTrue(page.locator("#recoverComplete").is_disabled())
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
