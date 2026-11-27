// Optional research engine. Browser-only computation, no audio upload.
// Pinned public package/model versions; release requires vendoring and integrity review.
import {splitVoices} from './advanced.mjs';
export const MODEL_URL='https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json';
export async function neuralAnalyze(samples,progress=()=>{},engine){
 if(!(samples instanceof Float32Array)||samples.length===0||samples.length>22050*180)throw Error('Basic Pitch requires mono 22050 Hz audio, up to 180 seconds.');
 const api=engine??await import('https://esm.sh/@spotify/basic-pitch@1.0.1?bundle');
 if(!api.BasicPitch||!api.outputToNotesPoly||!api.noteFramesToTime)throw Error('Basic Pitch API unavailable');
 const model=new api.BasicPitch(MODEL_URL);
 const frames=[],onsets=[];
 try{
  await model.evaluateModel(samples,(f,o)=>{for(const x of f)frames.push(x);for(const x of o)onsets.push(x)},p=>progress(Math.min(.99,Math.max(0,p))));
  if(!frames.length||frames.length!==onsets.length)throw Error('Invalid model output');
  const duration=samples.length/22050,notes=api.noteFramesToTime(api.outputToNotesPoly(frames,onsets,.25,.25,5)).map(n=>({pitch:n.pitchMidi,start:Math.max(0,n.startTimeSeconds),end:Math.min(duration,n.startTimeSeconds+n.durationSeconds),confidence:Math.max(0,Math.min(1,n.amplitude))})).filter(n=>Number.isInteger(n.pitch)&&n.pitch>=21&&n.pitch<=108&&Number.isFinite(n.start)&&Number.isFinite(n.end)&&Number.isFinite(n.confidence)&&n.end>n.start);
  if(notes.length>12000)throw Error('Too many notes');
  progress(1);return splitVoices(notes,'Basic Pitch','polyphonic');
 }finally{try{(await model.model)?.dispose?.()}catch{}}
}
