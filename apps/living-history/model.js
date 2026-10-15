import {walkingDistances,walkingSteps,workdayFraction,walkPath} from './navigation.js';
// Living History: deterministic, renderer-independent regional society simulation.
export const SIZE = 160;
const T = SIZE * SIZE;
const GOODS = ['grain', 'wood'];
const DAY = 24;
const LAND_HA = 0.0625;
const MODES = ['normal','drought','isolated','uplands'];
// Research multipliers are state-local, default to 1, and never change historical saves.
export const EXPERIMENT_RANGES=Object.freeze({yield:[.7,1.3],storage:[.65,1.35],planting:[.7,1.3],transport:[.5,1.5],weather:[.5,1.5]});
export const BASE_TUNING=Object.freeze({yield:1,storage:1,planting:1,transport:1,weather:1});
export function normalizeTuning(value={}){
 const out={};for(const [k,[lo,hi]] of Object.entries(EXPERIMENT_RANGES)){
  const n=value&&Object.prototype.hasOwnProperty.call(value,k)?value[k]:1;
  if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw Error(`Неверный экспериментальный параметр ${k}: ${n}`);
  out[k]=n;
 }return out;
}
const tuning=(s,k)=>s.tuning?.[k]??1;
const ACCOUNT_FIELDS=['harvestKg','seedKg','foodKg','spoilKg','woodKg','salesKg','purchasesKg','revenue','spending','wagesEarned','wagesPaid','grainWagesEarnedKg','grainWagesPaidKg','haulEarned','aidReceived','aidGiven','gardenHarvestKg','gardenFoodKg','dairyFoodKg','loansIssuedKg','loansRepaidKg','travelHours','rentPaidKg','rentReceivedKg'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = x => Math.round(x * 100) / 100;
const roundSkill = x => Math.round(x * 10000) / 10000;
function hash(seed, x, y) { let n = (Math.imul(x + 127, 374761393) + Math.imul(y + 521, 668265263) + Math.imul(seed, 1274126177)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
// A legacy global stream remains for world creation and older saved worlds.
// Once the daily simulation begins, named, serialized streams prevent economy
// activity from shifting the stochastic draw sequence of unrelated systems.
const scopeSeed=(s,name)=>{let n=(s.seed^0x724beca9)|0;for(let i=0;i<name.length;i++)n=Math.imul(n^name.charCodeAt(i),16777619);return n|0;};
export function rand(s) {
 const scope=s._randomScope;
 const bank=scope?(s.randomStreams??={}):null;
 let n=scope?(bank[scope]??(bank[scope]=scopeSeed(s,scope))):s.rng;
 n=(n+0x6D2B79F5)|0;
 if(scope)bank[scope]=n;else s.rng=n;
 let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
 return ((t^(t>>>14))>>>0)/4294967296;
}
function inRandomScope(s,name,fn){
 const old=s._randomScope;
 Object.defineProperty(s,'_randomScope',{value:name,writable:true,configurable:true,enumerable:false});
 try{return fn();}finally{if(old===undefined)delete s._randomScope;else s._randomScope=old;}
}
// Fixed person/day keyed draws: no random-number consumption in death,
// pregnancy or marriage checks. A market change cannot alter life's 'dice'.
function demographicDraw(s,kind,id){
 const salt=kind==='death'?0x42893d:kind==='conception'?0x77243f:kind==='weather'?0xa13957:0x32b741;
 return hash(s.seed^salt,s.day,id);
}
const choice = (s, a) => a[Math.floor(rand(s) * a.length)];
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const idx = (x,y) => y*SIZE+x;
const G = (s, x,y) => s.terrain[idx(clamp(Math.round(x),0,SIZE-1),clamp(Math.round(y),0,SIZE-1))];
function event(s, type, message, cause, subjects=[], facts={}) { const e = {id:s.nextId++, day:s.day,type,message,cause,subjects,facts}; s.events.push(e); if(s.events.length>550) s.events.shift(); return e.id; }
function nearestFree(s,x,y,predicate=()=>true) { for(let r=0;r<22;r++) for(let k=0;k<Math.max(1,r*8);k++){const a=k/Math.max(1,r*8)*Math.PI*2;const nx=Math.round(x+Math.cos(a)*r),ny=Math.round(y+Math.sin(a)*r);if(nx<3||ny<3||nx>=SIZE-3||ny>=SIZE-3)continue;const p=idx(nx,ny);if(s.terrain[p]!==0||s.usage[p]||!predicate(nx,ny))continue;return {x:nx,y:ny};}return null; }
function createPerson(s,house,age,sex,parentIds=[]) {
 // Person IDs share the event/transport counter and can diverge across economic
 // variants. A genealogical key follows maternal births instead, preserving
 // matched mortality and conception dice for the same lineage across scenarios.
 const mother=parentIds.map(id=>s.people.find(p=>p.id===id)).find(p=>p?.sex==='f');
 const childIndex=mother?(mother.birthSerial=(mother.birthSerial||0)+1):0;
 const randomKey=mother?Math.floor(hash(s.seed^0x529cb71,mother.randomKey??mother.id,childIndex)*4294967295)>>>0:s.nextId;
 const names=sex==='f'?['Ада','Марта','Эльза','Грета','Ингрид','Роза','Анна','Лина','Бруна','Агнес']:['Мартин','Ханс','Оскар','Конрад','Эрик','Петер','Лукас','Генрих','Берн','Фридрих']; const p={id:s.nextId++,randomKey,birthSerial:0,name:choice(s,names),sex,age,health:100,foodDebt:0,houseId:house.id,parents:parentIds,spouse:null,lastBirthDay:-999,pregnantUntil:-1,skill:{farm:round(rand(s)*.5),wood:round(rand(s)*.4),trade:round(rand(s)*.4)},alive:true,x:house.x,y:house.y,job:'home',aptitude:0.8+rand(s)*.4,workDays:{farm:0,wood:0,haul:0,build:0},lifeLog:[{day:s.day,type:'origin',text:parentIds.length?'Родился в семье':'Жил в долине с основания мира'}]};s.people.push(p);house.members.push(p.id);return p; }
function allocFields(s,h,count) {
 // A planned open-field settlement has several larger furlong blocks beyond the
 // crofts. Strips belonging to different households are interleaved inside blocks.
 const village=s.communities.find(c=>c.id===h.communityId)||h;
 const distances=walkingDistances(s,h);
 const homeBlock=h.id%4,candidates=[];
 for(let y=Math.max(2,village.y-56);y<=Math.min(SIZE-3,village.y+56);y++)for(let x=Math.max(2,village.x-56);x<=Math.min(SIZE-3,village.x+56);x++){
  const i=idx(x,y),dx=x-village.x,dy=y-village.y,ax=Math.abs(dx),ay=Math.abs(dy);
  if(s.terrain[i]!==0||s.usage[i]||s.soil[i]<45||distances[i]<0||distances[i]>105)continue;
  // Two long east-west and two north-south field blocks, clear of residential plots.
  const blocks=[dx>=14&&dx<=52&&ay<=13,dx<=-14&&dx>=-52&&ay<=13,dy>=14&&dy<=52&&ax<=13,dy<=-14&&dy>=-52&&ax<=13];
  if(!blocks.some(Boolean))continue;
  const block=blocks.findIndex(Boolean),primary=(block===homeBlock)?-4:0;
  const cross=(block<2?y:x),along=(block<2?x:y);
  // Prefer alternating long strips, not a radial disk around a single roof.
  const strip= Math.abs((cross+3*h.communityId)%7-3)*.47;
  const score=distances[i]*.23+Math.abs(along-(block===0?village.x+22:block===1?village.x-22:block===2?village.y+22:village.y-22))*.17
    +strip+primary+(99-s.soil[i])*.025+hash(s.seed+h.id,x,y)*.2;
  candidates.push({i,score});
 }
 candidates.sort((a,b)=>a.score-b.score||a.i-b.i);
 let n=0;for(const {i} of candidates){if(n>=count)break;if(s.usage[i])continue;
  if(s.pasture){s.stats.forageConverted=round((s.stats.forageConverted||0)+s.pasture[i]);s.pasture[i]=0;}
  s.usage[i]=2;h.fields.push(i);n++;
 }
 return n;
}
function newHousehold(s,c,x,y,wealth=1000,grain=470,wood=130) { const reachable=walkingDistances(s,c);const spot=nearestFree(s,x,y,(nx,ny)=>reachable[idx(nx,ny)]>=0);if(!spot)return null;const h={id:s.nextId++,communityId:c.id,x:spot.x,y:spot.y,members:[],grain,wood,coin:wealth,fields:[],sown:0,soilRest:0,needsHouse:false,capacity:5,shortage:0,lastTrade:null,work:'farm',focus:'farm',farmYear:null,leaseIn:[],leaseOut:[],leaseTerms:[],landValue:0,wealthOrigin:'initial',builtDay:s.day,courierUntil:0,cattle:s.day===0?(rand(s)<.55?0:1+Math.floor(rand(s)*1.35)):0,fodder:0,livestockHealth:85,garden:0,dairy:0,gardenYear:null};h.fodder=h.cattle*(700+Math.floor(rand(s)*180));if(s.pasture){const footprint=idx(h.x,h.y);s.stats.forageConverted=round((s.stats.forageConverted||0)+s.pasture[footprint]);s.pasture[footprint]=0;}s.usage[idx(h.x,h.y)]=1;s.households.push(h);if(s.day===0)allocFields(s,h,30);h.tenure='customary';h.tenureOrigin=s.day===0?'initial-settlement':'family-division';return h; }
function terrainAt(s) { s.terrain=new Array(T);s.soil=new Array(T);s.forest=new Array(T);s.stone=new Array(T);s.usage=new Array(T).fill(0);s.traffic=new Array(T).fill(0);s.pasture=new Array(T).fill(0); for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=idx(x,y), ridge=Math.sin(x*.043+Math.cos(y*.036)*2)+Math.sin(y*.061-x*.021)*.6;const river=Math.abs(x-(SIZE*.47+Math.sin(y*.075)*11+Math.sin(y*.026)*7));const lake= Math.hypot(x-123,y-114)<8;const water=river<2.3||lake;const high=ridge+hash(s.seed,x>>3,y>>3)*.34;const rock=high>1.05; const forest=(hash(s.seed,x>>2,y>>2)*.65+hash(s.seed,x,y)*.25+Math.cos(y*.047)*.12)>.52; s.terrain[i]=water?1:rock?2:0;s.soil[i]=water?0:clamp(Math.round(73+hash(s.seed+3,x>>2,y>>2)*25-high*18),27,99);s.forest[i]=!water&&!rock&&forest?Math.round(150+hash(s.seed+9,x,y)*270):0;s.stone[i]=rock?Math.round(600+hash(s.seed+4,x,y)*550):0;s.pasture[i]=water||rock?0:Math.round(85+hash(s.seed+11,x,y)*130); } }
function viableVillage(s,pt){
 const sufficient=(p)=>{const d=walkingDistances(s,p);let cells=0;for(const v of d)if(v>=0&&v<=95)cells++;return cells>=450;};
 if(s.terrain[idx(pt.x,pt.y)]===0&&sufficient(pt))return pt;
 // A settlement cannot be founded on a tiny, inaccessible island. Reposition the
 // initial village to the closest connected fertile plain, preserving its name.
 for(let r=1;r<=35;r++)for(let k=0;k<r*8;k++){
  const x=Math.round(pt.x+r*Math.cos(k*Math.PI*2/(r*8))),y=Math.round(pt.y+r*Math.sin(k*Math.PI*2/(r*8)));
  if(x<7||y<7||x>SIZE-8||y>SIZE-8||s.terrain[idx(x,y)]!==0||s.soil[idx(x,y)]<47)continue;
  if(sufficient({x,y}))return {...pt,x,y};
 }
 return pt;
}
export function createWorld(seed=43821, options={}){const scenario=MODES.includes(options.scenario)?options.scenario:'normal';const s={version:1,scenario,tuning:normalizeTuning(options.tuning),seed:seed>>>0,rng:seed|0,randomStreams:{},day:0,nextId:1,terrain:[],soil:[],forest:[],stone:[],usage:[],traffic:[],communities:[],households:[],people:[],shipments:[],loans:[],events:[],stats:{born:0,died:0,trades:0,built:0,delivered:0,produced:0,consumed:0,harvest:0,cattleBorn:0,cattleDied:0,forageGrown:0,forageConsumed:0,forageConverted:0},economy:{coinsInitial:0,gardenInitial:0,dairyInitial:0},weather:1}; terrainAt(s);for(const fordY of [40,119]){const fordX=Math.round(riverX(fordY));for(let y=fordY-1;y<=fordY+1;y++)for(let x=fordX-3;x<=fordX+3;x++){const i=idx(x,y);if(s.terrain[i]===1){s.terrain[i]=0;s.soil[i]=45;s.forest[i]=0;}}}if(s.scenario==='uplands'){for(let i=0;i<T;i++)if(s.terrain[i]===0)s.soil[i]=Math.max(29,Math.round(s.soil[i]*.82));};const settlements=[{x:37,y:43,name:'Ольховая долина'},{x:112,y:40,name:'Каменный брод'},{x:40,y:120,name:'Тихая низина'},{x:111,y:119,name:'Сосновый мыс'}];for(const original of settlements){const pt=viableVillage(s,original);const c={id:s.nextId++,name:pt.name,x:pt.x,y:pt.y,prices:{grain:1.1,wood:2.8},volume:0};s.communities.push(c);for(let k=0;k<9;k++){const h=newHousehold(s,c,c.x+(rand(s)-.5)*19,c.y+(rand(s)-.5)*18,Math.round(850+rand(s)*1400),Math.round(950+rand(s)*330),Math.round(90+rand(s)*100));if(!h)continue;const father=createPerson(s,h,19+Math.floor(rand(s)*24),'m');const mother=createPerson(s,h,18+Math.floor(rand(s)*24),'f');father.spouse=mother.id;mother.spouse=father.id;for(let j=0,n=Math.floor(rand(s)*3);j<n;j++){const eldest=Math.max(0,Math.floor(Math.min(father.age,mother.age)-17));if(eldest>0)createPerson(s,h,Math.floor(rand(s)*Math.min(15,eldest+1)),rand(s)<.5?'m':'f',[father.id,mother.id]);}}}
 ensureCommons(s);s.economy.cattleInitial=s.households.reduce((n,h)=>n+h.cattle,0);s.economy.forageInitial=round(s.pasture.reduce((n,v)=>n+v,0)+s.households.reduce((n,h)=>n+h.fodder,0)+s.stats.forageConverted);s.economy.coinsInitial=s.households.reduce((a,h)=>a+h.coin,0);s.economy.grainInitial=round(s.households.reduce((a,h)=>a+h.grain,0));s.economy.woodInitial=round(s.households.reduce((a,h)=>a+h.wood,0));event(s,'foundation','В долине образовались четыре независимые общины','Первоначальное расселение',s.communities.map(c=>c.id));return s; }
function personById(s,id){
 if(!s._peopleIndex){Object.defineProperty(s,'_peopleIndex',{value:new Map(),enumerable:false,writable:true,configurable:true});}
 if(s._peopleIndex.size!==s.people.length){s._peopleIndex.clear();for(const p of s.people)s._peopleIndex.set(p.id,p);}
 return s._peopleIndex.get(id);
}
function nearbyHomes(s,x,y,r){
 if(!s._homeGrid||s._homeGrid.count!==s.households.length){
  const cells=new Map();for(const h of s.households){const key=`${h.x>>4}:${h.y>>4}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(h);}
  Object.defineProperty(s,'_homeGrid',{value:{count:s.households.length,cells},enumerable:false,configurable:true,writable:true});
 }
 const result=[],g=s._homeGrid.cells;
 for(let cy=(Math.max(0,y-r)>>4);cy<=(Math.min(SIZE-1,y+r)>>4);cy++)
 for(let cx=(Math.max(0,x-r)>>4);cx<=(Math.min(SIZE-1,x+r)>>4);cx++){
   const group=g.get(`${cx}:${cy}`);
   if(group)for(const h of group)if(Math.hypot(h.x-x,h.y-y)<=r)result.push(h);
 }
 return result;
}
const liveMembers=(s,h)=>h.members.map(id=>personById(s,id)).filter(p=>p?.alive);
const activeAdults=(s,h)=>liveMembers(s,h).filter(p=>p.age>=15&&p.health>25&&(!p.travel||p.travel.end<=s.day));
const foodNeed=(s,h)=>liveMembers(s,h).reduce((v,p)=>v+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
// Calibrated biological parameters are explicitly inspectable; this is a grain-only
// subsistence proxy, not a reconstruction of the medieval diet or its institutions.
export const CALIBRATION = Object.freeze({
  adultGrainKgPerDay:.68,
  seedKgPerHa:125,
  baseGrainYieldKgPerHa:680,
  cropSoilLoss:2.15,
  fallowSoilRecovery:4.5,
  famineHealthLoss:.72,
  famineDebtStress:.006,
  healthyRecovery:.12,
  deficitRecovery:.45,
  foodReserveYears:1.12,
  droughtHarvestMultiplier:.72,
  coveredGrainDecayDaily:.00010,
  overcapacitySpoilDaily:.016,
  baseStorageKg:1050,
  storageExpansionKg:280,
  storageExpansionWoodKg:165,
  seasonalWageCoin:3,
  gardenEquivalentKgPerYear:82,
  gardenDecayDaily:.0016,
  dairyEquivalentPerCowWeek:1.1,
  dairyDecayDaily:.11,
  grainDailyWageKg:1.5
});
// Monetary quantities are conserved as transfers. Household accounts are explanatory,
// and deliberately not a second authoritative inventory.
function account(s,h){
 const year=Math.floor(Math.max(0,s.day-1)/365);
 if(!h.accounting||h.accounting.year!==year){
  if(h.accounting)h.lastAccounting=h.accounting;
  h.accounting={year, ...Object.fromEntries(ACCOUNT_FIELDS.map(k=>[k,0]))};
 }
 return h.accounting;
}
function earn(s,h,field,quantity){const a=account(s,h);a[field]=round((a[field]||0)+quantity);}
export function storageCapacity(h,s){return (CALIBRATION.baseStorageKg+(h.storeLevel||0)*CALIBRATION.storageExpansionKg)*(s?tuning(s,'storage'):1);}
function maintainStorage(s,h){
 if(!liveMembers(s,h).length)return;
 const capacity=storageCapacity(h,s);
 const excess=Math.max(0,h.grain-capacity);
 const loss=Math.min(h.grain,round(h.grain*CALIBRATION.coveredGrainDecayDaily+excess*CALIBRATION.overcapacitySpoilDaily));
 if(loss>0){h.grain=round(h.grain-loss);s.stats.spoiled=round((s.stats.spoiled||0)+loss);earn(s,h,'spoilKg',loss);}
 const builders=activeAdults(s,h).filter(p=>p.job==='home');
 if(h.storeProject){
  if(builders.length){const worker=builders[0];worker.job='build';recordWork(worker,'build');h.storeProject.workDays++;
   if(h.storeProject.workDays>=16){h.storeLevel=(h.storeLevel||0)+1;h.storeProject=null;
    event(s,'storage',`Семья ${familyName(s,h)} завершила зернохранилище`,'Ранее оплаченная древесина и шестнадцать рабочих дней',[h.id,worker.id],{capacityKg:storageCapacity(h,s)});
   }
  }
  return;
 }
 if(h.grain>capacity*.84&&(h.storeLevel||0)<2&&h.wood>=CALIBRATION.storageExpansionWoodKg+110&&builders.length){
  h.wood=round(h.wood-CALIBRATION.storageExpansionWoodKg);
  s.stats.storageWood=round((s.stats.storageWood||0)+CALIBRATION.storageExpansionWoodKg);
  h.storeProject={workDays:0,startedDay:s.day};
  event(s,'storage-start',`Семья ${familyName(s,h)} начала строить зернохранилище`,'Переполненные запасы, наличие древесины и рабочих рук',[h.id],{woodUsed:CALIBRATION.storageExpansionWoodKg,workDays:16});
 }
}

function localWeather(s) {
 const year=Math.floor((s.day-1)/365)+1;
 // A stable annual component makes consecutive good/bad years observable, with
 // smaller daily variation. Rare poor harvests can occur in any normal world.
 const seasonal=1+Math.sin(s.day*.0027+Math.sin(s.seed)*3)*.065+(demographicDraw(s,'weather',0)-.5)*.035;
 const annualRaw=0.84+hash(s.seed+1907,year,73)*.34;
 const annual=1+(annualRaw-1)*tuning(s,'weather');
 const cropShock=hash(s.seed+9821,year,131)<.045?1-(1-.77)*tuning(s,'weather'):1;
 const drought=s.scenario==='drought'&&year>=6&&year<=8;
 s.weather=clamp(seasonal*annual*cropShock*(drought?CALIBRATION.droughtHarvestMultiplier:1),.35,1.3);
 if(drought&&s.day%365===1)event(s,'drought',`В долине началась засуха — ${year}-й год`,'Повторный недостаток осадков снижает реальные урожаи',[],{weather:s.weather});
}
function annualNeed(s,h){return foodNeed(s,h)*365;}
function nearbyTrees(s,h){let total=0;for(let y=Math.max(1,h.y-8);y<=Math.min(SIZE-2,h.y+8);y+=2)for(let x=Math.max(1,h.x-8);x<=Math.min(SIZE-2,h.x+8);x+=2)total+=s.forest[idx(x,y)];return total;}
function fieldSoil(s,h){return h.fields.length?h.fields.reduce((a,i)=>a+s.soil[i],0)/h.fields.length:35;}
function chooseLivelihood(s,h){
 const c=s.communities.find(c=>c.id===h.communityId);
 const area=(h.fields.length+(h.leaseIn?.length||0)-(h.leaseOut?.length||0))*LAND_HA,food=annualNeed(s,h);
 const fertility=fieldSoil(s,h),trees=nearbyTrees(s,h);
  const farmValue=area*.68*CALIBRATION.baseGrainYieldKgPerHa*fertility/82*(c?.prices.grain||1);
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
 h.decision={day:s.day,focus,farmValue:round(farmValue),woodValue:round(woodValue),haulValue:round(haulValue),reserveYears:round(reserve),reason:reserve<.7?'Недостаток пищи для семьи':focus==='wood'?'Лес и цена древесины':focus==='trade'?'Спрос на перевозку':'Плодородие и доступная земля'};
}
// Annual customary sharecropping: owners retain title while another household
// cultivates a defined set of underused strips in return for an actual crop share.
// Neither access nor rent creates grain or new parcels.
function seasonalLeases(s){
 const households=s.households.filter(h=>liveMembers(s,h).some(p=>p.age>=15&&p.health>25));
 for(const h of s.households){h.leaseIn=[];h.leaseOut=[];h.leaseTerms=[];}
 const expectedPerStrip=CALIBRATION.baseGrainYieldKgPerHa*LAND_HA*.67;
 const tenants=households.map(h=>({h,need:Math.max(0,Math.ceil((annualNeed(s,h)*1.48-h.grain*.42-h.fields.length*expectedPerStrip)/expectedPerStrip))}))
  .filter(x=>x.need>=2).sort((a,b)=>b.need-a.need||a.h.id-b.h.id);
 const landlords=households.map(h=>({h,available:Math.min(14,Math.max(0,Math.floor((h.fields.length*expectedPerStrip+h.grain*.34-annualNeed(s,h)*1.45)/expectedPerStrip)),Math.max(0,h.fields.length-17))}))
  .filter(x=>x.available>=2);
 let transferred=0;
 for(const {h:tenant,need} of tenants){
  let remaining=Math.min(14,need);const reach=walkingDistances(s,tenant);
  for(const holding of landlords){if(!remaining||!holding.available)break;
   const owner=holding.h;if(owner.id===tenant.id||owner.communityId!==tenant.communityId)continue;
   const plots=owner.fields.filter(i=>!owner.leaseOut.includes(i)&&reach[i]>=0&&reach[i]<=100)
     .sort((a,b)=>reach[a]-reach[b]);
   const amount=Math.min(remaining,holding.available,plots.length);
   if(amount<1)continue;
   for(const cell of plots.slice(0,amount)){
    owner.leaseOut.push(cell);tenant.leaseIn.push(cell);tenant.leaseTerms.push({cell,ownerId:owner.id,share:.18});
   }
   remaining-=amount;holding.available-=amount;transferred+=amount;
  }
 }
 if(transferred){s.stats.leasePlots=(s.stats.leasePlots||0)+transferred;
  event(s,'sharecropping',`Семьи заключили договоры на ${transferred} пахотных полос`,
   'Семьи с избыточной землёй предоставили её соседям за часть реального урожая',[],{plots:transferred});}
}
function newFarmYear(s,h){
 if(h.farmYear?.year===Math.floor((s.day-1)/365))return h.farmYear;
 const year=Math.floor((s.day-1)/365);
 const previous=h.farmYear;
 // Households rotate parcels: each plot is cultivated in two of three years.
 const leasedOut=new Set(h.leaseOut||[]);
 const own=h.fields.filter(i=>!leasedOut.has(i));
 const usable=[...own,...(h.leaseIn||[])];
 const active=usable.filter((p,i)=>((i+year)%3!==0));
 const ownedActive=active.filter(i=>!h.leaseIn?.includes(i)).length*LAND_HA;
 // Growing more than the family can eat or store is costly. Idle fields remain
 // available for future cultivation, but current planting follows expected needs.
 const availableArea=active.length*LAND_HA;
 const needed=annualNeed(s,h)*2.68*tuning(s,'planting')-h.grain;
 const expectedKgHa=CALIBRATION.baseGrainYieldKgPerHa*tuning(s,'yield')*fieldSoil(s,h)/90*.8;
 const plannedArea=roundSkill(clamp(needed/Math.max(240,expectedKgHa),Math.min(.12,availableArea),availableArea));
 const crop={year,active,ownedActive,plannedArea,sownArea:0,tended:0,harvestedArea:0,seedKg:0,yieldKg:0,labourSow:0,labourTend:0,labourHarvest:0};
 if(h.sown>0&&s.day%365>130&&s.day%365<296){crop.sownArea=roundSkill(Math.min(active.length*LAND_HA,h.sown/140));crop.seedKg=h.sown;h.sown=0;}
 h.farmYear=crop;
 if(previous?.sownArea>0&&previous.harvestedArea<previous.sownArea*.6)event(s,'crop-loss',`Поля семьи ${familyName(s,h)} остались неубранными`,'Не хватило рабочих дней до зимы',[h.id],{areaHa:round(previous.sownArea-previous.harvestedArea)});
 return crop;
}
function laborDay(p,kind,boost){p.job=kind==='farm'?'farm':kind;p.skill[kind]=roundSkill(p.skill[kind]+boost*p.aptitude);recordWork(p,kind);}
function cropUpdate(s,h,adults,guests=[]){
 const doy=s.day%365,crop=newFarmYear(s,h);
 if(doy===0)finishAgriculturalYear(s,h,crop);
 if(!(adults.length||guests.length)||!crop.active.length)return;
 const c=s.communities.find(c=>c.id===h.communityId);
 const vulnerable=h.grain<annualNeed(s,h)*.75;
 const share=h.focus==='farm'||vulnerable?1:h.focus==='wood'?.62:.52;
 const workers=[...adults.filter(p=>p.job==='home').slice(0,Math.max(1,Math.ceil(adults.length*share))),...guests];
 if(!workers.length)return;
 const availableArea=Math.min(crop.active.length*LAND_HA,crop.plannedArea??crop.active.length*LAND_HA);
 // The active strip is the actual worksite; travel consumes the same daily work budget.
 const spotIndex=Math.min(crop.active.length-1,Math.floor((doy>=238?crop.harvestedArea:crop.sownArea)/LAND_HA));
 const workCell=crop.active[spotIndex];
 const workPos={x:workCell%SIZE,y:Math.floor(workCell/SIZE)};
 const walking=walkingSteps(s,h,workPos),workFraction=workdayFraction(walking);
 if(!workFraction)return;
 const arriving=workers.filter(p=>p.job==='home'||p.job==='hired');
 const productiveWorkers=arriving.length*workFraction;
 const markWork=()=>{for(const p of arriving){p.x=workPos.x;p.y=workPos.y;}
  earn(s,h,'travelHours',round(arriving.length*(1-workFraction)*8.5));};
 if(doy>=65&&doy<=145&&crop.sownArea<availableArea-.001){
  const draftTeams=Math.floor((h.cattle||0)/2);const traction=draftTeams>0&&h.livestockHealth>35?1+Math.min(.36,draftTeams*.18):1;const step=Math.min(availableArea-crop.sownArea,productiveWorkers*.09*traction,h.grain/CALIBRATION.seedKgPerHa);
  if(step>.001){const seed=round(step*CALIBRATION.seedKgPerHa);h.grain=round(h.grain-seed);s.stats.consumed=round(s.stats.consumed+seed);
   crop.sownArea=roundSkill(crop.sownArea+step);crop.seedKg=round(crop.seedKg+seed);crop.labourSow+=workers.length;earn(s,h,'seedKg',seed);
   for(const p of arriving)laborDay(p,'farm',.003);markWork();
   if(crop.sownArea>=availableArea-.001||doy===145)event(s,'sowing',`Семья ${familyName(s,h)} засеяла ${crop.sownArea.toFixed(2)} га`,'Посев потребовал семян и рабочих дней',[h.id],{seedKg:crop.seedKg,workDays:crop.labourSow});
  }
 }
 if(doy>=150&&doy<=236&&crop.sownArea>0&&doy%5===0){for(const p of arriving)laborDay(p,'farm',.002);markWork();crop.tended+=productiveWorkers;crop.labourTend+=arriving.length;}
 if(doy>=238&&doy<=295&&crop.harvestedArea<crop.sownArea-.001){
  const step=Math.min(crop.sownArea-crop.harvestedArea,productiveWorkers*.065);
  if(step>.001){
   const soil=crop.active.reduce((v,i)=>v+s.soil[i],0)/crop.active.length;
   const avgSkill=workers.reduce((v,p)=>v+p.skill.farm,0)/workers.length;
   const weather=s.weather;
   const tendingFactor=clamp(.57+crop.tended/Math.max(2,crop.sownArea*32)*.43,.57,1.04);
   const output=round(step*CALIBRATION.baseGrainYieldKgPerHa*tuning(s,'yield')*soil/82*weather*tendingFactor*(1+Math.min(.25,avgSkill*.07)));
   h.grain=round(h.grain+output);s.stats.harvest=round(s.stats.harvest+output);s.stats.produced=round(s.stats.produced+output);
   // Only the part actually harvested from a leased strip owes a rent share.
   const ownedArea=crop.ownedActive??crop.active.length*LAND_HA;
   const harvestStart=crop.harvestedArea,harvestEnd=harvestStart+step;
   const activeRented=crop.active.filter(i=>h.leaseIn?.includes(i));
   for(let j=0;j<activeRented.length;j++){
    const a=ownedArea+j*LAND_HA,b=a+LAND_HA;
    const overlap=Math.max(0,Math.min(harvestEnd,b)-Math.max(harvestStart,a));
    if(overlap<=0)continue;
    const term=h.leaseTerms?.find(t=>t.cell===activeRented[j]);
    const landlord=term&&livingHouse(s,term.ownerId);
    const rent=round(output*(overlap/step)*(term?.share||0));
    if(landlord&&landlord.id!==h.id&&rent>0&&h.grain>=rent){
     h.grain=round(h.grain-rent);landlord.grain=round(landlord.grain+rent);
     s.stats.rentGrain=round((s.stats.rentGrain||0)+rent);
     earn(s,h,'rentPaidKg',rent);earn(s,landlord,'rentReceivedKg',rent);
    }
   }
   crop.harvestedArea=roundSkill(crop.harvestedArea+step);crop.yieldKg=round(crop.yieldKg+output);earn(s,h,'harvestKg',output);crop.labourHarvest+=workers.length;
   for(const p of arriving)laborDay(p,'farm',.004);markWork();
   if(crop.harvestedArea>=crop.sownArea-.001||doy===295){
     h.lastHarvest={day:s.day,kg:crop.yieldKg,ha:round(crop.harvestedArea),workDays:crop.labourHarvest+crop.labourSow+crop.labourTend};
     event(s,'harvest',`Семья ${familyName(s,h)} собрала ${Math.round(crop.yieldKg)} кг зерна`,'Посев, уход, своевременная уборка, погода, почва и навыки',[h.id,...workers.map(p=>p.id)],{yieldKg:crop.yieldKg,areaHa:round(crop.harvestedArea),soil:round(soil),weather:round(weather),workDays:h.lastHarvest.workDays});
     for(const p of workers)recordLife(p,s.day,'harvest',`Работал на уборке ${crop.yieldKg} кг урожая`);
   }
  }
 }
}


function finishAgriculturalYear(s,h,crop){
 if(crop.soilFinalized)return;
 crop.soilFinalized=true;
 const parcels=Math.min(crop.active.length,Math.ceil((crop.sownArea||0)/LAND_HA));
 const cultivated=new Set(crop.active.slice(0,parcels));
 // Fallow soil recovers even when a family never harvested. Cultivated depletion
 // depends on land actually harvested; abandoned fields have no phantom harvest.
 const worked=clamp(crop.harvestedArea/Math.max(.01,parcels*LAND_HA),0,1);
 for(const i of [...h.fields.filter(i=>!(h.leaseOut||[]).includes(i)),...(h.leaseIn||[])]){
   if(cultivated.has(i))s.soil[i]=round(clamp(s.soil[i]-CALIBRATION.cropSoilLoss*worked+(1-worked)*.8+Math.min(.48,(h.cattle||0)*.13),29,99));
   else s.soil[i]=round(clamp(s.soil[i]+CALIBRATION.fallowSoilRecovery+Math.min(.8,(h.cattle||0)*.25),29,99));
 }
}

function spendFood(s,h){
 const need=foodNeed(s,h);
 const gardenEaten=round(Math.min(h.garden||0,need*.22));
 const dairyEaten=round(Math.min(h.dairy||0,need*.16));
 h.garden=round((h.garden||0)-gardenEaten);h.dairy=round((h.dairy||0)-dairyEaten);
 s.stats.gardenConsumed=round((s.stats.gardenConsumed||0)+gardenEaten);
 s.stats.dairyConsumed=round((s.stats.dairyConsumed||0)+dairyEaten);
 earn(s,h,'gardenFoodKg',gardenEaten);earn(s,h,'dairyFoodKg',dairyEaten);
 const eaten=round(Math.min(Math.max(0,need-gardenEaten-dairyEaten),h.grain));
 h.grain=round(h.grain-eaten);earn(s,h,'foodKg',eaten);
 s.stats.consumed=round(s.stats.consumed+eaten);
 const hungry=need>0?clamp(1-(eaten+gardenEaten+dairyEaten)/need,0,1):0;
 for(const p of liveMembers(s,h)){
  if(hungry>.01){
   p.foodDebt=clamp(p.foodDebt+hungry*.75,0,100);
   p.health=clamp(p.health-hungry*(CALIBRATION.famineHealthLoss+p.foodDebt*CALIBRATION.famineDebtStress),0,100);
  }else{
   // CRITICAL: former code damaged health each day from historical foodDebt, even
   // after full feeding had resumed. Hunger debt must not be a death sentence.
   p.foodDebt=clamp(p.foodDebt-CALIBRATION.deficitRecovery,0,100);
   if(p.health>0)p.health=clamp(p.health+CALIBRATION.healthyRecovery,0,100);
  }
 }
 h.shortage=hungry>.12?h.shortage+1:Math.max(0,h.shortage-1);
 if(h.shortage===22)event(s,'crisis',`У семьи ${familyName(s,h)} закончились запасы`,'Ежедневное потребление превысило доходы',[h.id],{need:round(need),grain:h.grain});
}
// Kitchen gardens require real household labour, season and soil.
function tendGarden(s,h,adults){
 const day=s.day%365,year=Math.floor((s.day-1)/365);
 if(!h.gardenYear||h.gardenYear.year!==year)h.gardenYear={year,prepared:0,tended:0,harvested:false};
 const g=h.gardenYear,worker=adults.find(p=>p.job==='home'&&p.health>30);
 if(!worker)return;
 if(day>=67&&day<=155&&g.prepared<6&&h.grain>foodNeed(s,h)*12){
  g.prepared++;worker.job='garden';recordWork(worker,'garden');return;
 }
 if(day>=155&&day<=245&&g.prepared>=6&&g.tended<9){
  g.tended++;worker.job='garden';recordWork(worker,'garden');return;
 }
 if(day>=245&&day<=295&&g.prepared>=6&&!g.harvested){
  worker.job='garden';recordWork(worker,'garden');g.harvested=true;
  const qty=round(CALIBRATION.gardenEquivalentKgPerYear*((s.soil[idx(h.x,h.y)]||60)/78)*Math.min(1,g.tended/9)*s.weather*tuning(s,'yield'));
  h.garden=round((h.garden||0)+qty);s.stats.gardenProduced=round((s.stats.gardenProduced||0)+qty);
  earn(s,h,'gardenHarvestKg',qty);
  if(qty>0)event(s,'garden-harvest',`Семья ${familyName(s,h)} собрала урожай огорода`,
   'Посадка, уход, погода; урожай в калорийном зерновом эквиваленте',[h.id],{rationEquivalentKg:qty,days:g.prepared+g.tended+1});
 }
}
function spoilFreshFood(s,h){
 for(const [good,rate,stat] of [['garden',CALIBRATION.gardenDecayDaily,'gardenSpoiled'],['dairy',CALIBRATION.dairyDecayDaily,'dairySpoiled']]){
  const stock=h[good]||0;if(stock<=0)continue;
  const loss=round(Math.min(stock,stock*rate));
  if(loss>0){h[good]=round(stock-loss);s.stats[stat]=round((s.stats[stat]||0)+loss);}
 }
}
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
 s.forest[target]=round(s.forest[target]-amount);h.wood=round(h.wood+amount);s.stats.produced=round(s.stats.produced+amount);earn(s,h,'woodKg',amount);
 for(const p of adults){p.skill.wood=roundSkill(p.skill.wood+.006*p.aptitude);p.job='wood';p.x=target%SIZE;p.y=Math.floor(target/SIZE);recordWork(p,'wood');}
 s.traffic[target]=Math.min(255,s.traffic[target]+3);
}
function growForest(s){
 if(!s._forestAllowed){
  const mask=new Uint8Array(T);
  for(let i=0;i<T;i++)mask[i]=hash(s.seed+5,i%SIZE>>2,Math.floor(i/SIZE)>>2)>.6?1:0;
  Object.defineProperty(s,'_forestAllowed',{value:mask,enumerable:false,configurable:true});
 }
 for(let i=0;i<T;i++)if(s._forestAllowed[i]&&s.terrain[i]===0&&!s.usage[i]&&s.forest[i]<=410){
   s.forest[i]=round(s.forest[i]+.18*(1-s.forest[i]/500));
 }
}
// Periodic commons grazing: the biomass is spatial, finite and shared by all herds.
function grazingSpots(s,h){
 if(!h._grazingSpots){ensureCommons(s);const cells=[],reachable=walkingDistances(s,h);for(let y=Math.max(2,h.y-20);y<=Math.min(SIZE-3,h.y+20);y++)for(let x=Math.max(2,h.x-20);x<=Math.min(SIZE-3,h.x+20);x++){
   const i=idx(x,y);if(s.terrain[i]!==0||s.commons[i]!==h.communityId||reachable[i]<0||reachable[i]>90)continue;const d=reachable[i];cells.push({i,d});
  }cells.sort((a,b)=>a.d-b.d||a.i-b.i);
  Object.defineProperty(h,'_grazingSpots',{value:cells.slice(0,240).map(x=>x.i),enumerable:false,configurable:true});
 }
 return h._grazingSpots;
}
function takeForage(s,h,kg){
 let remaining=kg,lastSpot=-1;
 const spots=grazingSpots(s,h);
 for(const i of spots){if(remaining<.01)break;if(s.usage[i]||s.terrain[i]!==0)continue;
  const taken=Math.min(s.pasture[i],remaining);
  if(taken<=0)continue;s.pasture[i]=round(s.pasture[i]-taken);remaining=round(remaining-taken);lastSpot=i;
 }
 return {taken:round(kg-remaining),spot:lastSpot};
}
function tendCattle(s,h,adults){
 h.cattle??=0;h.fodder??=0;h.livestockHealth??=85;
 if(!h.cattle)return;
 const day=s.day%365,summer=day>=80&&day<=300;
 if(day>=115&&day<=280&&day%4===0&&h.fodder<h.cattle*1100){
  const worker=adults.find(p=>p.job==='home');
  if(worker){const hay=takeForage(s,h,145);
   if(hay.taken){h.fodder=round(h.fodder+hay.taken);worker.job='herd';recordWork(worker,'herd');
    if(hay.spot>=0){worker.x=hay.spot%SIZE;worker.y=Math.floor(hay.spot/SIZE);}
   }
  }
 }
 if(s.day%7===0){
  const needed=h.cattle*5*7;
  let grazed=0,site=-1;
  if(summer){const source=takeForage(s,h,needed);grazed=source.taken;site=source.spot;}
  const fromBarn=Math.min(h.fodder,round(needed-grazed));h.fodder=round(h.fodder-fromBarn);
  const eaten=round(grazed+fromBarn),fraction=eaten/Math.max(1,needed);
  s.stats.forageConsumed=round((s.stats.forageConsumed||0)+eaten);
  // Approximate lactating portion of herd: no well-fed animals, no milk.
  if(h.livestockHealth>=60&&fraction>=.75){
   const milker=adults.find(p=>p.job==='home'&&p.health>25);
   if(milker){
    milker.job='herd';recordWork(milker,'herd');
    const dairy=round(h.cattle*CALIBRATION.dairyEquivalentPerCowWeek*Math.min(1,fraction));
    h.dairy=round((h.dairy||0)+dairy);s.stats.dairyProduced=round((s.stats.dairyProduced||0)+dairy);
   }
  }
  h.livestockHealth=round(clamp(h.livestockHealth+(fraction>=.99?.45:-(1-fraction)*11),0,100));
  if(fraction<.65&&h.livestockHealth<9){h.cattle--;s.stats.cattleDied++;h.livestockHealth=45;
   event(s,'cattle-death',`Хозяйство ${familyName(s,h)} потеряло скот`,`Недостаток пастбищ и зимнего корма`,[h.id],{remaining:h.cattle});}
  // Actual livestock work is only shown when an available adult accompanies the herd.
  if(site>=0){if(site!==h.lastPastureCell){h.prevPastureCell=h.lastPastureCell??site;h.lastPastureCell=site;h.pastureMovedDay=s.day;}const shepherd=adults.find(p=>p.job==='home');if(shepherd){shepherd.job='herd';shepherd.x=site%SIZE;shepherd.y=Math.floor(site/SIZE);recordWork(shepherd,'herd');}}
 }
 if(day===340&&h.cattle>=1&&h.cattle<5&&h.livestockHealth>68&&rand(s)<.18*Math.min(2,h.cattle)){
  h.cattle++;s.stats.cattleBorn++;
  event(s,'cattle-birth',`У семьи ${familyName(s,h)} появился телёнок`,'Здоровое стадо и доступное питание',[h.id],{cattle:h.cattle});
 }
}
// Local commons are customary access rights, not an inexhaustible shared store.
// A household may graze on walkable unclaimed land administered by its community.
// Existing land and houses remain private claims even inside the commons boundary.
function ensureCommons(s){
 if(s.commons?.length===T)return;
 const distances=s.communities.map(c=>walkingDistances(s,c));
 const shares=new Array(T).fill(0);
 for(let i=0;i<T;i++)if(s.terrain[i]===0){let d=Infinity,owner=0;
  for(let j=0;j<s.communities.length;j++){const v=distances[j][i];if(v>=0&&v<d){d=v;owner=s.communities[j].id;}}
  if(d<=82)shares[i]=owner;
 }
 s.commons=shares;
}
function resetGrazingCache(h){if(Object.prototype.hasOwnProperty.call(h,'_grazingSpots'))delete h._grazingSpots;}
function homeHasCommons(s,h){ensureCommons(s);return s.commons[idx(h.x,h.y)]===h.communityId;}
// An abandoned holding returns to the village land bank unless heirs claim it.
function releaseFields(s,h){
 const n=h.fields.length;for(const i of h.fields)if(s.usage[i]===2)s.usage[i]=0;
 h.fields=[];h.farmYear=null;h.landProject=null;s.stats.landAbandoned=(s.stats.landAbandoned||0)+n;
 return n;
}
function divideLand(s,parent,child,fraction=.45){
 if(!parent.fields.length)return 0;
 // Prefer strips physically accessible from the new home, retaining land for parents.
 const reach=walkingDistances(s,child);
 const possible=parent.fields.filter(i=>reach[i]>=0&&reach[i]<=105)
  .sort((a,b)=>reach[a]-reach[b]||a-b);
 const count=Math.min(possible.length,Math.floor(parent.fields.length*fraction));
 if(!count)return 0;
 const moved=new Set(possible.slice(0,count));parent.fields=parent.fields.filter(i=>!moved.has(i));
 child.fields.push(...moved);child.fields.sort((a,b)=>a-b);
 parent.farmYear=null;child.farmYear=null;
 child.tenure='customary';child.tenureOrigin='family-division';
 s.stats.landDivided=(s.stats.landDivided||0)+count;
 event(s,'land-division',`Семья ${familyName(s,parent)} разделила пахотные полосы`,
 'Создание отдельного двора не даёт бесплатной земли: участки поделены с родственниками',
 [parent.id,child.id],{fields:count,hectares:round(count*LAND_HA)});
 return count;
}
function reclaimProject(s,h,adults){
 const day=s.day%365;
 if(day<310||day>346||!adults.length||h.fields.length>=50)return;
 if(!h.landProject){
  const demand=annualNeed(s,h),reserve=h.grain/Math.max(1,demand);
  if(!(h.fields.length<8||reserve<.70||h.members.filter(id=>personById(s,id)?.alive).length>=6))return;
  if(h.wood<24||h.coin<16)return;
  ensureCommons(s);
  // Choose unclaimed ground in an existing village's open fields, accessible by foot.
  const village=s.communities.find(c=>c.id===h.communityId);if(!village)return;
  const walk=walkingDistances(s,h);
  let best=-1,score=Infinity;
  for(let y=Math.max(2,village.y-53);y<Math.min(SIZE-2,village.y+54);y+=2)
  for(let x=Math.max(2,village.x-53);x<Math.min(SIZE-2,village.x+54);x++){
   const i=idx(x,y),d=walk[i];
   if(s.commons[i]!==h.communityId||s.usage[i]||s.terrain[i]!==0||s.soil[i]<50||d<0||d>95)continue;
   // Prefer land next to other open-field strips, rather than scattering isolated cells.
   const adjacent=[i-1,i+1,i-SIZE,i+SIZE].filter(k=>s.usage[k]===2).length;
   const value=d*.11+(100-s.soil[i])*.1-adjacent*4+hash(s.seed,h.id,i)*2;
   if(value<score){score=value;best=i;}
  }
  if(best<0)return;
  h.wood=round(h.wood-24);s.stats.landWood=(s.stats.landWood||0)+24;
  // Coins are deposited with the existing community households as compensation
  // for losing common use, not destroyed or minted.
  const recipients=s.households.filter(k=>k.communityId===h.communityId&&k.id!==h.id&&liveMembers(s,k).length).sort((a,b)=>a.id-b.id);
  if(recipients.length){h.coin-=16;recipients[0].coin+=16;}
  h.landProject={cell:best,days:0,costWood:24};
  event(s,'land-claim-start',`${familyName(s,h)} расчищает новый участок`,
   'Доступная общинная земля, компенсация соседям, расход древесины и труд',
   [h.id],{cell:best,workDays:12});
 }
 const p=adults.find(p=>p.job==='home');if(!p)return;
 p.job='build';recordWork(p,'build');h.landProject.days++;
 if(h.landProject.days>=12){
  const i=h.landProject.cell;
  if(s.usage[i]===0&&s.terrain[i]===0){
   s.usage[i]=2;h.fields.push(i);
   s.stats.forageConverted=round((s.stats.forageConverted||0)+(s.pasture[i]||0));s.pasture[i]=0;
   s.stats.landReclaimed=(s.stats.landReclaimed||0)+1;
   event(s,'land-claim',`${familyName(s,h)} завершила расчистку земли`,
    'Двенадцать рабочих дней, компенсация соседям и реально свободная пашня',[h.id],{cell:i});
  }
  h.landProject=null;h.farmYear=null;
 }
}
// A complete family can leave a failing holding only if another settlement has
// a vacant home, accessible ground and a feasible route. Travel takes game days.

// Feasibility is evaluated in units of food, not house counts or vacant grass.
// No household should abandon an insufficient holding for an even poorer one.
function attainableHarvest(s,h){
 const usable=Math.max(0,h.fields.length+(h.leaseIn?.length||0)-(h.leaseOut?.length||0))*LAND_HA;
 return usable*(2/3)*CALIBRATION.baseGrainYieldKgPerHa*(fieldSoil(s,h)/82)*.75*tuning(s,'yield');
}
function evaluateMigration(s){
 for(const h of s.households){
  if(h.migration||!liveMembers(s,h).length||s.day<(h.nextMigrationTry||0))continue;
  const people=liveMembers(s,h),adult=people.some(p=>p.age>=18&&p.health>30);
  if(!adult||people.some(p=>p.travel))continue;
  const need=annualNeed(s,h),reserve=h.grain/Math.max(1,need);
  const fromYield=attainableHarvest(s,h);
  // A single unmarried young adult can enter another community as a live-in
  // agricultural servant. A whole family does not magically acquire a farm.
  const serviceCandidate=people.filter(p=>p.age>=17&&p.age<=34&&!currentPartner(s,p)&&p.health>35)
   .sort((a,b)=>b.age-a.age||a.id-b.id)[0];
  if(serviceCandidate&&people.length>=2&&
     (h.fields.length<people.length*11||h.grain<annualNeed(s,h)*.45)){
   const posts=[];
   for(const target of s.households){
    if(target.id===h.id||target.communityId===h.communityId||target.reservedBy||target.migration)continue;
    const residents=liveMembers(s,target),hostAdults=residents.filter(p=>p.age>=18&&p.health>35);
    if(!residents.length||hostAdults.length!==1||residents.length+1>target.capacity+1)continue;
    const sustainable=attainableHarvest(s,target);
    const needWithWorker=annualNeed(s,target)+.68*365;
    if(sustainable<needWithWorker*1.06||target.grain<needWithWorker*.55)continue;
    const road=walkPath(s,h,target);if(road.length<2||road.length>240)continue;
    const rank=sustainable/needWithWorker+target.grain/needWithWorker-road.length*.002;
    posts.push({target,road,rank});
   }
   posts.sort((a,b)=>b.rank-a.rank||a.target.id-b.target.id);
   if(posts[0]){
    const {target,road}=posts[0],days=Math.max(2,Math.ceil((road.length-1)*.025/12));
    h.migration={target:target.id,kind:'service',personIds:[serviceCandidate.id],start:s.day,
      end:s.day+days,route:road};
    target.reservedBy=h.id;
    serviceCandidate.travel={from:{x:h.x,y:h.y},to:{x:target.x,y:target.y},
      points:road,start:s.day,arrival:s.day+days,end:s.day+days};
    serviceCandidate.job='haul';
    event(s,'migration',`${serviceCandidate.name} отправился работать в другую общину`,
     'Молодой безбрачный работник; принимающий двор имеет землю, место и запасы, но мало рабочих рук',
     [h.id,target.id,serviceCandidate.id],{kind:'service',days,expectedYield:round(attainableHarvest(s,target))});
    continue;
   }
  }
  // Annual family migration is a major event, unlike casual market trips.
  if(!(fromYield<need*.82&&reserve<.52)||h.grain<foodNeed(s,h)*20){
   h.nextMigrationTry=s.day+180;continue;
  }
  const viable=[];
  for(const target of s.households){
   if(target.communityId===h.communityId||target.reservedBy||target.migration)continue;
   const occupants=liveMembers(s,target),empty=!occupants.length;
   const combinedNeed=need+annualNeed(s,target);
   if(!empty&&occupants.length+people.length>target.capacity+1)continue;
   if(empty&&people.length>target.capacity+1)continue;
   const path=walkPath(s,h,target);
   if(path.length<2||path.length>240)continue;
   const holdingYield=attainableHarvest(s,target);
   // Already inhabited houses may host dependent workers only when their own
   // cultivated land could feed everyone, with real reserves for transition.
   const requiredYield=combinedNeed*(empty?.90:1.07);
   if(holdingYield<requiredYield)continue;
   const requiredGrain=foodNeed(s,h)*(empty?170:260)+foodNeed(s,target)*210;
   if(target.grain<requiredGrain)continue;
   const newRatio=holdingYield/Math.max(1,combinedNeed);
   if(newRatio<=fromYield/Math.max(1,need)+.18)continue;
   viable.push({target,path,kind:empty?'vacant':'lodging',ratio:newRatio,
     score:newRatio*20+target.grain/Math.max(1,combinedNeed)*2-path.length*.065});
  }
  viable.sort((a,b)=>b.score-a.score||a.target.id-b.target.id);
  const selected=viable[0];if(!selected){h.nextMigrationTry=s.day+180;continue;}
  const {target,path,kind}=selected;
  const days=Math.max(2,Math.ceil((path.length-1)*.025/12));
  h.migration={target:target.id,start:s.day,end:s.day+days,route:path,kind};
  target.reservedBy=h.id;
  for(const p of people){p.travel={from:{x:h.x,y:h.y},to:{x:target.x,y:target.y},points:path,start:s.day,arrival:s.day+days,end:s.day+days};p.job='haul';}
  event(s,'migration',`${familyName(s,h)} покидает хозяйство`,
   'Недостаточная земля и пища исходного хозяйства; принимающий двор имеет реальные поля и средства',
   [h.id,target.id],{days,kind,sourceYieldKg:round(fromYield),destinationYieldKg:round(attainableHarvest(s,target))});
 }
}
function nearbyFreeLand(s,c,r){if(!c)return 0;const d=walkingDistances(s,c);let n=0;for(let i=0;i<T;i++)if(d[i]>=0&&d[i]<=r&&!s.usage[i]&&s.soil[i]>=50&&s.terrain[i]===0)n++;return n;}

function finishMigration(s){
 for(const h of s.households){if(!h.migration||s.day<h.migration.end)continue;
  const to=livingHouse(s,h.migration.target),
   service=h.migration.kind==='service',
   people=service?liveMembers(s,h).filter(p=>h.migration.personIds?.includes(p.id)):liveMembers(s,h);
  const lodging=h.migration.kind==='lodging';
  const residents=to?liveMembers(s,to):[];
  const acceptable=to&&people.length&&(!residents.length||(lodging||service)&&
    residents.length+people.length<=to.capacity+1&&
    to.grain>(foodNeed(s,to)+people.length*.68)*95);
  if(acceptable){
   const previous=h.communityId;
   for(const p of people){h.members=h.members.filter(id=>id!==p.id);to.members.push(p.id);p.houseId=to.id;p.travel=null;p.job='home';p.x=to.x;p.y=to.y;recordLife(p,s.day,'move',`Переселился в общину ${to.communityId}`);}
   if(!service)for(const good of ['grain','wood','coin','fodder','garden','dairy']){to[good]=round((to[good]||0)+(h[good]||0));h[good]=0;}
   if(!service){to.cattle=(to.cattle||0)+(h.cattle||0);h.cattle=0;}
   if(!service)redistributeAbandonedStrips(s,h);
   const released=service?0:releaseFields(s,h);resetGrazingCache(to);to.reservedBy=null;
   if(!lodging&&!service){to.tenure='customary';to.tenureOrigin='migration';}
   s.stats.migrations=(s.stats.migrations||0)+people.length;
   if(lodging)s.stats.lodgingMigrants=(s.stats.lodgingMigrants||0)+people.length;
   if(service)s.stats.serviceMigrants=(s.stats.serviceMigrants||0)+people.length;
   event(s,'migration-arrival',`${familyName(s,to)} переселилась в новую общину`,
    service?'Личная служба на ферме другой общины, без передачи земельных прав':lodging?'Принятие людей в существующий двор с действительными запасами и землёй':'Поиск земли и жилья за пределами прежнего поселения',
    [h.id,to.id],{people:people.length,oldCommunity:previous,fieldsReleased:released,kind:service?'service':lodging?'lodging':'vacant'});
  }else if(to)to.reservedBy=null;
  h.migration=null;h.nextMigrationTry=s.day+32;
 }
}

function regrowPasture(s){
 const day=s.day%365;if(day<75||day>300)return;
 for(let i=0;i<T;i++)if(s.terrain[i]===0&&!s.usage[i]){
  const growth=round(Math.min(200-s.pasture[i],(4+s.soil[i]*.14)*s.weather));
  if(growth>0){s.pasture[i]=round(s.pasture[i]+growth);s.stats.forageGrown=round((s.stats.forageGrown||0)+growth);}
 }
}
function currentPartner(s,p){const spouse=personById(s,p.spouse);return spouse?.alive?spouse:null;}
function livingHouse(s,id){
 if(!s._houseIndex)Object.defineProperty(s,'_houseIndex',{value:new Map(),enumerable:false,writable:true,configurable:true});
 if(s._houseIndex.size!==s.households.length){s._houseIndex.clear();for(const h of s.households)s._houseIndex.set(h.id,h);}
 return s._houseIndex.get(id);
}
function findVacancy(s,c){return s.households.filter(h=>h.communityId===c.id&&!h.reservedBy&&!liveMembers(s,h).length).sort((a,b)=>dist(a,c)-dist(b,c))[0];}
function relocate(s,people,from,to){
 const n=people.length;if(!n||from.id===to.id)return;
 const fraction=n/Math.max(1,liveMembers(s,from).length);
 // Shares move between households without manufacturing or deleting resources.
 const cattleMoved=Math.min(from.cattle||0,Math.floor((from.cattle||0)*fraction));from.cattle=(from.cattle||0)-cattleMoved;to.cattle=(to.cattle||0)+cattleMoved;
  const hayMoved=round((from.fodder||0)*fraction*.5);from.fodder=round((from.fodder||0)-hayMoved);to.fodder=round((to.fodder||0)+hayMoved);
  for(const resource of ['grain','wood','coin','garden','dairy']){
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
 const day=s.day%365,builders=adults.filter(p=>p.job==='home');
 // Houses require a continuous investment of labour, rather than materialising
 // in a single tick. Timber is reserved at the start and conserved in the audit.
 if(h.buildProject){
  if(builders.length){builders[0].job='build';recordWork(builders[0],'build');h.buildProject.days++;}
  if(h.buildProject.days<50)return;
  const c=s.communities.find(c=>c.id===h.communityId),site=h.buildProject.site;
  const available=site&&!s.usage[idx(site.x,site.y)]&&s.terrain[idx(site.x,site.y)]===0;
  const movers=availableMovers(s,h);
  if(!c||!available||!movers){
   // Site was taken, or no eligible successor survived the building period:
   // salvaged timber returns to its original household.
   h.wood=round(h.wood+490);s.stats.houseWoodReserved=round((s.stats.houseWoodReserved||0)-490);
   h.buildProject=null;h.nextBuildAttempt=s.day+45;return;
  }
  const child=newHousehold(s,c,site.x,site.y,0,0,0);
  if(!child){h.wood=round(h.wood+490);s.stats.houseWoodReserved=round((s.stats.houseWoodReserved||0)-490);h.buildProject=null;return;}
  const dowry=Math.min(h.coin,85);h.coin=round(h.coin-dowry);child.coin=dowry;
  relocate(s,movers,h,child);divideLand(s,h,child);
  s.stats.houseWoodReserved=round((s.stats.houseWoodReserved||0)-490);s.stats.built++;
  h.buildProject=null;h.nextBuildAttempt=s.day+365;
  event(s,'construction',`Семья ${familyName(s,child)} закончила строительство нового дома`,
   'Пятьдесят рабочих дней, древесина, семейное разделение земли и имущества',[h.id,child.id],
   {woodSpent:490,workDays:50,land:child.fields.length});
  return;
 }
 if(day>=66&&day<=300)return; // new tenures are divided after harvest
 if(!h.needsHouse||!adults.length||h.migration)return;
 // An independent hearth requires enough land to support its members; otherwise
 // the extended family remains together until rights or wages become available.
 if(h.fields.length<38)return;
 const movers=availableMovers(s,h);if(!movers)return;
 const c=s.communities.find(c=>c.id===h.communityId);if(!c)return;
 const vacant=findVacancy(s,c);
 if(vacant){relocate(s,movers,h,vacant);divideLand(s,h,vacant);
  event(s,'resettlement',`${familyName(s,h)} заселила пустующий дом`,
   'Существующее жильё, передача земельных прав родственниками',[h.id,vacant.id,...movers.map(p=>p.id)]);
  h.needsHouse=liveMembers(s,h).length>h.capacity;return;}
 if(h.wood<490||h.coin<85||(h.nextBuildAttempt||0)>s.day||!builders.length)return;
 const site=chooseBuildingSite(s,h,c);if(!site){h.nextBuildAttempt=s.day+45;return;}
 h.wood=round(h.wood-490);s.stats.houseWoodReserved=round((s.stats.houseWoodReserved||0)+490);
 h.buildProject={days:0,site,started:s.day};
 event(s,'building-start',`${familyName(s,h)} начала строительство двора`,
 'Собственные средства, местоположение и пятьдесят дней труда',[h.id],{wood:490,days:50});
}
function moveHouseResidents(s,h){
 for(const id of h.members){const p=personById(s,id);if(!p?.alive)continue;
  if(p.hiredDay===s.day){p.job='hired';p.x=p.hiredX;p.y=p.hiredY;continue;}
  if(p.travel&&s.day>=p.travel.end){p.travel=null;p.job='home';}
  if(p.travel){const t=p.travel,departing=s.day<=t.arrival;
   const origin=departing?t.from:t.to,dest=departing?t.to:t.from;
   const ratio=clamp(departing?(s.day-t.start)/Math.max(1,t.arrival-t.start):(s.day-t.arrival)/Math.max(1,t.end-t.arrival),0,1);
   p.job='haul';const route=t.points&&t.points.length>1?(departing?t.points:[...t.points].reverse()):[origin,dest];const pos=moveOnRoute(route,ratio);p.x=pos.x;p.y=pos.y;
  }else if(p.job==='home'){p.x=h.x;p.y=h.y;}
  else if(p.job==='farm'&&h.fields.length){/* position assigned by actual sowing/harvesting task */}
  else if(p.job==='market'){const c=s.communities.find(x=>x.id===h.communityId);p.x=c.x;p.y=c.y;}
 }
}
// A deserted holding does not become a magically unused wasteland. Customary
// parcels may be reassigned to active tenants of the same community. No area is
// created; an applicant must be physically able to reach and cultivate it.
function redistributeAbandonedStrips(s,estate){
 const n=estate.fields.length;if(!n)return;
 const active=s.households.filter(h=>h.id!==estate.id&&h.communityId===estate.communityId&&liveMembers(s,h).some(p=>p.age>=15&&p.health>25));
 const ranges=active.map(h=>({h,walk:walkingDistances(s,h),workers:activeAdults(s,h).length}));
 let assigned=0;
 for(const i of [...estate.fields]){
  let winner=null,score=Infinity;
  for(const candidate of ranges){const {h,walk,workers}=candidate;
   const cap=Math.max(30,22+workers*7);
   if(h.fields.length>=cap||walk[i]<0||walk[i]>95)continue;
   // Prefer nearby needy households. Dense adult households can work more strips.
   const value=walk[i]*.6+h.fields.length*2.0/(Math.max(1,workers))+hash(s.seed+h.id,i,s.day)*.8;
   if(value<score){score=value;winner=h;}
  }
  if(winner){winner.fields.push(i);assigned++;winner.tenureOrigin='community-reallocation';winner.farmYear=null;}
 }
 if(assigned){const held=new Set(ranges.flatMap(r=>r.h.fields));estate.fields=estate.fields.filter(i=>!held.has(i));
  s.stats.landReallocated=(s.stats.landReallocated||0)+assigned;
  event(s,'communal-reallocation',`Община передала ${assigned} полос обрабатывающим семьям`,
   'Освободившиеся права пользования переданы людям с доступом и рабочими руками',
   [estate.id],{fields:assigned});
 }
}
function inheritVacant(s,h){
 if(liveMembers(s,h).length)return;
 const kin=s.people.filter(p=>h.members.includes(p.id));
 const heirs=s.people.filter(p=>p.alive&&p.houseId!==h.id&&kin.some(q=>q.parents.includes(p.id)||p.parents.includes(q.id)));
 const heir=heirs.sort((a,b)=>a.id-b.id)[0];const recipient=heir?livingHouse(s,heir.houseId):null;
 if(recipient){
  const reach=walkingDistances(s,recipient);
  const inherited=h.fields.filter(i=>reach[i]>=0&&reach[i]<=105).slice(0,Math.max(0,50-recipient.fields.length));
  for(const i of inherited)recipient.fields.push(i);
  h.fields=h.fields.filter(i=>!inherited.includes(i));
  recipient.farmYear=null;recipient.tenureOrigin='inheritance';
  s.stats.landInherited=(s.stats.landInherited||0)+inherited.length;
  if(inherited.length)event(s,'land-inheritance',`Родственники унаследовали ${inherited.length} полос`,
   'Наследование зависимого крестьянского владения без создания новых участков',
   [h.id,recipient.id],{fields:inherited.length});
  recipient.cattle=(recipient.cattle||0)+(h.cattle||0);h.cattle=0;
  recipient.fodder=round((recipient.fodder||0)+(h.fodder||0));h.fodder=0;
 }
 if(h.fields.length){redistributeAbandonedStrips(s,h);if(h.fields.length)releaseFields(s,h);}
  if(recipient)for(const key of ['grain','wood','coin','garden','dairy']){recipient[key]=round((recipient[key]||0)+(h[key]||0));h[key]=0;}
 // In this explicitly customary village regime, ownerless goods are taken into
 // local stewardship, not abandoned forever in an inaccessible ghost household.
 // The steward is a real living household, reachable overland; property moves
 // in full and may become concentrated. This is not universal feudal law or alms.
 if(!recipient){
  const reachable=walkingDistances(s,h);
  const trustees=s.households.filter(k=>k.id!==h.id&&k.communityId===h.communityId&&
   liveMembers(s,k).some(p=>p.age>=18&&p.health>25)&&reachable[idx(k.x,k.y)]>=0&&reachable[idx(k.x,k.y)]<=95);
  trustees.sort((a,b)=>reachable[idx(a.x,a.y)]-reachable[idx(b.x,b.y)]||a.id-b.id);
  const trustee=trustees[0];
  if(trustee&&[h.grain,h.wood,h.coin,h.fodder||0,h.cattle||0,h.garden||0,h.dairy||0].some(value=>value>0)){
   const amounts={grain:h.grain,wood:h.wood,coin:h.coin,cattle:h.cattle||0,fodder:h.fodder||0,garden:h.garden||0,dairy:h.dairy||0};
   for(const resource of ['grain','wood','coin','fodder','garden','dairy']){trustee[resource]=round((trustee[resource]||0)+(h[resource]||0));h[resource]=0;}
   trustee.cattle=(trustee.cattle||0)+(h.cattle||0);h.cattle=0;
   s.stats.escheatEstates=(s.stats.escheatEstates||0)+1;
   s.stats.escheatedCoin=(s.stats.escheatedCoin||0)+amounts.coin;
   event(s,'estate-stewardship',`Невостребованное имущество дома ${h.id} передано на местное хранение`,
    'Нет близкого наследника; доступный сельский распорядитель принимает реальные запасы, скот и деньги',
    [h.id,trustee.id],amounts);
  }
 }
 if(recipient)event(s,'inheritance',`Имущество опустевшего дома перешло наследникам`,'Смерть последнего жильца и наличие живых родственников',[h.id,recipient.id,heir.id]);
}
function areCloseKin(s,a,b){
 if(a.id===b.id||a.parents.includes(b.id)||b.parents.includes(a.id))return true;
 if(a.parents.some(id=>b.parents.includes(id)))return true;
 const ancestors=(p)=>{const ids=new Set(p.parents);for(const id of p.parents){const parent=personById(s,id);if(parent)for(const grandparent of parent.parents)ids.add(grandparent);}return ids;};
 const aa=ancestors(a),bb=ancestors(b);return [...aa].some(id=>bb.has(id))||aa.has(b.id)||bb.has(a.id);
}
function lifeCycle(s){
 for(const p of s.people){if(!p.alive)continue;p.age+=1/365;
 const hazard=p.age<1?.15:p.age<5?.05:p.age<15?.012:p.age<40?.008:p.age<60?.018:p.age<80?.06:.2;
 const physicalRisk=1+Math.max(0,65-p.health)*.009+(p.age<5?Math.max(0,p.foodDebt-3)*.015:0);
 const death=p.health<=0||demographicDraw(s,'death',p.randomKey??p.id)<hazard*(1+p.foodDebt*.025)*physicalRisk/365;
 if(!death)continue;
 if(p.health<=0){
   s.stats.starvationDeaths=(s.stats.starvationDeaths||0)+1;
   const home=livingHouse(s,p.houseId);
   if(home){s.foodCases??=[];s.foodCases.push({...foodAccess(s,home),personId:p.id,age:round(p.age),shortageDays:home.shortage});
    if(s.foodCases.length>160)s.foodCases.shift();}
  }
  p.alive=false;p.job='dead';s.stats.died++;recordLife(p,s.day,'death',`Умер в ${Math.floor(p.age)} лет (${p.health<=0?'истощение':'возраст или болезнь'})`);
 const spouse=personById(s,p.spouse);
 if(spouse?.alive){spouse.spouse=null;recordLife(spouse,s.day,'widowed',`Потерял супруга ${p.name}`);}
 event(s,'death',`${p.name} умер в возрасте ${Math.floor(p.age)} лет`,p.health<=0?'Истощение':'Возраст, здоровье и случайный риск',[p.id,p.houseId],{age:round(p.age)});
 }
 // An estate must be examined on EVERY transition from inhabited to empty.
 // A dwelling can pass through several generations of occupants; a once-only
 // lastEstateDay flag otherwise strands fields and wealth after later deaths.
 for(const h of s.households){
  if(liveMembers(s,h).length){h.lastEstateDay=null;continue;}
  if(h.lastEstateDay)continue;
  inheritVacant(s,h);
  h.lastEstateDay=s.day;
 }
 if(s.day%30===0){for(const mother of [...s.people]){
 if(!mother.alive||mother.sex!=='f')continue;
 const home=livingHouse(s,mother.houseId);if(!home)continue;
 if(mother.pregnantUntil>0&&s.day>=mother.pregnantUntil){const fatherId=mother.pregnantFatherId??mother.spouse;
 mother.pregnantUntil=-1;mother.pregnantFatherId=null;mother.lastBirthDay=s.day;
 const baby=createPerson(s,home,0,rand(s)<.5?'m':'f',[mother.id,fatherId].filter(Boolean));
 baby.health=round(clamp(78+mother.health*.22-mother.foodDebt*.27,42,100));s.stats.born++;
 recordLife(mother,s.day,'birth',`Родился ребёнок ${baby.name} (#${baby.id})`);
 const father=personById(s,fatherId);if(father)recordLife(father,s.day,'birth',`Родился ребёнок ${baby.name} (#${baby.id})`);
 event(s,'birth',`У ${mother.name} родился ребёнок`,'Завершение беременности',[home.id,baby.id,mother.id,fatherId].filter(Boolean));
 continue;}
 const spouse=currentPartner(s,mother);
 if(mother.pregnantUntil<0&&spouse&&mother.age>=18&&mother.age<=40&&mother.health>45&&s.day-mother.lastBirthDay>=500&&
 demographicDraw(s,'conception',mother.randomKey??mother.id)<.075*clamp((mother.health-30)/65,.12,1)*clamp(1-mother.foodDebt/90,.12,1)*(mother.age>34?.76:1)){mother.pregnantUntil=s.day+270;mother.pregnantFatherId=spouse.id;}
 }}
 if(s.day%365===0){
 const singles=s.people.filter(p=>p.alive&&p.age>=18&&!currentPartner(s,p));
 const females=singles.filter(p=>p.sex==='f'&&p.age<=41);const males=singles.filter(p=>p.sex==='m'&&p.age<=52);
 for(const f of females){
 const matches=males.filter(m=>!currentPartner(s,m)&&m.id!==f.id&&dist(m,f)<95&&!areCloseKin(s,m,f));
 matches.sort((a,b)=>dist(a,f)-dist(b,f)||a.id-b.id);const husband=matches[0];if(!husband||hash(s.seed^0x32b741,(f.randomKey??f.id)^s.day,husband.randomKey??husband.id)>.9)continue;
 f.spouse=husband.id;husband.spouse=f.id;
 const home=livingHouse(s,husband.houseId),source=livingHouse(s,f.houseId);
 if(home&&source&&home.id!==source.id){const dependents=liveMembers(s,source).filter(child=>child.age<15&&child.parents.includes(f.id));relocate(s,[f,...dependents],source,home);}
 recordLife(f,s.day,'marriage',`Вышла замуж за ${husband.name} (#${husband.id})`);
 recordLife(husband,s.day,'marriage',`Женился на ${f.name} (#${f.id})`);
 event(s,'marriage',`${f.name} и ${husband.name} заключили брак`,'Знакомство взрослых жителей и создание семьи',[f.id,husband.id,home?.id].filter(Boolean));
 }
 }
}

function foodDaysToHarvest(s){
 const day=s.day%365;
 // The next reliable grain inflow is the beginning of harvest, not the next New Year.
 return day>=238&&day<=295?45:day<238?238-day:365-day+238;
}
function foodProtection(s,h,emergency=false){
 const days=clamp(foodDaysToHarvest(s)+(emergency?12:48),emergency?130:220,emergency?340:365);
 // Even a household selling to a desperate neighbour keeps seed for its own sowing.
 const seed=Math.min(250,h.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.65);
 return foodNeed(s,h)*days+seed;
}
function demand(s,h,good){const living=liveMembers(s,h);if(!living.length)return 0;
 if(good==='grain'){const reserve=foodNeed(s,h)*210+Math.min(250,h.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.55);return h.grain<reserve?Math.ceil(reserve-h.grain):0;}
 return h.wood<(h.needsHouse?510:150)?Math.ceil((h.needsHouse?510:150)-h.wood):0;
}
function supply(s,h,good,emergency=false){const living=liveMembers(s,h);if(!living.length)return 0;
 if(good==='grain')return Math.max(0,Math.floor(h.grain-Math.max(foodNeed(s,h)*285,0)-Math.min(250,h.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.65)));
 return Math.max(0,Math.floor(h.wood-(h.focus==='wood'?160:260)));
}
// A diagnostic, not a promise of rescue. Ownership, distance, cash, stored
// seeds, and delayed shipments distinguish "grain exists" from "food is accessible".
export function foodAccess(s,h){
 const need=foodNeed(s,h),days=need>0?round((h.grain+(h.garden||0)+(h.dairy||0))/need):0;
 const homes=s.households.filter(k=>k.id!==h.id&&liveMembers(s,k).length&&dist(k,h)<=68);
 const paths=walkingDistances(s,h);
 let localGrain=0,marketSurplus=0,possibleAid=0,connected=0,creditCeiling=0,workOffers=0;
 const unspent=Math.max(0,h.coin);
 const fields=Math.max(0,h.fields.length+(h.leaseIn?.length||0)-(h.leaseOut?.length||0));
 const openCredit=(s.loans||[]).some(l=>l.borrowerId===h.id&&['active','in-transit'].includes(l.status));
 const spareWorkers=liveMembers(s,h).filter(p=>p.age>=15&&p.health>25&&!p.travel&&p.hiredDay!==s.day).length>=2;
 const price=s.communities.find(c=>c.id===h.communityId)?.prices.grain||1.1;
 for(const k of homes){
  const steps=paths[idx(k.x,k.y)];if(steps<0||steps>190)continue;
  connected++;localGrain=round(localGrain+k.grain);
  const extra=supply(s,k,'grain');
  marketSurplus+=extra;
  if(!openCredit&&steps<=45&&(fields>=15||fields>=7&&
      liveMembers(s,k).some(p=>liveMembers(s,h).some(q=>areCloseKin(s,p,q))))){
   const reserve=Math.max(foodProtection(s,k),foodNeed(s,k)*260+
    Math.min(250,k.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.65));
   creditCeiling+=Math.max(0,Math.min(95,(k.grain-reserve)*.22));
  }
  if(spareWorkers&&steps<=16&&k.fields.length>=9&&
     k.grain>foodProtection(s,k)+CALIBRATION.grainDailyWageKg*6&&
     activeAdults(s,k).length<2)workOffers++;
  if(steps<=40&&k.grain>foodProtection(s,k,true)+need*7)possibleAid+=Math.max(0,k.grain-foodProtection(s,k,true));
 }
 const inbound=s.shipments.filter(t=>t.good==='grain'&&t.buyer===h.id).reduce((n,t)=>n+t.amount,0);
 return {houseId:h.id,communityId:h.communityId,day:s.day,people:liveMembers(s,h).length,
  foodKg:round(h.grain),gardenEquivalentKg:round(h.garden||0),dairyEquivalentKg:round(h.dairy||0),
  dailyNeedKg:round(need),foodDays:days,coin:h.coin,
  outstandingLoanKg:round((s.loans||[]).filter(l=>l.borrowerId===h.id&&['active','in-transit'].includes(l.status)).reduce((n,l)=>n+l.owed,0)),
  creditsDueKg:round((s.loans||[]).filter(l=>l.lenderId===h.id&&['active','in-transit'].includes(l.status)).reduce((n,l)=>n+l.owed,0)),
  connectedSellers:connected,reachableGrainKg:round(localGrain),
  offeredEmergencyKg:Math.floor(marketSurplus),affordableKg:Math.floor(Math.min(marketSurplus,unspent/Math.max(.45,price*1.3))),
  potentialAidKg:round(possibleAid),potentialCreditKg:round(Math.min(creditCeiling,Math.max(0,attainableHarvest(s,h)*.32))),potentialGrainWorkplaces:workOffers,grainInTransitKg:round(inbound),
  reason:days>=14?'supplied':inbound>need*7?'delivery-pending':marketSurplus===0?
   (creditCeiling>7?'credit-possible':workOffers?'paid-work-possible':'no-saleable-surplus'):
   h.coin<5?'no-cash':unspent/Math.max(.45,price*1.3)<need*7?'not-affordable':'market-or-carrier-delay'};
}

function riverX(y){return SIZE*.47+Math.sin(y*.075)*11+Math.sin(y*.026)*7;}
function routeBetween(s,a,b){
 const points=walkPath(s,a,b);return {points,length:points.length?points.length-1:Infinity};

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
    const route=routeBetween(s,seller,buyer),distance=route.length,haulPrice=1+distance*.009*tuning(s,'transport');
    if(!Number.isFinite(distance)||!route.points.length)continue;
     const haulers=nearby.filter(h=>h.focus==='trade'||h.id===seller.id);
    let carrier=null,carrierHome=null,bestTransport=Infinity;
    for(const home of haulers){const worker=liveMembers(s,home).find(p=>p.age>=15&&p.health>25&&!p.travel&&p.hiredDay!==s.day);if(!worker)continue;const travel=dist(home,seller);const score=travel+(home.focus==='trade'?-8:0);if(score<bestTransport){carrier=worker;carrierHome=home;bestTransport=score;}}
    if(!carrier)continue;
    const approach=routeBetween(s,carrierHome,seller).length;if(!Number.isFinite(approach))continue;
    const price=round(c.prices[good]*haulPrice*(.97+rand(s)*.06));
    const quantity=Math.min(160,supply(s,seller,good),demand(s,buyer,good),Math.floor(buyer.coin/Math.max(.1,price)));
    if(quantity<5)continue;
    const cost=Math.ceil(quantity*price);if(cost>buyer.coin)continue;
    seller[good]=round(seller[good]-quantity);buyer.coin-=cost;earn(s,seller,'salesKg',quantity);earn(s,buyer,'purchasesKg',quantity);earn(s,buyer,'spending',cost);
    const duration=Math.max(1,Math.ceil((distance+approach)/(s.scenario==='isolated'?5:10)));
    const shipment={id:s.nextId++,good,amount:quantity,seller:seller.id,buyer:buyer.id,cost,
       carrierId:carrier.id,route:route.points,carrierHouseId:carrierHome.id,haulFee:Math.min(cost-1,Math.floor(cost*.1+distance*.03*tuning(s,'transport'))),departure:s.day+1,day:s.day+duration+1,origin:{x:seller.x,y:seller.y},destination:{x:buyer.x,y:buyer.y},
       reason:`У покупателя дефицит, у продавца избыток; ставка зависит от местного рынка`};
    s.shipments.push(shipment);
    carrier.travel={from:{x:seller.x,y:seller.y},to:{x:buyer.x,y:buyer.y},points:route.points,start:s.day+1,arrival:s.day+duration+1,end:s.day+duration*2+1};
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
function deliver(s){
 for(let i=s.shipments.length-1;i>=0;i--){
  const t=s.shipments[i];if(t.day>s.day)continue;
  const a=livingHouse(s,t.seller),b=livingHouse(s,t.buyer);
  const loan=t.loanId?s.loans?.find(l=>l.id===t.loanId):null;
  if(a&&b){
   b[t.good]=round(b[t.good]+t.amount);
   if(t.kind==='aid')earn(s,b,'aidReceived',t.amount);
   else if(t.kind==='loan'){if(loan)loan.status='active';}
   else if(t.kind==='loan-repayment'){
    if(loan){loan.owed=round(Math.max(0,loan.owed-t.amount));loan.repaid=round((loan.repaid||0)+t.amount);
     s.stats.loanRepaidKg=round((s.stats.loanRepaidKg||0)+t.amount);
     if(loan.owed<=.01){loan.owed=0;loan.status='paid';loan.closed=s.day;}}
   }else earn(s,a,'revenue',t.cost);
   const recipient=livingHouse(s,t.carrierHouseId);
   const wage=recipient&&recipient.id!==a.id?Math.min(t.haulFee||0,t.cost):0;
   a.coin+=t.cost-wage;
   if(recipient){recipient.coin+=wage;earn(s,recipient,'haulEarned',wage);}
   s.stats.delivered++;
   const carrier=personById(s,t.carrierId);
   if(carrier)recordLife(carrier,s.day,'delivery',`Доставил ${t.amount} кг зерна/товара в дом ${b.id}`);
   b.lastTrade={day:s.day,good:t.good,quantity:t.amount,from:a.id};
   event(s,'delivery',`Семья ${familyName(s,b)} получила ${Math.round(t.amount)} кг ${t.good==='grain'?'зерна':'древесины'}`,
    t.kind==='loan'?'Получение зерна с обязательством возврата':t.kind==='loan-repayment'?'Возврат ранее полученного зерна':'Физическая доставка',
    [a.id,b.id,t.id],{quantity:t.amount,coin:t.cost});
  }else if(a){
   a[t.good]=round(a[t.good]+t.amount);a.coin+=t.cost;
   if(loan&&t.kind==='loan')loan.status='void';
  }
  s.shipments.splice(i,1);
 }
}
function fosterOrphans(s){
 const adults=s.people.filter(p=>p.alive&&p.age>=18);
 for(const home of s.households){const members=liveMembers(s,home);
 if(!members.length||members.some(p=>p.age>=15))continue;
 const relative=adults.find(p=>p.houseId!==home.id&&members.some(child=>child.parents.includes(p.id)||p.parents.includes(child.id)));
 const foster=relative||adults.filter(p=>p.houseId!==home.id&&dist(p,home)<48).sort((a,b)=>dist(a,home)-dist(b,home))[0];
 if(!foster)continue;const destination=livingHouse(s,foster.houseId);if(!destination)continue;
 relocate(s,members,home,destination);
 event(s,'fostering',`Детей из осиротевшего дома приняли родственники или соседи`,
 'В домохозяйстве не осталось трудоспособных взрослых',[home.id,destination.id,...members.map(p=>p.id)]);
 }
}

function mutualAid(s){
 // Food relief is neither a universal redistribution nor a conjured food source.
 // Neighbours may offer a short ration only after protecting their own seed and
 // food until harvest. Actual cargo, travel time and household labour are required.
 const needy=s.households.filter(h=>liveMembers(s,h).length>0&&h.grain<foodNeed(s,h)*35);
 for(const target of needy){
  if(s.shipments.some(t=>t.kind==='aid'&&t.buyer===target.id))continue;
  const targetPeople=liveMembers(s,target);
  const donors=nearbyHomes(s,target.x,target.y,32).filter(h=>h.id!==target.id&&liveMembers(s,h).length>0);
  donors.sort((a,b)=>{
   const kinA=liveMembers(s,a).some(p=>targetPeople.some(q=>areCloseKin(s,p,q)))?0:1;
   const kinB=liveMembers(s,b).some(p=>targetPeople.some(q=>areCloseKin(s,p,q)))?0:1;
   return kinA-kinB||dist(a,target)-dist(b,target)||a.id-b.id;
  });
  for(const donor of donors){
   const kin=liveMembers(s,donor).some(p=>targetPeople.some(q=>areCloseKin(s,p,q)));
   // Unrelated households give only from a larger real surplus.
   // Historical evidence does not support universal non-kin charity.
   // Unrelated relief is exceptional, and only from markedly secure stores.
   if(!kin&&(target.grain>=foodNeed(s,target)*10||
      donor.grain<foodNeed(s,donor)*480+Math.min(250,donor.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.65)))continue;
   const protectedReserve=foodProtection(s,donor,true)+foodNeed(s,donor)*(kin?0:210);
   const surplus=donor.grain-protectedReserve;
   if(surplus<foodNeed(s,target)*7)continue;
   const worker=liveMembers(s,donor).find(p=>p.age>=15&&p.health>25&&!p.travel&&p.hiredDay!==s.day);
   if(!worker)continue;
   const route=routeBetween(s,donor,target);
   if(route.length<1||route.length>40||!Number.isFinite(route.length))continue;
   const quantity=round(Math.min(80,surplus*.25,foodNeed(s,target)*21-target.grain));
   if(quantity<=0)continue;
   const duration=Math.max(1,Math.ceil(route.length/10));
   donor.grain=round(donor.grain-quantity);earn(s,donor,'aidGiven',quantity);
   const shipment={id:s.nextId++,kind:'aid',good:'grain',amount:quantity,seller:donor.id,buyer:target.id,cost:0,carrierId:worker.id,carrierHouseId:donor.id,haulFee:0,departure:s.day+1,day:s.day+duration+1,route:route.points};
   s.shipments.push(shipment);
   worker.travel={from:{x:donor.x,y:donor.y},to:{x:target.x,y:target.y},points:route.points,start:s.day+1,arrival:s.day+duration+1,end:s.day+duration*2+1};
   worker.job='haul';recordWork(worker,'haul',duration*2);
   s.stats.aid=round((s.stats.aid||0)+quantity);
   event(s,'aid',`Семья ${familyName(s,donor)} передала ${quantity} кг зерна соседям`,
     kin?'Родственная поддержка, добровольная передача настоящих запасов':'Помощь соседям из избытка после сохранения семян и пищи своей семьи',
     [donor.id,target.id],{quantity,kin,donorRemaining:round(donor.grain)});
   break;
  }
 }
}

// Cereal credit is a recorded chattel loan: grain is physically shipped and
// owed in the same unit, with no universal interest or new monetary supply.
// The prospective crop (and sometimes close kin) determines a real lender's risk.
function grainCredit(s){
 s.loans??=[];
 // Enforce existing claims first. Settlement depends on harvest and reserves.
 const doy=s.day%365;
 for(const loan of s.loans){
  if(loan.status!=='active'||loan.owed<=0)continue;
  const borrower=livingHouse(s,loan.borrowerId),lender=livingHouse(s,loan.lenderId);
  if(!borrower||!lender||!liveMembers(s,borrower).length||!liveMembers(s,lender).length){
   loan.status='defaulted';loan.closed=s.day;s.stats.loanDefaults=(s.stats.loanDefaults||0)+1;continue;
  }
  if(s.day>loan.due+365){
   loan.status='defaulted';loan.closed=s.day;s.stats.loanDefaults=(s.stats.loanDefaults||0)+1;
   event(s,'credit-default',`Долг по зерну семьи ${familyName(s,borrower)} не возвращён`,
    'Истёк дополнительный год; обязательство погашено только в бухгалтерском смысле, зерно не появилось',[loan.id,borrower.id,lender.id],{unpaidKg:round(loan.owed)});
   continue;
  }
  if(doy<250||doy>350||s.shipments.some(t=>t.kind==='loan-repayment'&&t.loanId===loan.id))continue;
  const protectedGrain=foodNeed(s,borrower)*245+
   Math.min(250,borrower.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.65);
  const disposable=borrower.grain-protectedGrain;
  if(disposable<10)continue;
  const amount=round(Math.min(loan.owed,120,disposable*.5));
  if(amount<5)continue;
  const worker=liveMembers(s,borrower).find(p=>p.age>=15&&p.health>25&&!p.travel&&p.hiredDay!==s.day);
  if(!worker)continue;
  const route=routeBetween(s,borrower,lender);if(!Number.isFinite(route.length)||route.length>65)continue;
  scheduleGrainCart(s,borrower,lender,worker,amount,'loan-repayment',loan.id,route);
  earn(s,borrower,'loansRepaidKg',amount);
  event(s,'credit-repayment',`Семья ${familyName(s,borrower)} возвращает зерновой долг`,
   'Возврат урожаем после сохранения собственных семян и пищи',[borrower.id,lender.id,loan.id],{amount});
 }
 // Credit complements, but never overrides, real markets or kin help.
 for(const debtor of s.households){
  if(!liveMembers(s,debtor).some(p=>p.age>=15&&p.health>25)||debtor.migration)continue;
  const fields=Math.max(0,debtor.fields.length+(debtor.leaseIn?.length||0)-(debtor.leaseOut?.length||0));
  const seedRequirement=Math.min(165,fields*LAND_HA*CALIBRATION.seedKgPerHa*.60);
  const seedShortage=doy>=40&&doy<=120&&fields>=8&&
    debtor.grain<foodNeed(s,debtor)*60+seedRequirement;
  const hungerShortage=debtor.grain+(debtor.garden||0)+(debtor.dairy||0)<=foodNeed(s,debtor)*27;
  if(!hungerShortage&&!seedShortage)continue;
  if(s.loans.some(l=>l.borrowerId===debtor.id&&(l.status==='active'||l.status==='in-transit')))continue;
  if(s.shipments.some(t=>t.buyer===debtor.id&&t.good==='grain'))continue;
  const people=liveMembers(s,debtor);
  const sources=nearbyHomes(s,debtor.x,debtor.y,28).filter(h=>h.id!==debtor.id&&liveMembers(s,h).length)
   .map(lender=>{
    const kin=liveMembers(s,lender).some(p=>people.some(q=>areCloseKin(s,p,q)));
    // Reserves follow the NEXT harvest date and seed need, not a fixed
    // 345-day hoarding threshold across every season. In autumn the buffer is
    // naturally much greater than just before the harvest.
    const hardReserve=Math.max(foodProtection(s,lender,false),
      foodNeed(s,lender)*260+Math.min(250,lender.fields.length*LAND_HA*CALIBRATION.seedKgPerHa*.65));
    const excess=lender.grain-hardReserve;
    const credible=fields>=15||kin&&fields>=7;
    const route=routeBetween(s,lender,debtor);
    return {lender,kin,excess,credible,route};
   }).filter(x=>x.credible&&x.excess>70&&x.route.length>=1&&x.route.length<=45);
  sources.sort((a,b)=>Number(b.kin)-Number(a.kin)||b.excess-a.excess||a.route.length-b.route.length);
  const choice=sources[0];if(!choice)continue;
  const {lender,route}=choice;
  const worker=liveMembers(s,lender).find(p=>p.age>=15&&p.health>25&&!p.travel&&p.hiredDay!==s.day);
  if(!worker)continue;
  // The crop and current obligations, not merely a debtor's desperation,
  // bound what a creditor could plausibly expect repaid next harvest.
  const outstanding=s.loans.filter(l=>l.borrowerId===debtor.id&&l.status==='active')
   .reduce((n,l)=>n+l.owed,0);
  const repayable=Math.max(0,attainableHarvest(s,debtor)*.32-outstanding);
  const requested=seedShortage?Math.max(foodNeed(s,debtor)*65,seedRequirement+foodNeed(s,debtor)*42-debtor.grain):foodNeed(s,debtor)*65;
  const amount=round(Math.min(95,choice.excess*.22,requested,repayable));
  if(amount<7)continue;
  const delay=(310-doy+365)%365;
  const due=s.day+delay+(delay<55?365:0);
  const loan={id:s.nextId++,lenderId:lender.id,borrowerId:debtor.id,principal:amount,owed:amount,
   created:s.day,due,status:'in-transit',repaid:0,purpose:seedShortage?'seed-and-food':'food'};
  s.loans.push(loan);
  scheduleGrainCart(s,lender,debtor,worker,amount,'loan',loan.id,route);
  s.stats.loanIssuedKg=round((s.stats.loanIssuedKg||0)+amount);
  earn(s,debtor,'loansIssuedKg',amount);
  event(s,'credit',`Семья ${familyName(s,lender)} ссудила зерно семье ${familyName(s,debtor)}`,
   seedShortage?'Посевной и продовольственный зерновой заём под ожидаемый урожай; перевозка настоящих запасов':'Возврат натурой после следующего урожая; зерно требует перевозчика, а кредитор сохраняет свой резерв',
   [lender.id,debtor.id,loan.id],{quantity:amount,due});
 }
}
function scheduleGrainCart(s,from,to,worker,amount,kind,loanId,route){
 const days=Math.max(1,Math.ceil(route.length/10));
 from.grain=round(from.grain-amount);
 const ship={id:s.nextId++,kind,loanId,good:'grain',amount,seller:from.id,buyer:to.id,
  carrierId:worker.id,carrierHouseId:from.id,haulFee:0,cost:0,departure:s.day+1,day:s.day+days+1,
  route:route.points,origin:{x:from.x,y:from.y},destination:{x:to.x,y:to.y}};
 s.shipments.push(ship);
 worker.travel={from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},points:route.points,
  start:s.day+1,arrival:ship.day,end:s.day+days*2+1};
 worker.job='haul';recordWork(worker,'haul',days*2);markRoad(s,route.points);
}

// Temporary paid field work moves the worker's time and coins, never manufactures wages.
function seasonalLaborMarket(s){
 const doy=s.day%365;
 if(doy<65||doy>295||(doy>145&&doy<238))return;
 const jobs=new Map();const shortage=[];
 for(const h of s.households){
  const live=liveMembers(s,h);if(!live.length)continue;
  const workers=live.filter(p=>p.age>=15&&p.health>25&&(!p.travel||p.travel.end<=s.day)&&p.job==='home');
  jobs.set(h.id,workers);
  const affordableInKind=h.grain>foodProtection(s,h)+CALIBRATION.grainDailyWageKg*6;
  const demandForHands=h.fields.length>=9&&workers.length<2&&
   (doy<=145||h.farmYear?.sownArea>h.farmYear?.harvestedArea);
  if(demandForHands&&(h.coin>=CALIBRATION.seasonalWageCoin||affordableInKind))shortage.push(h);
 }
 if(!shortage.length)return;
 const guests=new Map();
 for(const employer of shortage){
  let donor=null,worker=null,best=Infinity;
  for(const candidate of nearbyHomes(s,employer.x,employer.y,16)){
   if(candidate.id===employer.id)continue;
   const available=jobs.get(candidate.id);
   if(!available||available.length<2)continue;
   const walk=walkingSteps(s,candidate,employer);
   if(walk<0||walk>16||workdayFraction(walk)<.28)continue;
   const hungryWorker=candidate.grain<foodNeed(s,candidate)*75;
   const score=walk+(candidate.focus==='farm'?8:0)-(hungryWorker?4:0);
   if(score<best){donor=candidate;worker=available[0];best=score;}
  }
  if(!worker)continue;
  jobs.get(donor.id).shift();
  // An available labourer can be paid in grain if the landowner has genuinely
  // disposable stocks. The worker walks home with the wage after a short shift;
  // no new food, no minting of coins and no invisible distant couriers.
  const payGrain=employer.grain>foodProtection(s,employer)+CALIBRATION.grainDailyWageKg*6&&
    (donor.grain<foodNeed(s,donor)*85||employer.coin<CALIBRATION.seasonalWageCoin);
  const payment=payGrain?CALIBRATION.grainDailyWageKg:CALIBRATION.seasonalWageCoin;
  if(payGrain){
   employer.grain=round(employer.grain-payment);donor.grain=round(donor.grain+payment);
   earn(s,employer,'grainWagesPaidKg',payment);earn(s,donor,'grainWagesEarnedKg',payment);
   s.stats.grainWagesKg=round((s.stats.grainWagesKg||0)+payment);
  }else{
   employer.coin-=payment;donor.coin+=payment;earn(s,employer,'wagesPaid',payment);earn(s,donor,'wagesEarned',payment);
  }
  worker.hiredDay=s.day;worker.hiredX=employer.x;worker.hiredY=employer.y;
  worker.job='hired';worker.x=employer.x;worker.y=employer.y;
  guests.set(employer.id,[worker]);
  if(payGrain&&((s.stats.grainWageEvents||0)<12||doy===90||doy===251)){
   event(s,'grain-wage',`Семья ${familyName(s,donor)} получила зерно за работу`,
    'Однодневный найм поблизости; натуральная оплата из реальных запасов владельца полей',
    [employer.id,donor.id,worker.id],{grainKg:payment,workday:s.day});
  }
  if(payGrain)s.stats.grainWageEvents=(s.stats.grainWageEvents||0)+1;
  if(!payGrain&&(doy===90||doy===251))event(s,'hiring',`Семья ${familyName(s,employer)} наняла работника у соседей`,'Нехватка рабочих рук, денежная оплата и короткое расстояние',[employer.id,donor.id,worker.id],{wage:payment});
 }
 Object.defineProperty(s,'_guests',{value:guests,enumerable:false,configurable:true,writable:true});
}
// Empty buildings cannot preserve fresh dairy indefinitely or keep an
// unattended herd alive indefinitely. Property ownership is not animal care.
function decayAbandonedHoldings(s){
 for(const h of s.households){
  if(liveMembers(s,h).length){h.abandonedDays=0;continue;}
  h.abandonedDays=(h.abandonedDays||0)+1;
  spoilFreshFood(s,h);
  if(h.cattle>0&&h.abandonedDays%28===0){
   h.cattle--;s.stats.cattleDied=(s.stats.cattleDied||0)+1;
   event(s,'cattle-death',`В покинутом хозяйстве погибло животное`,
    'Стадо осталось без живых смотрителей, пастуха и зимних заготовок',[h.id],
    {unattendedDays:h.abandonedDays,cattleLeft:h.cattle});
  }
 }
}
function updateHouse(s,h){
 const members=liveMembers(s,h);if(!members.length)return;
 for(const p of members)if((!p.travel||p.travel.end<=s.day)&&p.hiredDay!==s.day)p.job='home';
 account(s,h);
 spendFood(s,h);
 const adults=activeAdults(s,h).filter(p=>p.hiredDay!==s.day);
 if(s.day%365===1)chooseLivelihood(s,h);
 if(!h.migration)reclaimProject(s,h,adults);
 cropUpdate(s,h,adults,s._guests?.get(h.id)||[]);
  tendGarden(s,h,adults);
  tendCattle(s,h,adults);
 const available=adults.filter(p=>p.job==='home');
 if(available.length)gatherWood(s,h,available);
 planConstruction(s,h,adults);
 maintainStorage(s,h);
 spoilFreshFood(s,h);
 moveHouseResidents(s,h);
}

// A profiler receives aggregated stage durations. Instrumentation has no gameplay side effects.
export function advanceDays(s,days=1,profiler=null){
 const timer=profiler?()=>globalThis.performance?.now?.()??Date.now():null;
 const measure=(stage,fn)=>{if(!timer){fn();return;}const t=timer();fn();profiler[stage]=(profiler[stage]||0)+(timer()-t);};
 for(let d=0;d<days;d++){
  s.day++;
  measure('weatherAndJobs',()=>{localWeather(s);for(const p of s.people)if(p.alive&&(!p.travel||p.travel.end<=s.day))p.job='home';if(s.day%365===1){for(const h of s.households)account(s,h);seasonalLeases(s);for(const c of s.communities){c.recentVolume=c.volume;c.volume=0;}}});
  measure('delivery',()=>{deliver(s);finishMigration(s);});
  // Guest labour is a day-local work assignment, never a persistent workforce.
  // A stale non-serialized map previously duplicated hired labour after day 65
  // and made a loaded 25-year world diverge from its source chronology.
  if(s._guests)delete s._guests;
  measure('seasonalHiring',()=>inRandomScope(s,'hiring',()=>seasonalLaborMarket(s)));
  measure('households',()=>{for(const h of [...s.households])inRandomScope(s,'house:'+h.id,()=>updateHouse(s,h));});
  measure('demography',()=>inRandomScope(s,'demography',()=>{lifeCycle(s);decayAbandonedHoldings(s);}));
  if(s.day%30===0)measure('orphanCare',()=>fosterOrphans(s));
  if(s.day%7===0)measure('marketsAndAid',()=>{inRandomScope(s,'market',()=>market(s));mutualAid(s);grainCredit(s);});
  if(s.day%25===0)measure('forestGrowth',()=>{growForest(s);regrowPasture(s);});
  if(s.day%365===310)evaluateMigration(s);
   if(s.day%365===0)event(s,'year',`Прошёл ${Math.floor(s.day/365)}-й год`,`Календарь`,[],{population:population(s),houses:s.households.length,trades:s.stats.trades});
 }
 return s;
}

export const population=s=>s.people.reduce((n,p)=>n+(p.alive?1:0),0);
export function overview(s){const h=s.households.filter(h=>liveMembers(s,h).length),grain=round(s.households.reduce((a,h)=>a+h.grain,0)+s.shipments.filter(t=>t.good==='grain').reduce((a,t)=>a+t.amount,0)),wood=round(s.households.reduce((a,h)=>a+h.wood,0)+s.shipments.filter(t=>t.good==='wood').reduce((a,t)=>a+t.amount,0));return {population:population(s),households:h.length,grain,wood,scenario:s.scenario||'normal',coin:s.households.reduce((a,h)=>a+h.coin,0)+s.shipments.reduce((a,t)=>a+t.cost,0),trade:s.stats.trades,born:s.stats.born,died:s.stats.died,hungry:h.filter(h=>h.shortage>7).length,year:Math.floor(s.day/365)+1,day:s.day%365+1};}
export function audit(s){
 const o=overview(s),issues=[];
 if(Math.abs(o.coin-s.economy.coinsInitial)>.011)issues.push(`Монеты: ${o.coin} вместо ${s.economy.coinsInitial}`);
 if(Number.isFinite(s.economy.grainInitial)){
  const expected=round(s.economy.grainInitial+s.stats.harvest-s.stats.consumed-(s.stats.spoiled||0));
  if(Math.abs(o.grain-expected)>.051)issues.push(`Нарушено сохранение зерна: ${o.grain} вместо ${expected}`);
 }
 const garden=round(s.households.reduce((n,h)=>n+(h.garden||0),0));
 const expectedGarden=round((s.economy.gardenInitial||0)+(s.stats.gardenProduced||0)-(s.stats.gardenConsumed||0)-(s.stats.gardenSpoiled||0));
 if(Math.abs(garden-expectedGarden)>.051)issues.push(`Баланс огородов: ${garden} вместо ${expectedGarden}`);
 const dairy=round(s.households.reduce((n,h)=>n+(h.dairy||0),0));
 const expectedDairy=round((s.economy.dairyInitial||0)+(s.stats.dairyProduced||0)-(s.stats.dairyConsumed||0)-(s.stats.dairySpoiled||0));
 if(Math.abs(dairy-expectedDairy)>.051)issues.push(`Баланс молока: ${dairy} вместо ${expectedDairy}`);
 if(Number.isFinite(s.economy.woodInitial)){
  const expected=round(s.economy.woodInitial+s.stats.produced-s.stats.harvest-490*s.stats.built-(s.stats.storageWood||0)-(s.stats.landWood||0)-(s.stats.houseWoodReserved||0));
  if(Math.abs(o.wood-expected)>.051)issues.push(`Нарушено сохранение древесины: ${o.wood} вместо ${expected}`);
 }
 if(Number.isFinite(s.economy.forageInitial)&&Array.isArray(s.pasture)){const stock=round(s.pasture.reduce((n,v)=>n+v,0)+s.households.reduce((n,h)=>n+(h.fodder||0),0));const expected=round(s.economy.forageInitial+(s.stats.forageGrown||0)-(s.stats.forageConsumed||0)-(s.stats.forageConverted||0));if(Math.abs(stock-expected)>.35)issues.push(`Нарушен баланс кормов: ${stock} вместо ${expected}`);}
 if(Number.isFinite(s.economy.cattleInitial)){const count=s.households.reduce((n,h)=>n+(h.cattle||0),0);if(count!==s.economy.cattleInitial+(s.stats.cattleBorn||0)-(s.stats.cattleDied||0))issues.push(`Нарушен баланс скота: ${count}`);}
 const owner=new Map(),plots=new Set(),homes=new Set();
 for(const h of s.households){
  for(const good of [...GOODS,'coin','garden','dairy'])if(!Number.isFinite(h[good])||h[good]<-.001)issues.push(`Неверный ресурс ${good} у ${h.id}`);
  const houseCell=idx(h.x,h.y);if(homes.has(houseCell)||s.usage[houseCell]!==1)issues.push(`Неверное положение дома ${h.id}`);homes.add(houseCell);
  if(!Number.isInteger(h.cattle||0)||(h.cattle||0)<0||!Number.isFinite(h.fodder||0)||(h.fodder||0)<-.001)issues.push(`Неверный скот или корм ${h.id}`);
  if(h.storeLevel!==undefined&&(!Number.isInteger(h.storeLevel)||h.storeLevel<0||h.storeLevel>2))issues.push(`Неверный амбар ${h.id}`);
  if(h.storeProject&&(!Number.isInteger(h.storeProject.workDays)||h.storeProject.workDays<0||h.storeProject.workDays>=16))issues.push(`Неверная стройка амбара ${h.id}`);
  if(h.buildProject&&(!Number.isInteger(h.buildProject.days)||h.buildProject.days<0||h.buildProject.days>=50))issues.push(`Неверная постройка дома ${h.id}`);
  if(h.farmYear&&(h.farmYear.sownArea<-.001||h.farmYear.harvestedArea>h.farmYear.sownArea+.002||h.farmYear.seedKg<0))issues.push(`Неверный посев у ${h.id}`);
  for(const field of h.fields){if(!Number.isInteger(field)||field<0||field>=T)issues.push(`Неверный индекс владения: ${field}`);if(plots.has(field)||s.usage[field]!==2)issues.push(`Неверные права на поле ${field}`);plots.add(field);}
  for(const id of h.members){const p=personById(s,id);if(!p||p.houseId!==h.id||owner.has(id))issues.push(`Неверное членство в семье ${id}`);owner.set(id,h.id);}
 }
 if(s.commons&&s.commons.length!==T)issues.push('Повреждённая карта общинных угодий');
 if(s.randomStreams&&Object.values(s.randomStreams).some(n=>!Number.isInteger(n)||n<-2147483648||n>2147483647))issues.push('Повреждённые потоки случайности');
 for(const i of plots)if(s.terrain[i]!==0)issues.push(`Земельные права поверх воды ${i}`);
 for(const t of s.shipments)if(!(t.amount>0&&(t.cost>0||(['aid','loan','loan-repayment'].includes(t.kind)&&t.cost===0))&&t.day>s.day&&(!('carrierId' in t)||owner.has(t.carrierId))))issues.push(`Некорректный груз ${t.id}`);
 for(const loan of s.loans||[]){
  if(!(loan.principal>0&&Number.isFinite(loan.owed)&&loan.owed>=-.01&&loan.owed<=loan.principal+.01&&
   loan.repaid>=0&&loan.repaid<=loan.principal+.01&&loan.due>loan.created&&
   s.households.some(h=>h.id===loan.lenderId)&&s.households.some(h=>h.id===loan.borrowerId)))
   issues.push(`Неверное зерновое обязательство ${loan.id}`);
 }
 for(const p of s.people){
  if(p.randomKey!==undefined&&(!Number.isSafeInteger(p.randomKey)||p.randomKey<0||p.randomKey>4294967295))issues.push(`Неверный ключ биографии ${p.id}`);
  if(!Number.isFinite(p.age)||p.age<0||!Number.isFinite(p.health)||p.health<0||p.health>100)issues.push(`Ошибка состояния жителя ${p.id}`);
  if(!owner.has(p.id))issues.push(`Человек без домохозяйства ${p.id}`);
  if(p.spouse){const partner=personById(s,p.spouse);if(p.alive&&partner?.alive&&(partner.spouse!==p.id||areCloseKin(s,p,partner)))issues.push(`Ошибка родства/брака ${p.id}`);}
  for(const id of p.parents){const parent=personById(s,id);if(!parent||parent.id===p.id)issues.push(`Неверное родство ${p.id}`);}
 }
 return {ok:issues.length===0,issues,...o};
}
export function serialize(s){return JSON.stringify(s);}
export function deserialize(raw){const s=typeof raw==='string'?JSON.parse(raw):raw;if(!s.scenario)s.scenario='normal';s.tuning=normalizeTuning(s.tuning);if(!Array.isArray(s.pasture)){s.pasture=s.terrain.map((t,i)=>t===0&&!s.usage[i]?Math.round(85+hash(s.seed+11,i%SIZE,Math.floor(i/SIZE))*130):0);for(const h of s.households){h.cattle??=0;h.fodder??=0;h.livestockHealth??=85;}s.economy.cattleInitial=s.households.reduce((n,h)=>n+(h.cattle||0),0);s.economy.forageInitial=round(s.pasture.reduce((n,x)=>n+x,0));s.stats.forageGrown??=0;s.stats.forageConsumed??=0;s.stats.forageConverted??=0;s.stats.cattleBorn??=0;s.stats.cattleDied??=0;}s.economy.gardenInitial??=0;s.economy.dairyInitial??=0;s.loans??=[];s.randomStreams??={};delete s._randomScope;for(const p of s.people){p.randomKey??=p.id;p.birthSerial??=s.people.filter(child=>child.parents.includes(p.id)).length;}
 ensureCommons(s);for(const h of s.households){h.garden??=0;h.dairy??=0;h.tenure??='customary';h.tenureOrigin??='legacy-holding';h.leaseIn??=[];h.leaseOut??=[];h.leaseTerms??=[];}if(s.version!==1||s.terrain?.length!==T||!Array.isArray(s.people)||!Array.isArray(s.households)||!Array.isArray(s.shipments))throw Error('Сохранение несовместимо с моделью v0.1');const v=audit(s);if(!v.ok)throw Error(`Повреждённые данные: ${v.issues[0]}`);return s;}
export function getHousehold(s,id){const h=livingHouse(s,id);if(!h)return null;return {...h,people:liveMembers(s,h),name:familyName(s,h),community:s.communities.find(c=>c.id===h.communityId)?.name,soil:round(fieldSoil(s,h)),annualFood:round(annualNeed(s,h)),storageKg:storageCapacity(h,s),tenure:h.tenure||'customary',tenureOrigin:h.tenureOrigin||'legacy-holding',landProject:h.landProject||null,leasedIn:h.leaseIn?.length||0,leasedOut:h.leaseOut?.length||0,commonUse:homeHasCommons(s,h),livestock:{cattle:h.cattle||0,fodderKg:h.fodder||0,health:h.livestockHealth||0},decision:h.decision||null,accounts:h.accounting||null,foodAccess:liveMembers(s,h).length?foodAccess(s,h):null};}