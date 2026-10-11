import { LETTERS_EXTRA, VISITORS_EXTRA, type StoryEncounter } from './campaign-events';
export type Phase='menu'|'visitor'|'letter'|'night'|'siege'|'won'|'lost';
export type Faction='stark'|'bolton'|'watch'|'freefolk';
export type ResourceKey='food'|'wood'|'gold'|'medicine'|'guards'|'morale';
export type ChoiceId='admit'|'refuse'|'search'|'send'|'burn'|'lie'|'aid'|'deny';
export interface Resources{food:number;wood:number;gold:number;medicine:number;guards:number;morale:number}
export interface Relations{stark:number;bolton:number;watch:number;freefolk:number}
export interface Weather{kind:'clear'|'snow'|'storm'|'whiteout';temperature:number;wind:number;snow:number}
export interface Consequence{day:number;id:string;text:string;effects:Partial<Record<ResourceKey,number>>;relations?:Partial<Record<Faction,number>>;flag?:string}
export interface EncounterChoice{id:ChoiceId;label:string;hint:string;effects?:Partial<Record<ResourceKey,number>>;relations?:Partial<Record<Faction,number>>;consequence?:Omit<Consequence,'day'> & {delay:number}}
export interface Encounter{id:string;kind:'visitor'|'letter';title:string;body:string;source:string;seal?:Faction;truth?:string;visual:'refugees'|'rangers'|'trader'|'soldiers'|'maester'|'crow'|'letter';choices:EncounterChoice[]}
export type SiegeOrder='reinforce'|'volley'|'sortie'|'rally'|'hold';
export interface SiegeState{progress:number;wall:number;enemy:number;breaches:number;resultText:string;awaitingOrder:boolean;orderStage:number;orders:SiegeOrder[]}
export interface GameState{
  version:1; seed:number; rng:number; phase:Phase; day:number; weather:Weather; resources:Resources; relations:Relations;
  flags:string[]; knowledge:string[]; pending:Consequence[]; history:string[]; current:Encounter|null; nightText:string;
  population:number; gateOpen:boolean; visitorIndex:number; letterIndex:number; seen:string[]; siege:SiegeState|null; completed:boolean;
}

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const hash=(x:number)=>{x|=0;x=Math.imul(x^x>>>16,0x45d9f3b);x=Math.imul(x^x>>>16,0x45d9f3b);return (x^x>>>16)>>>0};
function next(state:GameState){state.rng=hash(state.rng+0x9e3779b9);return state.rng/4294967296}
function changeResources(state:GameState,effects:Partial<Record<ResourceKey,number>>={}){for(const [k,v] of Object.entries(effects) as [ResourceKey,number][])state.resources[k]+=v;state.resources.food=Math.max(0,state.resources.food);state.resources.wood=Math.max(0,state.resources.wood);state.resources.gold=Math.max(0,state.resources.gold);state.resources.medicine=Math.max(0,state.resources.medicine);state.resources.guards=Math.max(0,state.resources.guards);state.resources.morale=clamp(state.resources.morale,0,100)}
function changeRelations(state:GameState,effects:Partial<Record<Faction,number>>={}){for(const [k,v] of Object.entries(effects) as [Faction,number][])state.relations[k]=clamp(state.relations[k]+v,-100,100)}

