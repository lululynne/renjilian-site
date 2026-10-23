/* A public door choice. The destination page owns the existing visit behavior. */
(function () {
  'use strict';
  var box=document.getElementById('homeOuting'), API=window.RJ_API;
  if(!box)return;
  var button=box.querySelector('button'), status=box.querySelector('[role="status"]'), sequence=0, busy=false;
  var handle=/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;
  function reset(message){sequence++;busy=false;button.disabled=!API?.enabled;button.removeAttribute('aria-busy');status.textContent=message||'随机找一间公开的机机小屋，去看看它的装扮。';}
  button.addEventListener('click',function(){
    if(busy || !API?.enabled)return;
    var seq=++sequence, generation=API.sessionGeneration(), exclude=new URLSearchParams(location.search).get('u');
    if(!handle.test(exclude||''))exclude=null;
    function current(){return seq===sequence && generation===API.sessionGeneration();}
    busy=true;button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='正在找一间公开的小屋…';
    API.get('/api/homes/random'+(exclude?'?exclude='+encodeURIComponent(exclude):''),{deadlineMs:10000}).then(function(r){
      if(!current())return;
      if(r.stale || !r.ok){status.textContent=r.status===401?'当前登录身份尚未确认，请到账号页重新选择或登录，再出门。':'这次没能确认门牌，请再试一次；不代表没有公开的小屋。';return;}
      var d=r.data;
      if(d?.ok!==true || d.available!==true || typeof d.found!=='boolean' || (d.found?!handle.test(d.home?.handle||'') || d.home.handle===exclude:d.home!==null)){
        status.textContent='这次返回的门牌尚未确认，请再试一次。';return;
      }
      if(!d.found){status.textContent=exclude?'目前没有其他可随机拜访的公开机机小屋，晚些再来逛逛。':'目前没有可随机拜访的公开机机小屋，晚些再来逛逛。';return;}
      status.textContent='门牌找到了，正在去这家小屋。';
      var href='card.html?u='+encodeURIComponent(d.home.handle);
      location.assign(window.RJ_CONFIG?.link?window.RJ_CONFIG.link(href):href);
    }).catch(function(){if(current())status.textContent='这次没能确认门牌，请再试一次。';}).finally(function(){
      if(current()){busy=false;button.disabled=false;button.removeAttribute('aria-busy');}
    });
  });
  window.addEventListener('rj-identity-change',function(){reset('账号已切换。再点一次，会按当前身份找小屋。');});
  window.addEventListener('pagehide',function(){sequence++;busy=false;});
  window.addEventListener('pageshow',function(e){if(e.persisted)reset();});
  reset(API?.enabled?null:'暂时连不上小屋入口，请刷新页面后再试。');
}());
