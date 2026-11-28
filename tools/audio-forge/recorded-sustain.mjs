// Research-only sustain extension. A loop is admitted only after waveform checks.
const SR=48000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function findSustainLoop(zone){
 const a=zone?.samples,m=zone?.measuredMidi;
 if(!(a instanceof Float32Array)||!Number.isFinite(m)||m<36||m>96||!Number.isFinite(zone.rms)||zone.rms<=0||a.length<SR*1.5)throw Error('Invalid sustain source');
 const period=SR/(440*2**((m-69)/12)),fade=Math.max(480,Math.round(period*10)),stride=4;
 let best=null;
 for(let start=Math.round(.35*SR);start<=.85*SR;start+=4800){
  for(let span=Math.round(.60*SR);span<=1.65*SR;span+=4800){
   const nominal=start+span;
   if(nominal+Math.ceil(period)>=a.length)continue;
   for(let delta=-Math.ceil(period/2);delta<=Math.ceil(period/2);delta+=2){
    const end=nominal+delta,tail=end-fade;
    let xy=0,xx=0,yy=0;
    for(let k=0;k<fade;k+=stride){const x=a[start+k],y=a[tail+k];xy+=x*y;xx+=x*x;yy+=y*y;}
    const rmsA=Math.sqrt(xx/Math.ceil(fade/stride)),rmsB=Math.sqrt(yy/Math.ceil(fade/stride));
    if(Math.min(rmsA,rmsB)<Math.max(.0003,zone.rms*.45))continue;
    const corr=xy/Math.sqrt(xx*yy),ratio=Math.min(rmsA,rmsB)/Math.max(rmsA,rmsB);
    if(!Number.isFinite(corr)||!Number.isFinite(ratio)||corr<.78||ratio<.65)continue;
    const score=corr+.2*ratio;
    if(!best||score>best.score)best={start,end,fade,correlation:corr,rmsRatio:ratio,score};
   }
  }
 }
 if(!best)throw Error('No qualified sustain loop');return best;
}
function sample(a,p){const i=Math.floor(p),f=p-i;return a[i]*(1-f)+a[i+1]*f;}
export function renderSustainedNote({zone,midi,seconds,pressure=.7,curve,loop}={}){
 const a=zone?.samples;
 if(!(a instanceof Float32Array)||!Number.isFinite(zone.measuredMidi)||!Number.isInteger(zone.expectedMidi)||zone.expectedMidi<36||zone.expectedMidi>96||Math.abs(zone.measuredMidi-zone.expectedMidi)>.75||!Number.isFinite(zone.rms)||zone.rms<=0||!Number.isFinite(zone.peak)||zone.peak<=0||!Number.isInteger(midi)||Math.abs(midi-zone.expectedMidi)>5||!Number.isFinite(seconds)||seconds<.08||seconds>30||!Number.isFinite(pressure)||pressure<.1||pressure>1)throw Error('Invalid sustained note');
 if(!loop||![loop.start,loop.end,loop.fade].every(Number.isInteger)||loop.start<0||loop.fade<2||loop.end>=a.length-1||loop.end-loop.start<=loop.fade*2||!Number.isFinite(loop.correlation)||loop.correlation<.78||!Number.isFinite(loop.rmsRatio)||loop.rmsRatio<.65)throw Error('Unqualified sustain loop');
 const points=curve??[{at:0,value:pressure},{at:1,value:pressure}];
 if(!Array.isArray(points)||points.length<2||points.length>64||points[0].at!==0||points.at(-1).at!==1||points.some((p,i)=>!Number.isFinite(p.at)||!Number.isFinite(p.value)||p.value<.1||p.value>1||i>0&&p.at<=points[i-1].at))throw Error('Invalid pressure curve');
 const frames=Math.round(seconds*SR),out=new Float32Array(frames),rate=2**((midi-zone.measuredMidi)/12),gain=Math.min(.6/zone.peak,.18/zone.rms),attack=Math.min(240,frames/4),release=Math.min(5760,frames/3);
 let p=0,index=0,wraps=0,peak=0,maxStep=0,maxWrapStep=0;
 for(let i=0;i<frames;i++){
  let wrapped=false;
  while(p>=loop.end){p=loop.start+loop.fade+(p-loop.end);wraps++;wrapped=true;}
  let x=sample(a,p);
  if(p>=loop.end-loop.fade){const t=(p-(loop.end-loop.fade))/loop.fade,w=.5-.5*Math.cos(Math.PI*t);x=x*(1-w)+sample(a,loop.start+p-(loop.end-loop.fade))*w;}
  const u=i/(frames-1);while(index+1<points.length-1&&u>points[index+1].at)index++;
  const l=points[index],r=points[index+1],v=l.value+(r.value-l.value)*clamp((u-l.at)/(r.at-l.at),0,1);
  const y=x*gain*v*Math.min(1,i/attack,(frames-1-i)/release);if(!Number.isFinite(y))throw Error('Invalid sustained PCM');
  out[i]=y;peak=Math.max(peak,Math.abs(y));if(i){const step=Math.abs(out[i]-out[i-1]);maxStep=Math.max(maxStep,step);if(wrapped)maxWrapStep=Math.max(maxWrapStep,step);}p+=rate;
 }
 if(peak>=.999||peak<1e-7)throw Error('Invalid sustain amplitude');out[0]=out[frames-1]=0;
 return {samples:out,wraps,peak,maxStep,maxWrapStep,rate,frames};
}
