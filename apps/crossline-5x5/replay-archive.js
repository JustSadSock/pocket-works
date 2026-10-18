// 5×5 Arena match history. Only completed matches are archived; the entire
// engine replay log is retained so future viewers never recompute outcomes.
import {STEPS,DIRECTIONS} from './engine.js';
import {previewOrders} from './planning.js';
export const HISTORY_LIMIT=24;
export const HISTORY_KEY='pocket-works:crossline-5x5:history';
export const COMMAND_SYMBOLS={up:'↑',down:'↓',left:'←',right:'→',shield:'▣'};
export const commandLabel=a=>a?.type==='attack'?'⚔'+(a.dirs||[]).map(d=>COMMAND_SYMBOLS[d]||'?').join(''):COMMAND_SYMBOLS[a]||'·';
export function archiveId(match,{mode='solo',roomId='',seriesId='',score={}}={}){
 if(seriesId)return 'local:'+seriesId;
 // Server revision+score+room uniquely identify completed match in a duel.
 return ['online',roomId,match?.revision,score.A||0,score.B||0].join(':');
}
export function normalizeHistory(raw){
 if(!Array.isArray(raw))return [];
 const unique=new Set(),out=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||!item.match||typeof item.match!=='object')continue;
  if(!['A','B','draw'].includes(item.match.outcome)||!Array.isArray(item.match.replays)||unique.has(item.id))continue;
  if(item.match.replays.length>4||item.match.replays.some(r=>!Array.isArray(r.frames)||r.frames.length>STEPS||!Array.isArray(r.plans?.A)||!Array.isArray(r.plans?.B)))continue;
  unique.add(item.id);out.push(item);
  if(out.length>=HISTORY_LIMIT)break;
 }
 return out.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
}
export function captureHistory(match,{mode='solo',roomId='',seriesId='',score={},players=[]}={},at=Date.now()){
 if(!match||!['A','B','draw'].includes(match.outcome)||!Array.isArray(match.replays))return null;
 // Copy prevents later rematches or network state updates mutating archived data.
 const data=JSON.parse(JSON.stringify(match));
 return {
  id:archiveId(data,{mode,roomId,seriesId,score}),savedAt:at,
  mode:['solo','hotseat','online'].includes(mode)?mode:'solo',
  players:Array.isArray(players)?players.slice(0,2).map(p=>String(p||'').slice(0,48)):[],
  score:{A:Number(score.A)||0,B:Number(score.B)||0},match:data
 };
}
export function addHistory(history,item){
 if(!item)return normalizeHistory(history);
 return normalizeHistory([item,...normalizeHistory(history).filter(h=>h.id!==item.id)]);
}
export function getHistory(storage=localStorage,key=HISTORY_KEY){
 try{return normalizeHistory(JSON.parse(storage.getItem(key)||'[]'))}catch{return []}
}
export function saveHistory(storage,item,key=HISTORY_KEY){
 const list=addHistory(getHistory(storage,key),item);
 // LocalStorage quota can be small on embedded browsers. Remove oldest
 // completed matches until the list is durably stored, rather than failing.
 for(let length=list.length;length>=1;length--){
  try{storage.setItem(key,JSON.stringify(list.slice(0,length)));return {saved:true,items:list.slice(0,length)}}
  catch{}
 }
 return {saved:false,items:getHistory(storage,key)};
}
export function deleteHistory(storage,id,key=HISTORY_KEY){
 const old=getHistory(storage,key),next=old.filter(item=>item.id!==id);
 try{storage.setItem(key,JSON.stringify(next));return {saved:true,items:next}}catch{return {saved:false,items:old}}
}
export const outcomeText=out=>out==='draw'?'Ничья':out==='A'?'Победа синего':'Победа оранжевого';
export function analyzeBeat(record,index){
 if(!record||!Array.isArray(record.frames)||!record.plans)return null;
 const count=record.frames.length,step=Math.max(0,Math.min(count,index)),frame=step?record.frames[step-1]:null;
 const projected={};
 for(const side of ['A','B']){
  const initial={round:record.round,units:record.begin,edgesCollapsed:record.round>4};
  const moves=previewOrders(initial,side,record.plans[side]||[]);
  const planned=step?moves.steps[step-1]?.to||null:moves.origin;
  const actual=frame?.units?.[side]||record.begin?.[side];
  const events=frame?.events?.filter(e=>e.side===side)||[];
  const action=step?record.plans[side]?.[step-1]:null;
  let verdict='До начала';
  if(step){
   const attack=events.some(e=>e.type==='attack');
   if(events.some(e=>e.type==='hit'))verdict='Получил удар';
   else if(events.some(e=>e.type==='fall'))verdict='Упал';
   else if(events.some(e=>e.type==='block'))verdict='Отразил удар';
   else if(attack)verdict='Атаковал';
   else if(action==='shield')verdict='Защита';
   else if(!planned||!actual)verdict='Нет данных';
   else if(planned.x!==actual.x||planned.y!==actual.y)verdict='Путь изменён';
   else verdict='По плану';
  }
  projected[side]={planned,actual:actual?{x:actual.x,y:actual.y,alive:actual.alive}:null,
   action,events,verdict,diverged:!!(planned&&actual&&(planned.x!==actual.x||planned.y!==actual.y))};
 }
 return {step,total:count,executed:count,frame,projected};
}
export function exportMatch(entry){
 if(!entry?.match||!Array.isArray(entry.match.replays))return null;
 return JSON.stringify({
  format:'crossline-5x5',version:2,exportedAt:new Date().toISOString(),
  id:entry.id,mode:entry.mode,players:entry.players,score:entry.score,match:entry.match
 },null,2);
}
