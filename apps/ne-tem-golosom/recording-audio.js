// Browser microphone capture policy for dialogue dubbing.
// The film is muted while recording, so browser echo cancellation and
// noise gates do more harm than good: they clip speech on mobile speakers.
export const AUDIO_MIMES=Object.freeze([
 'audio/webm;codecs=opus',
 'audio/mp4;codecs=mp4a.40.2',
 'audio/mp4',
 'audio/webm',
 'audio/ogg;codecs=opus'
]);
export function microphoneRequest(supported={}){
 const audio={};
 for(const name of ['echoCancellation','noiseSuppression','autoGainControl']){
  if(supported[name]!==false)audio[name]=false;
 }
 if(supported.channelCount!==false)audio.channelCount={ideal:1};
 return {audio:Object.keys(audio).length?audio:true};
}
// MediaRecorder accepts "supported" MIME strings that sometimes still fail
// in the constructor. Try all usable codecs, then the browser default.
export function createVoiceRecorder(stream,Recorder=globalThis.MediaRecorder){
 if(typeof Recorder!=='function')throw Error('Запись звука не поддерживается.');
 for(const type of AUDIO_MIMES){
  if(typeof Recorder.isTypeSupported==='function'&&!Recorder.isTypeSupported(type))continue;
  try{return new Recorder(stream,{mimeType:type,audioBitsPerSecond:128000})}
  catch{/* Try the next container rather than discarding the microphone. */}
 }
 return new Recorder(stream);
}
// The encoded track, not video wall-clock time, is authoritative when the
// device throttles or pauses the microphone. Do not pad missing voice data.
export function reconcileRecordingEnd(start,end,decodedDuration){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)
  throw Error('Некорректный диапазон записи.');
 const expected=end-start;
 if(!Number.isFinite(decodedDuration)||decodedDuration<=0||decodedDuration>=expected-.20)
  return {end,short:false};
 return {end:start+decodedDuration,short:true};
}
