/* МЕЖА — deterministic, serializable match simulation. No DOM or network dependencies. */
export const WORLD_SCALE=1.5,W=1440,H=930,LIMIT=1200,DOMINATION_SECONDS=165,DOMINATION_SITES=6;
const sc=n=>n*WORLD_SCALE;
export const SITE_DEFS=[
  {id:'orchard',name:'Яблоневый хутор',type:'farm',x:236,y:146},
  {id:'westwood',name:'Западная делянка',type:'wood',x:241,y:454},
  {id:'silver',name:'Серебряная штольня',type:'mine',x:482,y:122},
  {id:'ford',name:'Каменный мост',type:'bridge',x:478,y:306},
  {id:'fen',name:'Речной хутор',type:'farm',x:485,y:516},
  {id:'eastwood',name:'Восточная делянка',type:'wood',x:720,y:164},
  {id:'wheat',name:'Пшеничный двор',type:'farm',x:729,y:444}
].map(z=>({...z,x:sc(z.x),y:sc(z.y)}));
export const PALETTES=['#eacb80','#7bafbf'];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function rng(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296}
const captainNames=[['Бертран','Мартен'],['Райнер','Сиверт']];
const captainTraits=[['Лобовой штурм','Лесные манёвры'],['Лобовой штурм','Лесные манёвры']];
function makeSquad(s,side,captain,type,x,y){
 const unit={id:s.next++,side,captain,type,x,y,hp:type==='knight'?145:type==='bow'?82:108,maxHp:type==='knight'?145:type==='bow'?82:108,
 morale:100,attack:0,walk:rng(s)*6,hit:0,retreat:false,kills:0,targetX:x,targetY:y};
 s.squads.push(unit);
 return unit;
}
export function createGame(seed=Date.now(),bot=true,skill='regular'){
 const s={version:1,revision:4,botSkill:['casual','regular','veteran'].includes(skill)?skill:'regular',seed:seed>>>0,next:1,time:0,phase:'battle',winner:null,bot,log:[],events:[],progress:[0,0],
 players:[{gold:142,wood:100,food:120,base:480,doctrine:'balanced',kills:0},{gold:142,wood:100,food:120,base:480,doctrine:'balanced',kills:0}],
 sites:SITE_DEFS.map((p,i)=>({...p,owner:i===0||i===1?0:i===5||i===6?1:-1,fort:0,capture:0,attacker:-1})),
 orders:[],squads:[],botClock:3,botPlans:[],economyClock:0,keepShots:[0,0],
 selection:0};
 for(let side=0;side<2;side++){
  const x=sc(side===0?108:852);
  for(let i=0;i<2;i++){
   s.orders.push({side,id:side*2+i,name:captainNames[side][i],trait:captainTraits[side][i],
    mode:'capture',x:sc(side===0?240:720),
    y:sc(i===0?146:454),site:i===0?(side===0?'orchard':'eastwood'):(side===0?'westwood':'wheat'),changed:0});
   makeSquad(s,side,side*2+i,i===0?'knight':'bow',x,sc(286+i*52));
   makeSquad(s,side,side*2+i,'levy',x+sc(side===0?18:-18),sc(304+i*40));
  }
 }
 s.log.push({time:0,side:0,text:'Знамёна подняты. Выбери капитана и назначь цель.'});
 return s;
}
export const nearHome=(side)=>({x:sc(side===0?118:842),y:sc(310)});
function nearbySite(s,x,y){let best=null,bd=1e9;for(const z of s.sites){let d=Math.hypot(x-z.x,y-z.y);if(d<bd){best=z;bd=d}}return bd<sc(68)?best:null}
function owned(s,side){return s.sites.filter(z=>z.owner===side).length}
export function stats(s,side){
 const p=s.players[side];return{...p,sites:owned(s,side),domination:Math.min(DOMINATION_SECONDS,s.progress[side]),troops:s.squads.filter(u=>u.side===side).length,score:owned(s,side)*100+Math.round(p.base/8)+p.kills*5};
}
export function log(s,text,side=0){s.log.unshift({time:Math.floor(s.time),side,text});s.log.length=Math.min(s.log.length,14)}
export function action(s,side,req){
 if(!s||s.phase!=='battle')return{ok:false,message:'Матч завершён'};
 if(![0,1].includes(side)||!req||typeof req.kind!=='string')return{ok:false,message:'Неверный приказ'};
 const p=s.players[side];
 if(req.kind==='order'){
   const c=s.orders.find(o=>o.id===req.captain&&o.side===side);
   if(!c)return{ok:false,message:'Капитан не найден'};
   if(!['capture','defend','raid'].includes(req.mode))return{ok:false,message:'Неверный тип приказа'};
   const x=Number(req.x),y=Number(req.y);
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<sc(35)||x>W-sc(35)||y<sc(35)||y>H-sc(35))return{ok:false,message:'За пределами карты'};
   const z=nearbySite(s,x,y);
   c.mode=req.mode;c.x=z?z.x:x;c.y=z?z.y:y;c.site=z?.id||null;c.changed=s.time;
   log(s,c.name+': '+({capture:'занять',defend:'защищать',raid:'совершить набег'}[req.mode])+(z?' — '+z.name:' точку на карте'),side);
   return{ok:true,message:'Приказ отдан'};
 }
 if(req.kind==='recruit'){
   const type=req.type;
   const costs={levy:[52,0,12],bow:[70,16,13],knight:[104,24,18]};
   const cost=costs[type];if(!cost)return{ok:false,message:'Неизвестный отряд'};
   if(s.squads.filter(q=>q.side===side).length>=12)return{ok:false,message:'Лимит армии: 12 отрядов'};
   if(p.gold<cost[0]||p.wood<cost[1]||p.food<cost[2])return{ok:false,message:'Не хватает припасов'};
   p.gold-=cost[0];p.wood-=cost[1];p.food-=cost[2];
   const cs=s.orders.filter(q=>q.side===side);
   const cap=cs.reduce((best,q)=>s.squads.filter(u=>u.captain===q.id).length<s.squads.filter(u=>u.captain===best.id).length?q:best,cs[0]);
   const home=nearHome(side);makeSquad(s,side,cap.id,type,home.x+(rng(s)-.5)*sc(25),home.y+(rng(s)-.5)*sc(40));
   log(s,'Набран отряд: '+({levy:'ополченцы',bow:'лучники',knight:'латники'}[type]),side);
   return{ok:true,message:'Отряд собирается у замка'};
 }
 if(req.kind==='fort'){
   const z=s.sites.find(q=>q.id===req.site);
   if(!z||z.owner!==side)return{ok:false,message:'Нужно владеть этой точкой'};
   if(z.fort>=2)return{ok:false,message:'Укрепления уже максимальны'};
   const gold=45+35*z.fort,wood=65+40*z.fort;
   if(p.gold<gold||p.wood<wood)return{ok:false,message:'Нужно '+gold+' золота и '+wood+' дерева'};
   p.gold-=gold;p.wood-=wood;z.fort++;log(s,'Укрепление: '+z.name,side);
   return{ok:true,message:'Построена сторожевая башня'};
 }
 if(req.kind==='doctrine'){
   if(!['balanced','bold','cautious'].includes(req.value))return{ok:false,message:'Неизвестная доктрина'};
   p.doctrine=req.value;log(s,'Доктрина изменена',side);return{ok:true,message:'Доктрина принята'};
 }
 return{ok:false,message:'Неизвестное действие'};
}
function pickBridge(u,target){
 // Crossing is a stateful journey. Without a locked destination squads turn
 // around after reaching the near bank and can oscillate there forever.
 if(u.crossing){
   const exit={x:u.crossing.exit,y:u.crossing.y};
   if(distance(u,exit)<sc(7)){u.crossing=null;return target}
   return exit;
 }
 if((u.x-sc(480))*(target.x-sc(480))>=0)return target;
 const near=[sc(310),sc(515)].sort((a,b)=>(Math.abs(u.y-a)+Math.abs(target.y-a))-(Math.abs(u.y-b)+Math.abs(target.y-b)))[0];
 const side=u.x<sc(480)?-1:1;
 const entry={x:sc(480)+side*sc(35),y:near};
 if(distance(u,entry)>sc(7))return entry;
 u.crossing={exit:sc(480)-side*sc(48),y:near};
 return{x:u.crossing.exit,y:near};
}
function squadGoal(s,u){
 const order=s.orders[u.captain],side=u.side,p=s.players[side];
 const home=nearHome(side);
 if(!order)return home;
 // Bertrand's vanguard presses longer; Marten protects ranged veterans.
 const captainRisk=u.captain%2===0?-.07:.05;
 if(u.hp/u.maxHp<(p.doctrine==='bold'?.22:p.doctrine==='cautious'?.53:.36)+captainRisk||u.morale<18){
  u.retreat=true;
 }
 if(u.retreat){
  if(distance(u,home)<sc(60)&&u.hp/u.maxHp>.75&&u.morale>65)u.retreat=false;
  else return home;
 }
 const count=s.squads.filter(v=>v.captain===u.captain&&v.side===side).sort((a,b)=>a.id-b.id);
 const rank=count.findIndex(v=>v.id===u.id);
 const rx=sc((rank%3-1)*16+(rank%2)*6),ry=sc(Math.floor(rank/3)*18-(count.length>3?18:4));
 if(order.mode==='raid'&&u.type==='bow')return{x:order.x+rx+sc(14),y:order.y+ry-sc(23)};
 return{x:order.x+rx,y:order.y+ry};
}
function advance(u,t,dt){
 const route=pickBridge(u,t);
 const dx=route.x-u.x,dy=route.y-u.y,d=Math.hypot(dx,dy);
 if(d<1)return;
 let speed=u.type==='knight'?31:u.type==='bow'?26:23;
 if(u.retreat)speed*=1.23;
 if(u.morale<40)speed*=.83;
 const v=Math.min(d,speed*dt);
 u.x+=dx/d*v;u.y+=dy/d*v;
 u.walk+=dt*speed/6;
}
function hit(s,from,to,amount){
 // Defenders that hold their assigned flag trade mobility and the ability to
 // capture territory for a real local defensive advantage.
 const stance=s.orders[to.captain];
 if(stance?.mode==='defend'&&distance(to,stance)<sc(58))amount*=.78;
 to.hp=Math.max(0,to.hp-amount);to.hit=.22;to.morale=Math.max(0,to.morale-amount*.37);
 s.events.push({type:'impact',x:to.x,y:to.y,side:from.side,age:0});
 if(to.hp===0){
  from.kills++;s.players[from.side].kills++;
  s.events.push({type:'fall',x:to.x,y:to.y,side:to.side,age:0});
 }
}
function siteTick(s,z,dt){
 z.raided=Math.max(0,(z.raided||0)-dt);
 // Raiding squads harass income instead of capturing ground. The effect is
 // opposed by local defenders; players can raid without winning a siege.
 if(z.owner>=0){
  const enemy=1-z.owner;
  const raiders=s.squads.filter(u=>u.side===enemy&&!u.retreat&&u.hp>0&&s.orders[u.captain]?.mode==='raid'&&distance(u,z)<sc(66));
  if(raiders.length){
   const guards=s.squads.filter(u=>u.side===z.owner&&u.hp>0&&distance(u,z)<sc(74)).length;
   const pressure=Math.max(0,raiders.length*1.1-guards*.8);
   if(pressure>0){
    const amount=dt*pressure*(z.type==='mine'?1.7:z.type==='wood'?1.2:1.0);
    const stat=z.type==='wood'?'wood':z.type==='farm'?'food':'gold';
    const taken=Math.min(s.players[z.owner][stat],amount);
    s.players[z.owner][stat]-=taken;s.players[enemy][stat]=clamp(s.players[enemy][stat]+taken*.65,0,999);
    z.raided=.45;
   }
  }
 }
 const sides=[0,1].map(side=>s.squads.filter(u=>u.side===side&&!u.retreat&&u.hp>0&&s.orders[u.captain]?.mode!=='raid'&&distance(u,z)<sc(60))
 .reduce((n,u)=>n+(u.type==='knight'?1.4:1),0));
 // Defending troops secure an area and resist attacks but cannot annex it.
 // At least one squad explicitly ordered to capture must be present to change ownership.
 const claiming=[0,1].map(side=>s.squads.some(u=>u.side===side&&!u.retreat&&u.hp>0&&s.orders[u.captain]?.mode==='capture'&&distance(u,z)<sc(60)));
 const attacker=sides[0]>sides[1]&&claiming[0]?0:sides[1]>sides[0]&&claiming[1]?1:-1;
 if(attacker>=0&&attacker!==z.owner){
  if(z.attacker!==attacker){z.attacker=attacker;z.capture=Math.max(0,z.capture*.55)}
  z.capture+=dt*(3.0+Math.min(3,sides[attacker]-sides[1-attacker])*.9)/(1+z.fort*.48);
  if(z.capture>=100){z.owner=attacker;z.capture=0;z.fort=Math.max(0,z.fort-1);s.events.push({type:'capture',x:z.x,y:z.y,side:attacker,age:0});log(s,(attacker===0?'Ваши войска':'Противник')+' заняли '+z.name,attacker)}
 }else if(z.owner>=0&&sides[z.owner]>0){
  // Friendly defenders actively restore control of an attacked position.
  z.capture=Math.max(0,z.capture-dt*5);z.attacker=-1;
 }else {
  z.capture=Math.max(0,z.capture-dt*2);
  if(z.capture===0)z.attacker=-1;
 }
 if(z.fort>0&&z.owner>=0){
  z.shot=(z.shot||0)-dt;
  if(z.shot<=0){
   const enemies=s.squads.filter(u=>u.side!==z.owner&&u.hp>0&&distance(u,z)<sc(100));
   if(enemies.length){
    const target=enemies.reduce((a,b)=>distance(a,z)<distance(b,z)?a:b);
    hit(s,{side:z.owner,kills:0},target,(8+z.fort*5));z.shot=1.75;
   }
  }
 }
}
function bot(s,dt){
 s.botClock-=dt;
 if(s.botClock>0)return;
 const skill=s.botSkill||'regular';
 const rates={casual:{interval:17,cap:6,commit:38,smart:.7},regular:{interval:15,cap:7,commit:31,smart:.9},veteran:{interval:9,cap:10,commit:22,smart:1.22}};
 const cfg=rates[skill]||rates.regular;
 s.botClock=cfg.interval+(rng(s)-.5)*3.5;
 const side=1,enemy=0,p=s.players[side],home=nearHome(side),foe=nearHome(enemy);
 const hostile=s.squads.filter(u=>u.side===enemy&&u.hp>0);
 const friendly=s.squads.filter(u=>u.side===side&&u.hp>0);
 const incoming=hostile.filter(u=>distance(u,home)<sc(155)).length;
 const ours=s.sites.filter(z=>z.owner===side);
 const theirs=s.sites.filter(z=>z.owner===enemy);
 const centerHeld=ours.some(z=>['silver','ford','fen'].includes(z.id));
 let issued=[];
 for(const o of s.orders.filter(c=>c.side===side)){
  const company=friendly.filter(u=>u.captain===o.id);
  const origin=company.length?{x:company.reduce((a,u)=>a+u.x,0)/company.length,y:company.reduce((a,u)=>a+u.y,0)/company.length}:home;
  const urgent=incoming>=2&&o.id===2;
  if(!urgent&&o.changed>0&&s.time-o.changed<cfg.commit)continue;
  const choices=[];
  if(urgent)choices.push({mode:'defend',x:home.x,y:home.y,site:null,score:450,why:'Оборона замка'});
  for(const z of ours.filter(z=>hostile.some(u=>distance(u,z)<sc(98))))
   choices.push({mode:'defend',x:z.x,y:z.y,site:z.id,score:74+z.fort*12+(z.type==='bridge'?27:0)+Math.min(47,hostile.filter(u=>distance(u,z)<sc(90)).length*12)-distance(origin,z)*.105/WORLD_SCALE,why:'Оборона '+z.name});
  for(const z of s.sites.filter(q=>q.owner!==side)){
   const enemyLocal=hostile.filter(u=>distance(u,z)<sc(100)).length;
   const ownLocal=friendly.filter(u=>distance(u,z)<sc(110)).length;
   const value=z.type==='bridge'?72:z.type==='mine'?67:z.type==='farm'?47:44;
   const near=distance(origin,z);
   const stagger=issued.some(a=>a.site===z.id)?48:0;
   const risk=Math.max(0,enemyLocal-ownLocal)*12*cfg.smart;
   const enemyOwned=z.owner===enemy?18:10;
   const centralBonus=z.x>sc(425)&&z.x<sc(535)?20:0;
   choices.push({mode:'capture',x:z.x,y:z.y,site:z.id,score:value+centralBonus+enemyOwned-near*.105/WORLD_SCALE-risk-stagger+(rng(s)-.5)*8,why:'Захват '+z.name});
  }
  if(centerHeld&&friendly.length>=6&&s.time>140){
   choices.push({mode:'raid',x:foe.x,y:foe.y,site:null,score:56+Math.min(35,ours.length*6)+Math.max(0,3-hostile.filter(u=>distance(u,foe)<sc(110)).length)*7-distance(origin,foe)*.09/WORLD_SCALE-(issued.some(a=>a.site===null)?40:0),why:'Осада замка'});
  }
  if(skill!=='casual'&&(skill==='veteran'||s.time>190)&&ours.length>=2&&p.food>60){
   const prey=theirs.filter(z=>z.type==='mine'||z.type==='wood'||z.type==='farm').sort((a,b)=>distance(origin,a)-distance(origin,b))[0];
   if(prey)choices.push({mode:'raid',x:prey.x,y:prey.y,site:prey.id,score:(o.id===3?65:45)+(p.gold<80?10:0)-distance(origin,prey)*.08/WORLD_SCALE,why:'Рейд '+prey.name});
  }
  choices.sort((a,b)=>b.score-a.score);
  const choice=choices[0];
  if(choice){
   if(choice.mode!==o.mode||choice.site!==o.site||distance(choice,o)>20){
    o.mode=choice.mode;o.x=choice.x;o.y=choice.y;o.site=choice.site;o.changed=s.time;
    s.botPlans.push({time:Math.round(s.time),captain:o.id,mode:choice.mode,site:choice.site,why:choice.why});
    if(s.botPlans.length>25)s.botPlans.shift();
   }else{o.changed=s.time-cfg.commit*.6}
   issued.push(choice);
  }
 }
 if(p.gold>=52&&p.food>=17&&friendly.length<cfg.cap){
  const bows=friendly.filter(u=>u.type==='bow').length;
  const knights=friendly.filter(u=>u.type==='knight').length;
  const type=p.gold>=104&&p.wood>=24&&knights<Math.ceil(cfg.cap*.40)?'knight':p.gold>=70&&p.wood>=16&&bows<Math.ceil(cfg.cap*.36)?'bow':'levy';
  action(s,side,{kind:'recruit',type});
 }
 if(p.gold>140&&p.wood>110&&(skill==='veteran'||s.time>220)){
  const z=ours.filter(z=>z.fort<2).sort((a,b)=>Math.abs(a.x-sc(480))-Math.abs(b.x-sc(480)))[0];
  if(z)action(s,side,{kind:'fort',site:z.id});
 }
}
export function tick(s,dt){
 if(!s||s.phase!=='battle')return;
 dt=clamp(dt,0,.20);s.time+=dt;
 s.events=s.events.filter(e=>(e.age+=dt)<.75);
 if(s.bot)bot(s,dt);
 s.economyClock+=dt;
 if(s.economyClock>=1){
  const n=Math.floor(s.economyClock);s.economyClock-=n;
  for(let side=0;side<2;side++){
   const p=s.players[side],my=s.sites.filter(z=>z.owner===side);
   p.gold=clamp(p.gold+n*(2.4+my.filter(z=>z.type==='mine').length*4+my.filter(z=>z.type==='bridge').length*1.3),0,999);
   p.wood=clamp(p.wood+n*(.5+my.filter(z=>z.type==='wood').length*2.7),0,999);
   p.food=clamp(p.food+n*(.25+my.filter(z=>z.type==='farm').length*2.35-s.squads.filter(u=>u.side===side).length*.23),0,999);
   if(p.food<1)for(const u of s.squads.filter(u=>u.side===side)){u.morale=Math.max(0,u.morale-1.8*n);u.hp=Math.max(1,u.hp-.5*n)}
  }
 }
 for(const u of s.squads){
  if(u.hp<=0)continue;
  u.attack=Math.max(0,u.attack-dt);u.hit=Math.max(0,u.hit-dt);
  const p=s.players[u.side];const order=s.orders[u.captain];
  const sight=u.type==='bow'?(u.captain%2?104:86):order?.mode==='defend'?31:40;
  const enemies=s.squads.filter(e=>e.side!==u.side&&e.hp>0&&distance(u,e)<sc(sight));
  const target=enemies.sort((a,b)=>distance(u,a)-distance(u,b))[0];
  const goal=squadGoal(s,u);
  if(target&&!u.retreat){
   const range=u.type==='bow'?(u.captain%2?90:72):u.type==='knight'?28:24;
   if(distance(u,target)>sc(range))advance(u,target,dt);
   if(u.attack<=0&&distance(u,target)<=sc(range+5)){
    const dmg=(u.type==='knight'?15:u.type==='bow'?9:10)*(u.hp/u.maxHp*.48+.52)*(u.morale/200+.5)*(u.captain%2===0&&u.type==='knight'?1.15:1);
    hit(s,u,target,dmg);u.attack=u.type==='bow'?1.35:u.type==='knight'?.96:1.15;
   }
  }else{
   advance(u,goal,dt);
   if(u.retreat&&distance(u,nearHome(u.side))<sc(66)&&p.food>1){u.hp=Math.min(u.maxHp,u.hp+dt*2.8);u.morale=Math.min(100,u.morale+dt*4)}
   else u.morale=Math.min(100,u.morale+dt*.35);
  }
 }
 s.squads=s.squads.filter(u=>u.hp>0);
 for(const z of s.sites)siteTick(s,z,dt);
 for(let side=0;side<2;side++){
  const home=nearHome(side),enemy=1-side;
  // A castle is dangerous even when its field army has left. Every exposed
  // assault is met by a defensive volley from the permanent garrison.
  s.keepShots ??= [0,0];
  s.keepShots[side]=Math.max(0,s.keepShots[side]-dt);
  const nearby=s.squads.filter(u=>u.side===enemy&&u.hp>0&&distance(u,home)<sc(110));
  if(nearby.length&&s.keepShots[side]===0){
   nearby.sort((a,b)=>distance(a,home)-distance(b,home));
   hit(s,{side,kills:0},nearby[0],14);
   s.keepShots[side]=1.1;
  }
  // Resolve defender volleys before counting living siege strength.
  const attackers=s.squads.filter(u=>u.side===enemy&&u.hp>0&&distance(u,home)<sc(75));
  if(attackers.length){
   // A bridge, mine or riverside farm held across the frontier creates a
   // viable supply line. Unsupported deep raids can chip at fortifications,
   // but cannot demolish a castle in a single fast rush.
   const supplied=s.sites.some(z=>z.owner===enemy&&['silver','ford','fen'].includes(z.id));
   const defenders=s.squads.filter(u=>u.side===side&&u.hp>0&&distance(u,home)<sc(75)).length;
   const pressure=attackers.reduce((n,u)=>n+(u.type==='knight'?1.5:1),0);
   const damage=dt*Math.max(0,pressure-defenders*.8)*1.3*(supplied?1:.14);
   s.players[side].base=Math.max(0,s.players[side].base-damage);
   if(s.players[side].base===0){s.phase='end';s.winner=enemy;log(s,enemy===0?'Вражеский замок пал':'Ваша крепость пала',enemy)}
  }
 }
 // Fort and keep volleys take place after normal combat. A unit killed in
 // those phases must not remain selectable or be saved with 0 HP.
 s.squads=s.squads.filter(u=>u.hp>0);
 for(let side=0;side<2;side++){
  if(owned(s,side)>=DOMINATION_SITES)s.progress[side]=Math.min(DOMINATION_SECONDS,s.progress[side]+dt);
  else s.progress[side]=Math.max(0,s.progress[side]-dt*1.5);
  if(s.progress[side]>=DOMINATION_SECONDS-1e-6&&s.phase==='battle'){
   s.phase='end';s.winner=side;s.victory='domination';
   log(s,side===0?'Ваше королевство объединило пограничье':'Враг овладел пограничьем',side);
  }
 }
 if(s.phase==='end'&&!s.victory)s.victory='siege';
 if(s.time>=LIMIT-1e-6&&s.phase==='battle'){s.time=LIMIT;
  s.phase='end';s.victory='score';const a=stats(s,0).score,b=stats(s,1).score;s.winner=a===b?-1:a>b?0:1;
 }
}
export function save(s){return JSON.stringify(s)}
export function load(raw){
 try{
  const s=JSON.parse(raw);
  if(s?.version!==1||![2,3,4].includes(s.revision)||s.players?.length!==2||s.sites?.length!==7||
     !Array.isArray(s.orders)||s.orders.length!==4||!Array.isArray(s.squads)||
     !Number.isFinite(s.time)||s.time<0||s.time>LIMIT||s.phase!=='battle')return null;
  // Old saves used 960×620 map positions; upgrade exactly once.
  if(s.revision<4){
   for(const o of s.orders){o.x*=WORLD_SCALE;o.y*=WORLD_SCALE}
   for(const u of s.squads){for(const key of ['x','y','targetX','targetY'])if(Number.isFinite(u[key]))u[key]*=WORLD_SCALE;
    if(u.crossing){u.crossing.exit*=WORLD_SCALE;u.crossing.y*=WORLD_SCALE}
   }
   for(const z of s.sites){z.x*=WORLD_SCALE;z.y*=WORLD_SCALE}
  }
  s.revision=4;
  s.botSkill=['casual','regular','veteran'].includes(s.botSkill)?s.botSkill:'regular';
  s.botPlans??=[];
  s.progress=Array.isArray(s.progress)&&s.progress.length===2?s.progress:[0,0];
  return s;
 }catch{return null}
}
