import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { renderSea, renderGalley } from './sea-art.js';
installMobileRuntime();

const $ = (id) => document.getElementById(id);
const canvas = $('sea'), ctx = canvas.getContext('2d', {alpha:false});
const W=1000,H=620,TAU=Math.PI*2,KEY='pocket-works:flotiliya:v1';
const PHASE_SECONDS=4.5,HALF=2.25,MAX_ROUNDS=22;
const ISLAND_MAPS=[
 [{x:448,y:223,rx:51,ry:38,rotation:.4,seed:3},{x:602,y:430,rx:60,ry:43,rotation:-.6,seed:5},{x:545,y:78,rx:29,ry:24,rotation:.1,seed:9,rock:true}],
 [{x:490,y:140,rx:63,ry:36,rotation:.5,seed:13},{x:502,y:424,rx:47,ry:57,rotation:-.3,seed:18},{x:690,y:316,rx:30,ry:26,rotation:.5,seed:26,rock:true}],
 [{x:390,y:341,rx:47,ry:42,rotation:.3,seed:41},{x:617,y:247,rx:55,ry:38,rotation:-.1,seed:45},{x:535,y:504,rx:33,ry:25,rotation:.9,seed:48,rock:true}]
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
let store, game={phase:'harbor',round:0,elapsed:0,fleet:[],ships:[],captured:[],events:[],particles:[],battleIndex:1,gold:130,selected:null,endVictory:false,stage:0,islands:[],weather:WEATHER[0],drag:null};
let view={scale:1,ox:0,oy:0,dpr:1,w:0,h:0},frameTime=0,acc=0,elapsedSound=0;
function makeShip(id,name,type,extra={}) {
 const t=TYPE[type];return {...t,id,name,type,hp:t.maxHp,crew:t.maxCrew,xp:0,level:0,active:true,scars:0,...extra};
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
   game.fleet=fleet.length?fleet:initialFleet();game.gold=Math.max(0,Math.floor(p.gold));game.battleIndex=Math.max(1,Math.floor(p.battleIndex));
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
 $('fleetList').replaceChildren();
 for(const s of game.fleet){
  const row=document.createElement('div');row.className='ship-row';
  const top=document.createElement('div');top.className='ship-row-top';
  const choose=document.createElement('button');choose.className='ship-choose'+(s.active?' on':'');
  choose.type='button';choose.textContent=s.active?'✓':'+';choose.setAttribute('aria-label',(s.active?'Убрать из боя ':'Взять в бой ')+s.name);
  choose.onclick=()=>{if(s.active&&activeFleet().length<=1){notify('В бою должен остаться хотя бы один корабль');return;}if(!s.active&&activeFleet().length>=3){notify('В бою максимум три корабля');return;}s.active=!s.active;save();renderHarbor();};
  const data=document.createElement('div');data.className='ship-data';
  const title=document.createElement('span');title.className='ship-name';title.textContent=s.name;
  const sub=document.createElement('span');sub.className='ship-sub';sub.textContent=s.kind+' · '+(s.xp?'Опыт '+s.xp:'Новое судно')+(s.level?' · Усиление '+s.level:'');
  data.append(title,sub);
  const hp=document.createElement('div');hp.className='ship-health';hp.title='Корпус '+Math.ceil(s.hp)+'/'+s.maxHp;
  const fill=document.createElement('i');fill.style.width=(100*s.hp/s.maxHp)+'%';hp.append(fill);
  top.append(choose,data,hp);row.append(top);
  const actions=document.createElement('div');actions.className='ship-actions';
  const repair=document.createElement('button');const missing=(s.maxHp-s.hp)+(s.maxCrew-s.crew)*.6;const cost=Math.ceil(missing*.7);
  repair.textContent='Ремонт '+(cost?'· '+cost+' ◈':'· готов');repair.disabled=!cost||game.gold<cost;
  repair.onclick=()=>{if(game.gold<cost)return;game.gold-=cost;s.hp=s.maxHp;s.crew=s.maxCrew;save();renderHarbor();};
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
 boarding:false,dealt:0,kills:0,alive:true};
}
function startBattle(){
 game.ships=[];game.captured=[];game.events=[];game.particles=[];game.round=1;game.elapsed=0;game.selected=null;game.stage=0;game.drag=null;
 game.islands=ISLAND_MAPS[(game.battleIndex-1)%ISLAND_MAPS.length].map(i=>({...i}));
 game.weather=WEATHER[(game.battleIndex-1)%WEATHER.length];
 const ys=[136,311,487];
 activeFleet().forEach((s,i)=>game.ships.push(battleShip(s,'ally',190,ys[i],0)));
 const aiTypes=['swift','bow','heavy'];
 aiTypes.forEach((type,i)=>{
  const s=makeShip('enemy-'+game.battleIndex+'-'+i,namePool[(game.battleIndex+i*2)%namePool.length],type,{active:false});
  const mult=1+Math.min(.22,(game.battleIndex-1)*.025);s.hp*=mult;s.maxHp*=mult;s.crew*=mult;s.maxCrew*=mult;s.damage*=mult;
  game.ships.push(battleShip(s,'enemy',809,ys[i],Math.PI));
 });
 game.phase='orders';$('harbor').hidden=true;$('command').hidden=false;$('seaTop').hidden=false;$('endPanel').hidden=true;
 $('orderArea').hidden=false;$('orderArea').style.opacity='1';$('resolveBtn').hidden=false;$('progress').hidden=true;
 $('subtitle').textContent='Боевой порядок · подготовка';$('gold').textContent='◈ '+game.gold;
 selectShip(game.ships.find(s=>s.side==='ally')?.id||null);updateBattleUI();
 notify('Выбери судно. Нарисуй путь, затем укажи вторую команду.');
}
function alive(side){return game.ships.filter(s=>s.alive&&s.side===side)}
function nearest(s){return alive(s.side==='ally'?'enemy':'ally').sort((a,b)=>distance(s,a)-distance(s,b))[0]||null}
function getTarget(s){return game.ships.find(t=>t.id===s.targetId&&t.alive&&t.side!==s.side)||nearest(s)}
function selectShip(id){
 const s=game.ships.find(x=>x.id===id&&x.side==='ally'&&x.alive);
 game.selected=s?.id||null;
 $('selectedName').textContent=s?s.name:'Выбери судно';
 $('selectedInfo').textContent=s?('Корпус '+Math.ceil(s.hp)+'/'+Math.ceil(s.maxHp)+' · Экипаж '+Math.ceil(s.crew)+'/'+Math.ceil(s.maxCrew)):'Нажми на корабль своего флота';
 const order=s?instruction(s,game.stage):null;
 $('instruction').textContent=s?(order.route.length?'Путь построен. Можно нарисовать другой.':'Нарисуй путь на воде или коснись врага.'):'Выбери судно на поле';
 $('routeCounter').textContent=order?readoutRoute(order):'НЕТ МАРШРУТА';
 $('crewReadout').textContent=s?('ЭКИПАЖ '+Math.ceil(s.crew)):'';
 $('maneuverReadout').textContent=order?({hold:'МАНЁВР',shoot:'СТРЕЛЬБА',board:'АБОРДАЖ',evade:'УКЛОНЕНИЕ'}[order.kind]||'ПРИКАЗ'):'ОЖИДАНИЕ';
 document.querySelectorAll('[data-order]').forEach(btn=>btn.classList.toggle('on',Boolean(order&&btn.dataset.order===order.kind)));
 document.querySelectorAll('[data-stage]').forEach(btn=>btn.classList.toggle('on',Number(btn.dataset.stage)===game.stage));
 $('clearRouteBtn').disabled=!order||(order.route.length===0&&!order.targetId);
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
 const stage=game.phase==='resolve'?Math.min(1,Math.floor(game.elapsed/HALF)):0;
 if(s._activeStage!==stage){s._activeStage=stage;s._cursor[stage]=0;}
 const ins=instruction(s,stage),t=game.ships.find(v=>v.id===ins.targetId&&v.alive&&v.side!==s.side)||nearest(s);
 let goal=null,stop=false;
 const points=ins.route||[];
 let index=s._cursor[stage]||0;
 while(index<points.length&&distance(s,points[index])<18)index++;
 s._cursor[stage]=index;
 if(index<points.length)goal=points[index];
 if(!goal&&ins.kind==='evade'&&t)goal={x:s.x+(s.x-t.x)*2,y:s.y+(s.y-t.y)*2};
 if(!goal&&ins.kind==='hold'){stop=true;goal={x:s.x+Math.cos(s.angle)*12,y:s.y+Math.sin(s.angle)*12};}
 if(!goal&&t){
  const d=distance(s,t);
  if(ins.kind==='shoot'){
   const preferred=s.range*.72;
   if(d>preferred+20)goal={x:t.x,y:t.y};
   else if(d<preferred-50)goal={x:s.x+(s.x-t.x)*1.1,y:s.y+(s.y-t.y)*1.1};
   else goal={x:s.x+Math.cos(s.angle)*80,y:s.y+Math.sin(s.angle)*80};
  }else goal={x:t.x,y:t.y};
 }
 if(!goal){s.velocity*=Math.max(0,1-dt*.8);return;}
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
 const desired=Math.atan2(dy,dx),turn=clamp(normalize(desired-s.angle),-s.turn*dt*1.15,s.turn*dt*1.15);
 s.angle=normalize(s.angle+turn);
 let speed=stop?9:s.speed*1.15;
 if(game.weather?.kind==='gust')speed*=1.14;
 if(ins.kind==='evade')speed*=1.2;
 if(ins.kind==='board'&&t&&distance(s,t)<50)speed=Math.min(speed,19);
 if(index<points.length&&distance(s,goal)<35)speed*=.78;
 s.velocity+=(speed-s.velocity)*Math.min(1,dt*.92);
 s.x+=Math.cos(s.angle)*s.velocity*dt;s.y+=Math.sin(s.angle)*s.velocity*dt;
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
function damage(s,hp,crew,from){
 if(!s.alive)return;
 s.hp-=hp;s.crew-=crew;
 if(from&&from.side!==s.side)from.dealt+=Math.max(0,hp)+Math.max(0,crew)*.5;
 if(s.hp<=0){s.alive=false;s.hp=0;burst(s.x,s.y,'#d5a16a',22);logEvent(s.name+' тонет!');if(from)from.kills++;}
 else if(s.crew<=0){
  s.alive=false;s.crew=0;
  if(from&&from.side==='ally'&&s.side==='enemy'){game.captured.push(s);logEvent(s.name+' захвачен!');}
  else logEvent(s.name+' захвачен противником!');
  if(from)from.kills++;burst(s.x,s.y,'#d6c99d',16);
 }
}
function logEvent(t){game.events.push(t);if(game.events.length>5)game.events.shift();notify(t);}
function burst(x,y,color,n){for(let i=0;i<n;i++){let a=rand(x+i*17+y)*TAU;let sp=20+rand(y+i*73)*72;game.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.6+rand(i+x)*.6,color});}}
function advance(dt){
 game.elapsed+=dt;
 const live=game.ships.filter(s=>s.alive);
 for(const s of live){s.fireTimer=Math.max(0,s.fireTimer-dt);s.ramTimer=Math.max(0,s.ramTimer-dt);s.landTimer=Math.max(0,s.landTimer-dt);maneuver(s,dt);}
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
  const a=live[i],b=live[j];if(!a.alive||!b.alive)continue;
  const d=distance(a,b),sep=(a.length+b.length)*.45;if(d>=sep||d<.001)continue;
  const dx=(b.x-a.x)/d,dy=(b.y-a.y)/d,penetration=sep-d;
  a.x-=dx*penetration*.36;a.y-=dy*penetration*.36;b.x+=dx*penetration*.36;b.y+=dy*penetration*.36;
  if(a.side!==b.side){
   const impact=(Math.abs(a.velocity)+Math.abs(b.velocity))*.065;
   if(a.ramTimer<=0&&b.ramTimer<=0&&impact>3){
    damage(a,impact*.6,.6,b);damage(b,impact,.8,a);
    a.ramTimer=b.ramTimer=2.5;burst((a.x+b.x)/2,(a.y+b.y)/2,'#e2c6a3',12);
   }
   a.velocity*=.76;b.velocity*=.76;
  }else{a.velocity*=.85;b.velocity*=.85;}
 }
 for(const s of live){
  if(!s.alive)continue;
  const stage=Math.min(1,Math.floor(game.elapsed/HALF)),ins=instruction(s,stage);
  const t=game.ships.find(v=>v.id===ins.targetId&&v.alive&&v.side!==s.side)||nearest(s);
  if(!t||!t.alive)continue;
  const d=distance(s,t),bearing=Math.abs(normalize(Math.atan2(t.y-s.y,t.x-s.x)-s.angle));
  const precision=game.weather?.kind==='fog'? .72:1;
  if(ins.kind!=='hold'&&ins.kind!=='evade'&&d<s.range*precision&&s.fireTimer<=0&&bearing<2.6){
   const shots=ins.kind==='shoot'?1:.43;
   damage(t,s.damage*shots,.38*shots,s);s.fireTimer=1.1+rand(game.elapsed+s.x)*.42;
   game.particles.push({x:s.x,y:s.y,vx:(t.x-s.x)/Math.max(d,1)*185,vy:(t.y-s.y)/Math.max(d,1)*185,life:Math.min(.6,d/185),color:s.side==='ally'?'#f0dab0':'#e2b1a0',arrow:true});
  }
  if(ins.kind==='board'&&d<49&&Math.abs(s.velocity-t.velocity)<37){
   damage(t,.16*dt,s.board*dt*1.8,s);
   damage(s,.1*dt,t.board*dt*.53,t);
   if(rand(Math.floor(game.elapsed*5)+s.x)<.1)burst((s.x+t.x)/2,(s.y+t.y)/2,'#e9cda2',2);
  }
 }
 for(const p of game.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
 game.particles=game.particles.filter(p=>p.life>0).slice(-160);
}
function startResolve(){
 if(game.phase!=='orders')return;
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
  if(s.side==='ally'){s.orders=[freshOrder('hold'),freshOrder(s.type==='heavy'?'board':'shoot')];}
  else{
   const foe=nearest(s);s.orders=[freshOrder(s.type==='swift'?'evade':'shoot'),freshOrder(s.type==='heavy'?'board':'shoot')];
   if(foe){s.orders[0].targetId=foe.id;s.orders[1].targetId=foe.id;}
  }
 }
