import type { PocketModule } from '../../../pocket-server/module-contract.js';
export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 3;


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
 fire:['Огонь','огонь','огня','огню','огнём'],
 sword:['Меч','меч','меча','мечу','мечом']
} as const;
type Word = keyof typeof WORDS;
type Kind = 'action'|'space'|'roles'|'change'|'journey'|'exchange';
type Scene = {kind:Kind; subject:Word; object:Word; place:Word};
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
 ['cat','sun'],['dragon','moon']
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
 ['cat','heart','dragon'],['dragon','key','human'],['fish','flower','human'],
 ['human','clock','dragon'],['cat','star','bird'],['bird','crown','dragon']
];

const KINDS:Kind[]=['action','space','roles','change','journey','exchange'];
const ACTORS:Word[]=['cat','bird','fish','dragon','human','sun','moon','star','tree','flower'];
const PLACES:Word[]=['house','tree','mountain','boat','door','cloud','moon','book','flower','sun','clock','cat','bird','dragon'];
const GOODS:Word[]=['key','crown','heart','book','flower','clock','star','sword','moon','fish'];
const placeFor=(index:number,a:Word,b:Word):Word=>PLACES.find((p,i)=>i>index%PLACES.length&&p!==a&&p!==b)||PLACES.find(p=>p!==a&&p!==b)!;
const SCENES:Scene[]=[
 ...actionPairs.map(([a,b],i)=>({kind:'action' as Kind,subject:a,object:b,place:placeFor(i,a,b)})),
 ...spacePairs.map(([a,b],i)=>({kind:'space' as Kind,subject:ACTORS[i%ACTORS.length],object:a,place:b})),
 ...rolePairs.map(([a,b],i)=>({kind:'roles' as Kind,subject:a,object:b,place:placeFor(i+5,a,b)})),
 ...changePairs.map(([a,b],i)=>({kind:'change' as Kind,subject:a,object:b,place:placeFor(i+9,a,b)})),
 ...journeyTriples.map(([a,b,c])=>({kind:'journey' as Kind,subject:a,object:b,place:c})),
 ...exchangeTriples.map(([a,b,c])=>({kind:'exchange' as Kind,subject:a,object:b,place:c}))
];
export const SCENE_COUNT=SCENES.length;
export const TOTAL_TASKS=SCENE_COUNT;
const VERBS:Record<Kind,string[]>={
 action:['ищет','прячет','охраняет','крадёт','теряет','находит','несёт','ломает','рисует','роняет'],
 space:['оставляет','кладёт','роняет','находит','держит','прячет','теряет','берёт','ищет','таскает'],
 roles:['спасает','преследует','обнимает','пугает','замечает','обманывает','зовёт','защищает','догоняет','встречает'],
 change:['превращает','раскрашивает','уменьшает','увеличивает','заменяет','создаёт','уничтожает','чинит','портит','оживляет'],
 journey:['несёт','везёт','тащит','ведёт','отправляет','прячет','роняет','теряет','находит','ловит'],
 exchange:['дарит','крадёт','отдаёт','забирает','передаёт','возвращает','меняет','прячет','роняет','ищет']
};
const RELATIONS:{label:string;form:number}[]=[
 {label:'под',form:4},{label:'над',form:4},{label:'за',form:4},{label:'перед',form:4},
 {label:'возле',form:2},{label:'около',form:2},{label:'у',form:2},{label:'к',form:3}
];
const shuffle=<T>(xs:T[]):T[]=>{const result=[...xs];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const rand=(n:number)=>Math.floor(Math.random()*n);
const SYMBOLS=new Set([
 'sun','moon','star','cloud','rain','wave','fire','tree','flower','bird','fish','cat','human','eye',
 'heart','key','crown','house','door','boat','mountain','arrow','clock','question','hand','book','sword','dragon',
 'not','swap','loop','path','mask','spark'
]);
type Player={id:string;name:string};
type Glyph={id:string;x:number;y:number;r:number;s:number};
type Answer=(number|null)[];
type Archive={author:string;name:string;prompt:string;board:Glyph[];correct:number;total:number;points:number};
type State={
 host:string;players:Player[];phase:'lobby'|'compose'|'guess'|'reveal'|'results';
 round:number;maxRounds:number;author:string;deadline:number;choices:string[][];locationForms:string[][];
 target:number[];solution:string[];prompt:string;palette:string[];blocked:string[];
 board:Glyph[];answers:Record<string,Answer>;history:Archive[];score:number;wordsFound:number;attempts:number;
 revision:number;usedScenes:number[];kind:Kind;modeDeck:Kind[]
};
function pool<T>(all:T[],required:T,size:number):T[]{
 return shuffle([required,...shuffle(all.filter(x=>x!==required)).slice(0,size-1)]);
}
function puzzle(s:State){
 if(!s.modeDeck.length)s.modeDeck=shuffle(KINDS);
 const kind=s.modeDeck.pop()!;
 const candidates=SCENES.map((scene,i)=>scene.kind===kind&&!s.usedScenes.includes(i)?i:-1).filter(i=>i>=0);
 if(!candidates.length)throw Error('scene_bank_exhausted');
 const index=candidates[rand(candidates.length)],scene=SCENES[index];
 s.usedScenes.push(index);
 const subjects=pool(ACTORS,scene.subject,10);
 const objects=pool(Object.keys(WORDS) as Word[],scene.object,10);
 const locations=pool(Object.keys(WORDS) as Word[],scene.place,10);
 const verbs=shuffle(VERBS[kind]);
 const preps=shuffle(RELATIONS);
 const chosenVerb=VERBS[kind][rand(VERBS[kind].length)];
 const chosenPrep=RELATIONS[rand(RELATIONS.length)];
 const locationForms=preps.map(prep=>locations.map(id=>w(id,prep.form)));
 const target=[
  subjects.indexOf(scene.subject),verbs.indexOf(chosenVerb),objects.indexOf(scene.object),
  preps.findIndex(prep=>prep.label===chosenPrep.label),locations.indexOf(scene.place)
 ];
 const choices=[subjects.map(W),verbs,objects.map(id=>w(id,1)),preps.map(p=>p.label),locationForms[0]];
 const solution=target.map((pos,i)=>i===4?locationForms[target[3]][pos]:choices[i][pos]);
 const nouns=[scene.subject,scene.object,scene.place].filter((id,i,a)=>a.indexOf(id)===i);
 const blocks=shuffle(nouns).slice(0,Math.min(nouns.length-1,1+rand(2)));
 const toolbox=shuffle(['arrow','not','swap','hand','question','mask','path','spark']).slice(0,4);
 const candidatesGlyph=shuffle([...SYMBOLS].filter(id=>!blocks.includes(id as Word)));
 const mustKeep=nouns.filter(id=>!blocks.includes(id));
 const palette=[...new Set([...mustKeep,...toolbox,...candidatesGlyph])].slice(0,18);
 s.kind=kind;s.choices=choices;s.locationForms=locationForms;s.target=target;s.solution=solution;
 s.prompt=solution.join(' ')+'.';s.palette=palette;s.blocked=blocks;
}
function fresh(s:State){
 puzzle(s);
 s.board=[];s.answers={};s.phase='compose';s.deadline=Date.now()+100000;s.revision++;
 s.author=s.players[(s.round-1)%s.players.length]?.id||'';
}
function start(s:State){
 s.round=1;s.maxRounds=s.players.length;s.history=[];s.score=0;s.wordsFound=0;s.attempts=0;
 s.usedScenes=[];s.modeDeck=[];fresh(s);
}
function hits(s:State,a:Answer):number{return a.filter((v,i)=>v!==null&&v===s.target[i]).length;}
function reveal(s:State){
 if(s.phase!=='guess')return;
 const submissions=Object.keys(s.answers),total=submissions.length*5;
 let correct=0,points=0;
 for(const id of submissions){
  const a=s.answers[id],right=hits(s,a),wrong=a.filter((v,i)=>v!==null&&v!==s.target[i]).length;
  correct+=right;points+=Math.max(0,right*2-wrong);
 }
 s.score+=points;s.wordsFound+=correct;s.attempts+=total;
 s.history.push({author:s.author,name:s.players.find(p=>p.id===s.author)?.name||'Участник',
  prompt:s.prompt,board:s.board.map(g=>({...g})),correct,total,points});
 s.phase='reveal';s.deadline=Date.now()+14000;s.revision++;
}
function advance(s:State){
 if(s.phase==='compose'){s.phase='guess';s.deadline=Date.now()+65000;s.revision++;}
 else if(s.phase==='guess')reveal(s);
 else if(s.phase==='reveal'){
  if(s.round>=s.maxRounds||s.players.length<2){s.phase='results';s.deadline=0;s.revision++;}
  else{s.round++;fresh(s);}
 }
}
function step(s:State){
 let loops=0;while(s.deadline&&Date.now()>=s.deadline&&loops++<2&&s.phase!=='results')advance(s);
}
function sanitized(glyphs:unknown,palette:string[]):Glyph[]|null{
 if(!Array.isArray(glyphs)||glyphs.length>26)return null;
 const output:Glyph[]=[];
 for(const v of glyphs){
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const g=v as Record<string,unknown>;
  if(!SYMBOLS.has(String(g.id))||!palette.includes(String(g.id)))return null;
  for(const k of ['x','y','r','s'])if(typeof g[k]!=='number'||!Number.isFinite(g[k]))return null;
  if(Number(g.x)<4||Number(g.x)>96||Number(g.y)<5||Number(g.y)>95||Number(g.r)<-180||Number(g.r)>180||Number(g.s)<0.55||Number(g.s)>2.2)return null;
  output.push({id:String(g.id),x:Math.round(Number(g.x)*10)/10,y:Math.round(Number(g.y)*10)/10,r:Math.round(Number(g.r)),s:Math.round(Number(g.s)*100)/100});
 }
 return output;
}
function validAnswer(raw:unknown):raw is Answer{
 return Array.isArray(raw)&&raw.length===5&&raw.every((v,i)=>v===null||(Number.isInteger(v)&&Number(v)>=0&&Number(v)<(i===3?8:10)));
}
const strip=(s:State,id:string)=>({
 host:s.host,players:s.players,phase:s.phase,round:s.round,maxRounds:s.maxRounds,author:s.author,deadline:s.deadline,
 board:s.board,revision:s.revision,kind:s.kind,
 palette:id===s.author&&s.phase==='compose'?s.palette:[],
 blocked:id===s.author&&s.phase==='compose'?s.blocked:[],
 choices:s.phase==='guess'||s.phase==='reveal'?s.choices:[],
 locationForms:s.phase==='guess'||s.phase==='reveal'?s.locationForms:[],
 solution:s.phase==='reveal'||s.phase==='results'?s.solution:[],
 prompt:id===s.author&&s.phase==='compose'?s.prompt:null,
 answered:Object.keys(s.answers),myAnswer:s.answers[id]??null,
 answers:s.phase==='reveal'?s.answers:{},
 history:s.phase==='results'||s.phase==='reveal'?s.history:[],
 score:s.score,wordsFound:s.wordsFound,attempts:s.attempts
});
const emit=(s:State)=>s.players.map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}));
const notice=(id:string,message:string)=>[{type:'notice',to:id,payload:message}];
const received=(s:State,id:string)=>s.players.some(p=>p.id===id);
const module:PocketModule<State>={
 protocolVersion:1,
 createRoom({player}){
  return {state:{host:player.id,players:[player],phase:'lobby',round:0,maxRounds:0,author:'',deadline:0,
   choices:[],locationForms:[],target:[],solution:[],prompt:'',palette:[],blocked:[],board:[],answers:{},
   history:[],score:0,wordsFound:0,attempts:0,revision:0,usedScenes:[],modeDeck:[],kind:'action'}};
 },
 onJoin({state,player,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  state.players=players;state.revision++;return {state,events:emit(state)};
 },
 onLeave({state,player,players}){
  state.players=players;if(state.host===player.id)state.host=players[0]?.id||'';
  if(state.phase!=='lobby'&&state.phase!=='results'){
   if(players.length<2){state.phase='results';state.deadline=0;}
   else if(state.author===player.id){
    if(state.phase==='guess')reveal(state);
    else{state.round++;if(state.round>state.maxRounds){state.phase='results';state.deadline=0;}else fresh(state);}
   }else if(state.phase==='guess'&&Object.keys(state.answers).length>=players.length-1)reveal(state);
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
   const board=sanitized(raw.glyphs,state.palette);
   if(!board)return {state,events:notice(id,'Знак недоступен в этом раунде или имеет недопустимые параметры.')};
   state.board=board;state.revision++;return {state,events:emit(state)};
  }
  if(raw.type==='publish'){
   if(state.phase!=='compose'||state.author!==id)return {state,events:notice(id,'Отправить сообщение может только автор.')};
   advance(state);return {state,events:emit(state)};
  }
  if(raw.type==='answer'){
   if(state.phase!=='guess'||state.author===id||id in state.answers)return {state,events:notice(id,'Ответ сейчас недоступен.')};
   if(!validAnswer(raw.cells)||!raw.cells.some(v=>v!==null))return {state,events:notice(id,'Заполни хотя бы одну ячейку. Остальные можно пропустить.')};
   state.answers[id]=raw.cells.slice();state.revision++;
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
