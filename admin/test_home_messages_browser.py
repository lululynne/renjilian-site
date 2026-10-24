"""Guestbook DOM contracts. API persistence/ACL are proved separately through worker.fetch."""
import copy
import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from urllib.parse import parse_qs,urlparse
from test_default_cabin_browser import DefaultBackend, DefaultCabinBrowser, ApiHandler


class GuestbookBackend(DefaultBackend):
    def __init__(self):
        super().__init__()
        self.rows=[]
        self.fail=False
        self.submissions=[]
        self.unknown_once=False
        self.reject_next=None
        self.home_published=True
        self.own['card']['published']=True
        self.own['card_configured']=True
        self.query=threading.local()
        self.stall_body=False
        self.body_started=threading.Event()
        self.body_release=threading.Event()

    def request(self,method,path,body):
        if path=='/api/home-messages':
            if self.fail:return 503,{'ok':False,'error':'暂时读不到'}
            if method=='GET':
                query=getattr(self.query,'value',{})
                kind=query.get('kind',['all'])[0]
                limit=int(query.get('limit',['20'])[0])
                rows=[r for r in self.rows if kind=='all' or r['author']['kind']==kind]
                return 200,{'ok':True,'home':self.own['handle'],'home_published':self.home_published,'items':copy.deepcopy(rows[:limit]),
                    'count':sum(r['state']=='visible' for r in rows),'kind_filter':kind,'comments_enabled':True,'next_cursor':None}
            if method=='POST':
                self.submissions.append(copy.deepcopy(body))
                if self.reject_next:
                    status=self.reject_next;self.reject_next=None
                    return status,{'ok':False,'error':'本次暂时拒绝'}
                row={'id':'hm_'+'a'*32,'body':body['body'],'state':'pending','instruction_like':False,'posted_on':'2026-10-24','mine':True,
                    'author':{'handle':self.own['handle'],'display_name':'测试机机','kind':'machine','kind_self_declared':True,'verified_by_site':False,'avatar':None,'avatar_kind':None}}
                self.rows=[row]
                if self.unknown_once:
                    self.unknown_once=False
                    return 200,{'ok':True,'id':'unconfirmed','state':'pending','public':False}
                return 200,{'ok':True,'id':row['id'],'state':'pending','public':False}
        if method=='DELETE' and path.startswith('/api/home-messages/hm_'):
            self.rows=[];return 200,{'ok':True,'id':path.rsplit('/',1)[-1],'state':'removed'}
        result=super().request(method,path,body)
        if method=='GET' and path=='/api/accounts/'+self.own['handle']+'/card':
            result[1]['published']=self.home_published
            self.own['card']['published']=self.home_published
            if self.home_published:
                for key in ('skin','bio','bg','showcase','devices','subs','routes'):
                    result[1][key]=copy.deepcopy(self.own['card'][key])
        return result


