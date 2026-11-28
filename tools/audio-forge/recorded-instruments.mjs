// Offline multisample candidate. Finite recorded notes, no invented loop points,
// no fake sampled legato. Pitch is measured rather than trusting filenames.
import {renderSustainedNote} from './recorded-sustain.mjs';
const SR=48000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function prepareRecordedNote(pcm,expectedMidi){
 if(!(pcm instanceof Float32Array)||pcm.length<SR*.7||pcm.length>SR*15||!Number.isInteger(expectedMidi)||expectedMidi<36||expectedMidi>96)throw Error('Invalid recorded note');
 let peak=0;for(const x of pcm){if(!Number.isFinite(x)||Math.abs(x)>1.1)throw Error('Invalid sample PCM');peak=Math.max(peak,Math.abs(x));}
 if(peak<.002)throw Error('Silent recorded note');
 const window=480;let start=-1;
 for(let i=0;i+window<pcm.length;i+=window){
  let e=0;for(let j=i;j<i+window;j++)e+=pcm[j]**2;
  if(Math.sqrt(e/window)>peak*.045){start=Math.max(0,i-240);break;}
 }
 if(start<0||start+SR*.55>=pcm.length)throw Error('No usable recorded attack');
 // Use YIN-like cumulative mean normalized difference on downsampled stable windows.
 // The first qualified local minimum avoids simply selecting a multiple of the period.
 const estimates=[];
 for(const seconds of [.18,.32,.48]){
  const at=start+Math.round(seconds*SR),n=960,ds=4,maxLag=200;
  if(at+(n+maxLag)*ds>=pcm.length)continue;
  const data=new Float64Array(n+maxLag);
  for(let i=0;i<data.length;i++){const k=at+i*ds;data[i]=(pcm[k]+pcm[k+1]+pcm[k+2]+pcm[k+3])*.25;}
  const d=new Float64Array(maxLag+1);d[0]=1;let total=0;
  for(let lag=1;lag<=maxLag;lag++){let diff=0;for(let i=0;i<n;i++)diff+=(data[i]-data[i+lag])**2;total+=diff;d[lag]=total>1e-12?diff*lag/total:1;}
  let best=0;
  for(let lag=5;lag<maxLag;lag++){if(d[lag]<.20&&d[lag]<=d[lag-1]&&d[lag]<d[lag+1]){best=lag;break;}}
  if(!best)continue;
  const [a,b,c]=[d[best-1],d[best],d[best+1]],den=a-2*b+c;
  const offset=den>1e-12?clamp(.5*(a-c)/den,-.5,.5):0;
  const midi=69+12*Math.log2((SR/ds)/(best+offset)/440);
  if(Number.isFinite(midi))estimates.push(midi);
 }
 if(!estimates.length)throw Error('Unable to measure stable recorded pitch');
 estimates.sort((a,b)=>a-b);
 const measuredMidi=estimates[Math.floor(estimates.length/2)];
 if(Math.abs(measuredMidi-expectedMidi)>.75)throw Error('Recorded pitch disagrees with reviewed zone: expected '+expectedMidi+', measured '+measuredMidi.toFixed(3));
 const samples=pcm.slice(start),end=Math.min(samples.length,Math.round(SR*1.2));let energy=0;
 for(let i=Math.round(SR*.12);i<end;i++)energy+=samples[i]**2;
 const rms=Math.sqrt(energy/(end-Math.round(SR*.12)));
 if(!Number.isFinite(rms)||rms<.001)throw Error('Silent sustain');
 return {samples,expectedMidi,measuredMidi,offsetFrames:start,rms,peak};
}
export function renderRecordedPhrase({zones,notes,seconds,maxShift=5}={}){
 if(!Array.isArray(zones)||!zones.length||zones.length>64||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isFinite(seconds)||seconds<.1||seconds>90||!Number.isInteger(maxShift)||maxShift<0||maxShift>12)throw Error('Invalid sampled phrase');
 for(const z of zones)if(!(z.samples instanceof Float32Array)||!Number.isInteger(z.expectedMidi)||!Number.isFinite(z.measuredMidi)||!Number.isFinite(z.rms)||z.rms<=0||Math.abs(z.measuredMidi-z.expectedMidi)>.75)throw Error('Invalid sampled zone');
 const out=new Float32Array(Math.round(seconds*SR)),choices=[];let lastEnd=0;
 for(const n of notes){
  if(!Number.isInteger(n.midi)||!Number.isFinite(n.start)||!Number.isFinite(n.duration)||n.start<0||n.duration<.08||n.duration>8||!Number.isFinite(n.pressure)||n.pressure<.1||n.pressure>1)throw Error('Invalid sampled note');
  const start=Math.round(n.start*SR),end=Math.round((n.start+n.duration)*SR);
  if(start<lastEnd||end>out.length||end<=start)throw Error('Unaligned sampled notes');
  lastEnd=end;
  const z=[...zones].sort((a,b)=>Math.abs(a.expectedMidi-n.midi)-Math.abs(b.expectedMidi-n.midi)||b.expectedMidi-a.expectedMidi)[0];
  if(Math.abs(z.expectedMidi-n.midi)>maxShift)throw Error('Sample pitch coverage exceeded');
  const rate=2**((n.midi-z.measuredMidi)/12),frames=end-start;
  if(n.sustain===true){
   const r=renderSustainedNote({zone:z,midi:n.midi,seconds:frames/SR,pressure:n.pressure,curve:n.curve,loop:z.loop});
   if(r.frames!==frames)throw Error('Sustain grid mismatch');
   out.set(r.samples,start);
   choices.push({midi:n.midi,source:z.id??null,measuredMidi:z.measuredMidi,rate,startFrame:start,frames,wraps:r.wraps,maxWrapStep:r.maxWrapStep});
   continue;
  }
  if(n.curve!==undefined)throw Error('Pressure curve requires explicit sustain mode');
  if((frames-1)*rate+1>=z.samples.length)throw Error('Recorded sample too short for note');
  const gain=Math.min(.6/Math.max(z.peak,.001),.18/z.rms)*n.pressure;
  const attack=Math.min(240,frames/4),release=Math.min(3840,frames/3);
  for(let i=0;i<frames;i++){
   const p=i*rate,k=Math.floor(p),f=p-k,x=z.samples[k]*(1-f)+z.samples[k+1]*f;
   out[start+i]=x*gain*Math.min(1,i/attack,(frames-1-i)/release);
  }
  choices.push({midi:n.midi,source:z.id??null,measuredMidi:z.measuredMidi,rate,startFrame:start,frames});
 }
 out[0]=out[out.length-1]=0;
 return {samples:out,sampleRate:SR,channels:1,choices};
}
