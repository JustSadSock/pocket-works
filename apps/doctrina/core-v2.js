// DOCTRINA II — deterministic, UI-independent late-medieval statecraft.
export const PROVINCES = [
 {id:'march',name:'Северная марка',short:'МАРКА',x:134,y:76,path:'M60 24 L157 17 191 54 166 112 95 126 39 85 Z',kind:'Пограничье',resource:'лес'},
 {id:'ford',name:'Старый Брод',short:'БРОД',x:249,y:105,path:'M157 17 L275 28 309 75 288 153 219 162 166 112 191 54 Z',kind:'Речной край',resource:'зерно'},
 {id:'valley',name:'Зелёная долина',short:'ДОЛИНА',x:84,y:180,path:'M39 85 L95 126 166 112 180 195 139 264 52 244 22 168 Z',kind:'Пашни',resource:'зерно'},
 {id:'capital',name:'Белый Град',short:'СТОЛИЦА',x:221,y:214,path:'M166 112 L219 162 288 153 316 209 265 274 185 285 139 264 180 195 Z',kind:'Стольный округ',resource:'ремесло'},
 {id:'coast',name:'Соляной берег',short:'БЕРЕГ',x:329,y:193,path:'M275 28 L346 48 372 133 354 241 316 209 288 153 309 75 Z',kind:'Порты',resource:'соль'},
 {id:'moor',name:'Серые пустоши',short:'ПУСТОШИ',x:118,y:325,path:'M52 244 L139 264 185 285 212 367 131 394 48 349 28 289 Z',kind:'Высокогорье',resource:'руда'},
 {id:'south',name:'Южные земли',short:'ЮЖНЫЙ КРАЙ',x:279,y:327,path:'M185 285 L265 274 316 209 354 241 332 349 268 402 212 367 Z',kind:'Виноградники',resource:'торговля'}
];
export const FACTIONS = [
 {id:'nobles',name:'Знать',sign:'✣',aim:'Привилегии и поместья'},
 {id:'guilds',name:'Гильдии',sign:'◇',aim:'Свободная торговля'},
 {id:'clergy',name:'Духовенство',sign:'✝',aim:'Церковная автономия'},
 {id:'commons',name:'Общины',sign:'✦',aim:'Хлеб и справедливость'},
 {id:'captains',name:'Капитаны',sign:'⚔',aim:'Жалование и безопасность'}
];
export const EDICTS = [
 {id:'levy',name:'Взыскать подать',tag:'+18 казна',detail:'Взять внеочередную подать. Повышает недовольство и раздражает общины.',cost:0},
 {id:'granary',name:'Открыть амбары',tag:'−14 зерна',detail:'Накормить жителей и снять недовольство. Казна получает меньше налогов.',cost:0},
 {id:'fair',name:'Учредить ярмарку',tag:'−14 казна',detail:'Поднять благосостояние края и поддержку гильдий.',cost:14},
 {id:'watch',name:'Поднять ополчение',tag:'−12 казна',detail:'Укрепить рубежи и пополнить войско, но потревожить население.',cost:12},
 {id:'court',name:'Выслушать тяжбы',tag:'−8 казна',detail:'Усилить верность жителей и законность престола.',cost:8}
];
export const LAWS = [
 {id:'charter',name:'Хартия городов',desc:'Города платят больше, но обретают право собирать советы.',cost:24,requires:[],effects:'Доход +4, гильдии +13, знать −10'},
 {id:'tithe',name:'Десятина храмов',desc:'Храмы собирают хлеб и поддерживают власть в голодные годы.',cost:17,requires:[],effects:'Зерно +5 за сезон, духовенство +15'},
 {id:'levies',name:'Воинская повинность',desc:'Общины выставляют ополчение вместо части денежных податей.',cost:21,requires:[],effects:'Войско +12, содержание −2, общины −10'},
 {id:'royal',name:'Королевские суды',desc:'Местные бароны лишаются права вершить последнюю волю суда.',cost:26,requires:[],effects:'Верность земель +8, знать −16, законность +8'},
 {id:'roads',name:'Каменные тракты',desc:'Торговые пути связывают самые далёкие земли.',cost:32,requires:['charter'],effects:'Доход +7, торговля +2 за сезон'},
 {id:'estates',name:'Великий совет',desc:'Сословия получают голос в решениях государя.',cost:28,requires:['royal'],effects:'Законность +15, поддержка сословий +6'}
];
export const TECHNOLOGIES = [
 {id:'survey',name:'Землемерные книги',desc:'Единый учёт поместий и крестьянских наделов.',cost:19,requires:[],effect:'Доход +3 за сезон'},
 {id:'mills',name:'Водяные мельницы',desc:'Мельничные плотины снабжают хлебом бедные земли.',cost:23,requires:[],effect:'Зерно +4 за сезон'},
 {id:'messengers',name:'Почтовые тракты',desc:'Гонцы доставляют грамоты за пределы державы.',cost:20,requires:['survey'],effect:'Посольства эффективнее'},
 {id:'foundries',name:'Оружейные кузни',desc:'Кузнецы снабжают дружину железом, а крепости стрелами.',cost:27,requires:['mills'],effect:'Оборона +10, войско +4'},
 {id:'heraldry',name:'Государственная печать',desc:'Общий герб укрепляет права верховной власти.',cost:18,requires:['messengers'],effect:'Законность +8, влияние знати +4'},
 {id:'tradecraft',name:'Двойная запись',desc:'Купеческие счетоводы предотвращают утечку торговых пошлин.',cost:26,requires:['survey'],effect:'Доход +4 за сезон'}
];
export const DIPLOMACY = [
 {id:'west',name:'Западная марка',motto:'Герцогство Эшмар',base:-18},
 {id:'east',name:'Восточная корона',motto:'Королевство Веден',base:8},
 {id:'sea',name:'Лига городов',motto:'Союз свободных портов',base:22}
];
export const PETITIONS = [
 {title:'Голодная улица',body:'Пекари требуют казённых запасов. Стража сообщает о толпе у хлебных рядов.',
  a:{name:'Открыть житницы',grain:-15,legitimacy:7,commons:10},b:{name:'Разогнать толпу',legitimacy:-9,commons:-14,army:3}},
 {title:'Старая привилегия',body:'Сеньоры требуют вернуть древнее право собирать судебные пошлины.',
  a:{name:'Подтвердить грамоту',legitimacy:-3,nobles:15,treasury:-8},b:{name:'Отказать баронам',legitimacy:5,nobles:-17,authority:3}},
 {title:'Хартия купцов',body:'Гильдии обещают монеты в обмен на свободу торговли без городских застав.',
  a:{name:'Подписать договор',treasury:15,guilds:14,nobles:-8},b:{name:'Оставить заставы',treasury:8,guilds:-12}},
 {title:'Безмолвные колокола',body:'Епископ обвиняет придворных в попрании обычая и просит публичного суда.',
  a:{name:'Учредить слушания',clergy:13,legitimacy:5,treasury:-9},b:{name:'Защитить двор',clergy:-16,authority:5}},
 {title:'Разбойники на трактах',body:'Караванные мастера требуют вооружённого сопровождения через северные леса.',
  a:{name:'Отправить сотню',treasury:-12,army:-3,guilds:10,legitimacy:6},b:{name:'Пусть платят сами',guilds:-13,treasury:6}},
 {title:'Спор о земле',body:'Крестьяне требуют вернуть пастбище, которое недавно присвоил соседний сеньор.',
  a:{name:'Вернуть пастбище',commons:13,nobles:-11,legitimacy:5},b:{name:'Встать за сеньора',nobles:11,commons:-11,treasury:7}}
];
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
const nameOf=s=>s.realm==='crown'?'Королевство Арден':s.realm==='league'?'Союз Семи Градов':'Священная марка';
export const governmentName=nameOf;
function roll(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
function pick(s,list){return list[Math.floor(roll(s)*list.length)];}
export function newGame(realm='crown',seed=Date.now()){
 const n=(Number(seed)>>>0)||16731;
 const s={version:2,realm,seed:n,rng:n,turn:1,limit:24,ap:2,treasury:64,grain:65,army:32,
 legitimacy:65,authority:60,stability:66,lawfulness:42,trade:1,laws:[],technologies:[],
 factions:{nobles:58,guilds:52,clergy:57,commons:54,captains:57},
 provinces:PROVINCES.map((p,i)=>({id:p.id,unrest:12+(i*9)%19,loyalty:55+(i*11)%22,wealth:38+(i*15)%27,fort:i===0||i===4?2:0})),
 diplomacy:{west:-18,east:8,sea:22},peace:0,raid:null,petition:null,log:[],phase:'play',summary:'',
 actions:[],flags:{sound:true}};
 if(realm==='league'){s.treasury+=28;s.trade=3;s.factions.guilds+=14;s.factions.nobles-=10;s.authority-=10;}
 if(realm==='abbey'){s.grain+=24;s.legitimacy+=8;s.factions.clergy+=15;s.army-=9;}
 note(s,'Учреждён ' + nameOf(s)+'. Семь земель приносят присягу.', 'found');
 return s;
}
export function validState(s){return Boolean(s&&s.version===2&&Array.isArray(s.provinces)&&s.provinces.length===7&&s.factions&&s.diplomacy&&Array.isArray(s.log));}
function note(s,body,type='info'){s.log.unshift({turn:s.turn,text:body,type});s.log=s.log.slice(0,100);}
function normalize(s){
 s.treasury=Math.max(0,Math.round(s.treasury));s.grain=Math.max(0,Math.round(s.grain));
 s.army=clamp(Math.round(s.army),0,140);
 s.legitimacy=clamp(Math.round(s.legitimacy));s.authority=clamp(Math.round(s.authority));
 for(const f of FACTIONS)s.factions[f.id]=clamp(Math.round(s.factions[f.id]));
 for(const p of s.provinces){p.unrest=clamp(Math.round(p.unrest));p.loyalty=clamp(Math.round(p.loyalty));p.wealth=clamp(Math.round(p.wealth));p.fort=clamp(Math.round(p.fort),0,5);}
 for(const d of DIPLOMACY)s.diplomacy[d.id]=clamp(Math.round(s.diplomacy[d.id]),-100,100);
 s.stability=clamp(Math.round(100-s.provinces.reduce((a,p)=>a+p.unrest,0)/7*.68-(100-s.legitimacy)*.32));
}
function done(s,condition){
 s.phase='finished';s.summary=condition;
 note(s,condition,'major');return condition;
}
function spend(s,cost=0){
 if(s.phase!=='play')return 'Летопись этого правления окончена';
 if(s.petition)return 'Сперва ответьте на прошение';
 if(s.ap<1)return 'Все печати этого сезона уже поставлены';
 if(s.treasury<cost)return 'В казне недостаточно серебра';
 return '';
}
export function enactEdict(s,provinceId,edictId){
 const d=EDICTS.find(x=>x.id===edictId),p=s.provinces.find(x=>x.id===provinceId);
 if(!d||!p)return {ok:false,message:'Неизвестная земля или указ'};
 const err=spend(s,d.cost);if(err)return {ok:false,message:err};
 if(d.id==='watch'&&p.fort>=5)return {ok:false,message:'Крепость уже укреплена до предела'};
 if(d.id==='granary'&&s.grain<14)return {ok:false,message:'Амбары почти пусты — не хватает 14 зерна'};
 s.ap--;s.treasury-=d.cost;
 if(d.id==='levy'){s.treasury+=18;p.unrest+=17;p.loyalty-=8;s.factions.commons-=5;}
 if(d.id==='granary'){s.grain-=14;p.unrest-=23;p.loyalty+=12;s.factions.commons+=5;}
 if(d.id==='fair'){p.wealth+=15;p.loyalty+=4;s.factions.guilds+=7;s.trade=clamp(s.trade+1,0,9);}
 if(d.id==='watch'){p.fort+=1;s.army+=7;p.unrest+=6;s.factions.captains+=4;}
 if(d.id==='court'){p.unrest-=11;p.loyalty+=13;s.legitimacy+=4;s.factions.nobles-=3;}
 normalize(s);
 const msg=d.name+' — '+PROVINCES.find(x=>x.id===p.id).name+'.';
 note(s,msg,d.id==='levy'?'warn':'info');return {ok:true,message:msg};
}
export function enactLaw(s,id){
 const law=LAWS.find(x=>x.id===id);if(!law)return {ok:false,message:'Такого закона нет'};
 if(s.laws.includes(id))return {ok:false,message:'Грамота уже утверждена'};
 if(law.requires.some(k=>!s.laws.includes(k)))return {ok:false,message:'Требуется предварительная грамота'};
 const err=spend(s,law.cost);if(err)return {ok:false,message:err};
 s.ap--;s.treasury-=law.cost;s.laws.push(id);
 if(id==='charter'){s.factions.guilds+=13;s.factions.nobles-=10;}
 if(id==='tithe'){s.factions.clergy+=15;s.legitimacy+=5;}
 if(id==='levies'){s.army+=12;s.factions.commons-=10;}
 if(id==='royal'){s.provinces.forEach(p=>p.loyalty+=8);s.factions.nobles-=16;s.lawfulness+=8;}
 if(id==='roads'){s.trade+=2;s.factions.guilds+=8;}
 if(id==='estates'){s.legitimacy+=15;for(const f of FACTIONS)s.factions[f.id]+=6;s.authority-=8;}
 normalize(s);
 const msg='В государственный свод внесён закон «'+law.name+'».';
 note(s,msg);return {ok:true,message:msg};
}
export function research(s,id){
 const tech=TECHNOLOGIES.find(t=>t.id===id);
 if(!tech)return {ok:false,message:'Неизвестное открытие'};
 s.technologies ||= [];
 if(s.technologies.includes(id))return {ok:false,message:'Это знание уже изучено'};
 const prerequisite=tech.requires.find(t=>!s.technologies.includes(t));
 if(prerequisite)return {ok:false,message:'Сначала необходимо открытие «'+TECHNOLOGIES.find(t=>t.id===prerequisite).name+'»'};
 const err=spend(s,tech.cost);if(err)return {ok:false,message:err};
 s.ap--;s.treasury-=tech.cost;s.technologies.push(id);
 if(id==='foundries')s.army+=4;
 if(id==='heraldry'){s.legitimacy+=8;s.factions.nobles+=4;}
 normalize(s);
 const msg='Мастера державы освоили: «'+tech.name+'».';
 note(s,msg);return {ok:true,message:msg};
}
export function foreignAction(s,id,type){
 if(!DIPLOMACY.find(d=>d.id===id))return {ok:false,message:'Неизвестный сосед'};
 if(!['envoy','tribute','threat'].includes(type))return {ok:false,message:'Неизвестное действие'};
 const cost=type==='tribute'?18:type==='envoy'?8:0;
 const err=spend(s,cost);if(err)return {ok:false,message:err};
 if(type==='threat'&&s.army<15)return {ok:false,message:'Угроза без войска неубедительна'};
 s.ap--;s.treasury-=cost;
 const delta=type==='envoy'?12:type==='tribute'?25:-27;
 s.diplomacy[id]+=delta+(type==='envoy'&&s.technologies?.includes('messengers')?6:0);
 if(type==='envoy')s.legitimacy+=2;
 if(type==='threat'){s.authority+=5;s.factions.captains+=6;}
 normalize(s);
 const msg=(type==='envoy'?'Посольство направлено: ':type==='tribute'?'Дары отправлены: ':'Ультиматум доставлен: ')+DIPLOMACY.find(d=>d.id===id).name+'.';
 note(s,msg,type==='threat'?'warn':'info');return {ok:true,message:msg};
}
export function choosePetition(s,index){
 if(!s.petition||s.phase!=='play')return {ok:false,message:'Нет прошения'};
 if(index!==0&&index!==1)return {ok:false,message:'Неверный ответ'};
 const e=PETITIONS[s.petition.id],choice=index===0?e.a:e.b;
 for(const [key,value] of Object.entries(choice)){
   if(Object.prototype.hasOwnProperty.call(s.factions,key))s.factions[key]+=value;
   else if(typeof s[key]==='number')s[key]+=value;
 }
 const title=e.title;s.petition=null;normalize(s);
 const msg=title+': '+choice.name+'.';note(s,msg,index===1?'warn':'info');return {ok:true,message:msg};
}
function season(s){
 const income=7+Math.round(s.provinces.reduce((n,p)=>n+p.wealth*(p.loyalty/100),0)/48)+(s.laws.includes('charter')?4:0)+(s.laws.includes('roads')?7:0)+(s.technologies?.includes('survey')?3:0)+(s.technologies?.includes('tradecraft')?4:0)+s.trade;
 const grainIncome=8+s.provinces.filter(p=>['valley','ford','south'].includes(p.id)).reduce((n,p)=>n+Math.round((100-p.unrest)/24),0)+(s.laws.includes('tithe')?5:0)+(s.technologies?.includes('mills')?4:0);
 const upkeep=7+Math.ceil(s.army/12)-(s.laws.includes('levies')?2:0);
 const consumption=15+Math.ceil(s.army/16);
 s.treasury+=income-upkeep;s.grain+=grainIncome-consumption;
 s.lastEconomy={income,upkeep,grainIncome,consumption};
 if(s.grain<10){s.legitimacy-=8;s.provinces.forEach(p=>p.unrest+=9);note(s,'Хлеба не хватает. На рынках растёт недовольство.','warn');}
 if(s.treasury<7){s.army-=5;s.factions.captains-=6;note(s,'Опустевшая казна задерживает жалование дружине.','warn');}
 for(const p of s.provinces){
   p.unrest+=(p.loyalty<45?3:0)+(s.factions.commons<32?4:0)+(s.grain<15?4:0)-Math.floor(p.loyalty/32);
   p.loyalty+=(p.unrest>62?-4:0)+(p.unrest<18?1:0);
   if(s.laws.includes('royal'))p.unrest-=1;
   if(s.laws.includes('roads'))p.wealth+=1;
 }
 if(s.factions.nobles<28){s.authority-=4;s.provinces[0].loyalty-=3;}
 if(s.factions.clergy<25)s.legitimacy-=5;
 if(s.factions.commons>70)s.legitimacy+=2;
 if(s.factions.captains<25)s.army-=3;
 s.factions.nobles+=s.laws.includes('estates')?2:0;
}
function borders(s){
 if(s.raid){
  const p=s.provinces.find(x=>x.id===s.raid.target);
  const defense=s.army*.38+(p?.fort||0)*13+s.authority*.07+(s.technologies?.includes('foundries')?10:0);
  const attack=s.raid.strength;
  if(defense>=attack){s.army-=Math.ceil(attack/7);s.legitimacy+=8;s.diplomacy[s.raid.enemy]+=9;
   note(s,'Набег отражён у '+PROVINCES.find(x=>x.id===s.raid.target).name+'.','major');}
  else{const loss=Math.ceil((attack-defense)/5);s.army-=loss;p.unrest+=25;p.loyalty-=20;s.treasury-=Math.round(loss*2.5);s.legitimacy-=7;
   note(s,'Пограничье разорено. Дружина отступила перед превосходящим врагом.','warn');}
  s.raid=null;
 }
 for(const neighbor of DIPLOMACY){
  if(s.diplomacy[neighbor.id]<-55 && roll(s)<.34){
   const target=neighbor.id==='west'?'march':neighbor.id==='sea'?'coast':'south';
   s.raid={enemy:neighbor.id,target,strength:26+Math.floor(roll(s)*32)+Math.floor(s.turn/4)};
   note(s,'Разведчики сообщают: '+neighbor.name+' готовит набег на следующий сезон.','warn');
   break;
  }
 }
 for(const neighbor of DIPLOMACY){s.diplomacy[neighbor.id]-=(neighbor.id==='west'?2:1);}
}
export function endTurn(s){
 // End season is legal with no AP, but not with an unresolved petition.
 if(s.phase!=='play')return {ok:false,message:'Правление уже завершено'};
 if(s.petition)return {ok:false,message:'Сначала ответьте на прошение'};
 season(s);borders(s);s.turn++;s.ap=2;
 for(const f of FACTIONS){if(s.factions[f.id]>56)s.factions[f.id]-=1;}
 normalize(s);
 if(s.legitimacy<=7 || s.provinces.filter(p=>p.loyalty<15).length>=3)
  return {ok:true,message:done(s,'Корона лишилась доверия. Три земли отказались повиноваться государю.')};
 if(s.turn>s.limit){
  const score=scoreState(s),epitaph=score>=72?'Золотой век':score>=48?'Хрупкий мир':'Раздробленное наследие';
  return {ok:true,message:done(s,epitaph+'. Двадцать четыре сезона правления вошли в летопись.')};
 }
 if(s.turn%3===0){
  const ids=PETITIONS.map((_,i)=>i),id=pick(s,ids);
  s.petition={id};note(s,'К великому совету доставлено новое прошение: '+PETITIONS[id].title+'.','petition');
 }
 const msg='Сезон '+s.turn+'. Казна '+(s.lastEconomy.income-s.lastEconomy.upkeep>=0?'+':'')+(s.lastEconomy.income-s.lastEconomy.upkeep)+', зерно '+(s.lastEconomy.grainIncome-s.lastEconomy.consumption>=0?'+':'')+(s.lastEconomy.grainIncome-s.lastEconomy.consumption)+'.';
 note(s,msg);
 return {ok:true,message:msg};
}
export function scoreState(s){return Math.round(clamp(s.legitimacy*.30+s.stability*.25+s.provinces.reduce((n,p)=>n+p.loyalty,0)/7*.20+Math.min(s.treasury,125)/125*100*.12+s.army/80*100*.13));}
export function warnings(s){
 const list=[];
 if(s.petition)list.push('Великий совет ждёт ответа на прошение');
 if(s.raid)list.push('На '+PROVINCES.find(p=>p.id===s.raid.target).name+' готовится набег');
 if(s.grain<24)list.push('Истощены зерновые запасы');
 if(s.treasury<22)list.push('Серебра в казне почти нет');
 if(s.provinces.some(p=>p.unrest>65))list.push('В провинциях зреет восстание');
 return list;
}
