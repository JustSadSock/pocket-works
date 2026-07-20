(()=>{
  'use strict';
  const BUILD='5.10.0';
  const apply=()=>{
    const footer=document.querySelector('.menu-screen footer');
    if(footer&&document.documentElement.dataset.blazonReady)footer.textContent=`v${BUILD} · меню готово`;
    document.documentElement.dataset.blazonBuild=BUILD;
    const manager=document.querySelector('[data-update-manager]');
    if(manager){manager.dataset.appVersion=BUILD;manager.textContent='{}';}
  };
  const refreshWorker=async()=>{
    if(!('serviceWorker'in navigator))return;
    try{
      const registration=await navigator.serviceWorker.register(`./sw.js?pw_release=${BUILD}`,{updateViaCache:'none'});
      await registration.update();
    }catch(error){console.warn('[БЛАЗОН] worker refresh failed',error);}
  };
  if(document.documentElement.dataset.blazonReady){apply();refreshWorker();}
  else window.addEventListener('blazon:ready',()=>{apply();refreshWorker();},{once:true});
})();
