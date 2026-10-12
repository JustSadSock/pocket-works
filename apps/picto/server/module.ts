import type { PocketModule } from '../../../pocket-server/module-contract.js';
export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 2;


const WORDS = {
 cat:['Кот','кота','кота','коту','котом'],
 bird:['Птица','птицу','птицы','птице','птицей'],
 fish:['Рыба','рыбу','рыбы','рыбе','рыбой'],
 dragon:['Дракон','дракона','дракона','дракону','драконом'],
 human:['Человек','человека','человека','человеку','человеком'],
 key:['Ключ','ключ','ключа','ключу','ключом'],
 crown:['Корона','корону','короны','короне','короной'],
 heart:['Сердце','сердце','сердца','сердцу','сердцем'],
 moon:['Луна','луну','луны','луне','луной'],
 sun:['Солнце','солнце','солнца','солнцу','солнцем'],
 star:['Звезда','звезду','звезды','звезде','звездой'],
 clock:['Часы','часы','часов','часам','часами'],
 book:['Книга','книгу','книги','книге','книгой'],
 flower:['Цветок','цветок','цветка','цветку','цветком'],
 door:['Дверь','дверь','двери','двери','дверью'],
 house:['Дом','дом','дома','дому','домом'],
 tree:['Дерево','дерево','дерева','дереву','деревом'],
 mountain:['Гора','гору','горы','горе','горой'],
 boat:['Лодка','лодку','лодки','лодке','лодкой'],
 cloud:['Облако','облако','облака','облаку','облаком'],
 fire:['Огонь','огонь','огня','огню','огнём']
} as const;
type Word = keyof typeof WORDS;
type Kind = 'action'|'space'|'roles'|'change'|'journey'|'exchange';
type Scene = {kind:Kind; options:[string,string,string,string]};
const w=(id:Word,index:number)=>WORDS[id][index].toLocaleLowerCase('ru');
const W=(id:Word)=>WORDS[id][0];
// Each group deliberately contains the same recognizable nouns. Merely identifying
// a cat and key must NEVER reveal the correct answer; agency, order and spatial
// grammar are what the composer communicates.
const actionPairs:[Word,Word][]=[
 ['cat','key'],['bird','key'],['dragon','crown'],['human','heart'],['cat','moon'],
 ['bird','clock'],['fish','star'],['human','crown'],['dragon','flower'],['bird','heart'],
 ['cat','book'],['human','door'],['dragon','key'],['cat','flower'],['bird','sun'],
 ['fish','flower'],['human','star'],['dragon','clock'],['bird','crown'],['cat','clock'],
 ['human','book'],['fish','key'],['dragon','house'],['cat','house'],['bird','moon'],
 ['human','fire'],['cat','sword'],['dragon','moon'],['human','moon'],['fish','heart']
];
const spacePairs:[Word,Word][]=[
 ['key','house'],['star','mountain'],['bird','tree'],['heart','door'],['crown','boat'],
 ['clock','house'],['flower','book'],['moon','mountain'],['fish','boat'],['sun','cloud'],
 ['book','door'],['key','tree'],['dragon','house'],['cat','boat'],['bird','cloud'],
 ['heart','tree'],['crown','mountain'],['flower','door'],['star','boat'],['fish','cloud'],
 ['boat','mountain'],['cat','door'],['fire','boat'],['moon','house'],['crown','tree']
];
const rolePairs:[Word,Word][]=[
 ['cat','bird'],['bird','fish'],['human','cat'],['dragon','bird'],['cat','fish'],
 ['human','dragon'],['fish','human'],['fish','dragon'],['dragon','cat'],['bird','human'],
 ['fish','cat'],['bird','dragon']
];
const changePairs:[Word,Word][]=[
 ['cat','bird'],['bird','fish'],['dragon','bird'],['cat','dragon'],['human','fish'],
 ['sun','moon'],['boat','bird'],['tree','flower'],['house','mountain'],['star','moon'],
 ['key','heart'],['human','dragon'],['cat','fish'],['cloud','fire'],['tree','book'],
 ['fish','star'],['book','door'],['crown','sun']
];
const journeyTriples:[Word,Word,Word][]=[
 ['bird','key','house'],['cat','crown','tree'],['human','flower','door'],['dragon','clock','mountain'],
 ['fish','star','boat'],['bird','heart','moon'],['human','book','tree'],['dragon','key','house'],
 ['cat','star','boat'],['bird','crown','door'],['human','moon','boat'],['cat','key','door'],
 ['bird','flower','house'],['dragon','heart','tree'],['human','clock','mountain'],
 ['cat','book','house'],['bird','book','moon'],['human','heart','door'],
 ['dragon','flower','boat'],['fish','key','tree'],['human','crown','house'],
 ['bird','sun','mountain'],['cat','flower','house'],['dragon','star','door']
];
const exchangeTriples:[Word,Word,Word][]=[
 ['bird','key','cat'],['human','flower','dragon'],['cat','crown','human'],
 ['dragon','book','bird'],['fish','heart','cat'],['bird','clock','human'],
 ['human','key','bird'],['cat','flower','dragon'],['fish','star','bird'],
 ['dragon','crown','cat'],['bird','book','fish'],['human','moon','cat'],
 ['cat','heart','fish'],['dragon','key','human'],['fish','flower','human'],
 ['human','clock','dragon'],['cat','star','bird'],['bird','crown','dragon']
];
const SCENES:Scene[]=[
 ...actionPairs.map(([a,b]):Scene=>({kind:'action',options:[
  `${W(a)} ищет ${w(b,1)}`,`${W(a)} прячет ${w(b,1)}`,
  `${W(a)} защищает ${w(b,1)}`,`${W(a)} теряет ${w(b,1)}`
 ]})),
 ...spacePairs.map(([a,b]):Scene=>({kind:'space',options:[
  `${W(a)} над ${w(b,4)}`,`${W(a)} под ${w(b,4)}`,
  `${W(a)} внутри ${w(b,2)}`,`${W(a)} рядом с ${w(b,4)}`
 ]})),
 ...rolePairs.map(([a,b]):Scene=>({kind:'roles',options:[
  `${W(a)} спасает ${w(b,1)}`,`${W(b)} спасает ${w(a,1)}`,
  `${W(a)} преследует ${w(b,1)}`,`${W(b)} преследует ${w(a,1)}`
 ]})),
 ...changePairs.map(([a,b]):Scene=>({kind:'change',options:[
  `${W(a)} превращается в ${w(b,1)}`,`${W(b)} превращается в ${w(a,1)}`,
  `${W(a)} притворяется ${w(b,4)}`,`${W(b)} притворяется ${w(a,4)}`
 ]})),
 ...journeyTriples.map(([a,b,c]):Scene=>({kind:'journey',options:[
  `${W(a)} несёт ${w(b,1)} к ${w(c,3)}`,
  `${W(a)} уносит ${w(b,1)} от ${w(c,2)}`,
  `${W(a)} прячет ${w(b,1)} за ${w(c,4)}`,
  `${W(a)} ищет ${w(b,1)} возле ${w(c,2)}`
 ]})),
 ...exchangeTriples.map(([a,b,c]):Scene=>({kind:'exchange',options:[
  `${W(a)} дарит ${w(b,1)} ${w(c,3)}`,
  `${W(c)} дарит ${w(b,1)} ${w(a,3)}`,
  `${W(a)} забирает ${w(b,1)} у ${w(c,2)}`,
  `${W(c)} забирает ${w(b,1)} у ${w(a,2)}`
 ]}))
];
export const SCENE_COUNT=SCENES.length;
export const TOTAL_TASKS=SCENES.length*4;
const KIND_ORDER:Kind[]=['action','space','roles','change','journey','exchange'];
const shuffle=<T>(xs:T[]):T[]=>{const result=[...xs];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const SYMBOLS=new Set([
 'sun','moon','star','cloud','rain','wave','fire','tree','flower','bird','fish','cat','human','eye',
 'heart','key','crown','house','door','boat','mountain','arrow','clock','question','hand','book','sword','dragon',
 'not','swap','loop','path','mask','spark'
]);

type Player={id:string;name:string};
type Glyph={id:string;x:number;y:number;r:number;s:number};
type Archive={author:string;name:string;prompt:string;board:Glyph[];correct:number;total:number};
type State={host:string;players:Player[];phase:'lobby'|'compose'|'guess'|'reveal'|'results';round:number;maxRounds:number;author:string;deadline:number;options:string[];correct:number;board:Glyph[];answers:Record<string,number>;history:Archive[];score:number;attempts:number;revision:number;usedScenes:number[];kind:Kind;modeDeck:Kind[]};
const rand=(n:number)=>Math.floor(Math.random()*n);
function choices(s:State):{options:string[];correct:number;kind:Kind}{
 if(!s.modeDeck.length)s.modeDeck=shuffle(KIND_ORDER);
 const kind=s.modeDeck.pop()!;
 const candidates=SCENES.map((scene,i)=>scene.kind===kind&&!s.usedScenes.includes(i)?i:-1).filter(i=>i>=0);
 if(!candidates.length)throw Error('scene_bank_exhausted');
 const index=candidates[rand(candidates.length)];
 s.usedScenes.push(index);
 const correctOriginal=rand(4);
 const order=shuffle([0,1,2,3]);
 return {options:order.map(i=>SCENES[index].options[i]),correct:order.indexOf(correctOriginal),kind};
}
function fresh(s:State){
 const chosen=choices(s);s.options=chosen.options;s.correct=chosen.correct;s.kind=chosen.kind;
 s.board=[];s.answers={};s.phase='compose';s.deadline=Date.now()+85000;s.revision++;
 s.author=s.players[(s.round-1)%s.players.length]?.id||'';
}
function start(s:State){
 s.round=1;s.maxRounds=s.players.length;s.history=[];s.score=0;s.attempts=0;s.usedScenes=[];s.modeDeck=[];fresh(s);
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
 board:s.board,revision:s.revision,kind:s.kind,authorOptions:id===s.author&&s.phase==='compose'?s.options:[],options:s.phase==='guess'||s.phase==='reveal'||s.phase==='results'?s.options:[],
 correct:s.phase==='reveal'||s.phase==='results'?s.correct:null,
 prompt:id===s.author&&s.phase==='compose'?s.options[s.correct]:null,
 answered:Object.keys(s.answers),myAnswer:s.answers[id]??null,
 answers:s.phase==='reveal'?s.answers:{},history:s.phase==='results'||s.phase==='reveal'?s.history:[],score:s.score,attempts:s.attempts
});
const emit=(s:State)=>s.players.map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}));
const notice=(id:string,message:string)=>[{type:'notice',to:id,payload:message}];
function received(s:State,id:string){return s.players.some(p=>p.id===id);}
const module: PocketModule<State>={
 protocolVersion:1,
 createRoom({player}) {
  return {state:{host:player.id,players:[player],phase:'lobby',round:0,maxRounds:0,author:'',deadline:0,options:[],correct:0,board:[],answers:{},history:[],score:0,attempts:0,revision:0,usedScenes:[],modeDeck:[],kind:'action'}};
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
