(()=>{
  'use strict';
  const REGISTRY_KEY='pocket-works:registry:v1';
  const OBSERVED_KEY='pocket-works:observed-releases:v1';
  let versions=new Map();

  function readRegistry(){
    try{
      const saved=JSON.parse(localStorage.getItem(REGISTRY_KEY)||'null');
      versions=new Map((saved?.apps||[]).filter(app=>app?.slug&&app?.version).map(app=>[app.slug,app.version]));
    }catch{versions=new Map();}
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

  function rewrite(root=document){
    root.querySelectorAll?.('a[data-action="open"][data-slug],#detail-open[data-slug]').forEach(versionedHref);
  }

  readRegistry();
  rewrite();
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)rewrite(node);
    rewrite();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','data-slug']});

  document.addEventListener('pointerdown',event=>versionedHref(event.target.closest('a[data-action="open"],#detail-open')),{capture:true,passive:true});
  window.addEventListener('pocketworks:bulk-update-complete',()=>{readRegistry();rewrite();});
  window.addEventListener('storage',event=>{if(event.key===REGISTRY_KEY){readRegistry();rewrite();}});

  try{
    const channel=new BroadcastChannel('pocket-works-release');
    channel.addEventListener('message',event=>{
      const data=event.data;
      if(data?.type!=='APP_RELEASE_ACTIVE'||!data.slug||!data.version)return;
      try{
        const observed=JSON.parse(localStorage.getItem(OBSERVED_KEY)||'{}');
        observed[data.slug]={version:data.version,at:data.at||Date.now()};
        localStorage.setItem(OBSERVED_KEY,JSON.stringify(observed));
      }catch{}
    });
  }catch{}
})();
