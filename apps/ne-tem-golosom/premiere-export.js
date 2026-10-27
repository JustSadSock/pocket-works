import {connectVoiceEffect,normalizeVoiceEffect} from './voice-effects.js';
import {clipMix,scheduleEnvelope} from './clip-mix.js';
// The premiere recorder deliberately uses the same start/end/offset values as
// the playback timeline. No binary voice data is uploaded to PocketNet.
export const MAX_PREMIERE_CLIPS = 540;
export const PREMIERE_FPS = 24;
export const voicePlan = (clips,duration) => {
  if(!Number.isFinite(duration)||duration<.1||duration>90)throw Error('Неверная длительность премьеры.');
  if(!Array.isArray(clips)||!clips.length)throw Error('В премьере ещё нет голосовых записей.');
  if(clips.length>MAX_PREMIERE_CLIPS)throw Error('Слишком много голосовых записей для экспорта.');
  const valid=[];
  for(let i=0;i<clips.length;i++){
    const c=clips[i];
    if(!(c?.blob instanceof Blob)||!c.blob.size||
       !Number.isFinite(c.start)||!Number.isFinite(c.end)||
       !Number.isFinite(c.offset)||c.start<0||c.offset<0||
       c.end<c.start-.00001||c.end>duration+.1)
      throw Error('Запись '+(i+1)+' повреждена или имеет неправильное время.');
    const start=Math.max(0,c.start),end=Math.min(duration,c.end);
    // Old editors occasionally generated slivers < 50ms when two takes
    // crossed. They have no audible value and must not veto a 90s premiere.
    if(end-start<.05)continue;
    valid.push({id:c.id,start,end,offset:c.offset,blob:c.blob,fx:normalizeVoiceEffect(c.fx),owner:c.owner||'solo',...clipMix(c)});
  }
  if(!valid.length)throw Error('Нет пригодных голосовых фрагментов для экспорта.');
  return valid.sort((a,b)=>a.start-b.start);
};
// Exact sample window of one clip inside the *decoded* recording.
export function voiceWindow(clip,decodedDuration) {
  if(!Number.isFinite(decodedDuration)||decodedDuration<=clip.offset+.04)
    throw Error('Звуковая запись не содержит выбранного фрагмента.');
  const planned=clip.end-clip.start,available=decodedDuration-clip.offset;
  // Container timestamps can differ from the MediaRecorder wall clock by a
  // frame or two. Disallow silently losing a substantial portion of a line.
  if(available<planned-.3)
    throw Error('Звуковая запись короче выбранной реплики. Перезапиши её.');
  return {when:clip.start,offset:clip.offset,length:Math.min(planned,available)};
}
const VIDEO_MIMES=[
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp8,opus',
  'video/mp4','video/webm'
];
export const premiereMime = supported => VIDEO_MIMES.find(supported)||'';
export const premiereFilename = (title, mime) => {
  const name=String(title||'Премьера').replace(/[\\/:*?"<>|\x00-\x1f]+/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,64)||'Премьера';
  return name+' — Не тем голосом.'+(mime.includes('mp4')?'mp4':'webm');
};
export function supportsPremiereExport(){
  const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;
  const Context=typeof window!=='undefined'?(window.AudioContext||window.webkitAudioContext):null;
  return !!(Context&&typeof MediaRecorder!=='undefined'&&
    typeof MediaRecorder.isTypeSupported==='function'&&
    typeof canvas?.captureStream==='function'&&
    typeof Context.prototype?.createMediaStreamDestination==='function');
}
const abortError=()=>new DOMException('Экспорт отменён','AbortError');
const assertLive=signal=>{if(signal?.aborted)throw abortError()};
function eventWait(target,success,failure,timeout,signal,errorText){
  return new Promise((resolve,reject)=>{
    let completed=false;
    const cleanup=()=>{
      clearTimeout(timer);
      target.removeEventListener(success,okay);
      if(failure)target.removeEventListener(failure,fail);
      signal?.removeEventListener('abort',cancel);
    };
    const finish=error=>{
      if(completed)return;completed=true;cleanup();error?reject(error):resolve();
    };
    const okay=()=>finish();
    const fail=()=>finish(Error(errorText));
    const cancel=()=>finish(abortError());
    const timer=setTimeout(()=>finish(Error(errorText)),timeout);
    target.addEventListener(success,okay,{once:true});
    if(failure)target.addEventListener(failure,fail,{once:true});
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)cancel();
  });
}

/**
 * Export a playable video with all ready players' voices mixed by Web Audio.
 * Encodes at playback speed. An HTMLVideoElement drives the canvas clock;
 * the voice sources share one AudioContext clock and one MediaStream track.
 * The browser chooses MP4 or WebM depending on actual codec support.
 */
export async function renderPremiere({
  source,scene,clips,keepFilmAudio=false,quality=3,signal,onProgress=()=>{}
}){
  if(!supportsPremiereExport())throw Error('Этот браузер не поддерживает сохранение премьеры со звуком.');
  const supported=t=>MediaRecorder.isTypeSupported(t);
  const mime=premiereMime(supported);
  if(!mime)throw Error('В браузере нет совместимого видеокодека со звуком.');
  if(!scene||!Number.isFinite(scene.start)||scene.start<0)
    throw Error('Неизвестна позиция сцены.');
  const plan=voicePlan(clips,scene.duration);
  if(!(source instanceof Blob)&&!(typeof source==='string'&&/^https:\/\//.test(source)))
    throw Error('Нет исходного видео для сохранения.');
  assertLive(signal);
  const cancellation=new AbortController();
  const effectiveSignal=cancellation.signal;

  const video=document.createElement('video');
  video.preload='auto';video.playsInline=true;video.muted=true;
  if(typeof source==='string')video.crossOrigin='anonymous';
  const localUrl=source instanceof Blob?URL.createObjectURL(source):null;
  video.src=localUrl||source;
  const Context=window.AudioContext||window.webkitAudioContext;
  let ctx=null,recorder=null,capture=null,raf=0,frameCallback=false;
  let stallTimer=0,stopError=null,sources=[],mixedTrack=null,resumePaint=null;
  // Start unlocking AudioContext while this call still belongs to the user's
  // click. Waiting for metadata/decoding first loses activation on iOS Safari.
  let initialResume=null;
  let onVideoEnded=null,onVideoFailed=null;
  const stopRecording=error=>{
    if(error&&!stopError)stopError=error;
    video.pause();
    if(recorder?.state==='recording'||recorder?.state==='paused')recorder.stop();
  };
  const abort=()=>{cancellation.abort();stopRecording(abortError())};
  const hidden=()=>{if(document.hidden&&recorder?.state==='recording'){
    // Background tabs cannot reliably paint video frames. Pause encoding
    // without discarding the mixed soundtrack or the user's completed work.
    try{video.pause();recorder.pause();ctx?.suspend().catch(()=>{})}catch{}
    onProgress({phase:'paused'});
   }else if(!document.hidden&&recorder?.state==='paused'){
    // Resume on foreground. Real-time video export cannot be guaranteed to
    // advance while the operating system throttles background tabs.
    void (async()=>{try{
      await ctx?.resume();recorder.resume();await video.play();
      resumePaint?.();
    }catch{stopRecording(Error('Не удалось возобновить экспорт после возврата в приложение.'))}})();
   }};
  signal?.addEventListener('abort',abort,{once:true});
  document.addEventListener('visibilitychange',hidden);
  if(signal?.aborted)abort();
  try{
    ctx=new Context();
    initialResume=ctx.resume();
    void initialResume.catch(()=>{});
    await eventWait(video,'loadedmetadata','error',18000,effectiveSignal,
      'Не удалось открыть исходное видео. Для встроенного фильма может потребоваться доступ к его серверу.');
    assertLive(effectiveSignal);
    const until=scene.start+scene.duration;
    if(Number.isFinite(video.duration)&&video.duration>0&&video.duration+.12<until)
      throw Error('Выбранная сцена выходит за пределы видео.');

    const destination=ctx.createMediaStreamDestination();
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=-9;limiter.knee.value=12;
    limiter.ratio.value=3;limiter.attack.value=.005;limiter.release.value=.2;
    limiter.connect(destination);

    const decoded=new Map();
    onProgress({phase:'decoding',done:0,total:plan.length});
    for(let i=0;i<plan.length;i++){
      assertLive(effectiveSignal);
      const clip=plan[i];
      if(!decoded.has(clip.blob)){
        let buffer;
        try{buffer=await ctx.decodeAudioData(await clip.blob.arrayBuffer())}
        catch{throw Error('Не удалось прочитать голосовую запись '+(i+1)+'. Попробуй перезаписать её.')}
        decoded.set(clip.blob,buffer);
      }
      voiceWindow(clip,decoded.get(clip.blob).duration);
      onProgress({phase:'decoding',done:i+1,total:plan.length});
    }
    assertLive(effectiveSignal);
    // Video source audio is lowered relative to the voices, and is never
    // routed to speakers. The default export matches the muted premiere.
    if(keepFilmAudio){
      const film=ctx.createMediaElementSource(video);
      const duck=ctx.createGain();
      // The neural-cleaned bed has no dialogue to mask, unlike raw film.
      // The previous unconditional 27% made every cleaned scene sound muffled.
      duck.gain.value=scene.cleaned===true?.85:.27;
      film.connect(duck).connect(limiter);
    }
    if(Math.abs(video.currentTime-scene.start)>.025){
      const waiting=eventWait(video,'seeked','error',16000,effectiveSignal,
        'Не удалось перейти к началу выбранной сцены.');
      video.currentTime=scene.start;
      await waiting;
    }
    assertLive(effectiveSignal);
    if(video.readyState<2)
      await eventWait(video,'loadeddata','error',12000,effectiveSignal,
        'Видеокадр не загрузился. Попробуй другой формат файла.');
    const wantedWidth=Math.min(1280,Math.max(2,video.videoWidth||640));
    const ratio=Math.min(1,wantedWidth/Math.max(1,video.videoWidth));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(2,Math.round(video.videoWidth*ratio/2)*2);
    canvas.height=Math.max(2,Math.round(video.videoHeight*ratio/2)*2);
    const painter=canvas.getContext('2d',{alpha:false});
    if(!painter)throw Error('Не удалось создать видеохолст.');
    try{
      painter.drawImage(video,0,0,canvas.width,canvas.height);
      painter.getImageData(0,0,1,1);
    }catch{
      throw Error('Сервер фильма запрещает сохранение кадров. Используй локальный файл этого видео.');
    }
    const hasFrameCallback=typeof video.requestVideoFrameCallback==='function'&&
      typeof video.cancelVideoFrameCallback==='function';
    capture=canvas.captureStream(hasFrameCallback?0:PREMIERE_FPS);
    let videoTrack=capture.getVideoTracks()[0];
    let manual=hasFrameCallback&&typeof videoTrack?.requestFrame==='function';
    if(manual){
      try{videoTrack.requestFrame()}
      catch{manual=false}
    }
    if(hasFrameCallback&&!manual){
      capture.getTracks().forEach(t=>t.stop());
      capture=canvas.captureStream(PREMIERE_FPS);
      videoTrack=capture.getVideoTracks()[0];
    }
    frameCallback=hasFrameCallback;
    const audioTrack=destination.stream.getAudioTracks()[0];
    if(!audioTrack)throw Error('Не удалось создать звуковую дорожку.');
    mixedTrack=audioTrack;capture.addTrack(audioTrack);

    let actualMime='';
    const bitrate=[800000,1900000,3500000,5200000,7000000][Math.max(0,Math.min(4,quality-1))];
    for(const candidate of VIDEO_MIMES.filter(supported)){
      try{
        recorder=new MediaRecorder(capture,{
          mimeType:candidate,videoBitsPerSecond:bitrate,audioBitsPerSecond:128000
        });
        actualMime=candidate;
        break;
      }catch{/* A codec can claim support but reject a mixed stream. */}
    }
    if(!recorder)throw Error('Браузер не смог создать видеокодировщик со звуком.');
    const chunks=[];
    const done=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onerror=()=>{
        stopError=Error('Ошибка кодирования премьеры.');
        if(recorder.state==='recording')recorder.stop();
      };
      recorder.onstop=()=>{
        if(stopError)reject(stopError);
        else if(!chunks.length)reject(Error('Не удалось записать видеофайл.'));
        else resolve(new Blob(chunks,{type:recorder.mimeType||actualMime}));
      };
    });
    // Attach a handler immediately; aborts can happen during video.play().
    void done.catch(()=>{});
    let lastAdvance=performance.now(),lastPosition=scene.start;
    const end=scene.start+scene.duration;
    const paint=(position)=>{
      if(recorder?.state!=='recording')return;
      const t=Number.isFinite(position)?position:video.currentTime;
      if(t>lastPosition+.005){lastPosition=t;lastAdvance=performance.now()}
      if(video.ended||t>=end-.03){
        stopRecording(video.ended&&t<end-.2?Error('Видео закончилось до конца выбранной сцены.'):null);
        return;
      }
      try{
        painter.drawImage(video,0,0,canvas.width,canvas.height);
        if(manual)videoTrack.requestFrame();
      }catch{stopRecording(Error('Не удалось получить кадр видео.'));return}
      onProgress({phase:'encoding',fraction:Math.max(0,Math.min(.999,(t-scene.start)/scene.duration))});
    };
    const callback=(now,meta)=>{
      if(recorder?.state!=='recording')return;
      paint(meta?.mediaTime);
      if(recorder.state==='recording')raf=video.requestVideoFrameCallback(callback);
    };
    const fallback=()=>{
      if(recorder?.state!=='recording')return;
      paint(video.currentTime);
      if(recorder.state==='recording')raf=requestAnimationFrame(fallback);
    };
    onVideoEnded=()=>{if(recorder?.state==='recording')
      stopRecording(video.currentTime<end-.2?Error('Видео закончилось до конца выбранной сцены.'):null)};
    video.addEventListener('ended',onVideoEnded);
    onVideoFailed=()=>stopRecording(Error('Ошибка чтения исходного видео во время экспорта.'));
    video.addEventListener('error',onVideoFailed);
    stallTimer=setInterval(()=>{
      if(recorder?.state!=='recording'||video.paused||video.seeking||document.hidden)return;
      if(performance.now()-lastAdvance>15000)
        stopRecording(Error('Видео перестало воспроизводиться. Проверь файл или соединение.'));
    },2500);
    resumePaint=()=>{if(frameCallback)raf=video.requestVideoFrameCallback(callback);else raf=requestAnimationFrame(fallback)};
    assertLive(effectiveSignal);
    await Promise.race([
      initialResume,
      new Promise((_,reject)=>setTimeout(()=>reject(Error('Браузер не разрешил включить звук. Повтори сохранение после касания экрана.')),10000))
    ]);
    if(ctx.state!=='running')throw Error('Браузер остановил звуковой движок. Нажми «Сохранить видео» ещё раз.');
    recorder.start(1000);
    try{await video.play()}
    catch{
      stopRecording(effectiveSignal.aborted?abortError():Error('Браузер запретил запуск видео для экспорта.'));
      await done.catch(()=>{});
      throw stopError;
    }
    assertLive(effectiveSignal);
    // Schedule every line against one Web Audio clock after video starts.
    // Split clips reuse the same decoded audio but play distinct time windows.
    const current=Math.max(0,video.currentTime-scene.start);
    const clock=ctx.currentTime+.035;
    for(const clip of plan){
      const decodedAudio=decoded.get(clip.blob);
      const segment=voiceWindow(clip,decodedAudio.duration);
      const remaining=segment.when+segment.length-current;
      if(remaining<=.04)continue;
      const when=clock+Math.max(0,segment.when-current);
      const late=Math.max(0,current-segment.when);
      const length=Math.max(0,segment.length-late);
      if(length<.04)continue;
      const node=ctx.createBufferSource();
      node.buffer=decodedAudio;
      const gain=ctx.createGain();
       scheduleEnvelope(gain.gain,{...clip,volume:clipMix(clip).volume*.85},when,late,length);
      node.connect(gain);
      connectVoiceEffect(ctx,gain,limiter,clip.fx,when);
      node.start(when,segment.offset+late,length);
      sources.push(node);
    }
    decoded.clear();
    resumePaint();
    const result=await done;
    onProgress({phase:'encoding',fraction:1});
    return result;
  }finally{
    if(frameCallback)video.cancelVideoFrameCallback?.(raf);
    else cancelAnimationFrame(raf);
    clearInterval(stallTimer);
    if(onVideoEnded){
      video.removeEventListener('ended',onVideoEnded);
      if(onVideoFailed)video.removeEventListener('error',onVideoFailed);
    }
    for(const node of sources){try{node.stop()}catch{}}
    video.pause();
    if(recorder?.state==='recording')recorder.stop();
    capture?.getTracks().forEach(t=>t.stop());
    if(mixedTrack&&mixedTrack.readyState!=='ended')mixedTrack.stop();
    await ctx?.close().catch(()=>{});
    video.removeAttribute('src');video.load();
    if(localUrl)URL.revokeObjectURL(localUrl);
    signal?.removeEventListener('abort',abort);
    document.removeEventListener('visibilitychange',hidden);
  }
}
