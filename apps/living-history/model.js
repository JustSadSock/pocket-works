// Living History: deterministic, renderer-independent regional society simulation.
export const SIZE = 160;
const T = SIZE * SIZE;
const GOODS = ['grain', 'wood'];
const DAY = 24;
const LAND_HA = 0.0625;
const MODES = ['normal','drought','isolated','uplands'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = x => Math.round(x * 100) / 100;
const roundSkill = x => Math.round(x * 10000) / 10000;
function hash(seed, x, y) { let n = (Math.imul(x + 127, 374761393) + Math.imul(y + 521, 668265263) + Math.imul(seed, 1274126177)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
export function rand(s) { s.rng = (s.rng + 0x6D2B79F5) | 0; let t = s.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const choice = (s, a) => a[Math.floor(rand(s) * a.length)];
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const idx = (x,y) => y*SIZE+x;
const G = (s, x,y) => s.terrain[idx(clamp(Math.round(x),0,SIZE-1),clamp(Math.round(y),0,SIZE-1))];
function event(s, type, message, cause, subjects=[], facts={}) { const e = {id:s.nextId++, day:s.day,type,message,cause,subjects,facts}; s.events.push(e); if(s.events.length>550) s.events.shift(); return e.id; }
function nearestFree(s,x,y,predicate=()=>true) { for(let r=0;r<22;r++) for(let k=0;k<Math.max(1,r*8);k++){const a=k/Math.max(1,r*8)*Math.PI*2;const nx=Math.round(x+Math.cos(a)*r),ny=Math.round(y+Math.sin(a)*r);if(nx<3||ny<3||nx>=SIZE-3||ny>=SIZE-3)continue;const p=idx(nx,ny);if(s.terrain[p]!==0||s.usage[p]||!predicate(nx,ny))continue;return {x:nx,y:ny};}return null; }
function createPerson(s,house,age,sex,parentIds=[]) { const names=sex==='f'?['Ада','Марта','Эльза','Грета','Ингрид','Роза','Анна','Лина','Бруна','Агнес']:['Мартин','Ханс','Оскар','Конрад','Эрик','Петер','Лукас','Генрих','Берн','Фридрих']; const p={id:s.nextId++,name:choice(s,names),sex,age,health:100,foodDebt:0,houseId:house.id,parents:parentIds,spouse:null,lastBirthDay:-999,pregnantUntil:-1,skill:{farm:round(rand(s)*.5),wood:round(rand(s)*.4),trade:round(rand(s)*.4)},alive:true,x:house.x,y:house.y,job:'home',aptitude:0.8+rand(s)*.4,workDays:{farm:0,wood:0,haul:0,build:0},lifeLog:[{day:s.day,type:'origin',text:parentIds.length?'Родился в семье':'Жил в долине с основания мира'}]};s.people.push(p);house.members.push(p.id);return p; }
function allocFields(s,h,count) { let n=0;for(let r=2;r<28&&n<count;r++)for(let j=0;j<r*9&&n<count;j++){const a=j/(r*9)*Math.PI*2, x=Math.round(h.x+Math.cos(a)*r),y=Math.round(h.y+Math.sin(a)*r);if(x<1||y<1||x>=SIZE-1||y>=SIZE-1)continue;const i=idx(x,y);if(s.terrain[i]!==0||s.usage[i]||s.soil[i]<45)continue;s.usage[i]=2;h.fields.push(i);n++;}return n; }
function newHousehold(s,c,x,y,wealth=1000,grain=470,wood=130) { const spot=nearestFree(s,x,y);if(!spot)return null;const h={id:s.nextId++,communityId:c.id,x:spot.x,y:spot.y,members:[],grain,wood,coin:wealth,fields:[],sown:0,soilRest:0,needsHouse:false,capacity:5,shortage:0,lastTrade:null,work:'farm',focus:'farm',farmYear:null,landValue:0,wealthOrigin:'initial',builtDay:s.day,courierUntil:0};s.usage[idx(h.x,h.y)]=1;s.households.push(h);allocFields(s,h,30);return h; }
function terrainAt(s) { s.terrain=new Array(T);s.soil=new Array(T);s.forest=new Array(T);s.stone=new Array(T);s.usage=new Array(T).fill(0);s.traffic=new Array(T).fill(0); for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=idx(x,y), ridge=Math.sin(x*.043+Math.cos(y*.036)*2)+Math.sin(y*.061-x*.021)*.6;const river=Math.abs(x-(SIZE*.47+Math.sin(y*.075)*11+Math.sin(y*.026)*7));const lake= Math.hypot(x-123,y-114)<8;const water=river<2.3||lake;const high=ridge+hash(s.seed,x>>3,y>>3)*.34;const rock=high>1.05; const forest=(hash(s.seed,x>>2,y>>2)*.65+hash(s.seed,x,y)*.25+Math.cos(y*.047)*.12)>.52; s.terrain[i]=water?1:rock?2:0;s.soil[i]=water?0:clamp(Math.round(73+hash(s.seed+3,x>>2,y>>2)*25-high*18),27,99);s.forest[i]=!water&&!rock&&forest?Math.round(150+hash(s.seed+9,x,y)*270):0;s.stone[i]=rock?Math.round(600+hash(s.seed+4,x,y)*550):0; } }
export function createWorld(seed=43821, options={}){const scenario=MODES.includes(options.scenario)?options.scenario:'normal';const s={version:1,scenario,seed:seed>>>0,rng:seed|0,day:0,nextId:1,terrain:[],soil:[],forest:[],stone:[],usage:[],traffic:[],communities:[],households:[],people:[],shipments:[],events:[],stats:{born:0,died:0,trades:0,built:0,delivered:0,produced:0,consumed:0,harvest:0},economy:{coinsInitial:0},weather:1}; terrainAt(s);if(s.scenario==='uplands'){for(let i=0;i<T;i++)if(s.terrain[i]===0)s.soil[i]=Math.max(29,Math.round(s.soil[i]*.7));};const settlements=[{x:37,y:43,name:'Ольховая долина'},{x:112,y:40,name:'Каменный брод'},{x:40,y:120,name:'Тихая низина'},{x:111,y:119,name:'Сосновый мыс'}];for(const pt of settlements){const c={id:s.nextId++,name:pt.name,x:pt.x,y:pt.y,prices:{grain:1.1,wood:2.8},volume:0};s.communities.push(c);for(let k=0;k<9;k++){const h=newHousehold(s,c,c.x+(rand(s)-.5)*19,c.y+(rand(s)-.5)*18,Math.round(850+rand(s)*1400),Math.round(950+rand(s)*330),Math.round(90+rand(s)*100));if(!h)continue;const father=createPerson(s,h,19+Math.floor(rand(s)*24),'m');const mother=createPerson(s,h,18+Math.floor(rand(s)*24),'f');father.spouse=mother.id;mother.spouse=father.id;for(let j=0,n=Math.floor(rand(s)*3);j<n;j++){const eldest=Math.max(0,Math.floor(Math.min(father.age,mother.age)-17));if(eldest>0)createPerson(s,h,Math.floor(rand(s)*Math.min(15,eldest+1)),rand(s)<.5?'m':'f',[father.id,mother.id]);}}}
 s.economy.coinsInitial=s.households.reduce((a,h)=>a+h.coin,0);s.economy.grainInitial=round(s.households.reduce((a,h)=>a+h.grain,0));s.economy.woodInitial=round(s.households.reduce((a,h)=>a+h.wood,0));event(s,'foundation','В долине образовались четыре независимые общины','Первоначальное расселение',s.communities.map(c=>c.id));return s; }
function personById(s,id){
 if(!s._peopleIndex){Object.defineProperty(s,'_peopleIndex',{value:new Map(),enumerable:false,writable:true,configurable:true});}
 if(s._peopleIndex.size!==s.people.length){s._peopleIndex.clear();for(const p of s.people)s._peopleIndex.set(p.id,p);}
 return s._peopleIndex.get(id);
}
const liveMembers=(s,h)=>h.members.map(id=>personById(s,id)).filter(p=>p?.alive);
const activeAdults=(s,h)=>liveMembers(s,h).filter(p=>p.age>=15&&p.health>25&&(!p.travel||p.travel.end<=s.day));
const foodNeed=(s,h)=>liveMembers(s,h).reduce((v,p)=>v+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
function localWeather(s) {
 const year=Math.floor((s.day-1)/365)+1;
 const base=1+Math.sin(s.day*.0027+Math.sin(s.seed)*3)*.13+(rand(s)-.5)*.07;
 const drought=s.scenario==='drought'&&year>=6&&year<=8;
 s.weather=clamp(base*(drought?.64:1),.25,1.3);
 if(drought&&s.day%365===1)event(s,'drought',`В долине началась засуха — ${year}-й год`,'Повторный недостаток осадков снижает реальные урожаи',[],{weather:s.weather});
}
function annualNeed(s,h){return foodNeed(s,h)*365;}
function nearbyTrees(s,h){let total=0;for(let y=Math.max(1,h.y-8);y<=Math.min(SIZE-2,h.y+8);y+=2)for(let x=Math.max(1,h.x-8);x<=Math.min(SIZE-2,h.x+8);x+=2)total+=s.forest[idx(x,y)];return total;}
function fieldSoil(s,h){return h.fields.length?h.fields.reduce((a,i)=>a+s.soil[i],0)/h.fields.length:35;}
function chooseLivelihood(s,h){
 const c=s.communities.find(c=>c.id===h.communityId);
 const area=h.fields.length*LAND_HA,food=annualNeed(s,h);
 const fertility=fieldSoil(s,h),trees=nearbyTrees(s,h);
 const farmValue=area*.68*700*fertility/82*(c?.prices.grain||1);
 const woodValue=Math.min(trees*.08,530)*(.4+c.prices.wood*.65);
 const haulers=s.households.filter(k=>k.communityId===c.id&&k.focus==='trade'&&liveMembers(s,k).length).length;
 const haulValue=(c.recentVolume||0)*Math.max(.7,c.prices.grain)*.11/(haulers+1);
 // Supply opportunities are local; a household with hungry children takes subsistence farming first.
 const reserve=h.grain/Math.max(1,food);
 const skill=liveMembers(s,h).reduce((v,p)=>v+p.skill.farm,0)/Math.max(1,liveMembers(s,h).length);
 const woodSkill=liveMembers(s,h).reduce((v,p)=>v+p.skill.wood,0)/Math.max(1,liveMembers(s,h).length);
 let focus='farm';
 if(trees>420&&woodValue*(1+woodSkill*.08)>farmValue*(1+skill*.09)*(reserve<.7?1.6:1.03))focus='wood';
 if(reserve>.95&&haulValue>farmValue*.52&&(c.recentVolume||0)>900&&haulers<Math.max(1,Math.floor(s.households.filter(k=>k.communityId===c.id).length*.18)))focus='trade';
 if(h.focus!==focus&&liveMembers(s,h).length){event(s,'occupation',`Семья ${familyName(s,h)} изменила занятие: ${focus==='farm'?'земледелие':focus==='wood'?'лесное хозяйство':'перевозки'}`,'Сравнение цен, плодородия, древесины, транспорта и семейных запасов',[h.id],{focus,soil:round(fertility),reserve:round(reserve)});}
 h.focus=focus;
}
function newFarmYear(s,h){
 if(h.farmYear?.year===Math.floor((s.day-1)/365))return h.farmYear;
 const year=Math.floor((s.day-1)/365);
 const previous=h.farmYear;
 // Households rotate parcels: each plot is cultivated in two of three years.
 const active=h.fields.filter((p,i)=>((i+year)%3!==0));
 const crop={year,active,sownArea:0,tended:0,harvestedArea:0,seedKg:0,yieldKg:0,labourSow:0,labourTend:0,labourHarvest:0};
 if(h.sown>0&&s.day%365>130&&s.day%365<296){crop.sownArea=roundSkill(Math.min(active.length*LAND_HA,h.sown/140));crop.seedKg=h.sown;h.sown=0;}
 h.farmYear=crop;
 if(previous?.sownArea>0&&previous.harvestedArea<previous.sownArea*.6)event(s,'crop-loss',`Поля семьи ${familyName(s,h)} остались неубранными`,'Не хватило рабочих дней до зимы',[h.id],{areaHa:round(previous.sownArea-previous.harvestedArea)});
 return crop;
}
function laborDay(p,kind,boost){p.job=kind==='farm'?'farm':kind;p.skill[kind]=roundSkill(p.skill[kind]+boost*p.aptitude);recordWork(p,kind);}
function cropUpdate(s,h,adults){
 const doy=s.day%365,crop=newFarmYear(s,h);
 if(!adults.length||!crop.active.length)return;
 const c=s.communities.find(c=>c.id===h.communityId);
 const vulnerable=h.grain<annualNeed(s,h)*.75;
 const share=h.focus==='farm'||vulnerable?1:h.focus==='wood'?.62:.52;
 const workers=adults.filter(p=>p.job==='home').slice(0,Math.max(1,Math.ceil(adults.length*share)));
 if(!workers.length)return;
 const availableArea=crop.active.length*LAND_HA;
 if(doy>=65&&doy<=145&&crop.sownArea<availableArea-.001){
  const step=Math.min(availableArea-crop.sownArea,workers.length*.09,h.grain/125);
  if(step>.001){const seed=round(step*125);h.grain=round(h.grain-seed);s.stats.consumed=round(s.stats.consumed+seed);
   crop.sownArea=roundSkill(crop.sownArea+step);crop.seedKg=round(crop.seedKg+seed);crop.labourSow+=workers.length;
   for(const p of workers)laborDay(p,'farm',.003);
   if(crop.sownArea>=availableArea-.001||doy===145)event(s,'sowing',`Семья ${familyName(s,h)} засеяла ${crop.sownArea.toFixed(2)} га`,'Посев потребовал семян и рабочих дней',[h.id],{seedKg:crop.seedKg,workDays:crop.labourSow});
  }
 }
 if(doy>=150&&doy<=236&&crop.sownArea>0&&doy%5===0){for(const p of workers)laborDay(p,'farm',.002);crop.tended+=workers.length;crop.labourTend+=workers.length;}
 if(doy>=238&&doy<=295&&crop.harvestedArea<crop.sownArea-.001){
  const step=Math.min(crop.sownArea-crop.harvestedArea,workers.length*.065);
  if(step>.001){
   const soil=crop.active.reduce((v,i)=>v+s.soil[i],0)/crop.active.length;
   const avgSkill=workers.reduce((v,p)=>v+p.skill.farm,0)/workers.length;
   const weather=s.weather;
   const tendingFactor=clamp(.57+crop.tended/Math.max(2,crop.sownArea*32)*.43,.57,1.04);
   const output=round(step*735*soil/82*weather*tendingFactor*(1+Math.min(.5,avgSkill*.1)));
   h.grain=round(h.grain+output);s.stats.harvest=round(s.stats.harvest+output);s.stats.produced=round(s.stats.produced+output);
   crop.harvestedArea=roundSkill(crop.harvestedArea+step);crop.yieldKg=round(crop.yieldKg+output);crop.labourHarvest+=workers.length;
   for(const p of workers)laborDay(p,'farm',.004);
   if(crop.harvestedArea>=crop.sownArea-.001||doy===295){
     const active=new Set(crop.active);for(const i of h.fields){if(active.has(i))s.soil[i]=round(Math.max(30,s.soil[i]-2.5));else s.soil[i]=round(Math.min(99,s.soil[i]+2.8));}
     h.lastHarvest={day:s.day,kg:crop.yieldKg,ha:round(crop.harvestedArea),workDays:crop.labourHarvest+crop.labourSow+crop.labourTend};
     event(s,'harvest',`Семья ${familyName(s,h)} собрала ${Math.round(crop.yieldKg)} кг зерна`,'Посев, уход, своевременная уборка, погода, почва и навыки',[h.id,...workers.map(p=>p.id)],{yieldKg:crop.yieldKg,areaHa:round(crop.harvestedArea),soil:round(soil),weather:round(weather),workDays:h.lastHarvest.workDays});
     for(const p of workers)recordLife(p,s.day,'harvest',`Работал на уборке ${crop.yieldKg} кг урожая`);
   }
  }
 }
}

function spendFood(s,h){let need=foodNeed(s,h);let eaten=Math.min(need,h.grain);h.grain=round(h.grain-eaten);if(h.grain>annualNeed(s,h)*1.4){const lost=round((h.grain-annualNeed(s,h)*1.4)*.004);h.grain=round(h.grain-lost);s.stats.spoiled=round((s.stats.spoiled||0)+lost);}s.stats.consumed=round(s.stats.consumed+eaten);const hungry=need>0?1-eaten/need:0;for(const p of liveMembers(s,h)){p.foodDebt=clamp(p.foodDebt+hungry*.9-(hungry<.01?.1:0),0,100);if(p.health>0)p.health=clamp(p.health-(hungry*.9+p.foodDebt*.009)+(!hungry?.036:0),0,100);}h.shortage=hungry>.12?h.shortage+1:Math.max(0,h.shortage-1); if(h.shortage===22)event(s,'crisis',`У семьи ${familyName(s,h)} закончились запасы`,`Ежедневное потребление превысило доходы`,[h.id],{need:round(need),grain:h.grain});}
function familyName(s,h){const p=personById(s,h.members[0]);return p?p.name:'Неизвестная';}
function recordWork(p,kind,days=1){
 p.workDays ??={farm:0,wood:0,haul:0,build:0};
 p.workDays[kind]=(p.workDays[kind]||0)+days;
}
function recordLife(p,day,type,text){p.lifeLog??=[];p.lifeLog.push({day,type,text});if(p.lifeLog.length>240)p.lifeLog.splice(1,p.lifeLog.length-240);}
// Farming is now cropUpdate: labour, seed, weather and rotation are accounted daily.
function gatherWood(s,h,adults){
 const need=h.wood<120||(h.needsHouse&&h.wood<490)||(h.focus==='wood'&&h.wood<650);if(!need||!adults.length||(h.nextWoodSearch||0)>s.day)return;
 let target=-1,best=999;for(let y=Math.max(1,h.y-11);y<Math.min(SIZE-1,h.y+12);y++)for(let x=Math.max(1,h.x-11);x<Math.min(SIZE-1,h.x+12);x++){
 const i=idx(x,y),d=Math.abs(x-h.x)+Math.abs(y-h.y);if(s.forest[i]>30&&d<best){best=d;target=i;}}
 if(target<0){h.nextWoodSearch=s.day+21;return;}h.nextWoodSearch=0;
 const proficiency=adults.reduce((v,p)=>v+p.skill.wood,0)/adults.length;
 const amount=Math.min(s.forest[target],round((adults.length*1.8+2)*(1+Math.min(.7,proficiency*.22))/(1+best*.018)));
 s.forest[target]=round(s.forest[target]-amount);h.wood=round(h.wood+amount);s.stats.produced=round(s.stats.produced+amount);
 for(const p of adults){p.skill.wood=roundSkill(p.skill.wood+.006*p.aptitude);p.job='wood';p.x=target%SIZE;p.y=Math.floor(target/SIZE);recordWork(p,'wood');}
 s.traffic[target]=Math.min(255,s.traffic[target]+3);
}
function growForest(s){for(let i=0;i<T;i++){if(s.terrain[i]!==0||s.usage[i]||s.forest[i]>410)continue;const candidate=hash(s.seed+5,i%SIZE>>2,Math.floor(i/SIZE)>>2)>.6;if(candidate)s.forest[i]=round(s.forest[i]+.18*(1-s.forest[i]/500));}}
function currentPartner(s,p){const spouse=personById(s,p.spouse);return spouse?.alive?spouse:null;}
function livingHouse(s,id){return s.households.find(h=>h.id===id);}
function findVacancy(s,c){return s.households.filter(h=>h.communityId===c.id&&!liveMembers(s,h).length).sort((a,b)=>dist(a,c)-dist(b,c))[0];}
function relocate(s,people,from,to){
 const n=people.length;if(!n||from.id===to.id)return;
 const fraction=n/Math.max(1,liveMembers(s,from).length);
 // Shares move between households without manufacturing or deleting resources.
 for(const resource of ['grain','wood','coin']){
  const transferred=resource==='coin'?Math.floor(from[resource]*fraction*.5):round(from[resource]*fraction*.5);
  from[resource]=round(from[resource]-transferred);to[resource]=round(to[resource]+transferred);
 }
 for(const p of people){from.members=from.members.filter(id=>id!==p.id);to.members.push(p.id);p.houseId=to.id;p.x=to.x;p.y=to.y;recordLife(p,s.day,'move',`Переехал в дом ${to.id}`);}
}
function availableMovers(s,h){
 const members=liveMembers(s,h),adult=members.filter(p=>p.age>=18);
 const candidates=[];
 for(const p of adult){const partner=currentPartner(s,p);if(partner&&partner.houseId===h.id){if(p.id<partner.id&&p.age<65)candidates.push([p,partner]);}
 else if(!partner&&p.age>=20&&p.age<60)candidates.push([p]);}
 candidates.sort((a,b)=>(a.some(p=>p.age>=35)?-1:0)-(b.some(p=>p.age>=35)?-1:0));
 return candidates.find(group=>group.length<members.length)||null;
}
function chooseBuildingSite(s,h,c){
 // A new household compares access to fields, existing paths and the local market.
 let best=null,score=-Infinity;
 for(let y=Math.max(3,h.y-13);y<Math.min(SIZE-3,h.y+14);y+=2)for(let x=Math.max(3,h.x-13);x<Math.min(SIZE-3,h.x+14);x+=2){
 const k=idx(x,y);if(s.terrain[k]||s.usage[k])continue;
 let field=0,road=0;
 for(let yy=Math.max(1,y-3);yy<=Math.min(SIZE-2,y+3);yy+=2)for(let xx=Math.max(1,x-3);xx<=Math.min(SIZE-2,x+3);xx+=2){const i=idx(xx,yy);if(s.terrain[i]===0&&!s.usage[i])field+=s.soil[i];road+=s.traffic[i];}
 const rating=field*.04+Math.min(70,road)*.3-dist({x,y},c)*1.2-dist({x,y},h)*.24;
 if(rating>score){score=rating;best={x,y};}
 }
 return best;
}
function planConstruction(s,h,adults){
 const members=liveMembers(s,h);h.needsHouse=members.length>=h.capacity;
 if(!h.needsHouse||!adults.length)return;
 const movers=availableMovers(s,h);if(!movers)return;
 const c=s.communities.find(c=>c.id===h.communityId);
 let newHome=findVacancy(s,c);
 if(newHome){relocate(s,movers,h,newHome);event(s,'resettlement',`${familyName(s,h)} заселила пустующий дом`,'Перенаселённость, семейные связи и доступное жильё',[h.id,newHome.id,...movers.map(p=>p.id)]);h.needsHouse=liveMembers(s,h).length>h.capacity;return;}
 if(h.wood<490||h.coin<85||(h.nextBuildAttempt||0)>s.day)return;
 const builders=adults.filter(p=>p.job==='home');if(!builders.length)return;
 const site=chooseBuildingSite(s,h,c);newHome=site?newHousehold(s,c,site.x,site.y,0,0,0):null;if(!newHome){h.nextBuildAttempt=s.day+45;return;}h.nextBuildAttempt=0;
 h.wood=round(h.wood-490);h.coin=round(h.coin-85);newHome.coin=85;
 for(const p of builders){p.job='build';recordWork(p,'build');}
 relocate(s,movers,h,newHome);h.needsHouse=liveMembers(s,h).length>h.capacity;
 s.stats.built++;event(s,'construction',`Семья ${familyName(s,h)} построила новый дом`,'Перенаселение, стройматериалы, земля и работа строителей',[h.id,newHome.id],{woodSpent:490,movers:movers.length});
}
function moveHouseResidents(s,h){
 for(const id of h.members){const p=personById(s,id);if(!p?.alive)continue;
  if(p.travel&&s.day>=p.travel.end){p.travel=null;p.job='home';}
  if(p.travel){const t=p.travel,departing=s.day<=t.arrival;
   const origin=departing?t.from:t.to,dest=departing?t.to:t.from;
   const ratio=clamp(departing?(s.day-t.start)/Math.max(1,t.arrival-t.start):(s.day-t.arrival)/Math.max(1,t.end-t.arrival),0,1);
   p.job='haul';const route=t.points&&t.points.length>1?(departing?t.points:[...t.points].reverse()):[origin,dest];const pos=moveOnRoute(route,ratio);p.x=pos.x;p.y=pos.y;
  }else if(p.job==='home'){p.x=h.x;p.y=h.y;}
  else if(p.job==='farm'&&h.fields.length){const q=h.fields[(s.day+p.id)%h.fields.length];p.x=q%SIZE;p.y=Math.floor(q/SIZE);}
  else if(p.job==='market'){const c=s.communities.find(x=>x.id===h.communityId);p.x=c.x;p.y=c.y;}
 }
}
function inheritVacant(s,h){
 if(liveMembers(s,h).length)return;
 const kin=s.people.filter(p=>h.members.includes(p.id));
 const heirs=s.people.filter(p=>p.alive&&p.houseId!==h.id&&kin.some(q=>q.parents.includes(p.id)||p.parents.includes(q.id)));
 const heir=heirs.sort((a,b)=>a.id-b.id)[0];const recipient=heir?livingHouse(s,heir.houseId):null;
 if(recipient)for(const key of ['grain','wood','coin']){recipient[key]=round(recipient[key]+h[key]);h[key]=0;}
 // Unclaimed goods remain in the vacant estate until a family reclaims the home.
 if(recipient)event(s,'inheritance',`Имущество опустевшего дома перешло наследникам`,'Смерть последнего жильца и наличие живых родственников',[h.id,recipient.id,heir.id]);
}
function areCloseKin(s,a,b){
 if(a.id===b.id||a.parents.includes(b.id)||b.parents.includes(a.id))return true;
 if(a.parents.some(id=>b.parents.includes(id)))return true;
 const ancestors=(p)=>{const ids=new Set(p.parents),pp=s.people.filter(x=>p.parents.includes(x.id));for(const q of pp)q.parents.forEach(id=>ids.add(id));return ids;};
 const aa=ancestors(a),bb=ancestors(b);return [...aa].some(id=>bb.has(id))||aa.has(b.id)||bb.has(a.id);
}
function lifeCycle(s){
 for(const p of s.people){if(!p.alive)continue;p.age+=1/365;
 const hazard=p.age<1?.15:p.age<5?.05:p.age<15?.012:p.age<40?.008:p.age<60?.018:p.age<80?.06:.2;
 const death=p.health<=0||rand(s)<hazard*(1+p.foodDebt*.065)/365;
 if(!death)continue;
 p.alive=false;p.job='dead';s.stats.died++;recordLife(p,s.day,'death',`Умер в ${Math.floor(p.age)} лет (${p.health<=0?'истощение':'возраст или болезнь'})`);
 const spouse=personById(s,p.spouse);
 if(spouse?.alive){spouse.spouse=null;recordLife(spouse,s.day,'widowed',`Потерял супруга ${p.name}`);}
 event(s,'death',`${p.name} умер в возрасте ${Math.floor(p.age)} лет`,p.health<=0?'Истощение':'Возраст, здоровье и случайный риск',[p.id,p.houseId],{age:round(p.age)});
 }
 // Estates are handled before births and marriages to avoid trapping inherited food.
 for(const h of s.households)if(!liveMembers(s,h).length&&(h.grain>0||h.wood>0||h.coin>0)){
  if(!h.lastEstateDay){inheritVacant(s,h);h.lastEstateDay=s.day;}
 }
 if(s.day%30===0){for(const mother of [...s.people]){
 if(!mother.alive||mother.sex!=='f')continue;
 const home=livingHouse(s,mother.houseId);if(!home)continue;
 if(mother.pregnantUntil>0&&s.day>=mother.pregnantUntil){const fatherId=mother.pregnantFatherId??mother.spouse;
 mother.pregnantUntil=-1;mother.pregnantFatherId=null;mother.lastBirthDay=s.day;
 const baby=createPerson(s,home,0,rand(s)<.5?'m':'f',[mother.id,fatherId].filter(Boolean));s.stats.born++;
 recordLife(mother,s.day,'birth',`Родился ребёнок ${baby.name} (#${baby.id})`);
 const father=personById(s,fatherId);if(father)recordLife(father,s.day,'birth',`Родился ребёнок ${baby.name} (#${baby.id})`);
 event(s,'birth',`У ${mother.name} родился ребёнок`,'Завершение беременности',[home.id,baby.id,mother.id,fatherId].filter(Boolean));
 continue;}
 const spouse=currentPartner(s,mother);
 if(mother.pregnantUntil<0&&spouse&&mother.age>=18&&mother.age<=40&&mother.health>45&&s.day-mother.lastBirthDay>=500&&rand(s)<.075){mother.pregnantUntil=s.day+270;mother.pregnantFatherId=spouse.id;}
 }}
 if(s.day%365===0){
 const singles=s.people.filter(p=>p.alive&&p.age>=18&&!currentPartner(s,p));
 const females=singles.filter(p=>p.sex==='f'&&p.age<=41);const males=singles.filter(p=>p.sex==='m'&&p.age<=52);
 for(const f of females){
 const matches=males.filter(m=>!currentPartner(s,m)&&m.id!==f.id&&dist(m,f)<95&&!areCloseKin(s,m,f));
 matches.sort((a,b)=>dist(a,f)-dist(b,f)||a.id-b.id);const husband=matches[0];if(!husband||rand(s)>.9)continue;
 f.spouse=husband.id;husband.spouse=f.id;
 const home=livingHouse(s,husband.houseId),source=livingHouse(s,f.houseId);
 if(home&&source&&home.id!==source.id){const dependents=liveMembers(s,source).filter(child=>child.age<15&&child.parents.includes(f.id));relocate(s,[f,...dependents],source,home);}
 recordLife(f,s.day,'marriage',`Вышла замуж за ${husband.name} (#${husband.id})`);
 recordLife(husband,s.day,'marriage',`Женился на ${f.name} (#${f.id})`);
 event(s,'marriage',`${f.name} и ${husband.name} заключили брак`,'Знакомство взрослых жителей и создание семьи',[f.id,husband.id,home?.id].filter(Boolean));
 }
 }
}
function demand(s,h,good){const living=liveMembers(s,h);if(!living.length)return 0;
 if(good==='grain'){const reserve=foodNeed(s,h)*270;return h.grain<reserve?Math.ceil(reserve-h.grain):0;}
 return h.wood<(h.needsHouse?510:150)?Math.ceil((h.needsHouse?510:150)-h.wood):0;
}
function supply(s,h,good){const living=liveMembers(s,h);if(!living.length)return 0;
 if(good==='grain')return Math.max(0,Math.floor(h.grain-foodNeed(s,h)*420));
 return Math.max(0,Math.floor(h.wood-(h.focus==='wood'?160:260)));
}
function riverX(y){return SIZE*.47+Math.sin(y*.075)*11+Math.sin(y*.026)*7;}
function routeBetween(s,a,b){
 const xa=a.x-riverX(a.y),xb=b.x-riverX(b.y);
 const points=[{x:a.x,y:a.y}];
 if(xa*xb<0){
  const fords=[40,119];let crossing=null,shortest=Infinity;
  for(const y of fords){const x=riverX(y);const p={x:round(x),y};const d=dist(a,p)+dist(p,b);if(d<shortest){shortest=d;crossing=p;}}
  points.push(crossing);
 }
 points.push({x:b.x,y:b.y});
 return {points,length:points.slice(1).reduce((v,p,i)=>v+dist(points[i],p),0)};
}
function moveOnRoute(points,ratio){
 const legs=points.slice(1).map((p,i)=>dist(points[i],p));const total=legs.reduce((v,n)=>v+n,0)||1;
 let remain=clamp(ratio,0,1)*total;
 for(let i=0;i<legs.length;i++)if(remain<=legs[i]||i===legs.length-1){const t=clamp(remain/Math.max(1e-6,legs[i]),0,1);return{x:round(points[i].x+(points[i+1].x-points[i].x)*t),y:round(points[i].y+(points[i+1].y-points[i].y)*t)};}else remain-=legs[i];
 return points.at(-1);
}
function market(s){
 for(const c of s.communities){
  const nearby=s.households.filter(h=>(s.scenario==='isolated'?h.communityId===c.id:dist(h,c)<68)&&liveMembers(s,h).length>0);
  for(const good of GOODS){
   const sellers=nearby.filter(h=>supply(s,h,good)>5).sort((a,b)=>supply(s,b,good)-supply(s,a,good));
   const buyers=nearby.filter(h=>demand(s,h,good)>5&&h.coin>2).sort((a,b)=>demand(s,b,good)-demand(s,a,good));
   const offered=sellers.reduce((n,h)=>n+supply(s,h,good),0);
   const wanted=nearby.reduce((n,h)=>n+demand(s,h,good),0);
   const pressure=(wanted-offered)/(wanted+offered+1);
   const lo=good==='grain'?.45:1.1,hi=good==='grain'?8:12;
   // Price changes because of genuine local scarcity, not an arbitrary population milestone.
   c.prices[good]=round(clamp(c.prices[good]*(1+pressure*.035),lo,hi));
   let traded=0;
   for(const buyer of buyers){
    if(traded>=9)break;
    const seller=sellers.find(a=>a.id!==buyer.id&&supply(s,a,good)>5&&
       !s.shipments.some(t=>t.seller===a.id&&t.buyer===buyer.id&&t.good===good));
    if(!seller)continue;
    const route=routeBetween(s,seller,buyer),distance=route.length,haulPrice=1+distance*.009;
    const haulers=nearby.filter(h=>h.focus==='trade'||h.id===seller.id);
    let carrier=null,carrierHome=null,bestTransport=Infinity;
    for(const home of haulers){const worker=liveMembers(s,home).find(p=>p.age>=15&&p.health>25&&p.job==='home'&&!p.travel);if(!worker)continue;const travel=dist(home,seller);const score=travel+(home.focus==='trade'?-8:0);if(score<bestTransport){carrier=worker;carrierHome=home;bestTransport=score;}}
    if(!carrier)continue;
    const price=round(c.prices[good]*haulPrice*(.97+rand(s)*.06));
    const quantity=Math.min(160,supply(s,seller,good),demand(s,buyer,good),Math.floor(buyer.coin/Math.max(.1,price)));
    if(quantity<5)continue;
    const cost=Math.ceil(quantity*price);if(cost>buyer.coin)continue;
    seller[good]=round(seller[good]-quantity);buyer.coin-=cost;
    const duration=Math.max(1,Math.ceil((distance+routeBetween(s,carrierHome,seller).length)/(s.scenario==='isolated'?5:10)));
    const shipment={id:s.nextId++,good,amount:quantity,seller:seller.id,buyer:buyer.id,cost,
       carrierId:carrier.id,route:route.points,carrierHouseId:carrierHome.id,haulFee:Math.min(cost-1,Math.floor(cost*.1+distance*.03)),departure:s.day,day:s.day+duration,origin:{x:seller.x,y:seller.y},destination:{x:buyer.x,y:buyer.y},
       reason:`У покупателя дефицит, у продавца избыток; ставка зависит от местного рынка`};
    s.shipments.push(shipment);
    carrier.travel={from:{x:seller.x,y:seller.y},to:{x:buyer.x,y:buyer.y},points:route.points,start:s.day,arrival:s.day+duration,end:s.day+duration*2};
    carrier.job='haul';recordWork(carrier,'haul',duration*2);
    recordLife(carrier,s.day,'haul',`Повёз ${quantity} кг товара из дома ${seller.id} в дом ${buyer.id}; путь ${Math.round(distance)} участков`);
    event(s,'trade',`${familyName(s,seller)} отправляет ${Math.round(quantity)} кг ${good==='grain'?'зерна':'древесины'} семье ${familyName(s,buyer)}`,
       'Спрос и предложение на локальном рынке; труд перевозчика',[seller.id,buyer.id,shipment.id,carrier.id],{quantity,price,cost,travelDays:duration});
    traded++;c.volume+=quantity;s.stats.trades++;markRoad(s,route.points);
   }
  }
 }
}
function markRoad(s,points){
 for(let leg=1;leg<points.length;leg++){
  const a=points[leg-1],b=points[leg],steps=Math.max(1,Math.ceil(dist(a,b)*2));
  for(let k=0;k<=steps;k++){const f=k/steps,nx=clamp(Math.round(a.x+(b.x-a.x)*f),0,SIZE-1),ny=clamp(Math.round(a.y+(b.y-a.y)*f),0,SIZE-1),i=idx(nx,ny);
   if(s.terrain[i]!==1)s.traffic[i]=Math.min(255,s.traffic[i]+2);
  }
 }
}
function deliver(s){for(let i=s.shipments.length-1;i>=0;i--){const t=s.shipments[i];if(t.day>s.day)continue;const a=s.households.find(h=>h.id===t.seller),b=s.households.find(h=>h.id===t.buyer);if(a&&b){b[t.good]=round(b[t.good]+t.amount);const recipient=s.households.find(h=>h.id===t.carrierHouseId);const wage=recipient&&recipient.id!==a.id?Math.min(t.haulFee||0,t.cost):0;a.coin+=t.cost-wage;if(recipient)recipient.coin+=wage;s.stats.delivered++;const carrier=personById(s,t.carrierId);if(carrier)recordLife(carrier,s.day,'delivery',`Доставил ${t.amount} кг товара в дом ${b.id}`);b.lastTrade={day:s.day,good:t.good,quantity:t.amount,from:a.id};event(s,'delivery',`${familyName(s,b)} получила ${Math.round(t.amount)} кг ${t.good==='grain'?'зерна':'древесины'}`,'Физическая доставка ранее заключённой сделки',[a.id,b.id,t.id],{quantity:t.amount,coin:t.cost});}else if(a){a[t.good]=round(a[t.good]+t.amount);a.coin+=t.cost;}s.shipments.splice(i,1);}}
function fosterOrphans(s){
 for(const home of s.households){const members=liveMembers(s,home);
 if(!members.length||members.some(p=>p.age>=15))continue;
 const adults=s.people.filter(p=>p.alive&&p.age>=18&&p.houseId!==home.id);
 const relative=adults.find(p=>members.some(child=>child.parents.includes(p.id)||p.parents.includes(child.id)));
 const foster=relative||adults.filter(p=>dist(p,home)<48).sort((a,b)=>dist(a,home)-dist(b,home))[0];
 if(!foster)continue;const destination=livingHouse(s,foster.houseId);if(!destination)continue;
 relocate(s,members,home,destination);
 event(s,'fostering',`Детей из осиротевшего дома приняли родственники или соседи`,
 'В домохозяйстве не осталось трудоспособных взрослых',[home.id,destination.id,...members.map(p=>p.id)]);
 }
}
function mutualAid(s){
 // After trading, a hungry household may ask for a small share of a neighbour's stored surplus.
 // The grain physically moves, no hidden population bonus or resource fabrication.
 const needy=s.households.filter(h=>liveMembers(s,h).length>0&&h.grain<foodNeed(s,h)*35);
 for(const target of needy){
  const donors=s.households.filter(h=>h.id!==target.id&&liveMembers(s,h).length>0&&
    h.grain>foodNeed(s,h)*510&&dist(h,target)<32);
  donors.sort((a,b)=>dist(a,target)-dist(b,target)||a.id-b.id);
  const donor=donors[0];if(!donor)continue;
  const protectedReserve=foodNeed(s,donor)*450;
  const quantity=round(Math.min(120,donor.grain-protectedReserve,foodNeed(s,target)*45-target.grain));
  if(quantity<=0)continue;
  donor.grain=round(donor.grain-quantity);target.grain=round(target.grain+quantity);
  s.stats.aid=round((s.stats.aid||0)+quantity);
  event(s,'aid',`Семья ${familyName(s,donor)} передала ${quantity} кг зерна соседям`,
    'Местная взаимопомощь: у получателя нехватка, у донора запас сверх годовой потребности',
    [donor.id,target.id],{quantity});
 }
}
function updateHouse(s,h){
 const members=liveMembers(s,h);if(!members.length)return;
 for(const p of members)if(!p.travel||p.travel.end<=s.day)p.job='home';
 spendFood(s,h);
 const adults=activeAdults(s,h);
 if(s.day%365===1)chooseLivelihood(s,h);
 if(s.day%365>=310&&s.day%365<=335&&s.day%5===0&&h.fields.length<68&&h.grain<annualNeed(s,h)*1.25&&(h.nextFieldAttempt||0)<=s.day){const n=allocFields(s,h,3);if(!n)h.nextFieldAttempt=s.day+365;}
 cropUpdate(s,h,adults);
 const available=adults.filter(p=>p.job==='home');
 if(available.length)gatherWood(s,h,available);
 planConstruction(s,h,adults);
 moveHouseResidents(s,h);
}

export function advanceDays(s,days=1){for(let d=0;d<days;d++){s.day++;localWeather(s);if(s.day%365===1)for(const c of s.communities){c.recentVolume=c.volume;c.volume=0;}deliver(s);for(const h of [...s.households])updateHouse(s,h);lifeCycle(s);if(s.day%30===0)fosterOrphans(s);if(s.day%7===0){market(s);mutualAid(s);}if(s.day%25===0)growForest(s);if(s.day%365===0){event(s,'year',`Прошёл ${Math.floor(s.day/365)}-й год`,`Календарь`,[],{population:population(s),houses:s.households.length,trades:s.stats.trades});} }return s;}
export const population=s=>s.people.reduce((n,p)=>n+(p.alive?1:0),0);
export function overview(s){const h=s.households.filter(h=>liveMembers(s,h).length),grain=round(s.households.reduce((a,h)=>a+h.grain,0)+s.shipments.filter(t=>t.good==='grain').reduce((a,t)=>a+t.amount,0)),wood=round(s.households.reduce((a,h)=>a+h.wood,0)+s.shipments.filter(t=>t.good==='wood').reduce((a,t)=>a+t.amount,0));return {population:population(s),households:h.length,grain,wood,scenario:s.scenario||'normal',coin:s.households.reduce((a,h)=>a+h.coin,0)+s.shipments.reduce((a,t)=>a+t.cost,0),trade:s.stats.trades,born:s.stats.born,died:s.stats.died,hungry:h.filter(h=>h.shortage>7).length,year:Math.floor(s.day/365)+1,day:s.day%365+1};}
export function audit(s){
 const o=overview(s),issues=[];
 if(Math.abs(o.coin-s.economy.coinsInitial)>.011)issues.push(`Монеты: ${o.coin} вместо ${s.economy.coinsInitial}`);
 if(Number.isFinite(s.economy.grainInitial)){
  const expected=round(s.economy.grainInitial+s.stats.harvest-s.stats.consumed-(s.stats.spoiled||0));
  if(Math.abs(o.grain-expected)>.051)issues.push(`Нарушено сохранение зерна: ${o.grain} вместо ${expected}`);
 }
 if(Number.isFinite(s.economy.woodInitial)){
  const expected=round(s.economy.woodInitial+s.stats.produced-s.stats.harvest-490*s.stats.built);
  if(Math.abs(o.wood-expected)>.051)issues.push(`Нарушено сохранение древесины: ${o.wood} вместо ${expected}`);
 }
 const owner=new Map(),plots=new Set(),homes=new Set();
 for(const h of s.households){
  for(const good of [...GOODS,'coin'])if(!Number.isFinite(h[good])||h[good]<-.001)issues.push(`Неверный ресурс ${good} у ${h.id}`);
  const houseCell=idx(h.x,h.y);if(homes.has(houseCell)||s.usage[houseCell]!==1)issues.push(`Неверное положение дома ${h.id}`);homes.add(houseCell);
  if(h.farmYear&&(h.farmYear.sownArea<-.001||h.farmYear.harvestedArea>h.farmYear.sownArea+.002||h.farmYear.seedKg<0))issues.push(`Неверный посев у ${h.id}`);
  for(const field of h.fields){if(plots.has(field)||s.usage[field]!==2)issues.push(`Неверные права на поле ${field}`);plots.add(field);}
  for(const id of h.members){const p=personById(s,id);if(!p||p.houseId!==h.id||owner.has(id))issues.push(`Неверное членство в семье ${id}`);owner.set(id,h.id);}
 }
 for(const t of s.shipments)if(!(t.amount>0&&t.cost>0&&t.day>s.day&&(!('carrierId' in t)||owner.has(t.carrierId))))issues.push(`Некорректный груз ${t.id}`);
 for(const p of s.people){
  if(!Number.isFinite(p.age)||p.age<0||!Number.isFinite(p.health)||p.health<0||p.health>100)issues.push(`Ошибка состояния жителя ${p.id}`);
  if(!owner.has(p.id))issues.push(`Человек без домохозяйства ${p.id}`);
  if(p.spouse){const partner=personById(s,p.spouse);if(p.alive&&partner?.alive&&(partner.spouse!==p.id||areCloseKin(s,p,partner)))issues.push(`Ошибка родства/брака ${p.id}`);}
  for(const id of p.parents){const parent=personById(s,id);if(!parent||parent.id===p.id)issues.push(`Неверное родство ${p.id}`);}
 }
 return {ok:issues.length===0,issues,...o};
}
export function serialize(s){return JSON.stringify(s);}
export function deserialize(raw){const s=typeof raw==='string'?JSON.parse(raw):raw;if(!s.scenario)s.scenario='normal';if(s.version!==1||s.terrain?.length!==T||!Array.isArray(s.people)||!Array.isArray(s.households)||!Array.isArray(s.shipments))throw Error('Сохранение несовместимо с моделью v0.1');const v=audit(s);if(!v.ok)throw Error(`Повреждённые данные: ${v.issues[0]}`);return s;}
export function getHousehold(s,id){const h=s.households.find(h=>h.id===id);if(!h)return null;return {...h,people:liveMembers(s,h),name:familyName(s,h),community:s.communities.find(c=>c.id===h.communityId)?.name,soil:round(fieldSoil(s,h)),annualFood:round(annualNeed(s,h))};}