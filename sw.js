/* 第二人称通知 Service Worker：只处理 push 与 notificationclick；没有 fetch handler 或预缓存。 */
(function(){
  "use strict";
  var API_ORIGIN="https://api.renji.love",DB_NAME="rj-push-dedupe",STORE="shown",MAX_AGE=7*86400000,MAX_MEMORY=100;
  var memory=[];
  var ROUTES=new Set(["account_updates","card","kanread","pulse","reset_claude","reset_codex","reset_grok"]);
  var KINDS=new Set(["machine_comment_published","machine_card_published","kanread_published","pulse_published","reset_published","device_test"]);
  function exact(value,keys){return value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.slice().sort().join(",");}
  function safeId(value,max){return typeof value==="string"&&new RegExp("^[A-Za-z0-9][A-Za-z0-9_-]{0,"+(max-1)+"}$").test(value);}
  function payload(value){
    var keys=["version","event_id","kind","tag","title","body","route_key","route_ref","display_receipt","click_receipt"];
    if(!exact(value,keys)||value.version!==1||!safeId(value.event_id,240)||value.tag!==value.event_id||!KINDS.has(value.kind)||!ROUTES.has(value.route_key)||typeof value.title!=="string"||!value.title||value.title.length>160||typeof value.body!=="string"||value.body.length>300||!(value.route_ref===null||safeId(value.route_ref,96))||!/^rj_pd_[a-km-np-z2-9]{60}$/.test(value.display_receipt)||!/^rj_pc_[a-km-np-z2-9]{60}$/.test(value.click_receipt))return null;
    return value;
  }
  function route(value){
    var ref=safeId(value.route_ref,96)?encodeURIComponent(value.route_ref):"";
    if(value.route_key==="account_updates")return"/account.html#updates";
    if(value.route_key==="card"&&ref)return"/card.html?u="+ref;
    if(value.route_key==="kanread"&&ref)return"/kanread.html#"+ref;
    if(value.route_key==="pulse"&&ref)return"/pulse.html#"+ref;
    if(value.route_key==="reset_claude")return"/codex.html#claude-board";
    if(value.route_key==="reset_codex")return"/codex.html#codex-board";
    if(value.route_key==="reset_grok")return"/codex.html#grok-board";
    return null;
  }
  function receipt(kind,token){return fetch(API_ORIGIN+"/api/human-update-receipts/"+kind,{method:"POST",mode:"cors",credentials:"omit",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",headers:{authorization:"Bearer "+token}}).then(function(response){if(!response.ok&&response.status!==409)throw new Error("receipt");});}
  function openDB(){return new Promise(function(resolve,reject){if(!self.indexedDB){reject(new Error("no-idb"));return;}var request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=function(){request.result.createObjectStore(STORE,{keyPath:"id"});};request.onsuccess=function(){resolve(request.result);};request.onerror=request.onblocked=function(){reject(request.error||new Error("idb"));};});}
  function idbGet(id){return openDB().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(STORE,"readonly"),request=tx.objectStore(STORE).get(id);request.onsuccess=function(){resolve(!!request.result);};request.onerror=function(){reject(request.error);};tx.oncomplete=function(){db.close();};});});}
  function idbPut(id){return openDB().then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),now=Date.now(),kept=[];store.put({id:id,at:now});var cursor=store.openCursor();cursor.onsuccess=function(){var value=cursor.result;if(!value){kept.sort(function(a,b){return b.at-a.at;}).slice(MAX_MEMORY).forEach(function(row){store.delete(row.id);});return;}if(value.value.at<now-MAX_AGE)value.delete();else kept.push(value.value);value.continue();};tx.oncomplete=function(){db.close();resolve();};tx.onerror=tx.onabort=function(){db.close();reject(tx.error);};});});}
  function memoryHas(id){return memory.indexOf(id)>=0;}
  function memoryPut(id){if(!memoryHas(id))memory.push(id);while(memory.length>MAX_MEMORY)memory.shift();}
  function wasShown(id){return idbGet(id).catch(function(){return memoryHas(id);});}
  function remember(id){memoryPut(id);return idbPut(id).catch(function(){});}
  function handlePush(event){
    var value;try{value=payload(event.data&&event.data.json());}catch(e){value=null;}if(!value)return Promise.resolve();
    return wasShown(value.event_id).then(function(duplicate){
      if(duplicate)return receipt("display",value.display_receipt).catch(function(){});
      return self.registration.showNotification(value.title,{body:value.body,tag:value.tag,icon:"/img/app/icon-192.png",badge:"/img/app/icon-192.png",renotify:false,data:{event_id:value.event_id,route_key:value.route_key,route_ref:value.route_ref,click_receipt:value.click_receipt}}).then(function(){return remember(value.event_id);}).then(function(){return receipt("display",value.display_receipt).catch(function(){});});
    });
  }
  function navigate(path){return clients.matchAll({type:"window",includeUncontrolled:true}).then(function(windows){var own=windows.find(function(client){try{return new URL(client.url).origin===self.location.origin;}catch(e){return false;}});if(own){var moved=typeof own.navigate==="function"?own.navigate(path):Promise.resolve(own);return Promise.resolve(moved).then(function(client){return(client||own).focus();});}return clients.openWindow(path);});}
  self.addEventListener("push",function(event){event.waitUntil(handlePush(event));});
  self.addEventListener("notificationclick",function(event){event.notification.close();var data=event.notification.data||{},path=route(data);if(!path||!safeId(data.event_id,240)||!/^rj_pc_[a-km-np-z2-9]{60}$/.test(data.click_receipt||""))return;event.waitUntil(Promise.allSettled([receipt("click",data.click_receipt),navigate(path)]));});
}());
