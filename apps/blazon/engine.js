export const VERSION = 4;
export const BATTLE_COUNT = 6;
export const WORLD_WIDTH = 720;
export const WORLD_HEIGHT = 1120;

export const TINCTURES = {
  gules:{id:'gules',name:'Червлень',color:'#982f35',contrast:'#f2d37d',ink:'#f8e7bd'},
  azure:{id:'azure',name:'Лазурь',color:'#214f83',contrast:'#e9ddd0',ink:'#f4ebdb'},
  argent:{id:'argent',name:'Серебро',color:'#e6e0d2',contrast:'#8e2730',ink:'#211e1a'},
  sable:{id:'sable',name:'Чернь',color:'#202522',contrast:'#d6ad48',ink:'#f4e5bd'}
};
export const FIELDS = {
  gules:{id:'gules',name:'Червлень',epithet:'Обязательство',summary:'Вступивший в бой отряд доводит атаку до конца.',principle:'pressure',detail:'Меньше метаний, больше риска пропустить угрозу на фланге.'},
  azure:{id:'azure',name:'Лазурь',epithet:'Переоценка',summary:'Отряды регулярно ищут более выгодную цель и маршрут.',principle:'adaptation',detail:'Гибкая армия, но её давление легче сбить.'},
  argent:{id:'argent',name:'Серебро',epithet:'Связность',summary:'Отряды предпочитают сохранять взаимную поддержку.',principle:'cohesion',detail:'Строй трудно разорвать, но он склонен уплотняться.'},
  sable:{id:'sable',name:'Чернь',epithet:'Скрытый резерв',summary:'Часть войск ждёт, пока враг раскроет главный удар.',principle:'reserve',detail:'Сильный ответ ценой более тонкой первой линии.'}
};
export const ORDINARIES = {
  pale:{id:'pale',name:'Столб',summary:'Узкий глубокий центр и подача резервов по оси.',principle:'pressure'},
  fess:{id:'fess',name:'Пояс',summary:'Две широкие линии, способные сменять друг друга.',principle:'cohesion'},
  bend:{id:'bend',name:'Перевязь',summary:'Косой удар: одно крыло входит в бой раньше.',principle:'adaptation'},
  chevron:{id:'chevron',name:'Стропило',summary:'Вогнутый фронт принимает врага и закрывает крылья.',principle:'cohesion'}
};
export const MAINS = {
  lion:{id:'lion',name:'Лев',summary:'Два ближайших отряда совместно уничтожают одну цель.',principle:'pressure'},
  boar:{id:'boar',name:'Вепрь',summary:'После разрыва строя ратники идут в глубину, а не вязнут по краям.',principle:'breach'},
  tower:{id:'tower',name:'Башня',summary:'Удержанные позиции становятся точками повторного сбора.',principle:'recovery'},
  stag:{id:'stag',name:'Олень',summary:'Уступающий отряд отходит к союзнику и возвращается вместе с ним.',principle:'adaptation'}
};
export const SECONDARIES = {
  eagle:{id:'eagle',name:'Орёл',summary:'Лучники ищут изолированные цели и свободные сектора стрельбы.',principle:'adaptation'},
  rose:{id:'rose',name:'Роза',summary:'Каждое отделение лучников следует за своим отрядом ратников.',principle:'cohesion'},
  key:{id:'key',name:'Ключ',summary:'Лучники смещаются к пролому и ведут огонь в его глубину.',principle:'breach'},
  sun:{id:'sun',name:'Солнце',summary:'Свободные лучники сосредотачивают залп на одной пошатнувшейся цели.',principle:'pressure'}
};
export const COMMANDS = {
  crown:{id:'crown',name:'Корона',summary:'Один ведущий отряд задаёт соседям цель и направление.',principle:'cohesion'},
  helmet:{id:'helmet',name:'Шлем',summary:'Первые двадцать секунд армия следует заранее выбранной оси удара.',principle:'pressure'},
  chain:{id:'chain',name:'Цепь ордена',summary:'Главный инстинкт ждёт первого кризиса и не срабатывает преждевременно.',principle:'reserve'}
};
export const MOTTOS = {
  breach:{id:'breach',name:'IN RUPTURAM',label:'В пролом',summary:'Первый свободный резерв немедленно входит в открывшийся разрыв.',principle:'breach'},
  banner:{id:'banner',name:'SIGNUM PRIMUM',label:'Знамя прежде',summary:'При угрозе знамени два ближайших отряда бросают текущие задачи.',principle:'recovery'},
  together:{id:'together',name:'UNA STAMUS',label:'Стать вместе',summary:'Два пошатнувшихся отряда сходятся и образуют новую линию.',principle:'cohesion'},
  volley:{id:'volley',name:'ULTIMA SAGITTA',label:'Последний залп',summary:'Перед первым общим отходом лучники дают единый залп.',principle:'pressure'}
};
export const SLOT_ORDER = ['main','secondary','command','motto'];
export const CATALOGS = {field:FIELDS,ordinary:ORDINARIES,main:MAINS,secondary:SECONDARIES,command:COMMANDS,motto:MOTTOS};

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
export function normalizeSeed(seed){const n=Number(seed);return Number.isFinite(n)?(Math.abs(Math.floor(n))||1)>>>0:(Date.now()>>>0);}
function rand(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
function pick(s,a){return a[Math.floor(rand(s)*a.length)]??a[0];}
function shuffled(s,a){const o=[...a];for(let i=o.length-1;i>0;i--){const j=Math.floor(rand(s)*(i+1));[o[i],o[j]]=[o[j],o[i]];}return o;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

export function emptyDoctrine(field='gules',ordinary='pale'){return{field,ordinary,main:null,secondary:null,command:null,motto:null,axis:'center'};}
export function createCampaign(field='gules',ordinary='pale',seed=Date.now()){
  const s=normalizeSeed(seed);return{version:VERSION,seed:s,rng:s,battleIndex:0,integrity:3,victories:0,doctrine:emptyDoctrine(field,ordinary),phase:'briefing',completed:false,currentEnemy:null,currentSeed:null,lastResult:null,offers:[],revisionSlot:null};
}
export function hydrateCampaign(value){if(!value||!value.doctrine)return null;const c=clone(value);c.version=VERSION;c.integrity=clamp(Number(c.integrity)||0,0,3);c.battleIndex=clamp(Number(c.battleIndex)||0,0,BATTLE_COUNT-1);return c;}
export function doctrineLayers(d){return['field','ordinary','main','secondary','command','motto'].map(slot=>({slot,id:d[slot],definition:d[slot]?CATALOGS[slot][d[slot]]:null}));}
export function doctrineName(d){return`${d.main?MAINS[d.main].name:'Безымянное знамя'} · ${FIELDS[d.field]?.epithet||''}`;}
export function nextUpgradeSlot(c){if(c.battleIndex>=1&&c.battleIndex<=SLOT_ORDER.length)return SLOT_ORDER[c.battleIndex-1];if(c.battleIndex===5)return'revision';return null;}
export function generateOffers(c){const slot=nextUpgradeSlot(c);if(!slot)return[];if(slot!=='revision')return shuffled(c,Object.keys(CATALOGS[slot])).slice(0,3).map(id=>({slot,id,definition:CATALOGS[slot][id],replaces:c.doctrine[slot]||null}));const out=[];for(const key of shuffled(c,['field','ordinary','main','secondary'].filter(k=>c.doctrine[k]))){const id=shuffled(c,Object.keys(CATALOGS[key]).filter(v=>v!==c.doctrine[key]))[0];if(id)out.push({slot:key,id,definition:CATALOGS[key][id],replaces:c.doctrine[key],revision:true});if(out.length===3)break;}return out;}
export function applyOffer(c,o){const n=clone(c);n.doctrine[o.slot]=o.id;n.offers=[];n.phase='briefing';n.lastResult=null;return n;}
function doctrineForStage(s,stage){const d=emptyDoctrine(pick(s,Object.keys(FIELDS)),pick(s,Object.keys(ORDINARIES)));if(stage>=1)d.main=pick(s,Object.keys(MAINS));if(stage>=2)d.secondary=pick(s,Object.keys(SECONDARIES));if(stage>=3)d.command=pick(s,Object.keys(COMMANDS));if(stage>=4)d.motto=pick(s,Object.keys(MOTTOS));d.axis=pick(s,['left','center','right']);return d;}
export function prepareBattle(c){const n=clone(c);if(!n.currentEnemy)n.currentEnemy=doctrineForStage(n,n.battleIndex);if(!n.currentSeed)n.currentSeed=(n.seed^Math.imul(n.battleIndex+1,0x9e3779b9))>>>0;n.phase='briefing';return n;}
export function recordBattle(c,result){const n=clone(c),{replay,...persistable}=result;n.lastResult=clone(persistable);n.currentEnemy=null;n.currentSeed=null;if(result.winner==='player')n.victories++;else n.integrity--;if(n.integrity<=0||n.battleIndex>=BATTLE_COUNT-1){n.completed=true;n.phase='ending';return n;}n.battleIndex++;n.phase='reward';n.offers=generateOffers(n);return n;}

const FORWARD={player:-1,enemy:1};
const BANNER_Y={player:1030,enemy:90};
const FRONT_Y={player:790,enemy:330};
const BASE_X=[135,285,435,585];
function formationPositions(side,ordinary){
  const dir=FORWARD[side],front=FRONT_Y[side];
  const points=BASE_X.map((x,i)=>({x,y:front}));
  if(ordinary==='pale'){
    const xs=[270,330,390,450],depth=[-66,-20,26,72];
    return xs.map((x,i)=>({x,y:front-dir*depth[i]}));
  }
  if(ordinary==='fess')return points.map((p,i)=>({x:p.x,y:front-dir*(i>1?35:-10)}));
  if(ordinary==='bend')return points.map((p,i)=>({x:p.x,y:front+dir*((i-1.5)*38)}));
  if(ordinary==='chevron')return points.map((p,i)=>({x:p.x,y:front-dir*((i===0||i===3)?34:-18)}));
  return points;
}
function makeMember(state,squad,index){
  const infantry=squad.type==='infantry',cols=infantry?4:2,row=Math.floor(index/cols),col=index%cols;
  const x=(col-(cols-1)/2)*(infantry?16:22),y=(row-.5)*(infantry?16:20)*-FORWARD[squad.side];
  return{id:`${squad.id}-m${index}`,squadId:squad.id,side:squad.side,type:squad.type,index,x:squad.x+x+(rand(state)-.5)*3,y:squad.y+y+(rand(state)-.5)*3,vx:0,vy:0,hp:1,morale:1,state:'forming',targetId:null,cooldown:rand(state)*(infantry?.8:1.8),phase:rand(state)*Math.PI*2,hitFlash:0,fallenAt:null,facingY:FORWARD[squad.side],slotIndex:index,slotX:0,slotY:0,engagedBy:0};
}
function makeSquad(state,side,type,index,p,doctrine){
  const dir=FORWARD[side],archer=type==='archer',y=p.y-dir*(archer?118:0);
  const volleyOffset=doctrine.secondary==='sun'?.75:rand(state)*1.15;
  const squad={id:`${side}-${archer?'a':'i'}${index}`,side,type,index,x:p.x,y,formX:p.x,formY:y,goalX:p.x,goalY:y,homeX:p.x,homeY:y,state:archer?'support':'advance',targetSquadId:null,leader:!archer&&index===1,reserve:doctrine.field==='sable'&&index===3,anchor:null,broken:false,breakAnnounced:false,morale:1,cohesion:1,strength:archer?4:8,maxStrength:archer?4:8,rethink:rand(state)*.45,engagedRatio:0,holdTime:0,pairedId:`${side}-i${index}`,lastRule:'ordinary',members:[],slotRefresh:0,volleyClock:.8+volleyOffset,volleyPhase:'idle',volleyDraw:0,volleySerial:0,forcedVolley:false,rulePulse:{}};
  const count=archer?4:8;for(let i=0;i<count;i++)squad.members.push(makeMember(state,squad,i));return squad;
}
function makeArmy(state,side,doctrine){const p=formationPositions(side,doctrine.ordinary);return{side,doctrine:clone(doctrine),infantry:p.map((q,i)=>makeSquad(state,side,'infantry',i,q,doctrine)),archers:p.map((q,i)=>makeSquad(state,side,'archer',i,q,doctrine)),banner:{x:360,y:BANNER_Y[side],capture:0},brokenCount:0,mottoUsed:false,crisis:false,globalRetreat:false,focusSquadId:null};}
export function createBattleState(playerDoctrine,enemyDoctrine,seed=1,options={}){
  const state={version:4,rng:normalizeSeed(seed),time:0,status:'running',winner:null,player:null,enemy:null,events:[],arrows:[],effects:[],signals:[],decisive:[],keyEvents:[],replay:[],snapshotClock:0,impact:0,firstContact:false,frontY:WORLD_HEIGHT/2,finishReason:null,captureReplay:options.captureReplay!==false,metrics:{player:{volleys:0,arrowHits:0,kills:0,signals:{}},enemy:{volleys:0,arrowHits:0,kills:0,signals:{}}}};
  state.player=makeArmy(state,'player',playerDoctrine);state.enemy=makeArmy(state,'enemy',enemyDoctrine);event(state,'both','deployment','Знамёна подняты. Ряды сходятся.');recordSnapshot(state,true);return state;
}
function event(state,side,rule,text,meta={}){
  const e={time:state.time,side,rule,text,...meta};state.events.push(e);
  if(!['movement','casualty'].includes(rule)){state.decisive.push(e);if(state.decisive.length>14)state.decisive.shift();}
  if(['contact','break','motto','volley','victory','doctrine'].includes(rule)){state.keyEvents.push(e);if(state.keyEvents.length>24)state.keyEvents.shift();}
}
function signalDoctrine(state,side,slot,id,label,meta={}){
  const x=meta.x??360,y=meta.y??state.frontY,life=meta.life??1.35;state.signals.push({side,slot,id,label,x,y,life,maxLife:life,squadId:meta.squadId||null});
  const metrics=state.metrics[side];if(metrics)metrics.signals[id]=(metrics.signals[id]||0)+1;
}
function pulseRule(state,army,squad,slot,id,label,meta={}){
  if(!id)return;const key=`${slot}:${id}`,last=squad.rulePulse[key]??-99;if(state.time-last<6)return;squad.rulePulse[key]=state.time;
  const x=meta.x??squad.x,y=meta.y??squad.y;signalDoctrine(state,army.side,slot,id,label,{...meta,x,y,squadId:squad.id});
  event(state,army.side,'doctrine',label,{slot,doctrineId:id,squadId:squad.id,x,y});
}
function armyCohesion(army){const live=army.infantry.filter(livingSquad);return live.length?live.reduce((n,s)=>n+s.cohesion,0)/live.length:0;}
function foe(state,side){return side==='player'?state.enemy:state.player;}
function allSquads(army){return[...army.infantry,...army.archers];}
function allMembers(army){return allSquads(army).flatMap(s=>s.members);}
function livingMember(m){return m.state!=='fallen'&&m.hp>0;}
function combatMember(m){return livingMember(m)&&m.state!=='rout';}
function livingSquad(s){return s.members.some(livingMember)&&!s.broken;}
function squadById(state,id){for(const a of[state.player,state.enemy])for(const s of allSquads(a))if(s.id===id)return s;return null;}
function memberById(state,id){for(const a of[state.player,state.enemy])for(const s of allSquads(a))for(const m of s.members)if(m.id===id)return m;return null;}
function nearest(list,source,predicate=()=>true){let best=null,bestD=Infinity;for(const item of list){if(!predicate(item))continue;const d=distance(item,source);if(d<bestD){best=item;bestD=d;}}return best;}
function activeMain(army){return army.doctrine.main&&!(army.doctrine.command==='chain'&&!army.crisis)?army.doctrine.main:null;}
function squadSupport(army,squad,radius=155){return army.infantry.filter(s=>s!==squad&&livingSquad(s)&&distance(s,squad)<radius).length;}
function gapInfo(enemy){
  const live=enemy.infantry.filter(livingSquad).sort((a,b)=>a.x-b.x);
  if(live.length<2)return{open:true,x:360,y:live[0]?.y??FRONT_Y[enemy.side],size:360};
  let best={size:0,x:360};const edges=[45,...live.map(s=>s.x),675];
  for(let i=1;i<edges.length;i++){const size=edges[i]-edges[i-1];if(size>best.size)best={size,x:(edges[i]+edges[i-1])/2};}
  return{open:live.length<3||best.size>175,x:best.x,y:live.reduce((n,s)=>n+s.y,0)/live.length,size:best.size};
}
function threatNearBanner(state,army){return foe(state,army.side).infantry.some(s=>livingSquad(s)&&distance(s,army.banner)<165);}
function applyMotto(state,army){
  if(!army.doctrine.motto||army.mottoUsed)return;const motto=army.doctrine.motto,enemy=foe(state,army.side),dir=FORWARD[army.side];
  if(motto==='banner'&&threatNearBanner(state,army)){for(const s of army.infantry.filter(livingSquad).sort((a,b)=>distance(a,army.banner)-distance(b,army.banner)).slice(0,2)){s.state='defend-banner';s.targetSquadId=null;}army.mottoUsed=true;signalDoctrine(state,army.side,'motto',motto,'ЗНАМЯ ПРЕЖДЕ',{x:army.banner.x,y:army.banner.y});event(state,army.side,'motto','Знамя прежде: два отряда разворачиваются к древку.',{x:army.banner.x,y:army.banner.y});}
  if(motto==='together'){const shaken=army.infantry.filter(s=>livingSquad(s)&&s.morale<.46);if(shaken.length>=2){const point={x:(shaken[0].x+shaken[1].x)/2,y:(shaken[0].y+shaken[1].y)/2};for(const s of shaken.slice(0,2)){s.state='join';s.goalX=point.x;s.goalY=point.y;}army.mottoUsed=true;signalDoctrine(state,army.side,'motto',motto,'СТАТЬ ВМЕСТЕ',point);event(state,army.side,'motto','Стать вместе: редеющие ряды сходятся.',point);}}
  const gap=gapInfo(enemy);if(motto==='breach'&&gap.open){const reserve=army.infantry.find(s=>livingSquad(s)&&(s.reserve||s.index===3));if(reserve){reserve.reserve=false;reserve.state='breach';reserve.goalX=gap.x;reserve.goalY=gap.y+dir*135;army.mottoUsed=true;signalDoctrine(state,army.side,'motto',motto,'В ПРОЛОМ',{x:gap.x,y:gap.y,squadId:reserve.id});event(state,army.side,'motto','В пролом: резерв входит в разрыв.',{x:gap.x,y:gap.y,squadId:reserve.id});}}
  if(motto==='volley'&&army.globalRetreat){for(const s of army.archers){s.volleyClock=0;s.forcedVolley=true;s.volleyPhase='idle';}army.mottoUsed=true;signalDoctrine(state,army.side,'motto',motto,'ПОСЛЕДНИЙ ЗАЛП',{x:360,y:army.side==='player'?850:270});event(state,army.side,'motto','Последний залп перед отходом.');}
}
function chooseInfantryTarget(state,army,squad){
  const enemy=foe(state,army.side),live=enemy.infantry.filter(livingSquad);if(!live.length)return null;
  if(army.doctrine.field==='gules'&&squad.targetSquadId){const locked=squadById(state,squad.targetSquadId);if(locked&&livingSquad(locked))return locked;}
  if(army.doctrine.command==='crown'&&!squad.leader){const leader=army.infantry.find(s=>s.leader&&livingSquad(s));if(leader?.targetSquadId){const t=squadById(state,leader.targetSquadId);if(t&&livingSquad(t)){pulseRule(state,army,squad,'command','crown','КОРОНА · ЕДИНАЯ ЦЕЛЬ',{x:squad.x,y:squad.y});return t;}}}
  if(activeMain(army)==='lion'){const counts=new Map();for(const ally of army.infantry)if(ally.targetSquadId)counts.set(ally.targetSquadId,(counts.get(ally.targetSquadId)||0)+1);return[...live].sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)||a.morale-b.morale||distance(squad,a)-distance(squad,b))[0];}
  if(army.doctrine.field==='azure')return[...live].sort((a,b)=>squadSupport(enemy,a)-squadSupport(enemy,b)||a.morale-b.morale||distance(squad,a)-distance(squad,b))[0];
  return nearest(live,squad);
}
function chooseArcherTarget(state,army,squad){
  const enemy=foe(state,army.side),live=enemy.infantry.filter(livingSquad);if(!live.length)return null;
  if(army.doctrine.secondary==='sun'){if(army.focusSquadId){const f=squadById(state,army.focusSquadId);if(f&&livingSquad(f))return f;}const f=[...live].sort((a,b)=>a.morale-b.morale||a.strength-b.strength)[0];army.focusSquadId=f.id;return f;}
  if(army.doctrine.secondary==='eagle')return[...live].sort((a,b)=>squadSupport(enemy,a)-squadSupport(enemy,b)||a.morale-b.morale)[0];
  const gap=gapInfo(enemy);if(army.doctrine.secondary==='key'&&gap.open)return[...live].sort((a,b)=>Math.abs(a.x-gap.x)-Math.abs(b.x-gap.x))[0];
  return nearest(live,squad);
}
function formationSlots(squad,count){
  const dir=FORWARD[squad.side],inf=squad.type==='infantry',slots=[];
  if(!count)return slots;
  if(!inf){
    const spacing=squad.state==='rout'?34:29;
    for(let i=0;i<count;i++)slots.push({x:squad.formX+(i-(count-1)/2)*spacing,y:squad.formY+Math.sin((i+1)*1.7)*5});
    return slots;
  }
  let columns=Math.min(4,Math.max(2,Math.ceil(count/2))),rows=Math.ceil(count/columns),width=17,depth=18;
  if(squad.state==='breach'){columns=Math.min(3,count);rows=Math.ceil(count/columns);width=15;depth=20;}
  if(squad.state==='defend-banner'||squad.state==='hold'){columns=Math.min(5,count);rows=Math.ceil(count/columns);width=15;depth=15;}
  const rowCounts=[];for(let r=0;r<rows;r++)rowCounts.push(Math.min(columns,count-r*columns));
  for(let r=0;r<rows;r++)for(let c=0;c<rowCounts[r];c++){
    const lateral=(c-(rowCounts[r]-1)/2)*width;
    const forward=(rows-1)/2-r;
    const wedge=squad.state==='breach'?Math.abs(c-(rowCounts[r]-1)/2)*3:0;
    slots.push({x:squad.formX+lateral,y:squad.formY+dir*(forward*depth-wedge)});
  }
  return slots;
}
function refreshSlotAssignment(squad,active){
  const slots=formationSlots(squad,active.length),unused=new Set(slots.map((_,i)=>i));
  const ordered=[...active].sort((a,b)=>a.slotIndex-b.slotIndex);
  for(const member of ordered){
    let best=-1,bestD=Infinity;
    for(const index of unused){const d=Math.hypot(slots[index].x-member.x,slots[index].y-member.y);if(d<bestD){best=index;bestD=d;}}
    member.slotIndex=best<0?0:best;unused.delete(best);
  }
  return slots;
}
function updateSquadMetrics(state,army,squad){
  const alive=squad.members.filter(livingMember),active=alive.filter(m=>m.state!=='rout');squad.strength=alive.length;
  if(active.length){squad.x=active.reduce((n,m)=>n+m.x,0)/active.length;squad.y=active.reduce((n,m)=>n+m.y,0)/active.length;}
  const avg=alive.length?alive.reduce((n,m)=>n+m.morale,0)/alive.length:0,casualty=alive.length/squad.maxStrength,routing=alive.filter(m=>m.state==='rout').length;
  const slotError=active.length?active.reduce((n,m)=>n+Math.min(70,Math.hypot(m.x-m.slotX,m.y-m.slotY)),0)/active.length:70;
  squad.cohesion=clamp(1-slotError/58,0,1);squad.morale=clamp(avg*.52+casualty*.28+squad.cohesion*.2,0,1);
  squad.broken=alive.length===0||(squad.type==='infantry'&&(active.length<3||squad.morale<.13||(squad.cohesion<.13&&casualty<.62)||routing>alive.length*.58));
  if(squad.broken&&!squad.breakAnnounced){squad.breakAnnounced=true;event(state,army.side,'break',`Отряд ${squad.index+1} потерял строй.`,{squadId:squad.id,x:squad.x,y:squad.y,remaining:alive.length,cohesion:squad.cohesion});}
}
function updateArmyState(state,army){for(const s of allSquads(army))updateSquadMetrics(state,army,s);army.brokenCount=army.infantry.filter(s=>s.broken).length;if(army.brokenCount&&!army.crisis){army.crisis=true;event(state,army.side,'crisis','Первый отряд потерял строй.',{squadId:army.infantry.find(s=>s.broken)?.id});}army.globalRetreat=army.brokenCount>=2;}
function advanceFormCenter(squad,dt){
  const dx=squad.goalX-squad.formX,dy=squad.goalY-squad.formY,d=Math.hypot(dx,dy)||1;
  const base=squad.type==='infantry'?(squad.state==='breach'?28:21):18,engagementSlow=1-squad.engagedRatio*.78,cohesionFactor=.58+.42*squad.cohesion;
  const step=Math.min(d,base*engagementSlow*cohesionFactor*dt);squad.formX+=dx/d*step;squad.formY+=dy/d*step;
}
function assignGoals(state,army,squad,dt){
  squad.rethink-=dt;if(squad.rethink>0)return;squad.rethink=army.doctrine.field==='azure'?.5:1;const enemy=foe(state,army.side),dir=FORWARD[army.side];
  if(squad.broken){squad.state='rout';squad.goalX=army.banner.x+(squad.index-1.5)*38;squad.goalY=army.banner.y+dir*58;return;}
  if(squad.reserve){const trigger=army.crisis||enemy.infantry.some(s=>livingSquad(s)&&Math.abs(s.y-WORLD_HEIGHT/2)<150);if(!trigger){squad.goalX=squad.homeX;squad.goalY=squad.homeY-dir*70;return;}squad.reserve=false;signalDoctrine(state,army.side,'field','sable','СКРЫТЫЙ РЕЗЕРВ',{x:squad.x,y:squad.y,squadId:squad.id});event(state,army.side,'field','Скрытый резерв вступил в бой.',{squadId:squad.id,x:squad.x,y:squad.y});}
  if(squad.type==='archer'){
    const target=chooseArcherTarget(state,army,squad);squad.targetSquadId=target?.id||null;
    if(army.doctrine.secondary==='rose'){const pair=squadById(state,squad.pairedId);if(pair&&livingSquad(pair)){squad.goalX=pair.formX;squad.goalY=pair.formY-dir*118;pulseRule(state,army,squad,'secondary','rose','РОЗА · СВЯЗАННАЯ ПАРА');return;}}
    const gap=gapInfo(enemy);if(army.doctrine.secondary==='key'&&gap.open){squad.goalX=gap.x;squad.goalY=gap.y-dir*180;pulseRule(state,army,squad,'secondary','key','КЛЮЧ · ОГОНЬ В ПРОЛОМ',{x:gap.x,y:gap.y});return;}
    if(army.doctrine.secondary==='eagle'){squad.goalX=clamp(squad.homeX+(squad.index<2?-75:75),75,645);squad.goalY=squad.homeY+dir*Math.min(90,state.time*1.5);pulseRule(state,army,squad,'secondary','eagle','ОРЁЛ · СВОБОДНЫЙ СЕКТОР');return;}
    const front=army.infantry[squad.index];squad.goalX=front?.formX??squad.homeX;squad.goalY=(front?.formY??squad.homeY)-dir*118;return;
  }
  if(squad.state==='defend-banner'){squad.goalX=army.banner.x+(squad.index-1.5)*42;squad.goalY=army.banner.y+dir*72;if(distance(squad,army.banner)<100)squad.state='hold';return;}
  if(squad.state==='join'&&distance(squad,{x:squad.goalX,y:squad.goalY})<42){squad.state='advance';for(const m of squad.members)if(livingMember(m))m.morale=Math.min(1,m.morale+.16);}
  if(activeMain(army)==='stag'){const localEnemy=enemy.infantry.filter(s=>livingSquad(s)&&distance(s,squad)<125).length;if(localEnemy>squadSupport(army,squad,125)+1){const ally=nearest(army.infantry,squad,s=>s!==squad&&livingSquad(s));if(ally){squad.goalX=ally.formX;squad.goalY=ally.formY-dir*55;squad.lastRule='main';pulseRule(state,army,squad,'main','stag','ОЛЕНЬ · ЭЛАСТИЧНЫЙ ОТХОД');return;}}}
  const gap=gapInfo(enemy);if((activeMain(army)==='boar'||squad.state==='breach')&&gap.open){squad.goalX=gap.x;squad.goalY=gap.y+dir*140;squad.lastRule=squad.state==='breach'?'motto':'main';if(activeMain(army)==='boar')pulseRule(state,army,squad,'main','boar','ВЕПРЬ · ГЛУБОКИЙ ПРОРЫВ',{x:gap.x,y:gap.y});return;}
  if(army.doctrine.field==='argent'){const ally=nearest(army.infantry,squad,s=>s!==squad&&livingSquad(s));if(ally&&distance(ally,squad)>175){squad.goalX=ally.formX;squad.goalY=ally.formY-dir*35;squad.lastRule='field';pulseRule(state,army,squad,'field','argent','СЕРЕБРО · ВОССТАНОВИТЬ СВЯЗЬ');return;}}
  const target=chooseInfantryTarget(state,army,squad);squad.targetSquadId=target?.id||null;if(target&&activeMain(army)==='lion')pulseRule(state,army,squad,'main','lion','ЛЕВ · ОБЩАЯ ЦЕЛЬ',{x:target.x,y:target.y});
  if(!target){squad.goalX=enemy.banner.x;squad.goalY=enemy.banner.y-dir*55;return;}
  let tx=target.x;if(army.doctrine.command==='helmet'&&state.time<20){const axis=army.doctrine.axis==='left'?190:army.doctrine.axis==='right'?530:360;tx=axis*.72+target.x*.28;squad.lastRule='command';pulseRule(state,army,squad,'command','helmet','ШЛЕМ · ОСЬ УДАРА',{x:axis,y:squad.y});}
  squad.goalX=tx;squad.goalY=target.y-dir*34;
}
function steer(member,target,maxSpeed,dt,stiffness=7.2){const dx=target.x-member.x,dy=target.y-member.y,d=Math.hypot(dx,dy)||1,desiredX=dx/d*maxSpeed,desiredY=dy/d*maxSpeed;member.vx+=(desiredX-member.vx)*Math.min(1,stiffness*dt);member.vy+=(desiredY-member.vy)*Math.min(1,stiffness*dt);member.x=clamp(member.x+member.vx*dt,18,WORLD_WIDTH-18);member.y=clamp(member.y+member.vy*dt,28,WORLD_HEIGHT-28);if(Math.abs(member.vy)>.3)member.facingY=Math.sign(member.vy);}
function collisionForces(member,allies,enemies){
  let fx=0,fy=0;
  for(const other of allies){if(other===member||!combatMember(other))continue;const dx=member.x-other.x,dy=member.y-other.y,d2=dx*dx+dy*dy;if(d2>0&&d2<190){const d=Math.sqrt(d2),f=(13.8-d)/13.8;if(f>0){fx+=dx/d*f*.85;fy+=dy/d*f*.85;}}}
  for(const other of enemies){if(!combatMember(other))continue;const dx=member.x-other.x,dy=member.y-other.y,d2=dx*dx+dy*dy;if(d2>0&&d2<230){const d=Math.sqrt(d2),f=(15.2-d)/15.2;if(f>0){fx+=dx/d*f*1.8;fy+=dy/d*f*1.8;}}}
  member.vx+=fx;member.vy+=fy;
}
function nearestEnemyMember(enemy,member,max=Infinity){return nearest(allMembers(enemy),member,m=>combatMember(m)&&distance(m,member)<=max);}
function moraleShock(state,target,amount){target.morale-=amount;const army=target.side==='player'?state.player:state.enemy;for(const ally of allMembers(army))if(ally!==target&&combatMember(ally)&&distance(ally,target)<34)ally.morale-=amount*.22;}
function killMember(state,target,attackerSide){if(target.state==='fallen')return;target.hp=0;target.state='fallen';target.vx=0;target.vy=0;target.fallenAt=state.time;state.effects.push({type:'fall',x:target.x,y:target.y,side:target.side,life:1.2});state.impact=Math.min(1,state.impact+.14);moraleShock(state,target,.07);if(state.metrics[attackerSide])state.metrics[attackerSide].kills++;if(rand(state)<.08)event(state,attackerSide,'casualty','Воин пал в линии.',{x:target.x,y:target.y});}
function melee(state,member,target,allies,enemies,dt){
  member.cooldown-=dt;const d=distance(member,target);
  if(d>17){steer(member,{x:target.x,y:target.y},20,dt,8.5);collisionForces(member,allies,enemies);return;}
  member.vx*=.48;member.vy*=.48;member.state='fighting';member.facingY=Math.sign(target.y-member.y)||member.facingY;
  if(member.cooldown<=0){const fatigue=1+Math.max(0,state.time-52)/80,damage=(.047+rand(state)*.027)*fatigue;target.hp-=damage;moraleShock(state,target,(.009+rand(state)*.008)*fatigue);target.hitFlash=.18;const dx=target.x-member.x,dy=target.y-member.y,len=Math.hypot(dx,dy)||1;target.vx+=dx/len*4.8;target.vy+=dy/len*4.8;member.vx-=dx/len*1.6;member.vy-=dy/len*1.6;member.cooldown=.78+rand(state)*.28;state.effects.push({type:'hit',x:(member.x+target.x)/2,y:(member.y+target.y)/2,life:.22});state.impact=Math.min(1,state.impact+.03);if(target.hp<=0)killMember(state,target,member.side);}
}
function updateInfantryMember(state,army,squad,member,slot,allies,enemies,dt){
  if(!livingMember(member))return;member.hitFlash=Math.max(0,member.hitFlash-dt);member.phase+=dt*(4+Math.hypot(member.vx,member.vy)*.07);
  if(squad.broken||member.morale<.07){member.state='rout';const offset=(member.index-(squad.maxStrength-1)/2)*18;steer(member,{x:clamp(army.banner.x+offset,45,675),y:army.banner.y+FORWARD[army.side]*52},28,dt,6);collisionForces(member,allies,enemies);member.morale=Math.min(.3,member.morale+.012*dt);return;}
  let target=member.targetId?memberById(state,member.targetId):null;if(!target||!combatMember(target)||distance(member,target)>46){target=nearestEnemyMember(foe(state,army.side),member,42);member.targetId=target?.id||null;}
  if(target){if(!state.firstContact){state.firstContact=true;event(state,'both','contact','Передние ряды столкнулись.',{x:(member.x+target.x)/2,y:(member.y+target.y)/2});}melee(state,member,target,allies,enemies,dt);return;}
  member.state='forming';steer(member,slot,squad.state==='breach'?27:21,dt,squad.state==='hold'?9:7.5);collisionForces(member,allies,enemies);
}
function fireArrow(state,member,target,delay=0,power=1,volleyId=null){const duration=clamp(distance(member,target)/280,.34,.9);state.arrows.push({side:member.side,x1:member.x,y1:member.y-8,x2:target.x,y2:target.y-6,targetId:target.id,delay,life:duration,duration,power,volleyId});member.state='shooting';}
function volleyLabel(secondary){return{sun:'СОЛНЦЕ · СОСРЕДОТОЧЕННЫЙ ЗАЛП',eagle:'ОРЁЛ · ФЛАНГОВЫЙ ЗАЛП',rose:'РОЗА · ЗАЛП ИЗ-ПОД ПРИКРЫТИЯ',key:'КЛЮЧ · ЗАЛП В ПРОЛОМ'}[secondary]||'СОГЛАСОВАННЫЙ ЗАЛП';}
function volleyInterval(secondary){return{sun:3.35,eagle:2.45,rose:2.85,key:2.65}[secondary]||2.75;}
function prepareVolley(state,army,squad,active,dt){
  if(squad.type!=='archer'||squad.broken||active.length<2)return false;const targetSquad=squadById(state,squad.targetSquadId);
  squad.volleyClock-=dt;if(squad.volleyPhase==='drawing'){squad.volleyDraw-=dt;if(squad.volleyDraw<=0){squad.volleyPhase='release';squad.volleySerial++;squad.volleyClock=volleyInterval(army.doctrine.secondary)+rand(state)*.35;squad.forcedVolley=false;const label=volleyLabel(army.doctrine.secondary);state.metrics[army.side].volleys++;signalDoctrine(state,army.side,'secondary',`volley-${army.doctrine.secondary||'plain'}`,label,{x:squad.x,y:squad.y,life:1});event(state,army.side,'volley',label,{squadId:squad.id,targetSquadId:squad.targetSquadId,x:squad.x,y:squad.y,count:active.length});return true;}return false;}
  if(squad.volleyClock>0||!targetSquad||!livingSquad(targetSquad))return false;
  const inRange=active.some(member=>targetSquad.members.some(target=>combatMember(target)&&distance(member,target)<340));if(!inRange&&!squad.forcedVolley)return false;
  const ready=active.filter(m=>distance(m,{x:m.slotX||m.x,y:m.slotY||m.y})<38&&m.state!=='evade').length;
  const pair=squadById(state,squad.pairedId),gap=gapInfo(foe(state,army.side));
  if(army.doctrine.secondary==='rose'&&pair&&!pair.engagedRatio&&!squad.forcedVolley)return false;if(army.doctrine.secondary==='key'&&!gap.open&&!squad.forcedVolley)return false;if(ready<Math.ceil(active.length*.6)&&!squad.forcedVolley)return false;
  squad.volleyPhase='drawing';squad.volleyDraw=squad.forcedVolley?.18:.48;for(const member of active)member.state='drawing';return false;
}
function updateArcherMember(state,army,squad,member,slot,allies,enemies,release,dt){
  if(!livingMember(member))return;member.hitFlash=Math.max(0,member.hitFlash-dt);member.phase+=dt*(3+Math.hypot(member.vx,member.vy)*.06);
  if(squad.broken||member.morale<.065){member.state='rout';steer(member,{x:army.banner.x+(member.index-1.5)*24,y:army.banner.y+FORWARD[army.side]*45},27,dt,6);return;}
  const threat=nearestEnemyMember(foe(state,army.side),member,78);if(threat){member.state='evade';const dir=FORWARD[army.side];steer(member,{x:clamp(member.x+(member.x<threat.x?-70:70),35,685),y:member.y-dir*90},27,dt);member.morale-=.016*dt;collisionForces(member,allies,enemies);return;}
  const targetSquad=squadById(state,squad.targetSquadId);let target=null;if(targetSquad)target=nearest(targetSquad.members,member,m=>combatMember(m)&&distance(m,member)<340);
  if(release&&target&&member.lastVolleySerial!==squad.volleySerial){member.lastVolleySerial=squad.volleySerial;const delay=member.index*.045,power=army.doctrine.secondary==='sun'?1.12:1;fireArrow(state,member,target,delay,power,`${squad.id}:${squad.volleySerial}`);}
  else if(squad.volleyPhase==='drawing'){member.state='drawing';member.vx*=.72;member.vy*=.72;}
  else if(!target||distance(member,slot)>25){member.state='forming';steer(member,slot,18,dt);}else{member.state='ready';member.vx*=.8;member.vy*=.8;}
  collisionForces(member,allies,enemies);
}
function updateSquadMembers(state,army,squad,dt){
  advanceFormCenter(squad,dt);const active=squad.members.filter(combatMember);squad.slotRefresh-=dt;let slots;
  if(squad.slotRefresh<=0){slots=refreshSlotAssignment(squad,active);squad.slotRefresh=.32+rand(state)*.12;}else slots=formationSlots(squad,active.length);
  const allies=allMembers(army),enemies=allMembers(foe(state,army.side));let engaged=0;const release=squad.type==='archer'?prepareVolley(state,army,squad,active,dt):false;
  for(const m of active){const slot=slots[m.slotIndex]||slots[0]||{x:squad.formX,y:squad.formY};m.slotX=slot.x;m.slotY=slot.y;if(squad.type==='infantry'){if(nearestEnemyMember(foe(state,army.side),m,32))engaged++;updateInfantryMember(state,army,squad,m,slot,allies,enemies,dt);}else updateArcherMember(state,army,squad,m,slot,allies,enemies,release,dt);}
  if(squad.volleyPhase==='release')squad.volleyPhase='idle';squad.engagedRatio=active.length?engaged/active.length:0;
  if(activeMain(army)==='tower'&&squad.type==='infantry'&&!squad.anchor&&state.time>8&&distance(squad,{x:squad.homeX,y:squad.homeY})>52){squad.holdTime+=dt;if(squad.holdTime>2.4){squad.anchor={x:squad.x,y:squad.y};squad.state='hold';signalDoctrine(state,army.side,'main','tower','БАШНЯ · ОПОРНЫЙ УЧАСТОК',{x:squad.x,y:squad.y,squadId:squad.id});event(state,army.side,'main','Башня закрепила опорный участок.',{squadId:squad.id,x:squad.x,y:squad.y});}}
}
function updateArrows(state,dt){for(const arrow of state.arrows){if(arrow.delay>0){arrow.delay-=dt;continue;}arrow.life-=dt;if(arrow.life<=0&&!arrow.resolved){arrow.resolved=true;const target=memberById(state,arrow.targetId);if(target&&combatMember(target)){const fatigue=1+Math.max(0,state.time-52)/90,power=arrow.power||1;target.hp-=(.039+rand(state)*.027)*fatigue*power;moraleShock(state,target,(.008+rand(state)*.007)*fatigue*power);target.hitFlash=.15;state.metrics[arrow.side].arrowHits++;state.effects.push({type:'arrow-hit',x:target.x,y:target.y,life:.24});if(target.hp<=0)killMember(state,target,arrow.side);}}}state.arrows=state.arrows.filter(a=>a.life>-.05||a.delay>0);}
function updateEffects(state,dt){for(const e of state.effects)e.life-=dt;state.effects=state.effects.filter(e=>e.life>0);for(const signal of state.signals)signal.life-=dt;state.signals=state.signals.filter(signal=>signal.life>0);state.impact=Math.max(0,state.impact-dt*.72);}

