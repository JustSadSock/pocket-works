(()=>{
  'use strict';
  const script=document.currentScript;
  const declared=script?.dataset.pwRelease||'';
  const fingerprint=script?.dataset.pwFingerprint||new URL(script?.src||location.href).searchParams.get('pw_fp')||'';
  const slug=script?.dataset.pwSlug||location.pathname.split('/').filter(Boolean).at(-1)||'app';
  if(!declared)return;

  const reloadKey=`pocket-works:release-reload:${slug}:${fingerprint||declared}`;
  const observedKey='pocket-works:observed-releases:v1';

  function releaseUrl(version=declared,fp=fingerprint){
    const url=new URL(location.href);
    url.searchParams.set('pw_release',version);
    if(fp)url.searchParams.set('pw_fp',fp);
    return url;
  }

  function rememberActive(phase){
    try{
      const observed=JSON.parse(localStorage.getItem(observedKey)||'{}');
      observed[slug]={version:declared,fingerprint,phase,at:Date.now()};
      localStorage.setItem(observedKey,JSON.stringify(observed));
    }catch{}
    try{
      const channel=new BroadcastChannel('pocket-works-release');
      channel.postMessage({type:'APP_RELEASE_ACTIVE',slug,version:declared,fingerprint,phase,url:location.href,at:Date.now()});
      channel.close();
    }catch{}
  }

  function showRecovery(version){
    document.documentElement.dataset.pwRecovering='true';
    const style=document.createElement('style');
    style.textContent=`html[data-pw-recovering="true"] body{visibility:hidden!important}html[data-pw-recovering="true"]::after{content:"Обновляю приложение до v${String(version).replaceAll('"','')}…";position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:28px;background:#111;color:#eee;font:600 16px/1.4 system-ui;text-align:center;visibility:visible}`;
    document.head.append(style);
  }

  async function recover(latest){
    showRecovery(latest.version||declared);
    const jobs=[];
    if('serviceWorker'in navigator){
      jobs.push(navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(
        registrations
          .filter(registration=>new URL(registration.scope).pathname.includes(`/apps/${slug}/`))
          .map(registration=>registration.unregister())
      )).catch(()=>{}));
    }
    if('caches'in window){
      jobs.push(caches.keys().then(keys=>Promise.all(
        keys
          .filter(key=>key.startsWith(`${slug}-`)||key.startsWith(`pocket-works-app-${slug}-`))
          .map(key=>caches.delete(key))
      )).catch(()=>{}));
    }
    await Promise.all(jobs);
    const target=releaseUrl(latest.version||declared,latest.fingerprint||'');
    target.searchParams.set('pw_recovered',Date.now().toString(36));
    location.replace(target.href);
  }

  async function checkLatest(){
    try{
      const url=new URL('./release.json',location.href);
      url.searchParams.set('__pw_probe',Date.now().toString(36));
      const response=await fetch(url,{cache:'no-store',headers:{'cache-control':'no-cache'}});
      if(!response.ok)return;
      const latest=await response.json();
      const mismatch=latest?.version&&latest.version!==declared||latest?.fingerprint&&fingerprint&&latest.fingerprint!==fingerprint;
      if(mismatch)await recover(latest);
    }catch{}
  }

  const expected=releaseUrl();
  if(location.search!==expected.search)history.replaceState(history.state,'',expected.href);

  let releaseMeta=document.querySelector('meta[name="pocket-works-release"]');
  if(!releaseMeta){releaseMeta=document.createElement('meta');releaseMeta.name='pocket-works-release';document.head.append(releaseMeta);}
  releaseMeta.content=declared;
  let fingerprintMeta=document.querySelector('meta[name="pocket-works-fingerprint"]');
  if(!fingerprintMeta){fingerprintMeta=document.createElement('meta');fingerprintMeta.name='pocket-works-fingerprint';document.head.append(fingerprintMeta);}
  fingerprintMeta.content=fingerprint;

  globalThis.__POCKET_WORKS_RELEASE__={
    slug,
    version:declared,
    fingerprint,
    verified:true,
    markReady:()=>rememberActive('runtime')
  };

  window.addEventListener('load',()=>{
    rememberActive('loaded');
    setTimeout(checkLatest,1200);
  },{once:true});

  if('serviceWorker'in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const controller=navigator.serviceWorker.controller;
      if(!controller)return;
      const url=new URL(controller.scriptURL);
      const controllerFingerprint=url.searchParams.get('pw_fp')||'';
      const controllerVersion=url.searchParams.get('pw_release')||'';
      if(fingerprint&&controllerFingerprint!==fingerprint)return;
      if(controllerVersion&&controllerVersion!==declared)return;
      if(sessionStorage.getItem(reloadKey)==='1')return;
      sessionStorage.setItem(reloadKey,'1');
      location.replace(releaseUrl().href);
    });

    const workerUrl=new URL('./sw.js',location.href);
    workerUrl.searchParams.set('pw_release',declared);
    if(fingerprint)workerUrl.searchParams.set('pw_fp',fingerprint);
    navigator.serviceWorker.register(workerUrl.href,{updateViaCache:'none'})
      .then(registration=>registration.update())
      .catch(()=>{});
  }
})();
