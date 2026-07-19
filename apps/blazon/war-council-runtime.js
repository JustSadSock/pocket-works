const RELEASE='5.7.0';
const root=document.documentElement;
root.dataset.blazonArt='war-council';

const standard=document.querySelector('.menu-standard');
if(standard&&!standard.querySelector('.standard-crossbar')){
  standard.insertAdjacentHTML('beforeend','<div class="standard-crossbar" aria-hidden="true"></div><div class="standard-cords" aria-hidden="true"></div>');
}

const footer=document.querySelector('.menu-screen footer');
if(footer&&!footer.textContent.includes('living standards'))footer.textContent=`v${RELEASE} · living standards`;
const workshopTitle=document.querySelector('.workshop-mode #workshop-title');
if(workshopTitle)workshopTitle.textContent=workshopTitle.textContent.replace(/5\.[0-9]+\.[0-9]+\b/,RELEASE);

const controls=[...document.querySelectorAll('button,.topbar a')];
for(const control of controls){
  control.addEventListener('pointerdown',()=>control.classList.add('is-pressed'),{passive:true});
  const release=()=>control.classList.remove('is-pressed');
  control.addEventListener('pointerup',release,{passive:true});
  control.addEventListener('pointercancel',release,{passive:true});
  control.addEventListener('pointerleave',release,{passive:true});
}

const menu=document.querySelector('.menu-screen');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
if(menu&&!reduceMotion.matches){
  const move=event=>{
    const rect=menu.getBoundingClientRect();
    const x=(event.clientX-rect.left)/Math.max(1,rect.width)-.5;
    const y=(event.clientY-rect.top)/Math.max(1,rect.height)-.5;
    menu.style.setProperty('--tent-light-x',`${50+x*8}%`);
    menu.style.setProperty('--tent-light-y',`${28+y*5}%`);
  };
  menu.addEventListener('pointermove',move,{passive:true});
  menu.addEventListener('pointerleave',()=>{
    menu.style.removeProperty('--tent-light-x');
    menu.style.removeProperty('--tent-light-y');
  },{passive:true});
}

const continueButton=document.querySelector('#continueButton');
const syncCampaignState=()=>{
  if(menu)menu.classList.toggle('has-campaign',Boolean(continueButton&&!continueButton.hidden));
};
if(continueButton)new MutationObserver(syncCampaignState).observe(continueButton,{attributes:true,attributeFilter:['hidden']});
syncCampaignState();
