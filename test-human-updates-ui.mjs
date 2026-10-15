import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const friendSource=readFileSync(new URL('./friend-push.js',import.meta.url),'utf8');
const swSource=readFileSync(new URL('./sw.js',import.meta.url),'utf8');
const b64url=bytes=>Buffer.from(bytes).toString('base64url');

function friendRuntime({ios=false,standalone=true,permission='default',stored={}}={}){
  const values=new Map(Object.entries(stored)),calls=[];let asks=0,unsubscribed=0,subscribes=0;
  const oldSub={endpoint:'https://fcm.googleapis.com/old',unsubscribe:async()=>{unsubscribed++;return true;},toJSON(){return{endpoint:this.endpoint,expirationTime:null,keys:{p256dh:'old',auth:'old'}};}};
  const newSub={endpoint:'https://fcm.googleapis.com/new',unsubscribe:async()=>{unsubscribed++;return true;},toJSON(){return{endpoint:this.endpoint,expirationTime:null,keys:{p256dh:'new',auth:'new'}};}};
  let current=stored.existing?oldSub:null;
  const registration={pushManager:{getSubscription:async()=>current,subscribe:async options=>{subscribes++;calls.push({kind:'subscribe',options});current=newSub;return newSub;}}};
  const API={errorOf:r=>r?.data?.error||'api error',post:async(path,body)=>{calls.push({kind:'post',path,body});return{ok:true,data:{device:{id:'hps_new'}}};},del:async(path,body)=>{calls.push({kind:'del',path,body});return{ok:true,data:{device:{active:false}}};}};
  const Notification={permission,requestPermission:async()=>{asks++;return permission==='default'?'granted':permission;}};
  const context={window:null,navigator:{userAgent:ios?'iPhone':'Desktop',platform:ios?'iPhone':'MacIntel',maxTouchPoints:ios?5:0,standalone:standalone,serviceWorker:{register:async(path,options)=>{calls.push({kind:'register',path,options});return registration;},ready:Promise.resolve(registration)}},Notification,PushManager:function(){},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},matchMedia:()=>({matches:standalone}),atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,Promise,Error,Number,String,encodeURIComponent};
  context.window=context;context.window.RJ_API=API;vm.runInNewContext(friendSource,context,{filename:'friend-push.js'});
  return{push:context.RJ_FRIEND_PUSH,calls,values,stats:()=>({asks,unsubscribed,subscribes})};
}

test('permission is never requested on load and iOS requires Home Screen before prompting',async()=>{
  const normal=friendRuntime();assert.equal(normal.stats().asks,0);normal.push.capability();assert.equal(normal.stats().asks,0);
  const ios=friendRuntime({ios:true,standalone:false});await assert.rejects(ios.push.connect({publicKey:'abc',vapidVersion:1}),/加入主屏幕/);assert.equal(ios.stats().asks,0);assert.equal(ios.calls.length,0);
  const denied=friendRuntime({permission:'denied'});await assert.rejects(denied.push.connect({publicKey:'abc',vapidVersion:1}),/系统设置/);assert.equal(denied.calls.length,0);
});

test('direct connect registers root SW and sends only the browser subscription plus explicit account/version guards',async()=>{
  const r=friendRuntime();const key=b64url(new Uint8Array(65).fill(4));
  const data=await r.push.connect({handle:'human',sessionId:'s_'+'a'.repeat(32),preferenceVersion:3,publicKey:key,vapidVersion:2,label:'我的设备'});
  assert.equal(data.device.id,'hps_new');assert.equal(r.stats().asks,1);assert.equal(r.stats().subscribes,1);
  assert.equal(r.calls[0].kind,'register');assert.equal(r.calls[0].path,'/sw.js');assert.equal(r.calls[0].options.scope,'/');
  const post=r.calls.find(x=>x.kind==='post');assert.equal(post.path,'/api/me/updates/devices');assert.equal(post.body.expected_handle,'human');assert.equal(post.body.expected_session_id,'s_'+'a'.repeat(32));assert.equal(post.body.preference_version,3);assert.equal(post.body.vapid_key_version,2);assert.equal(post.body.subscription.endpoint,'https://fcm.googleapis.com/new');
  assert.equal(r.values.get('rj_push_device_id'),'hps_new');assert.equal(r.values.get('rj_push_vapid_version'),'2');assert.equal(JSON.stringify(Object.fromEntries(r.values)).includes('fcm'),false);
});

