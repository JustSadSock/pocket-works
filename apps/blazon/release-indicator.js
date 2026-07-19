(()=>{
  'use strict';
  const BUILD='5.9.0';
  const apply=()=>{
    const footer=document.querySelector('.menu-screen footer');
    if(footer&&document.documentElement.dataset.blazonReady)footer.textContent=`v${BUILD} · меню готово`;
    document.documentElement.dataset.blazonBuild=BUILD;
  };
  if(document.documentElement.dataset.blazonReady)apply();
  else window.addEventListener('blazon:ready',apply,{once:true});
})();
