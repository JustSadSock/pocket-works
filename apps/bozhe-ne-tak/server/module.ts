// Authoritative BNT v0.4 role-driven rituals. Immutable PocketNet v2 snapshot.
// State contains secrets; viewForPlayer projects only the recipient's own clues.
export const MIN_PLAYERS=2,MAX_PLAYERS=5,RULESET_VERSION=2;
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


const TIME_PLAY=145000,TIME_JUDGE=19000,TIME_VOTE=34000;
const TASKS=['need','taboo','offering','bell','height'];
const roles=n=>n===2?[['need','taboo','offering'],['bell','height']]:
 n===3?[['need','taboo'],['offering'],['bell','height']]:
 n===4?[['need'],['taboo'],['offering'],['bell','height']]:
 [['need'],['taboo'],['offering'],['bell'],['height']];
const labels={need:'Пророк знамений',taboo:'Хранитель запретов',offering:'Ризничий',bell:'Звонарь',height:'Алтарщик'};
const announcements={help:'Нужна подсказка',warn:'Проверьте запрет!',agree:'Согласен с обрядом',urgent:'Скоро суд!'};
const signText={
 need:r=>({color:'Нужен цвет',shape:'Нужна форма',kind:'Нужен вид',material:'Нужен материал'}[r.need]||'Нужна метка')+': '+({
 white:'белый',gold:'золотой',silver:'серебряный',dark:'тёмный',round:'круглый',long:'вытянутый',
 angular:'угловатый',food:'пища',metal:'металл'
 }[r.value]||r.value),
 taboo:r=>'Запрещено: '+({metal:'металл',living:'живые существа',food:'пища',gold:'золотой цвет',silver:'серебряный цвет'}[r.taboo]||r.taboo)
};
const has=(s,id,task)=>s.assignments[id]?.includes(task)||false;
const roster=s=>s.players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
const emit=()=>[{type:'state',payload:null}]; // Hub replaces payload with opt-in personal projection.
const note=(player,txt)=>[{type:'notice',to:player.id,payload:txt}];
const bump=s=>({state:{...s,revision:s.revision+1},events:emit()});
const taskOwners=s=>Object.fromEntries(s.players.flatMap((p,i)=>s.assignments[p.id].map(task=>[task,p.id])));
const initRoles=s=>{
 const scheme=roles(s.players.length);
 s.assignments=Object.fromEntries(s.players.map((p,i)=>[p.id,scheme[(i+(s.match?.round||0))%s.players.length]]));
};
const clearRound=s=>{
 s.altar={itemId:null,treatment:null,bell:null,height:null};
 s.done={};s.locked={};s.announcements=[];s.votes={};s.acks={};
};
function newPhase(s,phase){
 s.phase=phase;s.phaseNonce=(s.phaseNonce||0)+1;
 s.phaseId=s.match?.round+':'+phase+':'+s.phaseNonce;
 s.deadlineAt=phase==='play'?Date.now()+TIME_PLAY:phase==='judgment'?Date.now()+TIME_JUDGE:
  phase==='dogma'?Date.now()+TIME_VOTE:0;
 if(phase==='play')clearRound(s);
 if(phase==='judgment')s.acks={};
 if(phase==='dogma')s.votes={};
}
function isReady(s){
 return TASKS.every(task=>s.done[task]===true)&&s.players.every(p=>s.locked[p.id]===true);
}
function playResult(s){
 if(s.phase!=='play')return;
 const a={itemId:s.altar.itemId||'bread',treatment:s.altar.treatment||'wash',
  bell:s.altar.bell||1,height:s.altar.height||'low'};
 const previous=s.match;
 const next=commitRite({...previous,actions:a});
 if(next===previous)throw Error('cannot_resolve_rite');
 next.judgment={...next.judgment,unfinished:TASKS.filter(k=>!s.done[k]),
  lockedCount:Object.values(s.locked).filter(Boolean).length,contributors:taskOwners(s)};
 next.history[next.history.length-1]={...next.history[next.history.length-1],
   unfinished:next.judgment.unfinished};
 s.match=next;newPhase(s,'judgment');
}
function continueJudgment(s){
 if(s.phase!=='judgment')return;
 s.match=continueFromJudgment(s.match);
 if(s.match.phase==='end'){s.phase='end';s.phaseId=s.match.round+':end';s.deadlineAt=0;}
 else newPhase(s,'dogma');
}
function concludeCouncil(s){
 if(s.phase!=='dogma')return;
 const offers=s.match.offers||[];
 const scores=offers.map(x=>Object.values(s.votes).filter(v=>v===x).length);
 s.match=chooseDoctrine(s.match,scores[1]>scores[0]?offers[1]:offers[0]);
 initRoles(s);newPhase(s,'play');
}
function advance(s){
 if(!s.deadlineAt||Date.now()<s.deadlineAt)return false;
 if(s.phase==='play')playResult(s);
 else if(s.phase==='judgment')continueJudgment(s);
 else if(s.phase==='dogma')concludeCouncil(s);
 else return false;
 s.revision++;
 return true;
}
function matchView(m){
 return m?{phase:m.phase,round:m.round,faith:m.faith,doctrines:[...m.doctrines],
  offers:[...m.offers],judgment:m.judgment,history:m.history.map(h=>({
   round:h.round,riteTitle:h.riteTitle,itemId:h.itemId,score:h.score,verdict:h.verdict,
   miracleText:h.miracleText,adopted:h.adopted,faithAfter:h.faithAfter,unfinished:h.unfinished||[]
  }))}:null;
}
const game={
 protocolVersion:1,
 viewForPlayer({state:s,player}){
  const tasks=s.assignments?.[player.id]||[];
  const rite=s.match&&s.phase==='play'?getRite(s.match):null;
  const clues={};
  if(rite){
   if(tasks.includes('need'))clues.need={field:rite.need,value:rite.value,text:signText.need(rite)};
   if(tasks.includes('taboo'))clues.taboo={value:rite.taboo,text:signText.taboo(rite)};
   if(tasks.includes('offering'))clues.treatment={value:rite.treatment,text:'Подготовка: '+({
    wash:'омыть',smoke:'окурить',gild:'позолотить'}[rite.treatment]||rite.treatment)};
   if(tasks.includes('bell'))clues.bell={value:rite.bell,text:'Колокольных ударов: '+rite.bell};
   if(tasks.includes('height'))clues.height={value:rite.height,text:rite.height==='high'?'Вознести дар':'Оставить у подножия'};
  }
  return {
   phase:s.phase,phaseId:s.phaseId,revision:s.revision,serverNow:Date.now(),
   host:s.host,players:roster(s),assignments:s.assignments,match:matchView(s.match),
   riteTitle:rite?.title||null,ownTasks:tasks,ownClues:clues,
   altar:{...s.altar},done:{...s.done},locked:{...s.locked},
   announcements:s.announcements.map(x=>({...x})),votes:{...s.votes},acks:{...s.acks},
   deadlineAt:s.deadlineAt,ownSeq:s.lastSeq?.[player.id]||0
  };
 },
 createRoom({player}){
  const s={phase:'lobby',phaseId:'lobby',revision:0,host:player.id,
   players:[{id:player.id,name:player.name,verified:!!player.verified}],
   assignments:{},match:null,altar:{itemId:null,treatment:null,bell:null,height:null},
   done:{},locked:{},announcements:[],votes:{},acks:{},lastSeq:{},deadlineAt:0,
   phaseNonce:0,matchNo:0};
  initRoles(s);return {state:s};
 },
 onJoin({state:s,players}){
  if(s.phase!=='lobby'&&s.phase!=='end')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  s.players=players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
  initRoles(s);return bump(s);
 },
 onLeave({state:s,players}){
  s.players=players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
  if(!s.players.some(p=>p.id===s.host))s.host=s.players[0]?.id||null;
  const ids=new Set(s.players.map(p=>p.id));
  for(const key of ['locked','votes','acks','lastSeq'])for(const id of Object.keys(s[key]||{}))
   if(!ids.has(id))delete s[key][id];
  initRoles(s);
  if(s.players.length<MIN_PLAYERS&&s.phase!=='lobby'&&s.phase!=='end'){
   s.phase='lobby';s.phaseId='lobby';s.match=null;s.deadlineAt=0;clearRound(s);
  }else if(s.phase==='play'){newPhase(s,'play');}
  else if(s.phase==='judgment'&&s.players.every(p=>s.acks[p.id]))continueJudgment(s);
  else if(s.phase==='dogma'&&s.players.every(p=>s.votes[p.id]))concludeCouncil(s);
  return bump(s);
 },
 onMessage({state:s,player,payload}){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const advanced=advance(s);
  if(p.type==='sync'||p.type==='pulse')
   return {state:s,events:[{type:'state',to:player.id,payload:null},...(advanced?emit():[])]};
  if(p.type==='start'){
   if(s.host!==player.id)return {state:s,events:note(player,'Начать может только настоятель.')};
   if(s.phase!=='lobby'&&s.phase!=='end')return {state:s,events:note(player,'Обряд уже начат.')};
   if(s.players.length<MIN_PLAYERS||s.players.length>MAX_PLAYERS)
    return {state:s,events:note(player,'Нужно 2–5 жрецов.')};
   s.matchNo++;
   s.match=createGame((Date.now()^(s.matchNo*2654435761))>>>0);
   s.lastSeq={};initRoles(s);newPhase(s,'play');return bump(s);
  }
  if(!s.match)return {state:s,events:note(player,'Ждите начала обряда.')};
  if(typeof p.phaseId!=='string'||p.phaseId!==s.phaseId)
   return {state:s,events:note(player,'Фаза уже изменилась. Обновите ритуал.')};
  if(!Number.isInteger(p.seq)||p.seq<1||p.seq>10000000)return {state:s,events:note(player,'Неверный номер действия.')};
  if(p.seq<=(s.lastSeq[player.id]||0))return {state:s,events:[{type:'state',to:player.id,payload:null}]};
  s.lastSeq[player.id]=p.seq;
  if(s.phase==='play'){
   if(p.type==='call'&&Object.hasOwn(announcements,p.kind)&&typeof p.kind==='string'){
    const cooldown=s.announcements.filter(x=>x.by===player.id);
    if(cooldown.length>=6)return {state:s,events:note(player,'Небесная доска заполнена вашими знаками.')};
    s.announcements=[...s.announcements,{by:player.id,kind:p.kind,text:announcements[p.kind]}].slice(-12);
    return bump(s);
   }
   if(s.locked[player.id])return {state:s,events:note(player,'Вы уже запечатали свою работу.')};
   if(p.type==='reveal'&&has(s,player.id,p.task)&&['need','taboo'].includes(p.task)){
    const rite=getRite(s.match);
    s.done[p.task]=true;
    s.announcements=[...s.announcements,{by:player.id,kind:'revelation',
      text:signText[p.task](rite)}].slice(-12);
    return bump(s);
   }
   if(p.type==='set'&&typeof p.task==='string'&&has(s,player.id,p.task)){
    if(p.task==='offering'){
     if(!validItem(p.itemId)||!treatSet.has(p.treatment))return {state:s,events:note(player,'Нужен настоящий дар и способ подготовки.')};
     s.altar.itemId=p.itemId;s.altar.treatment=p.treatment;s.done.offering=true;return bump(s);
    }
    if(p.task==='bell'&&[1,2,3].includes(p.value)){s.altar.bell=p.value;s.done.bell=true;return bump(s);}
    if(p.task==='height'&&['low','high'].includes(p.value)){s.altar.height=p.value;s.done.height=true;return bump(s);}
   }
   if(p.type==='lock'&&s.assignments[player.id].every(task=>s.done[task]===true)){
    s.locked[player.id]=true;
    if(isReady(s))playResult(s);
    return bump(s);
   }
   if(p.type==='unlock'){delete s.locked[player.id];return bump(s);}
   return {state:s,events:note(player,'Этот инструмент принадлежит другому жрецу.')};
  }
  if(s.phase==='judgment'&&p.type==='ack'){
   s.acks[player.id]=true;
   if(s.players.every(w=>s.acks[w.id]))continueJudgment(s);
   return bump(s);
  }
  if(s.phase==='dogma'&&p.type==='vote'&&s.match.offers.includes(p.id)){
   s.votes[player.id]=p.id;
   if(s.players.every(w=>s.votes[w.id]))concludeCouncil(s);
   return bump(s);
  }
  return {state:s,events:note(player,'Действие сейчас недоступно.')};
 }
};
export default game;
