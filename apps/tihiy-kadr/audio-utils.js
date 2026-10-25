// Small, dependency-free PCM utilities shared by the browser UI and Node QA.
export const RATE=44100;
export const MAX_SECONDS=90;
export function validRange(start,duration,total){
 if(!Number.isFinite(start)||!Number.isFinite(duration)||!Number.isFinite(total)||total<=0)throw Error('Не удалось определить длину видео.');
 if(start<0||start>=total)throw Error('Начало фрагмента находится вне видео.');
 if(duration<1||duration>MAX_SECONDS||start+duration>total+0.05)throw Error('Выбери фрагмент длиной 1–90 секунд внутри видео.');
 return {start,duration:Math.min(duration,total-start)};
}
export function mixPCM(input,stems,gains={dialogue:0,music:1,effects:1},style='residual'){
 const out=[];
 if(!Array.isArray(input)||!input.length||!stems)throw Error('Звуковые дорожки ещё не готовы.');
 for(let channel=0;channel<input.length;channel++){
  const src=input[channel],result=new Float32Array(src.length);
  const d=stems.dialogue?.[channel]||stems.dialogue?.[0];
  const m=stems.music?.[channel]||stems.music?.[0];
  const e=stems.effects?.[channel]||stems.effects?.[0];
  if(!d||!m||!e||[d,m,e].some(a=>a.length!==src.length))throw Error('Несовпадение длины дорожек MRX.');
  const dd=Number(gains.dialogue)-1,mm=Number(gains.music)-1,ee=Number(gains.effects)-1;
  if(style!=='residual'&&style!=='stems')throw Error('Неизвестный способ сведения звука.');
  for(let i=0;i<src.length;i++)result[i]=style==='stems'
   ?Number(gains.dialogue)*d[i]+Number(gains.music)*m[i]+Number(gains.effects)*e[i]
   :src[i]+dd*d[i]+mm*m[i]+ee*e[i];
  out.push(result);
 }
 return out;
}
export function wavPCM16(channels,sampleRate=RATE){
 if(!channels?.length||channels.length>2||!channels[0]?.length)throw Error('WAV требует один или два непустых канала.');
 const frames=channels[0].length;
 if(channels.some(a=>a.length!==frames))throw Error('Некорректные каналы WAV.');
 const bytes=44+frames*channels.length*2;
 if(bytes>0xffffffff)throw Error('Звук слишком велик для WAV.');
 const buffer=new ArrayBuffer(bytes),v=new DataView(buffer);
 const str=(off,s)=>{for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i))};
 str(0,'RIFF');v.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,channels.length,true);v.setUint32(24,sampleRate,true);
 v.setUint32(28,sampleRate*channels.length*2,true);v.setUint16(32,channels.length*2,true);
 v.setUint16(34,16,true);str(36,'data');v.setUint32(40,bytes-44,true);
 let pos=44;
 for(let i=0;i<frames;i++)for(let c=0;c<channels.length;c++){
  const x=Math.max(-1,Math.min(1,channels[c][i]||0));
  v.setInt16(pos,x<0?Math.round(x*32768):Math.round(x*32767),true);pos+=2;
 }
 return new Blob([buffer],{type:'audio/wav'});
}
export function elapsed(s){return Number.isFinite(s)?s<60?s.toFixed(1)+' с':Math.floor(s/60)+' мин '+Math.round(s%60)+' с':'—'}
export const safeName=name=>String(name||'video').replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,55)||'video';

export function stemLevels(input,stems){
 const squared=channels=>{
  let sum=0,count=0;
  for(const channel of channels){
   for(const x of channel){sum+=x*x;count++}
  }
  return Math.sqrt(sum/Math.max(1,count));
 };
 if(!stems?.dialogue?.length||!input?.length)return null;
 const original=squared(input);
 const dialogue=squared(stems.dialogue);
 const clean=squared(mixPCM(input,stems));
 const ratio=20*Math.log10(Math.max(dialogue,1e-9)/Math.max(original,1e-9));
 const delta=20*Math.log10(Math.max(dialogue,1e-9)/Math.max(original,1e-9));
 return {original,dialogue,clean,dialogueRelativeDb:Math.round(ratio*10)/10,
  differenceDb:Math.round(delta*10)/10};
}

/**
 * Optional, non-neural stereo-centre attenuation for film dialogue.
 * A band-limited signal common to L/R is attenuated. This can suppress voices
 * that the neural model misplaced in its music/effects stems, at the cost of
 * centred music and effects. A mono file cannot use this technique.
 */
export function suppressStereoCenter(channels,amount=0,sampleRate=RATE){
 if(!Array.isArray(channels)||channels.length<1||
    channels.some(x=>!(x instanceof Float32Array)||x.length!==channels[0].length))
  throw Error('Некорректная звуковая дорожка.');
 if(!Number.isFinite(amount)||amount<0||amount>100)throw Error('Дополнительная очистка должна быть от 0 до 100%.');
 if(!Number.isFinite(sampleRate)||sampleRate<8000)throw Error('Некорректная частота дискретизации.');
 if(channels.length!==2||amount===0)return channels;
 const [left,right]=channels,length=left.length;
 const outL=new Float32Array(length),outR=new Float32Array(length);
 const lowAlpha=1-Math.exp(-2*Math.PI*180/sampleRate);
 const highAlpha=1-Math.exp(-2*Math.PI*4800/sampleRate);
 const envelopeAlpha=1-Math.exp(-1/(0.035*sampleRate));
 const maxGain=.85*amount/100;
 let low=0,band=0,midRms=0,sideRms=0;
 for(let i=0;i<length;i++){
  const l=left[i],r=right[i],mid=.5*(l+r),side=.5*(l-r);
  low+=lowAlpha*(mid-low);
  band+=highAlpha*((mid-low)-band);
  midRms+=envelopeAlpha*(mid*mid-midRms);
  sideRms+=envelopeAlpha*(side*side-sideRms);
  const centerWeight=midRms/(midRms+1.7*sideRms+1e-10);
  const attenuation=band*maxGain*centerWeight;
  outL[i]=l-attenuation;outR[i]=r-attenuation;
 }
 return [outL,outR];
}
