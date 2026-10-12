import type { PocketModule } from '../../../pocket-server/module-contract.js';

/** ЧУШЬ — authoritative PocketNet rules. Catalogue: 64 silhouettes × 5 mutations. */
export const CATALOGUE_SIZE = 320;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
const PROMPTS = [
 'Яблоко на виселице','Последний автобус до края света','У дракона сегодня собеседование',
 'Торт, который пережил три войны','Рыцарь пытается продать дождь','Запрещённый пикник в космосе',
 'В зоопарке объявили военное положение','Коронация самого маленького существа','Погребение любимого холодильника',
 'Два призрака делят одни штаны','Удивительно грустная свадьба роботов','Музей вещей, которых никогда не существовало',
 'Как выглядит запах понедельника?','Преступление века: кто украл тень?','Подводная церковь для рыб-атеистов',
 'Бунт овощей против супа','Карманный конец света','Слон в посудной лавке. Буквально.',
 'Великий исход улиток','Когда у Луны закончился отпуск','Последний день работы палача',
 'Завтрак диктатора, которому нечем править','Осторожно: в небе что-то протекает',
 'Мальчик, который обменял голову на телевизор','Королевство построили на спине кита',
 'Дождь из потерянных носков','Демон устроился работать таксистом','Где-то в океане открылся супермаркет',
 'Если бы кошмары ходили в школу','Ужин при свечах посреди пожара','Ангел потерял инструкцию к крыльям',
 'Последняя фотография исчезнувшего цирка','Суд над самой ленивой горой','В этом городе запрещены круглые предметы',
 'Ресторан для тех, кто умер','Планета, полностью состоящая из мусора','Мир за пять минут до изобретения колеса',
 'Невероятно богатая крыса','Утро после нашествия великанов','Корабль-призрак в чашке чая',
 'Упавший с неба зоопарк','Побег из нарисованной тюрьмы','Здесь продают воспоминания на вес',
 'Памятник тому, кто ничего не сделал','У деревьев сегодня выборы','Смерть поссорилась со своим будильником',
 'Тайное общество одиноких зонтов','Собака официально стала мэром','Утопленный дворец из конфет',
 'Бабушка открыла портал в ад на кухне','Всадник без лошади и без головы','Самая бесполезная армия в истории',
 'Экстренная посадка летающего замка','В городе больше не осталось лиц','Кто-то кормит звёзды с ложечки',
 'Грустный карнавал на дне колодца','Вчера я видел, как бежит море','На казнь привели саму гильотину',
 'Парк аттракционов для чудовищ','Не трогайте это: оно смотрит в ответ',
 'Жизнь после победы над смертью','Человек устроил дуэль своему отражению',
 'Идеальный отпуск самого несчастного пирата','Всё человечество умещается в чемодане',
 'Золотая рыбка выдала кредит','Покажи мне кошмар архитектора','Когда солнце забыло взойти',
 'Лавка по ремонту разбитых сердец','Неудачный эксперимент над воскресеньем',
 'Театр кукол, которые ожили','Тревожная находка под кроватью короля',
 'Звери проводят дипломатический саммит','Картина, которую боится собственный художник',
 'Магический гриб захватил трон','Неловкое свидание со Смертью',
 'Мир, где всё слишком большое','Рождество в заброшенной шахте',
 'Летающий цирк из одного человека','Остров, где исчезли все тени',
 'Случайная революция в королевстве игрушек','Никогда не доверяй говорящей лестнице',
 'Сверхсекретный эксперимент пошёл очень смешно','Садовник выращивает маленькие планеты',
 'Из тумана выходит что-то знакомое','Король объявил войну собственной бороде',
 'Похороны будильника в полдень','Морское чудовище боится глубины',
 'Среди облаков открылась больница','Кто забыл башню посреди кухни?',
 'На этом корабле капитан — чайник','Последний фестиваль перед ледниковым периодом'
];
type Player={id:string;name:string};
type Piece={t:number;x:number;y:number;r:number;s:number;f:number};
type Vote={entry:number;stars:number};
type Round={round:number;prompt:string;works:{id:string;name:string;board:Piece[];votes:number;points:number}[];winners:string[]};
type Phase='lobby'|'compose'|'vote'|'reveal'|'results';
type State={host:string;players:Player[];phase:Phase;round:number;maxRounds:number;deadline:number;prompt:string;used:number[];size:number;decks:Record<string,number[]>;boards:Record<string,Piece[]>;ready:string[];order:string[];votes:Record<string,Vote>;scores:Record<string,number>;history:Round[];revision:number};
const rand=(n:number)=>Math.floor(Math.random()*n);
function shuffled<T>(a:T[]):T[]{for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function deck(size:number):number[]{
 const bases:number[]=[];
 for(let cat=0;cat<8;cat++)bases.push(...shuffled(Array.from({length:8},(_,i)=>cat*8+i)).slice(0,2));
 const left=shuffled(Array.from({length:64},(_,i)=>i).filter(i=>!bases.includes(i)));
 bases.push(...left.slice(0,size-16));
 return shuffled(bases.map(b=>b*5+rand(5)));
}
function prepare(s:State){
 const available=Array.from({length:PROMPTS.length},(_,i)=>i).filter(i=>!s.used.includes(i));
 if(!available.length)s.used=[];
 const pool=available.length?available:Array.from({length:PROMPTS.length},(_,i)=>i);
 const choice=pool[rand(pool.length)];s.used.push(choice);s.prompt=PROMPTS[choice];
 s.size=18+rand(5);s.decks={};s.boards={};s.ready=[];s.votes={};s.order=[];
 for(const p of s.players){s.decks[p.id]=deck(s.size);s.boards[p.id]=[];}
 s.phase='compose';s.deadline=Date.now()+150000;s.revision++;
}
function start(s:State){
 s.round=1;s.maxRounds=5;s.scores=Object.fromEntries(s.players.map(p=>[p.id,0]));
 s.history=[];s.used=[];prepare(s);
}
function startVote(s:State){
 if(s.phase!=='compose')return;
 s.order=shuffled(s.players.map(p=>p.id));
 s.phase='vote';s.deadline=Date.now()+55000;s.revision++;
}
function reveal(s:State){
 if(s.phase!=='vote')return;
 const wins:Record<string,number>=Object.fromEntries(s.players.map(p=>[p.id,0]));
 const pts:Record<string,number>=Object.fromEntries(s.players.map(p=>[p.id,0]));
 for(const [voter,v] of Object.entries(s.votes)){
  const candidate=s.order[v.entry];
  if(!candidate||candidate===voter)continue;
  wins[candidate]++;pts[candidate]+=s.players.length===2?v.stars:3;
 }
 for(const [id,points] of Object.entries(pts))s.scores[id]=(s.scores[id]||0)+points;
 const max=Math.max(0,...Object.values(pts));
 const winners=max?Object.keys(pts).filter(k=>pts[k]===max):[];
 s.history.push({round:s.round,prompt:s.prompt,works:s.order.map(id=>({id,name:s.players.find(p=>p.id===id)?.name||'Участник',board:s.boards[id]||[],votes:wins[id]||0,points:pts[id]||0})),winners});
 s.phase='reveal';s.deadline=Date.now()+14500;s.revision++;
}
function next(s:State){
 if(s.phase!=='reveal')return;
 if(s.round>=s.maxRounds||s.players.length<2){s.phase='results';s.deadline=0;s.revision++;return;}
 s.round++;prepare(s);
}
function step(s:State){let count=0;while(s.deadline&&Date.now()>=s.deadline&&count++<3){if(s.phase==='compose')startVote(s);else if(s.phase==='vote')reveal(s);else if(s.phase==='reveal')next(s);else break;}}
function validBoard(s:State,id:string,unknown:unknown):Piece[]|null{
 if(!Array.isArray(unknown)||unknown.length>s.size)return null;
 const valid=new Set(s.decks[id]||[]),used=new Set<number>(),out:Piece[]=[];
 for(const raw of unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const v=raw as Record<string,unknown>,t=Number(v.t);
  if(!Number.isInteger(t)||!valid.has(t)||used.has(t))return null;
  const x=Number(v.x),y=Number(v.y),r=Number(v.r),z=Number(v.s),f=Number(v.f);
  if(![x,y,r,z,f].every(Number.isFinite)||x<0||x>100||y<0||y>100||r< -180||r>180||z<.35||z>3||![0,1].includes(f))return null;
  used.add(t);out.push({t,x:Math.round(x*10)/10,y:Math.round(y*10)/10,r:Math.round(r),s:Math.round(z*100)/100,f});
 }
 return out;
}
function strip(s:State,id:string){
 const basic={host:s.host,players:s.players,phase:s.phase,round:s.round,maxRounds:s.maxRounds,deadline:s.deadline,prompt:s.prompt,size:s.size,ready:s.ready,revision:s.revision,scores:s.scores};
 if(s.phase==='lobby')return {...basic,deck:[],myBoard:[],gallery:[],myVote:null,history:[]};
 if(s.phase==='compose')return {...basic,deck:s.decks[id]||[],myBoard:s.boards[id]||[],gallery:[],myVote:null,history:[]};
 const gallery=s.order.map((author,index)=>({index,board:s.boards[author]||[],mine:author===id}));
 if(s.phase==='vote')return {...basic,deck:[],myBoard:[],gallery,myVote:s.votes[id]||null,history:[]};
 return {...basic,deck:[],myBoard:[],gallery:gallery.map(g=>({...g,name:s.players.find(p=>p.id===s.order[g.index])?.name||'Участник',points:s.history.at(-1)?.works[g.index]?.points||0,votes:s.history.at(-1)?.works[g.index]?.votes||0})),myVote:s.votes[id]||null,history:s.history};
}
const events=(s:State)=>s.players.map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}));
const notice=(id:string,message:string)=>[{type:'notice',to:id,payload:message}];
const module: PocketModule<State>={
 protocolVersion:1,
 createRoom({player}){
  return {state:{host:player.id,players:[player],phase:'lobby',round:0,maxRounds:5,deadline:0,prompt:'',used:[],size:0,decks:{},boards:{},ready:[],order:[],votes:{},scores:{},history:[],revision:0}};
 },
 onJoin({state,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  state.players=players;state.revision++;return {state,events:events(state)};
 },
 onLeave({state,player,players}){
  state.players=players;state.host=players.some(p=>p.id===state.host)?state.host:players[0]?.id||'';
  state.ready=state.ready.filter(k=>k!==player.id);delete state.votes[player.id];
  if(state.phase!=='lobby'&&state.phase!=='results'){
   if(players.length<2){state.phase='results';state.deadline=0;}
   else if(state.phase==='compose'&&state.ready.length===players.length)startVote(state);
   else if(state.phase==='vote'&&Object.keys(state.votes).length===players.length)reveal(state);
  }
  state.revision++;return {state,events:events(state)};
 },
 onMessage({state,player,payload}){
  const id=player.id,v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload as Record<string,unknown>:{};
  if(v.type==='sync')return {state,events:[{type:'state',to:id,payload:strip(state,id)}]};
  if(!state.players.some(p=>p.id===id))return {state,events:notice(id,'Ты не в этой комнате.')};
  const rev=state.revision;step(state);
  if(v.type==='pulse')return {state,events:rev!==state.revision?events(state):[]};
  if(v.type==='start'||v.type==='again'){
   if(id!==state.host||state.players.length<MIN_PLAYERS||!(state.phase==='lobby'&&v.type==='start'||state.phase==='results'&&v.type==='again'))
    return {state,events:notice(id,'Только ведущий может начать игру для 2–8 участников.')};
   start(state);return {state,events:events(state)};
  }
  if(v.type==='edit'||v.type==='publish'){
   if(state.phase!=='compose'||state.ready.includes(id))return {state,events:notice(id,'Работа уже сдана или время вышло.')};
   const board=validBoard(state,id,v.board);
   if(!board)return {state,events:notice(id,'Недопустимый набор фигур.')};
   state.boards[id]=board;
   if(v.type==='publish'){state.ready.push(id);if(state.ready.length===state.players.length)startVote(state);}
   state.revision++;return {state,events:events(state)};
  }
  if(v.type==='vote'){
   if(state.phase!=='vote'||sHas(state.votes,id))return {state,events:notice(id,'Голос уже принят или голосование завершилось.')};
   const entry=Number(v.entry),stars=Number(v.stars);
   if(!Number.isInteger(entry)||entry<0||entry>=state.order.length||state.order[entry]===id)
    return {state,events:notice(id,'Нельзя голосовать за свою работу.')};
   if(state.players.length===2&&!([1,2,3,4,5].includes(stars)))return {state,events:notice(id,'Поставь от 1 до 5 баллов.')};
   state.votes[id]={entry,stars:state.players.length===2?stars:3};
   if(Object.keys(state.votes).length===state.players.length)reveal(state);
   state.revision++;return {state,events:events(state)};
  }
  if(v.type==='next'&&id===state.host&&state.phase==='reveal'){next(state);return {state,events:events(state)};}
  return {state,events:rev!==state.revision?events(state):notice(id,'Действие недоступно.')};
 }
};
function sHas(v:Record<string,Vote>,id:string){return Object.prototype.hasOwnProperty.call(v,id);}
export default module;
