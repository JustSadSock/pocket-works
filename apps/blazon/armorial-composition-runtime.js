(()=>{
  'use strict';
  const FLAG=Symbol.for('blazon.armorial-composition.v5.5.0');
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;

  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='./armorial-composition.css?pw_release=5.5.0';
  document.head.append(style);

  function decorate(){
    for(const svg of document.querySelectorAll('svg.achievement')){
      const clip=svg.querySelector('clipPath[id]')?.id;
      if(clip){const value=`url(#${clip})`;for(const charge of svg.querySelectorAll('.charge-main,.charge-secondary'))if(charge.getAttribute('clip-path')!==value)charge.setAttribute('clip-path',value);}
      const main=svg.querySelector('.charge-main use')?.getAttribute('href')?.replace('#charge-','')||'none';
      const secondary=svg.querySelector('.charge-secondary use')?.getAttribute('href')?.replace('#charge-','')||'none';
      if(svg.dataset.main!==main)svg.dataset.main=main;if(svg.dataset.secondary!==secondary)svg.dataset.secondary=secondary;
      svg.classList.toggle('has-secondary',secondary!=='none');svg.classList.toggle('has-command',Boolean(svg.querySelector('.external-mark,.achievement-chain')));
      const motto=svg.querySelector('.motto-copy'),hasMotto=Boolean(motto&&motto.textContent.trim()&&motto.textContent.trim()!=='—'&&motto.style.display!=='none');svg.classList.toggle('has-motto',hasMotto);
      for(const node of svg.querySelectorAll('.charge-main,.charge-secondary'))if(node.getAttribute('vector-effect')!=='non-scaling-stroke')node.setAttribute('vector-effect','non-scaling-stroke');
      svg.querySelector('.command-helmet')?.classList.add('command-balanced');svg.querySelector('.command-crown')?.classList.add('command-balanced');
    }
  }

  let frame=0;
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;decorate();});}
  const observer=new MutationObserver(schedule);
  for(const id of ['menuHeraldry','playerAchievement','enemyAchievement','rewardGrid','endingAchievement']){const root=document.getElementById(id);if(root)observer.observe(root,{childList:true,subtree:true});}
  schedule();
  window.addEventListener('pagehide',()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);},{once:true});
})();