$('resolveBtn').hidden=false;
 $('subtitle').textContent='Сражение · фаза приказов';
 updateBattleUI();notify('Новая фаза: скорректируй приказы');
}
function finishBattle(){
 const score=s=>alive(s).reduce((a,v)=>a+v.hp/v.maxHp+v.crew/v.maxCrew*.5,0);
 const win=score('ally')>=score('enemy');game.endVictory=win;game.phase='result';
 const survivors=alive('ally');
 const dead=game.ships.filter(s=>s.side==='ally'&&!s.alive).length;
 for(const s of game.ships.filter(s=>s.side==='ally')){
  const original=game.fleet.find(f=>f.id===s.id);
  if(!original)continue;
  if(!s.alive){game.fleet=game.fleet.filter(f=>f.id!==s.id);continue;}
  original.hp=clamp(s.hp,1,s.maxHp);original.crew=clamp(s.crew,1,s.maxCrew);
  original.xp+=(win?16:7)+Math.round(s.dealt*.3);original.kills=(original.kills||0)+s.kills;
 }
 let prizes=0;
 for(const c of game.captured){
  if(game.fleet.length>=6)break;
  const copy=makeShip('prize-'+game.battleIndex+'-'+prizes+'-'+Date.now(),c.name,c.type,{hp:Math.max(25,c.hp*.7),crew:Math.max(8,Math.round(c.maxCrew*.35)),xp:3,active:false});
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
 updateBattleUI();
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
 if(!s||withinIsland(point.x,point.y,.95))return;
 const order=instruction(s,game.stage),route=order.route;
 if(!route.length||distance(route[route.length-1],point)>13)route.push({x:point.x,y:point.y});
 if(route.length>32)route.splice(1,1);
}
function onPointerDown(e){
 if(game.phase!=='orders')return;
 const p=pointFromEvent(e);if(!p)return;
 const chosen=hitShip(p);
 if(chosen){
  if(chosen.side==='ally'){selectShip(chosen.id);return;}
  const s=game.ships.find(x=>x.id===game.selected&&x.alive);
  if(s){const order=instruction(s,game.stage);order.targetId=chosen.id;order.route=[];if(order.kind==='hold')order.kind='board';selectShip(s.id);notify('Цель назначена для выбранной половины');}return;
 }
 const s=game.ships.find(x=>x.id===game.selected&&x.alive);if(!s)return;
 const order=instruction(s,game.stage);order.targetId=null;order.route=[];
 if(withinIsland(p.x,p.y)){notify('Скалы непроходимы — проведи путь вокруг острова');return;}
 addRoutePoint(s,p);game.drag={id:s.id,pointerId:e.pointerId,start:p,length:0};
 try{canvas.setPointerCapture?.(e.pointerId);}catch{}
 selectShip(s.id);
}
function onPointerMove(e){
 if(game.phase!=='orders'||!game.drag||game.drag.pointerId!==e.pointerId)return;
 const p=pointFromEvent(e);if(!p)return;
 const s=game.ships.find(x=>x.id===game.drag.id&&x.alive);if(!s)return;
 if(distance(game.drag.start,p)>6)game.drag.length++;
 addRoutePoint(s,p);$('routeCounter').textContent=readoutRoute(instruction(s,game.stage));
}
function onPointerUp(e){
 if(!game.drag||game.drag.pointerId!==e.pointerId)return;
 const s=game.ships.find(x=>x.id===game.drag.id&&x.alive);
 game.drag=null;
 try{canvas.releasePointerCapture?.(e.pointerId);}catch{}
 if(s){selectShip(s.id);if(game.stage===0&&instruction(s,0).route.length>0)notify('Путь готов. Вторая половина может быть абордажем.');}
}
function seaBackground(now){renderSea(ctx,now,game.islands||[],game.weather,W,H);}
function drawShip(s,now,ghost=false){renderGalley(ctx,s,now,!ghost&&s.id===game.selected&&game.phase==='orders');}
function drawOrders(s){
 if(s.side!=='ally'||!s.alive)return;
 for(let stage=0;stage<2;stage++){
  const o=instruction(s,stage),route=o.route||[],t=game.ships.find(x=>x.id===o.targetId&&x.alive);
  if(!route.length&&!t)continue;
  const prev=instruction(s,0).route;
  const start=stage===0?{x:s.x,y:s.y}:(prev.length?prev[prev.length-1]:{x:s.x+Math.cos(s.angle)*s.velocity*HALF,y:s.y+Math.sin(s.angle)*s.velocity*HALF});
  ctx.save();ctx.strokeStyle=stage?'#e9a480':'#f4d6a1';ctx.fillStyle=ctx.strokeStyle;
  ctx.lineWidth=s.id===game.selected?2.7:1.5;ctx.globalAlpha=s.id===game.selected?1:.42;
  ctx.setLineDash(stage?[9,5]:[4,4]);ctx.beginPath();ctx.moveTo(start.x,start.y);
  for(const p of route)ctx.lineTo(p.x,p.y);
  if(t)ctx.lineTo(t.x,t.y);
  ctx.stroke();ctx.setLineDash([]);
  for(let i=0;i<route.length;i++){const p=route[i];ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,TAU);ctx.fill();}
  const end=t||route[route.length-1];
  if(end){ctx.beginPath();ctx.arc(end.x,end.y,8,0,TAU);ctx.stroke();
    ctx.font='700 12px system-ui';ctx.textAlign='center';ctx.fillText(String(stage+1),end.x,end.y-13);}
  ctx.restore();
 }
}
function render(now){
 const {dpr,w,h,scale,ox,oy}=view;if(!w||!h)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0f313d';ctx.fillRect(0,0,w,h);
 ctx.translate(ox,oy);ctx.scale(scale,scale);seaBackground(now);
 if(game.phase==='harbor'){
  const ghost=[{...makeShip('g1','', 'heavy'),x:320,y:285,angle:-.33,side:'ally'}, {...makeShip('g2','','bow'),x:590,y:420,angle:-.42,side:'ally'}, {...makeShip('g3','','swift'),x:710,y:180,angle:2.9,side:'enemy'}];
  for(const s of ghost)drawShip(s,now,true);
 }else{
  const ss=game.ships.filter(s=>s.alive);
  for(const s of ss){drawShip(s,now);if(game.phase==='orders')drawOrders(s);}
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
 if(s&&game.phase==='orders'){instruction(s,game.stage).kind=btn.dataset.order;selectShip(s.id);}
}));
$('sailBtn').addEventListener('click',startBattle);
$('resolveBtn').addEventListener('click',startResolve);
$('returnBtn').addEventListener('click',()=>{renderHarbor();});
$('helpBtn').addEventListener('click',()=>{$('help').hidden=false;});
$('helpClose').addEventListener('click',()=>{$('help').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('help').hidden=true;if(e.key===' '&&game.phase==='orders'&&!e.repeat){e.preventDefault();startResolve();}});
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{frameTime=0;});
load();renderHarbor();resize();requestAnimationFrame(loop);
