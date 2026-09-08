(()=>{
  'use strict';
  const script=document.currentScript;
  const declared=script?.dataset.pwRelease||'';
  const fingerprint=script?.dataset.pwFingerprint||new URL(script?.src||location.href).searchParams.get('pw_fp')||'';
  const slug=script?.dataset.pwSlug||location.pathname.split('/').filter(Boolean).at(-1)||'app';
  if(!declared)return;

  const reloadKey=`pocket-works:release-reload:${slug}:${fingerprint||declared}`;
  const observedKey='pocket-works:observed-releases:v1';
  const CHECK_THROTTLE_MS=1500;
  let lastCheckAt=0;
  let checkPromise=null;
  let recovering=false;

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
    if(document.querySelector('style[data-pw-recovery]'))return;
    const style=document.createElement('style');
    style.dataset.pwRecovery='true';
    style.textContent=`html[data-pw-recovering="true"] body{visibility:hidden!important}html[data-pw-recovering="true"]::after{content:"Обновляю приложение до v${String(version).replaceAll('"','')}…";position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:28px;background:#111;color:#eee;font:600 16px/1.4 system-ui;text-align:center;visibility:visible}`;
    document.head.append(style);
  }

  function isOwnedRegistration(registration){
    try{return new URL(registration.scope).pathname.includes(`/apps/${slug}/`);}catch{return false;}
  }

  function isOwnedCache(key){
    return key.startsWith(`${slug}-`)||key.startsWith(`pocket-works-app-${slug}-`);
  }

  function workerRelease(worker){
    try{
      const url=new URL(worker?.scriptURL||location.href);
      return {version:url.searchParams.get('pw_release')||'',fingerprint:url.searchParams.get('pw_fp')||''};
    }catch{return {version:'',fingerprint:''};}
  }

  function workerMatches(worker,version=declared,fp=fingerprint){
    if(!worker)return false;
    const release=workerRelease(worker);
    if(release.version&&release.version!==version)return false;
    if(fp&&release.fingerprint&&release.fingerprint!==fp)return false;
    return true;
  }

  function waitForState(worker,state,timeout=2400){
    if(!worker||worker.state===state)return Promise.resolve(worker?.state===state);
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        worker.removeEventListener('statechange',onState);
        resolve(value);
      };
      const onState=()=>{
        if(worker.state===state)finish(true);
        else if(worker.state==='redundant')finish(false);
      };
      const timer=setTimeout(()=>finish(worker.state===state),timeout);
      worker.addEventListener('statechange',onState);
    });
  }

  async function activateWaitingWorker(registration){
    try{
      await registration.update();
      let candidate=registration.waiting||registration.installing;
      if(candidate?.state==='installing')await waitForState(candidate,'installed');
      candidate=registration.waiting||(candidate?.state==='installed'?candidate:null);
      if(!candidate)return false;
      candidate.postMessage({type:'SKIP_WAITING'});
      return true;
    }catch{return false;}
  }

  async function clearStaleCaches(latest){
    if(!('caches'in window))return;
    try{
      const keys=await caches.keys();
      await Promise.all(keys
        .filter(key=>isOwnedCache(key)&&!(latest?.version&&key.includes(`v${latest.version}`)))
        .map(key=>caches.delete(key)));
    }catch{}
  }

  function controllerMismatch(){
    if(!('serviceWorker'in navigator)||!navigator.serviceWorker.controller)return false;
    const release=workerRelease(navigator.serviceWorker.controller);
    return Boolean(
      release.version&&release.version!==declared||
      fingerprint&&release.fingerprint&&release.fingerprint!==fingerprint
    );
  }

  async function recover(latest){
    if(recovering)return;
    recovering=true;
    showRecovery(latest.version||declared);

    let registrations=[];
    let activated=false;
    if('serviceWorker'in navigator){
      try{
        registrations=(await navigator.serviceWorker.getRegistrations()).filter(isOwnedRegistration);
        for(const registration of registrations){
          if(await activateWaitingWorker(registration))activated=true;
        }
      }catch{}
    }

    await clearStaleCaches(latest);

    if(activated&&'serviceWorker'in navigator){
      await Promise.race([
        new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),
        new Promise(resolve=>setTimeout(resolve,1200))
      ]).catch(()=>{});
    }else if(registrations.length){
      await Promise.all(registrations.map(registration=>registration.unregister().catch(()=>false)));
    }

    const target=releaseUrl(latest.version||declared,latest.fingerprint||'');
    target.searchParams.set('pw_recovered',Date.now().toString(36));
    location.replace(target.href);
  }

  async function checkLatest({force=false}={}){
    if(recovering)return;
    const now=Date.now();
    if(!force&&now-lastCheckAt<CHECK_THROTTLE_MS)return checkPromise;
    if(checkPromise)return checkPromise;
    lastCheckAt=now;
    checkPromise=(async()=>{
      try{
        const url=new URL('./release.json',location.href);
        url.searchParams.set('__pw_probe',Date.now().toString(36));
        const response=await fetch(url,{cache:'no-store',headers:{'cache-control':'no-cache'}});
        if(!response.ok)return;
        const latest=await response.json();
        const mismatch=Boolean(
          latest?.version&&latest.version!==declared||
          latest?.fingerprint&&fingerprint&&latest.fingerprint!==fingerprint||
          controllerMismatch()
        );
        if(mismatch)await recover(latest);
      }catch{}
      finally{checkPromise=null;}
    })();
    return checkPromise;
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
    setTimeout(()=>void checkLatest({force:true}),350);
  },{once:true});
  window.addEventListener('pageshow',()=>void checkLatest({force:true}));
  window.addEventListener('focus',()=>void checkLatest());
  window.addEventListener('online',()=>void checkLatest({force:true}));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkLatest({force:true});
  });
  setInterval(()=>{
    if(document.visibilityState==='visible')void checkLatest();
  },60000);

  if('serviceWorker'in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(recovering)return;
      const controller=navigator.serviceWorker.controller;
      if(!controller||!workerMatches(controller))return;
      if(sessionStorage.getItem(reloadKey)==='1')return;
      sessionStorage.setItem(reloadKey,'1');
      const target=releaseUrl();
      target.searchParams.set('pw_controller',Date.now().toString(36));
      location.replace(target.href);
    });

    const workerUrl=new URL('./sw.js',location.href);
    workerUrl.searchParams.set('pw_release',declared);
    if(fingerprint)workerUrl.searchParams.set('pw_fp',fingerprint);
    navigator.serviceWorker.register(workerUrl.href,{updateViaCache:'none'})
      .then(async registration=>{
        await registration.update();
        if(registration.waiting&&workerMatches(registration.waiting)){
          registration.waiting.postMessage({type:'SKIP_WAITING'});
        }
      })
      .catch(()=>{});
  }
})();
