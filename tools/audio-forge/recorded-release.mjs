// Contiguous endings extracted from complete recordings, not separate key-off takes.
const SR=48000,W=480,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rms(a,s,e){let sum=0;for(let i=s;i<e;i++)sum+=a[i]**2;return Math.sqrt(sum/(e-s));}
export function prepareRecordedRelease(pcm,z){
 if(!(pcm instanceof Float32Array)||pcm.length<SR||pcm.length>SR*60||!z||typeof z.id!=='string'||!/^[0-9a-f]{64}$/.test(z.sourceSha256??'')||!Number.isInteger(z.expectedMidi)||!Number.isFinite(z.measuredMidi)||Math.abs(z.measuredMidi-z.expectedMidi)>.75)throw Error('Invalid release source');
 for(const v of pcm)if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('Invalid release PCM');
 const e=[];for(let i=0;i+W<=pcm.length;i+=W)e.push(rms(pcm,i,i+W));
 const ref=[...e].sort((a,b)=>a-b)[Math.floor((e.length-1)*.7)];
 if(ref<.001)throw Error('Silent release source');
 let loud=-1,quiet=-1;
 for(let i=0;i<e.length;i++){if(e[i]>=ref*.45)loud=i;if(e[i]>=ref*.08)quiet=i;}
 const start=Math.max(0,loud-4)*W,end=Math.min(e.length,quiet+9)*W;
 const initial=rms(pcm,start,start+4*W),final=rms(pcm,end-4*W,end);
 if(loud<50||quiet<loud||end-start<SR*.12||end-start>SR*2.5||initial<ref*.30||final>initial*.15||rms(pcm,pcm.length-4800,pcm.length)>ref*.12)throw Error('No qualified natural recorded ending');
 return {id:z.id,sourceSha256:z.sourceSha256,expectedMidi:z.expectedMidi,measuredMidi:z.measuredMidi,samples:pcm.slice(start,end),sourceStartFrame:start,sourceEndFrame:end,fullSourceFrames:pcm.length,initialRms:initial,finalRms:final,kind:'extracted-recorded-ending'};
}
export function compileRecordedRelease({selected,releaseBank,midi,pressure,correlation=0,availableFrames}){
 if(!Array.isArray(selected)||selected.length<1||selected.length>2||!Array.isArray(releaseBank)||!Number.isInteger(midi)||!Number.isFinite(pressure)||pressure<.1||pressure>1||!Number.isInteger(availableFrames)||availableFrames<0)throw Error('Invalid release request');
 const ids=new Set();for(const r of releaseBank){if(!r||typeof r.id!=='string'||ids.has(r.id))throw Error('Duplicate or invalid release source');ids.add(r.id);}
 const layers=selected.map(({z,v})=>{
  const r=releaseBank.find(x=>x.id===z.id);
  if(!r||r.sourceSha256!==z.sourceSha256||r.measuredMidi!==z.measuredMidi||r.expectedMidi!==z.expectedMidi||r.kind!=='extracted-recorded-ending'||!(r.samples instanceof Float32Array)||!Number.isInteger(r.sourceStartFrame)||r.sourceStartFrame<0||!Number.isInteger(r.sourceEndFrame)||r.sourceEndFrame-r.sourceStartFrame!==r.samples.length||!Number.isInteger(r.fullSourceFrames)||r.sourceEndFrame>r.fullSourceFrames||r.samples.length<SR*.12||r.samples.length>SR*2.5||!Number.isFinite(r.initialRms)||r.initialRms<=0||!Number.isFinite(r.finalRms)||r.finalRms<0||r.finalRms>r.initialRms*.15)throw Error('Missing or mismatched qualified recorded ending: '+z.id);
  const rate=2**((midi-z.measuredMidi)/12),gain=Math.min(.6/z.peak,.18/z.rms);
  return {r,v,rate,gain,frames:Math.floor((r.samples.length-2)/rate)+1};
 });
 let weights=[1];
 if(layers.length===2){
  const t=clamp((pressure-layers[0].v)/(layers[1].v-layers[0].v),0,1),c=clamp(correlation,0,1),g=Math.min(1.35,1/Math.sqrt((1-t)**2+t*t+2*c*t*(1-t)));
  weights=[(1-t)*g,t*g];
 }
 const frames=Math.max(...layers.map(l=>l.frames));
 if(frames>availableFrames)throw Error('Recorded ending overlaps next note or exceeds score');
 const tail=new Float32Array(frames);
 for(const [k,l] of layers.entries())for(let i=0;i<l.frames;i++){
  const p=i*l.rate,j=Math.floor(p),f=p-j,x=l.r.samples[j]*(1-f)+l.r.samples[j+1]*f;
  if(!Number.isFinite(x)||Math.abs(x)>1)throw Error('Invalid recorded release playback PCM');
  tail[i]+=x*l.gain*pressure*weights[k]*Math.min(1,(l.frames-1-i)/720);
 }
 const bridge=Math.min(1920,Math.floor(frames/4)),period=Math.ceil(SR/(440*2**((midi-69)/12)));
 return {frames,render(next){
  const continuation=new Float32Array(bridge);
  for(let i=0;i<bridge;i++)continuation[i]=next(pressure);
  let lag=0,best=-Infinity;
  for(let d=0;d<=Math.min(period,frames-bridge-1);d+=2){
   let xy=0,xx=0,yy=0;
   for(let i=0;i<bridge;i+=4){const x=continuation[i],y=tail[i+d];xy+=x*y;xx+=x*x;yy+=y*y;}
   const c=xx*yy>1e-16?xy/Math.sqrt(xx*yy):-1;
   if(c>best){best=c;lag=d;}
  }
  const initial=rms(tail,lag,lag+bridge),outgoing=rms(continuation,0,bridge);
  if(initial<1e-6||outgoing<1e-6)throw Error('Silent release bridge');
  const gain=clamp(outgoing/initial,.35,2.5),out=new Float32Array(frames);
  for(let i=0;i<frames;i++){
   const x=i+lag<frames?tail[i+lag]*gain:0,w=i<bridge?.5-.5*Math.cos(Math.PI*i/(bridge-1)):1;
   out[i]=i<bridge?continuation[i]*(1-w)+x*w:x;
   if(!Number.isFinite(out[i])||Math.abs(out[i])>=.999)throw Error('Invalid release output PCM');
  }
  out[out.length-1]=0;
  return {samples:out,receipt:{kind:'extracted-recorded-ending',frames,crossfadeFrames:bridge,phaseOffsetFrames:lag,correlation:best,gain,sourceSegments:layers.map(l=>({id:l.r.id,sha256:l.r.sourceSha256,startFrame:l.r.sourceStartFrame,endFrame:l.r.sourceEndFrame,fullSourceFrames:l.r.fullSourceFrames,initialRms:l.r.initialRms,finalRms:l.r.finalRms,playbackRate:l.rate}))}};
 }};
}
