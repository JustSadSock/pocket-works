(()=>{
  'use strict';
  const REGISTRY_KEY='pocket-works:registry:v1';
  const VERIFIED_KEY='pocket-works:verified-releases:v1';
  const OBSERVED_KEY='pocket-works:observed-releases:v1';
  let versions=new Map(),verified={},observed={};

  function readState(){
    try{
      const saved=JSON.parse(localStorage.getItem(REGISTRY_KEY)||'null');
      versions=new Map((saved?.apps||[]).filter(app=>app?.slug&&app?.version).map(app=>[app.slug,app.version]));
      verified=JSON.parse(localStorage.getItem(VERIFIED_KEY)||'{}');
      observed=JSON.parse(localStorage.getItem(OBSERVED_KEY)||'{}');
    }catch{versions=new Map();verified={};observed={};}
  }

  function versionedHref(anchor){
    const slug=anchor?.dataset?.slug;
    const version=versions.get(slug);
    if(!slug||!version)return;
    try{
      const url=new URL(anchor.getAttribute('href')||`./apps/${slug}/`,location.href);
      url.searchParams.set('pw_release',version);
      url.searchParams.set('pw_source','launcher');
      anchor.href=url.href;
    }catch{}
  }

  function annotateEntry(entry){
    const slug=entry?.dataset?.slug,expected=versions.get(slug),meta=entry?.querySelector('.app-entry__meta');
    if(!slug||!expected||!meta)return;
    meta.dataset.pwBase ||= meta.textContent;
    const actual=observed[slug]?.version,downloaded=verified[slug]?.version;
    const state=actual===expected?`active v${actual}`:downloaded===expected?`ready v${downloaded} · reopen to apply`:`available v${expected}`;
    meta.textContent=`${meta.dataset.pwBase} / ${state}`;
  }

  function rewrite(root=document){
    root.querySelectorAll?.('a[data-action="open"][data-slug],#detail-open[data-slug]').forEach(versionedHref);
    root.querySelectorAll?.('.app-entry[data-slug]').forEach(annotateEntry);
  }

  readState();
  rewrite();
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)rewrite(node);
    rewrite();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','data-slug']});

  document.addEventListener('pointerdown',event=>versionedHref(event.target.closest('a[data-action="open"],#detail-open')),{capture:true,passive:true});
  window.addEventListener('pocketworks:bulk-update-complete',()=>{readState();rewrite();});
  window.addEventListener('storage',event=>{if([REGISTRY_KEY,VERIFIED_KEY,OBSERVED_KEY].includes(event.key)){readState();rewrite();}});

  try{
    const channel=new BroadcastChannel('pocket-works-release');
    channel.addEventListener('message',event=>{
      const data=event.data;
      if(data?.type!=='APP_RELEASE_ACTIVE'||!data.slug||!data.version)return;
      try{
        observed=JSON.parse(localStorage.getItem(OBSERVED_KEY)||'{}');
        observed[data.slug]={version:data.version,at:data.at||Date.now()};
        localStorage.setItem(OBSERVED_KEY,JSON.stringify(observed));
        rewrite();
      }catch{}
    });
  }catch{}
})();
