// ЗАМАЗКА · offline procedural atelier audio.
// Clockmaker + mechanical ticking + wooden coin selected for 1.40.3.
// All cues follow the one global user sound switch and master volume.
export const MUSEUM_SOUND_EVENTS=Object.freeze([
 'press','frame','paper','tool','brush','fill','token','undo','confirm','reveal','door',
 'warning','final-warning','clock-tick','watch-warning','watch-five','time-up','error'
]);
const cooldown={press:44,frame:100,paper:65,tool:75,brush:95,fill:125,token:55,undo:90,
 confirm:190,reveal:230,door:520,warning:450,'final-warning':450,'clock-tick':650,
 'watch-warning':1500,'watch-five':1500,'time-up':1500,error:190};
const vary=(n,range=.036)=>n*(1+(Math.random()*2-1)*range);
export class MuseumAudio{
 constructor(enabled=true){
  this.enabled=Boolean(enabled);this.volume=.55;this.context=null;
  this.previous=new Map();this.ends=[];this.clock=null;
  this.onVisibility=()=>{
   if(typeof document!=='undefined'&&document.hidden){
    this.stopCountdown();
    if(this.context?.state==='running')void this.context.suspend().catch(()=>{});
   }
  };
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.onVisibility);
 }
 setEnabled(enabled){
  this.enabled=Boolean(enabled);
  if(!this.enabled)this.stopCountdown();
  if(this.master&&this.context)
   this.master.gain.setTargetAtTime(this.enabled?.48*this.volume:.0001,this.context.currentTime,.025);
 }
 setVolume(value){
  this.volume=Math.max(0,Math.min(1,Number(value)||0));
  if(this.master&&this.context)
   this.master.gain.setTargetAtTime(this.enabled?.48*this.volume:.0001,this.context.currentTime,.035);
 }
 ensure(gesture){
  if(!this.context){
   if(!gesture)return false; // Browsers require a direct user gesture to unlock Web Audio.
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return false;
   const ac=new C({latencyHint:'interactive'});this.context=ac;
   this.master=ac.createGain();this.master.gain.value=this.enabled?.48*this.volume:.0001;
   this.master.connect(ac.destination);
   const b=ac.createBuffer(1,Math.ceil(ac.sampleRate*.43),ac.sampleRate),d=b.getChannelData(0);
   let seed=0x749a21;
   for(let i=0;i<d.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;d[i]=(seed/2147483648-1)*.88;
   }
   this.noise=b;
  }
  if(this.context.state==='closed')return false;
  if(this.context.state==='suspended'){
   if(gesture)void this.context.resume().catch(()=>{});
   else return false;
  }
  return true;
 }
 grain(t,d,f,g,q=.7,destination=this.master){
  const a=this.context,x=a.createBufferSource(),p=a.createBiquadFilter(),v=a.createGain();
  x.buffer=this.noise;x.playbackRate.value=vary(1,.025);
  p.type='bandpass';p.frequency.setValueAtTime(vary(f),t);p.Q.value=q;
  v.gain.setValueAtTime(.0001,t);
  v.gain.exponentialRampToValueAtTime(vary(g,.06),t+Math.min(.018,d*.22));
  v.gain.exponentialRampToValueAtTime(.0001,t+d);
  x.connect(p).connect(v).connect(destination);x.start(t);x.stop(t+d+.007);
 }
 ring(t,f,d,g,type='triangle',destination=this.master){
  const a=this.context,x=a.createOscillator(),v=a.createGain();
  x.type=type;x.frequency.setValueAtTime(vary(f,.025),t);
  x.frequency.exponentialRampToValueAtTime(f*.84,t+d);
  v.gain.setValueAtTime(.0001,t);
  v.gain.exponentialRampToValueAtTime(g,t+.009);
  v.gain.exponentialRampToValueAtTime(.0001,t+d);
  x.connect(v).connect(destination);x.start(t);x.stop(t+d+.009);
 }
 chime(t,f,d,g){
  // Detuned metal harmonics: bell-like, not a synthesized telephone tone.
  this.ring(t,f,d,g,'sine');
  this.ring(t+.003,f*2.008,d*.67,g*.27,'triangle');
  this.ring(t+.006,f*3.014,d*.43,g*.12,'sine');
 }
 clockBeat(t,tock,bus){
  // Dry steel escapement alternating with a muted wooden return.
  this.grain(t,tock?.042:.029,tock?740:1900,tock?.084:.095,tock?.62:1.45,bus);
  this.ring(t+.003,tock?310:540,tock?.075:.055,tock?.012:.017,'sine',bus);
 }
 duckCountdown(at,seconds){
  if(!this.clock)return;
  const gain=this.clock.bus.gain;
  this.clock.duckUntil=Date.now()+seconds*1000;
  gain.cancelScheduledValues(at);
  gain.setValueAtTime(gain.value,at);
  gain.setTargetAtTime(.10,at,.035);
  gain.setTargetAtTime(.32,at+seconds,.13);
 }
 stopCountdown(fade=.08){
  const clock=this.clock;this.clock=null;
  if(!clock||!this.context)return;
  const t=this.context.currentTime,gain=clock.bus.gain;
  gain.cancelScheduledValues(t);
  gain.setTargetAtTime(.0001,t,Math.max(.018,fade)/3);
  // Pre-scheduled clicks fade naturally, without abrupt audio discontinuities.
  if(typeof setTimeout==='function')setTimeout(()=>{try{clock.bus.disconnect()}catch{}},1800);
 }
 // Reconcile a 500ms mechanical beat with the authoritative deadline.
 // The audio lookahead stays smooth even if UI / PocketNet ticks jitter.
 syncCountdown(key,deadlineMs,nowMs=Date.now()){
  if(!this.enabled||typeof document!=='undefined'&&document.hidden||
     !Number.isFinite(deadlineMs)||!Number.isFinite(nowMs)||
     nowMs>=deadlineMs||nowMs<deadlineMs-15500){
   this.stopCountdown();return false;
  }
  if(!this.ensure(false))return false;
  if(!this.clock||this.clock.key!==key||this.clock.deadline!==deadlineMs){
   this.stopCountdown();
   const bus=this.context.createGain();
   bus.gain.value=.0001;bus.connect(this.master);
   bus.gain.setTargetAtTime(.23,this.context.currentTime,.08);
   this.clock={key,deadline:deadlineMs,bus,next:deadlineMs-15000,duckUntil:0};
  }
  const clock=this.clock,start=deadlineMs-15000;
  // Progressive tension: 23% at -15 s → 57% at 0. The clock's own
  // gain rises independently from the Clockmaker alarm gain and sound setting.
  const progress=Math.max(0,Math.min(1,(15000-(deadlineMs-nowMs))/15000));
  const level=.23+.34*progress;
  if(nowMs>=clock.duckUntil)clock.bus.gain.setTargetAtTime(level,this.context.currentTime,.16);
  if(clock.next<nowMs-500)clock.next=start+Math.ceil((nowMs-500-start)/500)*500;
  const horizon=Math.min(deadlineMs-30,nowMs+1050);
  let count=0;
  while(clock.next<=horizon&&count++<5){
   if(clock.next>=nowMs-55){
    const t=this.context.currentTime+Math.max(.008,(clock.next-nowMs)/1000);
    const step=Math.round((clock.next-start)/500);
    this.clockBeat(t,Boolean(step%2),clock.bus);
   }
   clock.next+=500;
  }
  return true;
 }
 play(kind='press',gesture=false){
  if(!this.enabled||!(kind in cooldown)||
     typeof document!=='undefined'&&document.hidden)return false;
  try{
   if(!this.ensure(gesture))return false;
   const t=this.context.currentTime,prev=this.previous.get(kind)??-100;
   if((t-prev)*1000<cooldown[kind])return false;
   this.ends=this.ends.filter(end=>end>t);
   if(this.ends.length>=7&&!['watch-warning','watch-five','time-up'].includes(kind))return false;
   this.previous.set(kind,t);this.ends.push(t+.5);
   if(kind==='watch-warning')this.duckCountdown(t,1.0);
   if(kind==='watch-five')this.duckCountdown(t,1.8);
   if(kind==='time-up')this.stopCountdown(.15);
   const at=t+.007;
   switch(kind){
    case 'door':this.grain(at,.33,260,.053,.28);this.grain(at+.12,.19,105,.047,.48);this.ring(at+.13,118,.23,.021);break;
    case 'frame':this.grain(at,.19,490,.076,.48);this.grain(at+.12,.07,200,.046,.85);this.ring(at+.13,173,.085,.033);break;
    case 'paper':this.grain(at,.17,1150,.068,.38);this.grain(at+.07,.11,1920,.037,.51);break;
    case 'tool':this.grain(at,.06,680,.073,1.15);this.ring(at+.008,264,.07,.023);break;
    case 'brush':this.grain(at,.13,1600,.071,.4);this.grain(at+.028,.09,520,.042,.72);break;
    case 'fill':this.grain(at,.16,460,.065,.45);this.ring(at+.045,220,.11,.033);break;
    // The user's selected "coin on wooden table": dry woody knock plus a short metal wobble.
    case 'token':
     this.grain(at,.05,780,.095,.45);
     this.grain(at+.016,.075,1200,.047,.75);
     this.ring(at+.012,1460,.28,.038,'sine');
     this.ring(at+.076,1080,.21,.020,'sine');
     break;
    case 'undo':this.grain(at,.11,950,.055,.54);this.ring(at,196,.09,.022);break;
    case 'confirm':this.grain(at,.095,470,.096,.72);this.ring(at,158,.22,.047);this.ring(at+.034,485,.18,.018,'sine');break;
    case 'reveal':this.grain(at,.28,820,.074,.43);this.ring(at+.13,650,.32,.020,'sine');this.ring(at+.15,980,.26,.011,'sine');break;
    case 'clock-tick':this.clockBeat(at,false,this.master);break;
    // Clockmaker A: short mechanical tap and a small metallic watch chime.
    case 'watch-warning':
     this.grain(at,.045,1620,.070,1.1);
     this.grain(at+.11,.047,530,.041,.7);
     this.chime(at+.14,740,.69,.12);break;
    case 'watch-five':
     this.grain(at,.055,1620,.075,1.0);
     this.chime(at+.10,630,1.22,.14);
     this.grain(at+.39,.04,1270,.049,.9);
     this.chime(at+.48,840,1.04,.13);break;
    case 'time-up':
     this.grain(at,.065,660,.088,.65);
     this.chime(at,510,2.40,.20);
     this.chime(at+.29,640,2.10,.16);
     this.chime(at+.59,765,1.90,.13);break;
    // Legacy effects remain valid but are no longer emitted by a countdown.
    case 'warning':this.grain(at,.06,430,.068,.67);this.ring(at,270,.08,.033);break;
    case 'final-warning':this.grain(at,.11,600,.091,.8);this.ring(at,380,.22,.065);break;
    case 'error':this.grain(at,.13,290,.077,.63);this.ring(at,112,.15,.035);break;
    default:this.grain(at,.045,1000,.05,.9);this.ring(at+.004,308,.058,.015);
   }
   return true;
  }catch{return false} // Game stays playable when Web Audio is unavailable.
 }
 dispose(){
  this.stopCountdown();
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.onVisibility);
  if(this.context&&this.context.state!=='closed')void this.context.close().catch(()=>{});
 }
}
