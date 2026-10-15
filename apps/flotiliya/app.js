import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { renderSea, renderGalley } from './sea-art.js';
import { ACTION_COST, MOVE_STEP, getBudget, canPlan, stagePathLength, stageRange, availableActions } from './turn-budget.js';
import { condition, attackSector, attackPacket, contest, nearbySupport, rangeBlocked, oarFraction } from './naval-combat.js';
installMobileRuntime();

const $ = (id) => document.getElementById(id);
const canvas = $('sea'), ctx = canvas.getContext('2d', {alpha:false});
const W=660,H=1000,TAU=Math.PI*2,KEY='pocket-works:flotiliya:v1';
const PHASE_SECONDS=4.5,HALF=2.25,MAX_ROUNDS=22;
const ISLAND_MAPS=[
 [{x:213,y:433,rx:72,ry:54,rotation:.45,seed:3},{x:477,y:611,rx:67,ry:72,rotation:-.57,seed:5},{x:462,y:254,rx:31,ry:35,rotation:.17,seed:9,rock:true}],
 [{x:176,y:337,rx:68,ry:54,rotation:.21,seed:13},{x:445,y:538,rx:78,ry:60,rotation:-.38,seed:18},{x:271,y:708,rx:34,ry:28,rotation:.5,seed:26,rock:true}],
 [{x:433,y:401,rx:83,ry:48,rotation:.59,seed:41},{x:229,y:592,rx:68,ry:57,rotation:-.14,seed:45},{x:492,y:735,rx:37,ry:30,rotation:.9,seed:48,rock:true}]
];
const WEATHER=[{kind:'calm',name:'Попутный бриз'},{kind:'gust',name:'Порывистый ветер'},{kind:'fog',name:'Полоса тумана'}];
function freshOrder(kind='hold'){return {kind,route:[],targetId:null};}
function instruction(s,stage){return s.orders?.[stage]||freshOrder(s.order||'shoot');}
function terrainDistance(isl,x,y){
 const a=-(isl.rotation||0),dx=x-isl.x,dy=y-isl.y;
 const lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
 return Math.hypot(lx/(isl.rx+16),ly/(isl.ry+14));
}
function withinIsland(x,y,pad=1){return (game.islands||[]).some(isl=>terrainDistance(isl,x,y)<pad);}
function readoutRoute(order){return order.route?.length?order.route.length+' ТОЧЕК':order.targetId?'ЦЕЛЬ НАЗНАЧЕНА':'СВОБОДНЫЙ КУРС';}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rand=(s)=>{const x=Math.sin(s*157.317+37.2)*43758.5453;return x-Math.floor(x)};
const namePool=['Свет Марии','Морской ворон','Золотой лев','Святой Георгий','Крыло чайки','Черная лилия','Меч залива','Быстрый ветер'];
const TYPE={
swift:{kind:'Лёгкая галера',maxHp:70,maxCrew:27,speed:59,turn:1.26,range:172,damage:3.1,board:2.2,length:48,beam:15},
heavy:{kind:'Тяжёлая галера',maxHp:108,maxCrew:42,speed:39,turn:.78,range:155,damage:3.8,board:4.1,length:62,beam:21},
bow:{kind:'Стрелковая галера',maxHp:78,maxCrew:29,speed:49,turn:1.04,range:218,damage:5,board:2.5,length:55,beam:17}
};
let store, game={phase:'harbor',round:0,elapsed:0,fleet:[],ships:[],captured:[],events:[],particles:[],battleIndex:1,gold:130,selected:null,endVictory:false,stage:0,islands:[],weather:WEATHER[0],drag:null,grapples:[],eventClock:0};
let view={scale:1,ox:0,oy:0,dpr:1,w:0,h:0},frameTime=0,acc=0,elapsedSound=0;
function makeShip(id,name,type,extra={}) {
 const t=TYPE[type];return {...t,id,name,type,hp:t.maxHp,crew:t.maxCrew,xp:0,level:0,active:true,scars:0,oars:100,maxOars:100,morale:100,...extra};
}
function initialFleet(){return [
 makeShip('ship-1','Святая Маргарита','heavy',{active:true}),
 makeShip('ship-2','Белый сокол','swift',{active:true}),
 makeShip('ship-3','Корсария','bow',{active:true})
];}
function load(){
 try{const p=JSON.parse(localStorage.getItem(KEY)||'null');
 if(p&&Array.isArray(p.fleet)&&Number.isFinite(p.gold)&&Number.isFinite(p.battleIndex)){
   const fleet=p.fleet.filter(s=>s&&TYPE[s.type]&&typeof s.id==='string').slice(0,6)
    .map(s=>({...makeShip(s.id,String(s.name).slice(0,42),s.type),...s,hp:clamp(+s.hp||0,0,TYPE[s.type].maxHp+(+s.level||0)*10),crew:clamp(+s.crew||0,0,TYPE[s.type].maxCrew+(+s.level||0)*3)}));
   game.fleet=fleet.length?fleet:initialFleet();game.fleet.forEach(s=>{s.maxOars=100;s.oars=clamp(Number.isFinite(s.oars)?s.oars:100,0,100);});game.gold=Math.max(0,Math.floor(p.gold));game.battleIndex=Math.max(1,Math.floor(p.battleIndex));
 }else{game.fleet=initialFleet();}
 }catch{game.fleet=initialFleet();}
 ensureFleet();
}
function save(){try{localStorage.setItem(KEY,JSON.stringify({fleet:game.fleet,gold:game.gold,battleIndex:game.battleIndex}));}catch{}}
function ensureFleet(){
 if(!game.fleet.length){const s=makeShip('ship-rescue-'+Date.now(),'Новая надежда','swift');game.fleet=[s];}
 if(!game.fleet.some(s=>s.active))game.fleet[0].active=true;
 const act=game.fleet.filter(s=>s.active);
 act.slice(3).forEach(s=>s.active=false);
}
function activeFleet(){return game.fleet.filter(s=>s.active).slice(0,3)}
function renderHarbor(){
 game.phase='harbor';$('harbor').hidden=false;$('command').hidden=true;$('seaTop').hidden=true;$('toast').hidden=true;
 $('gold').textContent='◈ '+game.gold;$('subtitle').textContent='Гавань · твоя эскадра';
 $('campaignLabel').textContent='ПОХОД '+roman(game.battleIndex);
 $('harborCount').textContent=game.fleet.length+' СУДНА';
 $('activeCount').textContent=activeFleet().length+'/3 В БОЮ';
 $('sailBtn').disabled=!activeFleet().length;
 resize();
 $('fleetList').replaceChildren();
 for(const s of game.fleet){
  const row=document.createElement('div');row.className='ship-row';
  const top=document.createElement('div');top.className='ship-row-top';
  const choose=document.createElement('button');choose.className='ship-choose'+(s.active?' on':'');
  choose.type='button';choose.textContent=s.active?'✓':'+';choose.setAttribute('aria-label',(s.active?'Убрать из боя ':'Взять в бой ')+s.name);
  choose.onclick=()=>{if(s.active&&activeFleet().length<=1){notify('В бою должен остаться хотя бы один корабль');return;}if(!s.active&&activeFleet().length>=3){notify('В бою максимум три корабля');return;}s.active=!s.active;save();renderHarbor();};
  const data=document.createElement('div');data.className='ship-data';
  const title=document.createElement('span');title.className='ship-name';title.textContent=s.name;
  const sub=document.createElement('span');sub.className='ship-sub';sub.textContent=s.kind+' · '+(s.xp?'Опыт '+s.xp:'Новое судно')+(s.level?' · Усиление '+s.level:'')+' · Вёсла '+Math.round(s.oars)+'%';
  data.append(title,sub);
  const hp=document.createElement('div');hp.className='ship-health';hp.title='Корпус '+Math.ceil(s.hp)+'/'+s.maxHp;
  const fill=document.createElement('i');fill.style.width=(100*s.hp/s.maxHp)+'%';hp.append(fill);
  top.append(choose,data,hp);row.append(top);
  const actions=document.createElement('div');actions.className='ship-actions';
  const repair=document.createElement('button');const missing=(s.maxHp-s.hp)+(s.maxCrew-s.crew)*.6+(s.maxOars-s.oars)*.55;const cost=Math.ceil(missing*.7);
  repair.textContent='Ремонт '+(cost?'· '+cost+' ◈':'· готов');repair.disabled=!cost||game.gold<cost;
  repair.onclick=()=>{if(game.gold<cost)return;game.gold-=cost;s.hp=s.maxHp;s.crew=s.maxCrew;s.oars=s.maxOars;save();renderHarbor();};
  const upgrade=document.createElement('button');const upgradeCost=65+s.level*55;
  upgrade.textContent='Усилить · '+upgradeCost+' ◈';upgrade.disabled=game.gold<upgradeCost||s.level>=4;
  upgrade.onclick=()=>{if(game.gold<upgradeCost)return;game.gold-=upgradeCost;s.level++;s.maxHp+=10;s.hp+=10;s.maxCrew+=3;s.crew+=3;s.damage+=.45;s.board+=.25;s.speed+=1.2;save();renderHarbor();};
  actions.append(repair,upgrade);row.append(actions);$('fleetList').append(row);
 }
}
function roman(n){const a=['I','II','III','IV','V','VI','VII','VIII','IX','X'];return a[n-1]||String(n)}
function battleShip(s,side,x,y,angle){
 return {...s,side,x,y,angle,velocity:0,orders:[freshOrder(side==='ally'?'hold':'shoot'),freshOrder(side==='ally'?'shoot':(s.type==='heavy'?'board':'shoot'))],
 order:side==='ally'?'hold':'shoot',_cursor:[0,0],_activeStage:-1,fireTimer:.2+rand(x+y)*.9,ramTimer:0,landTimer:0,
 boarding:false,grappleId:null,grappleCooldown:0,sinkingTimer:0,surrendered:false,retreating:false,dealt:0,kills:0,alive:true,morale:100,oars:clamp(s.oars??100,0,100),maxOars:100};
}
function planEnemyOrders(s){
 if(!s.alive||s.side!=='enemy')return;
 const foes=alive('ally').sort((a,b)=>distance(s,a)-distance(s,b));
 if(!foes.length){s.orders=[freshOrder('hold'),freshOrder('hold')];return;}
 const t=foes.find(v=>!v.grappleId)||foes[0],d=distance(s,t);
 if(s.morale<22||s.retreating){
  s.retreating=true;s.orders=[freshOrder('evade'),freshOrder('evade')];return;
 }
 // AI obeys the identical points budget and distance limits as the player.
 const boardReady=d<94&&s.crew>s.maxCrew*.47&&s.morale>38&&
  (s.type==='heavy'||(s.crew/s.maxCrew)>(t.crew/t.maxCrew)*1.08);
 const fireReady=d<s.range*.87;
 const firstKind=fireReady?'shoot':'hold';
 const secondKind=boardReady?'board':fireReady?'shoot':'hold';
 s.orders=[freshOrder(firstKind),freshOrder(secondKind)];
 for(const o of s.orders)o.targetId=t.id;
 const exposed=t.angle+(s.id.charCodeAt(s.id.length-1)%2?1:-1)*Math.PI*.55;
 const attackPoint=boardReady?{x:t.x,y:t.y}:{
  x:t.x+Math.cos(exposed)*Math.min(s.range*.63,105),
  y:t.y+Math.sin(exposed)*Math.min(s.range*.63,105)
 };
 let origin={x:s.x,y:s.y};
 for(let stage=0;stage<2;stage++){
  if(distance(origin,attackPoint)<(boardReady?23:58))break;
  const angle=Math.atan2(attackPoint.y-origin.y,attackPoint.x-origin.x);
  const allowance=Math.min(stageRange(s)*.94,stage===0?106:74,distance(origin,attackPoint));
  if(allowance<16)break;
  const point={x:clamp(origin.x+Math.cos(angle)*allowance,47,W-47),
    y:clamp(origin.y+Math.sin(angle)*allowance,56,H-56)};
  if(withinIsland(point.x,point.y,1.28)){
   const turn=(s.id.charCodeAt(s.id.length-1)%2?1:-1)*.66;
   point.x=clamp(origin.x+Math.cos(angle+turn)*allowance*.74,47,W-47);
   point.y=clamp(origin.y+Math.sin(angle+turn)*allowance*.74,56,H-56);
  }
  if(!withinIsland(point.x,point.y,1.06)&&distance(origin,point)>12){
   s.orders[stage].route=[point];
   if(canPlan(s,s.orders))origin=point;
   else s.orders[stage].route=[];
  }
 }
 for(let stage=1;stage>=0&&!canPlan(s,s.orders);stage--){
  s.orders[stage].route=[];
  if(!canPlan(s,s.orders))s.orders[stage].kind='hold';
 }
 if(!canPlan(s,s.orders))s.orders=[freshOrder('hold'),freshOrder('hold')];
}
function startBattle(){
 game.ships=[];game.captured=[];game.events=[];game.particles=[];game.grapples=[];game.eventClock=0;game.round=1;game.elapsed=0;game.selected=null;game.stage=0;game.drag=null;
 game.islands=ISLAND_MAPS[(game.battleIndex-1)%ISLAND_MAPS.length].map(i=>({...i}));
 game.weather=WEATHER[(game.battleIndex-1)%WEATHER.length];
 const xs=[142,330,519];
 activeFleet().forEach((s,i)=>game.ships.push(battleShip(s,'ally',xs[i],852+(i%2)*24,-Math.PI/2)));
 const aiTypes=['swift','bow','heavy'];
 aiTypes.forEach((type,i)=>{
  const s=makeShip('enemy-'+game.battleIndex+'-'+i,namePool[(game.battleIndex+i*2)%namePool.length],type,{active:false});
  const mult=1+Math.min(.22,(game.battleIndex-1)*.025);s.hp*=mult;s.maxHp*=mult;s.crew*=mult;s.maxCrew*=mult;s.damage*=mult;
  game.ships.push(battleShip(s,'enemy',xs[i],148-(i%2)*24,Math.PI/2));
 });
 game.ships.filter(s=>s.side==='enemy').forEach(planEnemyOrders);
 game.phase='orders';$('harbor').hidden=true;$('command').hidden=false;$('seaTop').hidden=false;$('endPanel').hidden=true;
 $('orderArea').hidden=false;$('orderArea').style.opacity='1';$('resolveBtn').hidden=false;$('progress').hidden=true;
 $('subtitle').textContent='Боевой порядок · подготовка';$('gold').textContent='◈ '+game.gold;
 selectShip(game.ships.find(s=>s.side==='ally')?.id||null);updateBattleUI();resize();
 notify('Выбери судно. Нарисуй путь, затем укажи вторую команду.');
}
function alive(side){return game.ships.filter(s=>s.alive&&s.side===side)}
function nearest(s){return alive(s.side==='ally'?'enemy':'ally').sort((a,b)=>distance(s,a)-distance(s,b))[0]||null}
function getTarget(s){return game.ships.find(t=>t.id===s.targetId&&t.alive&&t.side!==s.side)||nearest(s)}
function updateBudgetUI(s){
 const b=s?getBudget(s):null;
 $('apRemaining').textContent=b?String(Math.max(0,b.remaining)):'—';
 $('apTotal').textContent=b?'/ '+b.total:' / —';
 $('apSpent0').textContent=b?String(b.stages[0].spent):'0';
 $('apSpent1').textContent=b?String(b.stages[1].spent):'0';
 $('apState').textContent=b?(b.valid?(b.remaining===0?'ВСЁ РАСПРЕДЕЛЕНО':'ОСТАЛОСЬ '+b.remaining+' ОД'):'ПЕРЕРАСХОД'):'ВЫБЕРИ КОРАБЛЬ';
 $('apFormula').textContent=b?('Манёвренность '+(s.turn>1.15?'высокая':s.turn>.9?'средняя':'низкая')+' · '+MOVE_STEP+' ед./ОД'):'Общий запас на оба приказа';
 $('apGauge').classList.toggle('ap-full',Boolean(b&&b.remaining===0));
 const pips=$('apPips');pips.replaceChildren();
 if(b){for(let i=0;i<b.total;i++){
   const dot=document.createElement('i');dot.className='ap-pip '+(i<b.stages[0].spent?'stage-one':i<b.spent?'stage-two':'available');
   dot.setAttribute('aria-label',i<b.spent?'Израсходовано':'Доступно');pips.append(dot);
 }}
}
function selectShip(id){
 const s=game.ships.find(x=>x.id===id&&x.side==='ally'&&x.alive);
 game.selected=s?.id||null;
 $('selectedName').textContent=s?s.name:'Выбери судно';
 $('selectedInfo').textContent=s?('Корпус '+Math.ceil(s.hp)+'/'+Math.ceil(s.maxHp)+' · Экипаж '+Math.ceil(s.crew)+'/'+Math.ceil(s.maxCrew)):'Нажми на корабль своего флота';
 const state=s?condition(s):null,g=s?getGrapple(s):null;
 $('hullMeter').style.width=(s?100*s.hp/s.maxHp:0)+'%';
 $('oarMeter').style.width=(s?100*state.oars:0)+'%';
 $('moraleMeter').style.width=(s?100*state.morale:0)+'%';
 $('hullValue').textContent=s?Math.round(100*s.hp/s.maxHp)+'%':'—';
 $('oarValue').textContent=s?Math.round(100*state.oars)+'%':'—';
 $('moraleValue').textContent=s?Math.round(100*state.morale)+'%':'—';
 $('combatState').textContent=!s?'Выбери корабль':s.sinkingTimer>0?'ПРОБОИНА · '+s.sinkingTimer.toFixed(1)+' с до затопления':
  g?'СЦЕПЛЕНИЕ · '+Math.round(Math.abs(g.progress))+'%':
  s.retreating?'ОТСТУПАЕТ':state.oars<.45?'ПОВРЕЖДЕНЫ ВЁСЛА':
  state.morale<.35?'ЭКИПАЖ КОЛЕБЛЕТСЯ':'ГОТОВ К БОЮ';
 $('combatState').classList.toggle('danger',Boolean(s&&(s.sinkingTimer>0||s.retreating||g)));
 const order=s?instruction(s,game.stage):null;
 $('instruction').textContent=s?(order.route.length?'Маршрут записан. Можно нарисовать новый.':'Проведи по воде или выбери цель для атаки.'):'Выбери судно на поле';
 $('routeCounter').textContent=order?readoutRoute(order):'НЕТ МАРШРУТА';
 $('crewReadout').textContent=s?('ЭКИПАЖ '+Math.ceil(s.crew)):'';
 $('maneuverReadout').textContent=order?({hold:'МАНЁВР',shoot:'СТРЕЛЬБА',board:'АБОРДАЖ',evade:'УКЛОНЕНИЕ'}[order.kind]||'ПРИКАЗ'):'ОЖИДАНИЕ';
 const allowed=s?availableActions(s,game.stage):{};
 document.querySelectorAll('[data-order]').forEach(btn=>{
  btn.classList.toggle('on',Boolean(order&&btn.dataset.order===order.kind));
  btn.disabled=game.phase!=='orders'||!s||!allowed[btn.dataset.order];
 });
 document.querySelectorAll('[data-stage]').forEach(btn=>btn.classList.toggle('on',Number(btn.dataset.stage)===game.stage));
 $('clearRouteBtn').disabled=!order||(order.route.length===0&&!order.targetId);
 updateBudgetUI(s);
}
function updateBattleUI(){
 $('turnLabel').textContent='ХОД '+String(game.round).padStart(2,'0')+' / '+MAX_ROUNDS;
 $('shipsLeft').textContent=alive('ally').length+' СВОИХ · '+alive('enemy').length+' ЧУЖИХ';
 $('weatherLabel').textContent=game.weather?.name||'Ясная погода';
 $('scenarioLabel').textContent='4,5 СЕК / ХОД';
 if(game.phase==='orders')$('commandCaption').textContent='ПРИКАЗЫ ЭСКАДРЕ';
 if(game.selected)selectShip(game.selected);
}
function setStage(stage){if(game.phase!=='orders')return;game.stage=stage;selectShip(game.selected);}

