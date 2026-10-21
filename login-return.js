(function(){
  'use strict';
  var raw=new URLSearchParams(location.search).get('return_to'),done=false;
  var valid=raw==='social.html'||/^card\.html\?u=[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/.test(raw||'');
  function href(){return window.RJ_CONFIG&&RJ_CONFIG.link?RJ_CONFIG.link(raw):raw;}
  var wrap=document.getElementById('accountReturnWrap'),anchor=document.getElementById('accountReturnLink');
  if(valid&&wrap&&anchor){anchor.href=href();anchor.textContent=raw==='social.html'?'返回小朋友圈':'返回刚才的名片';wrap.hidden=false;}
  window.RJ_LOGIN_RETURN={available:valid,go:function(){if(!valid||done)return false;done=true;location.assign(href());return true;}};
})();
