// Pure, DOM-free model for the voice-only editing lane. One actor owns one lane.
export const HISTORY_LIMIT = 40;
export const MAX_CLIPS = 90;
import {clipMix} from './clip-mix.js';
const captureMode=mode=>mode==='noise-reduced'?'noise-reduced':'raw';
export const snapshotClips = clips => clips.map(({id,start,end,offset,owner,blob,fx='clean',captureMode:mic='raw',...mix}) =>
  ({id,start,end,offset,owner,blob,fx,captureMode:captureMode(mic),...clipMix(mix)}));

export class TimelineHistory {
  constructor(past = [], future = []) {
    this.past = past.slice(-HISTORY_LIMIT).map(snapshotClips);
    this.future = future.slice(-HISTORY_LIMIT).map(snapshotClips);
  }
  remember(clips) {
    this.past.push(snapshotClips(clips));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future.length = 0;
  }
  undo(clips) {
    if (!this.past.length) return null;
    this.future.push(snapshotClips(clips));
    if (this.future.length > HISTORY_LIMIT) this.future.shift();
    return this.past.pop();
  }
  redo(clips) {
    if (!this.future.length) return null;
    this.past.push(snapshotClips(clips));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    return this.future.pop();
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}

// Recordings are *layers*, not cutouts. An overlap must remain audible and
// visible rather than chopping a previous clip into near-zero fragments.
export function spliceRecording(clips,incoming,createId) {
 const {start:a,end:b,blob,id,owner} = incoming;
 if (!Number.isFinite(a)||!Number.isFinite(b)||a<0||b-a<MIN_CLIP_SECONDS||
     !blob||!id||typeof createId!=='function')throw Error('Неверный дубль.');
 if(clips.length>=MAX_CLIPS)throw Error('Слишком много реплик (максимум 90).');
 if(clips.some(c=>c.id===id))throw Error('Повтор идентификатора дубля.');
 return [...clips,{id,start:a,end:b,offset:0,owner,blob,fx:'clean',captureMode:captureMode(incoming.captureMode),...clipMix()}]
  .sort((x,y)=>x.start-y.start||x.end-y.end);
}

// Greedy interval partitioning: overlapping clips always occupy different
// lanes. Independent of DOM size/zoom, so mobile and desktop match.
export function layerTimeline(clips){
 const laneEnds=[],assignments=new Map();
 for(const clip of [...clips].sort((a,b)=>a.start-b.start||a.end-b.end)){
  let lane=laneEnds.findIndex(end=>end<=clip.start+.000001);
  if(lane<0){lane=laneEnds.length;laneEnds.push(clip.end)}
  else laneEnds[lane]=clip.end;
  assignments.set(clip.id,lane);
 }
 return {lanes:Math.max(1,laneEnds.length),assignments};
}

const validClip = (c, duration) =>
  c && typeof c.id==='string' && c.id.length>0 && c.id.length<=80 &&
  Number.isFinite(c.start) && Number.isFinite(c.end) &&
  c.start>=0 && c.end>c.start && c.end<=duration+0.02 &&
  Number.isFinite(c.offset) && c.offset>=0 &&
  c.blob instanceof Blob && c.blob.size>0;
const sanitized = (clips,duration) => {
  if (!Array.isArray(clips)) return [];
  const unique = new Set();
  const out = [];
  for (const clip of clips.slice(0,MAX_CLIPS)) {
    if (!validClip(clip,duration) || unique.has(clip.id)) continue;
    unique.add(clip.id);
    out.push(snapshotClips([clip])[0]);
  }
  return out.sort((a,b)=>a.start-b.start || a.end-b.end);
};

// Blobs are kept only once per *draft*, even if a clip appears in 40 undo
// snapshots. This avoids multiplying large audio files in IndexedDB.
export function packTimeline(clips, history, selected = null) {
  const assets = [], byBlob = new Map();
  const pack = list => snapshotClips(list).map(({blob,...clip}) => {
    let index = byBlob.get(blob);
    if (index === undefined) {
      index=assets.length; assets.push(blob); byBlob.set(blob,index);
    }
    return {...clip,asset:index};
  });
  return {
    version:2,
    assets,
    clips:pack(clips),
    past:history.past.slice(-HISTORY_LIMIT).map(pack),
    future:history.future.slice(-HISTORY_LIMIT).map(pack),
    selected:typeof selected==='string'?selected:null
  };
}
export function unpackTimeline(data,duration=Infinity) {
  if (!data || data.version!==2 || !Array.isArray(data.assets)) return {
    clips:sanitized(data?.clips,duration),history:new TimelineHistory(),selected:null
  };
  const unpack = list => sanitized((Array.isArray(list)?list:[]).map(raw => ({
    id:raw?.id,start:raw?.start,end:raw?.end,offset:raw?.offset,
    owner:raw?.owner,fx:raw?.fx||'clean',captureMode:captureMode(raw?.captureMode),...clipMix(raw),blob:data.assets[raw?.asset]
  })),duration);
  const clips=unpack(data.clips);
  const past=(Array.isArray(data.past)?data.past:[]).slice(-HISTORY_LIMIT).map(unpack);
  const future=(Array.isArray(data.future)?data.future:[]).slice(-HISTORY_LIMIT).map(unpack);
  const selected=clips.some(c=>c.id===data.selected)?data.selected:null;
  return {clips,history:new TimelineHistory(past,future),selected};
}


/* Stage 3: every editing gesture is one atomic timeline transaction.
 * "move" shifts a whole line without changing the recorded voice; "left" and
 * "right" trim its edges. Clips may overlap, but never leave the film.
 * We never extend beyond recorded audio, even if the browser hasn't decoded
 * the source duration yet.
 */
export const MIN_CLIP_SECONDS=0.15;
const clampEdit=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
export function editClip(clips,id,kind,delta,sceneDuration,audioDuration=NaN){
 if(!['move','left','right'].includes(kind)||!Number.isFinite(delta)||!Number.isFinite(sceneDuration)||sceneDuration<=0)return null;
 const index=clips.findIndex(c=>c.id===id);
 if(index<0)return null;
 const original=clips[index];
 const lower=0,upper=sceneDuration;
 if(upper-lower<MIN_CLIP_SECONDS)return null;
 let start=original.start,end=original.end,offset=original.offset;
 if(kind==='move'){
   const width=end-start;
   start=clampEdit(start+delta,lower,upper-width);
   end=start+width;
 }else if(kind==='left'){
   // A leftward extension can recover audio already trimmed via offset.
   start=clampEdit(start+delta,Math.max(lower,start-offset),end-MIN_CLIP_SECONDS);
   offset+=(start-original.start);
 }else{
   // The recording itself may be longer than the currently visible snippet.
   const sourceEnd=Number.isFinite(audioDuration)&&audioDuration>0
    ?original.start+(audioDuration-original.offset)
    :original.end;
   end=clampEdit(end+delta,start+MIN_CLIP_SECONDS,Math.min(upper,Math.max(original.end,sourceEnd)));
 }
 if(Math.abs(start-original.start)<0.000001&&Math.abs(end-original.end)<0.000001)return null;
 const updated={...original,start,end,offset};
 const result=clips.slice();result[index]=updated;
 return result;
}

export function replaceSelectedRecording(clips,targetId,blob,duration,newId,micMode){
 const at=clips.findIndex(c=>c.id===targetId);
 if(at<0||!blob||!newId||!Number.isFinite(duration)||duration<=0)return null;
 const old=clips[at];
 const end=old.start+duration;
 if(end-old.start<MIN_CLIP_SECONDS)return null;
 const next=clips.slice();
 next[at]={id:newId,owner:old.owner,start:old.start,end,offset:0,blob,fx:old.fx||'clean',captureMode:captureMode(micMode??old.captureMode),...clipMix(old)};
 return next;
}