const VISITORS:Encounter[]=[
 {id:'refugees-winterfell',kind:'visitor',title:'Люди с королевского тракта',source:'семь человек, двое детей',visual:'refugees',body:'Говорят, их хутор сожгли люди с ободранным человеком на знамени. Просят ночь под крышей и немного хлеба.',truth:'Беженцы говорят правду. Один мужчина видел численность болтонского разъезда.',choices:[
  {id:'admit',label:'ВПУСТИТЬ',hint:'еда −3 · люди +5',effects:{food:-3,morale:4},relations:{stark:4,bolton:-2},consequence:{delay:2,id:'refugee-scout',text:'Один из беженцев вспомнил: болтонский разъезд насчитывал не меньше тридцати копий.',effects:{morale:2},flag:'know-bolton-patrol'}},
  {id:'search',label:'ОБЫСКАТЬ',hint:'медленнее, но безопаснее',effects:{morale:-2},relations:{stark:-1},consequence:{delay:1,id:'refugee-truth',text:'Обыск ничего не дал. Люди запомнили холодный приём.',effects:{},flag:'searched-refugees'}},
  {id:'refuse',label:'НЕ ОТКРЫВАТЬ',hint:'сохраним припасы',relations:{stark:-4},consequence:{delay:3,id:'frozen-road',text:'У дороги нашли замёрзшее тело. На плаще — булавка в форме лютоволка.',effects:{morale:-5},flag:'road-death'}}]},
 {id:'watch-rangers',kind:'visitor',title:'Чёрные плащи',source:'трое всадников Ночного Дозора',visual:'rangers',body:'Просят сменных лошадей и дрова. На севере, говорят, люди исчезают целыми деревнями.',truth:'Двое настоящие дозорные. Третий — раненый разведчик, которого они скрывают.',choices:[
  {id:'aid',label:'ПОМОЧЬ',hint:'дрова −3 · золото −1',effects:{wood:-3,gold:-1,morale:2},relations:{watch:8},consequence:{delay:4,id:'watch-warning',text:'Ворон с Чёрного замка: «Не держите лишних людей за стеной ночью». Без объяснений.',effects:{},flag:'watch-warning'}},
  {id:'search',label:'РАССПРОСИТЬ',hint:'получить сведения',relations:{watch:1},consequence:{delay:1,id:'watch-clue',text:'Раненый разведчик рассказал о следах огромного отряда севернее тракта.',effects:{},flag:'know-north-threat'}},
  {id:'refuse',label:'ОТКАЗАТЬ',hint:'ничего не тратим',relations:{watch:-8}}]},
 {id:'bolton-men',kind:'visitor',title:'Люди Дредфорта',source:'шесть вооружённых всадников',visual:'soldiers',body:'Капрал требует открыть ворота и выдать десятую часть зерна «по праву нового порядка». Письма с печатью нет.',truth:'Они действительно служат Болтонам, но приказ о зерне выдуман.',choices:[
  {id:'admit',label:'ВПУСТИТЬ',hint:'еда −5 · риск',effects:{food:-5,morale:-3},relations:{bolton:7,stark:-3},consequence:{delay:2,id:'bolton-mark',text:'На воротах ночью нашли свежую зарубку. Кто-то отметил замок для следующего отряда.',effects:{},flag:'marked-by-bolton'}},
  {id:'search',label:'ТРЕБОВАТЬ ПРИКАЗ',hint:'проверка блефа',effects:{morale:2},relations:{bolton:-3},consequence:{delay:1,id:'bolton-bluff',text:'Капрал не вернулся. Значит, письменного приказа у него и правда не было.',effects:{morale:2},flag:'exposed-bolton-bluff'}},
  {id:'refuse',label:'ЗАКРЫТЬ ВОРОТА',hint:'отношения ухудшатся',relations:{bolton:-9},consequence:{delay:3,id:'bolton-pressure',text:'На холме появились два всадника. Они считают караулы и уезжают до рассвета.',effects:{morale:-2},flag:'bolton-scouted'}}]},
 {id:'salt-trader',kind:'visitor',title:'Торговец солью',source:'одна телега, два охранника',visual:'trader',body:'Предлагает соль, ламповое масло и слухи. Просит золото вперёд. Слишком спокойно говорит для человека на военной дороге.',truth:'Товар настоящий. Один охранник продаёт сведения обеим сторонам.',choices:[
  {id:'admit',label:'ТОРГОВАТЬ',hint:'золото −3 · еда +4',effects:{gold:-3,food:4,wood:1},consequence:{delay:2,id:'trader-rumor',text:'Слух торговца подтвердился: южная дорога на день свободна.',effects:{morale:2},flag:'south-road-open'}},
  {id:'search',label:'ОБЫСКАТЬ ТЕЛЕГУ',hint:'можно найти лишнее',effects:{gold:1,morale:-1},relations:{bolton:-1},consequence:{delay:1,id:'spy-token',text:'Под мешком соли нашли медный жетон Дредфорта.',effects:{},flag:'caught-spy-token'}},
  {id:'refuse',label:'ПРОГНАТЬ',hint:'без риска и выгоды'}]},
 {id:'sick-maester',kind:'visitor',title:'Мейстер без замка',source:'старик и молодой слуга',visual:'maester',body:'Цепь настоящая. На рукаве кровь. Он предлагает лечить людей за тёплую комнату и доступ к воронам.',truth:'Он действительно мейстер. Болен не он, а слуга.',choices:[
  {id:'admit',label:'ПРИНЯТЬ',hint:'лекарства +2',effects:{medicine:2,morale:4},relations:{stark:2},consequence:{delay:2,id:'maester-fever',text:'У слуги началась горячка. Мейстер просит закрыть его отдельно.',effects:{medicine:-1},flag:'fever-contained'}},
  {id:'search',label:'ОСМОТРЕТЬ',hint:'потратить лекарство',effects:{medicine:-1},consequence:{delay:1,id:'maester-clean',text:'Мейстер благодарит за осторожность и остаётся помогать.',effects:{medicine:2,morale:3},flag:'maester-ally'}},
  {id:'refuse',label:'НЕ РИСКОВАТЬ',hint:'без болезни',effects:{morale:-2}}]},
 {id:'freefolk-family',kind:'visitor',title:'Люди из-за Стены',source:'четверо без гербов',visual:'refugees',body:'Говорят на общем языке с тяжёлым северным говором. Женщина держит короткий охотничий лук, ребёнок — костяную фигурку ворона.',truth:'Это свободные люди. Они бегут не от Дозора, а от чего-то севернее.',choices:[
  {id:'admit',label:'ВПУСТИТЬ',hint:'еда −2 · сведения',effects:{food:-2,morale:1},relations:{freefolk:8,watch:-2},consequence:{delay:2,id:'freefolk-story',text:'Ночью женщина говорит: «Мёртвые не всегда лежат». Караулы после этого спят хуже.',effects:{morale:-2},flag:'heard-dead-walk'}},
  {id:'search',label:'РАЗОРУЖИТЬ',hint:'безопаснее',effects:{morale:-1},relations:{freefolk:-2},consequence:{delay:1,id:'obsidian',text:'В мешке оказался наконечник из чёрного стекла. Они называют его драконьим.',effects:{},flag:'dragonglass'}},
  {id:'refuse',label:'ПРОГНАТЬ',hint:'Дозор одобрит',relations:{freefolk:-8,watch:3}}]}
];

