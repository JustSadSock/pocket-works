import {DEBUG_ITEMS,DEBUG_FX,DEBUG_SCENES,DEBUG_ROLES} from './debug-state.js';
import {artifactSVG} from './art/artifacts.js';
import {characterMarkup,applyCharacterArt,loadCharacterArt} from './art/characters.js';
import {createAudioFeedback} from './feedback.js';

export const DEBUG_VIEWPORTS=[
 ['phone','Телефон',390,844],['phone-wide','Телефон ↔',844,390],
 ['tablet','Планшет',820,1024],['tablet-wide','Планшет ↔',1024,768],
 ['desktop','ПК',1440,900]
];
const encode=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(text,attr,selected=false)=>'<button type="button" class="dev-choice'+(selected?' is-selected':'')+'" '+attr+'>'+encode(text)+'</button>';
export function createBazaarDebug(){
 let root=null,frame=null,isOpen=false,viewport=DEBUG_VIEWPORTS[0],scene='four',section='screens',itemKind='inventory';
 let lastFocus=null,observer=null,auditQueue=null,results=[],ready=false;
 let debugSound='on';
 const audio=createAudioFeedback({storage:{getItem:()=>debugSound,setItem:(_,v)=>{debugSound=v;}}});
 const tabs=[['screens','Экраны'],['items','Предметы'],['characters','Персонажи'],['effects','Эффекты'],['qa','Проверка']];
 const characters=['mage','mushroom','fluffy_monster','sheep_wolf','toy','prince','many_eyed_cat','flower','old_man'];
 const characterNames=[...DEBUG_ROLES,'Многоглазый кот','Цветок','Старик'];
 function controls(list){return '<div class="dev-buttons">'+list.join('')+'</div>'}
 function panelMarkup(){
  if(section==='screens')return '<p class="dev-hint">Реальные игровые экраны. Все действия работают в изолированной симуляции без PocketNet.</p>'+
   controls(DEBUG_SCENES.map(([id,label])=>option(label,'data-debug-scene="'+id+'"',scene===id))) +
   '<p class="dev-hint">Боковые панели</p>'+controls([['secret','Задания'],['inventory','Инвентарь'],['deals','Обмен'],['market','Рынок'],['actions','Мой ход'],['players','Участники'],['detail','Предмет']].map(([id,label])=>option(label,'data-debug-sheet="'+id+'"')));
  if(section==='items')return '<p class="dev-hint">Выбери предмет, чтобы открыть подробную карточку в предпросмотре.</p>'+
   controls([['inventory','В инвентаре'],['listing','На торгах'],['broker','У брокера'],['black','Анонимно']].map(([id,label])=>option(label,'data-debug-kind="'+id+'"',itemKind===id)))+
   '<div class="dev-object-grid">'+DEBUG_ITEMS.map(([name,rarity],i)=>
    '<button type="button" class="dev-object" data-debug-item="'+i+'" aria-label="Открыть '+encode(name)+'">'+
    artifactSVG(name,rarity)+'<span>'+encode(name)+'</span></button>').join('')+'</div>';
  if(section==='characters')return '<p class="dev-hint">Все девять исходных SVG-персонажей.</p>'+
   '<div class="dev-character-grid">'+characters.map((id,i)=>
    '<button type="button" class="dev-character" data-debug-character="'+i+'">'+characterMarkup(id)+
    '<span>'+encode(characterNames[i])+'</span></button>').join('')+'</div>';
  if(section==='effects')return '<p class="dev-hint">Запускай звуки и визуальные эффекты вручную. Переключатель не меняет живую партию.</p>'+
   controls(DEBUG_FX.map(([id,label])=>option(label,'data-debug-effect="'+id+'"')))+
   option(audio.isEnabled()?'Звук включён':'Звук выключен','data-debug-mute="1"');
  return '<p class="dev-hint">Проверка переполнения, размеров кнопок и доступности элементов на разных экранах.</p>'+
   controls([option('Проверить текущий','data-debug-audit="1"'),option('Проверить все 5 размеров','data-debug-audit-all="1"')])+
   '<pre class="dev-report" data-debug-report role="status">'+encode(results.length?JSON.stringify(results,null,2):'Нажми «Проверить».')+'</pre>';
 }
 function markup(){
  return '<section class="bazaar-dev" role="dialog" aria-modal="true" aria-label="Мастерская Барахолки">'+
   '<div class="dev-sidebar"><div class="dev-heading"><div><strong>Мастерская</strong><small>Black Bazaar · безопасный просмотр</small></div>'+
   '<button type="button" class="dev-close" data-debug-close aria-label="Закрыть">×</button></div>'+
   '<nav class="dev-tabs" aria-label="Разделы отладки">'+tabs.map(([id,title])=>option(title,'data-debug-tab="'+id+'"',section===id)).join('')+'</nav>'+
   '<div class="dev-content" data-debug-content></div>'+
   '<div class="dev-foot">~ — открыть/закрыть <button type="button" data-debug-close>В игру</button></div></div>'+
   '<div class="dev-workspace"><div class="dev-device-bar"><strong>Предпросмотр</strong>'+
   '<div class="dev-devices">'+DEBUG_VIEWPORTS.map(([id,title])=>option(title,'data-debug-viewport="'+id+'"',viewport[0]===id)).join('')+'</div>'+
   '<small data-debug-dimensions></small></div>'+
   '<div class="dev-preview-area" data-debug-area><div class="dev-device" data-debug-device>'+
   '<iframe class="dev-frame" title="Изолированный игровой предпросмотр" src="./preview.html?debugPreview=1"></iframe>'+
   '</div></div><div class="dev-status" role="status" data-debug-status>Загрузка предпросмотра…</div></div></section>';
 }
 function send(payload){if(ready)frame?.contentWindow?.postMessage({source:'bazaar-debug-console',...payload},location.origin)}
 function status(s){const el=root?.querySelector('[data-debug-status]');if(el)el.textContent=s}
 function refreshPanel(){
  if(!root)return;root.querySelector('[data-debug-content]').innerHTML=panelMarkup();
  root.querySelectorAll('[data-debug-tab]').forEach(b=>b.classList.toggle('is-selected',b.dataset.debugTab===section));
  if(section==='characters'){applyCharacterArt(root);loadCharacterArt().catch(()=>{});}
 }
 function resize(){
  if(!root||!frame)return;
  const area=root.querySelector('[data-debug-area]'),device=root.querySelector('[data-debug-device]');
  const {width,height}=area.getBoundingClientRect();if(width<40||height<40)return;
  const scale=Math.min(1,(width-24)/viewport[2],(height-24)/viewport[3]);
  device.style.width=Math.floor(viewport[2]*scale)+'px';device.style.height=Math.floor(viewport[3]*scale)+'px';
  frame.style.width=viewport[2]+'px';frame.style.height=viewport[3]+'px';
  frame.style.transform='scale('+scale+')';
  root.querySelector('[data-debug-dimensions]').textContent=viewport[2]+' × '+viewport[3]+' · '+Math.round(scale*100)+'%';
  root.querySelectorAll('[data-debug-viewport]').forEach(b=>b.classList.toggle('is-selected',b.dataset.debugViewport===viewport[0]));
 }
 function receive(event){
  if(!isOpen||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  const d=event.data;if(d?.source!=='bazaar-debug-preview')return;
  if(d.type==='ready'){ready=true;status('Предпросмотр готов · без сети');send({type:'scene',id:scene});resize();}
  if(d.type==='status')status(d.message);
  if(d.type==='audit'){
   results.push({device:viewport[0],scene,...d.report});
   refreshPanel();status((d.report.issues?.length||0)+' проблем · '+viewport[2]+' × '+viewport[3]);
   if(auditQueue?.length){
    const next=auditQueue.shift();
    if(next){viewport=next;resize();send({type:'audit'});}
    else{auditQueue=null;status('Завершена проверка всех пяти размеров');refreshPanel();}
   }
  }
 }
 function selectScene(id){scene=id;send({type:'scene',id});if(section==='screens')refreshPanel();}
 function click(event){
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-debug-close'))return close();
  if(b.dataset.debugTab){section=b.dataset.debugTab;refreshPanel();return}
  if(b.dataset.debugViewport){viewport=DEBUG_VIEWPORTS.find(v=>v[0]===b.dataset.debugViewport)||viewport;resize();return}
  if(b.dataset.debugScene){selectScene(b.dataset.debugScene);return}
  if(b.dataset.debugSheet){if(['home','lobby','done'].includes(scene))selectScene('four');send({type:'sheet',name:b.dataset.debugSheet});return}
  if(b.dataset.debugKind){itemKind=b.dataset.debugKind;refreshPanel();return}
  if(b.hasAttribute('data-debug-item')){
   if(!scene||['home','lobby','done'].includes(scene))selectScene('four');
   send({type:'item',index:Number(b.dataset.debugItem),kind:itemKind});return;
  }
  if(b.hasAttribute('data-debug-character')){selectScene(Number(b.dataset.debugCharacter)%2?'six':'four');section='screens';refreshPanel();return}
  if(b.dataset.debugEffect){
   const cue=DEBUG_FX.find(([id])=>id===b.dataset.debugEffect);
   audio.unlock();audio.play(cue[0]);send({type:'effect',kind:cue[0],label:cue[1]});return;
  }
  if(b.dataset.debugMute){audio.setEnabled(!audio.isEnabled());if(audio.isEnabled())audio.unlock();refreshPanel();return;}
  if(b.hasAttribute('data-debug-audit')){results=[];send({type:'audit'});return}
  if(b.hasAttribute('data-debug-audit-all')){results=[];viewport=DEBUG_VIEWPORTS[0];auditQueue=[...DEBUG_VIEWPORTS.slice(1),null];resize();send({type:'audit'});}
 }
 function open(){
  if(isOpen)return;isOpen=true;ready=false;lastFocus=document.activeElement;
  root=document.createElement('div');root.className='bazaar-debug-root';root.innerHTML=markup();
  document.body.append(root);document.body.classList.add('bazaar-debug-open');
  frame=root.querySelector('.dev-frame');root.addEventListener('click',click);
  refreshPanel();observer=new ResizeObserver(resize);observer.observe(root.querySelector('[data-debug-area]'));
  resize();root.querySelector('.dev-close').focus({preventScroll:true});
 }
 function close(){
  if(!isOpen)return;
  isOpen=false;ready=false;auditQueue=null;observer?.disconnect();observer=null;
  root?.remove();root=null;frame=null;document.body.classList.remove('bazaar-debug-open');
  lastFocus?.focus?.({preventScroll:true});
 }
 window.addEventListener('message',receive);
 window.addEventListener('keydown',event=>{
  const textField=event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
  if((event.code==='Backquote'||event.key==='~')&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!textField){
   event.preventDefault();event.stopImmediatePropagation();isOpen?close():open();
  }else if(event.key==='Escape'&&isOpen){event.preventDefault();event.stopImmediatePropagation();close();}
 },true);
 document.querySelectorAll('[data-bazaar-debug-open]').forEach(b=>b.addEventListener('click',open));
 if(new URLSearchParams(location.search).get('debug')==='1')open();
 return {open,close};
}