function recordSnapshot(state,force=false){
  if(!state.captureReplay)return;state.snapshotClock-=force?999:0;
  if(!force&&state.snapshotClock>0)return;state.snapshotClock=.4;
  const units=[];for(const army of[state.player,state.enemy])for(const squad of allSquads(army))for(const member of squad.members)units.push({id:member.id,side:member.side,type:member.type,squadId:squad.id,x:Math.round(member.x*10)/10,y:Math.round(member.y*10)/10,state:member.state,hp:Math.max(0,Math.round(member.hp*100)/100),morale:Math.max(0,Math.round(member.morale*100)/100)});
  state.replay.push({time:Math.round(state.time*20)/20,frontY:state.frontY,playerCapture:state.player.banner.capture,enemyCapture:state.enemy.banner.capture,units,arrows:state.arrows.filter(a=>a.delay<=0).map(a=>({side:a.side,x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2,life:a.life,duration:a.duration})),signals:state.signals.map(s=>({side:s.side,slot:s.slot,id:s.id,label:s.label,x:s.x,y:s.y,life:s.life,maxLife:s.maxLife}))});
  if(state.replay.length>280)state.replay.shift();
}
function sideLabel(side){return side==='player'?'Твой':side==='enemy'?'Вражеский':'Общий';}
function ruCount(value,forms){const n=Math.abs(value)%100,n1=n%10;return n>10&&n<20?forms[2]:n1>1&&n1<5?forms[1]:n1===1?forms[0]:forms[2];}
function buildAnalysis(state){
  const analysis=[];const firstBreak=state.events.find(e=>e.rule==='break');
  if(firstBreak){const squad=squadById(state,firstBreak.squadId),remaining=firstBreak.remaining??squad?.members.filter(livingMember).length??0,cohesion=Math.round((firstBreak.cohesion??0)*100);analysis.push({title:'Первый разрыв',time:firstBreak.time,side:firstBreak.side,rule:'break',summary:`${sideLabel(firstBreak.side)} отряд ${squad?`${squad.index+1}`:'?'} первым потерял строй. В момент распада в нём оставалось ${remaining} ${ruCount(remaining,['воин','воина','воинов'])}, целостность построения — ${cohesion}%.`,x:firstBreak.x??squad?.x??360,y:firstBreak.y??squad?.y??state.frontY});}
  const p=state.metrics.player,e=state.metrics.enemy,totalHits=p.arrowHits+e.arrowHits;
  if(totalHits){const stronger=p.arrowHits>=e.arrowHits?'player':'enemy',m=state.metrics[stronger],other=state.metrics[stronger==='player'?'enemy':'player'],waves=m.volleys;analysis.push({title:'Давление лучников',time:state.events.find(ev=>ev.rule==='volley'&&ev.side===stronger)?.time??state.time*.45,side:stronger,rule:'volley',summary:`${sideLabel(stronger)} строй провёл ${waves} ${ruCount(waves,['залп','залпа','залпов'])} отделений и добился ${m.arrowHits} ${ruCount(m.arrowHits,['попадание','попадания','попаданий'])} против ${other.arrowHits}. Стрельба разрежала конкретные участки линии.`,x:360,y:stronger==='player'?760:360});}
  else{
    const signalEntries=[];for(const side of['player','enemy'])for(const[id,count]of Object.entries(state.metrics[side].signals))if(!id.startsWith('volley-'))signalEntries.push({side,id,count});signalEntries.sort((a,b)=>b.count-a.count);
    if(signalEntries.length){const top=signalEntries[0],name=CATALOGS.main[top.id]?.name||CATALOGS.secondary[top.id]?.name||CATALOGS.field[top.id]?.name||CATALOGS.command[top.id]?.name||MOTTOS[top.id]?.label||top.id;analysis.push({title:'Главное правило',time:state.events.find(ev=>ev.doctrineId===top.id&&ev.side===top.side)?.time??state.time*.55,side:top.side,rule:'doctrine',summary:`${sideLabel(top.side)} герб активировал правило «${name}» ${top.count} ${ruCount(top.count,['раз','раза','раз'])}. Оно чаще других меняло решения отрядов.`,x:360,y:state.frontY});}
  }
  const winner=state.winner,reason=state.finishReason;analysis.push({title:reason==='banner'?'Знамя осталось без защиты':reason==='collapse'?'Общий распад фронта':'Решение по состоянию строя',time:state.time,side:winner,rule:'victory',summary:reason==='banner'?`${sideLabel(winner)} строй расчистил пространство вокруг вражеского знамени и удержал его достаточно долго.`:reason==='collapse'?`${sideLabel(winner)} строй довёл до распада три пехотных отряда противника.`:`После предельного времени победил строй с большей сохранённой организацией.`,x:360,y:winner==='player'?state.enemy.banner.y:state.player.banner.y});
  return analysis.slice(0,3);
}
function selectMoments(state){
  const contact=state.events.find(e=>e.rule==='contact');const firstBreak=state.events.find(e=>e.rule==='break');const doctrine=state.events.find(e=>['motto','volley','doctrine'].includes(e.rule)&&(!firstBreak||e.time<state.time-1));const victory=state.events.findLast?state.events.findLast(e=>e.rule==='victory'):[...state.events].reverse().find(e=>e.rule==='victory');
  const raw=[contact,firstBreak||doctrine,victory].filter(Boolean),moments=[];for(const e of raw){if(moments.some(m=>Math.abs(m.time-e.time)<1.2))continue;moments.push({time:e.time,label:e.rule==='contact'?'Первый контакт':e.rule==='break'?'Первый разрыв':e.rule==='victory'?'Исход':e.text,side:e.side,rule:e.rule,x:e.x??360,y:e.y??state.frontY});}return moments.slice(0,3);
}

