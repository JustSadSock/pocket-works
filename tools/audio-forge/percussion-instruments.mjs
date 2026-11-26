// Original modal percussion: inharmonic membranes, shells, broadband snare
// and metallic modes. No external samples.
import {rng} from './foundation.mjs';
const SR=48000,TAU=2*Math.PI;
const profiles={
 timpani:{duration:2.4,modes:[[1,1,.85],[1.504,.34,.6],[1.99,.24,.45],[2.44,.15,.28],[2.92,.10,.18]],noise:.12,low:160,high:5000,noiseDecay:.022},
 warDrum:{duration:1.15,modes:[[1,1,.20],[1.59,.54,.105],[2.14,.23,.08],[2.87,.10,.05]],noise:.28,low:75,high:4500,noiseDecay:.055},
 snare:{duration:.65,modes:[[1,.38,.08],[1.57,.22,.06],[2.14,.16,.045]],noise:.72,low:700,high:12500,noiseDecay:.085},
 cymbal:{duration:2.6,modes:[[1,.5,.62],[1.27,.38,.51],[1.64,.27,.47],[2.19,.24,.42],[2.73,.2,.38],[3.41,.16,.34],[4.56,.13,.3],[5.61,.12,.28]],noise:.55,low:2400,high:16000,noiseDecay:.35}
};
export function strikePercussion({instrument='timpani',midi=43,velocity=.7,seed=1}={}){
 const p=profiles[instrument];
 if(!p||!Number.isInteger(midi)||midi<31||midi>72||!Number.isFinite(velocity)||velocity<.1||velocity>1||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid percussion strike');
 const f=instrument==='cymbal'?1180:440*2**((midi-69)/12),random=rng(seed),frames=Math.round(p.duration*SR),out=new Float32Array(frames);
 const modes=p.modes.map(([ratio,gain,decay],i)=>({hz:f*ratio*(1+(i===0?0:(random()-.5)*.016)),amp:gain*(.7+.3*velocity)**i,decay:decay*(.9+.2*velocity),phase:random()*TAU}));
 let low=0,high=0,peak=0;
 const alpha=1-Math.exp(-TAU*p.low/SR),beta=1-Math.exp(-TAU*p.high/SR);
 for(let i=0;i<frames;i++){
  const t=i/SR,white=random()*2-1;
  low+=alpha*(white-low);high+=beta*(white-high);
  let v=0;
  for(const m of modes){m.phase=(m.phase+TAU*m.hz*(1+.015*velocity*Math.exp(-t/.025))/SR)%TAU;v+=m.amp*Math.sin(m.phase)*Math.exp(-t/m.decay);}
  const attack=Math.min(1,i/Math.round(SR*(.0014-.0007*velocity)));
  const noise=(high-low)*p.noise*Math.exp(-t/p.noiseDecay);
  v=(v+noise)*attack*Math.min(1,(frames-1-i)/960);
  out[i]=v;peak=Math.max(peak,Math.abs(v));
 }
 if(!Number.isFinite(peak)||peak<1e-7)throw Error('Silent percussion');
 const gain=(.12+.64*velocity**1.3)/peak;for(let i=0;i<frames;i++)out[i]*=gain;
 out[0]=out[frames-1]=0;
 return {samples:out,sampleRate:SR,channels:1};
}