const LETTERS:Encounter[]=[
 {id:'stark-request',kind:'letter',title:'Письмо с лютоволком',source:'печать дома Старков',seal:'stark',visual:'letter',body:'«Нужны люди для охраны тракта. Пришлите пятерых, если можете. Не обещаем, что вернутся скоро».',choices:[
  {id:'send',label:'ОТПРАВИТЬ ЛЮДЕЙ',hint:'стража −5',effects:{guards:-5,morale:2},relations:{stark:10},consequence:{delay:4,id:'stark-return',text:'Двое из отправленных людей вернулись. Привели ещё троих бойцов.',effects:{guards:5},flag:'stark-reinforcements'}},
  {id:'lie',label:'СОЛГАТЬ О СИЛАХ',hint:'сохраним гарнизон',relations:{stark:-3},consequence:{delay:3,id:'stark-doubt',text:'Старки прислали сухой ответ: «Принято». Больше ничего.',effects:{},flag:'stark-distrust'}},
  {id:'burn',label:'НЕ ОТВЕЧАТЬ',hint:'никаких обязательств',relations:{stark:-7}}]},
 {id:'bolton-letter',kind:'letter',title:'Розовый воск',source:'печать Дредфорта',seal:'bolton',visual:'letter',body:'«Замок стоит на земле Севера. Земля Севера знает хозяина. Подтвердите верность и держите ворота открытыми для наших людей».',choices:[
  {id:'send',label:'ПОДТВЕРДИТЬ',hint:'Болтоны +',relations:{bolton:10,stark:-5},consequence:{delay:3,id:'bolton-demand',text:'Следующий ворон требует уже не слов, а зерна и шестерых людей.',effects:{food:-2},flag:'bolton-tribute'}},
  {id:'lie',label:'ОТВЕТИТЬ УКЛОНЧИВО',hint:'тянем время',relations:{bolton:-2},consequence:{delay:2,id:'bolton-impatient',text:'Ответ Дредфорта состоит из одной строки: «Мы запомнили».',effects:{morale:-2},flag:'bolton-impatient'}},
  {id:'burn',label:'СЖЕЧЬ',hint:'никакого ответа',relations:{bolton:-8,stark:2}}]},
 {id:'watch-letter',kind:'letter',title:'Чёрный воск',source:'ворон с Чёрного замка',seal:'watch',visual:'letter',body:'«Если встретите людей с севера — не режьте их сразу. Спросите, от чего они бегут».',choices:[
  {id:'send',label:'ПРИНЯТЬ К СВЕДЕНИЮ',hint:'Дозор +',relations:{watch:5},consequence:{delay:2,id:'watch-thanks',text:'Дозор прислал карту старой тропы к северу от замка.',effects:{morale:1},flag:'north-path'}},
  {id:'lie',label:'ОТВЕТИТЬ: НИКОГО НЕТ',hint:'ничего не обещаем',relations:{watch:-2}},
  {id:'burn',label:'СЖЕЧЬ',hint:'письма не было',relations:{watch:-5}}]},
 {id:'rumor-letter',kind:'letter',title:'Без печати',source:'грязный клочок пергамента',visual:'letter',body:'«Через два дня по восточной дороге пойдут обозы с зерном. Охраны мало». Подписи нет.',choices:[
  {id:'send',label:'ПРОВЕРИТЬ РАЗВЕДКОЙ',hint:'стража −1',effects:{guards:-1},consequence:{delay:2,id:'grain-truth',text:'Разведчик вернулся: обоз был, но охрана — двадцать копий. Хорошо, что не полезли.',effects:{guards:1,morale:2},flag:'verified-grain'}},
  {id:'lie',label:'ПЕРЕСЛАТЬ БОЛТОНАМ',hint:'опасная услуга',relations:{bolton:4},consequence:{delay:3,id:'ambush-result',text:'По восточной дороге нашли сожжённые телеги. Кто устроил засаду — неизвестно.',effects:{morale:-1},flag:'east-ambush'}},
  {id:'burn',label:'СЖЕЧЬ',hint:'не рисковать'}]}
];

