import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { World } from './world';
import {
  COST, LABEL, MAX_LEVEL, type Kind, type State,
  build, canBuild, loadGame, saveGame, remove, repair, repairCost, upgrade, upgradeCost,
  pieceAt, pieceMaxHp, startWave, tick, wavePlan, newGame
} from './simulation';

function runGame(){
installMobileRuntime();
registerEnhancedUpdate({ appName:'Последний камень', version:'1.1.0',
  releaseNotes:['Строительство теперь подтверждается перед расходом ресурсов.','Добавлены усиления до III уровня, улучшенный ремонт и более читаемый feedback проломов.'] });
createWorkshopMode({appName:'Последний камень',version:'1.1.0',
  cachePrefix:'last-stone-',storageNamespace:'pocket-works:last-stone'});

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const storage='pocket-works:last-stone:campaign';
let state:State=loadGame(localStorage.getItem(storage));
type ActionMode=Kind|'remove'|'repair'|'upgrade';
interface PendingAction { mode:ActionMode; x:number; z:number }
let selected:ActionMode='wall';
let hover:[number,number]|null=null;
let pending:PendingAction|null=null;
let sound=true,paused=false,speed=1,lastTime=performance.now(),accumulator=0,saveTime=0,noticeTime=0;
let audio:AudioContext|null=null;
const world=new World($<HTMLCanvasElement>('world'),$('app'));
const names:Kind[]=['wall','tower','gate','archer','brace'];
const symbols:Record<Kind,string>={wall:'▥',tower:'♜',gate:'⌑',archer:'⌁',brace:'◢'};
const sides:Record<string,string>={north:'СЕВЕРНЫЙ ТРАКТ',east:'ВОСТОЧНЫЙ СКЛОН',south:'ЮЖНАЯ ДОРОГА',west:'ЗАПАДНЫЙ ПЕРЕВАЛ'};
const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function save(){try{localStorage.setItem(storage,saveGame(state));}catch{message('Не удалось сохранить игру');}}
function beep(note=180,duration=.07,volume=.035){
  if(!sound)return;
  try{
    audio??=new AudioContext();
    if(audio.state==='suspended')void audio.resume();
    const osc=audio.createOscillator(),gain=audio.createGain();
    osc.type='triangle';osc.frequency.setValueAtTime(note,audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40,note*.62),audio.currentTime+duration);
    gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
  }catch { /* Audio is optional. */ }
}
function haptic(ms=12){try{navigator.vibrate?.(ms);}catch{/* Optional tactile feedback. */}}
function costText(cost:{stone:number;timber:number;iron:number}){
  return [cost.stone?`${cost.stone} ◆`:'',cost.timber?`${cost.timber} ▰`:'',cost.iron?`${cost.iron} ◇`:''].filter(Boolean).join(' · ')||'без материалов';
}
function actionError(item:PendingAction):string|null{
  if(item.mode!=='repair'&&item.mode!=='remove'&&item.mode!=='upgrade')return canBuild(state,item.mode,item.x,item.z);
  const p=pieceAt(state,item.x,item.z);if(!p)return 'На этой клетке нет постройки';
  if(item.mode==='repair'){
    if(p.hp>=pieceMaxHp(p))return 'Постройка не повреждена';
    const q=repairCost(p);if(state.stone<q.stone||state.timber<q.timber||state.iron<q.iron)return 'Не хватает материалов для ремонта';
  }
  if(item.mode==='upgrade'){
    if(p.level>=MAX_LEVEL)return 'Усиление III — максимум';
    const q=upgradeCost(p);if(state.stone<q.stone||state.timber<q.timber||state.iron<q.iron)return 'Не хватает материалов для усиления';
  }
  return null;
}
function updatePendingUI(){
  const bar=$('action-bar'),confirm=$<HTMLButtonElement>('action-confirm');
  if(!pending||state.phase!=='build'){bar.classList.add('hidden');return;}
  bar.classList.remove('hidden');
  const p=pieceAt(state,pending.x,pending.z),err=actionError(pending);
  let title='',detail='';
  if(pending.mode!=='repair'&&pending.mode!=='remove'&&pending.mode!=='upgrade'){
    title=`${LABEL[pending.mode]} · клетка ${pending.x+1}:${pending.z+1}`;
    detail=err??`Стоимость: ${costText(COST[pending.mode])}`;
    confirm.textContent='ПОСТРОИТЬ';
  }else if(p){
    title=`${LABEL[p.kind]} · уровень ${p.level}`;
    if(pending.mode==='repair'){const q=repairCost(p);detail=err??`Ремонт: ${costText(q)} · прочность ${Math.ceil(p.hp)}/${pieceMaxHp(p)}`;confirm.textContent='ПОЧИНИТЬ';}
    else if(pending.mode==='upgrade'){const q=upgradeCost(p);detail=err??`Усиление до уровня ${p.level+1}: ${costText(q)}`;confirm.textContent='УСИЛИТЬ';}
    else {detail='Разборка вернёт часть материалов. Действие подтверждается здесь.';confirm.textContent='РАЗОБРАТЬ';}
  }else {title='Пустая клетка';detail=err??'';confirm.textContent='ПОДТВЕРДИТЬ';}
  $('action-title').textContent=title;$('action-detail').textContent=err??detail;
  bar.classList.toggle('invalid',!!err);confirm.disabled=!!err;
}
function message(value:string){const el=$('toast');el.textContent=value;el.classList.add('show');clearTimeout(noticeTime);noticeTime=window.setTimeout(()=>el.classList.remove('show'),2400);}
function bindModalAction(button:HTMLButtonElement,action:()=>void){
  let fired=false;
  const activate=(event:Event)=>{
    if(fired)return;
    fired=true;
    event.preventDefault();
    event.stopPropagation();
    hideModal();
    action();
  };
  button.onclick=activate;
  button.onpointerup=activate;
  button.ontouchend=activate;
}
function modal(title:string,copy:string,primary:string,action:()=>void,secondary?:{label:string;action:()=>void}){
  $('modal-title').textContent=title;$('modal-copy').textContent=copy;
  const primaryButton=$<HTMLButtonElement>('modal-primary');
  primaryButton.textContent=primary;
  bindModalAction(primaryButton,action);
  const other=$<HTMLButtonElement>('modal-secondary');
  other.classList.toggle('hidden',!secondary);
  other.textContent=secondary?.label??'';
  if(secondary)bindModalAction(other,secondary.action);
  else {other.onclick=null;other.onpointerup=null;other.ontouchend=null;}
  setModalLock(true);
  $('modal-backdrop').classList.remove('hidden');
}
function setModalLock(locked:boolean){
  const start=$<HTMLButtonElement>('start');
  start.disabled=locked;
  for(const surface of document.querySelectorAll<HTMLElement>('[data-ui]'))surface.inert=locked;
}
function hideModal(){
  $('modal-backdrop').classList.add('hidden');
  setModalLock(false);
}
function intro(){
  modal('Замок держится на ваших решениях.',
    'Выберите постройку внизу: на земле появится строительная сетка. Коснитесь клетки — она подсветится, а постройка встанет в неё. Камеру можно вращать пальцем. Перед штурмом разведка покажет направление удара.',
    'НАЧАТЬ СТРОИТЕЛЬСТВО →',()=>{});
}
const tools=$('tools');
for(const kind of names){
  const b=document.createElement('button');b.type='button';b.dataset.kind=kind;
  const c=COST[kind];
  b.innerHTML=`<span class="tool-symbol">${symbols[kind]}</span><span class="tool-label">${LABEL[kind]}</span><small>${c.stone?c.stone+' ◆ ':''}${c.timber?c.timber+' ▰ ':''}${c.iron?c.iron+' ◇':''}</small>`;
  b.addEventListener('click',()=>{selected=kind;pending=null;draw();beep(270);message(`${LABEL[kind]}: выберите клетку, затем подтвердите строительство`);});
  tools.append(b);
}
function draw(){
  const plan=wavePlan(state.wave);
  $('stone').textContent=String(state.stone);$('timber').textContent=String(state.timber);$('iron').textContent=String(state.iron);
  $('keep').textContent=`${Math.ceil(state.keep)}%`;
  $<HTMLElement>('keep-fill').style.width=`${Math.max(0,state.keep)}%`;
  $('wave-name').textContent=`ОСАДА ${roman[state.wave-1]} / XII`;
  $('intel-title').textContent=sides[plan.side];
  $('intel-copy').textContent=state.wave<2?'Пехота идёт к донжону. Перекройте ей путь.':
    [`${plan.total} штурмующих`,plan.ram?'таран':null,plan.ladder?'лестницы':null,plan.catapult?'катапульта':null].filter(Boolean).join(' · ');
  $('notice').textContent=state.phase==='build'
    ? 'Сетка — доступные клетки. Выберите элемент и коснитесь клетки для строительства.'
    : state.phase==='siege'?'Стрелки ведут огонь сами. Следите за воротами и проломами.':
      state.phase==='won'?'Крепость выстояла все двенадцать осад.':'Донжон пал. Кампания окончена.';
  $('siege-strip').classList.toggle('hidden',state.phase!=='siege');$('dock').classList.toggle('hidden',state.phase!=='build');
  $('siege-title').textContent=state.phase==='siege'?`ШТУРМ ${roman[state.wave-1]}`:'ШТУРМ';
  $('siege-count').textContent=`${state.kills} / ${plan.total} повержено`;
  $('speed').textContent=speed===1?'×1':'×2';$('pause').textContent=paused?'Продолжить':'Пауза';
  for(const button of tools.querySelectorAll<HTMLButtonElement>('button')){
    const kind=button.dataset.kind as Kind;
    button.classList.toggle('active',selected===kind);
    const c=COST[kind];button.classList.toggle('unaffordable',state.stone<c.stone||state.timber<c.timber||state.iron<c.iron);
  }
  $('repair').classList.toggle('active',selected==='repair');$('remove').classList.toggle('active',selected==='remove');$('upgrade').classList.toggle('active',selected==='upgrade');
  world.setBuildMode(state.phase==='build');
  const focus=pending?[pending.x,pending.z] as [number,number]:hover;
  const mode=pending?.mode??selected;
  if(focus&&state.phase==='build') world.preview(...focus,mode==='repair'||mode==='remove'||mode==='upgrade'?null:mode,
    mode==='repair'||mode==='remove'||mode==='upgrade'?!actionError({mode,x:focus[0],z:focus[1]}):!canBuild(state,mode,...focus));
  updatePendingUI();
  const test=window as Window & {__AI_TEST_STATE__?:unknown};
  test.__AI_TEST_STATE__={app:'last-stone',phase:state.phase,wave:state.wave,stone:state.stone,timber:state.timber,
    iron:state.iron,keep:state.keep,pieces:state.pieces.map(p=>({x:p.x,z:p.z,kind:p.kind,hp:p.hp})),
    enemies:state.enemies.length,spawned:state.spawned,kills:state.kills,selected,pending,paused,speed};
}
world.onHover=(x,z)=>{hover=[x,z];draw();};
world.onTile=(x,z)=>{
  hover=[x,z];if(state.phase!=='build')return;
  pending={mode:selected,x,z};
  const error=actionError(pending);
  if(error){beep(105,.08);message(error);}else{beep(250,.05);haptic(8);}
  draw();
};
$('action-cancel').onclick=()=>{pending=null;draw();beep(170,.05);};
$('action-confirm').onclick=()=>{
  if(!pending)return;
  const item=pending,error=actionError(item);if(error){message(error);beep(95,.11);draw();return;}
  let result:string|null=null;
  if(item.mode==='remove')result=remove(state,item.x,item.z);
  else if(item.mode==='repair')result=repair(state,item.x,item.z);
  else if(item.mode==='upgrade')result=upgrade(state,item.x,item.z);
  else result=build(state,item.mode,item.x,item.z);
  if(result){message(result);beep(95,.11);draw();return;}
  pending=null;beep(item.mode==='remove'?140:item.mode==='upgrade'?430:320,.09);haptic(item.mode==='remove'?18:12);
  save();world.update(state,0);draw();
};
$('repair').onclick=()=>{selected='repair';pending=null;draw();message('Выберите повреждённую постройку и подтвердите ремонт');};
$('remove').onclick=()=>{selected='remove';pending=null;draw();message('Выберите постройку — разборка потребует подтверждения');};
$('upgrade').onclick=()=>{selected='upgrade';pending=null;draw();message('Выберите постройку для усиления до III уровня');};
$('start').onclick=()=>{
  if(pending){message('Сначала подтвердите или отмените выбранное действие');beep(120,.08);return;}
  if(!state.pieces.some(p=>p.kind==='tower'||p.kind==='archer')) {
    message('Поставьте хотя бы одну башню или лучников');return;
  }
  pending=null;startWave(state);paused=false;speed=1;save();draw();beep(110,.3,.07);haptic(24);
};
$('speed').onclick=()=>{speed=speed===1?2:1;draw();beep(350);};
$('pause').onclick=()=>{paused=!paused;draw();beep(230);};
$('orbit').onclick=()=>{world.orbit();beep(250);};
$('overview').onclick=()=>{world.overview();beep(250);};
$('sound').onclick=()=>{
  sound=!sound;$('sound').textContent=sound?'◖))':'◖×';
  $('sound').setAttribute('aria-label',sound?'Отключить звук':'Включить звук');if(sound)beep(320);
};
$('help').onclick=()=>modal('Как удержать крепость',
  'Стройте из камня, дерева и железа. Стены задерживают врагов, башни и лучники стреляют автоматически, ворота слабее камня, укрепление снижает урон соседним секциям. После каждой волны чините повреждения: награда ограничена.',
  'ПОНЯТНО',()=>{});
