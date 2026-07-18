(()=>{
  const FLAG=Symbol.for('blazon.armorial-composition.v1');
  if(globalThis[FLAG])return;globalThis[FLAG]=true;
  const style=document.createElement('link');style.rel='stylesheet';style.href='./armorial-composition.css?v=5.2.0';document.head.append(style);
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
      svg.classList.toggle('has-motto',Boolean(svg.querySelector('.motto-copy:not([style*="display: none"])')));
      for(const node of svg.querySelectorAll('.charge-main,.charge-secondary'))node.setAttribute('vector-effect','non-scaling-stroke');
      const helmet=svg.querySelector('.command-helmet');if(helmet)helmet.classList.add('command-balanced');
      const crown=svg.querySelector('.command-crown');if(crown)crown.classList.add('command-balanced');
    }
    const footer=document.querySelector('.menu-screen footer');if(footer)footer.textContent='v5.2 · armorial composition · ручная геральдика';
  }
  function sync(){if(pending)return;pending=true;queueMicrotask(()=>{pending=false;observer?.disconnect();decorate();observer?.observe(document.body,{childList:true,subtree:true});});}
  observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();
})();
