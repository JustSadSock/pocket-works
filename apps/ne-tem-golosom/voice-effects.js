// Lightweight per-replica voice processing for preview and final premiere.
// Web Audio nodes run in real time. Audio blobs remain untouched so presets
// are non-destructive and survive reloads/reconnects.
export const VOICE_EFFECTS=Object.freeze([
 {id:'clean',label:'Без эффекта'},
 {id:'radio',label:'Рация'},
 {id:'robot',label:'Робот'},
 {id:'echo',label:'Эхо'},
 {id:'monster',label:'Монстр'}
]);
const IDS=new Set(VOICE_EFFECTS.map(x=>x.id));
export const normalizeVoiceEffect=value=>IDS.has(value)?value:'clean';
const distortion=(ctx,amount)=>{
 const node=ctx.createWaveShaper(),n=256,curve=new Float32Array(n),k=amount;
 for(let i=0;i<n;i++){const x=2*i/(n-1)-1;curve[i]=(3+k)*x*20/(Math.PI+k*Math.abs(x))}
 node.curve=curve;node.oversample='2x';return node;
};
// Returns reusable cleanup for effects with feedback paths.
export function connectVoiceEffect(ctx,input,output,id='clean'){
 const fx=normalizeVoiceEffect(id),nodes=[],add=node=>(nodes.push(node),node);
 const link=(...chain)=>{for(let i=0;i<chain.length-1;i++)chain[i].connect(chain[i+1])};
 if(fx==='radio'){
  const high=add(ctx.createBiquadFilter()),low=add(ctx.createBiquadFilter());
  high.type='highpass';high.frequency.value=470;
  low.type='lowpass';low.frequency.value=2900;
  link(input,high,low,output);
 }else if(fx==='robot'){
  const band=add(ctx.createBiquadFilter()),shape=add(distortion(ctx,14));
  band.type='bandpass';band.frequency.value=1200;band.Q.value=.6;
  link(input,band,shape,output);
 }else if(fx==='monster'){
  const low=add(ctx.createBiquadFilter()),shape=add(distortion(ctx,25));
  low.type='lowpass';low.frequency.value=800;
  link(input,shape,low,output);
 }else if(fx==='echo'){
  const delay=add(ctx.createDelay(.6)),feedback=add(ctx.createGain()),wet=add(ctx.createGain()),dry=add(ctx.createGain());
  delay.delayTime.value=.18;feedback.gain.value=.25;
  wet.gain.value=.38;dry.gain.value=.82;
  input.connect(dry).connect(output);
  input.connect(delay).connect(wet).connect(output);
  delay.connect(feedback).connect(delay);
 }else input.connect(output);
 return ()=>{
  try{input.disconnect()}catch{}
  for(const node of nodes)try{node.disconnect()}catch{}
 };
}
