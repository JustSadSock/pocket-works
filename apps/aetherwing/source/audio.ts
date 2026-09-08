import type { FlightState } from './core';

export class FlightAudio{
  private ctx?:AudioContext; private master?:GainNode; private wind?:GainNode; private windFilter?:BiquadFilterNode; private rumble?:GainNode; private wingPhase=0; private started=false; private muted=false;
  get isMuted(){return this.muted;}
  setMuted(muted:boolean){
    this.muted=muted;
    if(this.ctx&&this.master)this.master.gain.setTargetAtTime(muted?0:.7,this.ctx.currentTime,.035);
  }
  async start(){
    if(this.started){try{await this.ctx?.resume();}catch{/* audio is optional; gameplay must continue */}return;}
    const Ctx=window.AudioContext||(window as any).webkitAudioContext; if(!Ctx)return;
    try{
      const ctx=new Ctx();this.ctx=ctx;
      const master=ctx.createGain();master.gain.value=this.muted?0:.7;master.connect(ctx.destination);this.master=master;
      const seconds=5;const buffer=ctx.createBuffer(1,ctx.sampleRate*seconds,ctx.sampleRate);const d=buffer.getChannelData(0);
      let last=0;for(let i=0;i<d.length;i++){const white=Math.random()*2-1;last=last*.985+white*.18;d[i]=last*.78+white*.22;}
      const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=900;f.Q.value=.5;
      const wg=ctx.createGain();wg.gain.value=.08;noise.connect(f).connect(wg).connect(master);noise.start();this.wind=wg;this.windFilter=f;
      const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=37;const rg=ctx.createGain();rg.gain.value=.015;osc.connect(rg).connect(master);osc.start();this.rumble=rg;
      this.started=true;
    }catch{
      this.ctx=undefined;this.master=undefined;this.wind=undefined;this.windFilter=undefined;this.rumble=undefined;this.started=false;
    }
  }
  update(s:FlightState,dt:number){if(!this.ctx||!this.wind||!this.windFilter||!this.rumble)return;const now=this.ctx.currentTime;const speedN=Math.max(0,Math.min(1,(s.speed-12)/70));this.wind.gain.setTargetAtTime(.045+speedN*.26+(s.mode==='dive'?0.08:0),now,.12);this.windFilter.frequency.setTargetAtTime(520+speedN*1900,now,.15);this.rumble.gain.setTargetAtTime(.008+s.load*.012+s.flap*.012,now,.12);const prev=this.wingPhase;this.wingPhase=s.flapPhase;if(prev>this.wingPhase&&s.flap>.35)this.wingThump(.45+s.flap*.55);}
  private wingThump(power:number){if(!this.ctx||!this.master||this.muted)return;const ctx=this.ctx,now=ctx.currentTime;const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();osc.type='sine';osc.frequency.setValueAtTime(72,now);osc.frequency.exponentialRampToValueAtTime(32,now+.22);filter.type='lowpass';filter.frequency.value=180;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.12*power,now+.018);gain.gain.exponentialRampToValueAtTime(.0001,now+.28);osc.connect(filter).connect(gain).connect(this.master);osc.start(now);osc.stop(now+.3);}
}
