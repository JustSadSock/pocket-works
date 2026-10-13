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
