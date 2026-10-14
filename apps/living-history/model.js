// Living History: deterministic, renderer-independent regional society simulation.
export const SIZE = 160;
const T = SIZE * SIZE;
const GOODS = ['grain', 'wood'];
const DAY = 24;
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
function newHousehold(s,c,x,y,wealth=1000,grain=470,wood=130) { const spot=nearestFree(s,x,y);if(!spot)return null;const h={id:s.nextId++,communityId:c.id,x:spot.x,y:spot.y,members:[],grain,wood,coin:wealth,fields:[],sown:0,soilRest:0,needsHouse:false,capacity:5,shortage:0,lastTrade:null,work:'farm',wealthOrigin:'initial',builtDay:s.day,courierUntil:0};s.usage[idx(h.x,h.y)]=1;s.households.push(h);allocFields(s,h,30);return h; }
function terrainAt(s) { s.terrain=new Array(T);s.soil=new Array(T);s.forest=new Array(T);s.stone=new Array(T);s.usage=new Array(T).fill(0);s.traffic=new Array(T).fill(0); for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=idx(x,y), ridge=Math.sin(x*.043+Math.cos(y*.036)*2)+Math.sin(y*.061-x*.021)*.6;const river=Math.abs(x-(SIZE*.47+Math.sin(y*.075)*11+Math.sin(y*.026)*7));const lake= Math.hypot(x-123,y-114)<8;const water=river<2.3||lake;const high=ridge+hash(s.seed,x>>3,y>>3)*.34;const rock=high>1.05; const forest=(hash(s.seed,x>>2,y>>2)*.65+hash(s.seed,x,y)*.25+Math.cos(y*.047)*.12)>.52; s.terrain[i]=water?1:rock?2:0;s.soil[i]=water?0:clamp(Math.round(73+hash(s.seed+3,x>>2,y>>2)*25-high*18),27,99);s.forest[i]=!water&&!rock&&forest?Math.round(150+hash(s.seed+9,x,y)*270):0;s.stone[i]=rock?Math.round(600+hash(s.seed+4,x,y)*550):0; } }
export function createWorld(seed=43821){const s={version:1,seed:seed>>>0,rng:seed|0,day:0,nextId:1,terrain:[],soil:[],forest:[],stone:[],usage:[],traffic:[],communities:[],households:[],people:[],shipments:[],events:[],stats:{born:0,died:0,trades:0,built:0,delivered:0,produced:0,consumed:0,harvest:0},economy:{coinsInitial:0},weather:1}; terrainAt(s);const settlements=[{x:37,y:43,name:'Ольховая долина'},{x:112,y:40,name:'Каменный брод'},{x:40,y:120,name:'Тихая низина'},{x:111,y:119,name:'Сосновый мыс'}];for(const pt of settlements){const c={id:s.nextId++,name:pt.name,x:pt.x,y:pt.y,prices:{grain:1.1,wood:2.8},volume:0};s.communities.push(c);for(let k=0;k<9;k++){const h=newHousehold(s,c,c.x+(rand(s)-.5)*19,c.y+(rand(s)-.5)*18,Math.round(850+rand(s)*1400),Math.round(950+rand(s)*330),Math.round(90+rand(s)*100));if(!h)continue;const father=createPerson(s,h,19+Math.floor(rand(s)*24),'m');const mother=createPerson(s,h,18+Math.floor(rand(s)*24),'f');father.spouse=mother.id;mother.spouse=father.id;for(let j=0,n=Math.floor(rand(s)*3);j<n;j++){const eldest=Math.max(0,Math.floor(Math.min(father.age,mother.age)-17));if(eldest>0)createPerson(s,h,Math.floor(rand(s)*Math.min(15,eldest+1)),rand(s)<.5?'m':'f',[father.id,mother.id]);}}}
 s.economy.coinsInitial=s.households.reduce((a,h)=>a+h.coin,0);s.economy.grainInitial=round(s.households.reduce((a,h)=>a+h.grain,0));s.economy.woodInitial=round(s.households.reduce((a,h)=>a+h.wood,0));event(s,'foundation','В долине образовались четыре независимые общины','Первоначальное расселение',s.communities.map(c=>c.id));return s; }
