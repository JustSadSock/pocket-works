export class AudioSystem{
  constructor(settings){this.settings=settings;this.ctx=null;this.master=null;this.ambientTimer=0;this.musicTimer=4;}
  unlock(){if(this.ctx)return;this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=(this.settings.masterVolume??.7);this.master.connect(this.ctx.destination);}
  tone(freq=220,duration=.08,type='square',gain=.05,channel='effects'){if(!this.ctx||!this.settings.sound)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=freq;const volume=channel==='ambience'?(this.settings.ambienceVolume??.6):channel==='music'?(this.settings.musicVolume??.45):channel==='creatures'?(this.settings.creaturesVolume??.7):(this.settings.effectsVolume??.7);g.gain.setValueAtTime(gain*volume,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+duration);o.connect(g);g.connect(this.master);o.start();o.stop(this.ctx.currentTime+duration);}
  step(surface){this.tone(surface===4?110:surface===3?145:190,.045,'triangle',.025);}
  break(id){this.tone(90+(id%9)*12,.11,'sawtooth',.045);}
  place(id){this.tone(170+(id%6)*18,.06,'square',.035);}
  pickup(){this.tone(520,.05,'sine',.04);setTimeout(()=>this.tone(720,.05,'sine',.03),40);}
  hurt(){this.tone(72,.18,'sawtooth',.07);}
  craft(){this.tone(330,.07,'triangle',.045);setTimeout(()=>this.tone(440,.08,'triangle',.04),70);}
  creature(type='passive'){this.tone(type==='hostile'?95:240,.18,type==='hostile'?'sawtooth':'triangle',.025,'creatures');}
  ambience(dt,biome,weather){if(!this.ctx||!this.settings.sound)return;this.musicTimer-=dt;if(this.musicTimer<=0){this.musicTimer=18+Math.random()*22;const base=biome===4?196:biome===7?147:220;[0,4,7].forEach((n,i)=>setTimeout(()=>this.tone(base*Math.pow(2,n/12),1.8,'sine',.012,'music'),i*620));}this.ambientTimer-=dt;if(this.ambientTimer>0)return;this.ambientTimer=4+Math.random()*8;const f=weather==='storm'?75:(biome===7?130:biome===1?260:190);this.tone(f,weather==='storm'?1.4:.8,weather==='storm'?'sawtooth':'sine',weather==='storm'?.018:.008,'ambience');}
}
