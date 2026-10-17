// Isolated 48-province research world for v0.8.
// Small worlds keep their original byte-for-byte generation path.
import {initialRngState,normalizeSeed,randomInt} from './random.js';
import {seedFamilyFoundations} from './dynasty.js';
import {initializePolitics} from './politics.js';
import {ensureConflicts} from './conflicts.js';
import {recordEvent} from './transactions.js';
const two=n=>String(n).padStart(2,'0');
const familyNames=['Лесские','Ольховичи','Береговичи','Яровичи','Вельские',
  'Сребричи','Дубровские','Чернские','Межинские','Рубежичи','Озеричи','Высоцкие'];
const names=['Мирослав','Радослав','Ярослав','Святополк','Всеволод','Добромир',
  'Ростислав','Владислав','Изяслав','Тихомир','Борислав','Глеб','Болеслав','Павел'];
const roots=['Берег','Ольхов','Перевал','Вышград','Чернолесье','Речица','Вельск',
  'Устье','Луговое','Белый Яр','Залесье','Кремень','Вороний брод','Дуброва',
  'Рубеж','Озерки','Заречье','Красный холм','Болотино','Свирь','Сосновый мыс',
  'Сухой яр','Ладожье','Крутояр','Белоречье','Каменный дол','Туманная падь',
  'Верхние воды','Ясенев','Тихая межа','Старый перевоз','Плёсы','Граница',
  'Семигорье','Дальняя слобода','Журавлино','Стражи','Ратниково','Песчаное',
  'Высокий лес','Медовый бор','Гать','Липовка','Скала','Светлый дол',
  'Малые броды','Рубежная долина','Мельничье'];
const duchyNames=['Прибрежье','Срединные земли','Нагорье','Верховье',
  'Тихоречье','Чёрный бор','Белозерье','Дубровье','Высоцкие земли',
  'Южный рубеж','Сосновая сторона','Семигорье'];
const id=(type,n)=>type+'-'+two(n);
export const EXPANDED_COUNT=48;
export function createExpandedWorld(seed=1){
  const value=normalizeSeed(seed),w={
    schemaVersion:4,seed:value,rngState:initialRngState(value),
    year:1066,nextEventId:1,
    dynasties:familyNames.map((name,i)=>({id:id('dy',i+1),name})),
    people:[],titles:[],provinces:[],
    ledger:{initial:{grain:0,coin:0},created:{grain:0,coin:0},consumed:{grain:0,coin:0}},
    stats:{years:0,shortages:0,harvested:0,minted:0,taxGrain:0,taxCoin:0},
    events:[],profile:'full'
  };
  // 48 independent comital houses; 12 ducal seats; one crown = 61 landholders.
  // Seeded marriages and children produce 120-180 living nobles at foundation.
  for(let n=1;n<=61;n++){
    const dynasty=n===61?0:randomInt(w,w.dynasties.length);
    w.people.push({
      id:id('pe',n),
      name:names[randomInt(w,names.length)]+' '+w.dynasties[dynasty].name,
      dynastyId:id('dy',dynasty+1),birthYear:w.year-(24+randomInt(w,29)),
      treasury:{grain:30+randomInt(w,81),coin:12+randomInt(w,38)}
    });
  }
  w.titles.push({id:'ki-01',name:'Королевство Междуречье',rank:'kingdom',
    liegeId:null,provinceId:null,holderId:id('pe',61)});
  for(let n=1;n<=12;n++)w.titles.push({id:id('du',n),
    name:'Герцогство '+duchyNames[n-1],rank:'duchy',liegeId:'ki-01',
    provinceId:null,holderId:id('pe',48+n)});
  // 8x6 topology, two-by-two provinces per duchy (12 contiguous duchies).
  for(let y=0;y<6;y++)for(let x=0;x<8;x++){
    const n=y*8+x+1,hills=randomInt(w,4)===0;
    const neighbors=[x>0?n-1:null,x<7?n+1:null,y>0?n-8:null,
      y<5?n+8:null].filter(Boolean).map(v=>id('pr',v)).sort();
    const p={id:id('pr',n),titleId:id('co',n),name:roots[n-1],
      x,y,neighbors,terrain:hills?'hills':'plains',
      baseYield:(hills?116:134)+randomInt(w,31),
      baseTrade:12+randomInt(w,14),demand:97+randomInt(w,35),
      treasury:{grain:35+randomInt(w,80),coin:12+randomInt(w,30)},
      lastShortage:0,shortages:0};
    w.provinces.push(p);
    const duchy=Math.floor(y/2)*4+Math.floor(x/2)+1;
    w.titles.push({id:id('co',n),name:'Графство '+p.name,
      rank:'county',liegeId:id('du',duchy),provinceId:p.id,
      holderId:id('pe',n)});
  }
  seedFamilyFoundations(w);
  initializePolitics(w);
  ensureConflicts(w);
  for(const good of ['grain','coin'])w.ledger.initial[good]=
    [...w.people,...w.provinces].reduce((total,p)=>total+p.treasury[good],0);
  recordEvent(w,'foundation','expanded-seeded-world',{
    seed:value,kingdom:'ki-01',provinces:48,titles:61,people:w.people.length});
  return w;
}
