import {connectVoiceEffect} from './voice-effects.js';
import {clipMix,scheduleEnvelope} from './clip-mix.js';
import {extractMp4AAC} from './mp4-audio.js';
import {inspectFastDubMP4,fastDubMP4} from './mp4-fast-cut.js';

// WebCodecs/OfflineAudioContext are optional. Standard MediaRecorder remains the
// fallback on unsupported mobile browsers, HEVC, WebM and unusual MP4 timelines.
const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Экспорт отменён','AbortError')};
export const supportsFastPremiere=()=>typeof OfflineAudioContext!=='undefined'&&
 typeof AudioEncoder!=='undefined'&&typeof AudioData!=='undefined';
export async function renderPremiereFast({source,scene,plan,keepFilmAudio=false,voiceWindow,signal,onProgress=()=>{}}){
 if(!(source instanceof Blob)||!supportsFastPremiere()||!/mp4|quicktime|octet-stream|^$/.test(source.type))return null;
 cancelled(signal);
 const spec=await inspectFastDubMP4(source,signal);
 if(!spec||!([44100,48000].includes(spec.sampleRate))||
    ![1,2].includes(spec.channels)||!spec.asc||((spec.asc[0]>>3)&31)!==2)return null;
 const config={codec:'mp4a.40.2',sampleRate:spec.sampleRate,
  numberOfChannels:spec.channels,bitrate:128000};
 let supported;
 try{supported=await AudioEncoder.isConfigSupported(config)}
 catch{return null}
 if(!supported?.supported)return null;
 cancelled(signal);
 const total=Math.ceil(scene.duration*spec.sampleRate);
 if(total<1||total>90*48000+2048)return null;
 const offline=new OfflineAudioContext(spec.channels,total,spec.sampleRate);
 const limiter=offline.createDynamicsCompressor();
 limiter.threshold.value=-9;limiter.knee.value=12;
 limiter.ratio.value=3;limiter.attack.value=.005;limiter.release.value=.2;
 limiter.connect(offline.destination);
 // Existing neural soundtrack is already in source. Decode only its audio
 // samples; copying H.264 leaves the film's frames bit-for-bit unchanged.
 if(keepFilmAudio){
  const pcm=await extractMp4AAC(source,scene.start,scene.duration,{signal});
  if(!pcm)return null;
  cancelled(signal);
  const film=offline.createBuffer(2,pcm[0].length,44100);
  for(let i=0;i<2;i++)film.getChannelData(i).set(pcm[i]);
  const node=offline.createBufferSource(),duck=offline.createGain();
  node.buffer=film;duck.gain.value=scene.cleaned===true?.85:.27;
  node.connect(duck).connect(limiter);node.start(0);
 }
 const decoded=new Map();
 onProgress({phase:'decoding',done:0,total:plan.length});
 for(let i=0;i<plan.length;i++){
  cancelled(signal);
  const clip=plan[i];
  if(!decoded.has(clip.blob)){
   let b;
   try{b=await offline.decodeAudioData(await clip.blob.arrayBuffer())}
   catch{return null}
   decoded.set(clip.blob,b);
  }
  const buffer=decoded.get(clip.blob);
  const window=voiceWindow(clip,buffer.duration);
  if(window.length>.04){
   const audio=offline.createBufferSource(),gain=offline.createGain();
   audio.buffer=buffer;
   scheduleEnvelope(gain.gain,{...clip,volume:clipMix(clip).volume*.85},window.when,0,window.length);
   audio.connect(gain);
   connectVoiceEffect(offline,gain,limiter,clip.fx,window.when);
   audio.start(window.when,window.offset,window.length);
  }
  onProgress({phase:'decoding',done:i+1,total:plan.length});
 }
 cancelled(signal);
 onProgress({phase:'fast',fraction:.1});
 const mixed=await offline.startRendering();
 cancelled(signal);
 onProgress({phase:'fast',fraction:.32});
 let failure=null,description=null,encoder=null;
 const frames=[];
 const totalFrames=Math.ceil(mixed.length/1024);
 try{
  encoder=new AudioEncoder({
   output:(chunk,metadata)=>{
    try{
     const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
     frames.push({timestamp:chunk.timestamp,data});
     const desc=metadata?.decoderConfig?.description;
     if(desc)description=new Uint8Array(desc).slice();
    }catch(e){failure=e}
   },
   error:e=>{failure=e}
  });
  encoder.configure(config);
  for(let start=0;start<mixed.length;start+=1024){
   cancelled(signal);
   if(failure)throw failure;
   const planar=new Float32Array(spec.channels*1024);
   const copy=Math.min(1024,mixed.length-start);
   for(let ch=0;ch<spec.channels;ch++)
    planar.set(mixed.getChannelData(ch).subarray(start,start+copy),ch*1024);
   const data=new AudioData({
    format:'f32-planar',sampleRate:spec.sampleRate,numberOfChannels:spec.channels,
    numberOfFrames:1024,timestamp:Math.round(start/spec.sampleRate*1e6),data:planar
   });
   try{encoder.encode(data)}finally{data.close()}
   if(start%(1024*48)===0||encoder.encodeQueueSize>32){
    await encoder.flush();cancelled(signal);
    onProgress({phase:'fast',fraction:.32+.55*Math.min(1,start/Math.max(1,mixed.length))});
   }
  }
  await encoder.flush();cancelled(signal);
  if(failure)throw failure;
 }finally{try{encoder?.close()}catch{}}
 if(frames.length<1||frames.length>totalFrames+2||!description)return null;
 onProgress({phase:'fast',fraction:.9});
 const result=await fastDubMP4({
  blob:source,start:scene.start,duration:scene.duration,frames,description,signal
 });
 cancelled(signal);
 if(result)onProgress({phase:'fast',fraction:1});
 return result;
}
