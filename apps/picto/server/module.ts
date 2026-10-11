import type { PocketModule } from '../../../pocket-server/module-contract.js';
export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 1;

const PROMPTS = [
 'Кот украл луну','Рыба стала королём','Дом улетел в небо','Человек проглотил солнце',
 'Птица принесла ключ','Король потерял корону','Дерево выросло на лодке','Звезда упала в чашку',
 'Облако съело гору','Часы утонули в море','Рыцарь поцеловал дракона','Лиса нашла сокровище',
 'Ключ открыл сердце','Рыба полетела на луну','Медведь построил дом','Солнце спряталось за дверью',
 'Корабль превратился в птицу','Мышь победила великана','Корона лежит на дереве','Пламя танцует под дождём',
 'Дракон боится бабочки','Око наблюдает за замком','Птица унесла дом','Человек ловит звёзды',
 'Змея охраняет цветок','Корабль плывёт по небу','Рыцарь забыл меч','Кот стал невидимым',
 'Луна закрыла дверь','Рыбак поймал облако','Ключ спрятан под горой','Волк смотрит в зеркало',
 'Черепаха несёт замок','Дождь идёт из чайника','Цветок вырос из книги','Король подарил солнце',
 'Дерево держит звезду','Дверь открылась в море','Птица украла часы','Сердце заперто на ключ',
 'Лиса гонится за луной','Рука держит молнию','Лодка перевозит гору','Огонь боится воды'
];
const SYMBOLS = new Set(['sun','moon','star','cloud','rain','wave','fire','tree','flower','bird','fish','cat','human','eye','heart','key','crown','house','door','boat','mountain','arrow','clock','question','hand','book','sword','dragon']);
type Player={id:string;name:string};
type Glyph={id:string;x:number;y:number;r:number;s:number};
type Archive={author:string;name:string;prompt:string;board:Glyph[];correct:number;total:number};
type State={host:string;players:Player[];phase:'lobby'|'compose'|'guess'|'reveal'|'results';round:number;maxRounds:number;author:string;deadline:number;options:string[];correct:number;board:Glyph[];answers:Record<string,number>;history:Archive[];score:number;attempts:number;revision:number};
const rand=(n:number)=>Math.floor(Math.random()*n);
function choices():{options:string[];correct:number}{
 const ids=Array.from({length:PROMPTS.length},(_,i)=>i);
 for(let i=ids.length-1;i>0;i--){const j=rand(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}
 const pick=ids.slice(0,4);return {options:pick.map(i=>PROMPTS[i]),correct:rand(4)};
}
function fresh(s:State){
 const shuffled=choices();s.options=shuffled.options;s.correct=shuffled.correct;
 s.board=[];s.answers={};s.phase='compose';s.deadline=Date.now()+85000;s.revision++;
 s.author=s.players[(s.round-1)%s.players.length]?.id||'';
}
function start(s:State){
 s.round=1;s.maxRounds=s.players.length;s.history=[];s.score=0;s.attempts=0;fresh(s);
}
function reveal(s:State){
 if(s.phase!=='guess')return;
 const submissions=Object.keys(s.answers);
 const correct=submissions.filter(id=>s.answers[id]===s.correct).length;
 s.score+=correct;s.attempts+=submissions.length;
 s.history.push({author:s.author,name:s.players.find(p=>p.id===s.author)?.name||'Участник',prompt:s.options[s.correct],board:s.board.map(g=>({...g})),correct,total:submissions.length});
 s.phase='reveal';s.deadline=Date.now()+11000;s.revision++;
}
function advance(s:State){
 if(s.phase==='compose'){s.phase='guess';s.deadline=Date.now()+38000;s.revision++;}
 else if(s.phase==='guess')reveal(s);
 else if(s.phase==='reveal'){
  if(s.round>=s.maxRounds || s.players.length<2){s.phase='results';s.deadline=0;s.revision++;}
  else{s.round++;fresh(s);}
 }
}
function step(s:State){
 let loops=0;while(s.deadline && Date.now()>=s.deadline && loops++<2 && s.phase!=='results') advance(s);
}
function sanitized(glyphs:unknown):Glyph[]|null {
 if(!Array.isArray(glyphs)||glyphs.length>26)return null;
 const output:Glyph[]=[];
 for(const v of glyphs){
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const g=v as Record<string,unknown>;
  if(!SYMBOLS.has(String(g.id)))return null;
  for(const k of ['x','y','r','s'])if(typeof g[k]!=='number'||!Number.isFinite(g[k]))return null;
  if(Number(g.x)<4||Number(g.x)>96||Number(g.y)<5||Number(g.y)>95||Number(g.r)<-180||Number(g.r)>180||Number(g.s)<0.55||Number(g.s)>2.2)return null;
  output.push({id:String(g.id),x:Math.round(Number(g.x)*10)/10,y:Math.round(Number(g.y)*10)/10,r:Math.round(Number(g.r)),s:Math.round(Number(g.s)*100)/100});
 }
 return output;
}
const strip=(s:State,id:string)=>({
 host:s.host,players:s.players,phase:s.phase,round:s.round,maxRounds:s.maxRounds,author:s.author,deadline:s.deadline,
 board:s.board,revision:s.revision,options:s.phase==='guess'||s.phase==='reveal'||s.phase==='results'?s.options:[],
 correct:s.phase==='reveal'||s.phase==='results'?s.correct:null,
 prompt:id===s.author&&s.phase==='compose'?s.options[s.correct]:null,
 answered:Object.keys(s.answers),myAnswer:s.answers[id]??null,
 answers:s.phase==='reveal'?s.answers:{},history:s.phase==='results'?s.history:[],score:s.score,attempts:s.attempts
});
const emit=(s:State)=>s.players.map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}));
const notice=(id:string,message:string)=>[{type:'notice',to:id,payload:message}];
function received(s:State,id:string){return s.players.some(p=>p.id===id);}
const module: PocketModule<State>={
 protocolVersion:1,
 createRoom({player}) {
  return {state:{host:player.id,players:[player],phase:'lobby',round:0,maxRounds:0,author:'',deadline:0,options:[],correct:0,board:[],answers:{},history:[],score:0,attempts:0,revision:0}};
 },
 onJoin({state,player,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  state.players=players;state.revision++;return {state,events:emit(state)};
 },
 onLeave({state,player,players}){
  state.players=players;if(state.host===player.id)state.host=players[0]?.id||'';
  if(state.phase!=='lobby'&&state.phase!=='results'){
   if(players.length<2){state.phase='results';state.deadline=0;}
   else if(state.author===player.id){if(state.phase==='guess')reveal(state);else {state.round++;if(state.round>state.maxRounds){state.phase='results';state.deadline=0;}else fresh(state);}}
   else if(state.phase==='guess'&&Object.keys(state.answers).length>=players.length-1)reveal(state);
  }
  state.revision++;return {state,events:emit(state)};
 },
 onMessage({state,player,payload}){
  const raw=(payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{}) as Record<string,unknown>;
  const id=player.id;
  if(raw.type==='sync')return {state,events:[{type:'state',to:id,payload:strip(state,id)}]};
  if(!received(state,id))return {state,events:notice(id,'Ты не участник этой комнаты.')};
  const before=state.revision;step(state);
  if(raw.type==='pulse')return {state,events:before===state.revision?[]:emit(state)};
  if(raw.type==='start'){
   if(state.host!==id||state.phase!=='lobby'||state.players.length<MIN_PLAYERS)return {state,events:notice(id,'Создатель может начать после подключения хотя бы двух игроков.')};
   start(state);return {state,events:emit(state)};
  }
  if(raw.type==='again'){
   if(state.host!==id||state.phase!=='results'||state.players.length<MIN_PLAYERS)return {state,events:notice(id,'Новую партию запускает создатель комнаты.')};
   start(state);return {state,events:emit(state)};
  }
  if(raw.type==='edit'){
   if(state.phase!=='compose'||state.author!==id)return {state,events:notice(id,'Сейчас нельзя редактировать композицию.')};
   const board=sanitized(raw.glyphs);if(!board)return {state,events:notice(id,'Недопустимые параметры символов.')};
   state.board=board;state.revision++;return {state,events:emit(state)};
  }
  if(raw.type==='publish'){
   if(state.phase!=='compose'||state.author!==id)return {state,events:notice(id,'Отправить сообщение может только автор.')};
   advance(state);return {state,events:emit(state)};
  }
  if(raw.type==='answer'){
   if(state.phase!=='guess'||state.author===id||id in state.answers)return {state,events:notice(id,'Ответ сейчас недоступен.')};
   if(!Number.isInteger(raw.choice)||Number(raw.choice)<0||Number(raw.choice)>3)return {state,events:notice(id,'Выбери один из четырёх вариантов.')};
   state.answers[id]=Number(raw.choice);state.revision++;
   if(Object.keys(state.answers).length>=state.players.length-1)reveal(state);
   return {state,events:emit(state)};
  }
  if(raw.type==='next'){
   if(state.host!==id||state.phase!=='reveal')return {state,events:notice(id,'Следующий раунд запускает создатель.')};
   advance(state);return {state,events:emit(state)};
  }
  return {state,events:notice(id,'Неизвестное действие.')};
 }
};
export default module;
