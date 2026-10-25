// Per-replica, non-destructive effects shared by the editor and movie export.
// Standard Web Audio only: no extra downloads, server processing, or mic upload.
// Each effect is an audible circuit, not a label-only preset.
export const VOICE_EFFECTS=Object.freeze([
 {id:'clean',label:'Без эффекта',category:'main'},
 {id:'radio',label:'Рация',category:'main'},
 {id:'robot',label:'Робот',category:'main'},
 {id:'echo',label:'Эхо',category:'main'},
 {id:'monster',label:'Монстр',category:'main'},
 {id:'phone',label:'Телефон',category:'color'},
 {id:'megaphone',label:'Мегафон',category:'color'},
 {id:'underwater',label:'Под водой',category:'color'},
 {id:'helmet',label:'Шлем',category:'color'},
 {id:'cassette',label:'Кассета',category:'color'},
 {id:'arcade',label:'8-бит',category:'color'},
 {id:'ghost',label:'Призрак',category:'fantasy'},
 {id:'alien',label:'Пришелец',category:'fantasy'},
 {id:'glitch',label:'Глитч',category:'fantasy'},
 {id:'hall',label:'Большой зал',category:'space'},
 {id:'chorus',label:'Хор',category:'space'},
 {id:'cosmos',label:'Космос',category:'space'}
]);
export const VOICE_EFFECT_GROUPS=Object.freeze([
 {id:'color',label:'Тембр и устройства'},
 {id:'fantasy',label:'Фантастика'},
 {id:'space',label:'Пространство'}
]);
const IDS=new Set(VOICE_EFFECTS.map(x=>x.id));
export const normalizeVoiceEffect=id=>IDS.has(id)?id:'clean';

const distortion=(ctx,amount,steps=0)=>{
 const node=ctx.createWaveShaper(),curve=new Float32Array(1024),k=amount;
 for(let i=0;i<curve.length;i++){
  const x=2*i/(curve.length-1)-1;
  curve[i]=steps?Math.round(x*steps)/steps:
   (3+k)*x*20*(Math.PI/180)/(Math.PI+k*Math.abs(x));
 }
 node.curve=curve;node.oversample='2x';
 return node;
};

/**
 * Connect one decoded voice to preview or premiere mix.
 * `when` is the AudioContext clock of the clip's first sample. LFOs therefore
 * have the same phase in preview and final export, and pause with AudioContext.
 * The returned cleanup releases sources, oscillators and feedback loops.
 */
export function connectVoiceEffect(ctx,input,output,id='clean',when=ctx.currentTime){
 const fx=normalizeVoiceEffect(id),nodes=[],oscillators=[];
 const own=node=>(nodes.push(node),node);
 const chain=(...items)=>{for(let i=0;i<items.length-1;i++)items[i].connect(items[i+1]);return items.at(-1)};
 const biquad=(kind,frequency,q)=>{
  const node=own(ctx.createBiquadFilter());node.type=kind;node.frequency.value=frequency;
  if(q!==undefined)node.Q.value=q;
  return node;
 };
 const gain=volume=>{const node=own(ctx.createGain());node.gain.value=volume;return node};
 const delay=seconds=>{
  const node=own(ctx.createDelay(Math.max(.5,seconds+.1)));
  node.delayTime.value=seconds;return node;
 };
 const shape=(strength,steps=0)=>own(distortion(ctx,strength,steps));
 const lfo=(parameter,frequency,depth,base,wave='sine')=>{
  const oscillator=own(ctx.createOscillator()),amp=gain(depth);
  parameter.value=base;
  oscillator.type=wave;oscillator.frequency.value=frequency;
  chain(oscillator,amp,parameter);
  oscillator.start(Math.max(ctx.currentTime,when));
  oscillators.push(oscillator);
 };
 const taps=(entries,dry=.82)=>{
  chain(input,gain(dry),output);
  for(const [seconds,level] of entries)chain(input,delay(seconds),gain(level),output);
 };
 if(fx==='radio'){
  chain(input,biquad('highpass',470),biquad('lowpass',2900),output);
 }else if(fx==='robot'){
  chain(input,biquad('bandpass',1200,.6),shape(14),output);
 }else if(fx==='monster'){
  chain(input,shape(25),biquad('lowpass',800),output);
 }else if(fx==='echo'){
  const d=delay(.18),feedback=gain(.25);
  chain(input,gain(.82),output);
  chain(input,d,gain(.38),output);
  chain(d,feedback,d);
 }else if(fx==='phone'){
  chain(input,biquad('highpass',660),biquad('lowpass',2300),biquad('peaking',1400,1.4),output);
 }else if(fx==='megaphone'){
  chain(input,biquad('highpass',370),shape(11),biquad('lowpass',3200),gain(.76),output);
 }else if(fx==='underwater'){
  const low=biquad('lowpass',620,1.2);
  chain(input,low,output);
  chain(low,delay(.09),gain(.18),output);
 }else if(fx==='helmet'){
  chain(input,biquad('bandpass',760,.85),shape(7),gain(.8),output);
  chain(input,biquad('lowpass',340),gain(.25),output);
 }else if(fx==='cassette'){
  const d=delay(.018);
  lfo(d.delayTime,.8,.004,.018);
  chain(input,biquad('highpass',125),biquad('lowpass',4200),shape(4),d,gain(.9),output);
 }else if(fx==='arcade'){
  chain(input,shape(0,7),biquad('lowpass',3400),gain(.8),output);
 }else if(fx==='ghost'){
  const wobble=gain(.63);
  lfo(wobble.gain,4.2,.31,.63);
  chain(input,wobble,output);
  chain(wobble,delay(.23),gain(.26),output);
 }else if(fx==='alien'){
  const ring=gain(.55);
  lfo(ring.gain,37,.42,.55);
  chain(input,biquad('bandpass',1450,.45),ring,shape(7),output);
 }else if(fx==='glitch'){
  const gate=gain(.54);
  lfo(gate.gain,11,.45,.54,'square');
  chain(input,shape(9),gate,output);
 }else if(fx==='hall'){
  taps([[.09,.3],[.21,.22],[.38,.16],[.6,.1]],.84);
 }else if(fx==='chorus'){
  chain(input,gain(.66),output);
  for(const [time,rate,depth,volume] of [[.026,.8,.007,.4],[.041,1.13,.009,.34]]){
   const d=delay(time);
   lfo(d.delayTime,rate,depth,time);
   chain(input,d,gain(volume),output);
  }
 }else if(fx==='cosmos'){
  const d=delay(.34),regen=gain(.23),wet=gain(.46);
  chain(input,gain(.78),output);
  chain(input,biquad('lowpass',2900),d,wet,output);
  chain(d,regen,d);
  const pulse=gain(.8);
  lfo(pulse.gain,.9,.18,.8);
  chain(input,biquad('highpass',600),pulse,gain(.22),output);
 }else input.connect(output);
 let removed=false;
 return ()=>{
  if(removed)return;removed=true;
  for(const oscillator of oscillators)try{oscillator.stop()}catch{}
  try{input.disconnect()}catch{}
  for(const node of nodes)try{node.disconnect()}catch{}
 };
}
