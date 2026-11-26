// Research-only sample-to-sample legato approximation, not recorded interval transitions.
const SR=48000;
const sample=(a,p)=>{const k=Math.floor(p),f=p-k;if(k<0||k+1>=a.length)throw Error('Recorded legato source exhausted');return a[k]*(1-f)+a[k+1]*f;};
export function renderRecordedLegato({bank,instrument,notes,seconds,transitionSeconds=.055,sustainOffsetSeconds=.16,maxShift=5}={}){
 if(!bank||typeof bank.select!=='function'||!Array.isArray(notes)||!notes.length||notes.length>512||!Number.isFinite(seconds)||seconds<.1||seconds>90||!Number.isFinite(transitionSeconds)||transitionSeconds<.015||transitionSeconds>.12||!Number.isFinite(sustainOffsetSeconds)||sustainOffsetSeconds<.06||sustainOffsetSeconds>.4)throw Error('Invalid legato phrase');
 const out=new Float32Array(Math.round(seconds*SR)),choices=[],events=[];
 let previousEnd=0;
 for(const [i,n] of notes.entries()){
  if(!Number.isFinite(n.start)||n.start<0||!Number.isFinite(n.duration)||n.duration<.15||n.duration>8||!Number.isInteger(n.midi)||!Number.isFinite(n.pressure)||n.pressure<.1||n.pressure>1)throw Error('Invalid legato note');
  const start=Math.round(n.start*SR),end=Math.round((n.start+n.duration)*SR);
  if(end>out.length||start<previousEnd||end-start<7200||n.connected===true&&(!i||start!==previousEnd||n.articulation!==notes[i-1].articulation))throw Error('Invalid connected note grid');
  events.push({n,start,end});previousEnd=end;
 }
 let previous=null,peak=0;
 for(const [i,e] of events.entries()){
  const {n,start,end}=e,frames=end-start,connected=n.connected===true,nextConnected=events[i+1]?.n.connected===true;
  const {zone,velocity,variant}=bank.select({instrument,articulation:n.articulation,midi:n.midi,pressure:n.pressure,maxShift});
  const rate=2**((n.midi-zone.measuredMidi)/12),gain=Math.min(.6/Math.max(zone.peak,.001),.18/zone.rms)*n.pressure;
  const offset=connected?Math.round(sustainOffsetSeconds*SR):0,fade=Math.min(Math.round(transitionSeconds*SR),Math.floor(frames/3));
  const release=Math.min(3840,Math.floor(frames/3)),attack=Math.min(240,Math.floor(frames/4));
  if(offset+(frames-1)*rate+1>=zone.samples.length)throw Error('Recorded legato source too short');
  if(connected&&previous.offset+(previous.frames+fade-1)*previous.rate+1>=previous.zone.samples.length)throw Error('Previous recorded note cannot bridge transition');
  for(let j=0;j<frames;j++){
   let x=sample(zone.samples,offset+j*rate)*gain;
   if(connected&&j<fade){
    const u=j/(fade-1),w=.5-.5*Math.cos(Math.PI*u);
    const old=sample(previous.zone.samples,previous.offset+(previous.frames+j)*previous.rate)*previous.gain;
    x=old*(1-w)+x*w;
   }else if(!connected)x*=Math.min(1,j/attack);
   if(!nextConnected)x*=Math.min(1,(frames-1-j)/release);
   if(!Number.isFinite(x)||Math.abs(x)>=.999)throw Error('Invalid legato PCM');
   out[start+j]=x;peak=Math.max(peak,Math.abs(x));
  }
  choices.push({source:zone.id,sourceSha256:zone.sourceSha256,midi:n.midi,velocity,variant,startFrame:start,frames,connected,sourceOffsetFrames:offset,crossfadeFrames:connected?fade:0,boundaryStep:start?Math.abs(out[start]-out[start-1]):0});
  previous={zone,offset,frames,rate,gain};
 }
 out[0]=out[out.length-1]=0;
 return {samples:out,choices,peak,sampleRate:SR,channels:1};
}