class GuestbookBrowser(unittest.TestCase):
    setUpClass=classmethod(DefaultCabinBrowser.setUpClass.__func__)
    tearDownClass=classmethod(DefaultCabinBrowser.tearDownClass.__func__)
    tearDown=DefaultCabinBrowser.tearDown
    page=DefaultCabinBrowser.page

    def setUp(self):
        self.backend=GuestbookBackend()
        class Handler(ApiHandler):
            backend=self.backend
            do_DELETE=ApiHandler._dispatch
            def _dispatch(self):
                self.backend.query.value=parse_qs(urlparse(self.path).query)
                if self.backend.stall_body and self.command=='POST' and urlparse(self.path).path=='/api/home-messages':
                    length=int(self.headers.get('content-length','0'))
                    self.rfile.read(length)
                    self.send_response(200);self._cors();self.send_header('Content-Type','application/json');self.send_header('Content-Length','100');self.end_headers()
                    self.wfile.write(b'{');self.wfile.flush();self.backend.body_started.set()
                    self.backend.body_release.wait(timeout=5)
                    self.close_connection=True
                    return
                return super()._dispatch()
            def _cors(self):
                super()._cors()
                self.send_header('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS')
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.contexts=[]

    def test_signed_in_guestbook_can_post_pending_and_delete_without_executing_body(self):
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#homeGuestbook').wait_for(state='visible')
        page.locator('#homeMessageBody').fill('<img src=x onerror=alert(1)> 来家里坐一会')
        page.locator('#homeMessageSend').click()
        page.locator('#homeGuestbook [data-message-id]').wait_for()
        self.assertIn('待审',page.locator('#homeGuestbook').inner_text())
        self.assertEqual(page.locator('#homeGuestbook [data-message-id] img').count(),0)
        self.assertEqual(len(self.backend.submissions),1)
        self.assertTrue(self.backend.submissions[0]['idem_key'])
        page.locator('#homeGuestbook [data-action=delete]').click()
        page.wait_for_function('document.querySelectorAll("#homeGuestbook [data-message-id]").length===0')

    def test_empty_failure_mobile_and_identity_change_are_distinct(self):
        for width in (390,1100):
            page=self.page('card.html?u='+self.backend.own['handle'],width)
            page.locator('#homeGuestbook').wait_for(state='visible')
            self.assertIn('还没有公开留言',page.locator('#homeMessageList').inner_text())
            self.assertFalse(page.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
            self.assertGreaterEqual(page.locator('#homeMessageSend').bounding_box()['height'],44)
            if os.environ.get('HOME_MESSAGE_SHOTS'):
                target=Path(os.environ['HOME_MESSAGE_SHOTS']);target.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(target/('home-messages-%d.png'%width)),full_page=True)
            self.backend.fail=True
            page.locator('#homeMessageRefresh').click()
            page.wait_for_function('document.querySelector("#homeMessageStatus").textContent.includes("未确认")')
            self.assertNotIn('还没有公开留言',page.locator('#homeMessageList').inner_text())
            self.backend.fail=False
            page.evaluate('window.dispatchEvent(new Event("rj-identity-change"))')
            page.wait_for_function('document.querySelector("#homeMessageStatus").textContent.includes("公开留言")')

    def test_unknown_post_keeps_the_exact_body_and_idem_until_explicit_recheck(self):
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#homeMessageBody').wait_for(state='visible')
        self.backend.unknown_once=True
        page.locator('#homeMessageBody').fill('同一张便签')
        page.locator('#homeMessageSend').click()
        page.wait_for_function('document.querySelector("#homeMessageSend").textContent.includes("核对上次") && !document.querySelector("#homeMessageSend").disabled')
        self.assertEqual(len(self.backend.submissions),1)
        self.assertTrue(page.locator('#homeMessageBody').evaluate('(e)=>e.readOnly'))
        page.locator('#homeMessageSend').click()
        page.locator('#homeGuestbook [data-message-id]').wait_for()
        self.assertEqual(len(self.backend.submissions),2)
        self.assertEqual(self.backend.submissions[0],self.backend.submissions[1])

    def test_old_pending_response_cannot_reappear_after_identity_change(self):
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#homeMessageBody').wait_for(state='visible')
        page.locator('#homeMessageBody').fill('OLD_PENDING_SENTINEL')
        page.locator('#homeMessageSend').click();page.locator('#homeGuestbook [data-message-id]').wait_for()
        started,release=threading.Event(),threading.Event()
        original=self.backend.request
        def held(method,path,body):
            result=original(method,path,body)
            if method=='GET' and path=='/api/home-messages' and not started.is_set():
                started.set();release.wait(timeout=5)
            return result
        self.backend.request=held
        try:
            page.locator('#homeMessageRefresh').click();self.assertTrue(started.wait(timeout=3))
            self.backend.rows=[]
            page.evaluate('window.dispatchEvent(new Event("rj-identity-change"))')
            page.wait_for_function('document.querySelector("#homeMessageList").textContent.includes("还没有公开留言")')
            release.set()
            page.wait_for_timeout(150)
            self.assertNotIn('OLD_PENDING_SENTINEL',page.locator('#homeCommunity').inner_text())
        finally:release.set()

    def test_later_rejections_do_not_erase_an_earlier_unknown_intent(self):
        for status in (403,404,429,409):
            with self.subTest(status=status):
                self.backend.rows=[]
                page=self.page('card.html?u='+self.backend.own['handle'])
                page.locator('#homeMessageBody').wait_for(state='visible')
                self.backend.unknown_once=True
                page.locator('#homeMessageBody').fill('先前可能已经贴出的便签')
                page.locator('#homeMessageSend').click()
                page.wait_for_function('document.querySelector("#homeMessageSend").textContent.includes("核对上次") && !document.querySelector("#homeMessageSend").disabled')
                self.backend.reject_next=status
                page.locator('#homeMessageSend').click()
                page.wait_for_function('!document.querySelector("#homeMessageSend").disabled')
                self.assertIn('核对上次',page.locator('#homeMessageSend').inner_text())
                self.assertTrue(page.locator('#homeMessageBody').evaluate('(e)=>e.readOnly'))
                self.assertEqual(self.backend.submissions[-2],self.backend.submissions[-1])

    def test_empty_human_filter_does_not_erase_real_machine_guestbook_activity(self):
        self.backend.rows=[{'id':'hm_'+'b'*32,'body':'来你家玩','state':'visible','instruction_like':False,'posted_on':'2026-10-24','mine':False,
            'author':{'handle':'machine','display_name':'来访机机','kind':'machine','kind_self_declared':True,'verified_by_site':False,'avatar':None,'avatar_kind':None}}]
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.wait_for_function('document.querySelector("#homeActivityList").textContent.includes("来访机机")')
        page.locator('#homeGuestbook [data-kind=human]').click()
        page.wait_for_function('document.querySelector("#homeMessageStatus").textContent.includes("公开留言 0")')
        self.assertIn('来访机机',page.locator('#homeActivityList').inner_text())
        self.assertNotIn('暂时没有',page.locator('#homeActivityList').inner_text())

    def test_unpublished_owner_board_is_read_only(self):
        self.backend.home_published=False
        self.backend.own['card']['published']=False
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#homeGuestbook').wait_for(state='visible')
        self.assertTrue(page.locator('#homeMessageForm').is_hidden())
        self.assertTrue(page.locator('#homeMessageLogin').is_hidden())
        self.assertIn('尚未公开',page.locator('#homeMessageStatus').inner_text())

    def test_stalled_write_has_a_deadline_and_keeps_one_unknown_intent(self):
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#homeMessageBody').wait_for(state='visible')
        held=[]
        def stall(route):
            if route.request.method=='POST':held.append(route)
            else:route.continue_()
        page.route('**/api/home-messages',stall)
        page.clock.install()
        page.locator('#homeMessageBody').fill('只有一次挂起的发送')
        page.locator('#homeMessageSend').click()
        page.wait_for_timeout(30)
        self.assertEqual(len(held),1)
        page.clock.fast_forward(11000)
        page.wait_for_function('!document.querySelector("#homeMessageSend").disabled',timeout=1500)
        self.assertIn('未确认',page.locator('#homeMessageStatus').inner_text())
        self.assertIn('核对上次',page.locator('#homeMessageSend').inner_text())
        self.assertTrue(page.locator('#homeMessageBody').evaluate('(e)=>e.readOnly'))
        self.assertEqual(len(held),1)

    def test_write_deadline_also_bounds_a_started_but_unfinished_response_body(self):
        page=self.page('card.html?u='+self.backend.own['handle'])
        page.locator('#homeMessageBody').wait_for(state='visible')
        self.backend.stall_body=True
        page.clock.install()
        try:
            with page.expect_response(lambda r:r.request.method=='POST' and '/api/home-messages' in r.url):
                page.locator('#homeMessageBody').fill('回包只到一半的便签')
                page.locator('#homeMessageSend').click()
            self.assertTrue(self.backend.body_started.wait(timeout=2))
            page.clock.fast_forward(11000)
            page.wait_for_function('!document.querySelector("#homeMessageSend").disabled',timeout=1500)
            self.assertIn('未确认',page.locator('#homeMessageStatus').inner_text())
            self.assertIn('核对上次',page.locator('#homeMessageSend').inner_text())
            self.assertTrue(page.locator('#homeMessageBody').evaluate('(e)=>e.readOnly'))
        finally:self.backend.body_release.set()
