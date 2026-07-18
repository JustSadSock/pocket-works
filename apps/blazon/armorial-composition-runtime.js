(()=>{
  const FLAG=Symbol.for('blazon.armorial-composition.v2');
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;
  try{
    const style=document.createElement('link');style.rel='stylesheet';style.href='./armorial-composition.css?v=5.2.1';document.head.append(style);
    let observer,pending=false;
    function decorate(){
      for(const svg of document.querySelectorAll('svg.achievement')){
        const clip=svg.querySelector('clipPath[id]')?.id;
        if(clip)for(const charge of svg.querySelectorAll('.charge-main,.charge-secondary'))charge.setAttribute('clip-path',`url(#${clip})`);
        const main=svg.querySelector('.charge-main use')?.getAttribute('href')?.replace('#charge-','')||'none';
        const secondary=svg.querySelector('.charge-secondary use')?.getAttribute('href')?.replace('#charge-','')||'none';
        svg.dataset.main=main;svg.dataset.secondary=secondary;
        svg.classList.toggle('has-secondary',secondary!=='none');
        svg.classList.toggle('has-command',Boolean(svg.querySelector('.external-mark,.achievement-chain')));
        const motto=svg.querySelector('.motto-copy');
        const hasMotto=Boolean(motto&&motto.textContent.trim()&&motto.textContent.trim()!=='—'&&motto.style.display!=='none');
        svg.classList.toggle('has-motto',hasMotto);
        for(const node of svg.querySelectorAll('.charge-main,.charge-secondary'))node.setAttribute('vector-effect','non-scaling-stroke');
        svg.querySelector('.command-helmet')?.classList.add('command-balanced');
        svg.querySelector('.command-crown')?.classList.add('command-balanced');
      }
      const footer=document.querySelector('.menu-screen footer');if(footer)footer.textContent='v5.2.1 · menu hotfix';
    }
    function sync(){if(pending)return;pending=true;queueMicrotask(()=>{pending=false;observer?.disconnect();decorate();observer?.observe(document.body,{childList:true,subtree:true});});}
    observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();
  }catch(error){console.error('[Blazon] armorial decoration disabled:',error);}
})();