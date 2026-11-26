// Offline dynamic-layer crossfade candidate. Independent recorded takes remain
// independent: this is not phase-vocoder resynthesis or authentic dynamic transitions.
const SR=48000,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function read(a,p){const k=Math.floor(p),f=p-k;if(k<0||k+1>=a.length)throw Error('Dynamic source exhausted');return a[k]*(1-f)+a[k+1]*f;}
function validZone(z){
 return z&&typeof z.id==='string'&&/^[0-9a-f]{64}$/.test(z.sourceSha256??'')&&z.samples instanceof Float32Array&&Number.isInteger(z.expectedMidi)&&z.expectedMidi>=36&&z.expectedMidi<=96&&Number.isFinite(z.measuredMidi)&&Math.abs(z.measuredMidi-z.expectedMidi)<=.75&&Number.isFinite(z.velocity)&&z.velocity>=.1&&z.velocity<=1&&Number.isFinite(z.rms)&&z.rms>0&&Number.isFinite(z.peak)&&z.peak>0;
}
function pointsFor(curve){
 if(!Array.isArray(curve)||curve.length<2||curve.length>64||curve[0].at!==0||curve.at(-1).at!==1||curve.some((p,i)=>!Number.isFinite(p.at)||!Number.isFinite(p.value)||p.value<.1||p.value>1||i>0&&p.at<=curve[i-1].at))throw Error('Invalid morph curve');
 return curve;
}
export function renderDynamicNote({low,high,midi,seconds,curve,mode='morph'}={}){
 if(!validZone(low)||!validZone(high)||low.id===high.id||low.sourceSha256===high.sourceSha256||low.instrument!==high.instrument||low.articulation!==high.articulation||low.expectedMidi!==high.expectedMidi||low.velocity>=high.velocity||!Number.isInteger(midi)||Math.abs(midi-low.expectedMidi)>5||!Number.isFinite(seconds)||seconds<.15||seconds>8||!['morph','fixed-high'].includes(mode))throw Error('Invalid recorded layer pair');
 const points=pointsFor(curve),frames=Math.round(seconds*SR);
 const rates=[low,high].map(z=>2**((midi-z.measuredMidi)/12)),gains=[low,high].map(z=>Math.min(.6/z.peak,.18/z.rms));
 const period=SR/(440*2**((midi-69)/12)),window=Math.min(2400,Math.floor(frames*.2)),anchor=Math.round(.20*SR);
 if([low,high].some((z,i)=>(frames-1+Math.ceil(period))*rates[i]+1>=z.samples.length))throw Error('Dynamic source too short');
 // Align a short post-attack reference window within one period. Independent
 // vibrato/intonation can still drift; report correlation, do not claim phase lock.
 let best={correlation:-1,delay:0};
 if(anchor+window<frames){
  for(let d=-Math.ceil(period/2);d<=Math.ceil(period/2);d+=2){
   let xy=0,xx=0,yy=0;
   for(let j=0;j<window;j+=4){
    const x=read(low.samples,(anchor+j+Math.max(0,-d))*rates[0]),y=read(high.samples,(anchor+j+Math.max(0,d))*rates[1]);
    xy+=x*y;xx+=x*x;yy+=y*y;
   }
   const c=xx*yy>1e-15?xy/Math.sqrt(xx*yy):-1;
   if(c>best.correlation)best={correlation:c,delay:d};
  }
 }
 const offsets=[Math.max(0,-best.delay),Math.max(0,best.delay)],a=new Float32Array(frames);
 let index=0,peak=0,energy=0,maxStep=0;
 const attack=Math.min(240,Math.floor(frames/4)),release=Math.min(3840,Math.floor(frames/3));
 for(let i=0;i<frames;i++){
  const u=i/(frames-1);while(index+1<points.length-1&&u>points[index+1].at)index++;
  const l=points[index],r=points[index+1],p=l.value+(r.value-l.value)*(u-l.at)/(r.at-l.at),t=clamp((p-low.velocity)/(high.velocity-low.velocity),0,1);
  // The control uses the same pressure curve, gains, and high-layer sample
  // offset, isolating the dynamic-layer crossfade as far as practicable.
  const x=read(low.samples,(i+offsets[0])*rates[0])*gains[0],y=read(high.samples,(i+offsets[1])*rates[1])*gains[1];
  const mix=mode==='fixed-high'?y:x*(1-t)+y*t;
  const v=mix*p*Math.min(1,i/attack,(frames-1-i)/release);
  if(!Number.isFinite(v)||Math.abs(v)>=.999)throw Error('Invalid dynamic PCM');
  a[i]=v;peak=Math.max(peak,Math.abs(v));energy+=v*v;if(i)maxStep=Math.max(maxStep,Math.abs(a[i]-a[i-1]));
 }
 if(peak<1e-7)throw Error('Silent dynamic note');a[0]=a[frames-1]=0;
 return {samples:a,frames,peak,rms:Math.sqrt(energy/frames),maxStep,correlation:best.correlation,offsets,rates,sourceIds:[low.id,high.id],sourceHashes:[low.sourceSha256,high.sourceSha256]};
}
export function renderDynamicPhrase({zones,instrument,articulation,notes,seconds,mode='morph'}={}){
 if(!Array.isArray(zones)||!zones.length||zones.length>256||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isFinite(seconds)||seconds<.15||seconds>90)throw Error('Invalid dynamic phrase');
 const groups=new Map();
 for(const z of zones.filter(z=>z.instrument===instrument&&z.articulation===articulation)){
  if(!validZone(z))throw Error('Invalid dynamic zone');
  if(!groups.has(z.expectedMidi))groups.set(z.expectedMidi,new Map());
  const layers=groups.get(z.expectedMidi);
  if(!layers.has(z.velocity)||z.variant<layers.get(z.velocity).variant)layers.set(z.velocity,z);
 }
 const roots=[...groups].filter(([,g])=>g.size>=2).map(([m])=>m);
 if(!roots.length)throw Error('No paired dynamic roots');
 const out=new Float32Array(Math.round(seconds*SR)),choices=[];let last=0;
 for(const n of notes){
  if(!Number.isFinite(n.start)||n.start<0||!Number.isFinite(n.duration)||!Number.isInteger(n.midi)||n.duration<.15||n.duration>8)throw Error('Invalid dynamic note');
  const start=Math.round(n.start*SR),end=Math.round((n.start+n.duration)*SR);
  if(start<last||end>out.length||end-start<7200)throw Error('Invalid dynamic grid');
  const root=[...roots].sort((a,b)=>Math.abs(a-n.midi)-Math.abs(b-n.midi)||a-b)[0],layers=[...groups.get(root).values()].sort((a,b)=>a.velocity-b.velocity);
  const r=renderDynamicNote({low:layers[0],high:layers.at(-1),midi:n.midi,seconds:(end-start)/SR,curve:n.curve,mode});
  out.set(r.samples,start);last=end;const {samples,...meta}=r;choices.push({midi:n.midi,root,startFrame:start,...meta});
 }
 return {samples:out,choices,sampleRate:SR,channels:1};
}
