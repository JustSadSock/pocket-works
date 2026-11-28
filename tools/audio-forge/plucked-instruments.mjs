// Original plucked-string instruments. Fractional-delay waveguide, velocity-dependent
// excitation, string damping and a small resonant body. No recorded samples.
import {rng} from './foundation.mjs';
const SR=48000,TAU=2*Math.PI;
const profiles={
 lute:{damping:.9964,brightness:.54,position:.22,body:[[190,.032,.15],[390,.021,.08],[730,.014,.04]],release:.075},
 harp:{damping:.9984,brightness:.73,position:.34,body:[[125,.046,.12],[310,.032,.075],[560,.023,.035]],release:.15}
};
function bounded(x,min,max,label){if(!Number.isFinite(x)||x<min||x>max)throw Error('Invalid '+label);return x}
export function pluckNote({instrument='lute',midi,velocity=.7,duration=1,seed=1}={}){
 const p=profiles[instrument];if(!p)throw Error('Unknown plucked instrument');
 if(!Number.isInteger(midi)||midi<36||midi>84||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid note identity');
 bounded(velocity,.1,1,'velocity');bounded(duration,.08,8,'duration');
 const random=rng(seed),f=440*2**((midi-69)/12);
 const pole=1-p.brightness*(.7+.3*velocity);
 // Compensate the lowpass's phase delay at the fundamental.
 const omega=TAU*f/SR,phaseDelay=Math.atan2(pole*Math.sin(omega),1-pole*Math.cos(omega))/omega;
 const delay=SR/f-phaseDelay,whole=Math.floor(delay),fraction=delay-whole;
 const size=whole+3,line=new Float64Array(size);
 const pick=Math.max(1,Math.round(delay*(p.position+(random()-.5)*.045)));
 let smooth=0;
 const excitation=new Float64Array(size+pick);
 for(let i=0;i<excitation.length;i++){smooth+=(random()*2-1-smooth)*(.25+.65*velocity);excitation[i]=smooth;}
 for(let i=0;i<size;i++)line[i]=(excitation[i+pick]-excitation[i])*.5;
 const frames=Math.round((duration+p.release)*SR),out=new Float32Array(frames);
 const body=p.body.map(([hz,decay,gain])=>{const radius=Math.exp(-1/(SR*decay));return {a:2*radius*Math.cos(TAU*hz/SR),b:-radius*radius,input:gain*(1-radius),y1:0,y2:0}});
 let index=0,last=0,peak=0;
 for(let i=0;i<frames;i++){
  const a=line[(index-whole+size)%size],b=line[(index-whole-1+size)%size];
  const read=a*(1-fraction)+b*fraction;
  last=(1-pole)*read+pole*last;
  const release=i/SR>duration?Math.exp(-(i/SR-duration)/(.012+p.release*.18)):1;
  line[index]=last*p.damping*release;index=(index+1)%size;
  let y=read;
  for(const m of body){const q=m.input*read+m.a*m.y1+m.b*m.y2;m.y2=m.y1;m.y1=q;y+=q;}
  const fade=Math.min(1,i/48,(frames-1-i)/Math.min(480,frames-1));
  out[i]=y*fade;peak=Math.max(peak,Math.abs(out[i]));
 }
 if(!Number.isFinite(peak)||peak<1e-8)throw Error('Silent string');
 // Velocity affects both excitation spectrum and output amplitude.
 const gain=(.12+.5*velocity**1.45)/peak;
 for(let i=0;i<out.length;i++)out[i]*=gain;
 out[0]=out[out.length-1]=0; // canonical positive zero at boundaries
 return out;
}
export function renderPluckedScore({tempo=100,bars=8,meter=4,tracks,seed=1}={}){
 bounded(tempo,40,200,'tempo');
 if(!Number.isInteger(bars)||bars<1||bars>32||!Number.isInteger(meter)||meter<2||meter>6||!Array.isArray(tracks)||!tracks.length||tracks.length>8||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid string score');
 const frames=Math.round(bars*meter*60/tempo*SR),pcm=new Float32Array(frames*2),random=rng(seed);
 for(const track of tracks){
  bounded(track.pan??0,-1,1,'pan');bounded(track.gain??1,0,1,'track gain');
  if(!Array.isArray(track.notes)||track.notes.length>1000)throw Error('Invalid notes');
  const pan=track.pan??0,left=Math.sqrt((1-pan)/2)*(track.gain??1),right=Math.sqrt((1+pan)/2)*(track.gain??1);
  for(const n of track.notes){
   bounded(n.beat,0,bars*meter-.001,'beat');bounded(n.duration,.02,bars*meter-n.beat,'duration');
   const start=Math.round(n.beat*60/tempo*SR),data=pluckNote({instrument:track.instrument,midi:n.midi,velocity:n.velocity,duration:Math.max(.08,n.duration*60/tempo),seed:Math.floor(random()*4294967296)});
   for(let i=0;i<data.length&&start+i<frames;i++){pcm[(start+i)*2]+=data[i]*left;pcm[(start+i)*2+1]+=data[i]*right;}
  }
 }
 let peak=0;
 for(let i=0;i<frames;i++){
  const fade=Math.min(1,i/240,(frames-1-i)/2400);
  for(let c=0;c<2;c++){const k=i*2+c;pcm[k]*=fade;peak=Math.max(peak,Math.abs(pcm[k]));}
 }
 if(!Number.isFinite(peak)||peak<1e-8)throw Error('Silent arrangement');
 const scale=Math.min(1,.63/peak);for(let i=0;i<pcm.length;i++)pcm[i]*=scale;
 return {samples:pcm,sampleRate:SR,channels:2};
}
