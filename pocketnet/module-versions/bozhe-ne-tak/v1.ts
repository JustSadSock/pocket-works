// BNT PocketNet authoritative module v1. PUBLIC information only.
// Pinned snapshot includes the exact pure local ritual rules; never import mutable app code.
export const MIN_PLAYERS=2,MAX_PLAYERS=5,RULESET_VERSION=1;

/* BNT v0.2 - deterministic, dependency-free local ritual engine.
   The pure transition functions are deliberately reusable by a future PocketNet server. */
const ITEMS = Object.freeze([
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
]);
const TREATMENTS=Object.freeze([
 {id:'wash',name:'Омыть',short:'Вода'},
 {id:'smoke',name:'Окурить',short:'Дым'},
 {id:'gild',name:'Золотить',short:'Золото'}
]);
const RITES=Object.freeze([
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
]);
const DOCTRINES=Object.freeze([
 {id:'goose',name:'Гусь — епископ',desc:'Гусь получает +2 к суду. Любой другой дар —1.',positive:'Гусь благословляет подношение.',negative:'Епископ-гусь неодобрительно гогочет.'},
 {id:'washing',name:'Вечное омовение',desc:'Омытые дары +1. Остальные —1.',positive:'Вода очищает от сомнений.',negative:'Священная вода никого не дождалась.'},
 {id:'height',name:'Ближе к небу',desc:'Высокий алтарь +1. Низкий —1.',positive:'Подношение приближается к небу.',negative:'Подношение унизительно низко.'},
 {id:'quiet',name:'Единственный удар',desc:'Один звон +1. Больше —1.',positive:'Тишина после первого звона почтена.',negative:'Лишние удары оскорбляют тишину.'},
 {id:'thunder',name:'Тройное громыхание',desc:'Три звона +1. Меньше —1.',positive:'Три грома услышаны.',negative:'Божеству недодали грома.'},
 {id:'white',name:'Светлая ересь',desc:'Белое подношение +1. Иное —1.',positive:'Белизна признана священной.',negative:'Это недостаточно белое для собора.'},
 {id:'iron',name:'Железная вера',desc:'Металлическое подношение +1. Иное —1.',positive:'Звучит священный металл.',negative:'Церковь требует металла.'},
 {id:'food',name:'Съедобная истина',desc:'Пища +1. Иное —1.',positive:'Вера поддерживается пищей.',negative:'Жрецы забыли кормить веру.'}
]);
const MAX_ROUNDS=5;
const START_FAITH=6;
const MAX_FAITH=10;
const validItem=id=>ITEMS.some(x=>x.id===id);
const idSet=x=>new Set(x.map(a=>a.id));
const doctrineSet=idSet(DOCTRINES);
const treatSet=idSet(TREATMENTS);
const getItem=id=>ITEMS.find(x=>x.id===id)||null;
const getDoctrine=id=>DOCTRINES.find(x=>x.id===id)||null;
const getRite=s=>RITES[s.order[s.round]];
const defaultAction=()=>({itemId:null,treatment:null,bell:1,height:'low'});
function random32(seed) { let x=(seed>>>0)||0x6d2b79f5; return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};}
function createGame(seed=0x6ab52d19) {
 const number=Number.isInteger(seed)?(seed>>>0):0x6ab52d19;
 const rand=random32(number);const order=RITES.map((_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 return {schema:2,seed:number,order:order.slice(0,MAX_ROUNDS),round:0,faith:START_FAITH,
 phase:'play',actions:defaultAction(),doctrines:[],history:[],judgment:null,offers:[],councilUsed:false};
}
function setAction(state,patch){
 if(state.phase!=='play')return state;
 const next={...state.actions};
 if(Object.hasOwn(patch,'itemId')&&(patch.itemId===null||validItem(patch.itemId)))next.itemId=patch.itemId;
 if(Object.hasOwn(patch,'treatment')&&(patch.treatment===null||treatSet.has(patch.treatment)))next.treatment=patch.treatment;
 if([1,2,3].includes(patch.bell))next.bell=patch.bell;
 if(['low','high'].includes(patch.height))next.height=patch.height;
 return {...state,actions:next};
}
function doctrineEffect(id,action){
 const item=getItem(action.itemId);
 const pass=({
  goose:()=>item?.id==='goose',washing:()=>action.treatment==='wash',height:()=>action.height==='high',
  quiet:()=>action.bell===1,thunder:()=>action.bell===3,white:()=>item?.color==='white',
  iron:()=>item?.material==='metal',food:()=>item?.kind==='food'
 })[id];
 if(!pass)return {delta:0,text:''};
 const good=!!pass(),d=getDoctrine(id);
 return {delta:good?(id==='goose'?2:1):-1,text:good?d.positive:d.negative};
}
function evaluateRite(rite,action,doctrines=[]){
 const item=getItem(action.itemId);if(!item)throw Error('Missing offering');
 const matches=(field,value)=>field==='material' ? item.material===value:field==='kind'?item.kind===value:
  field==='color'?item.color===value:item.shape===value;
 const taboo=rite.taboo==='metal'?item.material==='metal':rite.taboo==='living'?item.kind==='living':
   rite.taboo==='food'?item.kind==='food':item.color===rite.taboo;
 const criteria=[
  {name:'Дар по знамению',score:matches(rite.need,rite.value)?2:0,max:2},
  {name:'Запрет соблюдён',score:taboo?0:1,max:1},
  {name:'Подготовка',score:action.treatment===rite.treatment?1:0,max:1},
  {name:'Звон',score:action.bell===rite.bell?1:0,max:1},
  {name:'Высота',score:action.height===rite.height?1:0,max:1}
 ];
 const doctrineResults=doctrines.map(id=>({id,...doctrineEffect(id,action)}));
 const score=criteria.reduce((n,c)=>n+c.score,0)+doctrineResults.reduce((n,d)=>n+d.delta,0);
 const verdict=score>=4?'bless':score>=3?'doubt':'wrath';
 const delta=verdict==='bless'?2:verdict==='wrath'?-2:0;
 // Four authored miracle families arise from real actions, not a random joke generator.
 const miracleId=item.id==='goose'?'goose':action.treatment==='gild'?'gilded':
  action.bell===3?'thunder':'ash';
 const miracleText={
  goose:'Гусь оглядел прихожан и объявил себя единственным настоящим епископом.',
  gilded:'Небо пролилось золотой пылью. ОГО потребовал выдать её за пожертвования.',
  thunder:'Колокол ударил снова без участия звонаря. Никто не посмел возразить.',
  ash:'С алтаря поднялся клуб пыли. Совет признал его священным дымом.'
 }[miracleId];
 return {score,criteria,doctrineResults,verdict,faithDelta:delta,selected:item.id,miracleId,miracleText};
}
function makeOffers(state,judgment){
 const item=getItem(state.actions.itemId);
 const order=[
  item.id==='goose'?'goose':item.kind==='food'?'food':item.material==='metal'?'iron':'white',
  state.actions.treatment==='wash'?'washing':state.actions.height==='high'?'height':'quiet',
  'height','thunder','quiet','washing','food','white','iron','goose'
 ];
 const selected=[];for(const id of order)if(!state.doctrines.includes(id)&&!selected.includes(id)){selected.push(id);if(selected.length===2)break;}
 return selected;
}
function commitRite(state){
 if(state.phase!=='play'||!getItem(state.actions.itemId))return state;
 const rite=getRite(state);
 const judgment=evaluateRite(rite,state.actions,state.doctrines);
 const faith=Math.max(0,Math.min(MAX_FAITH,state.faith+judgment.faithDelta));
 const event={round:state.round+1,riteId:rite.id,riteTitle:rite.title,itemId:state.actions.itemId,
  actions:{...state.actions},...judgment,faithAfter:faith,adopted:null};
 const history=[...state.history,event];
 return {...state,faith,phase:'judgment',judgment,history,offers:makeOffers(state,judgment)};
}
function continueFromJudgment(state){
 if(state.phase!=='judgment')return state;
 if(state.faith===0||state.round===MAX_ROUNDS-1)return {...state,phase:'end',offers:[]};
 return {...state,phase:'dogma'};
}
function chooseDoctrine(state,id){
 if(state.phase!=='dogma'||!state.offers.includes(id))return state;
 const doctrines=[...state.doctrines,id].slice(-3);
 const history=state.history.map((x,i)=>i===state.round?{...x,adopted:id}:x);
 return {...state,doctrines,history,round:state.round+1,phase:'play',
  actions:defaultAction(),judgment:null,offers:[]};
}
function conveneCouncil(state){
 if(state.phase!=='play'||state.councilUsed||state.doctrines.length===0||state.faith<2)return state;
 return {...state,councilUsed:true,faith:state.faith-1,doctrines:state.doctrines.slice(1)};
}
function getBestPossible(state){
 const rite=getRite(state);let best=-999;
 for(const item of ITEMS)for(const treatment of TREATMENTS)for(const bell of [1,2,3])for(const height of ['low','high']){
  best=Math.max(best,evaluateRite(rite,{itemId:item.id,treatment:treatment.id,bell,height},state.doctrines).score);
 }
 return best;
}
function loadGame(raw){
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
  if(raw.history.length!==raw.round+(raw.phase==='play'?0:1) && !(raw.phase==='end'&&raw.faith===0))return null;
  if(raw.history.some(x=>!x||!RITES.some(r=>r.id===x.riteId)||!validItem(x.itemId)))return null;
  return {...raw,actions:clean,councilUsed:raw.councilUsed===true,
   offers:Array.isArray(raw.offers)?raw.offers.filter(id=>doctrineSet.has(id)).slice(0,2):[]};
 }catch{return null}
}
function isWin(state){return state.phase==='end'&&state.faith>0;}

const LIMIT_PLAYERS=5,ROUND_MS=125000,JUDGMENT_MS=16000,COUNCIL_MS=28000;
const events=s=>[{type:'state',payload:view(s)}];
const notice=(p,msg)=>[{type:'notice',to:p.id,payload:msg}];
const view=s=>({...s}); // Entire state intentionally PUBLIC; never put secret instructions in this state.
const ids=s=>s.players.map(p=>p.id);
const cleanChoice=p=>({
 itemId:validItem(p?.itemId)?p.itemId:null,
 treatment:treatSet.has(p?.treatment)?p.treatment:null,
 bell:[1,2,3].includes(p?.bell)?p.bell:1,
 height:['high','low'].includes(p?.height)?p.height:'low'
});
const defaultChoice=()=>({itemId:'bread',treatment:'wash',bell:1,height:'low'});
const allDone=(s,bag)=>s.players.every(p=>!!bag[p.id]);
const nextRevision=s=>{s.revision++;return {state:s,events:events(s)};};
const enterPhase=(s,phase)=>{
 s.phase=phase;s.match.phase=phase;
 const now=Date.now();
 s.deadlineAt=phase==='play'?now+ROUND_MS:phase==='judgment'?now+JUDGMENT_MS:
  phase==='dogma'?now+COUNCIL_MS:0;
 s.phaseId=s.match.round+':'+phase;
 s.acks={};s.votes={};s.ready={};
};
function concludeOffering(s){
 if(s.phase!=='play')return;
 const people=s.players;
 const contributions=people.map(p=>{
  const action=cleanChoice(s.choices[p.id]);const full={...defaultChoice(),...action};
  const result=evaluateRite(getRite(s.match),full,s.match.doctrines);
  return {playerId:p.id,name:p.name,action:full,score:result.score,locked:!!s.ready[p.id]};
 });
 const teamScore=Math.round(contributions.reduce((n,c)=>n+c.score,0)/people.length);
 const verdict=teamScore>=4?'bless':teamScore>=3?'doubt':'wrath';
 const faithDelta=verdict==='bless'?2:verdict==='wrath'?-2:0;
 const lead=contributions.reduce((best,c)=>!best||c.score>best.score?c:best,null);
 const m=commitRite({...s.match,actions:lead.action});
 const oldFaith=s.match.faith;
 m.judgment={...m.judgment,score:teamScore,verdict,faithDelta,contributions};
 m.faith=Math.max(0,Math.min(MAX_FAITH,oldFaith+faithDelta));
 const last=m.history.length-1;
 m.history[last]={...m.history[last],score:teamScore,verdict,faithDelta,faithAfter:m.faith,
   contributions};
 s.match=m;s.choices={...s.choices};
 enterPhase(s,'judgment');
}
function settleJudgment(s){
 if(s.phase!=='judgment')return;
 const m=continueFromJudgment(s.match);s.match=m;
 if(m.phase==='end'){s.phase='end';s.deadlineAt=0;s.phaseId=m.round+':end';}
 else enterPhase(s,'dogma');
}
function settleVotes(s){
 if(s.phase!=='dogma')return;
 const choices=s.match.offers,counts=choices.map(x=>s.players.reduce((total,p)=>total+(s.votes[p.id]===x?1:0),0));
 const winner=counts[1]>counts[0]?choices[1]:choices[0];
 s.match=chooseDoctrine(s.match,winner);
 s.choices={};enterPhase(s,'play');
}
function advance(s,now=Date.now()){
 if(!s.match||!s.deadlineAt||now<s.deadlineAt)return false;
 if(s.phase==='play')concludeOffering(s);
 else if(s.phase==='judgment')settleJudgment(s);
 else if(s.phase==='dogma')settleVotes(s);
 else return false;
 s.revision++;return true;
}
function reconcile(s,players){
 s.players=players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
 if(!players.some(p=>p.id===s.host))s.host=players[0]?.id||null;
 const allowed=new Set(ids(s));
 for(const key of ['choices','ready','acks','votes','lastSeq'])
  for(const id of Object.keys(s[key]||{}))if(!allowed.has(id))delete s[key][id];
}
const module={
 protocolVersion:1,
 createRoom({player}){
  return {state:{phase:'lobby',phaseId:'lobby',revision:0,
   host:player.id,players:[{id:player.id,name:player.name,verified:!!player.verified}],
   match:null,choices:{},ready:{},acks:{},votes:{},lastSeq:{},deadlineAt:0,matchNo:0}};
 },
 onJoin({state,players}){
  if(state.phase!=='lobby'&&state.phase!=='end')throw Error('match_in_progress');
  if(players.length>LIMIT_PLAYERS)throw Error('room_full');
  reconcile(state,players);return nextRevision(state);
 },
 onLeave({state,players}){
  reconcile(state,players);
  if(state.phase==='play'&&players.length>=MIN_PLAYERS&&allDone(state,state.ready))concludeOffering(state);
  if(state.phase==='judgment'&&players.length>=MIN_PLAYERS&&allDone(state,state.acks))settleJudgment(state);
  if(state.phase==='dogma'&&players.length>=MIN_PLAYERS&&allDone(state,state.votes))settleVotes(state);
  if(players.length<MIN_PLAYERS&&state.phase!=='lobby'&&state.phase!=='end'){
   state.phase='lobby';state.phaseId='lobby';state.match=null;
   state.choices={};state.ready={};state.acks={};state.votes={};state.deadlineAt=0;
  }
  return nextRevision(state);
 },
 onMessage({state,player,payload}){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const advanced=advance(state);
  if(p.type==='sync'||p.type==='pulse')return {state,events:[{type:'state',to:player.id,payload:view(state)},...(advanced?events(state):[])]};
  if(p.type==='start'){
   if(player.id!==state.host)return {state,events:notice(player,'Начать может только создатель.')};
   if(state.phase!=='lobby'&&state.phase!=='end')return {state,events:notice(player,'Партия уже идёт.')};
   if(state.players.length<MIN_PLAYERS||state.players.length>MAX_PLAYERS)
    return {state,events:notice(player,'Нужно от 2 до 5 жрецов.')};
   state.matchNo++;
   const seed=((Date.now()^((state.matchNo*2654435761)>>>0))>>>0);
   state.match=createGame(seed);state.choices={};state.lastSeq={};enterPhase(state,'play');return nextRevision(state);
  }
  if(!state.match)return {state,events:notice(player,'Дождитесь начала игры.')};
  if(typeof p.phaseId!=='string'||p.phaseId!==state.phaseId)
   return {state,events:notice(player,'Обряд уже перешёл в другую фазу. Обновите состояние.')};
  if(!Number.isInteger(p.seq)||p.seq<1||p.seq>1000000)
   return {state,events:notice(player,'Неверный номер действия.')};
  if(p.seq<=(state.lastSeq[player.id]||0))
   return {state,events:[{type:'state',to:player.id,payload:view(state)}]};
  state.lastSeq[player.id]=p.seq;
  if(p.type==='choose'&&state.phase==='play'){
   if(state.ready[player.id])return {state,events:notice(player,'Дар уже запечатан.')};
   const original=state.choices[player.id]||defaultAction();
   const next=setAction({...state.match,phase:'play',actions:original},p.patch||{}).actions;
   state.choices[player.id]=next;return nextRevision(state);
  }
  if(p.type==='lock'&&state.phase==='play'){
   if(!validItem(state.choices[player.id]?.itemId))return {state,events:notice(player,'Сначала выберите дар.')};
   state.ready[player.id]=true;
   if(allDone(state,state.ready))concludeOffering(state);
   return nextRevision(state);
  }
  if(p.type==='unlock'&&state.phase==='play'){
   delete state.ready[player.id];return nextRevision(state);
  }
  if(p.type==='ack'&&state.phase==='judgment'){
   state.acks[player.id]=true;
   if(allDone(state,state.acks))settleJudgment(state);
   return nextRevision(state);
  }
  if(p.type==='vote'&&state.phase==='dogma'){
   if(!state.match.offers.includes(p.id))return {state,events:notice(player,'Неизвестный догмат.')};
   state.votes[player.id]=p.id;
   if(allDone(state,state.votes))settleVotes(state);
   return nextRevision(state);
  }
  return {state,events:notice(player,'Действие сейчас недоступно.')};
 }
};
export default module;