export function createGame(seed=(Date.now()^0x51a5e9)>>>0):GameState{return {version:1,seed,rng:hash(seed),phase:'menu',day:1,weather:{kind:'clear',temperature:-7,wind:.25,snow:.12},resources:{food:24,wood:18,gold:9,medicine:4,guards:18,morale:58},relations:{stark:10,bolton:-5,watch:4,freefolk:-8},flags:[],knowledge:[],pending:[],history:[],current:null,nightText:'',population:31,gateOpen:false,visitorIndex:0,letterIndex:0,seen:[],siege:null,completed:false}}
export function startGame(state:GameState){state.phase='visitor';prepareVisitor(state)}
function addFlag(state:GameState,flag?:string){if(flag&&!state.flags.includes(flag))state.flags.push(flag)}
function applyDue(state:GameState){const due=state.pending.filter(c=>c.day<=state.day);state.pending=state.pending.filter(c=>c.day>state.day);for(const c of due){changeResources(state,c.effects);changeRelations(state,c.relations);addFlag(state,c.flag);state.history.unshift(c.text);if(c.flag?.startsWith('know-'))state.knowledge.unshift(c.text)}return due.map(c=>c.text)}
const VISITOR_POOL:StoryEncounter[]=[...VISITORS,...VISITORS_EXTRA];
const LETTER_POOL:StoryEncounter[]=[...LETTERS,...LETTERS_EXTRA];
function weightedEncounter(state:GameState,list:StoryEncounter[],offset:number){
  const allowed=list.filter(e=>state.day>=(e.minDay??1)&&state.day<=(e.maxDay??12)&&(!e.requiresFlag||state.flags.includes(e.requiresFlag)));
  const unseen=allowed.filter(e=>!state.seen.includes(e.id));
  const pool=unseen.length?unseen:allowed;
  if(!pool.length)throw new Error('No encounters available');
  // A previously earned follow-up takes precedence without forcing scripted chronology.
  const weighted=pool.flatMap(e=>e.requiresFlag?[e,e,e]:[e]);
  const index=(Math.floor(next(state)*weighted.length)+offset)%weighted.length;
  const selected=weighted[index]!;
  state.seen.push(selected.id);
  return structuredClone(selected);
}
function prepareVisitor(state:GameState){state.gateOpen=false;state.current=weightedEncounter(state,VISITOR_POOL,state.visitorIndex++);state.phase='visitor'}
function prepareLetter(state:GameState){state.current=weightedEncounter(state,LETTER_POOL,state.letterIndex++);state.phase='letter'}
function prepareNight(state:GameState){state.current=null;state.phase='night';const foodUse=Math.max(2,Math.ceil(state.population/13));const woodUse=state.weather.kind==='storm'||state.weather.kind==='whiteout'?3:2;changeResources(state,{food:-foodUse,wood:-woodUse});let text=`Ночь съела ${foodUse} ед. еды и ${woodUse} связки дров.`;if(state.resources.food<=4){changeResources(state,{morale:-5});text+=' В амбаре почти пусто.'}if(state.resources.wood<=3){changeResources(state,{morale:-4});text+=' Люди спят в одежде.'}if(state.resources.medicine<=0&&state.flags.includes('fever-contained')){changeResources(state,{morale:-3});text+=' Лекарств не осталось.'}state.nightText=text}
function updateWeather(state:GameState){const r=next(state);let kind:Weather['kind']='clear';if(state.day>8&&r>.62)kind='whiteout';else if(r>.68)kind='storm';else if(r>.34)kind='snow';state.weather.kind=kind;state.weather.temperature=Math.round(-5-state.day*.65-(kind==='whiteout'?8:kind==='storm'?4:0));state.weather.wind=kind==='clear'?.22:kind==='snow'?.42:kind==='storm'?.72:.92;state.weather.snow=clamp(state.weather.snow+(kind==='clear'?-0.02:kind==='snow'?.05:kind==='storm'?.08:.12),0,1)}
export function canChoose(state:GameState,id:ChoiceId){const choice=state.current?.choices.find(c=>c.id===id);if(!choice)return false;for(const [k,v] of Object.entries(choice.effects??{}) as [ResourceKey,number][]){if(v<0&&state.resources[k]<Math.abs(v))return false}return true}
export function choose(state:GameState,id:ChoiceId){if(!state.current||!canChoose(state,id))return false;const choice=state.current.choices.find(c=>c.id===id);if(!choice)return false;changeResources(state,choice.effects);changeRelations(state,choice.relations);if(choice.consequence){state.pending.push({day:state.day+choice.consequence.delay,id:choice.consequence.id,text:choice.consequence.text,effects:choice.consequence.effects,relations:choice.consequence.relations,flag:choice.consequence.flag})}state.history.unshift(`${state.current.title}: ${choice.label.toLowerCase()}.`);if(state.phase==='visitor'){state.gateOpen=id==='admit'||id==='aid';if(state.gateOpen)state.population+=state.current.id.includes('refugee')?5:state.current.id.includes('freefolk')?4:0;prepareLetter(state)}else if(state.phase==='letter')prepareNight(state);return true}
export function advanceNight(state:GameState){if(state.phase!=='night')return[];state.day++;if(state.day>12){beginSiege(state);return[]}updateWeather(state);const due=applyDue(state);prepareVisitor(state);return due}
function beginSiege(state:GameState){state.phase='siege';state.current=null;const allies=Math.max(0,state.relations.stark)*.08+Math.max(0,state.relations.watch)*.04+(state.flags.includes('stark-reinforcements')?6:0);const enemyPressure=32+Math.max(0,-state.relations.bolton)*.17+(state.flags.includes('marked-by-bolton')?6:0)+(state.flags.includes('bolton-scouted')?4:0)-(state.flags.includes('siege-stakes')?8:0)-(state.flags.includes('deserter-intel')?3:0);const defense=state.resources.guards*1.25+state.resources.morale*.14+state.resources.wood*.12+allies+(state.flags.includes('trained-guard')?9:0)+(state.flags.includes('armed-walls')?6:0);state.siege={progress:0,wall:clamp(55+defense,50,100),enemy:clamp(enemyPressure,21,78),breaches:0,resultText:'',awaitingOrder:true,orderStage:0,orders:[]};state.history.unshift('Утром на тракте появились чужие знамёна. Гарнизон ждёт первого приказа.')}
export function canSiegeOrder(state:GameState,id:SiegeOrder){
  const s=state.siege;if(state.phase!=='siege'||!s?.awaitingOrder)return false;
  if(id==='reinforce')return state.resources.wood>=3;
  if(id==='volley')return state.resources.food>=2;
  if(id==='sortie')return state.resources.guards>=4;
  if(id==='rally')return state.resources.gold>=1;
  return id==='hold';
}
export function issueSiegeOrder(state:GameState,id:SiegeOrder){
  if(!canSiegeOrder(state,id)||!state.siege)return false;
  const s=state.siege;
  if(id==='reinforce'){changeResources(state,{wood:-3});s.wall=clamp(s.wall+19,0,100);state.history.unshift('Сапёры укрепили ворота и заложили бреши.');}
  else if(id==='volley'){changeResources(state,{food:-2});s.enemy=Math.max(0,s.enemy-14);state.history.unshift('Со стен ударил согласованный залп.');}
  else if(id==='sortie'){changeResources(state,{guards:-3,morale:-3});s.enemy=Math.max(0,s.enemy-23);state.history.unshift('Вылазка отсекла передовые отряды от лагеря.');}
  else if(id==='rally'){changeResources(state,{gold:-1,morale:10});s.wall=clamp(s.wall+7,0,100);state.history.unshift('Кастелян выплатил жалованье и поднял знамя над стеной.');}
  else{changeResources(state,{morale:-1});s.wall=clamp(s.wall+3,0,100);state.history.unshift('Гарнизон укрылся за зубцами и переждал натиск.');}
  s.orders.push(id);s.awaitingOrder=false;return true;
}
export function stepSiege(state:GameState,dt:number){if(state.phase!=='siege'||!state.siege)return;const s=state.siege;if(s.awaitingOrder)return;s.progress=clamp(s.progress+dt/24,0,1);const guardPower=Math.max(2,state.resources.guards*.055+state.resources.morale*.018);s.enemy=Math.max(0,s.enemy-guardPower*dt*.34);const enemyPower=Math.max(1,s.enemy*.018);s.wall=Math.max(0,s.wall-enemyPower*dt*3.3);if(s.wall<65&&s.breaches===0)s.breaches=1;if(s.wall<34&&s.breaches===1)s.breaches=2;if(s.enemy<=0||(s.progress>=1&&s.wall>0)){state.phase='won';state.completed=true;s.resultText=s.wall>55?'Штурм захлебнулся у внешней стены. К рассвету дорога была пуста.':'Враг ворвался во двор, но гарнизон удержал башню до рассвета.';state.history.unshift(s.resultText)}else if(s.wall<=0){state.phase='lost';state.completed=true;s.resultText='Ворота не выдержали. К рассвету над башней уже висело чужое знамя.';state.history.unshift(s.resultText)}else if(state.phase==='siege'&&((s.orderStage===0&&s.progress>=.34)||(s.orderStage===1&&s.progress>=.68))){s.orderStage++;s.awaitingOrder=true;state.history.unshift('Рог подал сигнал: враг изменил направление атаки. Нужен новый приказ.')}}
export function relationLabel(n:number){if(n>=45)return'союз';if(n>=15)return'доброжелательно';if(n>-15)return'настороженно';if(n>-45)return'враждебно';return'почти война'}
export function resourceDanger(state:GameState){return state.resources.food<=4||state.resources.wood<=3||state.resources.guards<=6||state.resources.morale<=20}
export function serializeGame(state:GameState){return JSON.stringify(state)}
export function restoreGame(raw:string|null):GameState|null{if(!raw)return null;try{const s=JSON.parse(raw) as GameState;if(s.version!==1||!s.resources||!s.relations||typeof s.day!=='number')return null;s.seen=Array.isArray(s.seen)?s.seen:[];if(s.siege){s.siege.orders=Array.isArray(s.siege.orders)?s.siege.orders:[];s.siege.orderStage=Number.isInteger(s.siege.orderStage)?s.siege.orderStage:0;s.siege.awaitingOrder=typeof s.siege.awaitingOrder==='boolean'?s.siege.awaitingOrder:true}return s}catch{return null}}
