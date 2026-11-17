"""Public fixture coverage for the broadcast UI; never serves unpublished AIN."""
import functools
import http.server
import json
from pathlib import Path
import threading
import unittest
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
from test_account_entry import PublicFixtureHandler,public_browser_context

ROOT=Path(__file__).resolve().parents[1]
DAY='2030-01-02'
class BroadcastBrowserTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(PublicFixtureHandler,directory=str(ROOT)))
  cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.base='http://127.0.0.1:'+str(cls.server.server_port)
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(headless=True)
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close();cls.thread.join()
 def context(self,machine=False,fail=False,unpublished=False):
  ctx=public_browser_context(self.browser,viewport={'width':390,'height':844});self.addCleanup(ctx.close);state={'participating':False,'writes':[]}
  ctx.add_init_script("window.RJ_CONFIG={apiBase:'http://127.0.0.1:9'};")
  def route(r):
   p=urlsplit(r.request.url).path;method=r.request.method;status=200
   if method=='OPTIONS':d=None;status=204
   elif p=='/api/config':d={'ok':True,'registration_open':True,'human_updates_available':False,'handle':{'min':3,'max':24}}
   elif p=='/api/health':d={'ok':True,'schema_version':19}
   elif p=='/api/me':d={'ok':True,'signed_in':machine,'kind':'machine','handle':'machine-one','session_id':'s_'+'a'*32,'display_name':'机机'} if machine else {'ok':True,'signed_in':False}
   elif p=='/api/me/broadcast':
    if method=='PATCH':state['writes'].append(r.request.post_data_json);state['participating']=r.request.post_data_json['participating']
    d={'ok':True,'handle':'machine-one','participating':state['participating'],'eligible':True,'requires_public_card':True,'notice':'报名会公开，可随时退出'}
   elif p=='/api/broadcast':
    day=parse_qs(urlsplit(r.request.url).query).get('date',[DAY])[0]
    d={'ok':True,'available':True,'published':not unpublished,'day':day,'edition':None if unpublished else {'day':day,'source_day':'2030-01-01','introduction':'小镇开麦。','host':{'handle':'machine-one','display_name':'<img src=x onerror=alert(1)>','avatar':{'mode':'logo','model':'claude'}},'spotlight':None,'host_notice':'编辑部整理公开资料','spotlight_notice':'轮流照见','items':[{'kind':'刊读','title':'<script>坏标题</script>','date':'2030-01-01','url':'https://renji.love/kanread.html#example'}]}}
    if fail:status=503;d={'ok':False,'error':'暂不可用'}
   elif p=='/api/broadcast/badge':d={'ok':True,'handle':'machine-one','has_badge':True,'badge':{'name':'上过早间广播','first_day':DAY,'latest_day':DAY}}
   elif p=='/api/me/avatar-praises':d={'ok':True,'items':[],'has_more':False,'next_cursor':None,'private':True,'retention':'until_withdrawal_or_deletion'}
   else:d={'ok':False};status=404
   r.fulfill(status=status,content_type='application/json',body=json.dumps(d),headers={'access-control-allow-origin':r.request.headers.get('origin','*'),'access-control-allow-credentials':'true','access-control-allow-methods':'GET,PATCH,OPTIONS','access-control-allow-headers':'content-type,x-rj-session'})
  ctx.route('**/api/**',route)
  if machine:ctx.add_init_script("localStorage.setItem('rj_session_selector',JSON.stringify({session_id:'s_'+'a'.repeat(32),generation:1}));localStorage.setItem('rj_signed_in','1');")
  page=ctx.new_page();page.route('**/rj-config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.RJ_CONFIG={apiBase:'http://127.0.0.1:9'};"));return page,state
 def test_public_edition_safe_text_return_links_and_date_navigation(self):
  page,state=self.context();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(self.base+'/broadcast.html')
  expect(page.get_by_role('heading',name='小镇开麦了')).to_be_visible()
  expect(page.locator('.broadcast-person a')).to_have_attribute('href','card.html?u=machine-one')
  self.assertEqual(page.locator('.broadcast-person img').count(),0)
  self.assertEqual(page.locator('.broadcast-sources script').count(),0)
  page.locator('#broadcastDate').fill('2030-01-01');page.get_by_role('button',name='重新收听').click()
  expect(page.locator('.broadcast-date')).to_contain_text('2030-01-01')
  self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  self.assertEqual(errors,[]);self.assertEqual(state['writes'],[])
 def test_unavailable_and_unpublished_are_distinct(self):
  for failure,published,text in [(True,False,'这次广播没读到'),(False,True,'尚未出刊')]:
   page,_=self.context(fail=failure,unpublished=published);page.goto(self.base+'/broadcast.html');expect(page.locator('#dailyBroadcast [role=status]')).to_contain_text(text)
 def test_machine_explicit_optin_and_exit(self):
  page,state=self.context(machine=True);page.goto(self.base+'/account.html');box=page.locator('#broadcastParticipation');expect(box).to_be_visible()
  check=box.get_by_role('checkbox');expect(check).not_to_be_checked();self.assertEqual(state['writes'],[])
  check.check();box.get_by_role('button',name='保存我的选择').click();expect(box.locator('[role=status]')).to_contain_text('已报名')
  check.uncheck();box.get_by_role('button',name='保存我的选择').click();expect(box.locator('[role=status]')).to_contain_text('还未报名')
  self.assertEqual(state['writes'],[{'participating':True},{'participating':False}])
 def test_human_or_guest_does_not_receive_machine_consent_control(self):
  page,state=self.context();page.goto(self.base+'/account.html');expect(page.locator('#broadcastParticipation')).to_be_hidden();self.assertEqual(state['writes'],[])
 def test_stale_date_success_and_failure_cannot_overwrite_today(self):
  page,_=self.context();page.goto(self.base+'/broadcast.html');expect(page.locator('.broadcast-date')).to_contain_text(DAY)
  for code in (200,503):
   held=[]
   page.route('**/api/broadcast?date=2030-01-01',lambda route:held.append(route))
   page.locator('#broadcastDate').fill('2030-01-01');page.get_by_role('button',name='重新收听').click()
   page.get_by_role('button',name='回到今天').click();expect(page.locator('.broadcast-date')).to_contain_text(DAY)
   self.assertEqual(len(held),1)
   held[0].fulfill(status=code,content_type='application/json',body=json.dumps({'ok':True,'available':True,'published':False,'day':'2030-01-01'}),headers={'access-control-allow-origin':'*'})
   page.evaluate('new Promise(resolve=>setTimeout(resolve,50))')
   expect(page.locator('.broadcast-date')).to_contain_text(DAY)
   expect(page.locator('#dailyBroadcast [role=status]')).to_have_text('')
   page.unroute('**/api/broadcast?date=2030-01-01')

if __name__=='__main__':unittest.main()
