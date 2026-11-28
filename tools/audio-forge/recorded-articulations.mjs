// Research-only recorded articulation/velocity selection. Explicit coverage:
// no invented articulations, dynamic layers, or round-robin variants.
import {renderRecordedPhrase} from './recorded-instruments.mjs';
const validId=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
const validPressure=x=>Number.isFinite(x)&&x>=.1&&x<=1;
export function createRecordedInstrumentBank(zones){
 if(!Array.isArray(zones)||!zones.length||zones.length>256)throw Error('Invalid instrument bank');
 const instruments=new Map(),ids=new Set(),hashes=new Set(),groups=new Map(),cursors=new Map();
 for(const z of zones){
  if(!z||!validId(z.id)||!validId(z.instrument)||!validId(z.articulation)||!validPressure(z.velocity)||!Number.isInteger(z.expectedMidi)||z.expectedMidi<36||z.expectedMidi>96||!Number.isFinite(z.measuredMidi)||Math.abs(z.measuredMidi-z.expectedMidi)>.75||!(z.samples instanceof Float32Array)||!Number.isFinite(z.rms)||z.rms<=0||!Number.isFinite(z.peak)||z.peak<=0||!Number.isInteger(z.variant)||z.variant<1||z.variant>32||!/^[0-9a-f]{64}$/.test(z.sourceSha256??'')||ids.has(z.id)||hashes.has(z.sourceSha256))throw Error('Invalid or duplicate recorded zone');
  ids.add(z.id);hashes.add(z.sourceSha256);
  const key=[z.instrument,z.articulation,z.expectedMidi,z.velocity].join(':');
  if(!groups.has(key))groups.set(key,[]);
  const g=groups.get(key);if(g.some(x=>x.variant===z.variant))throw Error('Duplicate variant');
  g.push(z);
  const ik=z.instrument+':'+z.articulation;
  if(!instruments.has(ik))instruments.set(ik,new Map());
  const roots=instruments.get(ik);if(!roots.has(z.expectedMidi))roots.set(z.expectedMidi,new Set());
  roots.get(z.expectedMidi).add(z.velocity);
 }
 for(const g of groups.values())g.sort((a,b)=>a.variant-b.variant);
 function select({instrument,articulation,midi,pressure,maxShift=5,roundRobin=true,lockedVelocity}){
  if(!Number.isInteger(midi)||!validPressure(pressure)||!Number.isInteger(maxShift)||maxShift<0||maxShift>12||lockedVelocity!==undefined&&!validPressure(lockedVelocity))throw Error('Invalid bank request');
  const roots=instruments.get(instrument+':'+articulation);
  if(!roots)throw Error('Unrecorded articulation');
  const root=[...roots.keys()].sort((a,b)=>Math.abs(a-midi)-Math.abs(b-midi)||a-b)[0];
  if(Math.abs(root-midi)>maxShift)throw Error('Articulation pitch coverage exceeded');
  const available=[...roots.get(root)].sort((a,b)=>a-b);
  const v=lockedVelocity===undefined?available.reduce((a,b)=>Math.abs(b-pressure)<Math.abs(a-pressure)?b:a):lockedVelocity;
  if(!available.includes(v))throw Error('Unrecorded dynamic layer');
  const key=[instrument,articulation,root,v].join(':'),group=groups.get(key),cursor=cursors.get(key)??0;
  const zone=group[roundRobin?cursor%group.length:0];
  if(roundRobin)cursors.set(key,(cursor+1)%group.length);
  return {zone,root,velocity:v,variant:zone.variant,variants:group.length,availableVelocities:available};
 }
 return {select,reset(){cursors.clear()},coverage(){return [...groups.values()].map(g=>({instrument:g[0].instrument,articulation:g[0].articulation,midi:g[0].expectedMidi,velocity:g[0].velocity,variants:g.map(z=>({id:z.id,variant:z.variant,sha256:z.sourceSha256}))}))}};
}
export function renderArticulatedPhrase({bank,instrument,notes,seconds,maxShift=5,roundRobin=true,lockedVelocity}={}){
 if(!bank||typeof bank.select!=='function'||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isFinite(seconds)||seconds<.1||seconds>90)throw Error('Invalid articulation phrase');
 const out=new Float32Array(Math.round(seconds*48000)),choices=[];let lastEnd=0;
 for(const n of notes){
  if(!Number.isFinite(n.start)||!Number.isFinite(n.duration)||n.start<0||n.duration<.1||n.duration>8)throw Error('Invalid articulated note');
  const start=Math.round(n.start*48000),end=Math.round((n.start+n.duration)*48000);
  if(start<lastEnd||end>out.length||end-start<4800)throw Error('Unaligned articulation grid');
  const chosen=bank.select({instrument,articulation:n.articulation,midi:n.midi,pressure:n.pressure,maxShift,roundRobin,lockedVelocity});
  // Discrete recorded dynamic layers; pressure scales amplitude but does not
  // claim to morph the physical timbre continuously between recorded layers.
  const r=renderRecordedPhrase({zones:[chosen.zone],notes:[{...n,start:0,duration:(end-start)/48000}],seconds:(end-start)/48000,maxShift});
  if(r.samples.length!==end-start)throw Error('Articulation grid mismatch');
  out.set(r.samples,start);lastEnd=end;
  choices.push({...r.choices[0],startFrame:start,articulation:n.articulation,velocity:chosen.velocity,variant:chosen.variant,variants:chosen.variants,sourceSha256:chosen.zone.sourceSha256});
 }
 return {samples:out,choices,sampleRate:48000,channels:1};
}
