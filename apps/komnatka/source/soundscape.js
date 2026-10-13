// Authored tactile sound vocabulary for the miniature workshop.
// The same waveform is never reused for every action: wood, textile and ceramics
// use distinct transient, resonance and noise envelopes. No external audio assets.
export function createSoundscape(){
 let context=null,noise=null,muted=false,lastSound=-100; 
 function ctx(){
  const Ctor=window.AudioContext||window.webkitAudioContext;
  if(!Ctor)return null;
  context||=new Ctor();
  if(context.state==='suspended')context.resume().catch(()=>{});
  if(!noise){
   const length=context.sampleRate;
   noise=context.createBuffer(1,length,context.sampleRate);
   const data=noise.getChannelData(0);
   // Fixed reproducible grain so repeated actions remain consistent.
   let seed=0x942ae2;for(let i=0;i<length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)|0;
    data[i]=(seed/2147483648)*.65;
   }
  }
  return context;
 }
 function tone(c,t,frequency,length,level,shape='triangle',end=.62){
  const osc=c.createOscillator(),volume=c.createGain();
  osc.type=shape;osc.frequency.setValueAtTime(frequency,t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(35,frequency*end),t+length);
  volume.gain.setValueAtTime(.0001,t);
  volume.gain.exponentialRampToValueAtTime(level,t+.007);
  volume.gain.exponentialRampToValueAtTime(.0001,t+length);
  osc.connect(volume);volume.connect(c.destination);
  osc.start(t);osc.stop(t+length+.02);
 }
 function grain(c,t,length,level,low,high){
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),volume=c.createGain();
  source.buffer=noise;source.loop=true;
  filter.type='bandpass';filter.frequency.value=low;filter.Q.value=high;
  volume.gain.setValueAtTime(.0001,t);
  volume.gain.exponentialRampToValueAtTime(level,t+.012);
  volume.gain.exponentialRampToValueAtTime(.0001,t+length);
  source.connect(filter);filter.connect(volume);volume.connect(c.destination);
  source.start(t,(t*13)%0.45);source.stop(t+length+.01);
 }
 const cues={
  place(c,t){grain(c,t,.12,.065,500,.55);tone(c,t,103,.19,.065,'sine',.52);tone(c,t+.023,188,.12,.022,'triangle',.68);},
  wood(c,t){grain(c,t,.105,.052,470,.62);tone(c,t,138,.17,.052,'sine',.49);tone(c,t+.018,239,.10,.012,'triangle',.63);},
  fabric(c,t){grain(c,t,.19,.036,380,.58);tone(c,t,101,.21,.038,'sine',.54);grain(c,t+.042,.105,.014,740,.9);},
  ceramic(c,t){tone(c,t,602,.24,.019,'sine',.94);tone(c,t+.029,917,.19,.008,'sine',.91);grain(c,t,.055,.011,990,1.4);},
  paper(c,t){grain(c,t,.16,.035,1120,.67);tone(c,t+.025,240,.085,.010,'triangle',.77);},
  textile(c,t){grain(c,t,.24,.041,610,.5);grain(c,t+.055,.14,.019,1250,.74);},
  leaves(c,t){grain(c,t,.20,.028,840,.40);grain(c,t+.07,.12,.010,1740,.75);},
  rotate(c,t){grain(c,t,.085,.032,320,.9);tone(c,t,172,.10,.048,'triangle',.78);},
  lift(c,t){grain(c,t,.14,.039,340,.58);tone(c,t,125,.12,.026,'sine',1.24);},
  paint(c,t){grain(c,t,.19,.032,950,.52);tone(c,t,235,.14,.025,'triangle',.85);},
  glass(c,t){tone(c,t,730,.26,.025,'sine',.92);tone(c,t+.032,1095,.22,.009,'sine',.88);},
  delete(c,t){grain(c,t,.19,.053,380,.65);tone(c,t,145,.22,.046,'sine',.44);},
  blocked(c,t){tone(c,t,118,.13,.035,'triangle',.71);grain(c,t,.07,.018,290,.7);},
  select(c,t){grain(c,t,.055,.014,720,1.1);tone(c,t,290,.07,.021,'sine',.85);},
  undo(c,t){tone(c,t,270,.13,.025,'triangle',.66);grain(c,t,.055,.011,650,1.2);},
  light(c,t){tone(c,t,396,.17,.028,'sine',1.14);tone(c,t+.043,594,.20,.013,'sine',.97);}
 };
 return {
  play(name='select'){
   if(muted)return;
   try{
    const c=ctx();if(!c||!cues[name])return;
    // Cap transients during rapid interactions to avoid volume spikes.
    if(c.currentTime-lastSound<.035)return;
    lastSound=c.currentTime;
    cues[name](c,c.currentTime+.006);
   }catch{}
  },
  toggle(){muted=!muted;if(!muted)this.play('light');return !muted;},
  get muted(){return muted;},
  suspend(){if(context?.state==='running')context.suspend().catch(()=>{});}
 };
}
