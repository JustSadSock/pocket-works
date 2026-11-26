// Offline ensemble mixer for independently rendered monophonic performances.
// Multiple tracks may play the same instrument with different parts.
import {renderRecordedPerformance} from './recorded-performance.mjs';
const SR=48000;
export function renderRecordedEnsemble({zones,tracks,seconds,mode='morph'}={}){
 if(!Array.isArray(zones)||!zones.length||zones.length>256||!Array.isArray(tracks)||!tracks.length||tracks.length>16||!Number.isFinite(seconds)||seconds<.15||seconds>90||!['morph','discrete'].includes(mode))throw Error('Invalid recorded ensemble');
 const frames=Math.round(seconds*SR),stems={},choices={},ids=new Set(),mix=new Float32Array(frames*2);
 for(const t of tracks){
  if(typeof t.id!=='string'||!/^[a-z0-9-]{1,48}$/.test(t.id)||ids.has(t.id)||!['strings','woodwind','brass','plucked','percussion'].includes(t.group)||!Number.isFinite(t.pan)||Math.abs(t.pan)>1||!Number.isFinite(t.gain)||t.gain<=0||t.gain>1)throw Error('Invalid ensemble track');
  ids.add(t.id);
  const r=renderRecordedPerformance({zones,instrument:t.instrument,notes:t.notes,seconds,mode});
  if(r.samples.length!==frames)throw Error('Ensemble frame mismatch');
  const a=stems[t.group]??(stems[t.group]=new Float32Array(frames*2));
  const l=Math.sqrt((1-t.pan)/2)*t.gain,rr=Math.sqrt((1+t.pan)/2)*t.gain;
  for(let i=0;i<frames;i++){a[i*2]+=r.samples[i]*l;a[i*2+1]+=r.samples[i]*rr;}
  choices[t.id]=r.choices;
 }
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
 return {mix,stems,choices,master,frames,sampleRate:SR,channels:2};
}
