
import {EXTRA_ITEMS,EXTRA_TREATMENTS,EXTRA_RITES,EXTRA_DOCTRINES,INCIDENTS,PATRONS} from './content.js';

/* BNT v0.2 - deterministic, dependency-free local ritual engine.
   The pure transition functions are deliberately reusable by a future PocketNet server. */
export const ITEMS = Object.freeze([
 {id:'goose',name:'Гусь',color:'white',shape:'long',kind:'living',material:'feather',hint:'Белый · живой · вытянутый'},
 {id:'bread',name:'Каравай',color:'gold',shape:'round',kind:'food',material:'grain',hint:'Золотой · пища · круглый'},
 {id:'crown',name:'Корона',color:'gold',shape:'angular',kind:'regalia',material:'metal',hint:'Золотая · металл · угловатая'},
 {id:'egg',name:'Яйцо',color:'white',shape:'round',kind:'food',material:'shell',hint:'Белое · пища · круглое'},
 {id:'candle',name:'Свеча',color:'white',shape:'long',kind:'relic',material:'wax',hint:'Белая · воск · вытянутая'},
 {id:'fish',name:'Рыба',color:'silver',shape:'long',kind:'food',material:'water',hint:'Серебряная · пища · вытянутая'},
 {id:'key',name:'Ключ',color:'silver',shape:'angular',kind:'tool',material:'metal',hint:'Серебряный · металл · угловатый'},
 {id:'cup',name:'Чаша',color:'gold',shape:'round',kind:'regalia',material:'metal',hint:'Золотая · металл · круглая'},
 {id:'stone',name:'Камень',color:'dark',shape:'angular',kind:'relic',material:'stone',hint:'Тёмный · камень · угловатый'},
 {id:'bell',name:'Колокол',color:'silver',shape:'round',kind:'relic',material:'metal',hint:'Серебряный · металл · круглый'}
 ,...EXTRA_ITEMS
]);
export const TREATMENTS=Object.freeze([
 {id:'wash',name:'Омыть',short:'Вода'},
 {id:'smoke',name:'Окурить',short:'Дым'},
 {id:'gild',name:'Золотить',short:'Золото'}
 ,...EXTRA_TREATMENTS
]);
export const RITES=Object.freeze([
 {id:'white',title:'Белее облака',riddle:'«Принесите светлое. Не терплю железа. Пусть омовение станет первым благословением. Два звона и низкий постамент».',
  need:'color',value:'white',taboo:'metal',treatment:'wash',bell:2,height:'low',emblem:'light'},
 {id:'round',title:'Пир небесного колеса',riddle:'«Не имеющее углов согреет меня. Но живому сюда нельзя. Пусть дым укажет дорогу. Три звона, высокий постамент».',
  need:'shape',value:'round',taboo:'living',treatment:'smoke',bell:3,height:'high',emblem:'circle'},
 {id:'feast',title:'Великий обед',riddle:'«Голоден. Съедобное, но не золотое! Украсьте его сиянием, поднимите повыше и ударьте в колокол лишь раз».',
  need:'kind',value:'food',taboo:'gold',treatment:'gild',bell:1,height:'high',emblem:'feast'},
 {id:'metal',title:'Железная милость',riddle:'«Жажду холодного металла. Но серебро сегодня мне противно. Обмойте дар, трижды звоните, ставьте у подножия».',
  need:'material',value:'metal',taboo:'silver',treatment:'wash',bell:3,height:'low',emblem:'key'},
 {id:'long',title:'Священная длина',riddle:'«Чем длиннее силуэт, тем ближе ко мне. Пищу не подавать. Дым, один удар и низкий постамент».',
  need:'shape',value:'long',taboo:'food',treatment:'smoke',bell:1,height:'low',emblem:'line'},
 {id:'treasure',title:'Цена небес',riddle:'«Мне нужно золото. Железа не выношу. Нанесите золото ещё раз, даже если оно уже блестит. Дважды звони, возвышай дар».',
  need:'color',value:'gold',taboo:'metal',treatment:'gild',bell:2,height:'high',emblem:'crown'}
 ,...EXTRA_RITES
]);
export const DOCTRINES=Object.freeze([
 {id:'goose',name:'Гусь — епископ',desc:'Гусь получает +2 к суду. Любой другой дар —1.',positive:'Гусь благословляет подношение.',negative:'Епископ-гусь неодобрительно гогочет.'},
 {id:'washing',name:'Вечное омовение',desc:'Омытые дары +1. Остальные —1.',positive:'Вода очищает от сомнений.',negative:'Священная вода никого не дождалась.'},
 {id:'height',name:'Ближе к небу',desc:'Высокий алтарь +1. Низкий —1.',positive:'Подношение приближается к небу.',negative:'Подношение унизительно низко.'},
 {id:'quiet',name:'Единственный удар',desc:'Один звон +1. Больше —1.',positive:'Тишина после первого звона почтена.',negative:'Лишние удары оскорбляют тишину.'},
 {id:'thunder',name:'Тройное громыхание',desc:'Три звона +1. Меньше —1.',positive:'Три грома услышаны.',negative:'Божеству недодали грома.'},
 {id:'white',name:'Светлая ересь',desc:'Белое подношение +1. Иное —1.',positive:'Белизна признана священной.',negative:'Это недостаточно белое для собора.'},
 {id:'iron',name:'Железная вера',desc:'Металлическое подношение +1. Иное —1.',positive:'Звучит священный металл.',negative:'Церковь требует металла.'},
 {id:'food',name:'Съедобная истина',desc:'Пища +1. Иное —1.',positive:'Вера поддерживается пищей.',negative:'Жрецы забыли кормить веру.'}
 ,...EXTRA_DOCTRINES
]);
export const VOWS=Object.freeze([
 {id:'steady',name:'Обычный обряд',detail:'Без дополнительного риска.'},
 {id:'bold',name:'Дерзкий обет',detail:'Благословение +3 милости, сомнение −1, гнев −3.'},
 {id:'shelter',name:'Обет осторожности',detail:'Благословение +1, сомнение +1, гнев −1.'}
]);
const MAX_ROUNDS=5;
export const START_FAITH=6;
export const MAX_FAITH=10;
const validItem=id=>ITEMS.some(x=>x.id===id);
const idSet=x=>new Set(x.map(a=>a.id));
const doctrineSet=idSet(DOCTRINES);
const treatSet=idSet(TREATMENTS);
export const getItem=id=>ITEMS.find(x=>x.id===id)||null;
export const getDoctrine=id=>DOCTRINES.find(x=>x.id===id)||null;
export const getPatron=id=>PATRONS.find(x=>x.id===id)||PATRONS[0];
export const getRite=s=>RITES[s.order[s.round]];
export const getIncident=state=>{
 const seed=(state.seed^0x7b39cf81)>>>0,random=random32(seed);
 const deck=INCIDENTS.map((_,i)=>i);
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 return INCIDENTS[deck[state.round%deck.length]];
};
export const getIncidentById=id=>INCIDENTS.find(x=>x.id===id)||null;
export const defaultAction=()=>({itemId:null,treatment:null,bell:1,height:'low',vow:'steady'});
function random32(seed) { let x=(seed>>>0)||0x6d2b79f5; return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};}
export function createGame(seed=0x6ab52d19) {
 const number=Number.isInteger(seed)?(seed>>>0):0x6ab52d19;
 const rand=random32(number);const order=RITES.map((_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 return {schema:2,seed:number,patronId:PATRONS[number%PATRONS.length].id,order:order.slice(0,MAX_ROUNDS),round:0,faith:START_FAITH,
 phase:'play',actions:defaultAction(),doctrines:[],history:[],judgment:null,offers:[],councilUsed:false};
}
export function setAction(state,patch){
 if(state.phase!=='play')return state;
 const next={...state.actions};
 if(Object.hasOwn(patch,'itemId')&&(patch.itemId===null||validItem(patch.itemId)))next.itemId=patch.itemId;
 if(Object.hasOwn(patch,'treatment')&&(patch.treatment===null||treatSet.has(patch.treatment)))next.treatment=patch.treatment;
 if([1,2,3].includes(patch.bell))next.bell=patch.bell;
 if(['low','high'].includes(patch.height))next.height=patch.height;
 if(VOWS.some(v=>v.id===patch.vow))next.vow=patch.vow;
 return {...state,actions:next};
}
export function doctrineEffect(id,action){
 const item=getItem(action.itemId);
 const pass=({
  goose:()=>item?.id==='goose',washing:()=>action.treatment==='wash',height:()=>action.height==='high',
  quiet:()=>action.bell===1,thunder:()=>action.bell===3,white:()=>item?.color==='white',
  iron:()=>item?.material==='metal',food:()=>item?.kind==='food',
  ribbons:()=>action.treatment==='ribbon',oil:()=>action.treatment==='anoint',
  smoke:()=>action.treatment==='smoke',gilding:()=>action.treatment==='gild',
  second:()=>action.bell===2,humble:()=>action.height==='low',
  living:()=>item?.kind==='living',relic:()=>item?.kind==='relic',
  tools:()=>item?.kind==='tool',royal:()=>item?.kind==='regalia',
  red:()=>item?.color==='red',green:()=>item?.color==='green',dark:()=>item?.color==='dark',
  silver:()=>item?.color==='silver',round:()=>item?.shape==='round',angular:()=>item?.shape==='angular',
  paper:()=>item?.material==='paper',stone:()=>item?.material==='stone'
 })[id];
 if(!pass)return {delta:0,text:''};
 const good=!!pass(),d=getDoctrine(id);
 return {delta:good?(id==='goose'?2:1):-1,text:good?d.positive:d.negative};
}
export function evaluateRite(rite,action,doctrines=[],incident=null,patronId='ogo'){
 const item=getItem(action.itemId);if(!item)throw Error('Missing offering');
 const matches=(field,value)=>item[field]===value;
 const taboo=['material','kind','color','shape'].some(field=>item[field]===rite.taboo);
 const patron=getPatron(patronId);
 const patronScore=(['bell','height','treatment'].includes(patron.field)?action[patron.field]:item[patron.field])===patron.value?1:0;
 const incidentScore=incident&&((incident.field==='bell'||incident.field==='height'||incident.field==='treatment')?
  action[incident.field]===incident.value:item[incident.field]===incident.value)?incident.delta:0;
 const criteria=[
  {name:'Дар по знамению',score:matches(rite.need,rite.value)?2:0,max:2},
  {name:'Запрет соблюдён',score:taboo?0:1,max:1},
  {name:'Подготовка',score:action.treatment===rite.treatment?1:0,max:1},
  {name:'Звон',score:action.bell===rite.bell?1:0,max:1},
  {name:'Высота',score:action.height===rite.height?1:0,max:1},
  {name:'Каприз: '+patron.name,score:patronScore,max:1},
  ...(incident?[{name:'Событие: '+incident.title,score:incidentScore,max:1}]:[])
 ];
 // One conflicting doctrine can object per ceremony; extra objections cancel each other out.
 // Without this cap three contradictory dogmas plus an incident can make perfect rites unwinnable.
 let opposition=0;
 const doctrineResults=doctrines.map(id=>{
  const result={id,...doctrineEffect(id,action)};
  if(result.delta<0&&opposition++>0)return {...result,delta:0,text:'Возражение поглощено спором догматов.'};
  return result;
 });
 const score=criteria.reduce((n,c)=>n+c.score,0)+doctrineResults.reduce((n,d)=>n+d.delta,0);
 const verdict=score>=4?'bless':score>=3?'doubt':'wrath';
 const vow=VOWS.some(v=>v.id===action.vow)?action.vow:'steady';
 const delta=vow==='bold'?{bless:3,doubt:-1,wrath:-3}[verdict]:
  vow==='shelter'?{bless:1,doubt:1,wrath:-1}[verdict]:
  {bless:2,doubt:0,wrath:-2}[verdict];
 // Four authored miracle families arise from real actions, not a random joke generator.
 const special={goat:'goat',apple:'apple',mushroom:'mushroom',flower:'flower',mirror:'mirror',mask:'mask',scroll:'scroll',sword:'sword',shield:'shield',hourglass:'hourglass',book:'book',boot:'boot',cheese:'cheese',lantern:'lantern',frog:'frog',compass:'compass',skull:'skull',potato:'potato'};
 const miracleId=special[item.id]|| (item.id==='goose'?'goose':action.treatment==='gild'?'gilded':
  action.bell===3?'thunder':'ash');
 const miracleText={
  goose:'Гусь оглядел прихожан и объявил себя единственным настоящим епископом.',
  gilded:'Небо пролилось золотой пылью. ОГО потребовал выдать её за пожертвования.',
  thunder:'Колокол ударил снова без участия звонаря. Никто не посмел возразить.',
  ash:'С алтаря поднялся клуб пыли. Совет признал его священным дымом.',
  goat:'Коза съела лист с молитвой. Церковь назначила её главным архивариусом.',
  apple:'Яблоко упало точно на голову настоятелю. Это назвали законом тяготения.',
  mushroom:'Гриб начал светиться. В храме срочно утвердили праздник подозрительных супов.',
  flower:'Цветок распустился посреди суда. Бог потребовал прибавку садовнику.',
  mirror:'В зеркале отразился второй бог. Первый обвинил его в ереси.',
  mask:'Маска подмигнула собору. Её немедленно назначили официальным лицом церкви.',
  scroll:'Свиток размотался до выхода. В очереди за индульгенциями стало тесно.',
  sword:'Меч вонзился в пол. Бог объявил, что церковь теперь имеет собственную границу.',
  shield:'Щит отразил молнию. Канонизировали техника безопасности.',
  hourglass:'Песок в часах потёк вверх. Паломники попросили вернуть вчерашний день.',
  book:'Книга открылась на странице с долгами жрецов. Началась налоговая реформа.',
  boot:'Сапог самостоятельно сделал три шага. Его признали первым миссионером.',
  cheese:'Сыр покрылся священными дырками. Собор провёл расследование их происхождения.',
  lantern:'Фонарь осветил подвал. Выяснилось, что бог прятал там пожертвования.',
  frog:'Жаба квакнула громче колокола. Звонаря отправили на переподготовку.',
  compass:'Компас указал на буфет. Новая священная география принята единогласно.',
  skull:'Череп засмеялся без нижней челюсти. Бог потребовал позвать анатома.',
  potato:'Картошка пустила росток. Церковь объявила это первым земным пророчеством.'
 }[miracleId];
 return {score,criteria,doctrineResults,verdict,faithDelta:delta,vow,selected:item.id,miracleId,miracleText,
  incidentId:incident?.id||null,incidentText:incident?incident.story:null,incidentScore,patronId};
}
function makeOffers(state,judgment){
 const item=getItem(state.actions.itemId),incident=getIncident(state);
 const linked=[
  item.id==='goose'?'goose':item.kind==='food'?'food':item.material==='metal'?'iron':'white',
  {wash:'washing',smoke:'smoke',gild:'gilding',ribbon:'ribbons',anoint:'oil'}[state.actions.treatment],
  {living:'living',food:'food',relic:'relic',regalia:'royal',tool:'tools'}[item.kind],
  {white:'white',red:'red',green:'green',dark:'dark',silver:'silver',gold:'royal'}[item.color],
  {round:'round',angular:'angular',long:'height'}[item.shape],
  {1:'quiet',2:'second',3:'thunder'}[state.actions.bell],
  state.actions.height==='high'?'height':'humble',
  {paper:'paper',stone:'stone',metal:'iron'}[item.material],
  incident?.field==='treatment'?{wash:'washing',smoke:'smoke',gild:'gilding',ribbon:'ribbons',anoint:'oil'}[incident.value]:null
 ];
 const shuffled=DOCTRINES.map(d=>d.id),random=random32(state.seed^((state.round+1)*0x9e3779b9));
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 const options=[...linked.filter(Boolean),...shuffled].filter(id=>!state.doctrines.includes(id));
 return [...new Set(options)].slice(0,2);
}
export function commitRite(state){
 if(state.phase!=='play'||!getItem(state.actions.itemId))return state;
 const rite=getRite(state);
 const judgment=evaluateRite(rite,state.actions,state.doctrines,getIncident(state),state.patronId);
 const faith=Math.max(0,Math.min(MAX_FAITH,state.faith+judgment.faithDelta));
 const event={round:state.round+1,riteId:rite.id,riteTitle:rite.title,itemId:state.actions.itemId,
  actions:{...state.actions},...judgment,faithAfter:faith,adopted:null};
 const history=[...state.history,event];
 return {...state,faith,phase:'judgment',judgment,history,offers:makeOffers(state,judgment)};
}
export function continueFromJudgment(state){
 if(state.phase!=='judgment')return state;
 if(state.faith===0||state.round===MAX_ROUNDS-1)return {...state,phase:'end',offers:[]};
 return {...state,phase:'dogma'};
}
export function chooseDoctrine(state,id){
 if(state.phase!=='dogma'||!state.offers.includes(id))return state;
 const doctrines=[...state.doctrines,id].slice(-3);
 const history=state.history.map((x,i)=>i===state.round?{...x,adopted:id}:x);
 return {...state,doctrines,history,round:state.round+1,phase:'play',
  actions:defaultAction(),judgment:null,offers:[]};
}
export function conveneCouncil(state){
 if(state.phase!=='play'||state.councilUsed||state.doctrines.length===0||state.faith<2)return state;
 return {...state,councilUsed:true,faith:state.faith-1,doctrines:state.doctrines.slice(1)};
}
export function getBestPossible(state){
 const rite=getRite(state),incident=getIncident(state);let best=-999;
 for(const item of ITEMS)for(const treatment of TREATMENTS)for(const bell of [1,2,3])for(const height of ['low','high']){
  best=Math.max(best,evaluateRite(rite,{itemId:item.id,treatment:treatment.id,bell,height},state.doctrines,incident,state.patronId).score);
 }
 return best;
}
export function loadGame(raw){
 try {
  if(!raw||raw.schema!==2||!Number.isInteger(raw.seed)||!Array.isArray(raw.order)||raw.order.length!==MAX_ROUNDS||
    new Set(raw.order).size!==MAX_ROUNDS||raw.order.some(n=>!Number.isInteger(n)||n<0||n>=RITES.length)||
    !Number.isInteger(raw.round)||raw.round<0||raw.round>=MAX_ROUNDS||
    !Number.isFinite(raw.faith)||raw.faith<0||raw.faith>MAX_FAITH||
    !['play','judgment','dogma','end'].includes(raw.phase)||
    !Array.isArray(raw.doctrines)||raw.doctrines.length>3||raw.doctrines.some(id=>!doctrineSet.has(id))||
    !Array.isArray(raw.history)||raw.history.length>MAX_ROUNDS||
    !raw.actions||typeof raw.actions!=='object')return null;
  const clean={...defaultAction()};
  if(raw.actions.itemId!==null&&!validItem(raw.actions.itemId))return null;clean.itemId=raw.actions.itemId;
  if(raw.actions.treatment!==null&&!treatSet.has(raw.actions.treatment))return null;
  clean.treatment=raw.actions.treatment;
  if(![1,2,3].includes(raw.actions.bell)||!['low','high'].includes(raw.actions.height))return null;
  clean.bell=raw.actions.bell;clean.height=raw.actions.height;
  if(raw.actions.vow!==undefined&&!VOWS.some(v=>v.id===raw.actions.vow))return null;
  clean.vow=raw.actions.vow||'steady';
  if(raw.history.length!==raw.round+(raw.phase==='play'?0:1) && !(raw.phase==='end'&&raw.faith===0))return null;
  if(raw.history.some(x=>!x||!RITES.some(r=>r.id===x.riteId)||!validItem(x.itemId)))return null;
  return {...raw,patronId:getPatron(raw.patronId).id,actions:clean,councilUsed:raw.councilUsed===true,
   offers:Array.isArray(raw.offers)?raw.offers.filter(id=>doctrineSet.has(id)).slice(0,2):[]};
 }catch{return null}
}
export function isWin(state){return state.phase==='end'&&state.faith>0;}
