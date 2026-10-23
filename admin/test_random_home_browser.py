"""Random outing controls in the current card page; local HTTP fixture only."""
import functools
import copy
import http.server
import json
import os
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright
from test_card_review_browser import ApiHandler, QuietSite
from test_card_private_view_browser import PrivateCardBackend

ROOT = Path(__file__).resolve().parents[1]


class Backend(PrivateCardBackend):
    def __init__(self):
        super().__init__('anonymous')
        self.random = {'ok': True, 'available': True, 'found': False, 'home': None}
        self.code = 200
        self.public_cabin = False

    def request(self, method, path, body):
        if method == 'GET' and self.public_cabin and path == '/api/accounts/' + self.own['handle'] + '/card':
            self.calls.append((method,path))
            card=copy.deepcopy(self.own['card'])
            return 200, {**card, 'ok':True, 'handle':self.own['handle'], 'kind':'machine', 'display_name':'Fixture cabin',
                         'published':True, 'skin':'cabin', 'bio':'Synthetic public cabin description', 'family':[], 'badges':[], 'stats':self.own['stats']}
        if method == 'GET' and path.startswith('/api/homes/random'):
            self.calls.append((method, path))
            return self.code, self.random
        return super().request(method, path, body)


class RandomHomeBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietSite, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def setUp(self):
        self.backend = Backend()
        handler = type('OutingApi', (ApiHandler,), {'backend': self.backend})
        self.api = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        self.api_thread = threading.Thread(target=self.api.serve_forever, daemon=True)
        self.api_thread.start()

    def tearDown(self):
        self.api.shutdown()
        self.api.server_close()
        self.api_thread.join(timeout=3)

    def page(self, width=390):
        context = self.browser.new_context(viewport={'width': width, 'height': 900})
        self.addCleanup(context.close)
        page = context.new_page()
        page.set_default_timeout(6000)
        from urllib.parse import quote
        url = 'http://127.0.0.1:%d/card.html?u=' % self.server.server_port + self.backend.own['handle'] + '&api=' + quote('http://127.0.0.1:%d' % self.api.server_port, safe='')
        page.goto(url, wait_until='networkidle')
        page.locator('#hero').wait_for(state='visible')
        page.locator('#homeOuting button').scroll_into_view_if_needed()
        return page

    def test_empty_errors_keyboard_and_two_widths(self):
        for width in (390, 1100):
            with self.subTest(width=width):
                page = self.page(width)
                button = page.locator('#homeOuting button')
                button.focus()
                page.keyboard.press('Enter')
                page.wait_for_function("document.querySelector('#homeOuting [role=status]').textContent.includes('没有其他')")
                self.assertGreaterEqual(button.bounding_box()['height'], 44)
                self.assertFalse(page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
                for code in (401, 503):
                    self.backend.code = code
                    button.click()
                    expected = '登录身份尚未确认' if code == 401 else '不代表没有'
                    page.wait_for_function('(word)=>document.querySelector("#homeOuting [role=status]").textContent.includes(word)', arg=expected)
                    self.assertTrue(button.is_enabled())
                    self.assertIn('u='+self.backend.own['handle'], page.url)
                self.backend.code = 200
                self.backend.random = {'ok': True, 'available': True, 'found': True, 'home': {'handle': '../not-a-door'}}
                button.click()
                page.wait_for_function("document.querySelector('#homeOuting [role=status]').textContent.includes('尚未确认')")
                self.backend.random = {'ok': True, 'available': True, 'found': False, 'home': None}

    def test_public_cabin_and_road_sign_share_the_real_page_at_two_widths(self):
        self.backend.public_cabin=True
        for width in (390,1100):
            page=self.page(width)
            page.locator('#hero [data-skin=cabin]').wait_for(state='visible')
            self.assertIn('Synthetic public cabin description',page.locator('#hero').inner_text())
            self.assertFalse(page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
            if os.environ.get('RANDOM_HOME_SHOTS'):
                dest=Path(os.environ['RANDOM_HOME_SHOTS']);dest.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(dest / ('random-home-cabin-%d.png' % width)),full_page=True)

    def test_positive_choice_only_navigates_to_a_canonical_door(self):
        self.backend.random = {'ok': True, 'available': True, 'found': True, 'home': {'handle': 'public-home'}}
        page = self.page()
        page.locator('#homeOuting button').click()
        page.wait_for_url('**/card.html?u=public-home*')
        self.assertIn('&api=',page.url)
        self.assertEqual(sum('/api/homes/random' in path for _,path in self.backend.calls),1)
        self.assertTrue(all(method=='GET' or path=='/api/visits' for method,path in self.backend.calls))

    def test_identity_pagehide_and_bfcache_fence_late_choices_without_replay(self):
        for event in ("new CustomEvent('rj-identity-change')", "new PageTransitionEvent('pagehide')"):
            with self.subTest(event=event):
                page=self.page()
                calls=[]
                def late(route):
                    calls.append(route.request.url)
                    page.evaluate("document.querySelector('#homeOuting button').click(); window.dispatchEvent("+event+")")
                    route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'available':True,'found':True,'home':{'handle':'public-home'}}))
                page.route('**/api/homes/random*',late)
                page.locator('#homeOuting button').click()
                page.wait_for_timeout(100)
                self.assertEqual(len(calls),1)
                self.assertIn('u='+self.backend.own['handle'],page.url)
                page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
                self.assertTrue(page.locator('#homeOuting button').is_enabled())
                self.assertEqual(len(calls),1)


if __name__ == '__main__':
    unittest.main()
