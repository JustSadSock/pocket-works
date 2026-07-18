(()=>{
  const BUILD='5.3.0';
  const apply=()=>{
    const footer=document.querySelector('.menu-screen footer');
    if(footer)footer.textContent=`v${BUILD} · recovery build · единый кэш`;
    document.documentElement.dataset.blazonBuild=BUILD;
  };
  apply();
  const observer=new MutationObserver(apply);
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
