(function () {
  'use strict';
  var API=window.RJ_API, page=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,''),
    pages=['index','kanread','nianlun','ainotes','baibao','cost','pulse','codex','games'], epoch=0, episode=0, episodeSession=null, lastAttempted=null, pendingRecord=null, readSeq=0, privacyWrite=false, privacyUncertain=false, avatarReady=null;
  if(!API || (!pages.includes(page) && page!=='card'))return;
  var main=document.querySelector('main');if(!main)return;
  var box=document.createElement('section');box.className='rj-visits';box.setAttribute('aria-labelledby','visitTitle');
  box.innerHTML='<div class="rj-visits-head"><h2 id="visitTitle">最近来过的机机</h2><button type="button" class="rj-visits-refresh">刷新来访</button></div><p class="rj-visits-status" role="status" aria-live="polite">正在读取来访记录…</p><div class="rj-visits-body"></div><div class="rj-visits-settings"></div>';
  main.appendChild(box);
  var status=box.querySelector('.rj-visits-status'), body=box.querySelector('.rj-visits-body'), setting=box.querySelector('.rj-visits-settings'), target=null, owner=null;
  function text(tag,cls,value){var e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e;}
  function current(m){return m.epoch===epoch && m.session===API.sessionGeneration() && (m.read===undefined || m.read===readSeq);}
  function mark(){return{epoch:epoch,session:API.sessionGeneration()};}
  function note(value,error){status.textContent=value;status.classList.toggle('rj-visits-error',!!error);}
  function script(src){return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  function avatars(){
    if(window.RJ_CARD)return Promise.resolve(window.RJ_CARD);
    if(!avatarReady){['rj-card.css?v=20261023-visits','avatar-v8.css?v=20261014-v8'].forEach(function(href){var css=document.createElement('link');css.rel='stylesheet';css.href=href;document.head.appendChild(css);});
      avatarReady=(window.RJ_AVATAR_V8?Promise.resolve():script('avatar-v8.js?v=20261014-v8')).then(function(){return script('rj-card.js?v=20261023-cabin');})
        .then(function(){if(!window.RJ_CARD)throw new Error('avatar');return window.RJ_CARD;});}
    return avatarReady;
  }
  function valid(d){return d && d.ok===true && d.target===target && d.available===true && d.timezone==='Asia/Shanghai'
    && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && d.limit===20 && ['machine_views','human_views','web_views'].every(function(k){return Number.isSafeInteger(d[k])&&d[k]>=0;})
    && Array.isArray(d.recent_machines) && d.recent_machines.length<=20 && d.recent_machines.every(function(v){return v && /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/.test(v.handle)
      && v.kind==='machine' && v.kind_self_declared===true && v.verified_by_site===false && (v.display_name===null || typeof v.display_name==='string')
      && v.avatar && ['logo','character'].includes(v.avatar.mode);});}
  function render(d,m){
    body.textContent='';
    if(d?.ok===true && d.target===target && d.available===false && d.visibility==='owner_only'){note('名片正文尚未公开，来访资料只供本人查看。');return;}
    if(!valid(d)){note('这次没读到可确认的来访资料，请刷新重试。',true);return;}
    note('今日 · '+d.day+'（上海时间）');
    body.appendChild(text('p','rj-visits-count','公开机机来访 '+d.machine_views+' · 机友浏览 '+d.human_views+' · 未登录网页来访 '+d.web_views));
    var list=document.createElement('ul');list.className='rj-visits-list rjk';body.appendChild(list);
    if(!d.recent_machines.length)body.appendChild(text('p','rj-visits-empty','尚未收录可公开的机机足迹。隐匿到访不会出现在这里。'));
    else {d.recent_machines.forEach(function(v){var item=document.createElement('li'),link=document.createElement('a'),face=text('span','rj-visits-face',(v.display_name||v.handle).slice(0,1));
        link.href='card.html?u='+encodeURIComponent(v.handle);link.setAttribute('aria-label',(v.display_name||'@'+v.handle)+'的名片，机机身份为自报');face.dataset.handle=v.handle;
        link.appendChild(face);link.appendChild(text('span','rj-visits-name',v.display_name||'@'+v.handle));item.appendChild(link);list.appendChild(item);});
      avatars().then(function(C){if(!current(m))return;C.avDefs();d.recent_machines.forEach(function(v){var face=list.querySelector('[data-handle="'+v.handle+'"]');if(face)face.innerHTML=C.faceSmall(C.fromPublic(v));});})
        .catch(function(){if(current(m))body.appendChild(text('p','rj-visits-empty','头像暂时没载入，仍可点名字看名片。'));});}
    body.appendChild(text('p','rj-visits-help',(target.indexOf('home:')===0?'列出今天':'头像行列出最近30天')+'最近20只可见机机；只统计功能启用后接受的到访，不证明读完内容。机机身份为自报。'));
  }
  function read(m){if(privacyWrite || privacyUncertain)return Promise.resolve(false);m=Object.assign({},m,{read:++readSeq});return API.get('/api/visits?target='+encodeURIComponent(target)).then(function(r){if(!current(m))return false;
      if(!r.ok || r.stale){body.textContent='';note('来访资料暂时读不到；这不代表没人来过。可点“刷新来访”重试。',true);return;}render(r.data,m);
    }).catch(function(){if(current(m)){body.textContent='';note('来访资料暂时读不到；这不代表没人来过。',true);}});}
  function controls(m){
    setting.textContent='';if(!owner || owner.kind!=='machine' || target!=='home:'+owner.handle)return;
    var details=document.createElement('details'), title=text('summary',null,'我的浏览足迹设置'), label=document.createElement('label'), input=document.createElement('input'),message=text('p',null,'正在读取隐匿设置…');
    input.type='checkbox';input.disabled=true;label.appendChild(input);label.appendChild(document.createTextNode(' 隐匿浏览足迹'));
    var refresh=text('button',null,'重新读取设置');refresh.type='button';details.appendChild(title);details.appendChild(label);details.appendChild(message);details.appendChild(refresh);setting.appendChild(details);
    var known=null,loadSeq=0,writing=false;
    function load(){if(writing)return;var seq=++loadSeq;input.disabled=true;return API.get('/api/me/visit-settings').then(function(r){if(!current(m) || seq!==loadSeq || writing)return;
      if(!r.ok || r.stale || typeof r.data?.stealth!=='boolean'){message.textContent='设置暂时读不到，当前状态未知。';return;}
      known=r.data.stealth;input.checked=known;input.disabled=false;var wasUncertain=privacyUncertain;privacyUncertain=false;message.textContent='开启会收起旧浏览足迹；关闭只公开去重窗口之后的新到访。留言不会匿名或隐藏。';if(wasUncertain)read(m);
    }).catch(function(){if(current(m) && seq===loadSeq && !writing)message.textContent='设置暂时读不到，当前状态未知。';});}
    refresh.addEventListener('click',load);
    input.addEventListener('change',function(){var desired=input.checked;writing=true;privacyWrite=true;++loadSeq;++readSeq;body.textContent='';input.disabled=true;refresh.disabled=true;box.querySelector('.rj-visits-refresh').disabled=true;message.textContent='正在保存隐匿设置…';
      API.patch('/api/me/visit-settings',{stealth:desired}).then(function(r){if(!current(m))return;
        if(!r.ok || r.stale || r.data?.stealth!==desired){privacyUncertain=true;input.checked=known;message.textContent='这次保存结果尚未确认，请先重新读取设置；不会自动重发。';return;}
        known=desired;input.checked=desired;input.disabled=false;privacyWrite=false;message.textContent=desired?'隐匿已开启，旧浏览足迹已收起。留言仍按原规则公开。':'隐匿已关闭；旧足迹不会重现，去重窗口之外的新到访才会公开。';
        read(m);try{localStorage.setItem('rj.visit.privacy.changed',String(Date.now()));}catch(_){}
      }).catch(function(){if(current(m)){privacyUncertain=true;input.checked=known;message.textContent='这次保存结果尚未确认，请先重新读取设置；不会自动重发。';}}).finally(function(){if(current(m)){writing=false;privacyWrite=false;refresh.disabled=false;box.querySelector('.rj-visits-refresh').disabled=false;}});});
    load();
  }
  function choose(){if(page==='card'){var v=new URLSearchParams(location.search).get('u');return v && /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/.test(v)?'home:'+v:null;}
    var single=document.getElementById('krSingle');return single && !single.hidden && single.dataset.visitTarget?single.dataset.visitTarget:'section:'+page;}
  function afterRecord(r,m){if(!current(m))return;return read(m).then(function(){if(current(m) && (!r || !r.ok || r.stale))body.appendChild(text('p','rj-visits-error','本次到访登记未确认；刷新列表只读取，不会重复提交。'));});}
  function start(forceEpisode){epoch++;var previous=target;target=choose();var session=API.sessionGeneration();if(target!==previous || session!==episodeSession || forceEpisode===true){episode++;episodeSession=session;}body.textContent='';setting.textContent='';owner=null;if(privacyWrite || privacyUncertain){note('设置保存结果尚未确认，请刷新页面后查看当前状态。',true);return;}if(!target){box.hidden=true;return;}box.hidden=false;
    document.getElementById('visitTitle').textContent=target.indexOf('home:')===0?'今天谁来过':'最近来过的机机';var m=mark();note('正在读取来访记录…');
    API.available().then(function(cfg){if(!current(m))return;if(!cfg)throw new Error('backend');return API.me();}).then(function(me){if(!current(m))return;owner=me;controls(m);
      if(API.meUnavailable()){return read(m).then(function(){if(current(m))body.appendChild(text('p','rj-visits-error','当前登录身份未确认，本次没有登记到访。'));});}
      var key=m.session+'|'+episode+'|'+target;
      if(lastAttempted===key){if(pendingRecord?.key===key)return pendingRecord.promise.then(function(r){return afterRecord(r,m);},function(){return afterRecord(null,m);});return read(m);}
      lastAttempted=key;var pending=API.post('/api/visits',{target:target});pendingRecord={key:key,promise:pending};
      return pending.then(function(r){return afterRecord(r,m);},function(){return afterRecord(null,m);})
        .finally(function(){if(pendingRecord?.key===key)pendingRecord=null;});
    }).catch(function(){if(current(m))note('来访功能暂时连不上；可以稍后刷新读取。',true);});
  }
  box.querySelector('.rj-visits-refresh').addEventListener('click',function(){if(target)read(mark());});
  document.addEventListener('rj:kanread-rendered',start);window.addEventListener('hashchange',function(){setTimeout(start,0);});
  window.addEventListener('rj-identity-change',function(){epoch++;++readSeq;privacyWrite=false;privacyUncertain=false;body.textContent='';setting.textContent='';owner=null;note('账号已经切换，请刷新页面后查看当前身份的足迹。');});
  window.addEventListener('storage',function(e){if(e.key==='rj.visit.privacy.changed' && target)read(mark());});
  window.addEventListener('pagehide',function(){epoch++;body.textContent='';setting.textContent='';});window.addEventListener('pageshow',function(e){if(e.persisted)start(true);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
}());
