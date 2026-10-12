import type { PocketModule } from '../../../pocket-server/module-contract.js';
// The local host exports this in /health so an outdated three-player backend
// cannot silently masquerade as the current two-player edition.
export const MIN_PLAYERS=2;
export const RULESET_VERSION=5;
// Updated alongside ARTS in artworks.js; the initial cover portrait remains outside matches.
const CATALOG_COUNT=54;
type Stroke={c:string;s:number;t:string;p:number[][]};
type Assignment={art:number;variation:number;strokes:Stroke[]|null};
type Chips=number[];
type BoardSegment={u:string;k:string;q:number;c:string;s:number;p:number[][]};
type CommonsBoard={revision:number;segments:BoardSegment[]};
type State={board?:CommonsBoard;emblems?:Record<string,string>;host:string;phase:string;round:number;rounds:number;deadline:number;selected:number[];participants:{id:string;name:string}[];assignments:Record<string,Assignment>;drafts?:Record<string,Stroke[]>;votes:Record<string,Record<string,Chips>>;scores:Record<string,{mask:number;eye:number}>;turn:number;revealed:boolean};
const now=()=>Date.now();
const shuffled=<T>(a:T[]):T[]=>{const copy=[...a];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
const members=(s:State)=>s.participants;
const strip=(s:State,id:string)=>({
 host:s.host,phase:s.phase,round:s.round,rounds:s.rounds,deadline:s.deadline,
 selected:s.selected,participants:s.participants,emblems:s.emblems||{},board:s.phase==='lobby'?(s.board||{revision:0,segments:[]}):undefined,turn:s.turn,scores:s.scores,
 done:members(s).filter(p=>Array.isArray(s.assignments[p.id]?.strokes)).map(p=>p.id),
 voted:Object.keys(s.votes[members(s)[s.turn]?.id]||{}),
 mine:s.assignments[id]?{art:s.assignments[id].art,variation:s.assignments[id].variation,strokes:s.assignments[id].strokes,draft:s.drafts?.[id]??null}:null,
 author:members(s)[s.turn]||null,
 candidate:s.phase==='voting'?s.assignments[members(s)[s.turn]?.id]||null:null,
 gallery:(s.phase==='reveal'||s.phase==='round-review'||s.phase==='results')?members(s).map((p,i)=>s.phase!=='reveal'||i<=s.turn?({id:p.id,name:p.name,...s.assignments[p.id],votes:s.votes[p.id]||{}}):null):null
});
function emit(s:State){return members(s).map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}))}
function notice(id:string,msg:string){return [{type:'notice',to:id,payload:msg}]}
function choose(s:State){
 s.selected=shuffled(Array.from({length:CATALOG_COUNT-1},(_,i)=>i+1)).slice(0,5);
 // Pick different works for the first five participants; further participants repeat independently.
 s.assignments={};s.drafts={};s.votes={};s.turn=0;s.revealed=false;
 const shuffledArt=shuffled(s.selected);
 members(s).forEach((p,i)=>s.assignments[p.id]={art:shuffledArt[i%5],variation:Math.floor(Math.random()*0xffffffff),strokes:null});
 s.phase='preview';s.deadline=now()+25000;
}
function completeVotes(s:State){
 // Three brass tokens per target. Every token on the restored canvas pays
 // 100 in a two-player match. Normalize by possible other voters so scores
 // stay comparable between duos and larger groups. Wrong tokens pay the
 // restorer instead; no explicit punishment for a wrong guess.
 const others=Math.max(1,members(s).length-1);
 for(const p of members(s)){
  const index=s.selected.indexOf(s.assignments[p.id]?.art);
  const ballots=Object.values(s.votes[p.id]||{}).filter(Array.isArray);
  const correct=ballots.reduce((n,chips)=>n+(chips[index]||0),0);
  const total=ballots.reduce((n,chips)=>n+chips.reduce((a,b)=>a+b,0),0);
  s.scores[p.id].mask+=Math.round(50*(total-correct)/others);
  let eye=0;
  for(const q of members(s)){
   if(q.id===p.id)continue;
   const ballot=s.votes[q.id]?.[p.id];
   if(Array.isArray(ballot))eye+=ballot[s.selected.indexOf(s.assignments[q.id]?.art)]||0;
  }
  s.scores[p.id].eye+=Math.round(100*eye/others);
 }
 s.revealed=true;
}
function step(s:State){
 if(s.phase==='preview'){s.phase='drawing';s.deadline=now()+105000;}
 else if(s.phase==='drawing'){
  for(const p of members(s))if(s.assignments[p.id]?.strokes===null)s.assignments[p.id].strokes=s.drafts?.[p.id]??[];
  s.phase='voting';s.turn=0;s.deadline=now()+25500;
 }else if(s.phase==='voting'){
  // Every completed vote is immediately followed by its own answer.
  s.phase='reveal';s.deadline=now()+19000;
 }else if(s.phase==='reveal'){
  if(s.turn<members(s).length-1){s.turn++;s.phase='voting';s.deadline=now()+25500;}
  else {
   completeVotes(s);
   // Untimed shared exhibition, advancing only when the host chooses.
   s.phase='round-review';s.deadline=0;
  }
 }
}
function eligible(s:State,target:string,connected:string[]){return members(s).filter(p=>p.id!==target&&connected.includes(p.id))}
function normalize(raw:unknown):Stroke[]|null{
 if(!Array.isArray(raw)||raw.length>72)return null;
 let total=0;const out:Stroke[]=[];
 for(const item of raw){
   if(!item||typeof item!=='object')return null;
   const o=item as Record<string,unknown>;
   if(!/^#[0-9a-f]{6}$/i.test(String(o.c))||!Number.isFinite(o.s)||Number(o.s)<1||Number(o.s)>48||!['brush','pencil','spray','erase','fill'].includes(String(o.t)))return null;
   if(!Array.isArray(o.p)||o.p.length>(o.t==='fill'?1:45)||o.p.length<1)return null;
   const points:number[][]=[];
   for(const point of o.p){
     if(!Array.isArray(point)||point.length!==2||point.some(v=>!Number.isFinite(v))||point[0]<0||point[0]>600||point[1]<0||point[1]>450)return null;
     points.push([Math.round(point[0]*10)/10,Math.round(point[1]*10)/10]);
   }
   total+=points.length;if(total>1600)return null;
   out.push({c:String(o.c),s:Number(o.s),t:String(o.t),p:points});
 }
 return out;
}
// Never accept SVG, markup, or arbitrary URLs as player-drawn images.
function sanitizeEmblem(value:unknown):string|null|undefined{
 if(value===null)return null;
 if(typeof value!=='string'||value.length>12000)return undefined;
 if(!/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return undefined;
 if(value.startsWith('data:image/png;base64,')&&!value.slice(22).startsWith('iVBORw0KGgo'))return undefined;
 if(value.startsWith('data:image/webp;base64,')&&!value.slice(23).startsWith('UklGR'))return undefined;
 return value;
}
const BOARD_LIMIT=400;
function boardSegment(raw:Record<string,unknown>,u:string):BoardSegment|null{
 const id=raw.k;
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,20}$/.test(id))return null;
 if(!Number.isInteger(raw.q)||Number(raw.q)<0||Number(raw.q)>9999)return null;
 if(typeof raw.c!=='string'||!/^#[0-9a-f]{6}$/i.test(raw.c))return null;
 if(typeof raw.s!=='number'||!Number.isInteger(raw.s)||raw.s<2||raw.s>36)return null;
 if(!Array.isArray(raw.p)||raw.p.length<1||raw.p.length>20)return null;
 const pts:number[][]=[];
 for(const p of raw.p){
   if(!Array.isArray(p)||p.length!==2||p.some((v:unknown)=>typeof v!=='number'||!Number.isInteger(v)||v<0||v>960))return null;
   if(p[1]>600)return null;
   pts.push([p[0],p[1]]);
 }
 return {u,k:id,q:Number(raw.q),c:raw.c,s:raw.s,p:pts};
}
const module: PocketModule<State>={
 protocolVersion:1,
 createRoom({player}){return {state:{board:{revision:0,segments:[]},emblems:{},host:player.id,phase:'lobby',round:0,rounds:3,deadline:0,selected:[],participants:[player],assignments:{},drafts:{},votes:{},scores:{[player.id]:{mask:0,eye:0}},turn:0,revealed:false}};},
 onJoin({state,player}){
   if(state.phase==='lobby'&&!state.participants.some(p=>p.id===player.id)){
     state.participants.push(player);state.scores[player.id]={mask:0,eye:0};
   }
   return {state,events:emit(state)};
 },
 onLeave({state,player,players}){
   if(state.phase==='lobby'){state.participants=state.participants.filter(p=>p.id!==player.id);delete state.scores[player.id];if(state.emblems)delete state.emblems[player.id]}
   if(state.host===player.id)state.host=players[0]?.id||'';
   return {state,events:emit(state)};
 },
 onMessage({state,player,players,payload}){
   const a=(payload&&typeof payload==='object'?payload:{}) as Record<string,unknown>;
   const id=player.id;const isMember=state.participants.some(p=>p.id===id);
   if(a.type==='sync')return {state,events:[{type:'state',to:id,payload:strip(state,id)}]};
   if(state.deadline&&now()>=state.deadline&&state.phase!=='results')step(state);
   if(a.type==='pulse')return {state,events:emit(state)};
   if(!isMember)return {state,events:notice(id,'Матч уже начался. Дождись следующей комнаты.')};
   if(a.type==='board_delta'&&state.phase==='lobby'){
     const board=state.board ||= {revision:0,segments:[]};
     if(a.revision!==board.revision)return {state,events:[{type:'board_reset',to:id,payload:board}]};
     const segment=boardSegment(a,id);
     if(!segment)return {state,events:notice(id,'Недопустимый мазок на общем холсте.')};
     board.segments.push(segment);
     if(board.segments.length>BOARD_LIMIT)board.segments.splice(0,board.segments.length-BOARD_LIMIT);
     return {state,events:[{type:'board_delta',payload:{...segment,revision:board.revision}}]};
   }
   if(a.type==='board_clear'&&state.phase==='lobby'){
     if(state.host!==id)return {state,events:notice(id,'Очистить общий холст может только куратор.')};
     const board=state.board ||= {revision:0,segments:[]};
     board.segments=[];board.revision++;
     return {state,events:[{type:'board_reset',payload:board}]};
   }
   if(a.type==='emblem'){
     const data=sanitizeEmblem(a.image);
     if(data===undefined)return {state,events:notice(id,'Не удалось сохранить личный знак: изображение слишком большое или некорректное.')};
     state.emblems||={};
     if(data===null)delete state.emblems[id];else state.emblems[id]=data;
     return {state,events:emit(state)};
   }
   if(a.type==='start'&&state.phase==='lobby'){
     if(state.host!==id)return {state,events:notice(id,'Запустить матч может создатель комнаты.')};
     if(members(state).length<MIN_PLAYERS)return {state,events:notice(id,'Для онлайна нужны минимум два участника.')};
     state.round=1;state.rounds=[1,3,5].includes(Number(a.rounds))?Number(a.rounds):3;
     state.board={revision:(state.board?.revision||0)+1,segments:[]};
     members(state).forEach(p=>state.scores[p.id]={mask:0,eye:0});choose(state);
   }else if(a.type==='draft'&&state.phase==='drawing'){
     const item=state.assignments[id];
     if(!item||item.strokes!==null||Number(a.round)!==state.round||a.art!==item.art||a.variation!==item.variation)
      return {state,events:notice(id,'Черновик относится к другому раунду.')};
     const strokes=normalize(a.strokes);
     if(!strokes)return {state,events:notice(id,'Не удалось сохранить черновик: превышен размер рисунка.')};
     (state.drafts||={})[id]=strokes;
     // Only acknowledge its author, rather than broadcasting draft arrays.
     return {state,events:[{type:'draft_saved',to:id,payload:{round:state.round,art:item.art,variation:item.variation,lines:strokes.length}}]};
   }else if(a.type==='submit'&&state.phase==='drawing'){
     const item=state.assignments[id];const strokes=normalize(a.strokes);
     if(!item||item.strokes!==null)return {state,events:notice(id,'Эта работа уже сдана.')};
     if(!strokes)return {state,events:notice(id,'Некорректные или слишком большие данные рисунка.')};
     item.strokes=strokes;
     delete state.drafts?.[id];
     if(members(state).every(p=>state.assignments[p.id]?.strokes!==null))step(state);
   }else if(a.type==='vote'&&state.phase==='voting'){
     const target=members(state)[state.turn]?.id;
     if(!target||id===target)return {state,events:notice(id,'Автор не голосует за собственную работу.')};
     const chips=a.chips;
     if(!Array.isArray(chips)||chips.length!==5||chips.some(n=>!Number.isInteger(n)||n<0||n>3)||chips.reduce((a,b)=>a+b,0)!==3)
      return {state,events:notice(id,'Распредели ровно три фишки между пятью полотнами.')};
     state.votes[target]||={};
     if(id in state.votes[target])return {state,events:notice(id,'Фишки уже поставлены.')};
     state.votes[target][id]=[...chips] as Chips;
     if(eligible(state,target,players.map(p=>p.id)).every(p=>p.id in state.votes[target]))step(state);
   }else if(a.type==='advance'&&id===state.host&&state.phase==='reveal'){
     // Prevent accidental double-clicks from skipping two artworks.
     const phaseMs=19000;
     if(now()>state.deadline-phaseMs+2800)step(state);
   }else if(a.type==='continue'&&state.phase==='round-review'){
     if(id!==state.host)return {state,events:notice(id,'Продолжить может только организатор комнаты.')};
     if(state.round<state.rounds){state.round++;choose(state);}
     else {state.phase='results';state.deadline=0;}
   }else if(a.type==='next'&&state.phase==='results'&&id===state.host){
     state.participants=state.participants.filter(p=>players.some(online=>online.id===p.id));state.board={revision:(state.board?.revision||0)+1,segments:[]};state.phase='lobby';state.round=0;state.deadline=0;state.assignments={};state.drafts={};state.votes={};state.selected=[];state.turn=0;
   }
   return {state,events:emit(state)};
 }
};
export default module;
