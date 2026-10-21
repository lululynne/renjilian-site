from __future__ import annotations
import functools
import http.server
import json
import threading
import unittest
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote
from playwright.sync_api import sync_playwright
from test_p25_machine_keys import FakeBackend

ROOT=Path(__file__).resolve().parents[1]
SESSION='s_'+'h'*32
NEXT='social1.'+'a'*60

def peer(handle='peer-bot',name='朋友'):
    return {'handle':handle,'kind':'machine','display_name':name,'card_url':'https://renji.love/card.html?u='+handle}

def feed(items=None,more=False):
    return {'ok':True,'items':items or [],'has_more':more,'next_cursor':NEXT if more else None,
            'retention_days':90,'started_on':'2031-01-01','metadata_only':True,'read_only':True,
            'untrusted_content':True,'execute':False}

def event(handle='peer-bot',name='朋友',kind='card_updated',suffix='a'):
    p=peer(handle,name)
    return {'id':'se_'+suffix*32,'actor':p,'day':'2031-01-02','kind':kind,'execute':False,
            'source_url':p['card_url'] if kind=='card_updated' else 'https://renji.love/kanread.html#kr-example'}

class SocialBackend(FakeBackend):
    def __init__(self,kind='human',signed_in=True):
        super().__init__(kind,[{'other':{'handle':'fake-bot','kind':'machine','active':True}}])
        self.signed_in=signed_in;self.following=False;self.error=None;self.unknown=False
        self.items=[event()];self.next_items=[];self.hold=None;self.held=None;self.wire=[]
        self.more=False;self.me_error=False;self.malformed=False
        self.config_failures=0;self.stall_requests=set();self.held_routes=[];self.commit_held_mutation=False;self.body_stall=False

    def handle_route(self,route):
        req=route.request;u=urlparse(req.url);path=u.path;method=req.method
        self.wire.append({'method':method,'path':path,'body':req.post_data,'headers':req.headers})
        if (method,path) in self.stall_requests:
            if self.commit_held_mutation and path=='/api/me/follows/peer-bot':
                if method=='PUT':self.following=True
                if method=='DELETE':self.following=False
            self.held_routes.append(route);return
        if path=='/api/config':
            if self.config_failures:
                self.config_failures-=1;return self.reply(route,503,{'ok':False})
            return self.reply(route,200,{'ok':True,'registration_open':True})
        if path=='/api/me':
            if self.me_error:return self.reply(route,503,{'ok':False})
            return self.reply(route,200,{'ok':True,'signed_in':self.signed_in,'session_id':SESSION,
                'handle':self.handle,'kind':self.kind,'probation_remaining':0})
        if path=='/api/sessions' and method=='POST':
            self.signed_in=True;self.handle=json.loads(req.post_data)['handle']
            return self.reply(route,200,{'ok':True,'handle':self.handle,'session_id':SESSION})
        if path=='/api/accounts' and method=='POST':
            body=json.loads(req.post_data);self.signed_in=True;self.handle=body['handle'];self.kind=body['kind']
            return self.reply(route,200,{'ok':True,'handle':self.handle,'session_id':SESSION,'recovery_code':'rjr-synthetic-only'})
        if path=='/api/me/social-feed':
            if self.body_stall:return route.continue_()
            if self.hold==self.handle and not self.held:self.held=route;return
            if self.error:return self.reply(route,503,{'ok':False,'code':'social_public_source_unavailable'})
            data=feed(self.next_items if 'cursor' in parse_qs(u.query) else self.items,self.more and not u.query.count('cursor'))
            if self.malformed:data['untrusted_content']=False
            return self.reply(route,200,data)
        if path=='/api/me/follows':
            return self.reply(route,200,{'ok':True,'items':[peer()] if self.following else [],
                'count':1 if self.following else 0,'max':500,'has_more':False,'next_cursor':None})
        if path=='/api/me/follows/peer-bot':
            if method!='GET' and self.unknown:return route.abort('failed')
            if method=='PUT':self.following=True
            if method=='DELETE':self.following=False
            return self.reply(route,200,{'ok':True,'handle':'peer-bot','following':self.following,'max':500})
        if path=='/api/card/catalog':return self.reply(route,200,{'ok':True})
        if path=='/api/accounts/peer-bot/card':
            return self.reply(route,200,{'ok':True,'handle':'peer-bot','kind':'machine','display_name':'朋友','card':{}})
        return super().handle_route(route)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if urlparse(self.path).path==getattr(self.server,'stall_body_path',None):
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
            self.wfile.write(b'{"ok":true,"items":[');self.wfile.flush()
            self.server.stall_body_started.set();self.server.stall_body_release.wait(60);return
        return super().do_GET()

class SocialBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler=functools.partial(QuietHandler,directory=str(ROOT))
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.p=sync_playwright().start();cls.browser=cls.p.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.p.stop();cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)

    def test_social_entry_has_the_existing_site_shell_and_private_reading_surfaces(self):
        page=self.browser.new_page(viewport={'width':390,'height':900})
        try:
            response=page.goto(self.base+'/social.html',wait_until='networkidle')
            self.assertEqual(response.status,200)
            self.assertEqual(page.get_by_role('heading',name='小朋友圈',exact=True).count(),1)
            self.assertEqual(page.get_by_role('link',name='账号',exact=True).first.count(),1)
            self.assertTrue(page.locator('#socialStatus').is_visible())
            self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        finally:page.close()

    def open(self,backend,path='social.html',width=390,clock=False,seed=False):
        page=self.browser.new_page(viewport={'width':width,'height':900})
        self.addCleanup(page.close)
        if clock:page.clock.install()
        if backend.hold or seed:
            page.add_init_script("localStorage.setItem('rj_session_selector',JSON.stringify({session_id:'s_'+ 'h'.repeat(32),generation:1}))")
        page.route('**/api/**',backend.handle_route)
        page.goto(self.base+'/'+path+('&' if '?' in path else '?')+'api='+quote(self.base,safe=''),wait_until='domcontentloaded')
        return page

    def test_real_helper_bootstraps_identity_and_renders_only_public_metadata(self):
        b=SocialBackend();b.items=[event(name='<img src=x>'),event(kind='comment_published',suffix='b')]
        p=self.open(b)
        p.locator('#socialFeedList>li').last.wait_for()
        self.assertEqual(p.locator('#socialFeedList>li').count(),2)
        self.assertIn('@fake-human',p.locator('#socialActor').inner_text())
        self.assertEqual(p.locator('#socialFeedList img').count(),0)
        self.assertIn('<img src=x',p.locator('#socialFeedList').inner_text())
        href=p.get_by_role('link',name='到原文看留言').get_attribute('href')
        self.assertTrue(href.endswith('#kr-example'));self.assertIn('?api=',href)
        self.assertEqual(p.locator('#socialFeedList time').first.inner_text(),'2031-01-02')
        self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))

    def test_guest_has_safe_return_and_never_reads_private_social_endpoints(self):
        b=SocialBackend(signed_in=False);p=self.open(b)
        p.locator('#socialGuest').wait_for(state='visible')
        self.assertIn('return_to=social.html',p.locator('#socialLoginLink').get_attribute('href'))
        self.assertFalse(any('/social-feed' in r['path'] or '/follows' in r['path'] for r in b.wire))

    def test_source_outage_and_malformed_metadata_do_not_turn_into_empty_success(self):
        for malformed in [False,True]:
            with self.subTest(malformed=malformed):
                b=SocialBackend();b.error=not malformed;b.malformed=malformed;p=self.open(b)
                p.locator('#socialFeedNote.is-error').wait_for()
                self.assertFalse(p.locator('#socialFeedEmpty').is_visible())
                self.assertEqual(p.locator('#socialFeedList>li').count(),0)
                self.assertTrue(p.locator('#socialRefresh').is_enabled())

    def test_paging_uses_original_cursor_without_automatic_read_ack(self):
        b=SocialBackend();b.more=True;b.next_items=[event(suffix='b')];p=self.open(b,width=1100)
        p.locator('#socialFeedMore').wait_for(state='visible');p.locator('#socialFeedMore').click()
        p.wait_for_function("document.querySelectorAll('#socialFeedList>li').length===2")
        self.assertTrue(all(r['method']=='GET' for r in b.wire))
        self.assertFalse(p.locator('#socialFeedMore').is_visible())
        self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))

    def test_account_switch_discards_inflight_old_actor_data_and_hidden_counts(self):
        b=SocialBackend();b.hold=b.handle;p=self.open(b)
        p.wait_for_function("document.querySelector('#socialFeedNote').textContent.includes('正在')")
        p.wait_for_timeout(60);self.assertIsNotNone(b.held)
        b.handle='second-human';b.items=[];b.hold=None
        p.evaluate("localStorage.setItem('rj_session_selector',JSON.stringify({session_id:'s_'+ 'j'.repeat(32),generation:10}));window.dispatchEvent(new CustomEvent('rj-identity-change'))")
        p.locator('#socialFeedEmpty').wait_for(state='visible')
        b.reply(b.held,200,feed([event(name='OLD_ACTOR_SECRET')]))
        p.wait_for_timeout(100)
        self.assertIn('@second-human',p.locator('#socialActor').inner_text())
        self.assertNotIn('OLD_ACTOR_SECRET',p.content())
        self.assertEqual(p.locator('#socialFeedList>li').count(),0)

    def test_card_follow_and_unfollow_are_bodyless_selected_identity_mutations(self):
        b=SocialBackend();p=self.open(b,'card.html?u=peer-bot')
        toggle=p.locator('#socialCardToggle');toggle.wait_for(state='visible')
        p.wait_for_function("!document.querySelector('#socialCardToggle').disabled")
        toggle.click();p.wait_for_function("document.querySelector('#socialCardToggle').textContent==='取消关注'")
        toggle.click();p.wait_for_function("document.querySelector('#socialCardToggle').textContent==='关注'")
        mutations=[r for r in b.wire if r['method'] in ['PUT','DELETE']]
        self.assertEqual([r['method'] for r in mutations],['PUT','DELETE'])
        self.assertTrue(all(r['body'] is None and 'content-type' not in r['headers'] for r in mutations))
        self.assertTrue(all(r['headers'].get('x-rj-session')==SESSION for r in mutations))
        self.assertIn('好友关系仍保留',p.locator('#socialCardStatus').inner_text())

    def test_unknown_follow_is_not_resent_and_requires_explicit_recheck(self):
        b=SocialBackend();b.unknown=True;p=self.open(b,'card.html?u=peer-bot')
        p.wait_for_function("document.querySelector('#socialCardToggle')&&!document.querySelector('#socialCardToggle').disabled&& !document.querySelector('#socialCardToggle').hidden")
        p.locator('#socialCardToggle').click();p.locator('#socialCardRecheck').wait_for(state='visible')
        self.assertTrue(p.locator('#socialCardToggle').is_disabled())
        self.assertEqual(sum(r['method']=='PUT' for r in b.wire),1)
        b.unknown=False;p.locator('#socialCardRecheck').click()
        p.wait_for_function("!document.querySelector('#socialCardToggle').disabled")
        self.assertEqual(sum(r['method']=='PUT' for r in b.wire),1)

    def test_following_management_unfollow_refreshes_list_and_feed(self):
        b=SocialBackend();b.following=True;p=self.open(b)
        p.get_by_role('button',name='取消关注 @peer-bot').click()
        p.locator('#socialFollowingEmpty').wait_for(state='visible')
        self.assertEqual(p.locator('#socialFollowingCount').inner_text(),'已关注 0 / 500')
        self.assertEqual(sum(r['method']=='DELETE' for r in b.wire),1)

    def test_account_links_and_social_scopes_are_explicit_and_default_off(self):
        b=SocialBackend();p=self.open(b,'account.html')
        p.locator('#panelMe').wait_for(state='visible')
        p.locator('.rj-social-scope input').first.wait_for()
        self.assertEqual(p.locator('.rj-social-scope input').count(),2)
        self.assertFalse(any(p.locator('.rj-social-scope input').nth(i).is_checked() for i in range(2)))
        self.assertIn('social.html',p.locator('#accountSocialLink').get_attribute('href'))

    def test_login_return_is_allowlisted_and_follows_only_explicit_login(self):
        for value,allowed in [('social.html',True),('card.html?u=peer-bot',True),('https://evil.example',False),('card.html?u=peer-bot&x=1',False),('//evil.example',False)]:
            with self.subTest(value=value):
                b=SocialBackend(signed_in=False);p=self.open(b,'account.html?return_to='+quote(value,safe=''))
                p.locator('#panelGuest').wait_for(state='visible')
                self.assertEqual(p.locator('#accountReturnWrap').is_visible(),allowed)
                self.assertIn('account.html',p.url)
                if allowed:
                    p.locator('#loginHandle').fill('fake-human');p.locator('#loginCode').fill('synthetic-test-code')
                    p.locator('#loginGo').click();p.wait_for_url('**/'+value.split('?')[0]+'*')
                    self.assertFalse(any(r['method']=='PUT' for r in b.wire))

    def test_registration_keeps_one_time_recovery_visible_until_saved_before_return(self):
        b=SocialBackend(signed_in=False);p=self.open(b,'account.html?return_to=social.html')
        p.locator('#panelGuest').wait_for(state='visible')
        p.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.resolve()},configurable:true})")
        p.locator('input[name="regKind"][value="human"]').check()
        p.locator('#regHandle').fill('new-human');p.locator('#regGo').click()
        p.locator('#regCode').wait_for(state='visible')
        self.assertIn('account.html',p.url)
        self.assertEqual(p.locator('#regCodeValue').inner_text(),'rjr-synthetic-only')
        p.locator('#regCodeDone').click()
        p.wait_for_function("document.querySelector('#regCodeDone').textContent.includes('收起')")
        self.assertIn('account.html',p.url)
        p.locator('#regCodeDone').click();p.wait_for_url('**/social.html*')
        self.assertNotIn('rjr-synthetic-only',p.content())

    def test_legacy_mutation_default_stays_json_while_social_is_bodyless(self):
        b=SocialBackend();p=self.open(b)
        p.locator('#socialActor').wait_for(state='visible')
        p.evaluate("RJ_API.del('/api/legacy-default-probe')")
        mutation=next(r for r in b.wire if r['path']=='/api/legacy-default-probe')
        self.assertEqual(mutation['body'],'{}')
        self.assertEqual(mutation['headers']['content-type'],'application/json')

    def test_startup_config_failure_can_retry_without_losing_the_selected_account(self):
        b=SocialBackend();b.config_failures=1;p=self.open(b,seed=True)
        p.locator('#socialStatus.is-error').wait_for()
        p.locator('#socialBootRetry').wait_for(state='visible',timeout=1500)
        p.locator('#socialBootRetry').click();p.locator('#socialActor').wait_for(state='visible')
        self.assertIn('@fake-human',p.locator('#socialActor').inner_text())
        self.assertEqual(sum(r['path']=='/api/config' for r in b.wire),2)
        p.evaluate('Promise.all([RJ_API.available(true),RJ_API.available(true)])')
        self.assertEqual(sum(r['path']=='/api/config' for r in b.wire),2)

    def test_card_startup_config_failure_has_a_working_retry_before_target_is_known(self):
        b=SocialBackend();b.config_failures=1;p=self.open(b,'card.html?u=peer-bot',seed=True)
        p.locator('#socialBootRetry').wait_for(state='visible',timeout=1500)
        p.locator('#socialBootRetry').click();p.locator('#socialCardToggle').wait_for(state='visible')
        self.assertEqual(sum(r['path']=='/api/config' for r in b.wire),2)
        self.assertFalse(any(r['method']=='PUT' for r in b.wire))

    def test_explicit_retry_preserves_a_shared_pending_availability_probe(self):
        b=SocialBackend();b.stall_requests={('GET','/api/config')};p=self.open(b,seed=True)
        p.wait_for_timeout(50)
        p.evaluate("window.sharedConfigChecks=[RJ_API.available(true),RJ_API.available(true)];true")
        p.wait_for_timeout(50);self.assertEqual(sum(r['path']=='/api/config' for r in b.wire),1)
        b.stall_requests.clear();b.reply(b.held_routes[0],200,{'ok':True})
        p.locator('#socialActor').wait_for(state='visible')
        p.evaluate('Promise.all(window.sharedConfigChecks)')
        self.assertEqual(sum(r['path']=='/api/config' for r in b.wire),1)

    def test_stalled_card_state_read_exposes_recheck_without_attempting_a_mutation(self):
        b=SocialBackend();b.stall_requests={('GET','/api/me/follows/peer-bot')}
        p=self.open(b,'card.html?u=peer-bot',clock=True,seed=True)
        p.locator('#socialCardToggle').wait_for(state='visible');p.clock.fast_forward(16000)
        p.locator('#socialCardRecheck').wait_for(state='visible',timeout=1500)
        self.assertTrue(p.locator('#socialCardToggle').is_disabled());b.stall_requests.clear()
        p.locator('#socialCardRecheck').click();p.wait_for_function("!document.querySelector('#socialCardToggle').disabled")
        self.assertFalse(any(r['method'] in ['PUT','DELETE'] for r in b.wire))

    def test_pagehide_also_clears_the_previous_action_message(self):
        b=SocialBackend();b.following=True;p=self.open(b,seed=True)
        p.get_by_role('button',name='取消关注 @peer-bot').click()
        p.locator('#socialFollowingEmpty').wait_for(state='visible')
        self.assertIn('@peer-bot',p.locator('#socialStatus').inner_text())
        p.evaluate("dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))")
        self.assertEqual(p.locator('#socialStatus').inner_text(),'')

    def test_stalled_feed_and_following_headers_unlock_read_recovery(self):
        b=SocialBackend();b.stall_requests={('GET','/api/me/social-feed'),('GET','/api/me/follows')}
        p=self.open(b,clock=True,seed=True);p.locator('#socialActor').wait_for(state='visible')
        p.wait_for_timeout(50);p.clock.fast_forward(16000)
        p.locator('#socialFeedNote.is-error').wait_for(timeout=1500)
        p.locator('#socialFollowingNote.is-error').wait_for(timeout=1500)
        self.assertTrue(p.locator('#socialRefresh').is_enabled());self.assertTrue(p.locator('#socialFollowingRefresh').is_enabled())
        self.assertEqual(sum(r['path']=='/api/me/social-feed' for r in b.wire),1)
        b.stall_requests.clear();p.locator('#socialRefresh').click();p.locator('#socialFeedList>li').wait_for()

    def test_stalled_response_body_is_bounded_before_the_server_releases_it(self):
        b=SocialBackend();b.body_stall=True
        self.server.stall_body_path='/api/me/social-feed'
        self.server.stall_body_started=threading.Event();self.server.stall_body_release=threading.Event()
        try:
            p=self.open(b,clock=True,seed=True);p.locator('#socialActor').wait_for(state='visible')
            deadline=time.monotonic()+5
            while not self.server.stall_body_started.is_set() and time.monotonic()<deadline:p.wait_for_timeout(20)
            self.assertTrue(self.server.stall_body_started.is_set());p.wait_for_timeout(50)
            p.clock.fast_forward(16000);p.locator('#socialFeedNote.is-error').wait_for(timeout=1500)
            self.assertFalse(self.server.stall_body_release.is_set());self.assertTrue(p.locator('#socialRefresh').is_enabled())
        finally:
            self.server.stall_body_release.set();self.server.stall_body_path=None

    def test_stalled_mutations_remain_unknown_until_rechecked_and_are_never_replayed(self):
        for method,initial in [('PUT',False),('DELETE',True)]:
            with self.subTest(method=method):
                b=SocialBackend();b.following=initial;b.commit_held_mutation=True
                b.stall_requests={(method,'/api/me/follows/peer-bot')}
                p=self.open(b,'card.html?u=peer-bot',clock=True,seed=True)
                p.wait_for_function("!document.querySelector('#socialCardToggle').hidden&&!document.querySelector('#socialCardToggle').disabled")
                p.locator('#socialCardToggle').click();p.clock.fast_forward(16000)
                p.locator('#socialCardRecheck').wait_for(state='visible',timeout=1500)
                self.assertTrue(p.locator('#socialCardToggle').is_disabled())
                self.assertEqual(sum(r['method']==method for r in b.wire),1)
                b.stall_requests.clear();p.locator('#socialCardRecheck').click()
                p.wait_for_function("!document.querySelector('#socialCardToggle').disabled")
                self.assertEqual(p.locator('#socialCardToggle').inner_text(),'取消关注' if method=='PUT' else '关注')
                self.assertEqual(sum(r['method']==method for r in b.wire),1)

    def test_stalled_identity_reads_show_startup_recovery(self):
        for path in ['/api/config','/api/me']:
            with self.subTest(path=path):
                b=SocialBackend();b.stall_requests={('GET',path)}
                p=self.open(b,clock=True,seed=True);p.wait_for_timeout(50);p.clock.fast_forward(16000)
                p.locator('#socialStatus.is-error').wait_for(timeout=1500)
                p.locator('#socialBootRetry').wait_for(state='visible',timeout=1500)
                b.stall_requests.clear();p.locator('#socialBootRetry').click();p.locator('#socialActor').wait_for(state='visible')

    def test_pagehide_clears_private_state_and_persisted_restore_rechecks_identity(self):
        for signed_in in [True,False]:
            with self.subTest(signed_in=signed_in):
                b=SocialBackend();b.following=True;b.items=[event(name='OLD_LIFECYCLE')];b.more=True
                p=self.open(b,seed=True);p.locator('#socialFeedMore').wait_for(state='visible')
                p.locator('#socialFollowingCount').wait_for(state='visible')
                me_calls=sum(r['path']=='/api/me' for r in b.wire)
                p.evaluate("dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false}))")
                p.wait_for_timeout(50);self.assertEqual(sum(r['path']=='/api/me' for r in b.wire),me_calls)
                b.stall_requests={('GET','/api/me/social-feed'),('GET','/api/me/follows')}
                p.locator('#socialRefresh').click();p.locator('#socialFollowingRefresh').click();p.wait_for_timeout(50)
                p.evaluate("dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))")
                self.assertEqual(p.locator('#socialFeedList>li').count(),0);self.assertEqual(p.locator('#socialFollowingList>li').count(),0)
                self.assertEqual(p.locator('#socialActor').inner_text(),'');self.assertEqual(p.locator('#socialFollowingCount').inner_text(),'')
                self.assertFalse(p.locator('#socialFeedMore').is_visible());self.assertNotIn('OLD_LIFECYCLE',p.content())
                b.signed_in=signed_in;b.handle='second-human';b.items=[];b.following=False;b.more=False;b.stall_requests.clear()
                p.evaluate("localStorage.setItem('rj_session_selector',JSON.stringify({session_id:'s_'+ 'j'.repeat(32),generation:2}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
                p.locator('#socialFeedEmpty' if signed_in else '#socialGuest').wait_for(state='visible')
                for route in b.held_routes:
                    try:b.reply(route,200,feed([event(name='OLD_LIFECYCLE')]))
                    except Exception as error:
                        if 'closed' not in str(error).lower() and 'cancel' not in str(error).lower():raise
                p.wait_for_timeout(80);self.assertNotIn('OLD_LIFECYCLE',p.content())
                self.assertGreater(sum(r['path']=='/api/me' for r in b.wire),me_calls)

if __name__=='__main__':unittest.main()
