// Procedural acoustic identity: pressurized air, steel latch, ceramic impact.
export class AudioBus{
 constructor(){this.enabled=localStorage.getItem('pocket-works:portal-lab:sound')!=='off';this.ctx=null;this.active=0;}
 ensure(){if(!this.enabled)return null;try{this.ctx ||=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();return this.ctx;}catch{return null;}}
 set(on){this.enabled=on;try{localStorage.setItem('pocket-works:portal-lab:sound',on?'on':'off')}catch{}if(!on)this.ctx?.suspend();}
 noise(ctx,start,duration,frequency,q,gain){
  const count=Math.max(1,Math.floor(ctx.sampleRate*duration)),buf=ctx.createBuffer(1,count,ctx.sampleRate),data=buf.getChannelData(0);
  for(let i=0;i<count;i++)data[i]=(Math.random()*2-1)*(1-i/count);
  const node=ctx.createBufferSource();node.buffer=buf;
  const band=ctx.createBiquadFilter();band.type='bandpass';band.frequency.value=frequency;band.Q.value=q;
  const amp=ctx.createGain();amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+.009);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
  node.connect(band).connect(amp).connect(ctx.destination);node.start(start);node.stop(start+duration+.01);
 }
 tone(ctx,start,freq,duration,gain,type='triangle'){
  const o=ctx.createOscillator(),amp=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,start);
  o.frequency.exponentialRampToValueAtTime(freq*.65,start+duration);
  amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+.012);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
  o.connect(amp).connect(ctx.destination);o.start(start);o.stop(start+duration+.03);
 }
 play(kind,intensity=1){
  const c=this.ensure();if(!c)return;
  const t=c.currentTime+.004,variation=.97+Math.random()*.06;
  if(kind==='launch'){this.noise(c,t,.17,780*variation,1.1,.08);this.tone(c,t,160*variation,.14,.04,'sawtooth');}
  if(kind==='portal'){this.noise(c,t,.33,430*variation,.5,.09);this.noise(c,t+.05,.19,1750*variation,1.2,.038);this.tone(c,t,205*variation,.29,.026);}
  if(kind==='impact'){this.noise(c,t,.09,2400*variation,1.2,Math.min(.06,.011*intensity));this.tone(c,t,390*variation,.16,Math.min(.035,.007*intensity));}
  if(kind==='success'){this.noise(c,t,.35,930,.85,.046);for(let i=0;i<3;i++)this.tone(c,t+i*.065,[392,587,784][i],.3,.019);}
  if(kind==='fracture'){
   // Brittle edge-crack (high band), frame vibration (short low transient).
   this.noise(c,t,.095,2850*variation,1.9,.053);
   this.noise(c,t+.018,.13,790*variation,1.2,.021);
   this.tone(c,t,455*variation,.1,.025,'triangle');
  }
  if(kind==='mount'){this.noise(c,t,.13,1200,1.7,.044);this.tone(c,t,260,.12,.022);}
  if(kind==='error'){this.noise(c,t,.11,380,1.6,.036);}
 }
}
