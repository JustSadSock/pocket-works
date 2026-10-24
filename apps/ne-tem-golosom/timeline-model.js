// Pure, DOM-free model for the voice-only editing lane. One actor owns one lane.
export const HISTORY_LIMIT = 40;
export const MAX_CLIPS = 90;
export const snapshotClips = clips => clips.map(({id,start,end,offset,owner,blob}) =>
  ({id,start,end,offset,owner,blob}));

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

export function spliceRecording(clips, incoming, createId) {
  const {start:a,end:b,blob,id,owner} = incoming;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a ||
    !blob || !id || typeof createId !== 'function') throw Error('Неверный дубль.');
  const result = [];
  for (const clip of clips) {
    if (clip.end <= a || clip.start >= b) {
      result.push(clip);
      continue;
    }
    if (clip.start < a) result.push({...clip,id:createId(),end:a});
    if (clip.end > b) result.push({
      ...clip,id:createId(),start:b,offset:clip.offset+(b-clip.start)
    });
  }
  result.push({id,start:a,end:b,offset:0,owner,blob});
  result.sort((x,y)=>x.start-y.start || x.end-y.end);
  if (result.length > MAX_CLIPS) throw Error('Слишком много фрагментов (максимум 90).');
  return result;
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
    owner:raw?.owner,blob:data.assets[raw?.asset]
  })),duration);
  const clips=unpack(data.clips);
  const past=(Array.isArray(data.past)?data.past:[]).slice(-HISTORY_LIMIT).map(unpack);
  const future=(Array.isArray(data.future)?data.future:[]).slice(-HISTORY_LIMIT).map(unpack);
  const selected=clips.some(c=>c.id===data.selected)?data.selected:null;
  return {clips,history:new TimelineHistory(past,future),selected};
}
