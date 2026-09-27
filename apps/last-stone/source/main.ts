import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { World } from './world';
import {
  COST, LABEL, type Kind, type State,
  build, canBuild, loadGame, saveGame, remove, repair, startWave, tick, wavePlan, newGame
} from './simulation';

function runGame(){
installMobileRuntime();
registerEnhancedUpdate({ appName:'Последний камень', version:'1.0.0',
  releaseNotes:['Строительство 3D-крепости, двенадцать осад, разрушение стен и сохранение кампании.'] });
createWorkshopMode({appName:'Последний камень',version:'1.0.0',
  cachePrefix:'last-stone-',storageNamespace:'pocket-works:last-stone'});

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const storage='pocket-works:last-stone:campaign';
let state:State=loadGame(localStorage.getItem(storage));
let selected:Kind|'remove'|'repair'='wall';
let hover:[number,number]|null=null;
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
function message(value:string){const el=$('toast');el.textContent=value;el.classList.add('show');clearTimeout(noticeTime);noticeTime=window.setTimeout(()=>el.classList.remove('show'),2400);}
function modal(title:string,copy:string,primary:string,action:()=>void,secondary?:{label:string;action:()=>void}){
  $('modal-title').textContent=title;$('modal-copy').textContent=copy;
  $('modal-primary').textContent=primary;
  $('modal-primary').onclick=()=>{hideModal();action();};
  const other=$<HTMLButtonElement>('modal-secondary');other.classList.toggle('hidden',!secondary);
  other.textContent=secondary?.label??'';other.onclick=secondary?()=>{hideModal();secondary.action();}:null;
  $('modal-backdrop').classList.remove('hidden');
}
function hideModal(){$('modal-backdrop').classList.add('hidden');}
function intro(){
  modal('Замок держится на ваших решениях.',
    'Выберите постройку внизу и коснитесь земли. Камеру можно вращать пальцем. Перед штурмом разведка покажет направление удара. Постройте защиту, переживите осаду и используйте награду для следующей.',
    'К СТРОИТЕЛЬСТВУ →',()=>{});
}
const tools=$('tools');
for(const kind of names){
  const b=document.createElement('button');b.type='button';b.dataset.kind=kind;
  const c=COST[kind];
  b.innerHTML=`<span class="tool-symbol">${symbols[kind]}</span><span class="tool-label">${LABEL[kind]}</span><small>${c.stone?c.stone+' ◆ ':''}${c.timber?c.timber+' ▰ ':''}${c.iron?c.iron+' ◇':''}</small>`;
  b.addEventListener('click',()=>{selected=kind;draw();beep(270);message(`${LABEL[kind]}: коснитесь клетки на земле`);});
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
    ? 'Выберите элемент и коснитесь земли. Зажмите и ведите для поворота камеры.'
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
  $('repair').classList.toggle('active',selected==='repair');$('remove').classList.toggle('active',selected==='remove');
  if(hover) world.preview(...hover,selected==='repair'||selected==='remove'?null:selected,
    selected==='repair'||selected==='remove'?true:!canBuild(state,selected,...hover));
  const test=window as Window & {__AI_TEST_STATE__?:unknown};
  test.__AI_TEST_STATE__={app:'last-stone',phase:state.phase,wave:state.wave,stone:state.stone,timber:state.timber,
    iron:state.iron,keep:state.keep,pieces:state.pieces.map(p=>({x:p.x,z:p.z,kind:p.kind,hp:p.hp})),
    enemies:state.enemies.length,spawned:state.spawned,kills:state.kills,selected,paused,speed};
}
world.onHover=(x,z)=>{hover=[x,z];draw();};
world.onTile=(x,z)=>{
  hover=[x,z];if(state.phase!=='build')return;
  let error:string|null=null;
  if(selected==='remove')error=remove(state,x,z);
  else if(selected==='repair')error=repair(state,x,z);
  else error=build(state,selected,x,z);
  if(error){message(error);beep(95,.11);draw();return;}
  beep(selected==='remove'?140:320,.09);save();draw();world.update(state,0);
};
$('repair').onclick=()=>{selected='repair';draw();message('Коснитесь повреждённой постройки');};
$('remove').onclick=()=>{selected='remove';draw();message('Разборка возвращает часть материалов');};
$('start').onclick=()=>{
  if(!state.pieces.some(p=>p.kind==='tower'||p.kind==='archer')) {
    message('Поставьте хотя бы одну башню или лучников');return;
  }
  startWave(state);paused=false;speed=1;save();draw();beep(110,.3,.07);
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
    'ДА, НАЧАТЬ ЗАНОВО',()=>{state=newGame();selected='wall';save();world.update(state,0);draw();intro();},
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
else if(!localStorage.getItem(storage))intro();
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
