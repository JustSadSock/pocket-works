import {createFilmBedSync} from './film-audio-sync.js';
// Local, real-time video export. Source footage never leaves the browser during editing.
export const MAX_ROOM_VIDEO_BYTES = 96 * 1024 * 1024;
export const MAX_SOURCE_VIDEO_BYTES = 512 * 1024 * 1024;
const BITRATES = [650000, 1100000, 1800000, 3000000, 4700000];
export const videoBitrate = level => BITRATES[Math.max(0, Math.min(4, Number(level) - 1 || 0))];
export const formatVideoBytes = size => size >= 1024 * 1024
  ? (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' МиБ'
  : Math.max(1, Math.round(size / 1024)) + ' КиБ';
export const estimateVideoBytes = (seconds, level, keepAudio = true) =>
  Math.ceil(Math.max(0, seconds) * (videoBitrate(level) + (keepAudio ? 96000 : 0)) / 8);
/** Reuse the original encoded bytes when the selected scene fits within the room
 * limit: the source offsets already define its playback window. No re-encoding
 * and no second lossy generation are needed. This works for MP4/WebM/MOV alike.
 */
export function planVideoPreparation({size, mode = 'host', limit = MAX_ROOM_VIDEO_BYTES}) {
  if (!Number.isFinite(size) || size <= 0) return {kind:'invalid'};
  if (mode !== 'host') return {kind:'reuse',reason:'local'};
  if (size <= limit) return {kind:'reuse',reason:'fits'};
  return {kind:'encode',reason:'room-limit'};
}
export const mediaSettingsKey = ({start,duration,width,level,keepAudio}) => [
  Number(start).toFixed(3),
  Number(duration).toFixed(3),
  Number(width),
  Number(level),
  keepAudio?1:0
].join('|');

export const frameCaptureMode = (video,track) =>
  typeof video?.requestVideoFrameCallback === 'function' &&
  typeof video?.cancelVideoFrameCallback === 'function' &&
  typeof track?.requestFrame === 'function' ? 'decoded-frames' : 'compatibility';

export const supportsVideoExport = () => typeof MediaRecorder !== 'undefined'
  && typeof document.createElement('canvas').captureStream === 'function'
  && typeof MediaRecorder.isTypeSupported === 'function';

function outputMime(keepAudio) {
  if (!supportsVideoExport()) return '';
  const kinds=keepAudio
    ?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp8,opus','video/mp4','video/webm']
    :['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp8','video/mp4','video/webm'];
  return kinds.find(type => MediaRecorder.isTypeSupported(type)) || '';
}
function abortError() { return new DOMException('Обработка отменена', 'AbortError'); }
/* MediaRecorder WebM may report duration=Infinity until its last frame has been sought. */
export async function measureVideoDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true; clearTimeout(timer);
      video.removeEventListener('seeked', seeked);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const seeked = () => finish(video.currentTime);
    const timer = setTimeout(() => finish(0), 5000);
    video.addEventListener('seeked', seeked);
    try { video.currentTime = 1e9; } catch { finish(0); }
  });
}


/**
 * Export a precise segment with canvas-driven resolution and bitrate.
 * Encoding follows actual video playback; it must remain in the foreground.
 */
