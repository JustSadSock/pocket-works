// NE ZHMI! Session conductor. Pure data operations shared by local and PocketNet.
// The simulation engine remains unchanged: only which route plays next changes.
export const MODES=Object.freeze([
 {id:'quick',title:'ОДИН ЗАЕЗД',detail:'Одна случайная трасса · быстрый кооператив'},
 {id:'party',title:'СЕРИЯ ИЗ ТРЁХ',detail:'Три разные трассы · общий результат команды'},
 {id:'lab',title:'МАСТЕРСКАЯ',detail:'Выбирайте код и длину трассы · экспериментируйте'}
]);
export const PARTY_STAGES=3;
export const validMode=value=>MODES.some(m=>m.id===value);
export const courseLength=value=>[4,5,6].includes(Number(value))?Number(value):5;
export const courseSeed=value=>{
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=1&&n<=4294967295?n:1;
};
function mix(seed,round){
 let n=(courseSeed(seed)^Math.imul(round+1,0x9e3779b9))>>>0;
 n=Math.imul(n^(n>>>16),0x85ebca6b)>>>0;
 n=Math.imul(n^(n>>>13),0xc2b2ae35)>>>0;
 return ((n^(n>>>16))>>>0)||1;
}
export function createSession({mode='quick',seed=1,length=5}={}){
 return {mode:validMode(mode)?mode:'quick',seed:courseSeed(seed),length:courseLength(length),
   entries:[],trackSeed:0,finished:false};
}
export function nextTrack(session,{crew=2,round=0}={}){
 const s=session||createSession(),n=s.entries.length;
 const seed=s.mode==='lab'?s.seed:mix(s.seed,s.mode==='party'?n:round);
 const sectionCount=s.mode==='lab'?s.length:5;
 return {seed,sections:sectionCount,crew:Math.max(2,Math.min(6,Math.floor(crew)||2)),stage:s.mode==='party'?Math.min(PARTY_STAGES,n+1):1};
}
export function startTrack(session,opts={}){
 const track=nextTrack(session,opts);
 session.trackSeed=track.seed;
 session.finished=false;
 return track;
}
export function recordFinish(session,game){
 if(!session||session.finished||!game?.finished)return null;
 const result={stage:session.mode==='party'?session.entries.length+1:1,
   seed:session.trackSeed||session.seed,
   time:Math.max(0,Math.round((game.wonAt||game.t||0)*100)/100),
   falls:Math.max(0,game.respawns||0),jumps:Math.max(0,game.jumps||0),
   reverses:Math.max(0,game.reverses||0),pushes:Math.max(0,game.pushes||0)};
 if(session.mode==='party')session.entries.push(result);
 else session.entries=[result];
 session.finished=true;
 return result;
}
export function partyComplete(session){
 return session?.mode==='party'&&session.entries.length>=PARTY_STAGES;
}
export function canContinue(session){
 return session?.mode==='party'&&session.entries.length>0&&!partyComplete(session);
}
export function summary(session){
 const records=session?.entries||[];
 return {mode:session?.mode||'quick',count:records.length,target:session?.mode==='party'?PARTY_STAGES:1,
   complete:partyComplete(session),
   totalTime:Math.round(records.reduce((n,x)=>n+x.time,0)*100)/100,
   totalFalls:records.reduce((n,x)=>n+x.falls,0),
   totalJumps:records.reduce((n,x)=>n+x.jumps,0),
   records:records.map(x=>({...x}))};
}
export function replayLast(session){
 if(!session)return;
 if(session.finished&&session.mode==='party')session.entries.pop();
 session.finished=false;
 return session.trackSeed||session.seed;
}
export function restoreParty(value){
 if(!value||value.mode!=='party'||!Array.isArray(value.entries)||value.entries.length>=PARTY_STAGES)return null;
 if(value.entries.some(x=>!Number.isFinite(x.time)||x.time<0||x.time>100000||!Number.isInteger(x.stage)))return null;
 const restored=createSession({mode:'party',seed:value.seed});
 restored.entries=value.entries.map(({stage,seed,time,falls,jumps,reverses,pushes})=>({stage,seed,time,falls,jumps,reverses,pushes}));
 restored.trackSeed=courseSeed(value.trackSeed);
 restored.finished=false;
 return restored;
}
