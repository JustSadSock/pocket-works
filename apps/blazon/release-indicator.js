(()=>{
  const BUILD='5.4.0';
  const apply=()=>{
    const footer=document.querySelector('.menu-screen footer');
    if(footer)footer.textContent=`v${BUILD} · coherent release · меню готово`;
    document.documentElement.dataset.blazonBuild=BUILD;
  };
  if(document.documentElement.dataset.blazonReady)apply();else window.addEventListener('blazon:ready',apply,{once:true});
})();
