(()=>{
  'use strict';
  const REGISTRY_KEY='pocket-works:registry:v1';
  const VERIFIED_KEY='pocket-works:verified-releases:v1';
  const OBSERVED_KEY='pocket-works:observed-releases:v1';
  let releases=new Map();
  let verified={};
  let observed={};
  const opening=new Set();

  function readState(){
    try{
      const saved=JSON.parse(localStorage.getItem(REGISTRY_KEY)||'null');
      releases=new Map((saved?.apps||[]).filter(app=>app?.slug&&app?.version).map(app=>[
        app.slug,
        {version:app.version,fingerprint:app.fingerprint||`version-${app.version}`}
      ]));
      verified=JSON.parse(localStorage.getItem(VERIFIED_KEY)||'{}');
      observed=JSON.parse(localStorage.getItem(OBSERVED_KEY)||'{}');
    }catch{
      releases=new Map();
      verified={};
      observed={};
    }
  }

  function sameRelease(state,release){
    if(!state||!release)return false;
    if(state.version!==release.version)return false;
    if(release.fingerprint&&state.fingerprint!==release.fingerprint)return false;
    return true;
  }

  function needsConvergence(slug,release){
    const running=observed[slug];
    const cached=verified[slug];
    return Boolean(
      running?.version&&!sameRelease(running,release)||
      cached?.version&&!sameRelease(cached,release)
    );
  }

  function versionedHref(anchor){
    const slug=anchor?.dataset?.slug;
    const release=releases.get(slug);
    if(!slug||!release)return;
    try{
      const url=new URL(anchor.getAttribute('href')||`./apps/${slug}/`,location.href);
      url.searchParams.set('pw_release',release.version);
      url.searchParams.set('pw_fp',release.fingerprint);
      url.searchParams.set('pw_source','launcher');
      if(anchor.href!==url.href)anchor.href=url.href;
    }catch{}
  }

  function annotateEntry(entry){
    const slug=entry?.dataset?.slug;
    const release=releases.get(slug);
    const meta=entry?.querySelector('.app-entry__meta');
    if(!slug||!release||!meta)return;

    meta.dataset.pwBase ||= meta.textContent;
    const running=observed[slug];
    const cached=verified[slug];
    const active=sameRelease(running,release)&&['runtime','loaded'].includes(running?.phase);
    const ready=sameRelease(cached,release);
    const state=active
      ?`active ${release.fingerprint.slice(0,8)}`
      :ready
        ?`ready ${release.fingerprint.slice(0,8)} · reopen`
        :`available ${release.fingerprint.slice(0,8)}`;
    const next=`${meta.dataset.pwBase} / ${state}`;
    if(meta.textContent!==next)meta.textContent=next;
  }

  async function clearStaleAppRuntime(slug,release){
    const registrationPrefix=`/apps/${slug}/`;
    if('serviceWorker'in navigator){
      try{
        const registrations=await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations
          .filter(registration=>{
            try{return new URL(registration.scope).pathname.includes(registrationPrefix);}catch{return false;}
          })
          .map(registration=>registration.unregister().catch(()=>false)));
      }catch{}
    }

    if('caches'in window){
      try{
        const keys=await caches.keys();
        await Promise.all(keys
          .filter(key=>{
            const owned=key.startsWith(`${slug}-`)||key.startsWith(`pocket-works-app-${slug}-`);
            return owned&&!(release?.version&&key.includes(`v${release.version}`));
          })
          .map(key=>caches.delete(key)));
      }catch{}
    }

    try{
      if(observed[slug]&&!sameRelease(observed[slug],release)){
        delete observed[slug];
        localStorage.setItem(OBSERVED_KEY,JSON.stringify(observed));
      }
      if(verified[slug]&&!sameRelease(verified[slug],release)){
        delete verified[slug];
        localStorage.setItem(VERIFIED_KEY,JSON.stringify(verified));
      }
    }catch{}
  }

  function rewrite(root=document){
    root.querySelectorAll?.('a[data-action="open"][data-slug],#detail-open[data-slug]').forEach(versionedHref);
    root.querySelectorAll?.('.app-entry[data-slug]').forEach(annotateEntry);
  }

  let frame=0;
  function scheduleRewrite(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      rewrite();
    });
  }

  readState();
  scheduleRewrite();

  const observer=new MutationObserver(scheduleRewrite);
  for(const root of [document.querySelector('#app-list'),document.querySelector('#detail-panel')]){
    if(root)observer.observe(root,{childList:true,subtree:true});
  }

  document.addEventListener('pointerdown',event=>versionedHref(event.target.closest('a[data-action="open"],#detail-open')),{capture:true,passive:true});
  document.addEventListener('click',event=>{
    const anchor=event.target.closest?.('a[data-action="open"],#detail-open');
    const slug=anchor?.dataset?.slug;
    const release=releases.get(slug);
    if(!anchor||!slug||!release||!needsConvergence(slug,release)||opening.has(slug))return;
    if('button'in event&&event.button!==0)return;
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;

    event.preventDefault();
    event.stopImmediatePropagation();
    opening.add(slug);
    versionedHref(anchor);
    void clearStaleAppRuntime(slug,release).finally(()=>{
      try{
        const target=new URL(anchor.href,location.href);
        target.searchParams.set('pw_handoff',Date.now().toString(36));
        location.assign(target.href);
      }catch{
        location.assign(`./apps/${slug}/?pw_release=${encodeURIComponent(release.version)}&pw_fp=${encodeURIComponent(release.fingerprint)}&pw_handoff=${Date.now().toString(36)}`);
      }
    });
  },{capture:true});
  window.addEventListener('pocketworks:bulk-update-complete',()=>{readState();scheduleRewrite();});
  window.addEventListener('storage',event=>{
    if([REGISTRY_KEY,VERIFIED_KEY,OBSERVED_KEY].includes(event.key)){
      readState();
      scheduleRewrite();
    }
  });

  try{
    const channel=new BroadcastChannel('pocket-works-release');
    channel.addEventListener('message',event=>{
      const data=event.data;
      if(data?.type!=='APP_RELEASE_ACTIVE'||!data.slug||!data.version)return;
      try{
        observed=JSON.parse(localStorage.getItem(OBSERVED_KEY)||'{}');
        observed[data.slug]={
          version:data.version,
          fingerprint:data.fingerprint||'',
          phase:data.phase||'loaded',
          at:data.at||Date.now()
        };
        localStorage.setItem(OBSERVED_KEY,JSON.stringify(observed));
        scheduleRewrite();
      }catch{}
    });
  }catch{}

  window.addEventListener('pagehide',()=>{
    observer.disconnect();
    if(frame)cancelAnimationFrame(frame);
  },{once:true});
})();
