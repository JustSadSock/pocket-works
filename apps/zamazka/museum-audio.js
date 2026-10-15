// ZAMAZKA · original, offline foley for a conservation atelier.
// Bristles, timber, paper and ceramic: separate attacks, noise filtering and decays.
export const MUSEUM_SOUND_EVENTS=Object.freeze(['press','frame','paper','tool','brush','fill','token','undo','confirm','reveal','door','warning','final-warning','clock-tick','time-up','error']);
const cooldown={press:44,frame:100,paper:65,tool:75,brush:95,fill:125,token:55,undo:90,confirm:190,reveal:230,door:520,warning:450,'final-warning':450,'clock-tick':650,'time-up':1400,error:190};
const vary=(n,range=.036)=>n*(1+(Math.random()*2-1)*range);
export class MuseumAudio{
 constructor(enabled=true){
  this.enabled=Boolean(enabled);this.volume=0.55;this.context=null;this.previous=new Map();this.ends=[];
  this.onVisibility=()=>{if(document.hidden&&this.context?.state==='running')void this.context.suspend().catch(()=>{})};
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.onVisibility);
 }
 setEnabled(enabled){
  this.enabled=Boolean(enabled);
  if(this.master&&this.context)this.master.gain.setTargetAtTime(this.enabled?.48*this.volume:.0001,this.context.currentTime,.025);
 }
 setVolume(value){
  this.volume=Math.max(0,Math.min(1,Number(value)||0));
  if(this.master&&this.context)this.master.gain.setTargetAtTime(this.enabled?.48*this.volume:.0001,this.context.currentTime,.035);
 }
 ensure(gesture){
  if(!this.context){
   if(!gesture)return false; // Only create the audio context in response to a player gesture.
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return false;
   const ac=new C({latencyHint:'interactive'});this.context=ac;
   this.master=ac.createGain();this.master.gain.value=this.enabled?.48*this.volume:.0001;this.master.connect(ac.destination);
   const b=ac.createBuffer(1,Math.ceil(ac.sampleRate*.43),ac.sampleRate),d=b.getChannelData(0);let seed=0x749a21;
   for(let i=0;i<d.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;d[i]=(seed/2147483648-1)*.88}
   this.noise=b;
  }
  if(this.context.state==='closed')return false;
  if(this.context.state==='suspended'&&gesture)void this.context.resume().catch(()=>{});
  return true;
 }
 grain(t,d,f,g,q=.7){
  const a=this.context,x=a.createBufferSource(),p=a.createBiquadFilter(),v=a.createGain();
  x.buffer=this.noise;x.playbackRate.value=vary(1,.025);
  p.type='bandpass';p.frequency.setValueAtTime(vary(f),t);p.Q.value=q;
  v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(vary(g,.06),t+Math.min(.018,d*.22));v.gain.exponentialRampToValueAtTime(.0001,t+d);
  x.connect(p).connect(v).connect(this.master);x.start(t);x.stop(t+d+.007);
 }
 // A pitched overtone is always accompanied by physical grain, never a generic beep.
 ring(t,f,d,g,type='triangle'){
  const a=this.context,x=a.createOscillator(),v=a.createGain();
  x.type=type;x.frequency.setValueAtTime(vary(f,.025),t);x.frequency.exponentialRampToValueAtTime(f*.84,t+d);
  v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(g,t+.009);v.gain.exponentialRampToValueAtTime(.0001,t+d);
  x.connect(v).connect(this.master);x.start(t);x.stop(t+d+.009);
 }
 play(kind='press',gesture=false){
  if(!this.enabled||!(kind in cooldown)||(typeof document!=='undefined'&&document.hidden))return false;
  try{
   if(!this.ensure(gesture))return false;
   const t=this.context.currentTime,prev=this.previous.get(kind)??-100;
   if((t-prev)*1000<cooldown[kind])return false;
   this.ends=this.ends.filter(end=>end>t);if(this.ends.length>=7&&kind!=='time-up')return false;
   this.previous.set(kind,t);this.ends.push(t+.5);
   const at=t+.007;
   switch(kind){
    case 'door':this.grain(at,.33,260,.053,.28);this.grain(at+.12,.19,105,.047,.48);this.ring(at+.13,118,.23,.021);break;
    case 'frame':this.grain(at,.19,490,.076,.48);this.grain(at+.12,.07,200,.046,.85);this.ring(at+.13,173,.085,.033);break;
    case 'paper':this.grain(at,.17,1150,.068,.38);this.grain(at+.07,.11,1920,.037,.51);break;
    case 'tool':this.grain(at,.06,680,.073,1.15);this.ring(at+.008,264,.07,.023);break;
    case 'brush':this.grain(at,.13,1600,.071,.4);this.grain(at+.028,.09,520,.042,.72);break;
    case 'fill':this.grain(at,.16,460,.065,.45);this.ring(at+.045,220,.11,.033);break;
    case 'token':this.grain(at,.038,2800,.047,2.4);this.ring(at+.005,870,.115,.027,'sine');break;
    case 'undo':this.grain(at,.11,950,.055,.54);this.ring(at,196,.09,.022);break;
    case 'confirm':this.grain(at,.095,470,.096,.72);this.ring(at,158,.22,.047);this.ring(at+.034,485,.18,.018,'sine');break;
    case 'reveal':this.grain(at,.28,820,.074,.43);this.ring(at+.13,650,.32,.020,'sine');this.ring(at+.15,980,.26,.011,'sine');break;
    // A mechanical second-hand click, low-pitched and dry. No alarm or shake.
    case 'clock-tick':this.grain(at,.049,1420,.074,1.2);this.ring(at+.003,560,.067,.030,'triangle');this.grain(at+.09,.033,880,.034,1.4);break;
    case 'warning':this.grain(at,.06,430,.068,.67);this.ring(at,270,.08,.033);break;
    case 'final-warning':this.grain(at,.11,600,.091,.8);this.ring(at,380,.22,.065);this.ring(at+.12,540,.18,.046);this.grain(at+.24,.11,470,.067,.74);break;
     case 'time-up':this.grain(at,.17,920,.09,.55);this.ring(at,560,.72,.085);this.ring(at+.13,705,.56,.070);this.ring(at+.31,840,.85,.064);this.grain(at+.55,.2,510,.082,.63);break;
    case 'error':this.grain(at,.13,290,.077,.63);this.ring(at,112,.15,.035);break;
    default:this.grain(at,.045,1000,.05,.9);this.ring(at+.004,308,.058,.015);
   }
   return true;
  }catch{return false} // The game stays operational on browsers that block Web Audio.
 }
 dispose(){
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.onVisibility);
  if(this.context&&this.context.state!=='closed')void this.context.close().catch(()=>{});
 }
}
