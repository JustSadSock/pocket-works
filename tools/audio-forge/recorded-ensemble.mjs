// Offline ensemble mixer for independently rendered monophonic performances.
// Multiple tracks may play the same instrument with different parts.
import {renderRecordedPerformance} from './recorded-performance.mjs';
import {validateRecordedGestures} from './recorded-phrasing.mjs';
const SR=48000;
export function renderRecordedEnsemble({zones,tracks,seconds,mode='morph',includeTrackStems=false,gestures=[],releaseBank=[]}={}){
 if(typeof includeTrackStems!=='boolean'||!Array.isArray(zones)||!zones.length||zones.length>256||!Array.isArray(tracks)||!tracks.length||tracks.length>16||!Number.isFinite(seconds)||seconds<.15||seconds>90||!['morph','discrete'].includes(mode))throw Error('Invalid recorded ensemble');
 const sharedGestures=validateRecordedGestures(gestures,seconds),gestureMap=new Map(sharedGestures.map(g=>[g.id,g])),participants=new Map();
 const frames=Math.round(seconds*SR),stems={},trackStems=Object.create(null),choices={},ids=new Set(),mix=new Float32Array(frames*2);
 for(const t of tracks){
  if(typeof t.id!=='string'||!/^[a-z0-9-]{1,48}$/.test(t.id)||ids.has(t.id)||!['strings','woodwind','brass','plucked','percussion'].includes(t.group)||!Number.isFinite(t.pan)||Math.abs(t.pan)>1||!Number.isFinite(t.gain)||t.gain<=0||t.gain>1)throw Error('Invalid ensemble track');
  ids.add(t.id);
  if(!Array.isArray(t.notes)||t.notes.length===0)throw Error('Invalid ensemble track notes');
  const phraseIds=[...new Set(t.notes.map(n=>n.phraseId).filter(Boolean))];
  let phrases=[];
  if(phraseIds.length){
   if(!['bowed','breath'].includes(t.phrasingTechnique)||t.group==='strings'&&t.phrasingTechnique!=='bowed'||['woodwind','brass'].includes(t.group)&&t.phrasingTechnique!=='breath'||!['strings','woodwind','brass'].includes(t.group))throw Error('Invalid ensemble phrasing technique');
   phrases=phraseIds.map(id=>{
    const g=gestureMap.get(id);if(!g)throw Error('Unknown ensemble gesture '+id);
    if(!participants.has(id))participants.set(id,[]);
    participants.get(id).push({trackId:t.id,technique:t.phrasingTechnique,noteCount:t.notes.filter(n=>n.phraseId===id).length});
    return {...g,technique:t.phrasingTechnique};
   });
  }
  const r=renderRecordedPerformance({zones,instrument:t.instrument,notes:t.notes,seconds,mode,phrases,releaseBank});
  if(r.samples.length!==frames)throw Error('Ensemble frame mismatch');
  const a=stems[t.group]??(stems[t.group]=new Float32Array(frames*2));
  const l=Math.sqrt((1-t.pan)/2)*t.gain,rr=Math.sqrt((1+t.pan)/2)*t.gain;
  const individual=includeTrackStems?(trackStems[t.id]=new Float32Array(frames*2)):null;
  for(let i=0;i<frames;i++){
   const left=r.samples[i]*l,right=r.samples[i]*rr;
   a[i*2]+=left;a[i*2+1]+=right;
   if(individual){individual[i*2]=left;individual[i*2+1]=right;}
  }
  choices[t.id]=r.choices;
 }
 const gestureReceipts=sharedGestures.map(g=>{
  const members=participants.get(g.id)??[];
  if(members.length<2)throw Error('Shared ensemble gesture requires at least two musicians');
  return {id:g.id,startFrame:Math.round(g.start*SR),endFrame:Math.round(g.end*SR),curve:g.curve,participants:members};
 });
 let peak=0;
 const arrays=Object.values(stems);
 for(const a of arrays)for(let i=0;i<a.length;i++)mix[i]+=a[i];
 for(let i=0;i<mix.length;i++){
  if(!Number.isFinite(mix[i]))throw Error('Invalid ensemble PCM');
  peak=Math.max(peak,Math.abs(mix[i]));for(const a of arrays)peak=Math.max(peak,Math.abs(a[i]));
 }
 if(peak<1e-7)throw Error('Silent ensemble');
 const master=Math.min(1,.75/peak);
 for(let i=0;i<frames;i++){
  const g=master*Math.min(1,i/240,(frames-1-i)/2400);
  for(let c=0;c<2;c++){const k=i*2+c;mix[k]*=g;for(const a of arrays)a[k]*=g;}
 }
 // Individual stems use exactly the same master and fade as the approved mix.
 // Their peaks never change the established group/mix mastering decision.
 for(const a of Object.values(trackStems))for(let i=0;i<frames;i++){
  const g=master*Math.min(1,i/240,(frames-1-i)/2400);
  a[i*2]*=g;a[i*2+1]*=g;
 }
 return {mix,stems,choices,master,frames,sampleRate:SR,channels:2,gestureReceipts,...(includeTrackStems?{trackStems}:{})};
}
