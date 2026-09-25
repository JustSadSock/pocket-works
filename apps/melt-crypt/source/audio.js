export class CryptAudio {
  constructor(enabled = true) {
    this.enabled=Boolean(enabled);
    this.ctx=null;
    this.master=null;
    this.droneA=null;
    this.droneB=null;
    this.droneGain=null;
    this.filter=null;
    this.combatGain=null;
    this.combatOsc=null;
    this.noiseBuffer=null;
  }

  async ensure(){
    if(!this.enabled)return false;
    if(!this.ctx){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return false;
      const ctx=new AudioContext();

      const compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-16;
      compressor.knee.value=18;
      compressor.ratio.value=4;
      compressor.attack.value=0.004;
      compressor.release.value=0.16;

      const master=ctx.createGain();
      master.gain.value=0.19;
      master.connect(compressor).connect(ctx.destination);

      const filter=ctx.createBiquadFilter();
      filter.type='lowpass';filter.frequency.value=720;filter.Q.value=0.65;
      filter.connect(master);

      const droneGain=ctx.createGain();
      droneGain.gain.value=0.018;
      droneGain.connect(filter);

      const a=ctx.createOscillator(),b=ctx.createOscillator();
      a.type='sawtooth';b.type='triangle';
      a.frequency.value=41;b.frequency.value=61.5;b.detune.value=7;
      a.connect(droneGain);b.connect(droneGain);a.start();b.start();

      const lfo=ctx.createOscillator(),lfoGain=ctx.createGain();
      lfo.type='sine';lfo.frequency.value=0.075;lfoGain.gain.value=28;
      lfo.connect(lfoGain);lfoGain.connect(filter.frequency);lfo.start();

      const combatGain=ctx.createGain();
      combatGain.gain.value=0.0001;
      combatGain.connect(master);
      const combatOsc=ctx.createOscillator();
      combatOsc.type='triangle';combatOsc.frequency.value=73;
      combatOsc.connect(combatGain);combatOsc.start();

      const length=Math.floor(ctx.sampleRate*1.2);
      const noise=ctx.createBuffer(1,length,ctx.sampleRate);
      const data=noise.getChannelData(0);
      let last=0;
      for(let i=0;i<length;i+=1){
        const white=Math.random()*2-1;
        last=last*0.82+white*0.18;
        data[i]=white*0.58+last*0.42;
      }

      this.ctx=ctx;this.master=master;this.droneA=a;this.droneB=b;this.droneGain=droneGain;
      this.filter=filter;this.combatGain=combatGain;this.combatOsc=combatOsc;this.noiseBuffer=noise;
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
    return true;
  }

  setEnabled(value){
    this.enabled=Boolean(value);
    if(this.enabled)void this.ensure();
    if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.enabled?0.19:0.0001,this.ctx.currentTime,0.03);
  }

  setFloor(floor){
    if(!this.ctx||!this.droneA||!this.droneB)return;
    const now=this.ctx.currentTime;
    const root=37+(floor%5)*2.2;
    this.droneA.frequency.setTargetAtTime(root,now,0.7);
    this.droneB.frequency.setTargetAtTime(root*(1.46+(floor%3)*0.018),now,0.7);
    this.filter.frequency.setTargetAtTime(560+floor*10,now,0.7);
  }

  oneShotNoise(now,{duration=0.12,gain=0.08,lowpass=1800,highpass=40,attack=0.004}={}){
    if(!this.ctx||!this.master||!this.noiseBuffer)return;
    const src=this.ctx.createBufferSource();src.buffer=this.noiseBuffer;
    const hp=this.ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=highpass;
    const lp=this.ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=lowpass;
    const amp=this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001,now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001,gain),now+attack);
    amp.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    src.connect(hp).connect(lp).connect(amp).connect(this.master);
    src.start(now);src.stop(now+duration+0.02);
  }

  oscHit(now,{type='triangle',from=120,to=45,duration=0.12,gain=0.08,delay=0}={}){
    if(!this.ctx||!this.master)return;
    const start=now+delay;
    const osc=this.ctx.createOscillator(),amp=this.ctx.createGain(),lp=this.ctx.createBiquadFilter();
    osc.type=type;osc.frequency.setValueAtTime(Math.max(20,from),start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),start+duration);
    lp.type='lowpass';lp.frequency.value=Math.max(600,from*9);
    amp.gain.setValueAtTime(0.0001,start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001,gain),start+0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    osc.connect(lp).connect(amp).connect(this.master);
    osc.start(start);osc.stop(start+duration+0.03);
  }

  tone(kind='hit',strength=1){
    if(!this.enabled)return;
    void this.ensure().then((ok)=>{
      if(!ok||!this.ctx)return;
      const now=this.ctx.currentTime;
      const s=Math.max(0.2,Math.min(1.6,strength));
      if(kind==='swing'||kind==='heavy-swing'){
        const heavy=kind==='heavy-swing';
        this.oneShotNoise(now,{duration:heavy?0.23:0.13,gain:(heavy?0.13:0.075)*s,lowpass:heavy?1050:1800,highpass:heavy?60:130,attack:0.008});
        this.oscHit(now,{type:'sine',from:heavy?104:152,to:heavy?48:72,duration:heavy?0.2:0.11,gain:(heavy?0.055:0.025)*s});
      }else if(kind==='hit'){
        this.oneShotNoise(now,{duration:0.105,gain:0.13*s,lowpass:1150,highpass:45});
        this.oscHit(now,{type:'triangle',from:118,to:38,duration:0.11,gain:0.1*s});
      }else if(kind==='armor'){
        this.oneShotNoise(now,{duration:0.17,gain:0.1*s,lowpass:4200,highpass:850});
        this.oscHit(now,{type:'square',from:410,to:170,duration:0.08,gain:0.035*s});
      }else if(kind==='stagger'){
        this.oneShotNoise(now,{duration:0.18,gain:0.14*s,lowpass:760,highpass:35});
        this.oscHit(now,{type:'sine',from:82,to:28,duration:0.19,gain:0.13*s});
      }else if(kind==='death'){
        this.oneShotNoise(now,{duration:0.36,gain:0.11*s,lowpass:900,highpass:28});
        this.oscHit(now,{type:'sawtooth',from:92,to:24,duration:0.34,gain:0.075*s});
        this.oscHit(now,{type:'sine',from:54,to:25,duration:0.38,gain:0.09*s,delay:0.035});
      }else if(kind==='hurt'){
        this.oneShotNoise(now,{duration:0.14,gain:0.09*s,lowpass:780,highpass:45});
        this.oscHit(now,{type:'square',from:72,to:31,duration:0.16,gain:0.07*s});
      }else if(kind==='dash'){
        this.oneShotNoise(now,{duration:0.13,gain:0.07*s,lowpass:2400,highpass:300});
        this.oscHit(now,{type:'sine',from:170,to:64,duration:0.13,gain:0.035*s});
      }else if(kind==='parry'){
        this.oneShotNoise(now,{duration:0.18,gain:0.11*s,lowpass:5200,highpass:1200});
        this.oscHit(now,{type:'triangle',from:860,to:310,duration:0.13,gain:0.055*s});
      }else if(kind==='equip'||kind==='loot'){
        this.oscHit(now,{type:'triangle',from:260,to:610,duration:0.19,gain:0.055*s});
        this.oscHit(now,{type:'sine',from:390,to:760,duration:0.16,gain:0.03*s,delay:0.045});
      }else if(kind==='ready'){
        this.oneShotNoise(now,{duration:0.055,gain:0.025*s,lowpass:1700,highpass:320});
      }else if(kind==='gate'||kind==='clear'){
        this.oscHit(now,{type:'triangle',from:118,to:420,duration:0.34,gain:0.06*s});
        this.oneShotNoise(now,{duration:0.24,gain:0.05*s,lowpass:1500,highpass:100});
      }else if(kind==='cue'){
        this.oscHit(now,{type:'sawtooth',from:76,to:104,duration:0.22,gain:0.045*s});
        this.oneShotNoise(now,{duration:0.16,gain:0.04*s,lowpass:650,highpass:30});
      }else if(kind==='blink'){
        this.oscHit(now,{type:'triangle',from:620,to:210,duration:0.14,gain:0.06*s});
      }else if(kind==='shot'){
        this.oneShotNoise(now,{duration:0.11,gain:0.07*s,lowpass:1900,highpass:140});
        this.oscHit(now,{type:'square',from:230,to:82,duration:0.09,gain:0.06*s});
      }else if(kind==='drink'){
        this.oscHit(now,{type:'sine',from:280,to:108,duration:0.3,gain:0.055*s});
      }else{
        this.oscHit(now,{type:'triangle',from:180,to:72,duration:0.12,gain:0.05*s});
      }
    });
  }

  footstep(strength=1){
    if(!this.enabled)return;
    void this.ensure().then((ok)=>{
      if(!ok||!this.ctx)return;
      const now=this.ctx.currentTime;
      this.oneShotNoise(now,{duration:0.055,gain:0.025*strength,lowpass:420,highpass:28,attack:0.002});
      this.oscHit(now,{type:'sine',from:68,to:42,duration:0.045,gain:0.018*strength});
    });
  }

  encounterCue(kind='wave'){
    if(kind==='clear')this.tone('clear',1);
    else this.tone('cue',kind==='intro'?1:0.72);
  }

  setCombat(active){
    if(!this.ctx||!this.combatGain)return;
    const now=this.ctx.currentTime;
    this.combatGain.gain.setTargetAtTime(this.enabled&&active?0.015:0.0001,now,active?0.12:0.3);
    if(this.filter)this.filter.frequency.setTargetAtTime(active?860:620,now,0.2);
  }

  setDanger(value){
    if(!this.ctx||!this.droneGain||!this.filter)return;
    const now=this.ctx.currentTime,v=Math.min(1,value);
    this.droneGain.gain.setTargetAtTime(this.enabled?0.016+v*0.018:0.0001,now,0.16);
    this.filter.Q.setTargetAtTime(0.65+v*1.35,now,0.18);
    if(this.combatOsc)this.combatOsc.frequency.setTargetAtTime(70+v*18,now,0.12);
  }

  suspend(){if(this.ctx?.state==='running')void this.ctx.suspend();}
}