function personById(s,id){
 if(!s._peopleIndex){Object.defineProperty(s,'_peopleIndex',{value:new Map(),enumerable:false,writable:true,configurable:true});}
 if(s._peopleIndex.size!==s.people.length){s._peopleIndex.clear();for(const p of s.people)s._peopleIndex.set(p.id,p);}
 return s._peopleIndex.get(id);
}
const liveMembers=(s,h)=>h.members.map(id=>personById(s,id)).filter(p=>p?.alive);
const activeAdults=(s,h)=>liveMembers(s,h).filter(p=>p.age>=15&&p.health>25&&(!p.travel||p.travel.end<=s.day));
const foodNeed=(s,h)=>liveMembers(s,h).reduce((v,p)=>v+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
function localWeather(s) { const v=Math.sin(s.day*.0027+Math.sin(s.seed)*3)*.18+(rand(s)-.5)*.09;s.weather=clamp(1+v,.66,1.27); }
function spendFood(s,h){let need=foodNeed(s,h);let eaten=Math.min(need,h.grain);h.grain=round(h.grain-eaten);if(h.grain>1100){const lost=round((h.grain-1100)*.0009);h.grain=round(h.grain-lost);s.stats.spoiled=round((s.stats.spoiled||0)+lost);}s.stats.consumed=round(s.stats.consumed+eaten);const hungry=need>0?1-eaten/need:0;for(const p of liveMembers(s,h)){p.foodDebt=clamp(p.foodDebt+hungry*.9-(hungry<.01?.1:0),0,100);if(p.health>0)p.health=clamp(p.health-(hungry*.9+p.foodDebt*.009)+(!hungry?.036:0),0,100);}h.shortage=hungry>.12?h.shortage+1:Math.max(0,h.shortage-1); if(h.shortage===22)event(s,'crisis',`У семьи ${familyName(s,h)} закончились запасы`,`Ежедневное потребление превысило доходы`,[h.id],{need:round(need),grain:h.grain});}
function familyName(s,h){const p=personById(s,h.members[0]);return p?p.name:'Неизвестная';}
function recordWork(p,kind,days=1){
 p.workDays ??={farm:0,wood:0,haul:0,build:0};
 p.workDays[kind]=(p.workDays[kind]||0)+days;
}
function recordLife(p,day,type,text){p.lifeLog??=[];p.lifeLog.push({day,type,text});if(p.lifeLog.length>240)p.lifeLog.splice(1,p.lifeLog.length-240);}
function seasonalWork(s,h,adults){
 const doy=s.day%365,fields=h.fields.length,area=fields*.0625;
 if(!adults.length||!fields)return;
 const sowing=doy>=73&&doy<=134&&h.sown===0&&h.grain>=area*140;
 const harvesting=doy===260&&h.sown>0;
 const tending=doy>=137&&doy<=249&&doy%11===0&&h.sown>0;
 if(!sowing&&!harvesting&&!tending)return;
 // Farm activities occupy people's day: the same worker cannot harvest and chop wood simultaneously.
 for(const p of adults){p.job='farm';p.skill.farm=roundSkill(p.skill.farm+.004*p.aptitude);recordWork(p,'farm');}
 if(sowing){const seed=round(area*140);h.grain=round(h.grain-seed);s.stats.consumed=round(s.stats.consumed+seed);h.sown=seed;
 event(s,'sowing',`Семья ${familyName(s,h)} засеяла ${fields} участков`,'Весенняя посевная и наличие семян',[h.id],{seedKg:seed,areaHa:area});}
 if(harvesting){const avgSoil=h.fields.reduce((a,i)=>a+s.soil[i],0)/fields;
 const mastery=adults.reduce((sum,p)=>sum+p.skill.farm,0)/adults.length;
 const laborFactor=clamp(adults.length/(Math.max(.7,area*.75)),.45,1.1);
 const yieldKg=round(area*800*avgSoil/85*s.weather*laborFactor*(1+Math.min(.48,mastery*.12)));
 h.grain=round(h.grain+yieldKg);s.stats.produced=round(s.stats.produced+yieldKg);s.stats.harvest=round(s.stats.harvest+yieldKg);h.sown=0;
 for(const i of h.fields)s.soil[i]=Math.max(36,s.soil[i]-1.7);
 event(s,'harvest',`Семья ${familyName(s,h)} собрала ${Math.round(yieldKg)} кг зерна`,'Урожай определяется почвой, погодой, рабочими руками и навыком',[h.id,...adults.map(p=>p.id)],{yieldKg,soil:round(avgSoil),skill:round(mastery)});
 for(const p of adults)recordLife(p,s.day,'harvest',`Собрал урожай на семейной земле (${yieldKg} кг всей семьёй)`);
 }
 if(doy===310)for(const i of h.fields)s.soil[i]=Math.min(98,s.soil[i]+1.4);
}
function gatherWood(s,h,adults){
 const need=h.wood<120||(h.needsHouse&&h.wood<490);if(!need||!adults.length||(h.nextWoodSearch||0)>s.day)return;
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
function planConstruction(s,h,adults){
 const members=liveMembers(s,h);h.needsHouse=members.length>=h.capacity;
 if(!h.needsHouse||!adults.length)return;
 const movers=availableMovers(s,h);if(!movers)return;
 const c=s.communities.find(c=>c.id===h.communityId);
 let newHome=findVacancy(s,c);
 if(newHome){relocate(s,movers,h,newHome);event(s,'resettlement',`${familyName(s,h)} заселила пустующий дом`,'Перенаселённость, семейные связи и доступное жильё',[h.id,newHome.id,...movers.map(p=>p.id)]);h.needsHouse=liveMembers(s,h).length>h.capacity;return;}
 if(h.wood<490||h.coin<85||(h.nextBuildAttempt||0)>s.day)return;
 const builders=adults.filter(p=>p.job==='home');if(!builders.length)return;
 newHome=newHousehold(s,c,h.x+3,h.y+3,0,0,0);if(!newHome){h.nextBuildAttempt=s.day+45;return;}h.nextBuildAttempt=0;
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
   p.job='haul';p.x=round(origin.x+(dest.x-origin.x)*ratio);p.y=round(origin.y+(dest.y-origin.y)*ratio);
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
 return h.wood<120?Math.ceil(120-h.wood):0;
}
function supply(s,h,good){const living=liveMembers(s,h);if(!living.length)return 0;
 if(good==='grain')return Math.max(0,Math.floor(h.grain-foodNeed(s,h)*420));
 return Math.max(0,Math.floor(h.wood-230));
}
function market(s){
 for(const c of s.communities){
  const nearby=s.households.filter(h=>dist(h,c)<68&&liveMembers(s,h).length>0);
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
    const carrier=liveMembers(s,seller).find(p=>p.age>=15&&p.health>25&&p.job==='home'&&!p.travel);
    if(!carrier)continue;
    const distance=dist(seller,buyer),haulPrice=1+distance*.004;
    const price=round(c.prices[good]*haulPrice*(.97+rand(s)*.06));
    const quantity=Math.min(160,supply(s,seller,good),demand(s,buyer,good),Math.floor(buyer.coin/Math.max(.1,price)));
    if(quantity<5)continue;
    const cost=Math.ceil(quantity*price);if(cost>buyer.coin)continue;
    seller[good]=round(seller[good]-quantity);buyer.coin-=cost;
    const duration=Math.max(1,Math.ceil(distance/12));
    const shipment={id:s.nextId++,good,amount:quantity,seller:seller.id,buyer:buyer.id,cost,
       carrierId:carrier.id,departure:s.day,day:s.day+duration,origin:{x:seller.x,y:seller.y},destination:{x:buyer.x,y:buyer.y},
       reason:`У покупателя дефицит, у продавца избыток; ставка зависит от местного рынка`};
    s.shipments.push(shipment);
    carrier.travel={from:{x:seller.x,y:seller.y},to:{x:buyer.x,y:buyer.y},start:s.day,arrival:s.day+duration,end:s.day+duration*2};
    carrier.job='haul';recordWork(carrier,'haul',duration*2);
    recordLife(carrier,s.day,'haul',`Повёз ${quantity} кг товара из дома ${seller.id} в дом ${buyer.id}`);
    event(s,'trade',`${familyName(s,seller)} отправляет ${Math.round(quantity)} кг ${good==='grain'?'зерна':'древесины'} семье ${familyName(s,buyer)}`,
       'Спрос и предложение на локальном рынке; труд перевозчика',[seller.id,buyer.id,shipment.id,carrier.id],{quantity,price,cost,travelDays:duration});
    traded++;c.volume+=quantity;s.stats.trades++;markRoad(s,seller,buyer);
   }
  }
 }
}
function markRoad(s,a,b){let x=Math.round(a.x),y=Math.round(a.y),steps=Math.ceil(dist(a,b)*2);for(let k=0;k<=steps;k++){const f=k/Math.max(1,steps);const nx=clamp(Math.round(x+(b.x-x)*f),0,SIZE-1),ny=clamp(Math.round(y+(b.y-y)*f),0,SIZE-1);const i=idx(nx,ny);if(s.terrain[i]!==1)s.traffic[i]=Math.min(255,s.traffic[i]+2);}}
function deliver(s){for(let i=s.shipments.length-1;i>=0;i--){const t=s.shipments[i];if(t.day>s.day)continue;const a=s.households.find(h=>h.id===t.seller),b=s.households.find(h=>h.id===t.buyer);if(a&&b){b[t.good]=round(b[t.good]+t.amount);a.coin+=t.cost;s.stats.delivered++;const carrier=personById(s,t.carrierId);if(carrier)recordLife(carrier,s.day,'delivery',`Доставил ${t.amount} кг товара в дом ${b.id}`);b.lastTrade={day:s.day,good:t.good,quantity:t.amount,from:a.id};event(s,'delivery',`${familyName(s,b)} получила ${Math.round(t.amount)} кг ${t.good==='grain'?'зерна':'древесины'}`,'Физическая доставка ранее заключённой сделки',[a.id,b.id,t.id],{quantity:t.amount,coin:t.cost});}else if(a){a[t.good]=round(a[t.good]+t.amount);a.coin+=t.cost;}s.shipments.splice(i,1);}}
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
function updateHouse(s,h){const members=liveMembers(s,h);if(!members.length)return;for(const p of members)if(!p.travel||p.travel.end<=s.day)p.job='home';spendFood(s,h);const adults=activeAdults(s,h);if(s.day%365>=310&&s.day%365<=335&&s.day%5===0&&h.fields.length<72&&h.grain<foodNeed(s,h)*550&&(h.nextFieldAttempt||0)<=s.day){const n=allocFields(s,h,6);if(n===0)h.nextFieldAttempt=s.day+365;}seasonalWork(s,h,adults);gatherWood(s,h,adults.filter(p=>p.job==='home'));planConstruction(s,h,adults);moveHouseResidents(s,h);}
export function advanceDays(s,days=1){for(let d=0;d<days;d++){s.day++;localWeather(s);deliver(s);for(const h of [...s.households])updateHouse(s,h);lifeCycle(s);if(s.day%30===0)fosterOrphans(s);if(s.day%7===0){market(s);mutualAid(s);}if(s.day%25===0)growForest(s);if(s.day%365===310)for(const h of s.households)for(const i of h.fields)s.soil[i]=Math.min(98,s.soil[i]+1.4);if(s.day%365===0){event(s,'year',`Прошёл ${Math.floor(s.day/365)}-й год`,`Календарь`,[],{population:population(s),houses:s.households.length,trades:s.stats.trades});} }return s;}
export const population=s=>s.people.reduce((n,p)=>n+(p.alive?1:0),0);
export function overview(s){const h=s.households.filter(h=>liveMembers(s,h).length),grain=round(s.households.reduce((a,h)=>a+h.grain,0)+s.shipments.filter(t=>t.good==='grain').reduce((a,t)=>a+t.amount,0)),wood=round(s.households.reduce((a,h)=>a+h.wood,0)+s.shipments.filter(t=>t.good==='wood').reduce((a,t)=>a+t.amount,0));return {population:population(s),households:h.length,grain,wood,coin:s.households.reduce((a,h)=>a+h.coin,0)+s.shipments.reduce((a,t)=>a+t.cost,0),trade:s.stats.trades,born:s.stats.born,died:s.stats.died,hungry:h.filter(h=>h.shortage>7).length,year:Math.floor(s.day/365)+1,day:s.day%365+1};}
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
export function deserialize(raw){const s=typeof raw==='string'?JSON.parse(raw):raw;if(s.version!==1||s.terrain?.length!==T||!Array.isArray(s.people)||!Array.isArray(s.households)||!Array.isArray(s.shipments))throw Error('Сохранение несовместимо с моделью v0.1');const v=audit(s);if(!v.ok)throw Error(`Повреждённые данные: ${v.issues[0]}`);return s;}
export function getHousehold(s,id){const h=s.households.find(h=>h.id===id);if(!h)return null;return {...h,people:liveMembers(s,h),name:familyName(s,h),community:s.communities.find(c=>c.id===h.communityId)?.name};}