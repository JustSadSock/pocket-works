// MEAT.EXE sound forge: steel pressure, wet muscle, brittle bone, hollow organs.
// Voices are finite, sounds are transient and audible only after a real input gesture.
const profiles={
  fire:{freq:123,tail:.13,noise:1120,edge:'sawtooth',loud:.23,bass:.22},
  shotgun:{freq:72,tail:.27,noise:500,edge:'sawtooth',loud:.32,bass:.36},
  hit:{freq:280,tail:.074,noise:1950,edge:'triangle',loud:.115,bass:.045},
  wall:{freq:91,tail:.095,noise:690,edge:'triangle',loud:.11,bass:.13},
  kill:{freq:65,tail:.2,noise:450,edge:'sawtooth',loud:.19,bass:.29},
  pain:{freq:77,tail:.26,noise:330,edge:'sawtooth',loud:.26,bass:.3},
  pickup:{freq:292,tail:.18,noise:880,edge:'triangle',loud:.14,bass:.12},
  heart:{freq:49,tail:.42,noise:340,edge:'sawtooth',loud:.3,bass:.33},
  dash:{freq:108,tail:.13,noise:820,edge:'triangle',loud:.12,bass:.17},
  switch:{freq:167,tail:.12,noise:1150,edge:'triangle',loud:.105,bass:.08},
  menu:{freq:135,tail:.075,noise:900,edge:'triangle',loud:.08,bass:.05}
};
const rests={fire:.065,shotgun:.19,hit:.045,wall:.09,kill:.085,pain:.18,heart:.34,dash:.17,menu:.06};
export function createCombatAudio(){
  let ctx=null,master=null,noise=null,enabled=true,active=0;
  const last=new Map();
  function unlock(){
    if(!enabled)return;
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      if(!ctx){
        ctx=new C();master=ctx.createGain();master.gain.value=.64;
        const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-25;compressor.knee.value=16;compressor.ratio.value=7;
        master.connect(compressor).connect(ctx.destination);
        noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.6),ctx.sampleRate);
        const samples=noise.getChannelData(0);let accumulator=0;
        for(let i=0;i<samples.length;i++){
          // A damp, uneven tearing texture. One buffer used by all short voices.
          const w=Math.random()*2-1;accumulator=accumulator*.2+w*.8;
          samples[i]=accumulator*.76;
        }
      }
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    }catch{ctx=null;}
  }
  function pulse(kind){
    if(!enabled||!ctx||ctx.state!=='running'||active>=9)return;
    const p=profiles[kind]||profiles.menu,now=ctx.currentTime;
    const rest=rests[kind]||.045;
    if(now-(last.get(kind)??-1e9)<rest)return;
    last.set(kind,now);active++;
    // Restrained 2–5% variations so repeated shots keep their weapon identity.
    const variation=.976+Math.random()*.048,tail=p.tail*(.967+Math.random()*.07);
    let finished=false;
    const done=()=>{if(!finished){finished=true;active=Math.max(0,active-1);}};
    try{
      const output=ctx.createGain();
      output.gain.setValueAtTime(.0001,now);
      output.gain.linearRampToValueAtTime(p.loud,now+.008);
      output.gain.exponentialRampToValueAtTime(.0001,now+tail);
      output.connect(master);
      const low=ctx.createOscillator(),lf=ctx.createBiquadFilter(),lg=ctx.createGain();
      low.type=p.edge;low.frequency.setValueAtTime(p.freq*variation,now);
      low.frequency.exponentialRampToValueAtTime(Math.max(26,p.freq*.36),now+tail*.78);
      lf.type='lowpass';lf.frequency.value=p.noise*.8;
      lg.gain.value=p.bass;
      low.connect(lf).connect(lg).connect(output);
      low.start(now);low.stop(now+tail+.02);
      const wet=ctx.createBufferSource(),band=ctx.createBiquadFilter(),wetGain=ctx.createGain();
      wet.buffer=noise;band.type=kind==='wall'?'highpass':'bandpass';
      band.frequency.value=p.noise*variation;band.Q.value=kind==='hit'?1.35:.65;
      wetGain.gain.value=kind==='pickup'?.37:.65;
      wet.connect(band).connect(wetGain).connect(output);
      wet.start(now,Math.random()*.18);wet.stop(now+tail+.02);
      low.onended=()=>{done();output.disconnect();};
    }catch{done();}
  }
  function setEnabled(next){enabled=Boolean(next);if(enabled)unlock();else ctx?.suspend?.().catch?.(()=>{});}
  function suspend(){ctx?.suspend?.().catch?.(()=>{});}
  return {unlock,pulse,setEnabled,suspend,isEnabled:()=>enabled};
}
