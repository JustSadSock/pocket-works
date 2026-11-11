import { GRAMMAR, PHRASES, TOPICS } from './content.js';
export const STORAGE_KEY='pocket-works:sin-guion:v1';
export const DAY=86400000;
export const allExercises=GRAMMAR.flatMap(group=>group.items.map((item,index)=>({
 id:group.id+'-'+index,group:group.id,question:item[0],answer:item[1],
 choices:[item[1],item[2],item[3]],why:item[4]
})));
export const allPhrases=PHRASES.map((p,i)=>({id:'phrase-'+i,front:p[0],back:p[1],group:p[2]}));
export function freshState(now=Date.now()){
 return {version:1,startedAt:now,exercise:{},phrases:{},attempts:[],oral:[],settings:{},practiceCount:0};
}
export function normalizeState(raw,now=Date.now()){
 const base=freshState(now);
 if(!raw||typeof raw!=='object'||raw.version!==1)return base;
 const safeRecords=o=>o&&typeof o==='object'&&!Array.isArray(o)?o:{};
 const arr=(v,max)=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object').slice(-max):[];
 return {...base,startedAt:Number.isFinite(raw.startedAt)&&raw.startedAt>0?raw.startedAt:now,
  exercise:safeRecords(raw.exercise),phrases:safeRecords(raw.phrases),
  attempts:arr(raw.attempts,1200),oral:arr(raw.oral,150),
  practiceCount:Number.isFinite(raw.practiceCount)?Math.max(0,raw.practiceCount):0,
  settings:safeRecords(raw.settings)};
}
export function loadState(storage=globalThis.localStorage,now=Date.now()){
 try{return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY)),now);}
 catch{return freshState(now);}
}
export function saveState(state,storage=globalThis.localStorage){
 try{storage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}
}
export function shuffled(items,seed=1){
 const arr=[...items];let s=(seed>>>0)||1;
 for(let i=arr.length-1;i>0;i--){s^=s<<13;s^=s>>>17;s^=s<<5;const j=(s>>>0)%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}
 return arr;
}
export function seededChoices(exercise){
 let seed=0;for(const ch of exercise.id)seed=(seed*31+ch.charCodeAt(0))|0;
 return shuffled(exercise.choices,seed||1);
}
export function currentDay(state,now=Date.now()){
 const a=new Date(state.startedAt);a.setHours(0,0,0,0);
 const b=new Date(now);b.setHours(0,0,0,0);
 return Math.max(1,Math.min(7,Math.round((b-a)/DAY)+1));
}
export function dueExercises(state,now=Date.now(),group='all',limit=8){
 const candidates=allExercises.filter(e=>group==='all'||e.group===group);
 const upcoming=candidates.filter(e=>!state.exercise[e.id]||Number(state.exercise[e.id].due||0)<=now);
 const chosen=(upcoming.length?upcoming:candidates).sort((a,b)=>{
  const aa=state.exercise[a.id],bb=state.exercise[b.id];
  const priority=x=>!x?-2e15:Number(x.due||0);
  return priority(aa)-priority(bb);
 });
 // Rotate equal-priority unseen entries between sessions.
 const seed=(Number(state.practiceCount)||0)*9871+Math.floor(now/DAY);
 const unseen=shuffled(chosen.filter(e=>!state.exercise[e.id]),seed);
 const seen=chosen.filter(e=>state.exercise[e.id]);
 return [...seen,...unseen].slice(0,limit);
}
export function updateSchedule(prev,success,now=Date.now()){
 const reps=success?Math.max(0,Number(prev?.reps)||0)+1:0;
 const ease=Math.max(1.3,Math.min(3.1,(Number(prev?.ease)||2.3)+(success?.05:-.18)));
 const intervals=[0,1,3,7,14,28];
 const interval=success?intervals[Math.min(reps,intervals.length-1)]:3/(24*60);
 return {seen:(Number(prev?.seen)||0)+1,correct:(Number(prev?.correct)||0)+(success?1:0),
  reps,ease,interval,due:now+interval*DAY,last:now};
}
export function recordExercise(state,id,correct,now=Date.now()){
 if(!allExercises.some(x=>x.id===id))return state;
 const copy={...state,exercise:{...state.exercise},
  attempts:[...state.attempts.slice(-1199),{id,correct:!!correct,at:now}]};
 copy.exercise[id]=updateSchedule(state.exercise[id],correct,now);
 return copy;
}
export function recordPhrase(state,id,known,now=Date.now()){
 if(!allPhrases.some(x=>x.id===id))return state;
 return {...state,phrases:{...state.phrases,[id]:updateSchedule(state.phrases[id],known,now)}};
}
export function duePhrases(state,now=Date.now()){
 return allPhrases.filter(p=>!state.phrases[p.id]||state.phrases[p.id].due<=now);
}
export function recordOral(state,entry){
 const topic=TOPICS.find(t=>t.id===entry.topic);
 if(!topic)return state;
 const safe={id:String(entry.id),topic:topic.id,question:String(entry.question).slice(0,250),
  grammar:String(entry.grammar).slice(0,60),seconds:Math.max(0,Math.min(1200,Number(entry.seconds)||0)),
  checklist:Array.isArray(entry.checklist)?entry.checklist.map(Boolean).slice(0,5):[],
  note:String(entry.note||'').slice(0,1600),at:Number(entry.at)||Date.now(),
  audio:!!entry.audio,exam:!!entry.exam};
 return {...state,oral:[...state.oral.slice(-149),safe]};
}
export function groupStats(state,id){
 const qs=allExercises.filter(q=>q.group===id);
 const known=qs.filter(q=>state.exercise[q.id]);
 const mastered=known.filter(q=>state.exercise[q.id].reps>=2);
 const attempts=state.attempts.filter(a=>qs.some(q=>q.id===a.id));
 return {total:qs.length,seen:known.length,mastered:mastered.length,
  accuracy:attempts.length?Math.round(100*attempts.filter(x=>x.correct).length/attempts.length):null};
}
export function totalStats(state,now=Date.now()){
 const seen=allExercises.filter(q=>state.exercise[q.id]).length;
 const mastered=allExercises.filter(q=>state.exercise[q.id]?.reps>=2).length;
 const due=allExercises.filter(q=>state.exercise[q.id]&&state.exercise[q.id].due<=now).length;
 const topics=new Set(state.oral.map(o=>o.topic)).size;
 const correct=state.attempts.filter(a=>a.correct).length;
 return {seen,mastered,due,topics,oral:state.oral.length,answered:state.attempts.length,
 accuracy:state.attempts.length?Math.round(100*correct/state.attempts.length):null};
}
export function oralPercent(entry){return Math.round(100*entry.checklist.filter(Boolean).length/5);}
export function uniqueTopics(state,topicIds,limit=3){
 const counts=new Map(topicIds.map(id=>[id,state.oral.filter(x=>x.topic===id).length]));
 return [...topicIds].sort((a,b)=>counts.get(a)-counts.get(b)).slice(0,limit);
}
