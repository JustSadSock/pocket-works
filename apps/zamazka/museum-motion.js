// Five stable exhibition slots; each frame follows the decoded painting proportions.
const wrap=(i,n)=>(i%n+n)%n;
export function galleryWindow(order,center){
 return [-2,-1,0,1,2].map(slot=>({slot,id:order[wrap(center+slot,order.length)]}));
}
export function fitMuseumArtwork(stageWidth,stageHeight,ratio){
 const r=Number.isFinite(ratio)&&ratio>0?ratio:4/3;
 const chrome=32;
 const enlarged=stageWidth>=700&&typeof document!=='undefined'&&document.documentElement.dataset.zamazkaAppearance==='new';
 const maxWidth=Math.max(110,Math.min(stageWidth*(enlarged?.79:.68),stageWidth<700?330:enlarged?620:480));
 // The painting shares its stage with its physically attached caption.
 // Reserve both the measured frame chrome and a fixed plaque band, so the
 // caption cannot be clipped by the stage edge on portrait or wide artworks.
 const experimental=typeof document!=='undefined'&&document.documentElement.dataset.zamazkaAppearance==='new';
 const reserved=experimental?(stageWidth>=700?160:108):0;
 const maxHeight=Math.max(86,experimental?(stageHeight-reserved)*.92:stageHeight*.91);
 const width=Math.max(20,Math.min(maxWidth-chrome,(maxHeight-chrome)*r));
 return {width:Math.round(width),height:Math.round(width/r)};
}
export function createMuseumMotion(stage,{order,url,arts,onCenter,onExhibit=()=>{}}){
 let center=0,busy=false,done=null,removed=false;
 let pointerStart=null,suppressClickUntil=0;
 const onPointerDown=e=>{pointerStart={id:e.pointerId,x:e.clientX,y:e.clientY}};
 const onPointerUp=e=>{if(pointerStart?.id===e.pointerId&&Math.abs(e.clientX-pointerStart.x)>20)suppressClickUntil=Date.now()+500;pointerStart=null};
 const onPointerCancel=()=>{pointerStart=null};
 stage.addEventListener('pointerdown',onPointerDown);
 stage.addEventListener('pointerup',onPointerUp);
 stage.addEventListener('pointercancel',onPointerCancel);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const nodes=new Map(),ratios=new Map();
 const layout=node=>{
  if(removed)return;
  const img=node.querySelector('img'),id=Number(img.dataset.artId);
  const r=img.complete&&img.naturalWidth>0?img.naturalWidth/img.naturalHeight:ratios.get(id)||(arts[id]?.native==='portrait'?.75:4/3);
  if(img.naturalWidth>0)ratios.set(id,r);
  const size=fitMuseumArtwork(stage.clientWidth,stage.clientHeight,r);
  node.style.setProperty('--art-width',size.width+'px');
  node.style.setProperty('--art-height',size.height+'px');
 };
 const configureSlot=(node,slot)=>{
  node.dataset.slot=String(slot);
  node.tabIndex=Math.abs(slot)<=1?0:-1;
  node.setAttribute('aria-label',slot<0?'Предыдущая картина':slot>0?'Следующая картина':'Рассмотреть картину');
 };
 const applyArt=(node,index)=>{
  const id=order[wrap(index,order.length)],img=node.querySelector('img');
  img.dataset.artId=String(id);img.src=url(id);img.alt=arts[id]?.title||'Картина';
  const title=node.querySelector('.museum-slide-label strong');
  const creator=node.querySelector('.museum-slide-label span');
  if(title)title.textContent=arts[id]?.title||'Картина';
  if(creator)creator.textContent=[arts[id]?.artist,arts[id]?.date].filter(Boolean).join(' · ');
  layout(node);
 };
 for(const {slot} of galleryWindow(order,0)){
  const node=document.createElement('figure');node.className='museum-slide';node.setAttribute('role','button');configureSlot(node,slot);
  const interact=()=>{if(Date.now()<suppressClickUntil)return;const at=Number(node.dataset.slot);if(at===-1||at===1)shift(at);else if(at===0)onExhibit(order[center])};
  node.addEventListener('click',interact);
  node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();interact()}});
  node.innerHTML='<div class="museum-slide-rim"><span aria-hidden="true" class="museum-frame-facet museum-frame-facet-top"></span><span aria-hidden="true" class="museum-frame-facet museum-frame-facet-left"></span><span aria-hidden="true" class="museum-frame-facet museum-frame-facet-right"></span><span aria-hidden="true" class="museum-frame-facet museum-frame-facet-bottom"></span><img loading="eager" decoding="async" alt=""></div><figcaption class="museum-slide-label"><strong></strong><span></span></figcaption>';
  node.querySelector('img').addEventListener('load',()=>layout(node));
  applyArt(node,slot);nodes.set(slot,node);stage.append(node);
 }
 const relayout=()=>nodes.forEach(node=>layout(node));
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(relayout):null;
 if(observer)observer.observe(stage);else window.addEventListener('resize',relayout);
 onCenter(order[0],0);
 function shift(direction,sprint=false){
  if(removed)return;
  const step=Math.sign(direction);if(!step)return;
  // Strict one-at-a-time: ignore additional wheel/taps during animation.
  // There is no backlog to keep turning after the player stops input.
  if(busy)return;
  busy=true;stage.dataset.galleryAnimating='true';
  const duration=reduced?20:sprint?155:(document.documentElement.dataset.zamazkaAppearance==='new'?350:490);
  stage.style.setProperty('--museum-shift-duration',duration+'ms');
  center=wrap(center+step,order.length);
  const gone=step>0?-2:2,fresh=step>0?2:-2,exiting=nodes.get(gone),next=new Map();
  for(const [slot,node] of nodes){const target=slot-step;configureSlot(node,target);next.set(target,node)}
  nodes.clear();for(const [slot,node] of next)nodes.set(slot,node);
  const finish=()=>{
   if(removed)return;
   exiting.classList.add('instant');configureSlot(exiting,fresh);
   applyArt(exiting,center+fresh);nodes.delete(gone-step);nodes.set(fresh,exiting);
   void exiting.offsetWidth;
   requestAnimationFrame(()=>exiting.classList.remove('instant'));
   onCenter(order[center],center);
   busy=false;
   delete stage.dataset.galleryAnimating;
   stage.style.removeProperty('--museum-shift-duration');
  };
  done=setTimeout(finish,duration+24);
 }

 return {shift,dispose(){removed=true;stage.removeEventListener('pointerdown',onPointerDown);stage.removeEventListener('pointerup',onPointerUp);stage.removeEventListener('pointercancel',onPointerCancel);clearTimeout(done);observer?.disconnect();if(!observer)window.removeEventListener('resize',relayout);nodes.clear()},getCenter(){return order[center]}};
}
