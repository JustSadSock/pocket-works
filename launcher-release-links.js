(()=>{
  'use strict';
  const REGISTRY_KEY='pocket-works:registry:v1';
  const VERIFIED_KEY='pocket-works:verified-releases:v1';
  const OBSERVED_KEY='pocket-works:observed-releases:v1';
  let releases=new Map();
  let verified={};
  let observed={};

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
    const active=running?.version===release.version&&running?.fingerprint===release.fingerprint&&['runtime','loaded'].includes(running?.phase);
    const ready=cached?.version===release.version&&cached?.fingerprint===release.fingerprint;
    const state=active
      ?`active ${release.fingerprint.slice(0,8)}`
      :ready
        ?`ready ${release.fingerprint.slice(0,8)} · reopen`
        :`available ${release.fingerprint.slice(0,8)}`;
    const next=`${meta.dataset.pwBase} / ${state}`;
    if(meta.textContent!==next)meta.textContent=next;
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
