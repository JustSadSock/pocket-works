// WebAudio only: layered clockwork synthesis with a per-instance mute switch.
// All nodes are short-lived and disconnected on end. No third-party audio.
const sounds={
 jump:[['triangle',325,535,.16,.095],['sine',610,720,.09,.035]],
 reverse:[['square',280,164,.085,.042],['triangle',360,180,.17,.055]],
 push:[['sawtooth',137,68,.19,.084],['triangle',420,150,.115,.042]],
 spring:[['sine',340,930,.22,.087],['triangle',280,680,.15,.045]],
 land:[['triangle',104,51,.12,.072],['sine',170,81,.09,.025]],
 wall:[['square',115,65,.07,.05],['triangle',330,140,.12,.028]],
 gate:[['square',127,88,.13,.06],['triangle',260,110,.18,.037]],
 cargo:[['triangle',445,735,.18,.067],['sine',720,1140,.16,.045]],
 checkpoint:[['sine',610,810,.23,.052],['triangle',920,1230,.25,.041]],
 respawn:[['sine',470,195,.31,.05],['triangle',230,112,.23,.041]],
 hazard:[['sawtooth',190,75,.2,.063],['square',135,63,.14,.035]],
 finish:[['triangle',440,660,.25,.068],['sine',660,988,.35,.045],['triangle',880,1320,.49,.04]],
 magnet:[['sine',305,490,.16,.044],['triangle',570,715,.13,.026]],
 brake:[['triangle',215,105,.145,.046],['sine',115,70,.18,.032]],
 float:[['sine',490,760,.27,.044],['triangle',720,900,.19,.026]],
 stage:[['triangle',395,580,.12,.05],['sine',660,820,.16,.03]],
 series:[['triangle',410,640,.19,.061],['sine',580,920,.29,.057],['triangle',840,1220,.46,.045]],
 button:[['square',150,109,.055,.025]]
};
export function createSoundscape({audioContext=null}={}){
 let context=audioContext,enabled=true;
 const get=()=>{if(context)return context;const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Context)return null;context=new Context();return context;};
 function play(kind){
   if(!enabled||!sounds[kind])return false;
   try{
     const ac=get();if(!ac)return false;
     if(ac.state==='suspended')void ac.resume();
     const t=ac.currentTime;
     sounds[kind].forEach(([type,f0,f1,dur,vol],i)=>{
       const osc=ac.createOscillator(),gain=ac.createGain(),start=t+i*.019;
       osc.type=type;osc.frequency.setValueAtTime(f0,start);
       osc.frequency.exponentialRampToValueAtTime(Math.max(50,f1),start+dur);
       gain.gain.setValueAtTime(.0001,start);
       gain.gain.exponentialRampToValueAtTime(vol,start+.008);
       gain.gain.exponentialRampToValueAtTime(.0001,start+dur);
       osc.connect(gain);gain.connect(ac.destination);
       osc.onended=()=>{try{osc.disconnect();gain.disconnect();}catch{}};
       osc.start(start);osc.stop(start+dur+.012);
     });return true;
   }catch{return false;}
 }
 return {play,setMuted:v=>{enabled=!v;},isMuted:()=>!enabled,close:()=>{try{context?.close()}catch{}}};
}
