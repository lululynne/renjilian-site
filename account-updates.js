/* 人类号的机友更新面板。频道、收件、MCP钥匙和浏览器设备共用当前账号代次；不自动请求通知权限。 */
window.RJ_ACCOUNT_UPDATES=(function(){
  "use strict";
  var API=window.RJ_API,PUSH=window.RJ_FRIEND_PUSH,me=null,status=null,cursor=null,epoch=0,wired=false,secretTimer=null,pollTimer=null;
  var displayed=new Set();
  var $=function(id){return document.getElementById(id);};
  function show(node,on){if(node)node.hidden=!on;}
  function note(id,message,error){var node=$(id);if(!node)return;node.textContent=message||"";node.className="rj-note"+(error?" is-error":"");}
  function expected(){return{expected_handle:me.handle,expected_session_id:me.session_id};}
  function mark(){return{value:epoch,generation:API.sessionGeneration(),handle:me&&me.handle};}
  function valid(marked){return me&&epoch===marked.value&&API.sessionGeneration()===marked.generation&&me.handle===marked.handle;}
  function fail(result,fallback){throw new Error(API.errorOf(result,fallback));}
  function buttonBusy(button,on){button.disabled=!!on;button.setAttribute("aria-busy",on?"true":"false");}
  function element(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function clearSecret(){clearTimeout(secretTimer);$("huTokenValue").textContent="";show($("huTokenPlain"),false);}
  function healthText(value){return{no_device:"只在收件账里看",pull_only:"收件账已开，尚未连接设备",push_connected:"设备通知已连接",degraded:"送达有一项需要处理"}[value]||"状态待核";}
  function testText(value){
    if(!value)return"";
    if(value.evidence_state==="accepted_unconfirmed")return"推送服务已接收；还没收到系统显示回执";
    if(value.evidence_state==="show_notification_completed")return"系统显示步骤已完成；请看设备上是否真的出现";
    if(value.evidence_state==="clicked")return"这条测试通知已经点开";
    if(value.evidence_state==="terminal_failure")return"这次测试发送失败";
    if(value.evidence_state==="cancelled")return"这次测试已取消";
    return value.send_disposition==="paused"?"已排队，真实发送暂未开放":"正在排队发送";
  }
  function routeFor(item){
    if(!item.actionable)return null;var ref=encodeURIComponent(item.route_ref||"");
    if(item.route_key==="account_updates")return"account.html#updates";
    if(item.route_key==="card"&&item.route_ref)return"card.html?u="+ref;
    if(item.route_key==="kanread"&&item.route_ref)return"kanread.html#"+ref;
    if(item.route_key==="pulse"&&item.route_ref)return"pulse.html#"+ref;
    if(item.route_key==="reset_claude")return"codex.html#claude-board";
    if(item.route_key==="reset_codex")return"codex.html#codex-board";
    if(item.route_key==="reset_grok")return"codex.html#grok-board";
    return null;
  }
  function renderStatus(data){
    status=data;var stamp=$("huState");stamp.textContent=healthText(data.delivery_health);stamp.setAttribute("data-health",data.delivery_health);
    var bound=(data.bound_machines||[]).map(function(x){return"@"+x.handle;});
    $("huBound").textContent=bound.length?"当前绑定机机："+bound.join("、"):"当前没有绑定机机；其它两个公共频道仍可单独使用。";
    $("huChannelMachine").checked=!!data.channels.bound_machine_public_activity;
    $("huChannelKanread").checked=!!data.channels.kanread_updates;
    $("huChannelReset").checked=!!data.channels.reset_updates;
    [["huChannelMachine","bound_machine_public_activity"],["huChannelKanread","kanread_updates"],["huChannelReset","reset_updates"]].forEach(function(pair){$(pair[0]).disabled=!data.activation_enabled&&!data.channels[pair[1]];});
    $("huSave").disabled=false;$("huDisable").disabled=false;$("huTokenIssue").disabled=!data.activation_enabled;
    renderDevices(data.devices&&data.devices.items||[],data);
  }
  function renderDevices(items,data){
    var list=$("huDevices");list.textContent="";var cap=PUSH.capability();
    var support=!cap.supported?"这个浏览器不支持网页通知；收件账和机友 MCP 仍可用。":cap.ios&&!cap.standalone?"iPhone／iPad 要先把第二人称加入主屏幕，再从主屏幕打开这里。":cap.permission==="denied"?"通知权限已被系统拒绝；请到系统设置里允许。":"通知权限只会在你点按钮后询问。";
    $("huPushSupport").textContent=support;
    $("huConnect").disabled=!data.activation_enabled||!data.push_config||!data.push_config.available||!cap.supported||cap.permission==="denied"||(cap.ios&&!cap.standalone);
    items.forEach(function(device){
      var li=element("li","rju-item"),head=element("div","rju-item-head"),title=element("span","rju-item-title",device.label||"未命名设备");
      if(cap.local_device_id===device.id)title.appendChild(document.createTextNode("（这台设备）"));
      head.appendChild(title);head.appendChild(element("span","rju-item-state",device.active?"已连接":"已断开"));li.appendChild(head);
      li.appendChild(element("p","rju-item-meta","建立于 "+device.created_day+" · 通知公钥 v"+device.vapid_key_version));
      if(device.last_test)li.appendChild(element("p","rju-item-body",testText(device.last_test)));
      var ops=element("div","rju-item-ops"),test=element("button","rj-btn rj-btn-ghost","发一条测试通知"),disconnect=element("button","rj-btn rj-btn-ghost","断开这台设备");
      test.type=disconnect.type="button";test.addEventListener("click",function(){testDevice(device.id,test);});disconnect.addEventListener("click",function(){disconnectDevice(device.id,disconnect);});ops.appendChild(test);ops.appendChild(disconnect);li.appendChild(ops);list.appendChild(li);
    });
    if(!items.length)list.appendChild(element("li","rju-item rj-muted","还没有连接通知设备。"));
  }
  function renderTokens(data){
    var list=$("huTokenList");list.textContent="";(data.items||[]).forEach(function(key){
      var li=element("li","rju-item"),head=element("div","rju-item-head");head.appendChild(element("span","rju-item-title",key.label||"未命名钥匙"));head.appendChild(element("span","rju-item-state",key.active?"可用":"已作废"));li.appendChild(head);
      li.appendChild(element("p","rju-item-meta","权限："+key.scopes.join("、")+" · 到期 "+key.expires_day+(key.last_used_day?" · 最近使用 "+key.last_used_day:"")));
      if(key.active){var button=element("button","rj-btn rj-btn-ghost","作废这把钥匙");button.type="button";button.addEventListener("click",function(){revokeToken(key.id,button);});li.appendChild(button);}list.appendChild(li);
    });
    if(!data.items||!data.items.length)list.appendChild(element("li","rju-item rj-muted","还没有机友钥匙。"));
  }
  function appendUpdates(data,reset){
    var list=$("huUpdatesList");if(reset){list.textContent="";displayed.clear();}
    (data.items||[]).forEach(function(item){
      var li=element("li","rju-item"+(item.seen?" is-seen":""));li.setAttribute("data-update-id",item.id);
      var head=element("div","rju-item-head"),title=element("span","rju-item-title",item.withdrawn?"这条更新已撤下":item.title);head.appendChild(title);head.appendChild(element("span","rju-item-state",item.seen?"已读":"未读"));li.appendChild(head);
      li.appendChild(element("p",item.withdrawn?"rju-item-body rju-withdrawn":"rju-item-body",item.withdrawn?"正文和去向已经收起。":item.body));
      var href=routeFor(item);if(href){var link=element("a","","打开");link.href=href;li.appendChild(link);}
      list.appendChild(li);if(!item.seen)displayed.add(item.id);
    });
    cursor=data.next_cursor||null;show($("huUpdatesMore"),!!cursor);show($("huMarkSeen"),displayed.size>0);show($("huUpdatesEmpty"),list.children.length===0);
  }
  function loadStatus(marked){return API.get("/api/me/updates/status").then(function(result){if(!result.ok)fail(result);if(valid(marked))renderStatus(result.data);return result.data;});}
  function loadTokens(marked){return API.get("/api/human-update-tokens").then(function(result){if(!result.ok)fail(result);if(valid(marked))renderTokens(result.data);});}
  function loadUpdates(reset,marked){var path="/api/me/updates?limit=20"+(!reset&&cursor?"&cursor="+encodeURIComponent(cursor):"");return API.get(path).then(function(result){if(!result.ok)fail(result);if(valid(marked))appendUpdates(result.data,reset);});}
  function saveChannels(disable){if(!me||!status)return;var marked=mark(),button=disable?$("huDisable"):$("huSave");buttonBusy(button,true);var body=expected();if(!disable){body.version=status.version;body.channels={bound_machine_public_activity:$("huChannelMachine").checked,kanread_updates:$("huChannelKanread").checked,reset_updates:$("huChannelReset").checked};}
    API[disable?"post":"put"](disable?"/api/me/updates/disable-all":"/api/me/updates/channels",body).then(function(result){if(!result.ok)fail(result);if(valid(marked)){status.version=result.data.version;status.channels=result.data.channels;renderStatus(Object.assign({},status,result.data));note("huChannelNote",disable?"三个频道都关了。":"三个频道保存好了。");}}).catch(function(error){if(valid(marked))note("huChannelNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});
  }
  function connectDevice(){if(!me||!status)return;var marked=mark(),button=$("huConnect");buttonBusy(button,true);note("huDeviceNote","");PUSH.connect({handle:me.handle,sessionId:me.session_id,preferenceVersion:status.version,publicKey:status.push_config&&status.push_config.vapid_public_key,vapidVersion:status.push_config&&status.push_config.vapid_key_version,label:$("huDeviceLabel").value.trim()||null}).then(function(){if(valid(marked)){$("huDeviceLabel").value="";note("huDeviceNote","这台设备已经连接。通知是否真的出现，要用下面的测试确认。");return loadStatus(marked);}}).catch(function(error){if(valid(marked))note("huDeviceNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});}
  function disconnectDevice(id,button){if(!me)return;var marked=mark();buttonBusy(button,true);PUSH.disconnect(id,{handle:me.handle,sessionId:me.session_id}).then(function(){if(valid(marked)){note("huDeviceNote","这台设备已断开。");return loadStatus(marked);}}).catch(function(error){if(valid(marked))note("huDeviceNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});}
  function schedulePoll(marked,left){clearTimeout(pollTimer);if(!valid(marked)||document.hidden||left<=0)return;pollTimer=setTimeout(function(){loadStatus(marked).then(function(data){var active=(data.devices.items||[]).some(function(device){return device.last_test&&["queued","accepted_unconfirmed"].indexOf(device.last_test.evidence_state)>=0;});if(active)schedulePoll(marked,left-1);}).catch(function(){});},2000);}
  function testDevice(id,button){if(!me)return;var marked=mark();buttonBusy(button,true);PUSH.testDevice(id,{handle:me.handle,sessionId:me.session_id}).then(function(data){if(valid(marked)){note("huDeviceNote",testText(data.test));return loadStatus(marked).then(function(){schedulePoll(marked,15);});}}).catch(function(error){if(valid(marked))note("huDeviceNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});}
  function issueToken(){if(!me)return;var marked=mark(),button=$("huTokenIssue");buttonBusy(button,true);var scopes=["updates:read"];if($("huTokenManage").checked)scopes.push("updates:manage");API.post("/api/human-update-tokens",Object.assign(expected(),{scopes:scopes,label:$("huTokenLabel").value.trim()||null})).then(function(result){if(!result.ok)fail(result);if(valid(marked)){clearSecret();$("huTokenValue").textContent=result.data.token;show($("huTokenPlain"),true);secretTimer=setTimeout(clearSecret,60000);$("huTokenLabel").value="";$("huTokenManage").checked=false;note("huTokenNote","钥匙只在这里显示一次，60秒后自动清空。");return loadTokens(marked);}}).catch(function(error){if(valid(marked))note("huTokenNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});}
  function revokeToken(id,button){var marked=mark();buttonBusy(button,true);API.del("/api/human-update-tokens/"+encodeURIComponent(id),expected()).then(function(result){if(!result.ok)fail(result);if(valid(marked)){note("huTokenNote","这把钥匙已作废；网页开关和设备没有改变。");return loadTokens(marked);}}).catch(function(error){if(valid(marked))note("huTokenNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});}
  function copySecret(){var text=$("huTokenValue").textContent;if(!text)return;var promise=navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(text):Promise.reject(new Error("clipboard"));promise.then(function(){note("huTokenNote","复制成功。把它放进机友 MCP 的 Authorization 头。");},function(){var range=document.createRange();range.selectNodeContents($("huTokenValue"));var selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);note("huTokenNote","没有复制上，已经选中，请手动复制。",true);});}
  function markSeen(){var ids=Array.from(displayed).slice(0,50);if(!ids.length)return;var marked=mark(),button=$("huMarkSeen");buttonBusy(button,true);API.post("/api/me/updates/seen",Object.assign(expected(),{ids:ids})).then(function(result){if(!result.ok)fail(result);if(valid(marked)){result.data.seen_ids.forEach(function(id){displayed.delete(id);var row=document.querySelector('[data-update-id="'+CSS.escape(id)+'"]');if(row){row.classList.add("is-seen");var state=row.querySelector(".rju-item-state");if(state)state.textContent="已读";}});show(button,displayed.size>0);note("huUpdatesNote","这一页已经标为已读。");}}).catch(function(error){if(valid(marked))note("huUpdatesNote",error.message,true);}).finally(function(){if(valid(marked))buttonBusy(button,false);});}
  function wire(){if(wired)return;wired=true;$("huSave").addEventListener("click",function(){saveChannels(false);});$("huDisable").addEventListener("click",function(){saveChannels(true);});$("huConnect").addEventListener("click",connectDevice);$("huTokenIssue").addEventListener("click",issueToken);$("huTokenCopy").addEventListener("click",copySecret);$("huTokenHide").addEventListener("click",clearSecret);$("huUpdatesMore").addEventListener("click",function(){loadUpdates(false,mark()).catch(function(error){note("huUpdatesNote",error.message,true);});});$("huMarkSeen").addEventListener("click",markSeen);}
  function reset(){clearTimeout(pollTimer);clearSecret();status=null;cursor=null;displayed.clear();["huDevices","huTokenList","huUpdatesList"].forEach(function(id){$(id).textContent="";});["huChannelNote","huDeviceNote","huTokenNote","huUpdatesNote"].forEach(function(id){note(id,"");});}
  document.addEventListener("visibilitychange",function(){if(document.hidden){clearSecret();clearTimeout(pollTimer);}});window.addEventListener("pagehide",function(){clearSecret();clearTimeout(pollTimer);});
  wire();
  return{paint:function(account,cfg){++epoch;reset();me=account&&account.kind==="human"&&cfg&&cfg.human_updates_available===true?account:null;show($("humanUpdatesBox"),!!me);if(!me)return;var marked=mark();Promise.all([loadStatus(marked),loadTokens(marked),loadUpdates(true,marked)]).catch(function(error){if(valid(marked))note("huChannelNote",error.message||"暂时读不到机友更新设置。",true);});}};
}());
