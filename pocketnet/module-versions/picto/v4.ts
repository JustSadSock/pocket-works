import type { PocketModule } from '../../../pocket-server/module-contract.js';
export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 4;


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
// Curated causal story arcs: verbs, consequences and settings are not random.
type Story={kind:Kind;subject:Word;verb:string;object:Word;next:string;location:string};
const STORY_ROWS="action|cat|крадёт|key|открывает запертую дверь|в башне\naction|dragon|крадёт|crown|прячет добычу|в пещере\naction|bird|крадёт|book|улетает от погони|над мостом\naction|human|крадёт|clock|подменяет пропажу|в магазине\naction|cat|крадёт|flower|дарит добычу другу|в саду\naction|human|крадёт|sword|защищается от стражи|у ворот\naction|dragon|крадёт|key|запирает хозяина|в замке\naction|bird|крадёт|crown|строит тайник|на дереве\naction|cat|находит|crown|притворяется королём|в замке\naction|human|находит|book|читает заклинание|в башне\naction|bird|находит|key|открывает тайник|под деревом\naction|dragon|находит|heart|возвращает находку|в деревне\naction|human|ищет|sword|вызывает врага на бой|у ворот\naction|cat|ищет|fish|устраивает засаду|на берегу\naction|dragon|ищет|crown|пугает свидетеля|в пещере\naction|bird|ищет|flower|несёт подарок домой|в лесу\nroles|human|спасает|cat|уносит от опасности|из пещеры\nroles|dragon|спасает|bird|защищает от охотника|в лесу\nroles|cat|спасает|fish|отпускает на свободу|у реки\nroles|bird|спасает|human|зовёт на помощь|в горах\nroles|human|прячет|dragon|обманывает преследователя|в башне\nroles|cat|прячет|bird|отвлекает охранника|в саду\nroles|dragon|прячет|fish|устраивает ловушку|в пещере\nroles|human|кормит|bird|завоёвывает доверие|в саду\nroles|cat|пугает|bird|занимает чужой дом|на дереве\nroles|dragon|пугает|human|требует выкуп|у ворот\nroles|human|обманывает|dragon|забирает сокровище|в пещере\nroles|bird|обманывает|cat|освобождает пленника|в башне\nchange|human|чинит|clock|успевает к празднику|на площади\nchange|cat|ломает|clock|останавливает соревнование|в башне\nchange|dragon|ломает|door|освобождает пленника|в замке\nchange|human|чинит|boat|отправляется в путешествие|на берегу\nchange|dragon|превращает|flower|дарит необычный подарок|в саду\nchange|human|превращает|key|прячет волшебство|в башне\nchange|bird|ломает|crown|свергает самозванца|на площади\nchange|cat|рисует|dragon|пугает посетителей|в школе\nchange|human|рисует|door|создаёт тайный проход|в башне\nchange|dragon|уничтожает|book|скрывает опасный секрет|в пещере\nchange|human|создаёт|key|открывает волшебный сундук|в мастерской\nchange|cat|портит|flower|пытается всё исправить|в саду\njourney|human|несёт|book|передаёт секретный приказ|в замке\njourney|cat|несёт|key|теряет дорогу домой|в лесу\njourney|dragon|несёт|crown|отдаёт её королю|у ворот\njourney|bird|несёт|flower|готовит сюрприз|на мосту\njourney|human|несёт|heart|прячется от врага|в башне\njourney|cat|ведёт|bird|показывает тайную тропу|в лесу\njourney|dragon|ведёт|human|показывает своё убежище|в пещере\njourney|human|везёт|crown|прячется от разбойников|на мосту\njourney|bird|несёт|key|спасает пленного друга|в замке\njourney|human|теряет|book|ищет помощь|в пустыне\nexchange|human|дарит|flower|получает благодарность|в саду\nexchange|cat|дарит|key|освобождает друга|у ворот\nexchange|dragon|дарит|crown|заключает мир|в замке\nexchange|bird|дарит|book|раскрывает старую тайну|в башне\nexchange|human|отдаёт|sword|сдаётся победителю|на мосту\nexchange|cat|отдаёт|fish|спасается от погони|у реки\nexchange|human|меняет|book|получает волшебный ключ|в магазине\nexchange|dragon|меняет|crown|получает лекарство|в замке\nexchange|bird|отдаёт|flower|мирится с другом|в саду\nexchange|human|возвращает|key|получает награду|у ворот\nspace|human|прячет|key|возвращается за находкой|под мостом\nspace|cat|прячет|fish|защищает запас от вора|под деревом\nspace|dragon|охраняет|crown|отгоняет грабителя|в пещере\nspace|bird|охраняет|book|отвлекает незнакомца|в башне\nspace|human|прячет|heart|запутывает следы|в лесу\nspace|cat|охраняет|door|не пускает чужака|в доме\nspace|human|теряет|key|оказывается взаперти|в башне\nspace|bird|теряет|flower|возвращается за подарком|над мостом\nspace|dragon|охраняет|sword|проверяет смелость героя|в замке\nspace|human|находит|clock|узнаёт тайну прошлого|в пещере".trim().split('\n');
const STORIES:Story[]=STORY_ROWS.map(row=>{const [kind,subject,verb,object,next,location]=row.split('|');return {kind:kind as Kind,subject:subject as Word,verb,object:object as Word,next,location};});
export const SCENE_COUNT=STORIES.length;
export const TOTAL_TASKS=SCENE_COUNT;
const ACTIONS=[...new Set(STORIES.map(v=>v.verb))];
const CONSEQUENCES=[...new Set(STORIES.map(v=>v.next))];
const LOCATIONS=[...new Set(STORIES.map(v=>v.location))];
const KINDS:Kind[]=['action','space','roles','change','journey','exchange'];
const ACTORS:Word[]=['cat','bird','fish','dragon','human','sun','moon','star','tree','flower'];
const shuffle=<T>(xs:T[]):T[]=>{const result=[...xs];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
const rand=(n:number)=>Math.floor(Math.random()*n);
const SYMBOLS=new Set([
 'sun','moon','star','cloud','rain','wave','fire','tree','flower','bird','fish','cat','human','eye',
 'heart','key','crown','house','door','boat','mountain','arrow','clock','question','hand','book','sword','dragon',
 'not','swap','loop','path','mask','spark',
 'king','queen','knight','wizard','thief','child','guard','robot','ghost','dog','horse','fox','rabbit','frog','snake','wolf','bear','bee','owl','spider','turtle','apple','bread','cheese','cup','bottle','potion','coin','gift','cake','bag','map','shield','bow','hammer','axe','lantern','rope','ladder','chest','mirror','ring','hat','boots','wheel','cart','flag','compass','lock','castle','tower','bridge','cave','shop','school','hospital','garden','forest','island','river','road','gate','well','tent','volcano','desert','smile','cry','anger','sleep','music','idea','fear','surprise','thought','speech','footprint','lightning'
]);
type Player={id:string;name:string};
type Glyph={id:string;x:number;y:number;r:number;s:number;frame?:number};
type LexiconEntry={name:string;prompt:string;board:Glyph[]};
type Answer=(number|null)[];
type Archive={author:string;name:string;prompt:string;board:Glyph[];correct:number;total:number;points:number};
type State={
 host:string;players:Player[];phase:'lobby'|'compose'|'guess'|'reveal'|'results';
 round:number;maxRounds:number;author:string;deadline:number;choices:string[][];locationForms:string[][];
 frames:number;semanticVersion:number;story:string;lexicon:LexiconEntry[];
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
 const candidates=STORIES.map((v,i)=>v.kind===kind&&!s.usedScenes.includes(i)?i:-1).filter(i=>i>=0);
 if(!candidates.length)throw Error('story_bank_exhausted');
 const index=candidates[rand(candidates.length)],story=STORIES[index];
 s.usedScenes.push(index);
 s.choices=[
  pool(ACTORS,story.subject,10).map(W),
  pool(ACTIONS,story.verb,10),
  pool(Object.keys(WORDS) as Word[],story.object,10).map(id=>w(id,1)),
  pool(CONSEQUENCES,story.next,10),
  pool(LOCATIONS,story.location,10)
 ];
 s.target=[s.choices[0].indexOf(W(story.subject)),s.choices[1].indexOf(story.verb),
   s.choices[2].indexOf(w(story.object,1)),s.choices[3].indexOf(story.next),s.choices[4].indexOf(story.location)];
 s.solution=s.target.map((n,i)=>s.choices[i][n]);
 s.prompt=W(story.subject)+' '+story.verb+' '+w(story.object,1)+', затем '+story.next+' '+story.location+'.';
 s.story=s.prompt;s.kind=kind;s.locationForms=[];s.frames=s.round%3===0?3:2;s.semanticVersion=4;
 s.palette=[...SYMBOLS];s.blocked=[];
}
function fresh(s:State){
 puzzle(s);
 s.board=[];s.answers={};s.phase='compose';s.deadline=Date.now()+145000;s.revision++;
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
 if(s.phase==='compose'){s.phase='guess';s.deadline=Date.now()+80000;s.revision++;}
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
 if(!Array.isArray(glyphs)||glyphs.length>48)return null;
 const output:Glyph[]=[];
 for(const v of glyphs){
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const g=v as Record<string,unknown>;
  if(!SYMBOLS.has(String(g.id))||!palette.includes(String(g.id)))return null;
  for(const k of ['x','y','r','s'])if(typeof g[k]!=='number'||!Number.isFinite(g[k]))return null;
  if(Number(g.x)<4||Number(g.x)>96||Number(g.y)<5||Number(g.y)>95||Number(g.r)<-180||Number(g.r)>180||Number(g.s)<0.55||Number(g.s)>2.2)return null;
  const frame=g.frame===undefined?0:Number(g.frame);
  if(!Number.isInteger(frame)||frame<0||frame>2)return null;
  output.push({id:String(g.id),x:Math.round(Number(g.x)*10)/10,y:Math.round(Number(g.y)*10)/10,r:Math.round(Number(g.r)),s:Math.round(Number(g.s)*100)/100,frame});
 }
 return output;
}
function validAnswer(raw:unknown,s:State):raw is Answer{
 return Array.isArray(raw)&&raw.length===5&&raw.every((v,i)=>v===null||(typeof v==='number'&&Number.isInteger(v)&&v>=0&&Number(v)<(s.choices[i]?.length||0)));
}
const strip=(s:State,id:string)=>({
 host:s.host,players:s.players,phase:s.phase,round:s.round,maxRounds:s.maxRounds,author:s.author,deadline:s.deadline,
 board:s.board,revision:s.revision,kind:s.kind,frames:s.frames,semanticVersion:s.semanticVersion,lexicon:s.lexicon,
 palette:id===s.author&&s.phase==='compose'?s.palette:[],
 blocked:id===s.author&&s.phase==='compose'?s.blocked:[],
 choices:s.phase==='guess'||s.phase==='reveal'?s.choices:[],
 locationForms:s.phase==='guess'||s.phase==='reveal'?s.locationForms:[],
 solution:s.phase==='reveal'||s.phase==='results'?s.solution:[],
 prompt:id===s.author&&s.phase==='compose'?s.prompt:null,
 story:(id===s.author&&s.phase==='compose')||s.phase==='reveal'||s.phase==='results'?s.story:null,
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
   history:[],score:0,wordsFound:0,attempts:0,revision:0,usedScenes:[],modeDeck:[],kind:'action',frames:2,semanticVersion:4,story:'',lexicon:[]}};
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
  if(raw.type==='lexicon-import'){
   if(state.phase!=='lobby'||state.host!==id||!Array.isArray(raw.entries))return {state,events:notice(id,'Словарь восстанавливает ведущий до игры.')};
   for(const item of raw.entries.slice(0,24)){
    if(!item||typeof item!=='object')continue;
    const entry=item as Record<string,unknown>;
    if(typeof entry.prompt!=='string'||!entry.prompt||entry.prompt.length>240||typeof entry.name!=='string'||entry.name.length>32)continue;
    const board=sanitized(entry.board,[...SYMBOLS]);
    if(!board||!board.length)continue;
    if(state.lexicon.length>=24)break;
    if(!state.lexicon.some(v=>v.prompt===entry.prompt))state.lexicon.push({name:entry.name,prompt:entry.prompt,board});
   }
   state.revision++;return {state,events:emit(state)};
  }
  if(raw.type==='save-word'){
   if(state.phase!=='reveal'||state.author!==id)return {state,events:notice(id,'Добавить в словарь может автор после раскрытия.')};
   const last=state.history.at(-1);
   if(!last||!last.board.length)return {state,events:notice(id,'Композиция пуста.')};
   if(state.lexicon.some(v=>v.prompt===last.prompt))return {state,events:notice(id,'Это уже в словаре.')};
   if(state.lexicon.length>=24)return {state,events:notice(id,'Словарь заполнен.')};
   state.lexicon.push({name:last.name,prompt:last.prompt,board:last.board.map(g=>({...g}))});
   state.revision++;return {state,events:emit(state)};
  }
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
   if(!validAnswer(raw.cells,state)||!raw.cells.some(v=>v!==null))return {state,events:notice(id,'Заполни хотя бы одну ячейку. Остальные можно пропустить.')};
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
