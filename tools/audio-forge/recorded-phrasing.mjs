// Shared, deterministic bow/breath phrase envelopes for recorded performances.
// These are score-domain pressure gestures, not physical airflow or bow simulation.
const SR=48000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const validId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,47}$/.test(s);
function curve(points,label){
 if(!Array.isArray(points)||points.length<2||points.length>64||points[0]?.at!==0||points.at(-1)?.at!==1||
  points.some((p,i)=>!p||!Number.isFinite(p.at)||!Number.isFinite(p.value)||p.value<.55||p.value>1.25||i>0&&p.at<=points[i-1].at))
  throw Error('Invalid '+label+' curve');
 return points.map(p=>({at:p.at,value:p.value}));
}
function interpolate(points,u){
 let i=0;while(i+1<points.length-1&&u>points[i+1].at)i++;
 const a=points[i],b=points[i+1],t=clamp((u-a.at)/(b.at-a.at),0,1);
 return a.value+(b.value-a.value)*t;
}
export function validateRecordedGestures(gestures,seconds){
 if(gestures===undefined)return [];
 if(!Array.isArray(gestures)||gestures.length>64||!Number.isFinite(seconds)||seconds<.15||seconds>90)throw Error('Invalid shared gesture timeline');
 const ids=new Set(),out=gestures.map(g=>{
  if(!g||!validId(g.id)||ids.has(g.id))throw Error('Invalid or duplicate shared gesture');
  ids.add(g.id);
  if(!Number.isFinite(g.start)||!Number.isFinite(g.end)||g.start<0||g.end<=g.start||g.end>seconds)throw Error('Invalid shared gesture range');
  const normalized={id:g.id,start:g.start,end:g.end,curve:curve(g.curve,'shared gesture')};
  if(g.technique!==undefined)normalized.technique=g.technique;
  return normalized;
 }).sort((a,b)=>a.start-b.start);
 for(let i=1;i<out.length;i++)if(Math.round(out[i].start*SR)<Math.round(out[i-1].end*SR))throw Error('Overlapping shared gestures');
 return out;
}
export function compileRecordedPhrasing(phrases,notes,seconds){
 if(!Array.isArray(notes)||!notes.length)throw Error('Invalid phrase note grid');
 const definitions=validateRecordedGestures(phrases,seconds).map(p=>{
  if(!['bowed','breath'].includes(p.technique))throw Error('Invalid phrase technique');
  return p;
 });
 const byId=new Map(definitions.map(p=>[p.id,p]));
 const refs=new Map();
 for(const [i,n] of notes.entries()){
  if(n.phraseId===undefined)continue;
  if(!validId(n.phraseId)||!byId.has(n.phraseId))throw Error('Unknown recorded phrase reference');
  if(!refs.has(n.phraseId))refs.set(n.phraseId,[]);
  refs.get(n.phraseId).push(i);
 }
 if(notes.some(n=>n.reattack!==undefined&&n.phraseId===undefined))throw Error('Reattack requires a recorded phrase');
 for(const p of definitions){
  const indices=refs.get(p.id)??[];
  if(indices.length<2)throw Error('Recorded phrase requires at least two notes');
  const first=notes[indices[0]],last=notes[indices.at(-1)];
  if(Math.round(first.start*SR)!==Math.round(p.start*SR)||
   Math.round((last.start+last.duration)*SR)!==Math.round(p.end*SR))throw Error('Phrase range must match its first and last note');
  for(let j=1;j<indices.length;j++)if(indices[j]!==indices[j-1]+1)throw Error('Phrase notes must form one continuous score lane');
  for(const i of indices){
   const n=notes[i];
   if(Math.round(n.start*SR)<Math.round(p.start*SR)||Math.round((n.start+n.duration)*SR)>Math.round(p.end*SR))throw Error('Phrase does not contain its note');
  }
 }
 for(const id of refs.keys())if(!byId.has(id))throw Error('Unknown recorded phrase reference');
 return new Map(definitions.map(p=>[p.id,{
  id:p.id,technique:p.technique,start:p.start,end:p.end,
  startFrame:Math.round(p.start*SR),endFrame:Math.round(p.end*SR),curve:p.curve,
  valueAt(timeSeconds){
   if(!Number.isFinite(timeSeconds))throw Error('Invalid phrase time');
   return interpolate(p.curve,clamp((timeSeconds-p.start)/(p.end-p.start),0,1));
  }
 }]));
}
export function compileRecordedReattack(note,previous,phrase){
 if(note.reattack===undefined)return null;
 const r=note.reattack;
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['kind','strength','durationSeconds'].includes(k)))throw Error('Invalid recorded reattack');
 if(!phrase||note.connected!==true||!previous||note.midi!==previous.midi||note.phraseId!==previous.phraseId||
  !['bow-change','breath'].includes(r.kind)||r.kind==='bow-change'&&phrase.technique!=='bowed'||r.kind==='breath'&&phrase.technique!=='breath')
  throw Error('Recorded reattack is not valid for this phrase transition');
 const strength=r.strength??(r.kind==='bow-change'?.28:.5),durationSeconds=r.durationSeconds??.075;
 if(!Number.isFinite(strength)||strength<.05||strength>.75||!Number.isFinite(durationSeconds)||durationSeconds<.02||durationSeconds>.18)
  throw Error('Invalid recorded reattack envelope');
 const metadata={kind:r.kind,strength,durationSeconds,sourceOffsetFrames:0};
 function gainAt(elapsedSeconds){
  if(!Number.isFinite(elapsedSeconds)||elapsedSeconds<0)throw Error('Invalid reattack time');
  const u=clamp(elapsedSeconds/durationSeconds,0,1),smooth=u*u*(3-2*u);
  return r.kind==='bow-change'?1-strength*Math.sin(Math.PI*u)**2:1-strength*(1-smooth);
 }
 return {metadata,gainAt};
}
