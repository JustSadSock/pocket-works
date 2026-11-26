// Research-only lip-reed spectral approximation, not a nonlinear bore model.
// Pressure controls harmonic balance and dynamics; phase remains continuous.
import {rng} from './foundation.mjs';
const SR=48000,TAU=2*Math.PI;
const profiles={
 horn:{min:40,max:77,attack:.095,release:.12,brightness:.72,formants:[[450,350,.8],[1050,650,.42],[2300,1100,.14]],vibrato:8},
 trumpet:{min:52,max:84,attack:.048,release:.075,brightness:1.15,formants:[[850,550,.65],[1900,900,.95],[3300,1300,.42]],vibrato:12}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function bound(x,a,b,name){if(!Number.isFinite(x)||x<a||x>b)throw Error('Invalid '+name);return x}
export function renderBrassPhrase({instrument='horn',notes,seconds,seed=1}={}){
 const p=profiles[instrument];
 if(!p||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid brass phrase');
 bound(seconds,.1,90,'duration');
 const frames=Math.round(seconds*SR),events=[];let end=0;
 for(const n of notes){
  const start=Math.round(bound(n.start,0,seconds,'start')*SR),stop=Math.round((n.start+bound(n.duration,.05,12,'note duration'))*SR);
  const articulation=n.articulation??'tongued';
  if(!Number.isInteger(n.midi)||n.midi<p.min||n.midi>p.max||!['tongued','slur','accent'].includes(articulation)||start<end||stop>frames||stop<=start||articulation==='slur'&&(!events.length||start!==end))throw Error('Invalid brass note');
  events.push({start,end:stop,midi:n.midi,pressure:bound(n.pressure??.65,.1,1,'pressure'),articulation});end=stop;
 }
 const out=new Float32Array(frames),random=rng(seed),boundaries=[],partials=new Float64Array(32);
 let index=0,phase=0,pitch=events[0].midi,pressure=0,fromPitch=pitch,fromPressure=0,agePhrase=0,lo=0,hi=0,peak=0,norm=1;
 for(let i=0;i<frames;i++){
  while(index+1<events.length&&i>=events[index+1].start)index++;
  const n=events[index],age=(i-n.start)/SR,remaining=(n.end-i)/SR,duration=(n.end-n.start)/SR,active=i>=n.start&&i<n.end;
  if(i===n.start){
   boundaries.push({frame:i,pressureBefore:pressure,phase,pitchBefore:pitch});
   fromPitch=n.articulation==='slur'?pitch:n.midi;fromPressure=pressure;
   if(n.articulation!=='slur')agePhrase=0;
  }
  let target=0;
  if(active){
   const slur=n.articulation==='slur',nextSlur=events[index+1]?.articulation==='slur';
   const u=clamp(age/.035,0,1),smooth=u*u*(3-2*u);
   pitch=fromPitch+(n.midi-fromPitch)*(slur?smooth:1);
   const attack=slur?1:Math.min(1,age/(n.articulation==='accent'?p.attack*.55:p.attack));
   const release=nextSlur?1:Math.min(1,remaining/p.release);
   target=n.pressure*attack*release*(.87+.13*Math.sin(Math.PI*age/duration));
   if(slur&&u<1)target=fromPressure+(target-fromPressure)*smooth;
   agePhrase+=1/SR;
  }else agePhrase=0;
  pressure+=(target-pressure)*.008;
  const vib=p.vibrato*clamp((agePhrase-.25)/.35,0,1)*Math.sin(TAU*5.1*agePhrase);
  const hz=440*2**((pitch-69+vib/100)/12);
  phase=(phase+TAU*hz/SR)%TAU;
  if(i%32===0){
   norm=0;
   for(let h=1;h<=partials.length;h++){
    const f=h*hz,bright=.5+p.brightness*pressure,shape=.25+p.formants.reduce((v,[center,width,gain])=>v+gain*Math.exp(-.5*((f-center)/width)**2),0);
    const a=f>=SR*.43?0:shape/(h**(1.65/bright));
    partials[h-1]=a;norm+=a;
   }
   norm=Math.max(.01,norm);
  }
  const co=Math.cos(phase),si=Math.sin(phase);let cs=co,ss=si,tone=0;
  for(const a of partials){tone+=a*ss;const next=cs*co-ss*si;ss=ss*co+cs*si;cs=next;}
  const white=random()*2-1;lo+=.025*(white-lo);hi+=.4*(white-hi);
  const breath=(hi-lo)*(.018+.04*pressure+(active&&n.articulation!=='slur'?.04*Math.exp(-Math.max(0,age)/.027):0));
  const v=(tone/norm+breath)*pressure*.66*Math.min(1,i/96,(frames-1-i)/480);
  out[i]=v;peak=Math.max(peak,Math.abs(v));
 }
 if(!Number.isFinite(peak)||peak<1e-7)throw Error('Silent brass phrase');
 out[0]=out[frames-1]=0;
 return {samples:out,sampleRate:SR,channels:1,boundaries,peak};
}
