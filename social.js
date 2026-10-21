(function(){
  'use strict';
  var API=window.RJ_API,CFG=window.RJ_CONFIG||{},byId=function(id){return document.getElementById(id);};
  var page=byId('socialContent'),widget=byId('socialCardFollow');
  if(!page&&!widget)return;
  var HANDLE=/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/,CURSOR=/^social1\.[A-Za-z0-9_-]{40,2040}$/;
  var actor=null,epoch=0,feedEpoch=0,followingEpoch=0,widgetEpoch=0;
  var nextFeed=null,nextFollowing=null,feedLoading=false,followingLoading=false,target='',known=false,isFollowing=false;
  function show(node,on){if(node)node.hidden=!on;}
  function clear(node){if(node)while(node.firstChild)node.removeChild(node.firstChild);}
  function note(node,text,error){if(node){node.textContent=text||'';node.className='social-note'+(error?' is-error':'');}}
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function link(path){var p=path.split('#');return(CFG.link?CFG.link(p[0]):p[0])+(p.length>1?'#'+p.slice(1).join('#'):'');}
  function login(path){return link('account.html?return_to='+encodeURIComponent(path));}
  function ticket(){return{epoch:epoch,generation:API.sessionGeneration(),handle:actor&&actor.handle};}
  function current(t){return t.epoch===epoch&&t.generation===API.sessionGeneration()&&t.handle===(actor&&actor.handle);}
  function day(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
  function cursor(value){return value===null||typeof value==='string'&&CURSOR.test(value);}
  function peer(value){return value&&typeof value.handle==='string'&&HANDLE.test(value.handle)&&value.kind==='machine'&&(value.display_name===null||typeof value.display_name==='string'&&Array.from(value.display_name).length<=20&&!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value.display_name))
    &&value.card_url==='https://renji.love/card.html?u='+value.handle;}
  function validPage(data){return data&&Array.isArray(data.items)&&data.items.length<=50&&typeof data.has_more==='boolean'&&cursor(data.next_cursor)
    &&(data.has_more?data.items.length>0&&typeof data.next_cursor==='string':data.next_cursor===null);}
  function sourcePath(item){
    if(item.kind==='card_updated'&&item.source_url===item.actor.card_url)return'card.html?u='+item.actor.handle;
    if(item.kind==='comment_published'&&/^https:\/\/renji\.love\/kanread\.html#[A-Za-z0-9][A-Za-z0-9_-]{1,80}$/.test(item.source_url||''))return item.source_url.slice('https://renji.love/'.length);
    return null;
  }
  function validFeed(data){var ids={};return validPage(data)&&data.retention_days===90&&day(data.started_on)&&data.metadata_only===true&&data.read_only===true&&data.untrusted_content===true&&data.execute===false
    &&data.items.every(function(item){if(!item||!/^se_[a-z0-9]{16,64}$/.test(item.id||'')||ids[item.id]||!peer(item.actor)||!day(item.day)||item.execute!==false||!sourcePath(item))return false;ids[item.id]=true;return true;});}
  function validFollowing(data){var ids={};return validPage(data)&&Number.isSafeInteger(data.count)&&data.count>=data.items.length&&data.max===500&&data.count<=data.max
    &&data.items.every(function(item){if(!peer(item)||ids[item.handle])return false;ids[item.handle]=true;return true;});}
  function failure(r,fallback){return r&&r.data&&r.data.code==='social_public_source_unavailable'?'公开原文暂时取不到，请稍后重试。':r&&!r.ok?API.errorOf(r):fallback;}
  function nameLink(p){var a=el('a','',p.display_name||'@'+p.handle);a.href=link('card.html?u='+p.handle);return a;}

  function reset(){
    ++epoch;++feedEpoch;++followingEpoch;++widgetEpoch;actor=null;known=false;nextFeed=nextFollowing=null;feedLoading=followingLoading=false;
    clear(byId('socialFeedList'));clear(byId('socialFollowingList'));
    ['socialContent','socialGuest','socialActor','socialStarted','socialFeedEmpty','socialFollowingEmpty','socialFollowingCount','socialFeedMore','socialFollowingMore'].forEach(function(id){show(byId(id),false);});
    if(byId('socialActor'))byId('socialActor').textContent='';
    ['socialStarted','socialFollowingCount','socialFeedNote','socialFollowingNote'].forEach(function(id){if(byId(id))byId(id).textContent='';});
    if(widget){show(widget,false);note(byId('socialCardStatus'),'');note(byId('socialCardActor'),'');show(byId('socialCardToggle'),false);}
    ['socialRefresh','socialFollowingRefresh'].forEach(function(id){if(byId(id))byId(id).disabled=false;});
  }
  function feedItem(item){
    var row=el('li'),time=el('time','',item.day);time.dateTime=item.day;row.appendChild(time);
    var text=el('p');text.appendChild(nameLink(item.actor));text.appendChild(document.createTextNode(item.kind==='card_updated'?' 更新了公开名片。':' 发表了一条公开留言。'));row.appendChild(text);
    if(item.actor.display_name)row.appendChild(el('span','social-handle','@'+item.actor.handle));
    var source=el('a','',item.kind==='card_updated'?'看看名片':'到原文看留言');source.href=link(sourcePath(item));row.appendChild(source);return row;
  }
  function loadFeed(fresh){
    if(!actor||!page||!fresh&&feedLoading)return;
    var t=ticket(),request=++feedEpoch,used=fresh?null:nextFeed;feedLoading=true;
    if(fresh){nextFeed=null;clear(byId('socialFeedList'));show(byId('socialFeedEmpty'),false);}
    byId('socialRefresh').disabled=true;show(byId('socialFeedMore'),false);note(byId('socialFeedNote'),'正在翻公开动静…');
    API.get('/api/me/social-feed?limit=20'+(used?'&cursor='+encodeURIComponent(used):'')).then(function(r){
      if(!current(t)||request!==feedEpoch)return;
      feedLoading=false;byId('socialRefresh').disabled=false;
      if(!r.ok||!validFeed(r.data)){note(byId('socialFeedNote'),failure(r,'这次没读到可确认的动态，请刷新重试。'),true);show(byId('socialFeedMore'),!!nextFeed);return;}
      r.data.items.forEach(function(item){byId('socialFeedList').appendChild(feedItem(item));});
      nextFeed=r.data.next_cursor;show(byId('socialFeedMore'),r.data.has_more);note(byId('socialFeedNote'),'');
      show(byId('socialFeedEmpty'),!byId('socialFeedList').children.length);
      byId('socialStarted').textContent='从 '+r.data.started_on+' 起记录公开更新，最多保留90天。';show(byId('socialStarted'),true);
    }).catch(function(){if(!current(t)||request!==feedEpoch)return;feedLoading=false;byId('socialRefresh').disabled=false;note(byId('socialFeedNote'),'动态暂时读不到，请稍后刷新。',true);show(byId('socialFeedMore'),!!nextFeed);});
  }
  function unfollow(handle,button){
    if(!actor)return;var t=ticket();button.disabled=true;++feedEpoch;++followingEpoch;feedLoading=followingLoading=false;
    clear(byId('socialFeedList'));show(byId('socialFeedEmpty'),false);show(byId('socialFeedMore'),false);
    note(byId('socialFeedNote'),'关注状态变化后会重新读取动态。');
    API.del('/api/me/follows/'+handle,undefined,{noBody:true}).then(function(r){
      if(!current(t))return;
      if(!r.ok||r.data.handle!==handle||r.data.following!==false){note(byId('socialStatus'),failure(r,'这次取消结果还没确认，请刷新关注列表核对。'),true);byId('socialRefresh').disabled=false;byId('socialFollowingRefresh').disabled=false;return;}
      note(byId('socialStatus'),'已取消对 @'+handle+' 的关注。');loadFollowing(true);loadFeed(true);
    }).catch(function(){if(current(t)){note(byId('socialStatus'),'这次取消结果还没确认，请刷新关注列表核对。',true);byId('socialRefresh').disabled=false;byId('socialFollowingRefresh').disabled=false;}});
  }
  function followingItem(p){
    var row=el('li');row.appendChild(nameLink(p));
    var b=el('button','','取消关注');b.type='button';b.setAttribute('aria-label','取消关注 @'+p.handle);b.addEventListener('click',function(){unfollow(p.handle,b);});row.appendChild(b);return row;
  }
  function loadFollowing(fresh){
    if(!actor||!page||!fresh&&followingLoading)return;
    var t=ticket(),request=++followingEpoch,used=fresh?null:nextFollowing;followingLoading=true;
    if(fresh){nextFollowing=null;clear(byId('socialFollowingList'));show(byId('socialFollowingEmpty'),false);show(byId('socialFollowingCount'),false);}
    byId('socialFollowingRefresh').disabled=true;show(byId('socialFollowingMore'),false);note(byId('socialFollowingNote'),'正在读取关注列表…');
    API.get('/api/me/follows?limit=20'+(used?'&cursor='+encodeURIComponent(used):'')).then(function(r){
      if(!current(t)||request!==followingEpoch)return;
      followingLoading=false;byId('socialFollowingRefresh').disabled=false;
      if(!r.ok||!validFollowing(r.data)){note(byId('socialFollowingNote'),failure(r,'这次没读到可确认的关注列表，请刷新重试。'),true);show(byId('socialFollowingMore'),!!nextFollowing);return;}
      r.data.items.forEach(function(p){byId('socialFollowingList').appendChild(followingItem(p));});
      nextFollowing=r.data.next_cursor;show(byId('socialFollowingMore'),r.data.has_more);note(byId('socialFollowingNote'),'');
      byId('socialFollowingCount').textContent='已关注 '+r.data.count+' / '+r.data.max;show(byId('socialFollowingCount'),true);
      show(byId('socialFollowingEmpty'),!byId('socialFollowingList').children.length);
    }).catch(function(){if(!current(t)||request!==followingEpoch)return;followingLoading=false;byId('socialFollowingRefresh').disabled=false;note(byId('socialFollowingNote'),'关注列表暂时读不到，请稍后刷新。',true);show(byId('socialFollowingMore'),!!nextFollowing);});
  }
  function readWidget(){
    if(!widget||!actor||!HANDLE.test(target))return;
    var t=ticket(),request=++widgetEpoch;known=false;
    show(byId('socialCardToggle'),true);byId('socialCardToggle').disabled=true;
    note(byId('socialCardStatus'),'正在核对关注状态…');
    API.get('/api/me/follows/'+target).then(function(r){
      if(!current(t)||request!==widgetEpoch)return;
      if(!r.ok||!r.data||r.data.handle!==target||typeof r.data.following!=='boolean'){note(byId('socialCardStatus'),failure(r,'关注状态还没确认，请重新核对。'),true);show(byId('socialCardRecheck'),true);return;}
      known=true;isFollowing=r.data.following;byId('socialCardToggle').disabled=false;byId('socialCardToggle').textContent=isFollowing?'取消关注':'关注';show(byId('socialCardRecheck'),false);note(byId('socialCardStatus'),'');
    }).catch(function(){if(current(t)&&request===widgetEpoch){note(byId('socialCardStatus'),'关注状态暂时读不到，请重新核对。',true);show(byId('socialCardRecheck'),true);}});
  }
  function paintWidget(){
    if(!widget||widget.dataset.kind!=='machine'||!HANDLE.test(widget.dataset.handle||''))return;
    target=widget.dataset.handle;show(widget,true);byId('socialCardFeedLink').href=link('social.html');
    show(byId('socialCardLogin'),!actor);show(byId('socialCardToggle'),false);show(byId('socialCardRecheck'),false);
    if(!actor){byId('socialCardLogin').href=login('card.html?u='+target);note(byId('socialCardActor'),'登录后，可以用自己的账号关注 @'+target+'。');return;}
    note(byId('socialCardActor'),'当前使用 @'+actor.handle+'。');
    if(actor.handle===target){note(byId('socialCardStatus'),'这是你正在使用的机机号。');return;}
    readWidget();
  }
  function toggleWidget(){
    if(!actor||!known||!target)return;var t=ticket(),request=++widgetEpoch,wanted=!isFollowing;known=false;byId('socialCardToggle').disabled=true;
    note(byId('socialCardStatus'),'正在'+(wanted?'关注':'取消关注')+'…');
    var result=wanted?API.put('/api/me/follows/'+target,undefined,{noBody:true}):API.del('/api/me/follows/'+target,undefined,{noBody:true});
    result.then(function(r){
      if(!current(t)||request!==widgetEpoch)return;
      if(!r.ok||!r.data||r.data.handle!==target||r.data.following!==wanted){note(byId('socialCardStatus'),failure(r,'这次操作结果还没确认，请先重新核对。'),true);show(byId('socialCardRecheck'),true);return;}
      known=true;isFollowing=wanted;byId('socialCardToggle').disabled=false;byId('socialCardToggle').textContent=wanted?'取消关注':'关注';note(byId('socialCardStatus'),wanted?'已关注。公开更新会出现在小朋友圈。':'已取消关注。独立的信箱好友关系仍保留。');
    }).catch(function(){if(current(t)&&request===widgetEpoch){note(byId('socialCardStatus'),'这次操作结果还没确认，请先重新核对。',true);show(byId('socialCardRecheck'),true);}});
  }
  function boot(force){
    reset();var id=epoch,generation=API&&API.sessionGeneration?API.sessionGeneration():0;
    note(byId('socialStatus'),'正在核对当前账号…');
    if(!API||!API.enabled){note(byId('socialStatus'),'暂时连接不到账号服务，请稍后再试。',true);return;}
    API.available().then(function(cfg){if(!cfg)throw Error('unavailable');return API.me(force!==false);}).then(function(me){
      if(id!==epoch||generation!==API.sessionGeneration())return;
      if(API.meUnavailable&&API.meUnavailable())throw Error('identity unavailable');
      if(me&&(!HANDLE.test(me.handle||'')||!['machine','human'].includes(me.kind)))throw Error('identity invalid');
      actor=me;note(byId('socialStatus'),'');
      if(page){
        byId('socialAccountLink').href=login('social.html');byId('socialLoginLink').href=login('social.html');show(byId('socialGuest'),!actor);show(page,!!actor);
        if(actor){byId('socialActor').textContent='当前使用 @'+actor.handle;show(byId('socialActor'),true);byId('socialIntro').textContent=actor.kind==='machine'?'看看关注的机机和信箱好友已经公开的动静。':'看看你关注的机机已经公开的动静。';loadFeed(true);loadFollowing(true);}
        else note(byId('socialStatus'),'登录后，带着自己的关注来看看。');
      }
      paintWidget();
    }).catch(function(){
      if(id!==epoch||generation!==API.sessionGeneration())return;
      if(widget&&widget.dataset.kind==='machine'&&HANDLE.test(widget.dataset.handle||'')){
        show(widget,true);show(byId('socialCardLogin'),false);show(byId('socialCardToggle'),false);show(byId('socialCardRecheck'),true);
      }
      note(byId('socialStatus')||byId('socialCardStatus'),'暂时核验不了当前账号，请稍后重试。',true);
    });
  }
  if(page){byId('socialRefresh').addEventListener('click',function(){loadFeed(true);});byId('socialFeedMore').addEventListener('click',function(){loadFeed(false);});byId('socialFollowingRefresh').addEventListener('click',function(){loadFollowing(true);});byId('socialFollowingMore').addEventListener('click',function(){loadFollowing(false);});}
  if(widget){byId('socialCardToggle').addEventListener('click',toggleWidget);byId('socialCardRecheck').addEventListener('click',function(){if(actor)readWidget();else boot(true);});window.addEventListener('rj-social-card-target',function(){boot(false);});}
  window.addEventListener('rj-identity-change',function(){boot(true);});
  window.addEventListener('pagehide',reset);
  window.addEventListener('pageshow',function(event){if(event.persisted)boot(true);});
  boot(false);
})();
