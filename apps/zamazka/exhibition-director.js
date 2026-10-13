// Shared exhibition transitions and truthful save-state labels.
// This module owns presentation only; game phases remain authoritative.
export const STAGE_DURATION=240;
export const SAVE_LABELS=Object.freeze({
 local:'На устройстве',pending:'Сохраняем…',transmitting:'Передаём работу…',
 server:'Копия в PocketNet',confirmed:'Работа принята',offline:'Нет связи · копия на устройстве',
 error:'Не удалось сохранить',idle:'Автосохранение'
});
export function saveTone(value=''){
 const s=String(value).toLowerCase();
 if(/не удалось|ошиб|лимит|недостаточно/.test(s))return 'error';
 if(/нет связи|на устройстве|вкладке|повторим|офлайн/.test(s))return 'offline';
 if(/принят|подтвержд|pocketnet|✓|сохранен[аоы]?/.test(s))return 'confirmed';
 if(/переда|отправ|проверя|сохраня|восстанавлива/.test(s))return 'busy';
 return 'idle';
}
export function createExhibitionDirector(screen,{duration=STAGE_DURATION}={}){
 let exit=null,clock=null;
 const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clear(){
  clearTimeout(clock);clock=null;
  exit?.remove();exit=null;
  screen.firstElementChild?.classList.remove('exhibition-enter');
 }
 function replace(html,{animate=true}={}){
  clear();
  const old=screen.firstElementChild;
  // Respect the old phase's dedicated verdict transition in app.js.
  const shouldAnimate=Boolean(animate&&old&&!reduced()&&!document.hidden);
  if(shouldAnimate){
   exit=document.createElement('div');
   exit.className='exhibition-exit-layer';
   exit.setAttribute('aria-hidden','true');
   exit.inert=true;
   // Moving a live canvas preserves its bitmap (cloning it would not).
   exit.append(old);
  }
  screen.innerHTML=html;
  screen.scrollTop=0;
  const next=screen.firstElementChild;
  if(next&&shouldAnimate){
   next.classList.add('exhibition-enter');
   screen.append(exit);
   clock=setTimeout(clear,duration+60);
  }else clear();
  return next;
 }
 return {replace,clear};
}

/* A coin flies from the remaining tray to the painting that was actually tapped.
   Visual only: the authoritative chip count is updated immediately by app.js. */
export function animateCoinDeposit(button){
 if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const end=button?.closest('[data-stake-card]')?.querySelector('.stake-amount');
 const tray=document.querySelector('#chipsRemaining');
 if(!end||!tray||!document.body||typeof Element==='undefined')return;
 const from=tray.getBoundingClientRect(),to=end.getBoundingClientRect();
 if(!from.width||!to.width)return;
 const coin=document.createElement('i');
 coin.className='zam-moving-token';coin.setAttribute('aria-hidden','true');
 const x=from.left+from.width*.3,y=from.top+from.height*.5;
 coin.style.left=x+'px';coin.style.top=y+'px';document.body.append(coin);
 const dx=to.left+to.width*.48-x,dy=to.top+to.height*.55-y;
 try{
  const motion=coin.animate([
   {transform:'translate3d(0,0,0) scale(.85)',opacity:.65},
   {transform:'translate3d('+dx*.56+'px,'+(dy*.45-17)+'px,0) scale(1.12)',opacity:1,offset:.56},
   {transform:'translate3d('+dx+'px,'+dy+'px,0) scale(.85)',opacity:0}
  ],{duration:260,easing:'cubic-bezier(.25,.75,.2,1)'});
  void motion.finished.catch(()=>{}).finally(()=>coin.remove());
 }catch{coin.remove()}
}
