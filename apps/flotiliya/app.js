
const $ = (id) => document.getElementById(id);
const canvas = $('sea'), ctx = canvas.getContext('2d', {alpha:false});
const W=1000,H=620,TAU=Math.PI*2,KEY='pocket-works:flotiliya:v1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rand=(s)=>{const x=Math.sin(s*157.317+37.2)*43758.5453;return x-Math.floor(x)};
const namePool=['Свет Марии','Морской ворон','Золотой лев','Святой Георгий','Крыло чайки','Черная лилия','Меч залива','Быстрый ветер'];
const TYPE={
swift:{kind:'Лёгкая галера',maxHp:70,maxCrew:27,speed:59,turn:1.26,range:172,damage:3.1,board:2.2,length:48,beam:15},
heavy:{kind:'Тяжёлая галера',maxHp:108,maxCrew:42,speed:39,turn:.78,range:155,damage:3.8,board:4.1,length:62,beam:21},
bow:{kind:'Стрелковая галера',maxHp:78,maxCrew:29,speed:49,turn:1.04,range:218,damage:5,board:2.5,length:55,beam:17}
};
let store, game={phase:'harbor',round:0,elapsed:0,fleet:[],ships:[],captured:[],events:[],particles:[],battleIndex:1,gold:130,selected:null,endVictory:false};
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
function battleShip(s,side,x,y,angle){return {...s,side,x,y,angle,velocity:0,order:side==='ally'?'shoot':(s.type==='heavy'?'board':'shoot'),tx:null,ty:null,targetId:null,fireTimer:.3+rand(x+y)*.8,ramTimer:0,boarding:false,dealt:0,kills:0,alive:true};}
function startBattle(){
 game.ships=[];game.captured=[];game.events=[];game.particles=[];game.round=1;game.elapsed=0;game.selected=null;
 activeFleet().forEach((s,i)=>game.ships.push(battleShip(s,'ally',200,160+i*150,0)));
 const aiTypes=['swift','bow','heavy'];
 aiTypes.forEach((type,i)=>{
   const s=makeShip('enemy-'+game.battleIndex+'-'+i,namePool[(game.battleIndex+i*2)%namePool.length],type,{active:false});
   const mult=1+Math.min(.22,(game.battleIndex-1)*.025);s.hp*=mult;s.maxHp*=mult;s.crew*=mult;s.maxCrew*=mult;s.damage*=mult;
   game.ships.push(battleShip(s,'enemy',790,160+i*150,Math.PI));
 });
 game.phase='orders';$('harbor').hidden=true;$('command').hidden=false;$('seaTop').hidden=false;$('endPanel').hidden=true;$('orderArea').hidden=false;$('resolveBtn').hidden=false;$('progress').hidden=true;
 $('subtitle').textContent='Сражение · фаза приказов';$('gold').textContent='◈ '+game.gold;
 selectShip(game.ships.find(s=>s.side==='ally')?.id||null);
 updateBattleUI();notify('Выбери корабль и задай манёвр');
}
function alive(side){return game.ships.filter(s=>s.alive&&s.side===side)}
function nearest(s){return alive(s.side==='ally'?'enemy':'ally').sort((a,b)=>distance(s,a)-distance(s,b))[0]||null}
function getTarget(s){return game.ships.find(t=>t.id===s.targetId&&t.alive&&t.side!==s.side)||nearest(s)}
function selectShip(id){
 const s=game.ships.find(x=>x.id===id&&x.side==='ally'&&x.alive);
 game.selected=s?.id||null;
 $('selectedName').textContent=s?s.name:'Выбери корабль';
 $('selectedInfo').textContent=s?('Корпус '+Math.ceil(s.hp)+'/'+Math.ceil(s.maxHp)+' · Экипаж '+Math.ceil(s.crew)+'/'+Math.ceil(s.maxCrew)):'Нажми на дружественное судно';
 $('instruction').textContent=s?(s.tx!==null?'Манёвр назначен — можно изменить':'Нажми на воду для назначения манёвра'):'Выбери корабль на поле';
 document.querySelectorAll('[data-order]').forEach(btn=>btn.classList.toggle('on',Boolean(s&&btn.dataset.order===s.order)));
}
function updateBattleUI(){
 $('turnLabel').textContent='ФАЗА '+game.round+'/10';
 $('shipsLeft').textContent=alive('ally').length+' СВОИХ  ·  '+alive('enemy').length+' ПРОТИВНИКОВ';
 if(game.phase==='orders')$('commandCaption').textContent='НАЗНАЧЕНИЕ ПРИКАЗОВ';
 if(game.selected)selectShip(game.selected);
}
function normalize(a){while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a}
function maneuver(s,dt){
 const t=getTarget(s);
 let goal=null,stop=false;
 if(s.tx!==null&&s.ty!==null){
  goal={x:s.tx,y:s.ty};
  if(distance(s,goal)<26){s.tx=null;s.ty=null;goal=null;}
 }
 if(!goal&&s.order==='hold'){stop=true;goal={x:s.x+Math.cos(s.angle)*12,y:s.y+Math.sin(s.angle)*12};}
 if(!goal&&t){
  const d=distance(s,t);
  if(s.order==='shoot'){
    const preferred=s.range*.73;
    if(d>preferred+15)goal={x:t.x,y:t.y};
    else if(d<preferred-55)goal={x:s.x+(s.x-t.x),y:s.y+(s.y-t.y)};
    else {const side=s.side==='ally'?1:-1;goal={x:s.x+Math.cos(s.angle+side*.22)*120,y:s.y+Math.sin(s.angle+side*.22)*120};}
  }else goal={x:t.x,y:t.y};
 }
 if(!goal){s.velocity*=Math.max(0,1-dt*1.4);return;}
 const desired=Math.atan2(goal.y-s.y,goal.x-s.x),turn=clamp(normalize(desired-s.angle),-s.turn*dt,s.turn*dt);
 s.angle=normalize(s.angle+turn);
 let desiredSpeed=stop?0:s.speed;
 if(s.order==='board'&&t&&distance(s,t)<46)desiredSpeed=Math.min(desiredSpeed,18);
 if(s.tx!==null&&distance(s,goal)<60)desiredSpeed*=.75;
 s.velocity+=(desiredSpeed-s.velocity)*Math.min(1,dt*1.2);
 s.x+=Math.cos(s.angle)*s.velocity*dt;s.y+=Math.sin(s.angle)*s.velocity*dt;
 if(s.x<31||s.x>W-31||s.y<33||s.y>H-33){
  s.x=clamp(s.x,31,W-31);s.y=clamp(s.y,33,H-33);
  s.angle=normalize(s.angle+Math.PI*.35*dt);
  s.velocity*=.82;
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
 for(const s of live){s.fireTimer=Math.max(0,s.fireTimer-dt);s.ramTimer=Math.max(0,s.ramTimer-dt);maneuver(s,dt);}
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
  const a=live[i],b=live[j];if(!a.alive||!b.alive)continue;
  const d=distance(a,b),sep=(a.length+b.length)*.38;
  if(d>=sep||d<.001)continue;
  const dx=(b.x-a.x)/d,dy=(b.y-a.y)/d,penetration=sep-d;
  a.x-=dx*penetration*.32;a.y-=dy*penetration*.32;b.x+=dx*penetration*.32;b.y+=dy*penetration*.32;
  if(a.side!==b.side){
   const impact=(a.velocity+b.velocity)*.07;
   if(a.ramTimer<=0&&b.ramTimer<=0&&impact>3){
    damage(a,impact*.65,.4,b);damage(b,impact,.7,a);
    a.ramTimer=b.ramTimer=2.5;burst((a.x+b.x)/2,(a.y+b.y)/2,'#d5c69f',10);
   }
   a.velocity*=.8;b.velocity*=.8;
  }else{a.velocity*=.89;b.velocity*=.89;}
 }
 for(const s of live){
  if(!s.alive)continue;
  const t=getTarget(s);if(!t||!t.alive)continue;
  const d=distance(s,t),bearing=Math.abs(normalize(Math.atan2(t.y-s.y,t.x-s.x)-s.angle));
  if(s.order!=='hold'&&d<s.range&&s.fireTimer<=0&&bearing<2.6){
   const shots=s.order==='shoot'?1.0:.57;
   damage(t,s.damage*shots,.32*shots,s);s.fireTimer=1.25+rand(game.elapsed+s.x)*.55;
   game.particles.push({x:s.x,y:s.y,vx:(t.x-s.x)/Math.max(d,1)*160,vy:(t.y-s.y)/Math.max(d,1)*160,life:Math.min(.55,d/160),color:s.side==='ally'?'#e6d4ae':'#dca28c',arrow:true});
  }
  if(s.order==='board'&&d<44&&Math.abs(s.velocity-t.velocity)<31){
   damage(t,.2*dt,s.board*dt,s);
   damage(s,.12*dt,t.board*dt*.58,t);
   if(rand(Math.floor(game.elapsed*4)+s.x)<.08)burst((s.x+t.x)/2,(s.y+t.y)/2,'#e4c69b',1);
  }
 }
 for(const p of game.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}
 game.particles=game.particles.filter(p=>p.life>0).slice(-120);
}
function startResolve(){
 if(game.phase!=='orders')return;
 game.phase='resolve';game.elapsed=0;acc=0;
 $('subtitle').textContent='Сражение · исполнение';
 $('commandCaption').textContent='ПРИКАЗЫ ИСПОЛНЯЮТСЯ';
 $('resolveBtn').hidden=true;$('orderArea').style.opacity='.45';
 $('progress').hidden=false;$('progressFill').style.width='0%';
}
function finishPhase(){
 $('progress').hidden=true;$('orderArea').style.opacity='1';
 const good=alive('ally').length,bad=alive('enemy').length;
 if(!good||!bad||game.round>=10){finishBattle();return;}
 game.round++;game.phase='orders';$('resolveBtn').hidden=false;
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
function pick(event){
 if(game.phase!=='orders')return;
 const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left-view.ox)/view.scale,y=(event.clientY-r.top-view.oy)/view.scale;
 if(x<0||x>W||y<0||y>H)return;
 const candidate=game.ships.filter(s=>s.alive).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
 if(candidate&&Math.hypot(candidate.x-x,candidate.y-y)<32){
  if(candidate.side==='ally'){selectShip(candidate.id);return;}
  if(game.selected){const s=game.ships.find(v=>v.id===game.selected);s.targetId=candidate.id;s.tx=null;s.ty=null;selectShip(s.id);notify('Цель: '+candidate.name);}
  return;
 }
 const s=game.ships.find(v=>v.id===game.selected&&v.alive);
 if(s){s.tx=clamp(x,32,W-32);s.ty=clamp(y,32,H-32);s.targetId=null;selectShip(s.id);}
}
function seaBackground(now){
 const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#335e64');grad.addColorStop(.55,'#23515c');grad.addColorStop(1,'#173d48');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 const t=now*.0003;
 for(let i=0;i<210;i++){
  const x=rand(i+13)*W,y=rand(i+431)*H;
  ctx.beginPath();ctx.strokeStyle=i%4===0?'rgba(173,212,204,.15)':'rgba(13,51,66,.18)';ctx.lineWidth=1+rand(i+93)*1.4;
  const off=Math.sin(t+i*.29)*2;ctx.moveTo(x+off,y);ctx.quadraticCurveTo(x+9,y-3+off,x+20+rand(i)*24,y);
  ctx.stroke();
 }
 ctx.lineWidth=2;ctx.strokeStyle='rgba(225,220,185,.16)';
 for(let i=1;i<8;i++){const xx=i*W/8;ctx.beginPath();ctx.moveTo(xx,0);ctx.lineTo(xx,H);ctx.stroke();}
 for(let i=1;i<6;i++){const yy=i*H/6;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(W,yy);ctx.stroke();}
 for(const reef of [{x:42,y:30,r:45},{x:936,y:565,r:72},{x:955,y:51,r:36},{x:33,y:564,r:52}]){
  ctx.fillStyle='#4b7270';ctx.beginPath();ctx.ellipse(reef.x,reef.y,reef.r,reef.r*.57,.34,0,TAU);ctx.fill();
  ctx.fillStyle='#b7ad8b';ctx.beginPath();ctx.ellipse(reef.x,reef.y,reef.r*.72,reef.r*.38,.34,0,TAU);ctx.fill();
 }
 // Compass: a functional, subtle north mark.
 ctx.save();ctx.translate(915,90);ctx.strokeStyle='rgba(223,205,160,.65)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,22,0,TAU);ctx.moveTo(0,-29);ctx.lineTo(0,28);ctx.moveTo(-28,0);ctx.lineTo(28,0);ctx.stroke();
 ctx.fillStyle='#dec79e';ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(-6,5);ctx.lineTo(0,0);ctx.closePath();ctx.fill();ctx.font='14px Georgia';ctx.textAlign='center';ctx.fillText('N',0,-34);ctx.restore();
}
function drawShip(s,now,ghost=false){
 ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);
 const len=s.length,beam=s.beam,c=s.side==='enemy'?'#a85f4c':'#648b76',dark='#4c3a30';
 const bob=Math.sin(now*.0019+s.x*.03)*.6;ctx.translate(0,bob);
 ctx.fillStyle='rgba(6,31,40,.32)';ctx.beginPath();ctx.ellipse(-2,7,len*.55,beam*.95,0,0,TAU);ctx.fill();
 ctx.fillStyle='#533f32';ctx.strokeStyle='#372d27';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(len*.54,0);ctx.quadraticCurveTo(len*.36,beam*.76,-len*.34,beam*.70);ctx.quadraticCurveTo(-len*.58,0,-len*.34,-beam*.70);ctx.quadraticCurveTo(len*.36,-beam*.76,len*.54,0);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#9c7a56';ctx.beginPath();ctx.moveTo(len*.39,0);ctx.quadraticCurveTo(len*.25,beam*.52,-len*.32,beam*.52);ctx.lineTo(-len*.38,0);ctx.lineTo(-len*.32,-beam*.52);ctx.quadraticCurveTo(len*.25,-beam*.52,len*.39,0);ctx.fill();
 ctx.strokeStyle='rgba(70,52,40,.75)';ctx.lineWidth=1;for(let x=-len*.29;x<len*.26;x+=6){ctx.beginPath();ctx.moveTo(x,-beam*.45);ctx.lineTo(x,beam*.45);ctx.stroke();}
 // Visible oars; rotation is tied to the simulated phase.
 const oarMotion=Math.sin(now*.009+s.x)*2;
 ctx.strokeStyle='#bda57f';ctx.lineWidth=2;
 for(let x=-len*.23;x<len*.29;x+=10)for(const side of [-1,1]){
  ctx.beginPath();ctx.moveTo(x,side*beam*.42);ctx.lineTo(x-4+oarMotion,side*(beam*.9+7));ctx.stroke();
 }
 ctx.strokeStyle='#e6d5b0';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(-len*.12,0);ctx.lineTo(len*.30,0);ctx.stroke();
 ctx.fillStyle=s.side==='enemy'?'#c57862':'#e4d6b4';
 ctx.beginPath();ctx.moveTo(len*.18,-beam*.6);ctx.lineTo(len*.08,beam*.6);ctx.lineTo(-len*.14,beam*.42);ctx.lineTo(-len*.19,-beam*.38);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#79634a';ctx.lineWidth=1;ctx.stroke();
 ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(-len*.35,-2);ctx.lineTo(-len*.35,-beam*.38);ctx.lineTo(-len*.58,-beam*.38);ctx.lineTo(-len*.49,0);ctx.closePath();ctx.fill();
 ctx.fillStyle=dark;ctx.beginPath();ctx.arc(0,0,3.6,0,TAU);ctx.fill();
 ctx.restore();
 if(ghost)return;
 if(s.id===game.selected&&game.phase==='orders'){
  ctx.strokeStyle='#e9d5a4';ctx.lineWidth=2.3;ctx.setLineDash([5,6]);ctx.beginPath();ctx.arc(s.x,s.y,36,0,TAU);ctx.stroke();ctx.setLineDash([]);
 }
 if(s.tx!==null&&game.phase==='orders'&&s.side==='ally'){
  ctx.strokeStyle='rgba(235,218,171,.68)';ctx.lineWidth=1.8;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.tx,s.ty);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(s.tx,s.ty,6,0,TAU);ctx.stroke();
 }
 ctx.textAlign='center';ctx.font='12px Georgia';ctx.fillStyle=s.side==='enemy'?'#f0d0c1':'#e6e4d3';
 ctx.shadowColor='#061c23';ctx.shadowBlur=5;ctx.fillText(s.name,s.x,s.y-31);ctx.shadowBlur=0;
 ctx.fillStyle='#1a3438';ctx.fillRect(s.x-25,s.y+29,50,4);
 ctx.fillStyle=s.side==='enemy'?'#bc7563':'#88ba9f';ctx.fillRect(s.x-25,s.y+29,50*clamp(s.hp/s.maxHp,0,1),4);
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
  for(const s of ss)drawShip(s,now);
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
  $('progressFill').style.width=clamp(game.elapsed/9*100,0,100)+'%';
  if(!alive('ally').length||!alive('enemy').length||game.elapsed>=9)finishPhase();
 }
 render(now);requestAnimationFrame(loop);
}
canvas.addEventListener('pointerdown',pick);
document.querySelectorAll('[data-order]').forEach(btn=>btn.addEventListener('click',()=>{
 const s=game.ships.find(s=>s.id===game.selected&&s.alive);
 if(s&&game.phase==='orders'){s.order=btn.dataset.order;selectShip(s.id);}
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