$('exit').onclick=()=>{save();location.href='../../';};
function end(){
  save();draw();
  if(state.phase==='won')modal('Крепость выстояла.',
    `Двенадцать штурмов отражены. Итог: ${state.score} очков. Каждая стена и каждый пролом здесь были результатом вашего плана.`,
    'ОСМОТРЕТЬ КРЕПОСТЬ',()=>{}, {label:'Новая кампания',action:restart});
  else modal('Донжон пал.',
    `Оборона выдержала до осады ${roman[state.wave-1]}. Перестройте стены, защитите подход и попробуйте снова.`,
    'ОСМОТРЕТЬ РУИНЫ',()=>{}, {label:'Новая кампания',action:restart});
}
function restart(){
  modal('Начать новую кампанию?','Текущая крепость и её прогресс будут удалены.',
    'ДА, НАЧАТЬ ЗАНОВО',()=>{state=newGame();selected='wall';pending=null;save();world.update(state,0);draw();message('Выберите постройку, клетку и подтвердите размещение.');},
    {label:'Отмена',action:()=>{}});
}
function frame(now:number){
  const delta=Math.min(.1,(now-lastTime)/1000);lastTime=now;
  if(state.phase==='siege'&&!paused){
    accumulator+=delta*speed;
    let n=0;while(accumulator>=1/30&&n<6){
      const previous=state.phase;
      tick(state,1/30);world.update(state,1/30);accumulator-=1/30;n++;
      for(const event of state.events){
        if(event.type==='break')beep(94,.27,.055);
        else if(event.type==='keep')beep(72,.14,.048);
        else if(event.type==='shot'&&Math.random()<.1)beep(135,.06,.01);
      }
      if(previous==='siege'&&state.phase!=='siege'){
        if(state.phase==='build') {save();message('Осада отражена. Материалы доставлены.');beep(540,.3,.07);}
        else end();
        break;
      }
    }
    if(now-saveTime>3000){saveTime=now;save();}
    draw();
  }
  requestAnimationFrame(frame);
}
world.update(state,0);draw();
if(state.phase==='won'||state.phase==='lost')end();
else if(!localStorage.getItem(storage))message('Выберите постройку, коснитесь клетки и подтвердите размещение.');
requestAnimationFrame(frame);
}

try { runGame(); }
catch (error) {
  const title=document.getElementById('modal-title');
  const copy=document.getElementById('modal-copy');
  const primary=document.getElementById('modal-primary') as HTMLButtonElement|null;
  if(title)title.textContent='Не удалось открыть крепость';
  if(copy)copy.textContent='Для трёхмерной сцены нужен WebGL. Проверьте настройки браузера или попробуйте открыть игру на другом устройстве.';
  if(primary){primary.textContent='← В POCKETWORKS';primary.onclick=()=>{location.href='../../';};}
  document.getElementById('modal-backdrop')?.classList.remove('hidden');
  console.warn('Last Stone startup unavailable:',error);
}
