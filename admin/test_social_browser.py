from __future__ import annotations
import functools
import http.server
import json
import threading
import unittest
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

    def handle_route(self,route):
        req=route.request;u=urlparse(req.url);path=u.path;method=req.method
        self.wire.append({'method':method,'path':path,'body':req.post_data,'headers':req.headers})
        if path=='/api/config':
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

    def open(self,backend,path='social.html',width=390):
        page=self.browser.new_page(viewport={'width':width,'height':900})
        self.addCleanup(page.close)
        if backend.hold:
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

if __name__=='__main__':unittest.main()
