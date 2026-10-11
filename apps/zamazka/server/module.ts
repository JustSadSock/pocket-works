import type { PocketModule } from '../../../pocket-server/module-contract.js';
type Stroke={c:string;s:number;t:string;p:number[][]};
type Assignment={art:number;variation:number;strokes:Stroke[]|null};
type State={host:string;phase:string;round:number;rounds:number;deadline:number;selected:number[];participants:{id:string;name:string}[];assignments:Record<string,Assignment>;votes:Record<string,Record<string,number>>;scores:Record<string,{mask:number;eye:number}>;turn:number;revealed:boolean};
const now=()=>Date.now();
const shuffled=<T>(a:T[]):T[]=>{const copy=[...a];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
const members=(s:State)=>s.participants;
const strip=(s:State,id:string)=>({
 host:s.host,phase:s.phase,round:s.round,rounds:s.rounds,deadline:s.deadline,
 selected:s.selected,participants:s.participants,turn:s.turn,scores:s.scores,
 done:members(s).filter(p=>Array.isArray(s.assignments[p.id]?.strokes)).map(p=>p.id),
 voted:Object.keys(s.votes[members(s)[s.turn]?.id]||{}),
 mine:s.assignments[id]?{art:s.assignments[id].art,variation:s.assignments[id].variation}:null,
 author:members(s)[s.turn]||null,
 candidate:s.phase==='voting'?s.assignments[members(s)[s.turn]?.id]||null:null,
 gallery:(s.phase==='reveal'||s.phase==='results')?members(s).map(p=>({id:p.id,name:p.name,...s.assignments[p.id],votes:s.votes[p.id]||{}})):null
});
function emit(s:State){return members(s).map(p=>({type:'state',to:p.id,payload:strip(s,p.id)}))}
function notice(id:string,msg:string){return [{type:'notice',to:id,payload:msg}]}
function choose(s:State){
 s.selected=shuffled(Array.from({length:10},(_,i)=>i)).slice(0,5).map(family=>family+10*Math.floor(Math.random()*5));
 // Pick different works for the first five participants; further participants repeat independently.
 s.assignments={};s.votes={};s.turn=0;s.revealed=false;
 const shuffledArt=shuffled(s.selected);
 members(s).forEach((p,i)=>s.assignments[p.id]={art:shuffledArt[i%5],variation:(s.round+i)%4,strokes:null});
 s.phase='preview';s.deadline=now()+25000;
}
function completeVotes(s:State){
 const others=members(s).length-1;
 for(const p of members(s)){
   const found=s.votes[p.id]||{};
   const hits=Object.values(found).filter(v=>v===s.assignments[p.id]?.art).length;
   s.scores[p.id].mask+=others?Math.round(100*(others-hits)/others):0;
   let eye=0;
   for(const q of members(s)){if(q.id!==p.id&&s.votes[q.id]?.[p.id]===s.assignments[q.id]?.art)eye++;}
   s.scores[p.id].eye+=others?Math.round(100*eye/others):0;
 }
 s.phase='reveal';s.turn=0;s.deadline=now()+9500;s.revealed=true;
}
function step(s:State){
 if(s.phase==='preview'){s.phase='drawing';s.deadline=now()+105000;}
 else if(s.phase==='drawing'){for(const p of members(s))if(s.assignments[p.id]?.strokes===null)s.assignments[p.id].strokes=[];s.phase='voting';s.turn=0;s.deadline=now()+20000;}
 else if(s.phase==='voting'){
   if(s.turn<members(s).length-1){s.turn++;s.deadline=now()+20000;}
   else completeVotes(s);
 }else if(s.phase==='reveal'){
   if(s.turn<members(s).length-1){s.turn++;s.deadline=now()+9500;}
   else if(s.round<s.rounds){s.round++;choose(s);}
   else {s.phase='results';s.deadline=0;}
 }
}
function eligible(s:State,target:string,connected:string[]){return members(s).filter(p=>p.id!==target&&connected.includes(p.id))}
function normalize(raw:unknown):Stroke[]|null{
 if(!Array.isArray(raw)||raw.length>72)return null;
 let total=0;const out:Stroke[]=[];
 for(const item of raw){
   if(!item||typeof item!=='object')return null;
   const o=item as Record<string,unknown>;
   if(!/^#[0-9a-f]{6}$/i.test(String(o.c))||!Number.isFinite(o.s)||Number(o.s)<1||Number(o.s)>48||!['brush','pencil','spray','erase'].includes(String(o.t)))return null;
   if(!Array.isArray(o.p)||o.p.length>45||o.p.length<1)return null;
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
const module: PocketModule<State>={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,phase:'lobby',round:0,rounds:3,deadline:0,selected:[],participants:[player],assignments:{},votes:{},scores:{[player.id]:{mask:0,eye:0}},turn:0,revealed:false}};},
 onJoin({state,player}){
   if(state.phase==='lobby'&&!state.participants.some(p=>p.id===player.id)){
     state.participants.push(player);state.scores[player.id]={mask:0,eye:0};
   }
   return {state,events:emit(state)};
 },
 onLeave({state,player,players}){
   if(state.phase==='lobby'){state.participants=state.participants.filter(p=>p.id!==player.id);delete state.scores[player.id]}
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
   if(a.type==='start'&&state.phase==='lobby'){
     if(state.host!==id)return {state,events:notice(id,'Запустить матч может создатель комнаты.')};
     if(members(state).length<3)return {state,events:notice(id,'Для онлайна нужны минимум три участника.')};
     state.round=1;state.rounds=[1,3,5].includes(Number(a.rounds))?Number(a.rounds):3;
     members(state).forEach(p=>state.scores[p.id]={mask:0,eye:0});choose(state);
   }else if(a.type==='submit'&&state.phase==='drawing'){
     const item=state.assignments[id];const strokes=normalize(a.strokes);
     if(!item||item.strokes!==null)return {state,events:notice(id,'Эта работа уже сдана.')};
     if(!strokes)return {state,events:notice(id,'Некорректные или слишком большие данные рисунка.')};
     item.strokes=strokes;
     if(members(state).every(p=>state.assignments[p.id]?.strokes!==null))step(state);
   }else if(a.type==='vote'&&state.phase==='voting'){
     const target=members(state)[state.turn]?.id;const art=Number(a.art);
     if(!target||id===target)return {state,events:notice(id,'Автор не голосует за собственную работу.')};
     if(!state.selected.includes(art))return {state,events:notice(id,'Выбери одну из пяти картин.')};
     state.votes[target]||={};
     if(id in state.votes[target])return {state,events:notice(id,'Голос уже принят.')};
     state.votes[target][id]=art;
     if(eligible(state,target,players.map(p=>p.id)).every(p=>p.id in state.votes[target]))step(state);
   }else if(a.type==='next'&&state.phase==='results'&&id===state.host){
     state.phase='lobby';state.round=0;state.deadline=0;state.assignments={};state.votes={};state.selected=[];state.turn=0;
   }
   return {state,events:emit(state)};
 }
};
export default module;
