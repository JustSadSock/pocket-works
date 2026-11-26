// Original continuous-phase wind approximation: harmonic excitation, breath noise,
// pressure-dependent tone and connected pitch transitions. Not a bore simulation.
import {rng} from './foundation.mjs';
const SR=48000,TAU=2*Math.PI;
const profiles={
 flute:{harmonics:[1,.27,.085,.045,.02,.012],attack:.085,release:.09,noise:.10,bright:.35,vibrato:9},
 reed:{harmonics:[1,.20,.57,.16,.34,.10,.20,.055,.12],attack:.045,release:.06,noise:.055,bright:.64,vibrato:12}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bounded(v,a,b,label){if(!Number.isFinite(v)||v<a||v>b)throw Error('Invalid '+label);return v}
export function renderWindPhrase({instrument='flute',notes,seconds,seed=1,glideSeconds=.045}={}){
 const profile=profiles[instrument];
 if(!profile||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid wind phrase');
 bounded(seconds,.1,90,'phrase length');bounded(glideSeconds,.008,.12,'glide');
 const frames=Math.round(seconds*SR),out=new Float32Array(frames),random=rng(seed),events=[];
 let previousEnd=0;
 for(const [index,n] of notes.entries()){
  if(!Number.isInteger(n.midi)||n.midi<45||n.midi>84)throw Error('Invalid wind pitch');
  const start=Math.round(bounded(n.start,0,seconds,'note start')*SR),end=Math.round((n.start+bounded(n.duration,.05,8,'note duration'))*SR);
  if(start<previousEnd||end>frames||end<=start||n.connected===true&&(!index||start!==previousEnd))throw Error('Invalid wind articulation grid');
  events.push({start,end,midi:n.midi,pressure:bounded(n.pressure??.7,.1,1,'breath pressure'),connected:n.connected===true});
  previousEnd=end;
 }
 let phase=0,noiseLow=0,noiseHigh=0,pressure=0,pitch=events[0].midi,index=0,peak=0;
 let onsetPitch=pitch,onsetPressure=0,gate=0;
 const boundaries=[];
 for(let i=0;i<frames;i++){
  while(index+1<events.length&&i>=events[index+1].start)index++;
  const n=events[index],age=(i-n.start)/SR,duration=(n.end-n.start)/SR,remaining=(n.end-i)/SR,active=i>=n.start&&i<n.end;
  if(i===n.start){
   onsetPitch=n.connected?pitch:n.midi;onsetPressure=n.connected?pressure:0;
   if(!n.connected)gate=0;
   boundaries.push({frame:i,connected:n.connected,pitchBefore:pitch,pressureBefore:pressure,phase});
  }
  let target=0;
  if(active){
   const nextConnected=events[index+1]?.connected===true;
   const attack=n.connected?1:Math.min(1,age/profile.attack);
   const release=nextConnected?1:Math.min(1,remaining/profile.release);
   const swell=n.pressure*(.88+.12*Math.sin(Math.PI*clamp(age/duration,0,1)));
   target=swell*Math.min(attack,release);
   const glide=n.connected?clamp(age/glideSeconds,0,1):1;
   const smooth=glide*glide*(3-2*glide);
   pitch=onsetPitch+(n.midi-onsetPitch)*smooth;
   if(n.connected&&age<glideSeconds)target=onsetPressure+(target-onsetPressure)*smooth;
   gate+=1/SR;
  }else gate=0;
  pressure+=(target-pressure)*.009;
  const cents=profile.vibrato*Math.min(1,Math.max(0,(gate-.16)/.24))*Math.sin(TAU*5.1*gate);
  const hz=440*2**((pitch-69+cents/100)/12);
  phase=(phase+TAU*hz/SR)%TAU;
  const white=random()*2-1;noiseLow+=.018*(white-noiseLow);noiseHigh+=.38*(white-noiseHigh);
  let tone=0,weight=0;
  for(let h=1;h<=profile.harmonics.length;h++){
   if(h*hz>SR*.45)break;
   const a=profile.harmonics[h-1]*(h===1?1:(.35+profile.bright*pressure)**((h-1)/2));
   tone+=a*Math.sin(h*phase+(h%2?.07:0));weight+=a;
  }
  const air=(noiseHigh-noiseLow)*profile.noise*(.5+pressure);
  const fade=Math.min(1,i/96,(frames-1-i)/480);
  const v=(tone/Math.max(1,weight)+air)*pressure*.65*fade;
  out[i]=v;peak=Math.max(peak,Math.abs(v));
 }
 if(!Number.isFinite(peak)||peak<1e-6)throw Error('Silent wind phrase');
 out[0]=out[frames-1]=0;
 return {samples:out,sampleRate:SR,channels:1,boundaries,peak};
}