function updateCapture(state,attackers,defenders,dt){const atk=attackers.infantry.flatMap(s=>s.members).filter(m=>combatMember(m)&&distance(m,defenders.banner)<52),def=defenders.infantry.flatMap(s=>s.members).filter(m=>combatMember(m)&&distance(m,defenders.banner)<118);if(atk.length&&!def.length)defenders.banner.capture+=dt*(.7+atk.length*.07);else defenders.banner.capture=Math.max(0,defenders.banner.capture-dt*.62);}
function updateFront(state){const p=state.player.infantry.flatMap(s=>s.members).filter(combatMember),e=state.enemy.infantry.flatMap(s=>s.members).filter(combatMember);if(p.length&&e.length){const py=Math.min(...p.map(m=>m.y)),ey=Math.max(...e.map(m=>m.y));state.frontY=clamp((py+ey)/2,280,840);}}
export function stepBattle(state,dt=.05){
  if(!state||state.status!=='running')return state;dt=clamp(dt,.02,.12);state.time+=dt;state.snapshotClock-=dt;
  for(const army of[state.player,state.enemy])applyMotto(state,army);
  for(const army of[state.player,state.enemy])for(const squad of allSquads(army))assignGoals(state,army,squad,dt);
  for(const army of[state.player,state.enemy])for(const squad of allSquads(army))updateSquadMembers(state,army,squad,dt);
  updateArrows(state,dt);updateEffects(state,dt);updateArmyState(state,state.player);updateArmyState(state,state.enemy);updateCapture(state,state.player,state.enemy,dt);updateCapture(state,state.enemy,state.player,dt);updateFront(state);recordSnapshot(state);
  let winner=null;if(state.enemy.banner.capture>=3){winner='player';state.finishReason='banner';}else if(state.enemy.brokenCount>=3){winner='player';state.finishReason='collapse';}if(state.player.banner.capture>=3){winner=winner?(state.player.banner.capture<state.enemy.banner.capture?'player':'enemy'):'enemy';state.finishReason='banner';}else if(state.player.brokenCount>=3){winner=winner?(state.player.banner.capture<state.enemy.banner.capture?'player':'enemy'):'enemy';state.finishReason='collapse';}
  if(!winner&&state.time>=105){const score=a=>allMembers(a).filter(livingMember).reduce((n,m)=>n+m.hp*(.5+.5*m.morale),0)+(3-a.banner.capture)*2;winner=score(state.player)>=score(state.enemy)?'player':'enemy';state.finishReason='time';}
  if(winner){state.status='finished';state.winner=winner;event(state,winner,'victory',winner==='player'?'Вражеский фронт разрушен.':'Твой фронт разрушен.',{x:360,y:winner==='player'?state.enemy.banner.y:state.player.banner.y,reason:state.finishReason});recordSnapshot(state,true);}
  return state;
}
export function summarizeBattle(state){const remaining=a=>allMembers(a).filter(livingMember).length;return{winner:state.winner,duration:Math.round(state.time*10)/10,playerRemaining:remaining(state.player),enemyRemaining:remaining(state.enemy),playerBroken:state.player.brokenCount,enemyBroken:state.enemy.brokenCount,finishReason:state.finishReason,events:state.events.slice(-28),decisive:state.decisive.slice(-8),analysis:buildAnalysis(state),moments:selectMoments(state),metrics:clone(state.metrics),replay:state.captureReplay?state.replay:[],seed:state.rng};}
export function simulateBattle(a,b,seed=1,max=110){const s=createBattleState(a,b,seed,{captureReplay:false});while(s.status==='running'&&s.time<max)stepBattle(s,.05);return summarizeBattle(s);}
export function randomDoctrine(seed=1,stage=4){const s={rng:normalizeSeed(seed)};return doctrineForStage(s,stage);}
export function botAudit(iterations=100,seed=1){const r={player:0,enemy:0,averageDuration:0,timeouts:0};for(let i=0;i<iterations;i++){const a=randomDoctrine(seed+i*31,4),b=randomDoctrine(seed+i*31+7,4),r1=simulateBattle(a,b,seed+i*97),r2=simulateBattle(b,a,seed+i*97);r[r1.winner]++;r[r2.winner==='player'?'enemy':'player']++;r.averageDuration+=r1.duration+r2.duration;if(r1.duration>=105)r.timeouts++;if(r2.duration>=105)r.timeouts++;}r.averageDuration=Math.round(r.averageDuration/(iterations*2)*10)/10;return r;}
