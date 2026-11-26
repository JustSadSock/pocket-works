// Offline unified recorded performance: independently advancing recorded voices,
// qualified sustain loops, pressure-driven real layers and explicit legato.
const SR=48000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function read(a,p){const k=Math.floor(p),f=p-k;if(k<0||k+1>=a.length)throw Error('Recorded performance source exhausted');return a[k]*(1-f)+a[k+1]*f;}
function voice(z,midi,offset,sustain){
 if(!z||!(z.samples instanceof Float32Array)||!Number.isInteger(z.expectedMidi)||!Number.isFinite(z.measuredMidi)||Math.abs(z.measuredMidi-z.expectedMidi)>.75||Math.abs(z.expectedMidi-midi)>5||!Number.isFinite(z.peak)||z.peak<=0||!Number.isFinite(z.rms)||z.rms<=0||!/^[0-9a-f]{64}$/.test(z.sourceSha256??''))throw Error('Invalid performance source');
 const a=z.samples,rate=2**((midi-z.measuredMidi)/12),gain=Math.min(.6/z.peak,.18/z.rms),l=z.loop;
 if(sustain&&(!l||![l.start,l.end,l.fade].every(Number.isInteger)||l.start<0||l.fade<2||l.end>=a.length-1||l.end-l.start<=2*l.fade||!Number.isFinite(l.correlation)||l.correlation<.78||!Number.isFinite(l.rmsRatio)||l.rmsRatio<.65))throw Error('Unqualified performance sustain loop');
 let p=offset,wraps=0;
 return {id:z.id,hash:z.sourceSha256,rate,get wraps(){return wraps},next(){
  if(sustain)while(p>=l.end){p=l.start+l.fade+p-l.end;wraps++;}
  let x=read(a,p);
  if(sustain&&p>=l.end-l.fade){const t=(p-l.end+l.fade)/l.fade,w=.5-.5*Math.cos(Math.PI*t);x=x*(1-w)+read(a,l.start+p-l.end+l.fade)*w;}
  p+=rate;return x*gain;
 }};
}
function curveFor(n){
 const c=n.curve??[{at:0,value:n.pressure},{at:1,value:n.pressure}];
 if(!Array.isArray(c)||c.length<2||c.length>64||c[0].at!==0||c.at(-1).at!==1||c.some((p,i)=>!Number.isFinite(p.at)||!Number.isFinite(p.value)||p.value<.1||p.value>1||i>0&&p.at<=c[i-1].at))throw Error('Invalid performance pressure curve');
 return c;
}
export function renderRecordedPerformance({zones,instrument,notes,seconds,mode='morph',transitionSeconds=.055}={}){
 if(!Array.isArray(zones)||!zones.length||zones.length>256||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isFinite(seconds)||seconds<.15||seconds>90||!['morph','discrete'].includes(mode)||!Number.isFinite(transitionSeconds)||transitionSeconds<.015||transitionSeconds>.12)throw Error('Invalid recorded performance');
 const groups=new Map(),cursors=new Map(),ids=new Set(),hashes=new Set();
 for(const z of zones){
  if(z.instrument!==instrument)continue;
  if(typeof z.id!=='string'||typeof z.articulation!=='string'||!Number.isInteger(z.expectedMidi)||z.expectedMidi<36||z.expectedMidi>96||!Number.isFinite(z.velocity)||z.velocity<.1||z.velocity>1||!Number.isInteger(z.variant)||z.variant<1||ids.has(z.id)||hashes.has(z.sourceSha256))throw Error('Duplicate or invalid performance zone');
  ids.add(z.id);hashes.add(z.sourceSha256);
  const key=z.articulation+':'+z.expectedMidi;
  if(!groups.has(key))groups.set(key,{root:z.expectedMidi,articulation:z.articulation,layers:new Map()});
  const l=groups.get(key).layers;
  if(!l.has(z.velocity))l.set(z.velocity,[]);
  if(l.get(z.velocity).some(x=>x.variant===z.variant))throw Error('Duplicate performance variant');
  l.get(z.velocity).push(z);
 }
 const frames=Math.round(seconds*SR),out=new Float32Array(frames),events=[],choices=[];
 let last=0;
 for(const [i,n] of notes.entries()){
  if(!Number.isInteger(n.midi)||!Number.isFinite(n.start)||n.start<0||!Number.isFinite(n.duration)||n.duration<.15||n.duration>30||typeof n.articulation!=='string')throw Error('Invalid performance note');
  const start=Math.round(n.start*SR),end=Math.round((n.start+n.duration)*SR),curve=curveFor(n);
  if(start<last||end>frames||end-start<7200||n.connected===true&&(!i||start!==last||n.articulation!==notes[i-1].articulation))throw Error('Invalid performance grid');
  const candidates=[...groups.values()].filter(g=>g.articulation===n.articulation).sort((a,b)=>Math.abs(a.root-n.midi)-Math.abs(b.root-n.midi)||a.root-b.root);
  const g=candidates[0];if(!g||Math.abs(g.root-n.midi)>5)throw Error('Unrecorded performance articulation or pitch');
  const layers=[...g.layers].sort((a,b)=>a[0]-b[0]);
  if(n.morph===true&&layers.length<2)throw Error('No paired performance layers');
  if(n.articulation==='pizzicato'&&(n.connected===true||n.sustain===true||n.morph===true))throw Error('Pizzicato is a finite attack');
  const chosen=mode==='morph'&&n.morph===true?[layers[0],layers.at(-1)]:[layers.reduce((a,b)=>Math.abs(a[0]-curve[0].value)<=Math.abs(b[0]-curve[0].value)?a:b)];
  const selected=chosen.map(([v,takes])=>{
   takes.sort((a,b)=>a.variant-b.variant);
   const key=[g.articulation,g.root,v].join(':'),cursor=cursors.get(key)??0;
   const z=takes[cursor%takes.length];cursors.set(key,cursor+1);
   return {v,z};
  });
  events.push({n,start,end,curve,selected});last=end;
 }
 let previous=null,maxStep=0,peak=0;
 for(const [i,e] of events.entries()){
  const {n,start,end,curve,selected}=e,len=end-start,connected=n.connected===true,nextConnected=events[i+1]?.n.connected===true;
  const fade=Math.min(Math.round(transitionSeconds*SR),Math.floor(len/3)),attack=Math.min(240,Math.floor(len/4)),release=Math.min(3840,Math.floor(len/3));
  const voices=selected.map(({z})=>voice(z,n.midi,connected?Math.round(.16*SR):0,n.sustain===true));
  let point=0,pressure=curve[0].value;
  function next(p){
   const x=voices[0].next();
   if(voices.length===1)return x*p;
   const y=voices[1].next(),t=clamp((p-selected[0].v)/(selected[1].v-selected[0].v),0,1);
   return (x*(1-t)+y*t)*p;
  }
  const meta={midi:n.midi,articulation:n.articulation,startFrame:start,frames:len,connected,sustain:n.sustain===true,sourceIds:voices.map(v=>v.id),sourceHashes:voices.map(v=>v.hash),variants:selected.map(x=>x.z.variant),layers:selected.map(x=>x.v),boundaryStep:0,wraps:[]};
  for(let j=0;j<len;j++){
   const u=j/(len-1);while(point+1<curve.length-1&&u>curve[point+1].at)point++;
   const l=curve[point],r=curve[point+1];pressure=l.value+(r.value-l.value)*(u-l.at)/(r.at-l.at);
   let x=next(pressure);
   if(connected&&j<fade){const w=.5-.5*Math.cos(Math.PI*j/(fade-1));x=previous.next(previous.pressure)*(1-w)+x*w;}
   else if(!connected)x*=Math.min(1,j/attack);
   if(!nextConnected)x*=Math.min(1,(len-1-j)/release);
   if(!Number.isFinite(x)||Math.abs(x)>=.999)throw Error('Invalid unified performance PCM');
   out[start+j]=x;peak=Math.max(peak,Math.abs(x));if(start+j)maxStep=Math.max(maxStep,Math.abs(out[start+j]-out[start+j-1]));
  }
  meta.boundaryStep=start?Math.abs(out[start]-out[start-1]):0;
  choices.push(meta);previous={next,pressure,voices,meta};
  // A following connected note may extend these cursors; update their count
  // after every bridge rather than recording stale wrap counters.
  meta.wraps=voices.map(v=>v.wraps);
  if(i>0)events[i-1].meta.wraps=events[i-1].voices.map(v=>v.wraps);
  e.meta=meta;e.voices=voices;
 }
 if(peak<1e-7)throw Error('Silent recorded performance');
 out[0]=out[out.length-1]=0;return {samples:out,choices,peak,maxStep,sampleRate:SR,channels:1};
}
