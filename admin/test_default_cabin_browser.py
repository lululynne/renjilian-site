"""Confirmed server defaults reach existing editor/home paths, not generic fallbacks."""
import copy
import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from test_card_review_browser import ApiHandler, QuietSite, ReviewBackend, machine_own, human_own

ROOT=Path(__file__).resolve().parents[1]


class DefaultBackend(ReviewBackend):
    def __init__(self):
        super().__init__('machine')
        self.viewer='owner'
        self.configure('machine','cabin',False)

    def configure(self,kind,skin,configured):
        self.kind=kind;self.own=machine_own() if kind=='machine' else human_own()
        self.own['card_configured']=configured
        self.own['card'].update(skin=skin,published=False)
        if not configured:
            self.own['card'].update(bio=None,bg={'preset':None,'photo':None},devices=[],subs=[],routes=[],showcase=[],rel=None,titles=[],my_call=None)
            if kind=='machine':self.own['card']['avatar']={'mode':'logo','model':None,'head':None,'face':None,'neck':None,'character':None}

    def request(self,method,path,body):
        if method=='GET' and path=='/api/me' and self.viewer=='anonymous':
            self.calls.append((method,path,body));return 200,{'ok':True,'signed_in':False}
        if method=='GET' and path=='/api/accounts/'+self.own['handle']+'/card':
            self.calls.append((method,path,body))
            a=self.own['card']['avatar']
            avatar={k:copy.deepcopy(a.get(k)) for k in (['mode','model','head','face','neck'] if self.kind=='machine' else ['photo','face_color'])}
            return 200,{'ok':True,'handle':self.own['handle'],'kind':self.kind,'display_name':self.own['display_name'],
                        'published':False,'card':None,'avatar':avatar,'stats':self.own['stats'],'badges':[], 'family':[], 'is_me':self.viewer=='owner'}
        return super().request(method,path,body)


class DefaultCabinBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site_server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietSite,directory=str(ROOT)))
        cls.site_thread=threading.Thread(target=cls.site_server.serve_forever,daemon=True);cls.site_thread.start()
        cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.site_server.shutdown();cls.site_server.server_close();cls.site_thread.join(timeout=3)

    def setUp(self):
        self.backend=DefaultBackend();handler=type('DefaultApi',(ApiHandler,),{'backend':self.backend})
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.contexts=[]

    def tearDown(self):
        for context in self.contexts:context.close()
        self.server.shutdown();self.server.server_close();self.thread.join(timeout=3)

    def page(self,route,width=390):
        context=self.browser.new_context(viewport={'width':width,'height':900});self.contexts.append(context)
        page=context.new_page();page.set_default_timeout(6000)
        join='&' if '?' in route else '?'
        page.goto('http://127.0.0.1:%d/'%self.site_server.server_port+route+join+'api='+quote('http://127.0.0.1:%d'%self.server.server_port,safe=''),wait_until='networkidle')
        return page

    def test_confirmed_unsaved_machine_cabin_reaches_editor_and_private_home_at_two_widths(self):
        for width in [390,1100]:
            with self.subTest(width=width):
                editor=self.page('card-edit.html',width)
                editor.locator('.tabs').wait_for(state='visible')
                editor.locator('#pv [data-skin=cabin]').wait_for(state='attached')
                editor.locator('.tabs button').last.click()
                self.assertEqual(editor.locator('[data-style=cabin]').get_attribute('aria-pressed'),'true')
                self.assertTrue(editor.locator('#app [data-style]').evaluate_all(
                    'xs=>xs.length===4&&xs.every(x=>{let r=x.getBoundingClientRect();return r.width>=44&&r.height>=44})'))
                editor.locator('#app .big [data-skin=cabin]').wait_for(state='visible')
                self.assertFalse(editor.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
                home=self.page('card.html?u='+self.backend.own['handle'],width)
                home.locator('#hero [data-skin=cabin]').wait_for(state='visible')
                self.assertIn('仅本人可见',home.locator('#hero').inner_text())
                self.assertFalse(home.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
                if os.environ.get('DEFAULT_CABIN_SHOTS'):
                    target=Path(os.environ['DEFAULT_CABIN_SHOTS']);target.mkdir(exist_ok=True,parents=True)
                    home.screenshot(path=str(target/('default-machine-home-%d.png'%width)),full_page=True)
        self.assertEqual(self.backend.patches,[]);self.assertEqual(self.backend.previews,[]);self.assertEqual(self.backend.confirms,[])

    def test_human_and_every_saved_machine_skin_keep_the_explicit_server_choice(self):
        cases=[('human','polaroid',False)]+[('machine',skin,True) for skin in ['polaroid','rpg','holder','cabin']]
        for kind,skin,configured in cases:
            with self.subTest(kind=kind,skin=skin):
                self.backend.configure(kind,skin,configured)
                page=self.page('card-edit.html',1100)
                page.locator('.tabs').wait_for(state='visible');page.locator('.tabs button').last.click()
                self.assertEqual(page.locator('[data-style="'+skin+'"]').get_attribute('aria-pressed'),'true')
                page.locator('#pv [data-skin="'+skin+'"]').wait_for(state='visible')
        self.assertEqual(self.backend.patches,[]);self.assertEqual(self.backend.previews,[]);self.assertEqual(self.backend.confirms,[])

    def test_anonymous_unpublished_door_keeps_its_existing_redacted_fallback(self):
        self.backend.viewer='anonymous'
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#hero .empty-house').wait_for(state='visible')
        self.assertEqual(page.locator('#hero [data-skin=cabin]').count(),0)
        self.assertNotIn(('GET','/api/me/card',None),self.backend.calls)


if __name__=='__main__':unittest.main()
