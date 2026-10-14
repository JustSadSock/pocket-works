// Shared exhibition transitions and truthful save-state labels.
// This module owns presentation only; game phases remain authoritative.
export const STAGE_DURATION=560;
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
const SPACE={
 home:'atrium',setup:'vestibule',connecting:'vestibule',lobby:'salon',
 preparing:'salon',preview:'gallery',drawing:'atelier',waiting:'atelier',
 vote:'tribunal',verdict:'tribunal',reveal:'tribunal',
 'round-review':'gallery',results:'salon',collection:'archive',
 archive:'archive',achievements:'archive'
};
export function createExhibitionDirector(screen,{duration=STAGE_DURATION}={}){
 let exit=null,passage=null,clock=null,token=0;
 const shell=screen.closest('.app-shell');
 const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clear(){
  clearTimeout(clock);clock=null;
  exit?.remove();exit=null;
  passage?.remove();passage=null;
  screen.firstElementChild?.classList.remove('exhibition-enter','rehang');
  shell?.classList.remove('is-room-crossing');
 }
 function replace(html,{animate=true,scene='gallery'}={}){
  const current=screen.dataset.museumRoom||'';
  const nextRoom=SPACE[scene]||'gallery';
  clear();token++;
  const generation=token;
  const old=screen.firstElementChild;
  const roomChanged=current!==nextRoom;
  const shouldAnimate=Boolean(animate&&old&&!reduced()&&!document.hidden);
  if(shouldAnimate){
   // Old canvases stay alive for the passage, while their hit targets do not.
   const controls=old.querySelectorAll('[data-action],[data-choice],[data-saved],[data-inspect],[data-magnify],[data-review-open],[data-tool],[data-cmd],[data-chipadd],[data-chipsub]');
   const names=['data-action','data-choice','data-saved','data-inspect','data-magnify','data-review-open','data-tool','data-cmd','data-chipadd','data-chipsub'];
   for(const node of controls)for(const name of names)if(node.hasAttribute(name))node.removeAttribute(name);
   exit=document.createElement('div');
   exit.className='exhibition-exit-layer'+(roomChanged?'':' rehang');
   exit.setAttribute('aria-hidden','true');
   exit.inert=true;exit.append(old);
  }
  screen.innerHTML=html;
  screen.scrollTop=0;
  screen.dataset.museumRoom=nextRoom;
  if(shell)shell.dataset.museumRoom=nextRoom;
  const next=screen.firstElementChild;
  if(next&&shouldAnimate){
   next.classList.add('exhibition-enter');
   if(!roomChanged)next.classList.add('rehang');
   screen.append(exit);
   if(roomChanged){
     passage=document.createElement('div');
     passage.className='museum-passage';
     passage.setAttribute('aria-hidden','true');
     passage.innerHTML='<span class="museum-passage-wing left"></span><span class="museum-passage-wing right"></span><span class="museum-passage-key"></span>';
     screen.append(passage);
     shell?.classList.add('is-room-crossing');
   }
   clock=setTimeout(()=>{if(token===generation)clear()},(roomChanged?duration:260)+75);
  }
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
