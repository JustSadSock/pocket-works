// Living Battlefield, original procedural synthesis. No external recordings.
// No physical effects are generated: contacts are aggregated texture, shots are
// recorded emissions, orders are state transitions, and footsteps reflect speed.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash=(a,b=0)=>{let n=Math.imul(a|0,374761393)+Math.imul(b|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
export function audible(F,s,u){return F.alive(u)&&!u.pendingArrival&&(!s.fog||u.side===0||!!F.visible?.(s,0,u))}
export function soundEvents(F,s,cam,prior,dt){
 const events=[],next=new Map(),t=s.time;
 for(let u of s.units){if(!audible(F,s,u))continue;
  let d=Math.hypot(u.x-cam.x,u.y-cam.y),gain=clamp(1-d/540,0,1)**1.7*Math.min(1,Math.sqrt(u.n/90)),pan=clamp((cam.axis==='wide'?u.x-cam.x:cam.y-u.y)/200,-1,1),p=prior.get(u.id),horse=F.spec(u).horse>0;
  let gait=horse?(u.v>3?3.8:u.v>1.4?2.5:1.4):clamp(u.v*1.75,.65,3.8),stride=Math.floor((u.motionDistance??t*Math.abs(u.v||0))/(horse?1.5:.68)),beat=Math.floor(t*2);
  let state={stride,beat,order:u.order?.kind,rout:!!u.rout};next.set(u.id,state);if(gain<.025||!p)continue;
  const add=(kind,strength=1,variant=beat)=>events.push({kind,gain:gain*strength,pan,variant:Math.floor(hash(u.id,variant)*4),id:u.id});
  if(u.v>.18&&stride!==p.stride){add(horse?'hoof':'step',horse?.66:.46,stride);if(!horse&&hash(u.id,stride)>.6)add('armor',.24,stride)}
  if(u.contact>0&&beat!==p.beat)add('contact',Math.min(.58,.17+u.contact*.06),beat);
  if(u.rout&&beat!==p.beat&&beat%3===0)add('retreat',.30);
  if(state.order!==p.order&&u.side===0)add('signal',.37);
 }
 if(dt>0)for(let a of s.shots||[]){if(a.time<=t&&a.time>t-dt){let u=s.units.find(u=>u.id===a.id);if(!u||!audible(F,s,u))continue;let d=Math.hypot(a.x-cam.x,a.y-cam.y),gain=clamp(1-d/650,0,1)**1.7*Math.min(1,Math.sqrt(u.n/80));if(gain>.02)events.push({kind:'volley',gain:gain*.75,pan:clamp((cam.axis==='wide'?a.x-cam.x:cam.y-a.y)/200,-1,1),variant:Math.floor(hash(u.id,Math.round(a.time*4))*4),id:u.id})}}
 events.sort((a,b)=>b.gain-a.gain||a.id-b.id);return {events:events.slice(0,8),next};
}
const lengths={step:.24,hoof:.34,armor:.23,contact:.38,volley:.43,signal:.65,retreat:.62,wind:4,water:4,forest:4};
export function synth(kind,variant,rate=24000){
 const duration=lengths[kind],n=Math.round(duration*rate),a=new Float32Array(n),ambient=['wind','water','forest'].includes(kind);let state=(1315423911+variant*3571+kind.length*71237)>>>0,lo=0,mid=0;
 for(let i=0;i<n;i++){
  let t=i/rate,p=i/n;state^=state<<13;state^=state>>>17;state^=state<<5;let noise=(state>>>0)/2147483648-1;lo=lo*.965+noise*.035;mid=mid*.74+noise*.26;let hi=noise-mid,env=Math.min(1,t*180)*Math.exp(-t*(kind==='contact'?9:kind==='signal'?3.4:15)),x=0;
  if(kind==='step')x=(lo*2.7+Math.sin(2*Math.PI*(58+variant*8)*t)*.32+mid*.25)*env;
  if(kind==='hoof'){let a1=Math.exp(-Math.max(0,t-.012)*23)*(t>.012?1:0),a2=Math.exp(-Math.max(0,t-.108)*28)*(t>.108?1:0);x=(Math.sin(2*Math.PI*(85+variant*9)*t)*.37+lo*2.8+hi*.18)*(a1+a2*.66)}
  if(kind==='armor')x=(hi*.22+Math.sin(2*Math.PI*(1220+variant*137)*t)*.13+Math.sin(2*Math.PI*2270*t)*.06)*env;
  if(kind==='contact')x=(hi*.28+Math.sin(2*Math.PI*(430+variant*89)*t)*.24+Math.sin(2*Math.PI*1197*t)*.13+lo*.7)*env;
  if(kind==='volley')x=(hi*.24+mid*.65)*Math.exp(-t*9)*Math.min(1,t*110)+Math.sin(2*Math.PI*(220-110*p)*t)*.13*env;
  if(kind==='signal')x=(Math.sin(2*Math.PI*(330+variant*22)*t)+.38*Math.sin(2*Math.PI*(660+variant*44)*t))*.23*Math.sin(Math.PI*Math.min(1,t/duration));
  if(kind==='retreat')x=(lo*2+mid*.48)*Math.sin(Math.PI*p)*.65;
  if(kind==='wind')x=lo*1.9*(.7+.3*Math.sin(2*Math.PI*p));
  if(kind==='water')x=(mid*.38+hi*.08)*( .72+.28*Math.sin(2*Math.PI*p*3));
  if(kind==='forest')x=(hi*.18+mid*.27)*( .72+.28*Math.sin(2*Math.PI*p*5));
  if(ambient)x*=Math.min(1,p*40,(1-p)*40);
  a[i]=clamp(x,-.85,.85);
 }return a;
}
export class BattlefieldAudio{
 constructor(){this.settings={muted:false,fx:.65,ambient:.4};try{let x=JSON.parse(localStorage.getItem('bow-living-audio-v1')||'null');if(x)this.settings={muted:!!x.muted,fx:clamp(Number(x.fx)||0,0,1),ambient:clamp(Number(x.ambient)||0,0,1)}}catch{}this.ctx=null;this.voices=new Set();this.prior=new Map();this.last=null;this.counts={};this.loops=[];this.error=null;this.enabled=false}
 async unlock(){
  try{if(!this.ctx){let AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)throw Error('Web Audio unavailable');let c=this.ctx=new AC(),fx=this.fx=c.createGain(),amb=this.amb=c.createGain(),master=this.master=c.createGain(),lim=this.limiter=c.createDynamicsCompressor();lim.threshold.value=-16;lim.knee.value=12;lim.ratio.value=6;lim.attack.value=.004;lim.release.value=.15;fx.connect(master);amb.connect(master);master.connect(lim);lim.connect(c.destination);this.capture=c.createMediaStreamDestination();lim.connect(this.capture);this.buffers=new Map();for(let k of Object.keys(lengths))for(let i=0;i<(['wind','water','forest'].includes(k)?1:4);i++){let a=synth(k,i),b=c.createBuffer(1,a.length,24000);b.getChannelData(0).set(a);this.buffers.set(k+':'+i,b)}for(let k of ['wind','water','forest']){let source=c.createBufferSource(),gain=c.createGain();source.buffer=this.buffers.get(k+':0');source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(amb);source.start();this.loops.push({kind:k,source,gain})}}
   await this.ctx.resume();this.enabled=this.ctx.state==='running';this.apply();return this.enabled;
  }catch(e){this.error=String(e);return false}
 }
 apply(){if(!this.ctx)return;let t=this.ctx.currentTime;this.fx.gain.setTargetAtTime(this.settings.fx,t,.035);this.amb.gain.setTargetAtTime(this.settings.ambient,t,.035);this.master.gain.setTargetAtTime(this.settings.muted?0:.68,t,.025)}
 configure(values){Object.assign(this.settings,values);this.settings.fx=clamp(Number(this.settings.fx)||0,0,1);this.settings.ambient=clamp(Number(this.settings.ambient)||0,0,1);try{localStorage.setItem('bow-living-audio-v1',JSON.stringify(this.settings))}catch{}this.apply()}
 voice(e,speed=1){
  if(!this.enabled||this.settings.muted||this.voices.size>=16)return;let c=this.ctx,source=c.createBufferSource(),gain=c.createGain(),p=c.createStereoPanner?.();source.buffer=this.buffers.get(e.kind+':'+e.variant);source.playbackRate.value=Math.min(1.6,Math.sqrt(speed))*(.95+e.variant*.035);gain.gain.value=e.gain*(speed>1?1/Math.sqrt(speed):1);source.connect(gain);if(p){p.pan.value=e.pan;gain.connect(p);p.connect(this.fx)}else gain.connect(this.fx);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();p?.disconnect()};source.start();this.counts[e.kind]=(this.counts[e.kind]||0)+1;
 }
 reset(){this.prior.clear();this.last=null;for(let v of this.voices){try{v.stop()}catch{}}this.voices.clear()}
 update(F,s,cam,{active=true,playing=false,speed=1}={}){
  if(!this.enabled||!this.ctx)return;let now=this.ctx.currentTime,t=s.time,dt=this.last===null?0:t-this.last;if(!playing||dt<0||dt>Math.max(1.5,speed*.7)){if(this.last!==null)this.reset();dt=0}
  let q=F.sample(s.terrain,clamp(cam.x,0,F.W),clamp(cam.y,0,F.H)),river=s.terrain.hasRiver===false?Infinity:Math.abs(cam.x-F.riverX(s.terrain,cam.y)),amb={wind:.21,water:clamp(1-river/160,0,1)*.32,forest:(q.canopy||0)*.36};
  for(let l of this.loops)l.gain.gain.setTargetAtTime(active?(amb[l.kind]||0):0,now,.12);
  if(!active||!playing){this.last=null;return}
  if(dt>0||this.last===null){let r=soundEvents(F,s,cam,this.prior,dt);this.prior=r.next;if(dt>0)for(let e of r.events)this.voice(e,speed)}this.last=t;
 }
 status(){return {enabled:this.enabled,state:this.ctx?.state||'locked',settings:{...this.settings},voices:this.voices.size,counts:{...this.counts},error:this.error}}
}
