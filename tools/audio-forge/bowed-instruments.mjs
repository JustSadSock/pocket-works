// Original bowed-string spectral/modal approximation, not a validated friction
// waveguide. Continuous phase, bow envelope, bow-position harmonic cancellation,
// moving formants, delayed vibrato, and filtered bow noise.
import {rng} from './foundation.mjs';
const SR=48000,TAU=2*Math.PI;
const profiles={
 violin:{min:55,max:88,attack:.065,release:.085,vibrato:23,position:.16,body:[[280,90,.20],[510,140,.28],[1100,300,.17],[2600,750,.45]],brightness:.83},
 cello:{min:36,max:76,attack:.095,release:.12,vibrato:20,position:.20,body:[[105,40,.32],[205,65,.27],[380,100,.23],[780,250,.18],[1900,650,.28]],brightness:.68}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bounded(v,a,b,label){if(!Number.isFinite(v)||v<a||v>b)throw Error('Invalid '+label);return v}
export function renderBowedPhrase({instrument='cello',notes,seconds,seed=1,glideSeconds=.055}={}){
 const p=profiles[instrument];
 if(!p||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid bowed phrase');
 bounded(seconds,.1,90,'phrase length');bounded(glideSeconds,.008,.15,'glide');
 const frames=Math.round(seconds*SR),events=[],random=rng(seed);
 let previousEnd=0;
 for(const [index,n] of notes.entries()){
  if(!Number.isInteger(n.midi)||n.midi<p.min||n.midi>p.max)throw Error('Invalid bowed pitch');
  const start=Math.round(bounded(n.start,0,seconds,'note start')*SR);
  const end=Math.round((n.start+bounded(n.duration,.05,12,'note duration'))*SR);
  const articulation=n.articulation??'detached';
  if(!['detached','legato','bow-change'].includes(articulation)||start<previousEnd||end>frames||end<=start||articulation!=='detached'&&(!index||start!==previousEnd))throw Error('Invalid bow articulation grid');
  events.push({start,end,midi:n.midi,pressure:bounded(n.pressure??.65,.1,1,'bow pressure'),position:bounded(n.position??p.position,.07,.36,'bow position'),articulation});
  previousEnd=end;
 }
 const out=new Float32Array(frames),boundaries=[];
 // Independent stable resonant modes of the body, driven by the string signal.
 const modes=p.body.map(([hz,bw,gain])=>{const r=Math.exp(-Math.PI*bw/SR);return {a:2*r*Math.cos(TAU*hz/SR),b:-r*r,k:gain*(1-r),y1:0,y2:0}});
 let phase=0,index=0,pitch=events[0].midi,pressure=0,position=events[0].position;
 let onsetPitch=pitch,onsetPressure=0,onsetPosition=position,bowAge=0,noiseLo=0,noiseHi=0,peak=0;
 const vibratoOffset=random()*TAU;
 let harmonics=new Float64Array(32),sum=1;
 for(let i=0;i<frames;i++){
  while(index+1<events.length&&i>=events[index+1].start)index++;
  const n=events[index],age=(i-n.start)/SR,remaining=(n.end-i)/SR,duration=(n.end-n.start)/SR,active=i>=n.start&&i<n.end;
  if(i===n.start){
   boundaries.push({frame:i,articulation:n.articulation,pressureBefore:pressure,pitchBefore:pitch,phase});
   onsetPitch=n.articulation==='detached'?n.midi:pitch;onsetPressure=pressure;onsetPosition=position;
   if(n.articulation==='detached')bowAge=0;
  }
  let target=0;
  if(active){
   const next=events[index+1],connected=n.articulation!=='detached',nextConnected=next&&next.articulation!=='detached';
   const u=clamp(age/glideSeconds,0,1),smooth=u*u*(3-2*u);
   pitch=onsetPitch+(n.midi-onsetPitch)*(connected?smooth:1);
   position=onsetPosition+(n.position-onsetPosition)*(connected?smooth:1);
   const attack=connected?1:Math.min(1,age/p.attack),release=nextConnected?1:Math.min(1,remaining/p.release);
   const shape=.87+.13*Math.sin(Math.PI*clamp(age/duration,0,1));
   target=n.pressure*attack*release*shape;
   if(connected&&u<1)target=onsetPressure+(target-onsetPressure)*smooth;
   if(n.articulation==='bow-change')target*=1-.30*Math.exp(-(((age-.018)/.012)**2));
   bowAge+=1/SR;
  }else bowAge=0;
  pressure+=(target-pressure)*.006;
  const vib=p.vibrato*clamp((bowAge-.18)/.35,0,1)*(0.8+.2*pressure)*Math.sin(TAU*5.15*bowAge+vibratoOffset);
  const hz=440*2**((pitch-69+vib/100)/12);
  phase=(phase+TAU*hz/SR)%TAU;
  // Refresh slow-changing spectrum at 1 kHz. Remove near-aliased partials.
  if(i%48===0){
   sum=0;
   for(let h=1;h<=harmonics.length;h++){
    const comb=Math.abs(Math.sin(Math.PI*h*position)/Math.sin(Math.PI*position));
    const bright=.55+p.brightness*pressure*.65;
    const amp=h*hz>=SR*.43?0:comb/(h**(1.35/bright));
    harmonics[h-1]=amp;sum+=amp;
   }
   sum=Math.max(1,sum);
  }
  let string=0;
  // Recurrence avoids a separate trigonometric call for every harmonic.
  const co=Math.cos(phase),si=Math.sin(phase);let cs=co,ss=si;
  for(let h=0;h<harmonics.length;h++){
   string+=harmonics[h]*ss;
   const next=cs*co-ss*si;ss=ss*co+cs*si;cs=next;
  }
  string=string/sum*pressure;
  let body=0;
  for(const m of modes){const y=m.k*string+m.a*m.y1+m.b*m.y2;m.y2=m.y1;m.y1=y;body+=y;}
  const white=random()*2-1;noiseLo+=.025*(white-noiseLo);noiseHi+=.37*(white-noiseHi);
  const attackNoise=active&&n.articulation!=='legato'?Math.exp(-Math.max(0,age)/.042):0;
  const friction=(noiseHi-noiseLo)*pressure*(.022+.046*pressure+.07*attackNoise);
  const fade=Math.min(1,i/96,(frames-1-i)/720);
  const v=(string*.55+body*.12+friction)*fade;
  out[i]=v;peak=Math.max(peak,Math.abs(v));
 }
 if(!Number.isFinite(peak)||peak<1e-7)throw Error('Silent bowed phrase');
 // Bounded headroom, without normalizing quiet and strong performances alike.
 if(peak>.85){const gain=.85/peak;for(let i=0;i<frames;i++)out[i]*=gain;peak=.85;}
 out[0]=out[frames-1]=0;
 return {samples:out,sampleRate:SR,channels:1,boundaries,peak};
}
