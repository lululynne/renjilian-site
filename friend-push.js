/* 浏览器通知载体。权限只在 connect() 被按钮直接调用后询问；不做自动弹窗或离线缓存。 */
window.RJ_FRIEND_PUSH=(function(){
  "use strict";
  var API=window.RJ_API,DEVICE_KEY="rj_push_device_id",VAPID_KEY="rj_push_vapid_version";
  var memory={id:null,version:null};
  function read(key){try{return localStorage.getItem(key);}catch(e){return key===DEVICE_KEY?memory.id:memory.version;}}
  function write(key,value){if(key===DEVICE_KEY)memory.id=value;else memory.version=value;try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,String(value));}catch(e){}}
  function ios(){return /iPad|iPhone|iPod/.test(navigator.userAgent||"")||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);}
  function standalone(){return !!navigator.standalone||(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);}
  function capability(){
    var supported="serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window;
    return{supported:supported,permission:supported?Notification.permission:"unsupported",ios:ios(),standalone:standalone(),local_device_id:read(DEVICE_KEY),local_vapid_version:Number(read(VAPID_KEY)||0)||null};
  }
  function problem(code,message){var error=new Error(message);error.code=code;return error;}
  function bytes(value){
    var raw=String(value||"").replace(/-/g,"+").replace(/_/g,"/");raw+="=".repeat((4-raw.length%4)%4);
    try{var bin=atob(raw),out=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}catch(e){throw problem("bad-vapid","通知公钥无法读取，请刷新后重试。");}
  }
  function bodyBase(options){return{expected_handle:options.handle,expected_session_id:options.sessionId};}
  function expect(result){if(!result||!result.ok)throw problem("api",API.errorOf(result));return result.data;}
  async function connect(options){
    var state=capability();
    if(!state.supported)throw problem("unsupported","这个浏览器不支持网页通知；更新仍可在账号页和机友 MCP 里看。");
    if(state.ios&&!state.standalone)throw problem("ios-home","iPhone／iPad 要先把第二人称加入主屏幕，再从主屏幕打开这里。");
    if(!options||!options.publicKey||!Number.isInteger(options.vapidVersion))throw problem("not-ready","通知配置暂时没有接通。");
    var permission=await Notification.requestPermission();
    if(permission!=="granted")throw problem("permission-"+permission,permission==="denied"?"通知权限已被拒绝；请在系统设置里允许，收件账仍可照常使用。":"这次没有允许通知；收件账仍可照常使用。");
    var registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});await navigator.serviceWorker.ready;
    var current=await registration.pushManager.getSubscription(),oldId=read(DEVICE_KEY),stored=Number(read(VAPID_KEY)||0)||null,rotating=!!current&&stored!==options.vapidVersion;
    if(rotating){await current.unsubscribe();current=null;}
    var active=current||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(options.publicKey)});
    var payload=Object.assign(bodyBase(options),{preference_version:options.preferenceVersion,vapid_key_version:options.vapidVersion,label:options.label||null,subscription:active.toJSON()});
    var data;
    try{data=expect(await API.post("/api/me/updates/devices",payload));}
    catch(error){if(!current||rotating)await active.unsubscribe().catch(function(){});throw error;}
    var id=data.device.id;write(DEVICE_KEY,id);write(VAPID_KEY,options.vapidVersion);
    if(oldId&&oldId!==id)await API.del("/api/me/updates/devices/"+encodeURIComponent(oldId),bodyBase(options)).catch(function(){});
    return data;
  }
  function disconnect(deviceId,options){
    var local=read(DEVICE_KEY)===deviceId;
    var localStop=local&&navigator.serviceWorker?navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(sub){return sub?sub.unsubscribe():true;}).catch(function(){return false;}):Promise.resolve(true);
    return localStop.then(function(){return API.del("/api/me/updates/devices/"+encodeURIComponent(deviceId),bodyBase(options)).then(expect);}).then(function(data){if(local){write(DEVICE_KEY,null);write(VAPID_KEY,null);}return data;});
  }
  function testDevice(deviceId,options){return API.post("/api/me/updates/devices/"+encodeURIComponent(deviceId)+"/test",bodyBase(options)).then(expect);}
  return{capability:capability,connect:connect,disconnect:disconnect,testDevice:testDevice};
}());
