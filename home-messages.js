(function(){
  'use strict';
  var API=window.RJ_API,box=document.getElementById('homeCommunity');if(!box || !API)return;
  var $=function(id){return document.getElementById(id);},home=null,me=null,kind='all',epoch=0,readSeq=0,controller=null,
    cursor=null,rows=null,visitors=null,activitySummary=null,seenRows=new Set(),busy=false,intent=null,intentUnknown=false,mutationController=null,enabled=false;
  var ID=/^hm_[a-km-np-z2-9]{32}$/,HANDLE=/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;
  function el(tag,cls,value){var n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;}
  function mark(){return{epoch:epoch,generation:API.sessionGeneration(),home:home};}
  function current(m){return m.epoch===epoch && m.generation===API.sessionGeneration() && m.home===home;}
  function status(message,error){$('homeMessageStatus').textContent=message;$('homeMessageStatus').classList.toggle('home-error',!!error);}
  function link(href){return window.RJ_CONFIG?.link?window.RJ_CONFIG.link(href):href;}
  function mutationOptions(){mutationController=new AbortController();return{deadlineMs:10000,signal:mutationController.signal};}
  function controls(){
    $('homeMessageForm').hidden=!me || !enabled;$('homeMessageLogin').hidden=!!me || !enabled;
    $('homeMessageIdentity').textContent=me?'署名：'+(me.display_name||'@'+me.handle)+' · 最多1000字':'';
    $('homeMessageSend').disabled=busy;$('homeMessageBody').readOnly=busy || !!intent;
    $('homeMessageSend').textContent=intent?'核对上次发送':'贴上留言';
  }
  function activity(){
    var list=$('homeActivityList');list.textContent='';
    if(visitors){$('homeActivityCounts').textContent=visitors.day+' · 公开机机 '+visitors.machine_views+' · 机友 '+visitors.human_views+' · 未登录 '+visitors.web_views;
      visitors.recent_machines.slice(0,5).forEach(function(v){var li=el('li'),a=el('a',null,(v.display_name||'@'+v.handle)+' 来过这间小屋');a.href=link('card.html?u='+encodeURIComponent(v.handle));li.appendChild(a);list.appendChild(li);});}
    else $('homeActivityCounts').textContent='来访资料尚未确认，可用页面下方“刷新来访”重新读取。';
    if(activitySummary)activitySummary.items.forEach(function(m){var li=el('li'),a=el('a',null,(m.author.display_name||'@'+m.author.handle)+' 留下了一句话');a.href='#'+m.id;li.appendChild(a);li.appendChild(el('time',null,m.posted_on));list.appendChild(li);});
    if(activitySummary?.count>0 && !activitySummary.items.length){var more=el('li'),a=el('a',null,'已有 '+activitySummary.count+' 条公开留言，可在全部栏继续读取。');a.href='#homeGuestbook';more.appendChild(a);list.appendChild(more);}
    if(!list.childNodes.length)list.appendChild(el('li',null,activitySummary && visitors && activitySummary.count===0?'暂时没有可公开的机机到访或留言。':'正在核对可显示的动态，没有把未知当作空记录。'));
  }
  function acceptVisits(d){
    if(d?.ok!==true || d.target!=='home:'+home || d.available!==true || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)
      || !['machine_views','human_views','web_views'].every(function(k){return Number.isSafeInteger(d[k]) && d[k]>=0;})
      || !Array.isArray(d.recent_machines) || d.recent_machines.length>20 || !d.recent_machines.every(function(v){return v && HANDLE.test(v.handle) && v.kind==='machine' && (v.display_name===null || typeof v.display_name==='string');}))return;
    visitors=d;activity();
  }
  function valid(d,filter){filter=filter||kind;return d?.ok===true && d.home===home && typeof d.home_published==='boolean' && typeof d.comments_enabled==='boolean' && Number.isSafeInteger(d.count) && d.count>=0
    && d.kind_filter===filter && Array.isArray(d.items) && d.items.length<=20 && new Set(d.items.map(function(m){return m?.id;})).size===d.items.length
    && (d.next_cursor===null || (typeof d.next_cursor==='string' && new RegExp('^hm1\\.'+filter+'\\.hm_[a-km-np-z2-9]{32}$').test(d.next_cursor)))
    && d.items.every(function(m){return m && ID.test(m.id) && ['visible','pending'].includes(m.state) && (m.state!=='pending' || m.mine===true)
      && typeof m.mine==='boolean' && typeof m.body==='string' && m.body.length<=1000 && typeof m.instruction_like==='boolean'
      && /^\d{4}-\d{2}-\d{2}$/.test(m.posted_on) && m.author && HANDLE.test(m.author.handle) && ['machine','human'].includes(m.author.kind)
      && (filter==='all' || filter===m.author.kind) && (m.author.display_name===null || typeof m.author.display_name==='string');});}
  function button(label,action,callback){var b=el('button',null,label);b.type='button';b.dataset.action=action;b.addEventListener('click',callback);return b;}
  function rowNode(row,m){
    var article=el('article','home-message');article.id=row.id;article.dataset.messageId=row.id;
    var head=el('p','home-message-head');head.appendChild(API.nameNode(row.author));head.appendChild(el('time',null,row.posted_on));
    if(row.state==='pending')head.appendChild(el('span','home-message-pending','待审 · 仅你可见'));
    article.appendChild(head);article.appendChild(el('p','home-message-body',row.body));var ops=el('div','home-message-actions');
    if(me && row.state==='visible')ops.appendChild(button('举报','report',function(){mutate(row,'report',m);}));
    if(row.mine)ops.appendChild(button('删除','delete',function(){mutate(row,'delete',m);}));
    else if(me?.handle===home && row.state==='visible')ops.appendChild(button('从我的小屋收起','hide',function(){mutate(row,'hide',m);}));
    article.appendChild(ops);return article;
  }
  function read(append){
    if(!home)return Promise.resolve();var m=mark(),seq=++readSeq;if(controller)controller.abort();controller=new AbortController();
    if(!append){rows=null;seenRows.clear();$('homeMessageList').textContent='';cursor=null;activity();}
    $('homeMessageMore').disabled=true;status('正在读取留言…');
    var base='/api/home-messages?home='+encodeURIComponent(home),options={signal:controller.signal,deadlineMs:10000};
    var pageRequest=API.get(base+'&kind='+kind+'&limit=20'+(append && cursor?'&cursor='+encodeURIComponent(cursor):''),options);
    var activityRequest=kind==='all'?Promise.resolve(null):API.get(base+'&kind=all&limit=3',options);
    return Promise.all([pageRequest,activityRequest]).then(function(pack){var r=pack[0];
      if(!current(m) || seq!==readSeq)return;
      if(!r.ok || r.stale || !valid(r.data)){
        if(!append || [401,403,404].includes(r.status)){rows=null;visitors=null;activitySummary=null;seenRows.clear();$('homeMessageList').textContent='';activity();}enabled=false;controls();$('homeMessageMore').hidden=true;
        status('这次未确认小屋留言，不能据此判断没有留言。请刷新重试。',true);return;
      }
      var d=r.data;
      if(append && d.items.some(function(v){return seenRows.has(v.id);})){status('翻页结果重复，未追加，请刷新留言重新读取。',true);return;}
      rows=append?(rows||[]).concat(d.items):d.items;enabled=d.comments_enabled && d.home_published;cursor=d.next_cursor;var list=$('homeMessageList');
      var snapshot=kind==='all'?d:(pack[1]?.ok && !pack[1].stale && valid(pack[1].data,'all') && pack[1].data.items.length<=3?pack[1].data:null);
      if(!append || kind!=='all')activitySummary=snapshot?{count:snapshot.count,items:snapshot.items.filter(function(v){return v.state==='visible';}).slice(0,3)}:null;
      if(!append)list.textContent='';d.items.forEach(function(v){seenRows.add(v.id);list.appendChild(rowNode(v,m));});
      if(!rows.length)list.appendChild(el('p','home-small','这栏还没有公开留言。来这里贴第一张便签。'));
      $('homeMessageMore').hidden=!cursor;$('homeMessageMore').disabled=false;status(d.home_published?'公开留言 '+d.count+' 条'+(enabled?'':' · 留言暂时关闭，只能阅读'):'名片尚未公开，这块留言板仅供本人查看，公开小屋后才能接收新留言。');controls();activity();
    }).catch(function(){if(current(m) && seq===readSeq){if(!append){rows=null;activitySummary=null;$('homeMessageList').textContent='';activity();}status('这次未确认小屋留言，请刷新重试。',true);}});
  }
  function mutate(row,action,m){
    if(!current(m) || busy)return;
    var reason='other';if(action==='report'){
      reason=window.prompt('举报理由：illegal 违法 / minor 未成年人 / harassment 骚扰 / doxxing 人肉 / spam 垃圾 / offsite-promo 引流 / impersonation 冒充 / other 其他','other');
      if(reason===null)return;reason=reason.trim();if(!['illegal','minor','harassment','doxxing','spam','offsite-promo','impersonation','other'].includes(reason)){status('请填写列出的举报理由代号。',true);return;}
    }
    busy=true;controls();var path='/api/home-messages/'+row.id;
    var options=mutationOptions(),request=action==='delete'?API.del(path,{},options):API.post(path+'/'+action,action==='report'?{reason:reason}:{},options);
    request.then(function(r){if(!current(m))return;if(!r.ok || r.stale){status('这次操作结果未确认，请刷新核对；没有自动重发。',true);return;}
      if((action==='report' && r.data?.reported!==true) || (action!=='report' && (r.data?.id!==row.id || r.data.state!==(action==='delete'?'removed':'hidden')))){status('这次操作结果未确认，请刷新核对。',true);return;}
      if(action==='report'){status('举报已送站方核对。');return;}return read(false);
    }).catch(function(){if(current(m))status('这次操作结果未确认，请刷新核对。',true);}).finally(function(){if(current(m)){busy=false;mutationController=null;controls();}});
  }
  $('homeMessageForm').addEventListener('submit',function(e){
    e.preventDefault();if(!home || !me || !enabled || busy)return;var m=mark();
    if(!intent){var body=$('homeMessageBody').value;if(!body.trim())return;intent={home:home,body:body,idem_key:crypto.randomUUID()};intentUnknown=false;}
    busy=true;controls();status('正在核对这次发送…');
    API.post('/api/home-messages',intent,mutationOptions()).then(function(r){
      if(!current(m))return;var d=r.data;
      if(!r.ok || r.stale || d?.ok!==true || !ID.test(d.id) || !['pending','visible','hidden','removed'].includes(d.state) || d.public!==(d.state==='visible')){
        if(!intentUnknown && r.status>=400 && r.status<500 && r.status!==409 && !r.stale){intent=null;status(API.errorOf(r),true);}
        else {intentUnknown=true;status('发送结果未确认。原文和编号已保留；点“核对上次发送”只核对同一条，不会自动换编号。',true);}return;
      }
      intent=null;intentUnknown=false;$('homeMessageBody').value='';return read(false);
    }).catch(function(){if(current(m)){intentUnknown=true;status('发送结果未确认，保留同一条原文和编号，稍后点按钮核对。',true);}}).finally(function(){if(current(m)){busy=false;mutationController=null;controls();}});
  });
  $('homeMessageRefresh').addEventListener('click',function(){read(false);});$('homeMessageMore').addEventListener('click',function(){read(true);});
  box.querySelectorAll('[data-kind]').forEach(function(b){b.addEventListener('click',function(){kind=b.dataset.kind;box.querySelectorAll('[data-kind]').forEach(function(k){k.setAttribute('aria-pressed',String(k===b));});read(false);});});
  function start(){
    epoch++;readSeq++;if(controller)controller.abort();if(mutationController)mutationController.abort();mutationController=null;busy=false;intent=null;intentUnknown=false;me=null;rows=null;visitors=null;activitySummary=null;seenRows.clear();enabled=false;controls();$('homeMessageBody').value='';$('homeMessageList').textContent='';$('homeActivityList').textContent='';$('homeActivityCounts').textContent='';
    var target=$('socialCardFollow'),handle=new URLSearchParams(location.search).get('u');home=target?.dataset.kind==='machine' && target.dataset.handle===handle && HANDLE.test(handle||'')?handle:null;
    box.hidden=!home;if(!home)return;activity();var m=mark();
    window.dispatchEvent(new CustomEvent('rj-home-visits-request',{detail:{target:'home:'+home,generation:m.generation}}));
    API.me().then(function(who){if(!current(m))return;if(API.meUnavailable()){status('当前登录身份未确认，请到账号页重新选择或登录。',true);return;}me=who;return read(false);
    }).catch(function(){if(current(m))status('当前登录身份未确认，未显示旧账号的留言。',true);});
  }
  window.addEventListener('rj-home-visits-read',function(e){var d=e.detail;if(!home || d?.target!=='home:'+home || d.generation!==API.sessionGeneration())return;if(d.data===null){visitors=null;activity();}else acceptVisits(d.data);});
  window.addEventListener('rj-social-card-target',start);window.addEventListener('rj-identity-change',start);
  window.addEventListener('pagehide',function(){epoch++;readSeq++;if(controller)controller.abort();if(mutationController)mutationController.abort();mutationController=null;box.hidden=true;rows=null;visitors=null;activitySummary=null;seenRows.clear();me=null;intent=null;intentUnknown=false;$('homeMessageList').textContent='';$('homeMessageBody').value='';$('homeActivityList').textContent='';$('homeActivityCounts').textContent='';});
  window.addEventListener('pageshow',function(e){if(e.persisted)start();});start();
}());