export async function exportVideo({ blob, start, duration, width, level, keepAudio = false, audioPCM = null, signal, onProgress = () => {} }) {
  if (!supportsVideoExport()) throw Error('Этот браузер не поддерживает локальное кодирование видео.');
  const mimeType = outputMime(keepAudio||!!audioPCM);
  if (!mimeType) throw Error('В браузере нет подходящего видеокодека для экспорта.');
  if (!(blob instanceof Blob) || blob.size < 1 || !Number.isFinite(start)
    || !Number.isFinite(duration) || duration < 1 || duration > 90 || start < 0) throw Error('Неверный отрывок.');
  if (signal?.aborted) throw abortError();
  if(audioPCM&&(!Array.isArray(audioPCM)||audioPCM.length!==2||
    audioPCM.some(ch=>!(ch instanceof Float32Array)||Math.abs(ch.length-duration*44100)>4410)))
    throw Error('Неверная длина или формат очищенного саундтрека.');

  const video = document.createElement('video');
  const src = URL.createObjectURL(blob);
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true; // Silent element playback is allowed after async metadata/seek; audio is routed separately.
  video.src = src;
  let recorder, frame = 0, audioContext, filmBedSync, stream, cancelled = false;
  let timer, started = false, captureMode = 'compatibility', watchdog = 0, useVideoFrameCallback = false;
  let lastMediaTime = start, lastAdvance = performance.now(), terminalError = null;
  let cancelPendingWait = null, resumeCapture = null;
  // A stalled decoder must pause both clocks, not silently extend the
  // captured file while the selected media position stands still.
  let pausedByDecoder=false;
  const filmBedPaused=e=>{
    filmBedSync?.pause();
    if((e.type==='waiting'||e.type==='stalled')&&recorder?.state==='recording'){
      try{recorder.pause();pausedByDecoder=true}catch{}
    }
  };
  const filmBedPlaying=()=>{
    if(pausedByDecoder&&recorder?.state==='paused'&&!document.hidden){
      try{recorder.resume();pausedByDecoder=false}catch{}
    }
    if(recorder?.state==='recording')filmBedSync?.sync(true);
  };
  for(const event of ['pause','waiting','stalled','seeking'])video.addEventListener(event,filmBedPaused);
  video.addEventListener('playing',filmBedPlaying);
  const abort = () => {
    cancelled = true;
    cancelPendingWait?.();
    video.pause();
    if (recorder?.state === 'recording') recorder.stop();
  };
  let pausedByTab=false;
  const hidden=()=>{
    if(document.hidden&&recorder?.state==='recording'){
      try{pausedByTab=true;filmBedSync?.pause();video.pause();recorder.pause();void audioContext?.suspend().catch(()=>{})}catch{}
    }else if(!document.hidden&&pausedByTab&&recorder?.state==='paused'){
      pausedByTab=false;
      void (async()=>{
        try{
          await audioContext?.resume();
          recorder.resume();
          await video.play();
          filmBedSync?.sync(true);
          lastAdvance=performance.now();
          resumeCapture?.();
        }catch{
          terminalError=Error('Не удалось возобновить обработку видео после возвращения на вкладку.');
          if(recorder?.state==='recording'||recorder?.state==='paused')recorder.stop();
        }
      })();
    }
  };
  signal?.addEventListener('abort', abort, {once: true});
  document.addEventListener('visibilitychange', hidden);
  try {
    await new Promise((resolve, reject) => {
      let waiting = true;
      const clear = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata',loaded);
        video.removeEventListener('error',failed);
        if(cancelPendingWait===aborted)cancelPendingWait=null;
      };
      const finish=(error)=>{
        if(!waiting)return;
        waiting=false;clear();
        if(error)reject(error);else resolve();
      };
      const loaded=()=>finish();
      const failed=()=>finish(Error('Видео не декодируется этим браузером.'));
      const aborted=()=>finish(abortError());
      cancelPendingWait=aborted;
      video.addEventListener('loadedmetadata',loaded);
      video.addEventListener('error',failed);
      timer=setTimeout(()=>finish(Error('Не удалось открыть видео.')),15000);
      video.load();
      if(cancelled)aborted();
    });
    if (cancelled) throw abortError();
    const fileDuration = await measureVideoDuration(video);
    if (!fileDuration || start + duration > fileDuration + 0.15)
      throw Error('Отрывок выходит за пределы файла.');
    if (start > 0.01 || video.currentTime > 0.01) {
      await new Promise((resolve,reject)=>{
        let waiting=true;
        const clear=()=>{
          clearTimeout(timeout);
          video.removeEventListener('seeked',done);
          if(cancelPendingWait===aborted)cancelPendingWait=null;
        };
        const finish=(error)=>{
          if(!waiting)return;waiting=false;clear();
          if(error)reject(error);else resolve();
        };
        const done=()=>finish();
        const aborted=()=>finish(abortError());
        cancelPendingWait=aborted;
        video.addEventListener('seeked',done);
        const timeout=setTimeout(()=>finish(Error('Не удалось перейти к началу отрывка.')),12000);
        try{video.currentTime=start}catch(e){finish(e)}
        if(cancelled)aborted();
      });
    }
    if (cancelled) throw abortError();
    const widthWanted = Math.max(240, Math.min(1920, Number(width) || 960));
    const scale = Math.min(1, widthWanted / Math.max(1, video.videoWidth));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.floor(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) throw Error('Не удалось открыть видеохолст.');
    const preciseFrames = typeof video.requestVideoFrameCallback === 'function' &&
      typeof video.cancelVideoFrameCallback === 'function';
    useVideoFrameCallback=preciseFrames;
    stream = canvas.captureStream(preciseFrames ? 0 : 24);
    let captureTrack = stream.getVideoTracks()[0];
    captureMode = frameCaptureMode(video,captureTrack);
    if(captureMode==='decoded-frames'){
      // Some browsers expose requestFrame() but throw when used. Probe before
      // the recorder starts so the entire export can fall back transparently.
      try{captureTrack.requestFrame()}
      catch{captureMode='compatibility'}
    }
    if(preciseFrames&&captureMode==='compatibility'){
      stream.getTracks().forEach(t=>t.stop());
      stream=canvas.captureStream(24);
      captureTrack=stream.getVideoTracks()[0];
    }
    // Original audio is optional: dubbing premieres deliberately mute the film.
    // Bypassing Web Audio when unchecked reduces allocations and work on mobile.
    if (audioPCM) {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw Error('Браузер не поддерживает локальное сведение очищенного звука.');
      audioContext=new Audio();
      const buffer=audioContext.createBuffer(2,audioPCM[0].length,44100);
      for(let ch=0;ch<2;ch++)buffer.getChannelData(ch).set(audioPCM[ch]);
      const destination=audioContext.createMediaStreamDestination();
      filmBedSync=createFilmBedSync({context:audioContext,buffer,destination,video,sceneStart:start});
      const track=destination.stream.getAudioTracks()[0];
      if(!track)throw Error('Не удалось создать очищенную аудиодорожку.');
      stream.addTrack(track);
      await audioContext.resume();
    } else if (keepAudio) try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        audioContext = new Audio();
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
        await audioContext.resume();
      } else video.muted = true;
    } catch {
      video.muted = true;
      await audioContext?.close().catch(() => {});
      audioContext = null;
    }

    recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: videoBitrate(level), audioBitsPerSecond: 96000});
    const chunks = [];
    const completed = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      recorder.onerror = () => reject(Error('Кодирование видео прервалось.'));
      recorder.onstop = () => {
        if (terminalError) reject(terminalError);
        else if (cancelled) reject(abortError());
        else if (!chunks.length) reject(Error('Кодек не создал видеоданные.'));
        else resolve(new Blob(chunks, {type: recorder.mimeType || mimeType}));
      };
    });
    const end = start + duration;
    const captureFrame = (mediaTime = video.currentTime) => {
      if (cancelled || recorder.state !== 'recording') return;
      const position = Number.isFinite(mediaTime) ? mediaTime : video.currentTime;
      if (position > lastMediaTime + 0.001) {
        lastMediaTime = position;
        lastAdvance = performance.now();
      }
      // Stop at the selected cut, not the natural end of the source movie.
      if (video.ended || position >= end - 0.035) {
        video.pause();
        recorder.stop();
        return;
      }
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      if(captureMode==='decoded-frames'){
        try{captureTrack.requestFrame()}
        catch{
          terminalError=Error('Браузер не смог захватить видеокадр. Попробуй другой браузер.');
          video.pause();recorder.stop();
          return;
        }
      }
      filmBedSync?.sync();
      const elapsed = Math.max(0,position-start);
      onProgress(Math.min(.999,elapsed/duration));
    };
    const paintVideoFrame = (now,metadata) => {
      if (cancelled || recorder.state !== 'recording') return;
      captureFrame(metadata?.mediaTime);
      if (!cancelled && recorder.state === 'recording')
        frame = video.requestVideoFrameCallback(paintVideoFrame);
    };
    const paintFallback = () => {
      if (cancelled || recorder.state !== 'recording') return;
      captureFrame();
      if (!cancelled && recorder.state === 'recording')
        frame = requestAnimationFrame(paintFallback);
    };
    resumeCapture=()=>{
      if(useVideoFrameCallback)frame=video.requestVideoFrameCallback(paintVideoFrame);
      else frame=requestAnimationFrame(paintFallback);
    };
    const stopAtEnd = () => {
      if (!cancelled && recorder?.state === 'recording' &&
          (video.ended || video.currentTime >= end - 0.035)) {
        video.pause();recorder.stop();
      }
    };
    video.addEventListener('timeupdate',stopAtEnd);
    video.addEventListener('ended',stopAtEnd);
    video.addEventListener('error',()=>{
      if(recorder?.state==='recording'){
        terminalError=Error('Видео перестало воспроизводиться во время обработки.');
        recorder.stop();
      }
    },{once:true});
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    if(cancelled)throw abortError();
    // Do not start recording a static frame while video.play() is waiting for
    // the decoder: that would insert silent pre-roll before the actual scene.
    try{await video.play()}
    catch{
      if(cancelled)throw abortError();
      throw Error('Браузер запретил обработку. Нажми «Сжать» ещё раз.');
    }
    if(cancelled)throw abortError();
    recorder.start(1000);
    started=true;
    filmBedSync?.sync(true);
    if(captureMode==='decoded-frames')captureTrack.requestFrame();
    // Local files should not stall. Detect a broken decoder rather than leaving
    // a forever-running progress spinner and an unfinished recording.
    watchdog=setInterval(()=>{
      if(recorder?.state!=='recording'||video.paused||video.seeking)return;
      if(performance.now()-lastAdvance>20000){
        terminalError=Error('Видео перестало продвигаться. Попробуй меньший размер кадра.');
        video.pause();recorder.stop();
      }
    },3000);
    if(useVideoFrameCallback)
      frame=video.requestVideoFrameCallback(paintVideoFrame);
    else
      frame=requestAnimationFrame(paintFallback);
    const output = await completed;
    onProgress(1);
    return output;
  } finally {
    if (useVideoFrameCallback) video.cancelVideoFrameCallback?.(frame);
    else cancelAnimationFrame(frame);
    clearTimeout(timer);
    clearInterval(watchdog);
    cancelPendingWait=null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (started && recorder?.state === 'recording') { cancelled = true; recorder.stop(); }
    filmBedSync?.dispose();
    for(const event of ['pause','waiting','stalled','seeking'])video.removeEventListener(event,filmBedPaused);
    video.removeEventListener('playing',filmBedPlaying);
    stream?.getTracks().forEach(track => track.stop());
    await audioContext?.close().catch(() => {});
    URL.revokeObjectURL(src);
    signal?.removeEventListener('abort', abort);
    document.removeEventListener('visibilitychange', hidden);
  }
}
