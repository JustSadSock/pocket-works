// ЛЕНТА: dependency-free musical instruments, same synthesis in live and offline render.
export const STEPS=64;
export const INSTRUMENTS=[
 {id:'keys',name:'Клавиши',sub:'МЕЛОДИЯ',labels:['До','Ре','Ми','Фа','Соль','Ля','Си','До+']},
 {id:'bass',name:'Бас',sub:'НИЗКИЕ ЧАСТОТЫ',labels:['До','Ре','Ми','Фа','Соль','Ля','Си','До+']},
 {id:'drums',name:'Ударные',sub:'РИТМ',labels:['Бочка','Малый','Хэт','Хлопок','Том','Рим','Шейкер','Крэш']},
 {id:'lead',name:'Синт',sub:'СОЛО',labels:['До','Ре','Ми','Фа','Соль','Ля','Си','До+']},
 {id:'bell',name:'Колокола',sub:'ЗВОН',labels:['До','Ре','Ми','Фа','Соль','Ля','Си','До+']}
];
export const stepMs=bpm=>60000/Math.max(60,Math.min(180,bpm))/4;
export const loopMs=bpm=>STEPS*stepMs(bpm);
let liveCtx;
const noiseCache=new WeakMap();
export async function unlockAudio(){
 if(!liveCtx)liveCtx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
 if(liveCtx.state!=='running')await liveCtx.resume();
 return liveCtx;
}
export function audioContext(){return liveCtx}
const hz=(inst,pitch)=>{const semis=[0,2,4,5,7,9,11,12];return 440*Math.pow(2,((inst==='bass'?36:60)+semis[pitch]-69)/12)};
function envelope(ctx,time,gain,peak,hold,release){
 gain.gain.setValueAtTime(0.0001,time);
 gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak),time+0.008);
 gain.gain.setTargetAtTime(0.0001,time+hold,release);
}
function oscillator(ctx,type,frequency,dest,time,stop,volume=1,detune=0){
 const o=ctx.createOscillator(),g=ctx.createGain();
 o.type=type;o.frequency.setValueAtTime(frequency,time);o.detune.value=detune;
 g.gain.value=volume;o.connect(g).connect(dest);o.start(time);o.stop(stop);return o;
}
function noise(ctx){
 let b=noiseCache.get(ctx);if(b)return b;
 const length=ctx.sampleRate*2;b=ctx.createBuffer(1,length,ctx.sampleRate);
 const d=b.getChannelData(0);let seed=312417;
 for(let i=0;i<length;i++){seed=(seed*1664525+1013904223)>>>0;d[i]=(seed/2147483648-1)*0.88}
 noiseCache.set(ctx,b);return b;
}
function noiseShot(ctx,time,life,filterFreq,kind,amp){
 const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),vca=ctx.createGain();
 src.buffer=noise(ctx);filter.type=kind;filter.frequency.value=filterFreq;
 vca.gain.setValueAtTime(Math.max(0.001,amp),time);
 vca.gain.exponentialRampToValueAtTime(0.0001,time+life);
 src.connect(filter).connect(vca).connect(ctx.destination);src.start(time);src.stop(time+life+0.01);
}
function drum(ctx,pad,when,velocity){
 const scale=Math.max(0.1,Math.min(1,velocity));
 if(pad===0||pad===4||pad===5){
  const length=pad===0?.50:pad===4?.34:.19;
  const out=ctx.createGain(),o=ctx.createOscillator();
  o.type=pad===5?'triangle':'sine';
  o.frequency.setValueAtTime(pad===0?155:pad===4?225:650,when);
  o.frequency.exponentialRampToValueAtTime(pad===0?44:pad===4?90:220,when+length);
  envelope(ctx,when,out,scale*(pad===0?.8:.32),.01,.095);
  out.connect(ctx.destination);o.connect(out);o.start(when);o.stop(when+length+.02);
  if(pad===5)noiseShot(ctx,when,.08,1900,'highpass',scale*.2);
 }else if(pad===1){noiseShot(ctx,when,.23,1500,'highpass',scale*.45);noiseShot(ctx,when,.08,550,'lowpass',scale*.15)}
 else if(pad===2){noiseShot(ctx,when,.105,7700,'highpass',scale*.26)}
 else if(pad===3){for(const dt of [0,.03,.068])noiseShot(ctx,when+dt,.095,1100,'bandpass',scale*.3)}
 else if(pad===6){for(const dt of [0,.04,.08])noiseShot(ctx,when+dt,.065,4800,'highpass',scale*.18)}
 else if(pad===7){noiseShot(ctx,when,.92,4300,'highpass',scale*.34)}
 return {release(){}};
}
/** Returns a release handle for live keyboard notes; notes in clips use a finite duration. */
export function playNote(ctx,inst,pitch,when=ctx.currentTime,seconds=.28,velocity=.8){
 if(!ctx||!INSTRUMENTS.some(i=>i.id===inst)||!Number.isInteger(pitch)||pitch<0||pitch>7)return {release(){}};
 when=Math.max(when,ctx.currentTime);velocity=Math.max(.05,Math.min(1,velocity));
 if(inst==='drums')return drum(ctx,pitch,when,velocity);
 const freq=hz(inst,pitch),out=ctx.createGain(),filter=ctx.createBiquadFilter();
 const sustain=Math.max(.07,Math.min(4,seconds)),end=when+sustain+.3;
 filter.type='lowpass';filter.frequency.setValueAtTime(inst==='bass'?750:inst==='lead'?4400:inst==='bell'?6000:2600,when);
 if(inst==='bass')filter.frequency.exponentialRampToValueAtTime(260,when+.23);
 envelope(ctx,when,out,(inst==='bass'?.32:inst==='bell'?.24:inst==='lead'?.14:.18)*velocity,inst==='bell'?.11:sustain,inst==='bell'?.5:inst==='bass'?.12:.16);
 out.connect(ctx.destination);filter.connect(out);
 const os=[];
 if(inst==='keys'){os.push(oscillator(ctx,'triangle',freq,filter,when,end,.8));os.push(oscillator(ctx,'sine',freq*2,filter,when,end,.17,3))}
 else if(inst==='bell'){os.push(oscillator(ctx,'sine',freq,filter,when,end,.9));os.push(oscillator(ctx,'sine',freq*2.01,filter,when,end,.28));os.push(oscillator(ctx,'sine',freq*3.91,filter,when,end,.14))}
 else if(inst==='lead'){os.push(oscillator(ctx,'sawtooth',freq,filter,when,end,.36));os.push(oscillator(ctx,'square',freq,filter,when,end,.22,5))}
 else{os.push(oscillator(ctx,'sawtooth',freq,filter,when,end,.68));os.push(oscillator(ctx,'sine',freq/2,filter,when,end,.55))}
 let released=false;
 return{release(at=ctx.currentTime){if(released)return;released=true;at=Math.max(when+.012,at);if(at>=end)return;out.gain.cancelScheduledValues(at);out.gain.setValueAtTime(Math.max(.0002,out.gain.value),at);out.gain.setTargetAtTime(.0001,at,.065);for(const o of os){try{o.stop(at+.24)}catch{}}}};
}
export function canHearTrack(user,owner,hearOthers,onlyMine){
 if(owner.id===user)return true;
 return Boolean(hearOthers&&!onlyMine&&owner.air!==false);
}
export async function renderWav(session,localId,hearOthers=true,onlyMine=false){
 const Audio=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!Audio)throw Error('Этот браузер не поддерживает офлайн-рендер аудио');
 const bpm=session.bpm||108,sampleRate=44100,duration=loopMs(bpm)/1000;
 const ctx=new Audio(2,Math.ceil((duration+.08)*sampleRate),sampleRate);
 let found=false;
 for(const player of session.players||[]){
  if(!canHearTrack(localId,player,hearOthers,onlyMine))continue;
  for(const clip of session.tracks?.[player.id]||[]){
   for(const [step,pitch,len,vel] of clip.notes||[]){
    if(step<clip.a||step>=clip.b)continue;
    found=true;const t=step*stepMs(bpm)/1000;
    playNote(ctx,clip.inst,pitch,t,Math.max(.075,len*stepMs(bpm)/1000),vel/100);
   }
  }
 }
 if(!found)throw Error('Нет слышимых нот для экспорта');
 const output=await ctx.startRendering(),channels=output.numberOfChannels,samples=output.length;
 const raw=new ArrayBuffer(44+samples*channels*2),v=new DataView(raw);
 const txt=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i))};
 txt(0,'RIFF');v.setUint32(4,raw.byteLength-8,true);txt(8,'WAVE');txt(12,'fmt ');
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);
 v.setUint32(28,sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);
 txt(36,'data');v.setUint32(40,samples*channels*2,true);
 const arrays=Array.from({length:channels},(_,n)=>output.getChannelData(n));
 let offset=44;for(let i=0;i<samples;i++)for(let ch=0;ch<channels;ch++){const n=Math.max(-1,Math.min(1,arrays[ch][i]));v.setInt16(offset,n<0?n*32768:n*32767,true);offset+=2}
 return new Blob([raw],{type:'audio/wav'});
}
