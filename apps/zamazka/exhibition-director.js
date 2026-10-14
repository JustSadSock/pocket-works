// Shared exhibition transitions and truthful save-state labels.
// This module owns presentation only; game phases remain authoritative.
import {setDressScene} from './scenography.js';
import {activeVisualStyle,ATELIER} from './visual-style.js';
export const STAGE_DURATION=370;
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
 let exit=null,clock=null,flight=null,token=0;
 const shell=screen.closest('.app-shell');
 const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clear(){
  clearTimeout(clock);clock=null;
  exit?.remove();exit=null;flight?.remove();flight=null;
  screen.firstElementChild?.classList.remove('exhibition-enter','rehang');
  shell?.classList.remove('is-room-crossing');
 }
 function artworkAnchor(root){
  return root?.querySelector('.museum-slide[data-slot="0"] img[data-art-id],.gallery .picture.selected img[data-art-id],.picture-image img[data-art-id],.stake-frame img[data-art-id],.verdict-image img[data-art-id],.round-art-image img[data-art-id]');
 }
 function animateArtworkTravel(from,to){
  if(!from||!to||from.dataset.artId!==to.dataset.artId||!from.getBoundingClientRect||reduced())return;
  const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),sr=screen.getBoundingClientRect();
  if(!a.width||!a.height||!b.width||!b.height||Math.abs(a.width-b.width)<1&&Math.abs(a.left-b.left)<1)return;
  const clip=document.createElement('div');
  clip.className='museum-art-flight';
  clip.setAttribute('aria-hidden','true');clip.inert=true;
  const img=from.cloneNode(false);img.removeAttribute('data-art-id');img.alt='';
  clip.append(img);
  Object.assign(clip.style,{left:(a.left-sr.left)+'px',top:(a.top-sr.top)+'px',width:a.width+'px',height:a.height+'px'});
  screen.append(clip);flight=clip;
  to.classList.add('museum-art-arrival');
  const keyframes=[{transform:'translate3d(0,0,0) scale(1)',opacity:1},
    {transform:`translate3d(${b.left-a.left}px,${b.top-a.top}px,0) scale(${b.width/a.width},${b.height/a.height})`,opacity:.05}];
  try{void clip.animate(keyframes,{duration:duration,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'}).finished.catch(()=>{}).finally(()=>{clip.remove();to.classList.remove('museum-art-arrival')})}
  catch{clip.remove();to.classList.remove('museum-art-arrival')}
 }
 function replace(html,{animate=true,scene='gallery'}={}){
  clear();token++;
  const generation=token;
  const previous=screen.dataset.museumRoom||'';
  const room=SPACE[scene]||'gallery';
  const roomChanged=room!==previous;
  const old=screen.firstElementChild;
  const modern=activeVisualStyle()===ATELIER;
  const moving=Boolean(old&&animate&&!reduced()&&!document.hidden);
  const oldArtwork=moving&&modern?artworkAnchor(old):null;
  if(moving){
   // No fullscreen shutters: the actual previous scene lingers below the
   // incoming one. All delegated controls on that scene become inert.
   const targets=old.querySelectorAll('[data-action],[data-choice],[data-saved],[data-inspect],[data-magnify],[data-review-open],[data-tool],[data-cmd],[data-chipadd],[data-chipsub]');
   const attrs=['data-action','data-choice','data-saved','data-inspect','data-magnify','data-review-open','data-tool','data-cmd','data-chipadd','data-chipsub'];
   for(const node of targets)for(const name of attrs)node.removeAttribute(name);
   exit=document.createElement('div');
   exit.className='exhibition-exit-layer'+(roomChanged?' gallery-exit':' rehang');
   exit.setAttribute('aria-hidden','true');exit.inert=true;exit.append(old);
  }
  screen.innerHTML=html;
  screen.scrollTop=0;
  screen.dataset.museumRoom=room;if(shell)shell.dataset.museumRoom=room;
  const next=screen.firstElementChild;
  if(next)next.dataset.visualScene=scene;
  if(modern)setDressScene(next,scene);
  if(next&&moving){
   next.classList.add('exhibition-enter',...(modern?[roomChanged?'gallery-arrival':'rehang']:[]));
   screen.append(exit);
   shell?.classList.add('is-room-crossing');
   if(oldArtwork)animateArtworkTravel(oldArtwork,artworkAnchor(next));
   const max=modern?(roomChanged?duration:240):240;
   clock=setTimeout(()=>{if(token===generation)clear()},max+60);
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
