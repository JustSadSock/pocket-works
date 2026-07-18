(()=>{
  'use strict';
  const script=document.currentScript;
  const declared=script?.dataset.pwRelease||'';
  const slug=script?.dataset.pwSlug||location.pathname.split('/').filter(Boolean).at(-1)||'app';
  if(!declared)return;

  const releaseKey=`pocket-works:release-reload:${slug}:${declared}`;
  const observedKey='pocket-works:observed-releases:v1';
  const buildUrl=(version=declared)=>{
    const url=new URL(location.href);
    url.searchParams.set('pw_release',version);
    return url;
  };

  function rememberActive(phase='document'){
    try{
      const observed=JSON.parse(localStorage.getItem(observedKey)||'{}');
      observed[slug]={version:declared,phase,at:Date.now()};
      localStorage.setItem(observedKey,JSON.stringify(observed));
    }catch{}
    try{
      const channel=new BroadcastChannel('pocket-works-release');
      channel.postMessage({type:'APP_RELEASE_ACTIVE',slug,version:declared,phase,url:location.href,at:Date.now()});
      channel.close();
    }catch{}
  }

  function probeLiveVersion(){
    try{
      const url=new URL('./app.config.json',location.href);
      url.searchParams.set('__pw_probe',Date.now().toString(36));
      const request=new XMLHttpRequest();
      request.open('GET',url.href,false);
      request.setRequestHeader('cache-control','no-cache');
      request.send(null);
      if(request.status<200||request.status>=300)return declared;
      const config=JSON.parse(request.responseText);
      return typeof config.version==='string'&&config.version?config.version:declared;
    }catch{return declared;}
  }

  function renderRecovery(version){
    window.stop?.();
    document.documentElement.dataset.pwRecovering='true';
    const style=document.createElement('style');
    style.textContent='html[data-pw-recovering="true"] body{visibility:hidden!important}html[data-pw-recovering="true"]:after{content:"Обновляю приложение до v'+version.replaceAll('"','')+'…";position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:28px;background:#111;color:#eee;font:600 16px/1.4 system-ui;text-align:center;visibility:visible}';
    document.head.append(style);
  }

  async function recover(version){
    renderRecovery(version);
    const tasks=[];
    if('serviceWorker'in navigator){
      tasks.push(navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(
        registrations.filter(registration=>new URL(registration.scope).pathname.includes(`/apps/${slug}/`)).map(registration=>registration.unregister())
      )).catch(()=>{}));
    }
    if('caches'in window){
      tasks.push(caches.keys().then(keys=>Promise.all(
        keys.filter(key=>key.startsWith(`${slug}-`)||key.startsWith(`pocket-works-app-${slug}-`)).map(key=>caches.delete(key))
      )).catch(()=>{}));
    }
    await Promise.all(tasks);
    const target=buildUrl(version);
    target.searchParams.set('pw_recovered',Date.now().toString(36));
    location.replace(target.href);
  }

  const live=probeLiveVersion();
  if(live!==declared){recover(live);return;}

  const expected=new URL(location.href).searchParams.get('pw_release');
  if(expected!==declared){
    const target=buildUrl();
    history.replaceState(history.state,'',target.href);
  }

  let meta=document.querySelector('meta[name="pocket-works-release"]');
  if(!meta){meta=document.createElement('meta');meta.name='pocket-works-release';document.head.append(meta);}
  meta.content=declared;
  globalThis.__POCKET_WORKS_RELEASE__={slug,version:declared,verified:true,markReady:()=>rememberActive('runtime')};
  rememberActive('document');
  window.addEventListener('load',()=>rememberActive('loaded'),{once:true});

  if('serviceWorker'in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(sessionStorage.getItem(releaseKey)==='1')return;
      sessionStorage.setItem(releaseKey,'1');
      location.replace(buildUrl().href);
    });
    navigator.serviceWorker.register(`./sw.js?pw_release=${encodeURIComponent(declared)}`,{updateViaCache:'none'})
      .then(registration=>registration.update())
      .catch(()=>{});
  }
})();
