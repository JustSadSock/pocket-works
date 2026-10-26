// Research-only input adapters and objective metrics for soundtrack separation.
// No uploaded media is sent to PocketWorks servers or third parties.
export const STUDY_METHODS=Object.freeze([
 {id:'umxhq-direct',name:'Open-Unmix UMX-HQ',type:'local',detail:'Быстрая локальная вокальная модель'},
 {id:'scnet-direct',name:'SCNet',type:'local',detail:'Тщательное удаление вокала с оригинальной дорожки'},
 {id:'surround',name:'5.1 / 7.1',type:'surround',detail:'Извлечение M&E из многоканального WAV, без нейросети'},
 {id:'dnr-scnet',name:'DnR v3 · SCNet',type:'import',detail:'MVSep, DnR v3 SCNet Large (56 / 0)'},
 {id:'dnr-ensemble',name:'DnR v3 · Ensemble',type:'import',detail:'MVSep, Mel + SCNet (56 / 2)'},
 {id:'bandit',name:'BandIt v2',type:'import',detail:'MVSep, BandIt v2 (45)'},
 {id:'sam',name:'SAM Audio',type:'import',detail:'Сохранённая residual-дорожка локального SAM Audio'},
 {id:'other',name:'Другой алгоритм',type:'import',detail:'Любой M&E-результат в WAV / FLAC / MP3'}
]);
export function researchMethod(id){return STUDY_METHODS.find(x=>x.id===id)||null}
// Both vocal models were trained on MUSIC vocals rather than cartoon dialogue.
// Subtract their estimated vocal stems without promising perfect isolation.
export function subtractResidualVocals(me,vocals,strength=.8){
 if(!me?.length||!vocals?.length||me.length!==vocals.length||
    me.some((a,i)=>!(a instanceof Float32Array)||!(vocals[i] instanceof Float32Array)||a.length!==vocals[i].length))
  throw Error('Модель вернула несовместимую звуковую дорожку.');
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Допустимое удаление голоса — 0–100%.');
 return me.map((channel,index)=>{
  const removed=vocals[index],out=new Float32Array(channel.length);
  for(let i=0;i<out.length;i++)out[i]=channel[i]-strength*removed[i];
  return out;
 });
}
export function wavMetadata(buffer){
 const view=new DataView(buffer),n=view.byteLength;
 const four=(p)=>String.fromCharCode(...new Uint8Array(buffer,p,4));
 if(n<44||four(0)!=='RIFF'||four(8)!=='WAVE')throw Error('Выбранный файл не является WAV (RIFF/WAVE).');
 let format=null,dataStart=-1,frames=0;
 for(let at=12;at+8<=n;){
  const name=four(at),length=view.getUint32(at+4,true),offset=at+8;
  if(length>n-offset)throw Error('Повреждённый WAV: размер секции за границей файла.');
  if(name==='fmt '){
   if(length<16)throw Error('Повреждённое описание WAV.');
   let tag=view.getUint16(offset,true);
   const channels=view.getUint16(offset+2,true),rate=view.getUint32(offset+4,true);
   const blockAlign=view.getUint16(offset+12,true),bits=view.getUint16(offset+14,true);
   let mask=0;
   if(tag===0xfffe){
    if(length<40)throw Error('Неизвестный расширенный WAV.');
    mask=view.getUint32(offset+20,true);
    tag=view.getUint16(offset+24,true);
   }
   format={tag,channels,rate,blockAlign,bits,mask};
  }else if(name==='data'){dataStart=offset;frames=length}
  at=offset+length+(length&1);
 }
 if(!format||dataStart<0)throw Error('WAV не содержит PCM-аудио.');
 const {tag,channels,rate,bits,blockAlign}=format;
 if(![1,3].includes(tag)||!([16,24,32].includes(bits))||tag===3&&bits!==32)
  throw Error('Поддерживаются PCM16/24/32 и float32 WAV. Для сжатого звука нужен декодер браузера.');
 if(![1,2,6,8].includes(channels)||rate<8000||rate>192000||
    blockAlign!==channels*bits/8||frames%blockAlign!==0)
  throw Error('Неподдерживаемая конфигурация WAV. Нужен моно, стерео, 5.1 или 7.1.');
 return {...format,offset:dataStart,frames:frames/blockAlign,duration:frames/blockAlign/rate};
}
export function decodeWav(buffer,{start=0,duration=null}={}){
 const meta=wavMetadata(buffer),v=new DataView(buffer);
 if(!Number.isFinite(start)||start<0||start>=meta.duration+.0001)throw Error('Фрагмент начинается за пределами WAV.');
 const offsetFrames=Math.min(meta.frames,Math.floor(start*meta.rate)),count=Math.max(0,Math.min(meta.frames-offsetFrames,
  duration===null?meta.frames:Math.round(duration*meta.rate)));
 if(count<1)throw Error('У WAV нет данных в выбранном диапазоне.');
 const channels=Array.from({length:meta.channels},()=>new Float32Array(count));
 const bytes=meta.bits/8;let cursor=meta.offset+offsetFrames*meta.blockAlign;
 for(let i=0;i<count;i++){
  for(let c=0;c<meta.channels;c++){
   let value=0;
   if(meta.tag===3)value=v.getFloat32(cursor,true);
   else if(meta.bits===16)value=v.getInt16(cursor,true)/32768;
   else if(meta.bits===24){
    let s=v.getUint8(cursor)|v.getUint8(cursor+1)<<8|v.getUint8(cursor+2)<<16;
    if(s&0x800000)s-=0x1000000;
    value=s/8388608;
   }else value=v.getInt32(cursor,true)/2147483648;
   channels[c][i]=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
   cursor+=bytes;
  }
 }
 return {meta,channels};
}
export function resamplePCM(channels,fromRate,toRate=44100){
 if(!Number.isFinite(fromRate)||fromRate<8000||!Number.isFinite(toRate)||toRate<8000)
  throw Error('Неподдерживаемая частота дискретизации.');
 if(Math.abs(fromRate-toRate)<.01)return channels.map(a=>a.slice());
 const count=Math.round(channels[0].length*toRate/fromRate);
 return channels.map(a=>{
  const output=new Float32Array(count);
  for(let i=0;i<count;i++){
   const pos=i*fromRate/toRate,n=Math.floor(pos),alpha=pos-n;
   output[i]=(a[Math.min(n,a.length-1)]||0)*(1-alpha)+(a[Math.min(n+1,a.length-1)]||0)*alpha;
  }
  return output;
 });
}
export function channelSummary(channels,rate){
 if(!channels?.length)return [];
 return channels.map((a,i)=>{
  let energy=0,peak=0;
  for(const n of a){energy+=n*n;peak=Math.max(peak,Math.abs(n))}
  return {channel:i+1,label:['L','R','C','LFE','SL/BL','SR/BR','SL','SR'][i]||'CH'+(i+1),
   rms:Math.sqrt(energy/Math.max(1,a.length)),peak,duration:a.length/rate};
 });
}
// Center/dialogue channel is explicitly omitted; gain=0.15 restores 15% of
// the center signal for a quality comparison. LFE is omitted as unsuitable for
// dialogue/music separation. 7.1 preserves side AND rear channels.
export function multichannelME(channels,centerGain=0){
 if(![6,8].includes(channels?.length))throw Error('Для канального разделения нужен 5.1 или 7.1 PCM WAV.');
 if(!Number.isFinite(centerGain)||centerGain<0||centerGain>1)throw Error('Допустима доля центра от 0 до 100%.');
 const frames=channels[0].length;
 if(channels.some(a=>a.length!==frames))throw Error('Дорожки WAV имеют разные размеры.');
 const l=new Float32Array(frames),r=new Float32Array(frames);
 const rear=channels.length===8?0.30:0;
 for(let i=0;i<frames;i++){
  l[i]=.76*channels[0][i]+.52*channels[4][i]+rear*(channels[6]?.[i]||0)+.45*centerGain*channels[2][i];
  r[i]=.76*channels[1][i]+.52*channels[5][i]+rear*(channels[7]?.[i]||0)+.45*centerGain*channels[2][i];
 }
 return [l,r];
}
export function stereoPCM(channels){
 if(!channels?.length)throw Error('Нет звуковой дорожки.');
 if(channels.length===1)return [channels[0].slice(),channels[0].slice()];
 if(channels.length===2)return channels.map(ch=>ch.slice());
 return multichannelME(channels,1);
}
export function sumMusicEffects(music,effects){
 if(!music?.length||!effects?.length)throw Error('Требуются и музыка, и эффекты.');
 const count=Math.min(music[0].length,effects[0].length);
 const chans=Math.max(music.length,effects.length,2);
 if(count<1)throw Error('Слишком короткий результат.');
 return Array.from({length:chans},(_,c)=>{
  const a=music[Math.min(c,music.length-1)],b=effects[Math.min(c,effects.length-1)],out=new Float32Array(count);
  for(let i=0;i<count;i++)out[i]=a[i]+b[i];
  return out;
 });
}
export function matchResultToSegment(channels,rate,start,duration,outRate=44100){
 if(!channels?.length||!Number.isFinite(rate)||!Number.isFinite(duration))throw Error('Некорректный внешний результат.');
 const size=channels[0].length/rate;
 if(size+0.20<duration)throw Error('Дорожка короче выбранной сцены. Экспортируй тот же временной отрезок.');
 const takeStart=size>=start+duration-.12&&start>1?start:0;
 const begin=Math.max(0,Math.floor(takeStart*rate)),end=Math.min(channels[0].length,begin+Math.round(duration*rate));
 const cut=channels.map(c=>c.subarray(begin,end));
 const result=resamplePCM(stereoPCM(cut),rate,outRate);
 const target=Math.round(duration*outRate);
 return result.map(c=>{
  if(Math.abs(c.length-target)>Math.round(.21*outRate))throw Error('Длительность внешней дорожки существенно не совпадает с фрагментом.');
  const arr=new Float32Array(target);arr.set(c.subarray(0,target));return arr;
 });
}
export function comparisonMetrics(original,clean,rate=44100){
 if(!original?.length||!clean?.length)throw Error('Нет сравниваемых дорожек.');
 const n=Math.min(original[0].length,clean[0].length);
 if(n<rate*.2)throw Error('Слишком короткое сравнение.');
 let ref=0,out=0,delta=0,peak=0;
 for(let i=0;i<n;i++)for(let c=0;c<Math.min(2,original.length,clean.length);c++){
  const a=original[c][i],b=clean[c][i];
  ref+=a*a;out+=b*b;delta+=(a-b)**2;peak=Math.max(peak,Math.abs(b));
 }
 const db=x=>20*Math.log10(Math.max(1e-9,Math.sqrt(x/(n*2))));
 return {inputRmsDb:db(ref),outputRmsDb:db(out),
  changeDb:Math.round((db(out)-db(ref))*10)/10,
  removedRmsDb:db(delta),peakDb:20*Math.log10(Math.max(1e-9,peak)),
  seconds:n/rate};
}
export function comparisonRecord(method,seconds,processingMs,metrics){
 if(!researchMethod(method))throw Error('Неизвестный алгоритм.');
 if(!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(processingMs)||processingMs<0)
  throw Error('Неверный замер обработки.');
 return {method,seconds,processingMs,realTimeFactor:processingMs/1000/seconds,
  metrics};
}