test('VAPID rotation reports the new subscription before retiring the old server device',async()=>{
  const r=friendRuntime({stored:{existing:true,rj_push_device_id:'hps_old',rj_push_vapid_version:'1'}});const key=b64url(new Uint8Array(65).fill(4));
  await r.push.connect({handle:'human',sessionId:'s_'+'a'.repeat(32),preferenceVersion:4,publicKey:key,vapidVersion:2,label:null});
  assert.equal(r.stats().unsubscribed,1);assert.equal(r.stats().subscribes,1);
  const post=r.calls.findIndex(x=>x.kind==='post'),del=r.calls.findIndex(x=>x.kind==='del');assert.ok(post>=0&&del>post);assert.match(r.calls[del].path,/hps_old$/);
});

function swRuntime(){
  const handlers={},notifications=[],fetches=[],opened=[];
  const self={indexedDB:null,location:{origin:'https://renji.love'},registration:{showNotification:async(title,options)=>{notifications.push({title,options});}},addEventListener:(name,handler)=>{handlers[name]=handler;}};
  const clients={matchAll:async()=>[],openWindow:async path=>{opened.push(path);return{};}};
  const context={self,clients,fetch:async(url,init)=>{fetches.push({url,init});return{ok:true,status:200};},URL,Set,Promise,Date,Error,RegExp,String,Array,Object,encodeURIComponent};
  vm.runInNewContext(swSource,context,{filename:'sw.js'});return{handlers,notifications,fetches,opened};
}
const payload={version:1,event_id:'ue_test',kind:'kanread_published',tag:'ue_test',title:'新精读',body:'已经公开。',route_key:'kanread',route_ref:'kr-test',display_receipt:'rj_pd_'+'a'.repeat(60),click_receipt:'rj_pc_'+'b'.repeat(60)};
async function push(runtime,value){let work;runtime.handlers.push({data:{json:()=>value},waitUntil:p=>{work=p;}});await work;}

test('service worker shows once, retries display receipt on duplicate, and opens only a closed route',async()=>{
  const r=swRuntime();await push(r,payload);assert.equal(r.notifications.length,1);assert.equal(r.notifications[0].title,'新精读');assert.equal(r.fetches[0].url,'https://api.renji.love/api/human-update-receipts/display');assert.equal(r.fetches[0].init.credentials,'omit');assert.equal(r.fetches[0].init.redirect,'error');
  await push(r,payload);assert.equal(r.notifications.length,1);assert.equal(r.fetches.filter(x=>x.url.endsWith('/display')).length,2);
  let work,closed=false;r.handlers.notificationclick({notification:{data:r.notifications[0].options.data,close(){closed=true;}},waitUntil:p=>{work=p;}});await work;assert.equal(closed,true);assert.deepEqual(r.opened,['/kanread.html#kr-test']);assert.equal(r.fetches.at(-1).url,'https://api.renji.love/api/human-update-receipts/click');
});

test('service worker rejects extra fields, external-looking refs and wrong receipt capabilities',async()=>{
  const r=swRuntime();await push(r,{...payload,url:'https://evil.test'});await push(r,{...payload,event_id:'bad/id'});await push(r,{...payload,display_receipt:'rj_pc_'+'a'.repeat(60)});assert.equal(r.notifications.length,0);assert.equal(r.fetches.length,0);
});
