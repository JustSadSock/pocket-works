import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { World } from './world';
import {
  COST, LABEL, type Kind, type State,
  build, canBuild, loadGame, saveGame, remove, repair, startWave, tick, wavePlan, newGame, upgrade, pieceAt, maxHP, SIZE
} from './simulation';

function runGame(){
installMobileRuntime();
registerEnhancedUpdate({ appName:'Последний камень', version:'1.1.0',
  releaseNotes:['Строительство с подтверждением, связные стены и полноценный цикл осады и ремонта.'] });
createWorkshopMode({appName:'Последний камень',version:'1.1.0',
  cachePrefix:'last-stone-',storageNamespace:'pocket-works:last-stone'});

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const storage='pocket-works:last-stone:campaign';
const readStorage=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
let state:State=loadGame(readStorage(storage));
let selected:Kind|'remove'|'repair'|'upgrade'='wall';
let hover:[number,number]|null=null,pending:[number,number]|null=null,rotation=0;
const history:string[]=[];let renderTime=0,modalOpen=false,modalPaused=false;
function clearPlacement(){pending=null;hover=null;world.clearPreview();}
function selectTool(tool:typeof selected){selected=tool;clearPlacement();draw();}
let sound=readStorage('pocket-works:last-stone:sound')!=='off',paused=false,speed=1,lastTime=performance.now(),accumulator=0,saveTime=0,noticeTime=0;
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
function message(value:string){const el=$('toast');el.textContent=value;el.classList.add('show');clearTimeout(noticeTime);noticeTime=window.setTimeout(()=>el.classList.remove('show'),2400);}
function bindModalAction(button:HTMLButtonElement,action:()=>void){
  button.onclick=()=>{hideModal();action();};
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
  if(!modalOpen){modalPaused=paused;paused=true;}modalOpen=true;
  clearPlacement();setModalLock(true);
  $('modal-backdrop').classList.remove('hidden');
}
function setModalLock(locked:boolean){
  const start=$<HTMLButtonElement>('start');
  start.disabled=locked;
  for(const surface of document.querySelectorAll<HTMLElement>('[data-ui]'))surface.inert=locked;
}
function hideModal(){
  $('modal-backdrop').classList.add('hidden');
  setModalLock(false);modalOpen=false;paused=modalPaused;draw();
}
const tools=$('tools');
for(const kind of names){
  const b=document.createElement('button');b.type='button';b.dataset.kind=kind;
  const c=COST[kind];
  b.innerHTML=`<span class="tool-symbol">${symbols[kind]}</span><span class="tool-label">${LABEL[kind]}</span><small>${c.stone?c.stone+' ◆ ':''}${c.timber?c.timber+' ▰ ':''}${c.iron?c.iron+' ◇':''}</small>`;
  b.addEventListener('click',()=>{selectTool(kind);beep(270);});
  tools.append(b);
}
function draw(){
  const plan=wavePlan(state.wave);
  $('stone').textContent=String(state.stone);$('timber').textContent=String(state.timber);$('iron').textContent=String(state.iron);
  $('keep').textContent=`${Math.ceil(state.keep)}%`;
  $<HTMLElement>('keep-fill').style.width=`${Math.max(0,state.keep)}%`;
  $('wave-name').textContent=`ОСАДА ${roman[state.wave-1]} / XII`;
  $('intel-title').textContent=sides[plan.side];
  $('intel-copy').textContent=[`${plan.total} штурмующих`,plan.ram?'таран':null,plan.ladder?'лестницы':null,plan.catapult?'катапульта':null].filter(Boolean).join(' · ');
  $('notice').textContent=state.phase==='build'
    ? (selected==='upgrade'?'Усиление: +50% прочности. Цена: ¾ материалов и 1 железо.':selected==='repair'?'Ремонт: выберите повреждённую секцию и подтвердите.':selected==='remove'?'Разборка: выберите секцию. Отменить ход вернёт её.':`${LABEL[selected]}: выберите клетку → подтвердите. Перетаскивание вращает камеру.`)
    : state.phase==='siege'?'Стрелки ведут огонь сами. Следите за воротами и проломами.':
      state.phase==='won'?'Крепость выстояла все двенадцать осад.':'Донжон пал. Кампания окончена.';
  $('siege-strip').classList.toggle('hidden',state.phase!=='siege');$('dock').classList.toggle('hidden',state.phase!=='build');
  $('siege-title').textContent=state.phase==='siege'?`ШТУРМ ${roman[state.wave-1]}`:'ШТУРМ';
  $('siege-count').textContent=`${state.kills} / ${plan.total} повержено`;
  $('sound').textContent=sound?'◖))':'◖×';$('sound').setAttribute('aria-label',sound?'Отключить звук':'Включить звук');
  $('speed').textContent=speed===1?'×1':'×2';$('pause').textContent=paused?'Продолжить':'Пауза';
  for(const button of tools.querySelectorAll<HTMLButtonElement>('button')){
    const kind=button.dataset.kind as Kind;
    button.classList.toggle('active',selected===kind);
    const c=COST[kind];button.classList.toggle('unaffordable',state.stone<c.stone||state.timber<c.timber||state.iron<c.iron);
  }
  $('repair').classList.toggle('active',selected==='repair');$('remove').classList.toggle('active',selected==='remove');$('upgrade').classList.toggle('active',selected==='upgrade');
  world.setBuildMode(state.phase==='build');
  const kind=names.includes(selected as Kind)?selected as Kind:null;
  const cell=pending??hover;
  if(cell&&state.phase==='build')world.preview(...cell,kind,kind?!canBuild(state,kind,...cell):!!pieceAt(state,...cell),rotation,state);
  else world.clearPreview();
  world.showValidity(state,kind);
  $('placement').classList.toggle('hidden',!pending||state.phase!=='build'||modalOpen);
  let error:string|null=null;
  if(pending){
    const p=pieceAt(state,...pending);
    error=kind?canBuild(state,kind,...pending):!p?'Здесь нет постройки':null;
    $('placement-copy').textContent=error??`${kind?LABEL[kind]:selected==='repair'?'Ремонт':selected==='upgrade'?'Улучшение':'Разобрать'} · клетка ${pending[0]+1}:${pending[1]+1}${p?` · ${Math.ceil(p.hp)}/${maxHP(p)} HP · ур. ${p.level}`:''}`;
  }
  $<HTMLButtonElement>('confirm-build').disabled=!!error;
  $<HTMLButtonElement>('rotate-piece').disabled=!kind||kind==='archer'||kind==='tower';
  $<HTMLButtonElement>('undo').disabled=history.length===0;
  const test=window as Window & {__AI_TEST_STATE__?:unknown};
  test.__AI_TEST_STATE__={app:'last-stone',phase:state.phase,wave:state.wave,stone:state.stone,timber:state.timber,
    iron:state.iron,keep:state.keep,pieces:state.pieces.map(p=>({x:p.x,z:p.z,kind:p.kind,hp:p.hp,level:p.level,rotation:p.rotation})),
    enemyPositions:state.enemies.map(e=>({x:e.x,z:e.z,type:e.type,hp:e.hp})),fps:Math.round(world.engine.getFps()),pending,rotation,elapsed:state.elapsed,grid:new URLSearchParams(location.search).has('qa')?Array.from({length:SIZE*SIZE},(_,i)=>({x:i%SIZE,z:Math.floor(i/SIZE),screen:world.tileScreen(i%SIZE,Math.floor(i/SIZE))})):undefined,enemies:state.enemies.length,spawned:state.spawned,kills:state.kills,selected,paused,speed};
}
world.onHover=(x,z)=>{if(!pending&&(!hover||hover[0]!==x||hover[1]!==z)){hover=[x,z];draw();}};
world.onTile=(x,z)=>{
  if(state.phase!=='build'||modalOpen)return;
  pending=[x,z];hover=null;draw();beep(260,.04);
};
$('confirm-build').onclick=()=>{
  if(!pending||state.phase!=='build'||modalOpen)return;
  const [x,z]=pending,snapshot=saveGame(state);
  const error=selected==='remove'?remove(state,x,z):selected==='repair'?repair(state,x,z):selected==='upgrade'?upgrade(state,x,z):build(state,selected,x,z,rotation);
  if(error){message(error);beep(95,.11);draw();return;}
  history.push(snapshot);if(history.length>20)history.shift();
  clearPlacement();beep(selected==='remove'?140:320,.09);save();world.update(state,0);draw();
};
$('cancel-build').onclick=()=>{clearPlacement();draw();};
$('rotate-piece').onclick=()=>{rotation=1-rotation;draw();};
$('undo').onclick=()=>{if(state.phase!=='build'||!history.length)return;state=loadGame(history.pop()!);clearPlacement();save();world.update(state,0);draw();};
$('repair').onclick=()=>{selectTool('repair');};
$('upgrade').onclick=()=>{selectTool('upgrade');};
$('remove').onclick=()=>{selectTool('remove');};
$('start').onclick=()=>{
  if(!state.pieces.some(p=>p.kind==='tower'||p.kind==='archer')) {
    message('Поставьте хотя бы одну башню или лучников');return;
  }
  clearPlacement();history.length=0;accumulator=0;startWave(state);paused=false;speed=1;save();draw();beep(110,.3,.07);
};
$('speed').onclick=()=>{speed=speed===1?2:1;draw();beep(350);};
$('pause').onclick=()=>{paused=!paused;draw();beep(230);};
$('orbit').onclick=()=>{world.orbit();beep(250);};
$('overview').onclick=()=>{world.overview();beep(250);};
$('sound').onclick=()=>{
  sound=!sound;try{localStorage.setItem('pocket-works:last-stone:sound',sound?'on':'off');}catch{}$('sound').textContent=sound?'◖))':'◖×';
  $('sound').setAttribute('aria-label',sound?'Отключить звук':'Включить звук');if(sound)beep(320);
};
$('help').onclick=()=>modal('Как удержать крепость',
  'Стройте из камня, дерева и железа. Стены задерживают врагов, башни и лучники стреляют автоматически, ворота слабее камня, укрепление снижает урон соседним секциям. После каждой волны чините повреждения: награда ограничена.',
  'ПОНЯТНО',()=>{}, {label:'Новая кампания',action:restart});
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
    'ДА, НАЧАТЬ ЗАНОВО',()=>{state=newGame();selected='wall';history.length=0;clearPlacement();save();world.update(state,0);draw();message('Выберите постройку и коснитесь клетки на земле.');},
    {label:'Отмена',action:()=>{}});
}
function frame(now:number){
  const delta=Math.min(.1,(now-lastTime)/1000);lastTime=now;
  if(!document.hidden&&state.phase==='siege'&&!paused){
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
        if(state.phase==='build') {clearPlacement();save();draw();modal('Осада отражена.',`Повержено: ${state.kills}. Донжон: ${Math.ceil(state.keep)}%. Выжившие стены сохраняют повреждения. Доставлено ${wavePlan(state.wave-1).reward.stone} камня: восстановите проломы и усилите слабые секции. Следующий удар — ${sides[wavePlan(state.wave).side].toLowerCase()}.`,'ВОССТАНОВИТЬ ЗАМОК',()=>{});beep(540,.3,.07);}
        else end();
        break;
      }
    }
    if(now-saveTime>3000){saveTime=now;save();}
  }
  if(now-renderTime>150&&!document.hidden){draw();renderTime=now;}
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();accumulator=0;if(document.hidden)save();});
window.addEventListener('pagehide',save);
world.update(state,0);draw();
if(state.phase==='won'||state.phase==='lost')end();
else if(!readStorage(storage))message('Выберите клетку на земле и подтвердите постройку.');
requestAnimationFrame(frame);
}

try { runGame(); }
catch (error) {
  const title=document.getElementById('modal-title');
  const copy=document.getElementById('modal-copy');
  for(const el of document.querySelectorAll<HTMLElement>('[data-ui]'))el.inert=false;
  const primary=document.getElementById('modal-primary') as HTMLButtonElement|null;
  if(title)title.textContent='Не удалось открыть крепость';
  if(copy)copy.textContent='Для трёхмерной сцены нужен WebGL. Проверьте настройки браузера или попробуйте открыть игру на другом устройстве.';
  if(primary){primary.textContent='← В POCKETWORKS';primary.onclick=()=>{location.href='../../';};}
  document.getElementById('modal-backdrop')?.classList.remove('hidden');
  console.warn('Last Stone startup unavailable:',error);
}