function normalize(a){while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a}
function maneuver(s,dt){
 if(s.grappleId){s.velocity*=Math.max(0,1-dt*4);return;}
 const stage=game.phase==='resolve'?Math.min(1,Math.floor(game.elapsed/HALF)):0;
 if(s._activeStage!==stage){s._activeStage=stage;s._cursor[stage]=0;}
 const ins=instruction(s,stage);s.order=ins.kind;
 const t=game.ships.find(v=>v.id===ins.targetId&&v.alive&&v.side!==s.side)||nearest(s);
 let goal=null;
 const points=ins.route||[];
 let index=s._cursor[stage]||0;
 while(index<points.length&&distance(s,points[index])<18)index++;
 s._cursor[stage]=index;
 if(index<points.length)goal=points[index];
 if(s.retreating)goal={x:s.x,y:s.side==='ally'?H+60:-60};
 // A command's action never grants free sailing toward an opponent.
 // Only an explicit, paid course can propel a warship; otherwise it coasts briefly.
 if(!goal){
  s.velocity=Math.max(0,s.velocity-dt*68);
  s.x+=Math.cos(s.angle)*s.velocity*dt;
  s.y+=Math.sin(s.angle)*s.velocity*dt;
  return;
 }
 let dx=goal.x-s.x,dy=goal.y-s.y;
 // Reactive avoidance handles islands for both player and AI.
 for(const isl of game.islands){
  const ex=(s.x-isl.x)/(isl.rx+35),ey=(s.y-isl.y)/(isl.ry+34),r=Math.hypot(ex,ey);
  if(r<1.8){
   const aheadX=s.x+dx/Math.max(1,Math.hypot(dx,dy))*48,aheadY=s.y+dy/Math.max(1,Math.hypot(dx,dy))*48;
   if(terrainDistance(isl,aheadX,aheadY)<1.36||r<1.12){
    const awayX=(s.x-isl.x)/((isl.rx+35)**2),awayY=(s.y-isl.y)/((isl.ry+35)**2),mag=Math.hypot(awayX,awayY)||1;
    const sign=Math.sign(awayX*dy-awayY*dx)||1;
    dx+=(awayX/mag)*120+(-awayY/mag)*sign*90;
    dy+=(awayY/mag)*120+(awayX/mag)*sign*90;
   }
  }
 }
 const state=condition(s),desired=Math.atan2(dy,dx),turn=clamp(normalize(desired-s.angle),-s.turn*state.turn*dt*1.15,s.turn*state.turn*dt*1.15);
 s.angle=normalize(s.angle+turn);
 let speed=s.speed*state.speed*1.15;
 if(game.weather?.kind==='gust')speed*=1.14;
 if(ins.kind==='evade')speed*=1.2;
 if(ins.kind==='board'&&t&&distance(s,t)<50)speed=Math.min(speed,19);
 if(s.sinkingTimer>0)speed*=.28;
 if(index<points.length&&distance(s,goal)<35)speed*=.78;
 s.velocity+=(speed-s.velocity)*Math.min(1,dt*.92);
 s.x+=Math.cos(s.angle)*s.velocity*dt;s.y+=Math.sin(s.angle)*s.velocity*dt;
 if(s.retreating&&(s.y<49||s.y>H-49)){
   s.alive=false;s.escaped=true;s.hp=Math.max(1,s.hp);
   logEvent(s.name+' вышел из боя!');
   return;
 }
 if(s.x<38||s.x>W-38||s.y<40||s.y>H-40){
  s.x=clamp(s.x,38,W-38);s.y=clamp(s.y,40,H-40);
  s.angle=normalize(s.angle+Math.PI*.46*dt);s.velocity*=.62;
 }
 for(const isl of game.islands){
  if(terrainDistance(isl,s.x,s.y)<1){
   const dx=s.x-isl.x,dy=s.y-isl.y,ang=Math.atan2(dy,dx),ratio=terrainDistance(isl,s.x,s.y)||.01;
   s.x+=Math.cos(ang)*(1-ratio)*24;s.y+=Math.sin(ang)*(1-ratio)*24;s.velocity*=-.13;
   if(s.landTimer<=0){
    damage(s,2.7,0,null);burst(s.x,s.y,'#d4d4b5',8);s.landTimer=1.8;
    logEvent(s.name+' на мели!');
   }
  }
 }
}
function endGrapple(g,reason){
 const a=game.ships.find(s=>s.id===g.a),b=game.ships.find(s=>s.id===g.b);
 if(a){a.grappleId=null;a.grappleCooldown=2.4;}if(b){b.grappleId=null;b.grappleCooldown=2.4;}
 if(reason&&a&&b){const d=Math.max(.001,distance(a,b)),ux=(b.x-a.x)/d,uy=(b.y-a.y)/d;a.x-=ux*12;a.y-=uy*12;b.x+=ux*12;b.y+=uy*12;}
 game.grapples=game.grapples.filter(x=>x.id!==g.id);
 if(reason)logEvent(reason);
}
function getGrapple(ship){return game.grapples.find(g=>g.id===ship.grappleId);}
function beginGrapple(attacker,defender){
 if(!attacker?.alive||!defender?.alive||attacker.grappleId||defender.grappleId||attacker.grappleCooldown>0||defender.grappleCooldown>0)return false;
 const id=[attacker.id,defender.id].sort().join('::');
 game.grapples.push({id,a:attacker.id,b:defender.id,initiator:attacker.id,progress:0,escape:0,age:0});
 attacker.grappleId=id;defender.grappleId=id;attacker.velocity*=.16;defender.velocity*=.16;
 burst((attacker.x+defender.x)/2,(attacker.y+defender.y)/2,'#e5cca0',14);
 logEvent(attacker.name+' зацепил '+defender.name+'!');
 return true;
}
function captureShip(victim,aggressor){
 if(!victim.alive)return;
 victim.alive=false;victim.surrendered=true;victim.hp=Math.max(1,victim.hp);
 const g=getGrapple(victim);if(g)endGrapple(g);
 if(aggressor){aggressor.kills++;aggressor.morale=clamp(aggressor.morale+9,0,100);}
 if(victim.side==='enemy'&&aggressor?.side==='ally')game.captured.push(victim);
 burst(victim.x,victim.y,'#f0d89a',20);
 logEvent(victim.name+' спустил флаг — '+(aggressor?.side==='ally'?'трофей!':'судно потеряно.'));
}
function sinkShip(s){
 if(!s.alive)return;
 s.alive=false;s.hp=0;s.sinkingTimer=0;
 const g=getGrapple(s);if(g)endGrapple(g);
 burst(s.x,s.y,'#bfcabd',30);logEvent(s.name+' ушёл под воду!');
}
function damage(s,hp,crew,from,extra={}){
 if(!s.alive)return;
 hp=Math.max(0,hp||0);crew=Math.max(0,crew||0);
 s.hp=Math.max(0,s.hp-hp);s.crew=Math.max(0,s.crew-crew);
 s.oars=clamp(s.oars-(extra.oars||0),0,100);
 s.morale=clamp(s.morale-(extra.morale||0)-crew*.6,0,100);
 if(from&&from.side!==s.side)from.dealt+=hp+crew*.5+(extra.oars||0)*.3;
 if(s.hp<=0&&!s.sinkingTimer){
  s.sinkingTimer=4.5;s.velocity*=.25;
  logEvent('Пробоина у '+s.name+' — корабль тонет!');
 }
 if(s.morale<18&&!s.grappleId&&!s.sinkingTimer)s.retreating=true;
 if(s.grappleId&&(s.crew<=0||s.morale<=0)){
  captureShip(s,from||game.ships.find(v=>v.id===getGrapple(s)?.initiator&&v.id!==s.id));
 }else if(s.crew<=0){
  s.alive=false;s.surrendered=true;
  logEvent(s.name+' остался без экипажа!');
 }
}
function logEvent(t){
 // Last real encounter remains visible until a newer event replaces it.
 game.events.push(t);if(game.events.length>6)game.events.shift();notify(t);
 const feed=$('combatFeed');if(feed){feed.textContent=t;feed.classList.remove('flash');void feed.offsetWidth;feed.classList.add('flash');}
}
function burst(x,y,color,n){
 for(let i=0;i<n;i++){let a=rand(x+i*17+y)*TAU,sp=20+rand(y+i*73)*72;
  game.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.6+rand(i+x)*.6,color});}
}
function resolveGrapples(dt){
 for(const g of [...game.grapples]){
  const a=game.ships.find(s=>s.id===g.a),b=game.ships.find(s=>s.id===g.b);
  if(!a?.alive||!b?.alive){endGrapple(g);continue;}
  g.age+=dt;
  // Hulls remain beside one another throughout the boarding contest.
  const d=Math.max(.001,distance(a,b)),desired=(a.beam+b.beam)*.92+18,ux=(b.x-a.x)/d,uy=(b.y-a.y)/d;
  const correction=(d-desired)*Math.min(.38,dt*5);
  a.x+=ux*correction;a.y+=uy*correction;b.x-=ux*correction;b.y-=uy*correction;
  a.velocity*=.64;b.velocity*=.64;
  const sa=Math.min(1,Math.floor(game.elapsed/HALF));
  const oa=instruction(a,sa),ob=instruction(b,sa);
  const flee=oa.kind==='evade'||ob.kind==='evade';
  if(flee){
   const escapeShip=oa.kind==='evade'?a:b,esc=condition(escapeShip);
   g.escape+=dt*(21+escapeShip.turn*22)*esc.oars;
   if(g.escape>=44){endGrapple(g,escapeShip.name+' разорвал сцепление!');continue;}
  }else g.escape=Math.max(0,g.escape-dt*7);
  const attacker=game.ships.find(s=>s.id===g.initiator)||a,defender=attacker.id===a.id?b:a;
  const saCount=nearbySupport(game.ships,attacker,defender);
  const sbCount=nearbySupport(game.ships,defender,attacker);
  const clash=contest(attacker,defender,saCount,sbCount);
  const aggressive=instruction(attacker,sa).kind==='board';
  const defending=instruction(defender,sa).kind==='board';
  const pressure=clash.pressure*(aggressive?1:.37)-(defending?clash.defense*2.1:0);
  g.progress=clamp(g.progress+pressure*dt,-110,110);
  damage(attacker,0,clash.attackerCrewDamage*dt,defender,{morale:clash.attackerMoraleDamage*dt});
  damage(defender,0,clash.defenderCrewDamage*dt,attacker,{morale:clash.defenderMoraleDamage*dt});
  if(!attacker.alive||!defender.alive)continue;
  if(g.progress>=100)captureShip(defender,attacker);
  else if(g.progress<=-100)captureShip(attacker,defender);
 }
}
function advance(dt){
 game.elapsed+=dt;
 const live=game.ships.filter(s=>s.alive);
 for(const s of live){
  s.fireTimer=Math.max(0,s.fireTimer-dt);s.ramTimer=Math.max(0,s.ramTimer-dt);s.landTimer=Math.max(0,s.landTimer-dt);s.grappleCooldown=Math.max(0,(s.grappleCooldown||0)-dt);
  if(s.sinkingTimer>0){s.sinkingTimer-=dt;if(s.sinkingTimer<=.017){sinkShip(s);continue;}}
  maneuver(s,dt);
 }
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
  const a=live[i],b=live[j];if(!a.alive||!b.alive)continue;
  const d=distance(a,b),sep=(a.length+b.length)*.45;
  if(d>=sep||d<.001)continue;
  if(a.grappleId&&a.grappleId===b.grappleId)continue;
  const dx=(b.x-a.x)/d,dy=(b.y-a.y)/d,penetration=sep-d;
  const approach=Math.max(0,
   (Math.cos(a.angle)*a.velocity-Math.cos(b.angle)*b.velocity)*dx+
   (Math.sin(a.angle)*a.velocity-Math.sin(b.angle)*b.velocity)*dy);
  a.x-=dx*penetration*.35;a.y-=dy*penetration*.35;b.x+=dx*penetration*.35;b.y+=dy*penetration*.35;
  if(a.side===b.side){a.velocity*=.84;b.velocity*=.84;continue;}
  const stage=Math.min(1,Math.floor(game.elapsed/HALF));
  const ao=instruction(a,stage),bo=instruction(b,stage);
  if(ao.kind==='board'||bo.kind==='board'){
   // Engagement is possible only when oared ships have sufficiently slowed.
   const closer=ao.kind==='board'?a:b,opponent=closer===a?b:a;
   if(distance(a,b)<sep+7&&approach<28&&closer.morale>35&&closer.crew>closer.maxCrew*.42)beginGrapple(closer,opponent);
  }
  if(a.ramTimer<=0&&b.ramTimer<=0){
   const force=approach*.092;
   if(force>2.3){
    const toB=attackPacket(a,b,'ram',approach),toA=attackPacket(b,a,'ram',approach);
    damage(b,toB.hull,toB.crew,a,{oars:toB.oars,morale:toB.morale});
    damage(a,toA.hull,toA.crew,b,{oars:toA.oars,morale:toA.morale});
    a.ramTimer=b.ramTimer=2.5;
    burst((a.x+b.x)/2,(a.y+b.y)/2,'#e2c6a3',12);
    if(toB.oars>5||toA.oars>5)logEvent('Сломаны вёсла при столкновении!');
   }
  }
  a.velocity*=.78;b.velocity*=.78;
 }
 // A volley requires a firing arc, line of sight and a target not locked to a friendly ship.
 for(const s of live){
  if(!s.alive||s.grappleId||s.sinkingTimer>0)continue;
  const stage=Math.min(1,Math.floor(game.elapsed/HALF)),ins=instruction(s,stage);
  if(ins.kind!=='shoot')continue;
  const t=game.ships.find(v=>v.id===ins.targetId&&v.alive&&v.side!==s.side)||nearest(s);
  if(!t||!t.alive||t.grappleId||s.fireTimer>0)continue;
  const d=distance(s,t),bearing=Math.abs(normalize(Math.atan2(t.y-s.y,t.x-s.x)-s.angle));
  const precision=game.weather?.kind==='fog'?.72:1;
  if(d>s.range*precision||bearing>2.7||rangeBlocked(s,t,game.islands,terrainDistance))continue;
  const packet=attackPacket(s,t,'arrows');
  // Broadside shooting is a concrete positional advantage, not a cosmetic angle.
  const broadside=Math.abs(Math.sin(normalize(Math.atan2(t.y-s.y,t.x-s.x)-s.angle)));
  const advantage=.62+.57*broadside;
  damage(t,packet.hull*advantage,packet.crew*advantage,s,
   {oars:packet.oars*advantage,morale:packet.morale*advantage});
  s.fireTimer=1.15+rand(game.elapsed+s.x)*.35;
  game.particles.push({x:s.x,y:s.y,vx:(t.x-s.x)/Math.max(d,1)*190,vy:(t.y-s.y)/Math.max(d,1)*190,
    life:Math.min(.56,d/190),color:s.side==='ally'?'#f0dab0':'#e2b1a0',arrow:true});
  if(t.oars<43&&t.oars+packet.oars>=43)logEvent('Гребцы '+t.name+' теряют ход!');
 }
 resolveGrapples(dt);
 for(const p of game.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
 game.particles=game.particles.filter(p=>p.life>0).slice(-160);
 if(game.selected&&Math.floor(game.elapsed*3)!==Math.floor((game.elapsed-dt)*3))selectShip(game.selected);
}
function startResolve(){
 if(game.phase!=='orders')return;
 for(const s of game.ships.filter(s=>s.alive)){
  if(canPlan(s,s.orders))continue;
  if(s.side==='ally'){selectShip(s.id);notify('Недостаточно очков на оба приказа.');return;}
  planEnemyOrders(s);
  if(!canPlan(s,s.orders))s.orders=[freshOrder('hold'),freshOrder('hold')];
 }
 game.phase='resolve';game.elapsed=0;acc=0;
 for(const s of game.ships){s._cursor=[0,0];s._activeStage=-1;}
 $('subtitle').textContent='Бой · исполнение';$('commandCaption').textContent='СУДА ИСПОЛНЯЮТ ПРИКАЗЫ';
 $('resolveBtn').hidden=true;$('orderArea').style.opacity='.42';
 $('progress').hidden=false;$('progressFill').style.width='0%';
}
function finishPhase(){
 $('progress').hidden=true;$('orderArea').style.opacity='1';
 const good=alive('ally').length,bad=alive('enemy').length;
 if(!good||!bad||game.round>=MAX_ROUNDS){finishBattle();return;}
 game.round++;game.phase='orders';game.stage=0;
 if(game.round===4||game.round===8){
  game.weather=WEATHER[(WEATHER.indexOf(game.weather)+1)%WEATHER.length];
  logEvent('Погода меняется: '+game.weather.name);
 }
 for(const s of game.ships.filter(s=>s.alive)){
  s._cursor=[0,0];s._activeStage=-1;
  if(s.side==='ally'){
   s.orders=[freshOrder('hold'),freshOrder('shoot')];
   if(!canPlan(s,s.orders))s.orders[1]=freshOrder('shoot');
  }
  else planEnemyOrders(s);
 }
$('resolveBtn').hidden=false;
 $('subtitle').textContent='Сражение · фаза приказов';
 updateBattleUI();notify('Новая фаза: скорректируй приказы');
}
function finishBattle(){
 const score=s=>alive(s).reduce((a,v)=>a+v.hp/v.maxHp+v.crew/v.maxCrew*.5,0);
 const win=alive('enemy').length===0||score('ally')>=score('enemy')&&alive('ally').length>0;game.endVictory=win;game.phase='result';
 const survivors=game.ships.filter(s=>s.side==='ally'&&(s.alive||s.escaped));
 const dead=game.ships.filter(s=>s.side==='ally'&&!s.alive&&!s.escaped).length;
 for(const s of game.ships.filter(s=>s.side==='ally')){
  const original=game.fleet.find(f=>f.id===s.id);
  if(!original)continue;
  if(!s.alive&&!s.escaped){game.fleet=game.fleet.filter(f=>f.id!==s.id);continue;}
  original.hp=clamp(s.hp,1,s.maxHp);original.crew=clamp(s.crew,1,s.maxCrew);original.oars=clamp(s.oars,0,100);
  original.xp+=(win?16:7)+Math.round(s.dealt*.3);original.kills=(original.kills||0)+s.kills;
 }
 let prizes=0;
 for(const c of game.captured){
  if(game.fleet.length>=6)break;
  const copy=makeShip('prize-'+game.battleIndex+'-'+prizes+'-'+Date.now(),c.name,c.type,{hp:Math.max(25,c.hp*.7),crew:Math.max(8,Math.round(c.maxCrew*.35)),oars:Math.max(22,Math.round(c.oars*.72)),xp:3,active:false});
  game.fleet.push(copy);prizes++;
 }
 const goldEarned=(win?85:32)+Math.round(game.ships.filter(s=>s.side==='ally').reduce((n,s)=>n+s.dealt,0)*.15);
 game.gold+=goldEarned;game.battleIndex++;ensureFleet();save();
 $('selectedName').textContent=win?'Победа на море':'Тяжёлое сражение';$('selectedInfo').textContent='Операция завершена';
 $('commandCaption').textContent='ИТОГ СРАЖЕНИЯ';$('orderArea').hidden=true;$('resolveBtn').hidden=true;
 $('endPanel').hidden=false;
 $('endTitle').textContent=win?'Море за тобой':'Флот возвращается';
 $('endText').textContent='Вернулось '+survivors.length+' из '+(survivors.length+dead)+' судов. Потеряно '+dead+'. Захвачено '+prizes+'. Награда: '+goldEarned+' монет. Корабли сохранили повреждения и опыт.';
 $('subtitle').textContent='Сражение · итог';
 updateBattleUI();resize();
}
function notify(message){
 $('toast').textContent=message;$('toast').hidden=false;
 clearTimeout(notify.timer);notify.timer=setTimeout(()=>{$('toast').hidden=true;},2700);
}
function resize(){
 const rect=canvas.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);
 if(!rect.width||!rect.height)return;
 view={w:rect.width,h:rect.height,dpr,scale:Math.min(rect.width/W,rect.height/H),ox:0,oy:0};
 view.ox=(rect.width-W*view.scale)/2;view.oy=(rect.height-H*view.scale)/2;
 canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
}
function pointFromEvent(event){
 const r=canvas.getBoundingClientRect();const x=(event.clientX-r.left-view.ox)/view.scale,y=(event.clientY-r.top-view.oy)/view.scale;
 if(!Number.isFinite(x)||!Number.isFinite(y))return null;
 return {x:clamp(x,32,W-32),y:clamp(y,32,H-32)};
}
function hitShip(p){
 return game.ships.filter(s=>s.alive).map(s=>({s,d:distance(s,p)})).sort((a,b)=>a.d-b.d).find(o=>o.d<Math.max(31,21/view.scale))?.s||null;
}
function addRoutePoint(s,point){
 if(!s||withinIsland(point.x,point.y,.95))return false;
 const stage=game.stage,order=instruction(s,stage),route=order.route;
 const previous=route.length?route[route.length-1]:(stage===0?{x:s.x,y:s.y}:(instruction(s,0).route.slice(-1)[0]||{x:s.x,y:s.y}));
 if(distance(previous,point)<10)return false;
 const oldLength=route.length;
 const tryPoint=(p)=>{
  route.push({x:p.x,y:p.y});
  const ok=canPlan(s,s.orders);if(!ok)route.pop();
  return ok;
 };
 if(tryPoint(point)){if(route.length>36)route.splice(1,1);return true;}
 // Keep the maximal affordable segment, rather than silently discarding the stroke.
 let lo=0,hi=1;
 for(let k=0;k<12;k++){const mid=(lo+hi)/2,p={x:previous.x+(point.x-previous.x)*mid,y:previous.y+(point.y-previous.y)*mid};
  if(tryPoint(p)){route.pop();lo=mid;}else hi=mid;
 }
 if(lo>.02){const p={x:previous.x+(point.x-previous.x)*lo,y:previous.y+(point.y-previous.y)*lo};
  if(distance(previous,p)>3&&tryPoint(p))return true;
 }
 return oldLength!==route.length;
}
function onPointerDown(e){
 if(game.phase!=='orders')return;
 const p=pointFromEvent(e);if(!p)return;
 const chosen=hitShip(p);
 if(chosen){
  if(chosen.side==='ally'){selectShip(chosen.id);return;}
  const s=game.ships.find(x=>x.id===game.selected&&x.alive);if(!s)return;
  const order=instruction(s,game.stage),old={kind:order.kind,targetId:order.targetId,route:order.route};
  order.targetId=chosen.id;order.route=[];
  if(order.kind==='hold')order.kind='board';
  if(!canPlan(s,s.orders)){
   Object.assign(order,old);notify('Недостаточно ОД: очисти часть пути или выбери другое действие.');return;
  }
  selectShip(s.id);notify('Цель выбрана для половины '+(game.stage+1));return;
 }
 const s=game.ships.find(x=>x.id===game.selected&&x.alive);if(!s)return;
 if(withinIsland(p.x,p.y)){notify('Скалы непроходимы: проведи путь вокруг острова.');return;}
 const order=instruction(s,game.stage),oldRoute=order.route,oldTarget=order.targetId;
 order.route=[];order.targetId=null;
 const accepted=addRoutePoint(s,p);
 if(!accepted){order.route=oldRoute;order.targetId=oldTarget;notify('На этот манёвр не хватает очков движения.');selectShip(s.id);return;}
 game.drag={id:s.id,pointerId:e.pointerId,start:p,length:0,budgetHit:false};
 try{canvas.setPointerCapture?.(e.pointerId);}catch{}
 selectShip(s.id);
}
function onPointerMove(e){
 if(game.phase!=='orders'||!game.drag||game.drag.pointerId!==e.pointerId)return;
 const p=pointFromEvent(e);if(!p)return;
 const s=game.ships.find(x=>x.id===game.drag.id&&x.alive);if(!s)return;
 if(distance(game.drag.start,p)>6)game.drag.length++;
 const added=addRoutePoint(s,p);
 if(!added)game.drag.budgetHit=true;
 if(added)selectShip(s.id);
}
function onPointerUp(e){
 if(!game.drag||game.drag.pointerId!==e.pointerId)return;
 const s=game.ships.find(x=>x.id===game.drag.id&&x.alive);
 game.drag=null;
 try{canvas.releasePointerCapture?.(e.pointerId);}catch{}
 if(s){selectShip(s.id);const b=getBudget(s);notify('Осталось '+b.remaining+' из '+b.total+' ОД на весь ход.');}
}
function seaBackground(now){renderSea(ctx,now,game.islands||[],game.weather,W,H);}
function drawShip(s,now,ghost=false){renderGalley(ctx,s,now,!ghost&&s.id===game.selected&&game.phase==='orders');}
function drawOrders(s){
 if(s.side!=='ally'||!s.alive)return;
 for(let stage=0;stage<2;stage++){
  const o=instruction(s,stage),route=o.route||[];
  if(!route.length)continue;
  const prev=instruction(s,0).route;
  const start=stage===0?{x:s.x,y:s.y}:(prev.length?prev[prev.length-1]:{x:s.x,y:s.y});
  const selected=s.id===game.selected;
  ctx.save();ctx.strokeStyle=stage?'#f1ab80':'#f4d9a2';ctx.fillStyle=ctx.strokeStyle;
  ctx.lineWidth=selected?2.6:1.3;ctx.globalAlpha=selected?.96:.36;
  ctx.setLineDash(stage?[9,5]:[4,5]);ctx.beginPath();ctx.moveTo(start.x,start.y);
  for(const p of route)ctx.lineTo(p.x,p.y);
  ctx.stroke();ctx.setLineDash([]);
  for(const p of route){ctx.beginPath();ctx.arc(p.x,p.y,2.6,0,TAU);ctx.fill();}
  const end=route[route.length-1],last=route[route.length-2]||start;
  const heading=Math.atan2(end.y-last.y,end.x-last.x);
  ctx.save();ctx.translate(end.x,end.y);ctx.rotate(heading);
  ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-7,-6);ctx.lineTo(-3,0);ctx.lineTo(-7,6);ctx.closePath();ctx.fill();ctx.restore();
  if(selected){ctx.font='700 13px system-ui';ctx.textAlign='center';ctx.fillText(String(stage+1),end.x,end.y-13);}
  ctx.restore();
 }
}
function drawMovementBadge(s){
 if(!s.alive||s.side!=='ally'||s.id!==game.selected||game.phase!=='orders')return;
 const b=getBudget(s),x=clamp(s.x+49,48,W-49),y=clamp(s.y+34,40,H-40);
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillStyle='rgba(15,48,48,.89)';ctx.strokeStyle='#efd39e';ctx.lineWidth=1.4;
 ctx.beginPath();ctx.roundRect(x-29,y-12,58,24,4);ctx.fill();ctx.stroke();
 ctx.fillStyle='#f5dfb4';ctx.font='700 15px system-ui';
 ctx.fillText(b.remaining+' / '+b.total,x,y+.5);ctx.restore();
}
function render(now){
 const {dpr,w,h,scale,ox,oy}=view;if(!w||!h)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0f313d';ctx.fillRect(0,0,w,h);
 ctx.translate(ox,oy);ctx.scale(scale,scale);seaBackground(now);
 if(game.phase==='harbor'){
  const ghost=[{...makeShip('g1','', 'heavy'),x:200,y:730,angle:-1.7,side:'ally',velocity:0}, {...makeShip('g2','','bow'),x:435,y:570,angle:-1.45,side:'ally',velocity:0}, {...makeShip('g3','','swift'),x:360,y:265,angle:1.6,side:'ally',velocity:0}];
  for(const s of ghost)drawShip(s,now,true);
 }else{
  const ss=game.ships.filter(s=>s.alive);
  // Ropes and the balance of boarding progress stay on the chart.
  for(const g of game.grapples){
   const a=game.ships.find(s=>s.id===g.a),b=game.ships.find(s=>s.id===g.b);
   if(!a?.alive||!b?.alive)continue;
   ctx.save();ctx.strokeStyle='#ebca95';ctx.lineWidth=3;ctx.setLineDash([3,3]);
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
   const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,progress=clamp((g.progress+100)/200,0,1);
   ctx.fillStyle='#102f35ed';ctx.fillRect(mx-27,my-27,54,8);
   ctx.fillStyle='#d8b37f';ctx.fillRect(mx-25,my-25,50*progress,4);
   ctx.restore();
  }
  if(game.phase==='orders')for(const s of ss)drawOrders(s);
  for(const s of ss)drawShip(s,now);
  if(game.phase==='orders')for(const s of ss)drawMovementBadge(s);
  for(const p of game.particles){
   ctx.globalAlpha=clamp(p.life/.7,0,1);ctx.strokeStyle=p.color;ctx.fillStyle=p.color;
   ctx.lineWidth=p.arrow?2:1;ctx.beginPath();
   if(p.arrow){ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();}
   else{ctx.arc(p.x,p.y,1.6,0,TAU);ctx.fill();}
  }
  ctx.globalAlpha=1;
 }
}
function loop(now){
 const delta=frameTime?clamp((now-frameTime)/1000,0,.07):0;frameTime=now;
 if(game.phase==='resolve'){
  acc+=delta;let count=0;
  while(acc>=1/30&&count<4){advance(1/30);acc-=1/30;count++;}
  $('progressFill').style.width=clamp(game.elapsed/PHASE_SECONDS*100,0,100)+'%';
  if(!alive('ally').length||!alive('enemy').length||game.elapsed>=PHASE_SECONDS)finishPhase();
 }
 render(now);requestAnimationFrame(loop);
}
canvas.addEventListener('pointerdown',onPointerDown);
canvas.addEventListener('pointermove',onPointerMove);
canvas.addEventListener('pointerup',onPointerUp);
canvas.addEventListener('pointercancel',onPointerUp);
document.querySelectorAll('[data-stage]').forEach(btn=>btn.addEventListener('click',()=>setStage(Number(btn.dataset.stage))));
$('clearRouteBtn').addEventListener('click',()=>{const s=game.ships.find(x=>x.id===game.selected&&x.alive);if(!s)return;const o=instruction(s,game.stage);o.route=[];o.targetId=null;selectShip(s.id);});
document.querySelectorAll('[data-order]').forEach(btn=>btn.addEventListener('click',()=>{
 const s=game.ships.find(s=>s.id===game.selected&&s.alive);
 if(s&&game.phase==='orders'){
  const order=instruction(s,game.stage),previous=order.kind;
  order.kind=btn.dataset.order;
  if(!canPlan(s,s.orders)){order.kind=previous;notify('Недостаточно очков движения на этот приказ.');return;}
  selectShip(s.id);
 }
}));
$('sailBtn').addEventListener('click',startBattle);
$('resolveBtn').addEventListener('click',startResolve);
$('returnBtn').addEventListener('click',()=>{renderHarbor();});
$('helpBtn').addEventListener('click',()=>{$('help').hidden=false;});
$('helpClose').addEventListener('click',()=>{$('help').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('help').hidden=true;if(e.key===' '&&game.phase==='orders'&&!e.repeat){e.preventDefault();startResolve();}});
window.addEventListener('resize',resize);
if(typeof ResizeObserver==='function'){
 const canvasObserver=new ResizeObserver(()=>resize());
 canvasObserver.observe(canvas);
}
document.addEventListener('visibilitychange',()=>{frameTime=0;});
load();renderHarbor();resize();requestAnimationFrame(loop);
