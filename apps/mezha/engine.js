/* МЕЖА — deterministic, serializable match simulation. No DOM or network dependencies. */
export const W=960,H=620,LIMIT=1200;
export const SITE_DEFS=[
  {id:'orchard',name:'Яблоневый хутор',type:'farm',x:236,y:146},
  {id:'westwood',name:'Западная делянка',type:'wood',x:241,y:454},
  {id:'silver',name:'Серебряная штольня',type:'mine',x:482,y:122},
  {id:'ford',name:'Каменный мост',type:'bridge',x:478,y:306},
  {id:'fen',name:'Речной хутор',type:'farm',x:485,y:516},
  {id:'eastwood',name:'Восточная делянка',type:'wood',x:720,y:164},
  {id:'wheat',name:'Пшеничный двор',type:'farm',x:729,y:444}
];
export const PALETTES=['#eacb80','#7bafbf'];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function rng(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296}
const captainNames=[['Бертран','Мартен'],['Райнер','Сиверт']];
const captainTraits=[['Лобовой штурм','Лесные манёвры'],['Лобовой штурм','Лесные манёвры']];
function makeSquad(s,side,captain,type,x,y){
 return {id:s.next++,side,captain,type,x,y,hp:type==='knight'?145:type==='bow'?82:108,maxHp:type==='knight'?145:type==='bow'?82:108,
 morale:100,attack:0,walk:rng(s)*6,hit:0,retreat:false,kills:0,targetX:x,targetY:y};
}
export function createGame(seed=Date.now(),bot=true){
 const s={version:1,seed:seed>>>0,next:1,time:0,phase:'battle',winner:null,bot,log:[],events:[],progress:[0,0],
 players:[{gold:142,wood:100,food:120,base:480,doctrine:'balanced',kills:0},{gold:142,wood:100,food:120,base:480,doctrine:'balanced',kills:0}],
 sites:SITE_DEFS.map((p,i)=>({...p,owner:i===0||i===1?0:i===5||i===6?1:-1,fort:0,capture:0,attacker:-1})),
 orders:[],squads:[],botClock:3,economyClock:0,
 selection:0};
 for(let side=0;side<2;side++){
  const x=side===0?108:852;
  for(let i=0;i<2;i++){
   s.orders.push({side,id:side*2+i,name:captainNames[side][i],trait:captainTraits[side][i],
    mode:'capture',x:side===0?(i===0?240:240):(i===0?720:720),
    y:i===0?146:454,site:i===0?(side===0?'orchard':'eastwood'):(side===0?'westwood':'wheat'),changed:0});
   makeSquad(s,side,side*2+i,i===0?'knight':'bow',x,286+i*52);
   makeSquad(s,side,side*2+i,'levy',x+(side===0?18:-18),304+i*40);
  }
 }
 s.log.push({time:0,side:0,text:'Знамёна подняты. Выбери капитана и назначь цель.'});
 return s;
}
const nearHome=(side)=>({x:side===0?118:842,y:310});
function nearbySite(s,x,y){let best=null,bd=1e9;for(const z of s.sites){let d=Math.hypot(x-z.x,y-z.y);if(d<bd){best=z;bd=d}}return bd<68?best:null}
function owned(s,side){return s.sites.filter(z=>z.owner===side).length}
export function stats(s,side){
 const p=s.players[side];return{...p,sites:owned(s,side),troops:s.squads.filter(u=>u.side===side).length,score:owned(s,side)*100+Math.round(p.base/8)+p.kills*5};
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
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<35||x>W-35||y<35||y>H-35)return{ok:false,message:'За пределами карты'};
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
   const home=nearHome(side);makeSquad(s,side,cap.id,type,home.x+(rng(s)-.5)*25,home.y+(rng(s)-.5)*40);
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
 if((u.x-480)*(target.x-480)>=0)return target;
 const near=[310,515].sort((a,b)=>(Math.abs(u.y-a)+Math.abs(target.y-a))-(Math.abs(u.y-b)+Math.abs(target.y-b)))[0];
 if(Math.abs(u.x-480)>25){
  const side=u.x<480?-1:1;
  return{x:480+side*33,y:near};
 }
 return{x:480,y:near};
}
function squadGoal(s,u){
 const order=s.orders[u.captain],side=u.side,p=s.players[side];
 const home=nearHome(side);
 if(!order)return home;
 if(u.hp/u.maxHp<(p.doctrine==='bold'?.22:p.doctrine==='cautious'?.53:.36)||u.morale<18){
  u.retreat=true;
 }
 if(u.retreat){
  if(distance(u,home)<60&&u.hp/u.maxHp>.75&&u.morale>65)u.retreat=false;
  else return home;
 }
 const count=s.squads.filter(v=>v.captain===u.captain&&v.side===side).sort((a,b)=>a.id-b.id);
 const rank=count.findIndex(v=>v.id===u.id);
 const rx=(rank%3-1)*16+(rank%2)*6,ry=Math.floor(rank/3)*18-(count.length>3?18:4);
 if(order.mode==='raid'&&u.type==='bow')return{x:order.x+rx+14,y:order.y+ry-23};
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
 to.hp=Math.max(0,to.hp-amount);to.hit=.22;to.morale=Math.max(0,to.morale-amount*.37);
 s.events.push({type:'impact',x:to.x,y:to.y,side:from.side,age:0});
 if(to.hp===0){
  from.kills++;s.players[from.side].kills++;
  s.events.push({type:'fall',x:to.x,y:to.y,side:to.side,age:0});
 }
}
function siteTick(s,z,dt){
 const sides=[0,1].map(side=>s.squads.filter(u=>u.side===side&&!u.retreat&&u.hp>0&&distance(u,z)<60)
 .reduce((n,u)=>n+(u.type==='knight'?1.4:1),0));
 const attacker=sides[0]>sides[1]?0:sides[1]>sides[0]?1:-1;
 if(attacker>=0&&attacker!==z.owner){
  if(z.attacker!==attacker){z.attacker=attacker;z.capture=Math.max(0,z.capture*.55)}
  z.capture+=dt*(4.4+Math.min(3,sides[attacker]-sides[1-attacker])*.9)/(1+z.fort*.48);
  if(z.capture>=100){z.owner=attacker;z.capture=0;z.fort=Math.max(0,z.fort-1);s.events.push({type:'capture',x:z.x,y:z.y,side:attacker,age:0});log(s,(attacker===0?'Ваши войска':'Противник')+' заняли '+z.name,attacker)}
 }else if(attacker===z.owner){z.capture=Math.max(0,z.capture-dt*5);z.attacker=-1}
 else {z.capture=Math.max(0,z.capture-dt*2)}
 if(z.fort>0&&z.owner>=0){
  z.shot=(z.shot||0)-dt;
  if(z.shot<=0){
   const enemies=s.squads.filter(u=>u.side!==z.owner&&u.hp>0&&distance(u,z)<100);
   if(enemies.length){
    const target=enemies.reduce((a,b)=>distance(a,z)<distance(b,z)?a:b);
    hit(s,{side:z.owner,kills:0},target,(8+z.fort*5));z.shot=1.75;
   }
  }
 }
}
function bot(s,dt){
 s.botClock-=dt;if(s.botClock>0)return;s.botClock=5+rng(s)*2;
 const p=s.players[1];
 for(const o of s.orders.filter(c=>c.side===1)){
  const candidates=s.sites.filter(z=>z.owner!==1);
  if(!candidates.length){o.x=110;o.y=310;o.mode='raid';continue}
  const candidatesSorted=candidates.map(z=>{const threat=s.squads.filter(u=>u.side===0&&distance(u,z)<125).length;
   const g=Math.hypot(o.x-z.x,o.y-z.y);
   return{z,score:(z.type==='mine'?22:z.type==='bridge'?27:12)+(z.owner===0?12:0)-Math.hypot(z.x-850,z.y-310)*.045-threat*10-g*.038+rng(s)*18}})
   .sort((a,b)=>b.score-a.score);
  const choose=candidatesSorted[o.id%2&&candidatesSorted[1]?1:0].z;
  o.x=choose.x;o.y=choose.y;o.site=choose.id;o.mode='capture';
 }
 if(p.gold>75&&p.food>24&&s.squads.filter(u=>u.side===1).length<10){
  const t=p.gold>155?'knight':p.wood>25?'bow':'levy';action(s,1,{kind:'recruit',type:t});
 }
 if(p.gold>120&&p.wood>90){
  const z=s.sites.filter(z=>z.owner===1&&z.fort<2).sort((a,b)=>Math.abs(a.x-470)-Math.abs(b.x-470))[0];
  if(z)action(s,1,{kind:'fort',site:z.id});
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
  const p=s.players[u.side];const enemies=s.squads.filter(e=>e.side!==u.side&&e.hp>0&&distance(u,e)<(u.type==='bow'?86:36));
  const target=enemies.sort((a,b)=>distance(u,a)-distance(u,b))[0];
  const goal=squadGoal(s,u);
  if(target&&!u.retreat){
   const range=u.type==='bow'?72:u.type==='knight'?28:24;
   if(distance(u,target)>range)advance(u,target,dt);
   if(u.attack<=0&&distance(u,target)<=range+5){
    const dmg=(u.type==='knight'?15:u.type==='bow'?9:10)*(u.hp/u.maxHp*.48+.52)*(u.morale/200+.5);
    hit(s,u,target,dmg);u.attack=u.type==='bow'?1.35:u.type==='knight'?.96:1.15;
   }
  }else{
   advance(u,goal,dt);
   if(u.retreat&&distance(u,nearHome(u.side))<66&&p.food>1){u.hp=Math.min(u.maxHp,u.hp+dt*2.8);u.morale=Math.min(100,u.morale+dt*4)}
   else u.morale=Math.min(100,u.morale+dt*.35);
  }
 }
 s.squads=s.squads.filter(u=>u.hp>0);
 for(const z of s.sites)siteTick(s,z,dt);
 for(let side=0;side<2;side++){
  const home=nearHome(side),enemy=1-side;
  const attackers=s.squads.filter(u=>u.side===enemy&&distance(u,home)<75&&u.hp>0);
  if(attackers.length){
   const pressure=attackers.reduce((n,u)=>n+(u.type==='knight'?1.5:1),0);
   s.players[side].base=Math.max(0,s.players[side].base-dt*pressure*2.4);
   if(s.players[side].base===0){s.phase='end';s.winner=enemy;log(s,enemy===0?'Вражеский замок пал':'Ваша крепость пала',enemy)}
  }
 }
 if(s.time>=LIMIT&&s.phase==='battle'){
  s.phase='end';const a=stats(s,0).score,b=stats(s,1).score;s.winner=a===b?-1:a>b?0:1;
 }
}
export function save(s){return JSON.stringify(s)}
export function load(raw){try{const s=JSON.parse(raw);if(s?.version===1&&s?.players?.length===2&&s?.sites?.length===7&&Array.isArray(s.orders)&&Array.isArray(s.squads)&&Number.isFinite(s.time)&&s.time<LIMIT+1)return s}catch{}return null}
