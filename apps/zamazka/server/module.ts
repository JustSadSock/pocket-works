import type { PocketModule } from '../../../pocket-server/module-contract.js';
// The local host exports this in /health so an outdated three-player backend
// cannot silently masquerade as the current two-player edition.
export const MIN_PLAYERS=2;
export const RULESET_VERSION=21;
// Updated alongside ARTS in artworks.js; the initial cover portrait remains outside matches.
const CATALOG_COUNT=136; // 72 old originals + 36 first selection + 28 second selection
const EXCLUDED_PAINTINGS=new Set([2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69,115]); // The user's 26 rejected historical originals; IDs retained.
// 0 = untimed drawing; only committed submissions from every participant end it.
const DRAWING_TIMES=[0,120,180,240,300,600];
const DEFAULT_DRAWING_SECONDS=300;
// At 0:00 freeze client painting, then accept in-flight multipart submissions.
// This is transport grace, not extra drawing time; never expose early results.
export const FINAL_SUBMISSION_GRACE_MS=25000;
// Allow a declared final upload to finish/retry without silently publishing an old draft.
export const FINAL_TRANSFER_RECOVERY_MS=120000;
type Stroke={c:string;s:number;t:string;p:number[][]};
type Assignment={art:number;variation:number;strokes:Stroke[]|null};
type Chips=number[];
type VoteTiming=Record<string,Record<string,number[][]>>;
type ScoreAudit={byVoter:Record<string,{eye:number;base:number;speed:number;correct:number}>;mask:number;base:number;delay:number;late:number;undetected:number;correct:number;wrong:number};
type BoardSegment={u:string;k:string;q:number;c:string;s:number;p:number[][]};
type CommonsBoard={revision:number;segments:BoardSegment[];full?:boolean};
type DraftAssembly={checksum?:string;revision:string;kind:'draft_chunk'|'submit_chunk';parts:number;next:number;prefix:number;strokes:Stroke[]};
type State={pendingFinals?:Record<string,number>;incompleteSubmissions?:string[];resumable?:boolean;balancedDamage?:boolean;shapeCorrected?:boolean;paused?:boolean;pausedAt?:number;pauseRemainingMs?:number;onlineIds?:string[];artPreparationEnabled?:boolean;readyPlayers?:string[];draftAssemblies?:Record<string,DraftAssembly>;bannedIds?:string[];emblemUpdatedAt?:Record<string,number>;board?:CommonsBoard;emblems?:Record<string,string>;host:string;phase:string;round:number;rounds:number;drawingSeconds:number;deadline:number;selected:number[];participants:{id:string;name:string}[];assignments:Record<string,Assignment>;drafts?:Record<string,Stroke[]>;votes:Record<string,Record<string,Chips>>;voteDrafts?:Record<string,Record<string,Chips>>;voteTiming?:VoteTiming;timedScoring?:boolean;scores:Record<string,{mask:number;eye:number}>;turn:number;revealed:boolean};
const now=()=>Date.now();
const shuffled=<T>(a:T[]):T[]=>{const copy=[...a];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
const members=(s:State)=>s.participants;
// The final durable painting, not the drawing clock, closes the restoration stage.
const allCommitted=(s:State)=>members(s).length>0&&members(s).every(p=>Array.isArray(s.assignments[p.id]?.strokes));
const strip=(s:State,id:string)=>({
 host:s.host,phase:s.phase,serverNow:now(),timedScoring:Boolean(s.timedScoring),paused:Boolean(s.paused),pausedAt:s.paused?s.pausedAt:undefined,pauseRemainingMs:s.paused?s.pauseRemainingMs:undefined,onlineIds:s.onlineIds||[],round:s.round,rounds:s.rounds,drawingSeconds:s.drawingSeconds??DEFAULT_DRAWING_SECONDS,deadline:s.deadline,readyCount:s.readyPlayers?.length||0,
 selected:s.selected,participants:s.participants,emblems:s.emblems||{},board:s.phase==='lobby'?(s.board||{revision:0,segments:[]}):undefined,turn:s.turn,scores:s.scores,
 done:members(s).filter(p=>Array.isArray(s.assignments[p.id]?.strokes)).map(p=>p.id),
 incompleteSubmissions:s.incompleteSubmissions||[],
 voted:Object.keys(s.votes[members(s)[s.turn]?.id]||{}),
 mine:s.assignments[id]?{art:s.assignments[id].art,variation:s.assignments[id].variation,strokes:s.assignments[id].strokes,draft:s.drafts?.[id]??null}:null,
 author:members(s)[s.turn]||null,
 candidate:s.phase==='voting'?s.assignments[members(s)[s.turn]?.id]||null:null,
 gallery:(s.phase==='verdict'||s.phase==='reveal'||s.phase==='round-review'||s.phase==='results')?members(s).map((p,i)=>(s.phase!=='verdict'&&s.phase!=='reveal')||i<=s.turn?({id:p.id,name:p.name,...s.assignments[p.id],votes:s.votes[p.id]||{},scoreAudit:s.timedScoring?scoreTurn(s,p.id):undefined}):null):null
});
function emit(s:State){return members(s).map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}))}
function notice(id:string,msg:string){return [{type:'notice',to:id,payload:msg}]}
function choose(s:State){
 s.selected=shuffled(Array.from({length:CATALOG_COUNT-1},(_,i)=>i+1).filter(id=>!EXCLUDED_PAINTINGS.has(id))).slice(0,5);
 // Assign each restorer independently from the same five previewed originals.
 // Two players may receive one painting but different damaged fragments.
 s.assignments={};s.drafts={};s.draftAssemblies={};s.pendingFinals={};s.incompleteSubmissions=[];s.votes={};s.voteDrafts={};s.voteTiming={};s.turn=0;s.revealed=false;
 members(s).forEach(p=>s.assignments[p.id]={art:s.selected[Math.floor(Math.random()*s.selected.length)],
  variation:s.shapeCorrected?0x200000000+Math.floor(Math.random()*0x100000000):s.balancedDamage?0x100000000+Math.floor(Math.random()*0x100000000):Math.floor(Math.random()*0xffffffff),strokes:null});
 s.readyPlayers=[];s.phase=s.artPreparationEnabled?'preparing':'preview';s.deadline=now()+(s.artPreparationEnabled?15000:25000);
}
const VOTE_WINDOW_MS=25500;
const RATE_SPEED=40; // early correct guess, maximum per coin
const RATE_DECOY_DELAY=80; // maximum for the latest wrong coin, quadratic ramp
const RATE_DISCOVERY_DELAY=30; // maximum for the latest correct discovery, quadratic ramp
const UNDETECTED_BONUS=60; // author: at least one cast vote, zero correct guesses
// A later difficulty selector can pass a multiplier for the RESTORER only;
// neutral difficulty=1 preserves today's unweighted artwork assignments.
// Later guesses pay disproportionately more to the restorer. Both curves
// start at zero, remain smooth, and are server-authoritative (t in [0,1]).
const lateRewardCurve=(t:number)=>t*t;
function recordVoteTiming(s:State,target:string,voter:string,chips:Chips){
 s.voteTiming||={};s.voteTiming[target]||={};
 const old=s.voteTiming[target][voter]||[[],[],[],[],[]];
 // Store millisecond-level elapsed fractions, normalized to 0–1000.
 // No client-sent clock is ever trusted. Relative deadline remains correct
 // if PocketNet extends the round following a connection pause.
 const elapsed=Math.max(0,Math.min(1000,Math.round(
  (1-(s.deadline-now())/VOTE_WINDOW_MS)*1000)));
 s.voteTiming[target][voter]=chips.map((n,i)=>{
  const prior=Array.isArray(old[i])?old[i]:[];
  return Array.from({length:n},(_,j)=>j<prior.length?prior[j]:elapsed);
 });
}
function scoreTurn(s:State,authorId:string,difficultyWeight=1):ScoreAudit{
 const others=Math.max(1,members(s).length-1),assignment=s.assignments[authorId];
 const correctIndex=s.selected.indexOf(assignment?.art);
 const byVoter:ScoreAudit['byVoter']={};
 let correct=0,wrong=0,missDelay=0,catchDelay=0;
 for(const voter of members(s)){
  if(voter.id===authorId)continue;
  const ballot=s.votes[authorId]?.[voter.id];
  if(!Array.isArray(ballot))continue;
  const times=s.voteTiming?.[authorId]?.[voter.id]||[];
  let hit=0,speed=0;
  for(let i=0;i<5;i++){
   const qty=Math.max(0,Math.min(3,Number(ballot[i])||0));
   for(let n=0;n<qty;n++){
    // A direct submission (without a preceding draft) is timestamped by
    // recordVoteTiming on receipt; legacy missing metadata earns no
    // early-guesser advantage.
    const fraction=Math.max(0,Math.min(1,Number(times[i]?.[n]??1000)/1000));
    if(i===correctIndex){hit++;correct++;speed+=1-fraction;catchDelay+=lateRewardCurve(fraction);}
    else{wrong++;missDelay+=lateRewardCurve(fraction);}
   }
  }
  const base=Math.round(100*hit/others);
  const fast=Math.round(RATE_SPEED*speed/others);
  byVoter[voter.id]={eye:base+fast,base,speed:fast,correct:hit};
 }
 const weight=Number.isFinite(difficultyWeight)?Math.max(.5,Math.min(2,difficultyWeight)):1;
 const base=Math.round(50*wrong/others*weight);
 const delay=Math.round(RATE_DECOY_DELAY*missDelay/others*weight);
 const late=Math.round(RATE_DISCOVERY_DELAY*catchDelay/others*weight);
 const undetected=wrong>0&&correct===0?Math.round(UNDETECTED_BONUS*weight):0;
 return {byVoter,mask:base+delay+late+undetected,base,delay,late,undetected,correct,wrong};
}
function completeVotes(s:State){
 if(s.revealed)return;
 if(!s.timedScoring){
  // Older room state created before timed scoring keeps legacy math.
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
 }else{
  for(const author of members(s)){
   const audit=scoreTurn(s,author.id);
   s.scores[author.id].mask+=audit.mask;
   for(const [voterId,award] of Object.entries(audit.byVoter))
    if(s.scores[voterId])s.scores[voterId].eye+=award.eye;
  }
 }
 s.revealed=true;
}
function step(s:State){
 if(s.phase==='preparing'){s.phase='preview';s.deadline=now()+25000;}
 else if(s.phase==='preview'){
   s.phase='drawing';
   s.deadline=s.drawingSeconds===0?0:now()+(s.drawingSeconds??DEFAULT_DRAWING_SECONDS)*1000;
  }
 else if(s.phase==='drawing'){
  // A timed-out upload must be visible as incomplete, never represented as a confirmed final painting.
  s.incompleteSubmissions=[];
  for(const p of members(s))if(s.assignments[p.id]?.strokes===null){
   s.incompleteSubmissions.push(p.id);
   s.assignments[p.id].strokes=s.drafts?.[p.id]??[];
  }
  s.pendingFinals={};
  // In-flight chunks must not survive the deadline: their complete predecessor
  // is already installed, and keeping them can bloat a full eight-player room.
  s.draftAssemblies={};s.drafts={};
  s.phase='voting';s.turn=0;s.deadline=now()+VOTE_WINDOW_MS;
 }else if(s.phase==='voting'){
  // At the deadline, count 1- and 2-coin ballots as submitted votes.
  const target=members(s)[s.turn]?.id;
  if(target){
   s.votes[target]||={};
   for(const [voter,coins] of Object.entries(s.voteDrafts?.[target]||{}))
    if(voter!==target&&members(s).some(p=>p.id===voter)&&!(voter in s.votes[target])&&
      Array.isArray(coins)&&coins.reduce((sum,n)=>sum+n,0)>0){
      s.votes[target][voter]=[...coins];
      if(s.timedScoring){
       // Earlier draft timestamps survive deadline-commit. Never treat
       // unfinished coins as if they were only placed at 0:00.
       if(!s.voteTiming?.[target]?.[voter])recordVoteTiming(s,target,voter,coins);
      }
    }
  }
  // Let everyone see the server-confirmed coin distribution before the answer.
  s.phase='verdict';s.deadline=now()+10000;
 }else if(s.phase==='verdict'){
  s.phase='reveal';s.deadline=now()+19000;
 }else if(s.phase==='reveal'){
  if(s.turn<members(s).length-1){s.turn++;s.phase='voting';s.deadline=now()+VOTE_WINDOW_MS;}
  else {
   completeVotes(s);
   // Untimed shared exhibition, advancing only when the host chooses.
   s.phase='round-review';s.deadline=0;
  }
 }
}
function eligible(s:State,target:string,connected:string[]){return members(s).filter(p=>p.id!==target&&connected.includes(p.id))}
function paintingChecksum(strokes:Stroke[]):string{
 const data=JSON.stringify(strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p})));
 let hash=2166136261;
 for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0}
 return hash.toString(16).padStart(8,'0');
}
function normalize(raw:unknown):Stroke[]|null{
 if(!Array.isArray(raw)||raw.length>768)return null;
 let total=0;const out:Stroke[]=[];
 for(const item of raw){
   if(!item||typeof item!=='object')return null;
   const o=item as Record<string,unknown>;
   if(!/^#[0-9a-f]{6}$/i.test(String(o.c))||!Number.isFinite(o.s)||Number(o.s)<.25||Number(o.s)>48||Math.round(Number(o.s)*4)!==Number(o.s)*4||!['brush','pencil','spray','erase','fill','smudge'].includes(String(o.t)))return null;
   if(!Array.isArray(o.p)||o.p.length>(o.t==='fill'?1:96)||o.p.length<1)return null;
   const points:number[][]=[];
   for(const point of o.p){
     if(!Array.isArray(point)||point.length!==2||point.some(v=>!Number.isFinite(v))||point[0]<0||point[0]>600||point[1]<0||point[1]>450)return null;
     points.push([Math.round(point[0]*10)/10,Math.round(point[1]*10)/10]);
   }
   total+=points.length;if(total>24000)return null;
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
// Preserve accepted marks; never silently remove early artwork at capacity.
const BOARD_LIMIT=1200;
// The whole PocketNet room record must remain below 256 KiB.
const BOARD_BYTE_BUDGET=176*1024;
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
 createRoom({player}){return {state:{resumable:true,balancedDamage:true,shapeCorrected:true,timedScoring:true,board:{revision:0,segments:[]},emblems:{},emblemUpdatedAt:{},bannedIds:[],host:player.id,phase:'lobby',round:0,rounds:3,drawingSeconds:DEFAULT_DRAWING_SECONDS,deadline:0,selected:[],participants:[player],assignments:{},drafts:{},draftAssemblies:{},votes:{},voteTiming:{},scores:{[player.id]:{mask:0,eye:0}},turn:0,revealed:false}};},
 onJoin({state,player}){
   if(state.bannedIds?.includes(player.id))throw Error('room_kicked');
   if(state.phase!=='lobby'&&!state.participants.some(p=>p.id===player.id))throw Error('room_in_progress');
   if(state.phase==='lobby'&&!state.participants.some(p=>p.id===player.id)){
     state.participants.push(player);state.scores[player.id]={mask:0,eye:0};
   }
   return {state,events:emit(state)};
 },
 onLeave({state,player,players}){
   if(state.phase==='lobby'){state.participants=state.participants.filter(p=>p.id!==player.id);delete state.scores[player.id];if(state.emblems)delete state.emblems[player.id];if(state.emblemUpdatedAt)delete state.emblemUpdatedAt[player.id]}
   if(state.host===player.id)state.host=players[0]?.id||'';
   return {state,events:emit(state)};
 },
 onMessage({state,player,players,payload}){
   const a=(payload&&typeof payload==='object'?payload:{}) as Record<string,unknown>;
   const id=player.id;const isMember=state.participants.some(p=>p.id===id);
   if(!isMember)return {state,events:notice(id,'Вы не участник этой комнаты.')};
   if(a.type==='sync')return {state,events:[{type:'state',to:id,payload:strip(state,id)}]};
    if(a.type==='time_ping'&&Number.isFinite(a.stamp))return {state,events:[{type:'time_pong',to:id,payload:{stamp:a.stamp,serverNow:now()}}]};
   // Keep transport intent state immutable while a room is paused. The client
   // retains its local drawing and can resume after all required seats return.
   if(state.paused&&(a.type==='submit_begin'||a.type==='submit_resume'))
     return {state,events:notice(id,'Матч на паузе. Дождитесь восстановления комнаты.')};
   // A final intent arrives before multipart upload. Keep the room in drawing while
   // this upload is recoverable (bounded by the hard recovery deadline).
   if(a.type==='submit_begin'&&state.phase==='drawing'&&isMember){
    const item=state.assignments[id];
    if(item&&item.strokes===null&&a.round===state.round&&a.art===item.art&&a.variation===item.variation){
     (state.pendingFinals||={})[id]=now();
     return {state,events:[{type:'submit_pending',to:id,payload:{round:state.round}}]};
    }
   }
   // Resume only the validated, ordered prefix of an existing final revision.
   // An unknown or replaced revision safely restarts from part zero.
   if(a.type==='submit_resume'&&isMember){
    const item=state.assignments[id];
    const assembly=state.draftAssemblies?.[id];
    const valid=!!item&&a.round===state.round&&
      a.art===item.art&&a.variation===item.variation&&
      typeof a.revision==='string'&&/^r[a-z0-9-]{1,30}$/.test(a.revision)&&
      typeof a.checksum==='string'&&/^[0-9a-f]{8}$/.test(a.checksum)&&
      Number.isInteger(a.parts)&&a.parts>0&&a.parts<=160;
    if(!valid)return {state,events:notice(id,'Невозможно восстановить эту отправку.')};
    // The full final may be committed while its ACK is lost in a reconnect.
    // Confirm the durable bytes instead of requesting another multipart upload.
    // A timer fallback is not a confirmed final even if its draft matches.
    if(Array.isArray(item.strokes)&&!state.incompleteSubmissions?.includes(id)){
      const committed=paintingChecksum(item.strokes);
      if(committed===a.checksum)return {state,events:[{type:'submission_saved',to:id,payload:{
        round:state.round,art:item.art,variation:item.variation,revision:a.revision,
        checksum:committed,lines:item.strokes.length
      }}]};
      return {state,events:notice(id,'Сохранённая работа не совпадает с отправкой.')};
    }
    if(state.phase!=='drawing'||item.strokes!==null)
      return {state,events:notice(id,'Невозможно восстановить эту отправку.')};
    (state.pendingFinals||={})[id]=now();
    const next=assembly?.kind==='submit_chunk'&&assembly.revision===a.revision&&
      assembly.checksum===a.checksum&&assembly.parts===a.parts?assembly.next:0;
    return {state,events:[{type:'submit_resume_state',to:id,payload:{
      round:state.round,art:item.art,variation:item.variation,revision:a.revision,
      checksum:a.checksum,parts:a.parts,next
    }}]};
   }
   // Preview and voting advance at their normal deadlines. During drawing,
   // the timer expires at precisely 0:00, but buffered network chunks must
   // still have time to complete. Do not render voting before that window.
   const phaseBeforePulse=state.phase,turnBeforePulse=state.turn,roundBeforePulse=state.round;
   if(!state.paused&&state.deadline&&state.phase!=='results'&&
      !(state.phase==='drawing'&&now()<state.deadline+FINAL_TRANSFER_RECOVERY_MS&&
        members(state).some(p=>state.assignments[p.id]?.strokes===null&&
          (state.pendingFinals?.[p.id]||state.draftAssemblies?.[p.id]?.kind==='submit_chunk')))&&now()>=
      (state.phase==='drawing'&&state.drawingSeconds>0
       ?state.deadline+(allCommitted(state)
          ?0:FINAL_SUBMISSION_GRACE_MS):state.deadline))step(state);
   // Timer probes must not broadcast potentially megabyte-sized galleries
   // to all eight players when no authoritative state actually changed.
   if(a.type==='pulse')return {state,events:
     state.phase!==phaseBeforePulse||state.turn!==turnBeforePulse||state.round!==roundBeforePulse
       ?emit(state):[]};
    if(state.paused&&a.type!=='kick_player'&&a.type!=='claim_host')return {state,events:notice(id,'Матч на паузе. Дождитесь участников или исключите отсутствующего игрока.')};
   if(a.type==='claim_host'&&state.paused){
    if((state.onlineIds||[]).includes(state.host)||state.host===id)
     return {state,events:notice(id,'Организатор уже в комнате.')};
    if(now()-(state.pausedAt||now())<60000)
     return {state,events:notice(id,'Переназначение организатора доступно через минуту паузы.')};
    state.host=id;return {state,events:emit(state)};
   }
   if(a.type==='kick_player'){
     if(state.phase!=='lobby'&&!state.paused)return {state,events:notice(id,'Исключать игроков можно в зале ожидания или когда матч приостановлен.')};
     if(state.host!==id)return {state,events:notice(id,'Исключать игроков может только куратор.')};
     const target=typeof a.targetId==='string'?a.targetId:'';
     if(!target||target===id||!players.some(p=>p.id===target)||!members(state).some(p=>p.id===target))
       return {state,events:notice(id,'Этот участник уже вышел или его нельзя исключить.')};
     if(state.paused){
       if((state.onlineIds||[]).includes(target))return {state,events:notice(id,'Этот игрок уже подключился.')};
       if(members(state).length<=2)return {state,events:notice(id,'Для продолжения выставки нужно хотя бы два игрока.')};
      }
      state.bannedIds||=[];if(!state.bannedIds.includes(target))state.bannedIds.push(target);
      const oldTurn=members(state)[state.turn]?.id;
      state.participants=members(state).filter(p=>p.id!==target);
      if(state.phase!=='lobby'){
       state.turn=Math.max(0,Math.min(state.participants.length-1,
        state.participants.findIndex(p=>p.id===oldTurn)>=0?
        state.participants.findIndex(p=>p.id===oldTurn):state.turn));
       for(const ballot of Object.values(state.votes||{}))delete ballot[target];
       delete state.votes[target];
      }
      state.onlineIds=state.onlineIds?.filter(p=>p!==target);
     delete state.scores[target];
     delete state.emblems?.[target];
     delete state.emblemUpdatedAt?.[target];
     delete state.assignments[target];
     delete state.drafts?.[target];
     delete state.draftAssemblies?.[target];
     state.readyPlayers=state.readyPlayers?.filter(p=>p!==target);
     // Remove their marks from the collaborative lobby canvas, too.
     if(state.board){
       state.board.segments=state.board.segments.filter(s=>s.u!==target);
       state.board.revision++;
     }
     // PocketNet sees this authenticated, host-only event and forcibly
     // releases the target's network seat after notifying their socket.
     return {state,events:[...emit(state),{type:'player_kicked',to:target,payload:{reason:'curator'}}]};
   }
   if(a.type==='art_ready'&&state.phase==='preparing'){
     if(a.round!==state.round)return {state,events:notice(id,'Этот набор картин уже сменился.')};
     state.readyPlayers||=[];
     if(state.readyPlayers.includes(id))return {state,events:[]};
     state.readyPlayers.push(id);
     if(members(state).every(p=>state.readyPlayers?.includes(p.id)))step(state);
     return {state,events:emit(state)};
   }
   if(a.type==='board_delta'&&state.phase==='lobby'){
     const board=state.board ||= {revision:0,segments:[]};
     if(a.revision!==board.revision)return {state,events:[{type:'board_reset',to:id,payload:board}]};
     const segment=boardSegment(a,id);
     if(!segment)return {state,events:notice(id,'Недопустимый мазок на общем холсте.')};
     const overBudget=JSON.stringify(board.segments).length+JSON.stringify(segment).length>BOARD_BYTE_BUDGET;
     if(board.full||board.segments.length>=BOARD_LIMIT||overBudget){
      board.full=true;
      return {state,events:[{type:'board_full',to:id,payload:{limit:BOARD_LIMIT}}]};
     }
     board.segments.push(segment);
     return {state,events:[{type:'board_delta',payload:{...segment,revision:board.revision}}]};
   }
   if(a.type==='board_clear'&&state.phase==='lobby'){
     if(state.host!==id)return {state,events:notice(id,'Очистить общий холст может только куратор.')};
     const board=state.board ||= {revision:0,segments:[]};
     board.segments=[];board.full=false;board.revision++;
     return {state,events:[{type:'board_reset',payload:board}]};
   }
   if(a.type==='emblem'){
     if(state.phase!=='lobby')return {state,events:notice(id,'Личный знак меняется только в зале ожидания.')};
     const data=sanitizeEmblem(a.image);
     if(data===undefined)return {state,events:notice(id,'Не удалось сохранить личный знак: изображение слишком большое или некорректное.')};
     state.emblems||={};
     if((state.emblems[id]||null)===data)return {state,events:[]};
     state.emblemUpdatedAt||={};
     if(now()-(state.emblemUpdatedAt[id]??-Infinity)<1800)return {state,events:[]};
     state.emblemUpdatedAt[id]=now();
     if(data===null)delete state.emblems[id];else state.emblems[id]=data;
     return {state,events:emit(state)};
   }
   let changed=false;
   if(a.type==='start'&&state.phase==='lobby'){
     if(state.host!==id)return {state,events:notice(id,'Запустить матч может создатель комнаты.')};
     if(members(state).length<MIN_PLAYERS)return {state,events:notice(id,'Для онлайна нужны минимум два участника.')};
     state.round=1;state.rounds=[1,3,5].includes(Number(a.rounds))?Number(a.rounds):3;
     state.drawingSeconds=typeof a.drawingSeconds==='number'&&DRAWING_TIMES.includes(a.drawingSeconds)?a.drawingSeconds:DEFAULT_DRAWING_SECONDS;
     state.artPreparationEnabled=a.preload===true;
     state.board={revision:(state.board?.revision||0)+1,segments:[]};
     members(state).forEach(p=>state.scores[p.id]={mask:0,eye:0});choose(state);changed=true;
   }else if((a.type==='draft_chunk'||a.type==='submit_chunk')&&state.phase==='drawing'){
     const item=state.assignments[id],kind=a.type;
     if(!item||item.strokes!==null||a.round!==state.round||a.art!==item.art||a.variation!==item.variation)
       return {state,events:notice(id,'Этот рисунок уже завершён или относится к другому раунду.')};
     if(typeof a.revision!=='string'||!/^r[a-z0-9-]{1,30}$/.test(a.revision)||
        !Number.isInteger(a.parts)||a.parts<1||a.parts>160||
        !Number.isInteger(a.index)||a.index<0||a.index>=a.parts||
        !Array.isArray(a.strokes)||a.strokes.length>8||
        (a.checksum!==undefined&&(typeof a.checksum!=='string'||!/^[0-9a-f]{8}$/.test(a.checksum)))||
        (a.basePrefix!==undefined&&(kind!=='draft_chunk'||!Number.isInteger(a.basePrefix)||
          a.basePrefix<1||a.basePrefix>768))||
        (a.baseChecksum!==undefined&&(kind!=='draft_chunk'||!Number.isInteger(a.basePrefix)||
          typeof a.baseChecksum!=='string'||!/^[0-9a-f]{8}$/.test(a.baseChecksum)))||
        (a.basePrefix!==undefined&&a.baseChecksum===undefined))
       return {state,events:notice(id,'Некорректная часть рисунка.')};
     const strokes=normalize(a.strokes);
     if(!strokes)return {state,events:notice(id,'Недопустимые мазки в рисунке.')};
     state.draftAssemblies||={};
     let assembling=state.draftAssemblies[id];
     if(kind==='submit_chunk')(state.pendingFinals||={})[id]=now();
     if(a.index===0){
       // A compact draft can reference only a previous, fully acknowledged
       // backup. Reject stale baselines without touching either saved artwork
       // or an in-flight assembly, so the client can retry a full revision.
       const basePrefix=kind==='draft_chunk'?Number(a.basePrefix)||0:0;
       if(basePrefix){
         const baseline=state.drafts?.[id];
         if(!Array.isArray(baseline)||basePrefix>baseline.length||
            paintingChecksum(baseline)!==a.baseChecksum)
           return {state,events:notice(id,'Черновик на сервере изменился. Отправляем полную копию.')};
       }
       // A new revision replaces only an INCOMPLETE assembly. The committed
       // draft remains available until every part has passed all checks.
       assembling={revision:a.revision,checksum:typeof a.checksum==='string'?a.checksum:undefined,kind,parts:a.parts,next:0,prefix:basePrefix,strokes:[]};
       state.draftAssemblies[id]=assembling;
     }
     if(!assembling||assembling.revision!==a.revision||assembling.kind!==kind||
        assembling.parts!==a.parts||assembling.next!==a.index||assembling.checksum!==a.checksum)
       return {state,events:notice(id,'Части рисунка пришли не по порядку. Повторяем сохранение.')};
     // Most saves differ only by their last few strokes. Keep the unchanged
     // prefix by reference to the committed backup instead of duplicating a
     // a large painting in the persistent room state for every player.
     const previous=state.drafts?.[id]||[];
     for(const stroke of strokes){
       if(!assembling.strokes.length&&assembling.prefix<previous.length&&
          JSON.stringify(stroke)===JSON.stringify(previous[assembling.prefix]))assembling.prefix++;
       else assembling.strokes.push(stroke);
     }
     const totalStrokes=assembling.prefix+assembling.strokes.length;
     const totalPoints=previous.slice(0,assembling.prefix).reduce((n,stroke)=>n+stroke.p.length,0)+
       assembling.strokes.reduce((n,stroke)=>n+stroke.p.length,0);
     if(totalStrokes>768||totalPoints>24000){
       delete state.draftAssemblies[id];
       return {state,events:notice(id,'Превышен лимит линий или точек.')};
     }
     assembling.next++;
     if(assembling.next!==assembling.parts)return {state,events:[]};
     const completed=normalize([...previous.slice(0,assembling.prefix),...assembling.strokes]);
     delete state.draftAssemblies[id];
     if(!completed)return {state,events:notice(id,'Сохранение повреждено; предыдущая копия сохранена.')};
     if(assembling.checksum&&paintingChecksum(completed)!==assembling.checksum)
       return {state,events:notice(id,'Контрольная сумма рисунка не совпала. Повторяем отправку.')};
     state.drafts||={};
     state.drafts[id]=completed;
     if(kind==='draft_chunk')
       return {state,events:[{type:'draft_saved',to:id,payload:{round:state.round,art:item.art,variation:item.variation,revision:a.revision,checksum:paintingChecksum(completed),lines:completed.length}}]};
     item.strokes=completed;
     delete state.pendingFinals?.[id];
     delete state.drafts[id];
     if(allCommitted(state))step(state);
     // A WebSocket send is not a confirmed submission: only this durable
     // server-side commit can acknowledge a full multi-packet restoration.
     return {state,events:[...emit(state),{type:'submission_saved',to:id,
       payload:{round:state.round,art:item.art,variation:item.variation,revision:a.revision,checksum:paintingChecksum(completed),lines:completed.length}}]};
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
     delete state.pendingFinals?.[id];
     delete state.drafts?.[id];
     if(allCommitted(state))step(state);
     return {state,events:[...emit(state),{type:'submission_saved',to:id,
       payload:{round:state.round,art:item.art,variation:item.variation,revision:null,lines:strokes.length}}]};
   }else if((a.type==='vote'||a.type==='vote_draft')&&state.phase==='voting'){
     const target=members(state)[state.turn]?.id;
     if(a.round!==state.round||a.turn!==state.turn||a.targetId!==target)
      return {state,events:notice(id,'Это голосование уже завершилось. Дождись следующей картины.')};
     if(!target||id===target)return {state,events:notice(id,'Автор не голосует за собственную работу.')};
     const chips=a.chips;
     if(!Array.isArray(chips)||chips.length!==5||chips.some(n=>!Number.isInteger(n)||n<0||n>3)||chips.reduce((a,b)=>a+b,0)>3)
      return {state,events:notice(id,'Можно использовать не более трёх монет.')};
     const used=chips.reduce((sum,n)=>sum+n,0);
     if(a.type==='vote_draft'){
      // A delayed/retried draft must never rewrite a finalized ballot.
      if(id in (state.votes[target]||{}))return {state,events:[]};
      state.voteDrafts||={};state.voteDrafts[target]||={};
      if(used)state.voteDrafts[target][id]=[...chips] as Chips;
      else delete state.voteDrafts[target][id];
      if(state.timedScoring)recordVoteTiming(state,target,id,chips as Chips);
      return {state,events:[]};
     }
     if(used<1)return {state,events:notice(id,'Поставь хотя бы одну монету.')};
     state.votes[target]||={};
     if(id in state.votes[target])return {state,events:[{type:'vote_saved',to:id,payload:{round:state.round,turn:state.turn}}]};
     state.votes[target][id]=[...chips] as Chips;
     if(state.timedScoring)recordVoteTiming(state,target,id,chips as Chips);
     if(state.voteDrafts?.[target])delete state.voteDrafts[target][id];
     const acceptedTurn=state.turn;
     if(eligible(state,target,players.map(p=>p.id)).every(p=>p.id in state.votes[target]))step(state);
     return {state,events:[...emit(state),{type:'vote_saved',to:id,payload:{round:state.round,turn:acceptedTurn}}]};
   }else if(a.type==='advance'&&id===state.host&&(state.phase==='verdict'||state.phase==='reveal')){
     // Prevent accidental double-clicks from skipping two artworks.
     const phaseMs=state.phase==='verdict'?10000:19000;
     // The jury's published ballots remain readable for at least six seconds.
     const earliest=state.phase==='verdict'?6000:2800;
     if(now()>=state.deadline-phaseMs+earliest){step(state);changed=true;}
   }else if(a.type==='continue'&&state.phase==='round-review'){
     if(id!==state.host)return {state,events:notice(id,'Продолжить может только организатор комнаты.')};
     if(state.round<state.rounds){state.round++;choose(state);}
     else {state.phase='results';state.deadline=0;}
     changed=true;
   }else if(a.type==='next'&&state.phase==='results'&&id===state.host){
     state.participants=state.participants.filter(p=>players.some(online=>online.id===p.id));state.board={revision:(state.board?.revision||0)+1,segments:[]};state.phase='lobby';state.round=0;state.deadline=0;state.assignments={};state.drafts={};state.draftAssemblies={};state.pendingFinals={};state.incompleteSubmissions=[];state.votes={};state.selected=[];state.turn=0;
     changed=true;
   }
   return {state,events:changed?emit(state):[]};
 }
};
export default module;
