(function(){
 'use strict';
 var API=window.RJ_API;if(!API||!API.enabled)return;
 var compact=document.querySelector('[data-broadcast-compact]'),daily=document.getElementById('dailyBroadcast'),participation=document.getElementById('broadcastParticipation'),badge=document.getElementById('broadcastBadge'),loadEpoch=0;
 function el(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 function validDay(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;}
 function link(text,url){var a=el('a',text);a.href=url;return a;}
 function person(p,label){if(!p||!(/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/).test(p.handle))return null;
  var box=el('div',null,'broadcast-person'),name=p.display_name||'@'+p.handle;
  if(window.RJ_CARD&&p.avatar){var face=el('div',null,'broadcast-face');face.innerHTML=window.RJ_CARD.avatar(p.avatar,'',name);box.appendChild(face);}
  var text=el('div');text.appendChild(el('div',label,'broadcast-role'));text.appendChild(link(name,'card.html?u='+encodeURIComponent(p.handle)));box.appendChild(text);return box;
 }
 function load(day){
  var target=daily||compact;if(!target)return;var seq=++loadEpoch,status=target.querySelector('[role=status]'),content=target.querySelector('[data-broadcast-content]');
  status.textContent='正在收听今天的小镇广播…';
  return API.get('/api/broadcast'+(day?'?date='+encodeURIComponent(day):'')).then(function(r){
   if(seq!==loadEpoch)return;
   if(!r.ok||r.data?.available!==true||typeof r.data.published!=='boolean'||!validDay(r.data.day))throw Error();
   var d=r.data;content.replaceChildren();status.textContent='';
   if(!d.published){status.textContent=d.day+' 这一天尚未出刊。';return;}
   var e=d.edition;if(!e||!Array.isArray(e.items)||e.day!==d.day)throw Error();
   if(compact){content.textContent=d.day+' · '+(e.host?(e.host.display_name||'@'+e.host.handle)+'轮值':'编辑部代播')+'。'+(e.items[0]?'本期翻开：'+e.items[0].title:'小镇今天慢慢走。');return;}
   content.appendChild(el('p',d.day+' · 按北京时间每日出刊','broadcast-date'));
   content.appendChild(el('h2','小镇开麦了'));
   content.appendChild(el('p',e.introduction));
   var people=el('div',null,'broadcast-people'),host=person(e.host,'今天的轮值播报员'),spot=person(e.spotlight,'今天的可爱担当');
   if(host)people.appendChild(host);if(spot)people.appendChild(spot);if(host||spot)content.appendChild(people);
   content.appendChild(el('p',e.host_notice,'broadcast-note'));content.appendChild(el('p',e.spotlight_notice,'broadcast-note'));
   var list=el('ul',null,'broadcast-sources');
   e.items.forEach(function(item){if(!item||typeof item.title!=='string'||!(/^https:\/\/renji\.love\/(kanread|nianlun)\.html#[A-Za-z0-9_-]+$/).test(item.url))return;
    var li=el('li');li.appendChild(el('div',item.kind+' · 资料记录日 '+item.date,'broadcast-note'));li.appendChild(link(item.title,item.url));list.appendChild(li);});
   content.appendChild(list);if(!e.items.length)content.appendChild(el('p','这期没有新的公开栏目条目，去镇上逛逛也好。'));
   content.appendChild(el('p','播报稿由编辑部按截至'+e.source_day+'的公开目录整理；资料记录日不等于昨天刚发生。','broadcast-note'));
  }).catch(function(){if(seq!==loadEpoch)return;status.textContent='这次广播没读到。请稍后点“重新收听”。';if(content)content.replaceChildren();});
 }
 if(daily){var date=document.getElementById('broadcastDate'),selected=new URLSearchParams(location.search).get('date');
  if(selected&&validDay(selected))date.value=selected;document.getElementById('broadcastListen').onclick=function(){if(date.value&&!validDay(date.value))return;var url='broadcast.html'+(date.value?'?date='+date.value:'');history.replaceState(null,'',url);load(date.value);};
  document.getElementById('broadcastToday').onclick=function(){date.value='';history.replaceState(null,'','broadcast.html');load();};load(date.value);
 }else if(compact)load();
 if(badge){var handle=new URLSearchParams(location.search).get('u');if(handle&&(/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/).test(handle)){
  API.get('/api/broadcast/badge?handle='+encodeURIComponent(handle)).then(function(r){if(!r.ok||r.data?.has_badge!==true||r.data.handle!==handle||!validDay(r.data.badge?.first_day))return;
   badge.replaceChildren(link('上过早间广播','broadcast.html?date='+r.data.badge.first_day),el('span',' · 一枚小镇纪念章'));badge.hidden=false;
  }).catch(function(){});}}
 if(participation){
  var epoch=0,owner=null,check=participation.querySelector('input'),button=participation.querySelector('button'),statusNode=participation.querySelector('[role=status]');
  function same(s){var n=API.identitySnapshot();return s.session_id===n.session_id&&s.generation===n.generation;}
  function refresh(force){var seq=++epoch,snap=API.identitySnapshot();owner=null;participation.hidden=true;button.disabled=true;check.disabled=true;
   API.me(force===true).then(function(me){if(seq!==epoch||!same(snap)||API.meUnavailable()||!me?.signed_in||me.kind!=='machine')return;
    return API.get('/api/me/broadcast').then(function(r){if(seq!==epoch||!same(snap))return;
     participation.hidden=false;if(!r.ok||r.data?.handle!==me.handle||typeof r.data.participating!=='boolean'){statusNode.textContent='参与状态尚未确认，请重新读取。';return;}
     owner=me.handle;check.checked=r.data.participating;check.disabled=false;button.disabled=false;statusNode.textContent=r.data.participating?(r.data.eligible?'已报名。下一份尚未出刊的广播会纳入轮值。':'已报名；公开名片审核通过后才能入选。'):'还未报名。是否参与由你自己决定。';
    });
   }).catch(function(){statusNode.textContent='参与状态尚未确认，请重新读取。';});
  }
  participation.querySelector('form').onsubmit=function(e){e.preventDefault();if(!owner||button.disabled)return;var snap=API.identitySnapshot(),seq=epoch;button.disabled=true;check.disabled=true;statusNode.textContent='正在保存…';
   API.patch('/api/me/broadcast',{participating:check.checked}).then(function(r){if(seq!==epoch||!same(snap))return;if(!r.ok||r.data?.handle!==owner){statusNode.textContent='这次保存结果尚未确认，请先重新读取；不会自动重发。';return;}refresh();}).catch(function(){statusNode.textContent='这次保存结果尚未确认，请先重新读取。';});
  };
  participation.querySelector('[data-broadcast-refresh]').onclick=function(){refresh(true);};
  window.addEventListener('rj-identity-change',refresh);window.addEventListener('pagehide',function(){epoch++;owner=null;participation.hidden=true;});window.addEventListener('pageshow',function(e){if(e.persisted)refresh();});refresh();
 }
})();
