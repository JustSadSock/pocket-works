// Shared client-side data boundaries for direct WebRTC and PocketNet relay.
// Server-side checks live in the current PocketNet module as well.
export const MAX_AUDIO_BYTES = 3_000_000;
export const MAX_VOICE_CLIPS = 90;
export const MAX_INCOMING_TRANSFERS = 12;

export function validAudioEnvelope({meta,bytes,scene,epoch,players,expected,sender,host,receiver}) {
  if(!meta||!scene||!Array.isArray(players)||!Number.isInteger(bytes)||
     bytes<=0||bytes>MAX_AUDIO_BYTES) return false;
  if(typeof meta.id!=='string'||meta.id.length<1||meta.id.length>80||
     typeof meta.owner!=='string'||!players.includes(meta.owner)||meta.owner===receiver)
    return false;
  if(!Number.isInteger(meta.epoch)||meta.epoch!==epoch) return false;
  if(!Number.isFinite(meta.start)||!Number.isFinite(meta.end)||!Number.isFinite(meta.offset)||
     meta.start<0||meta.end<=meta.start||meta.end>scene.duration+.02||
     meta.offset<0||meta.offset>scene.duration+1) return false;
  // Guests receive audio only from the host; the host accepts only the
  // sending actor's own recordings.
  if(receiver===host ? sender!==meta.owner : sender!==host) return false;
  const count=Number(expected?.[meta.owner]);
  return Number.isInteger(count)&&count>0&&count<=MAX_VOICE_CLIPS;
}

export function validVideoEnvelope({meta,bytes,maxBytes,scene,epoch,sender,host,receiver,phase}) {
  return !!(meta&&scene?.custom&&receiver!==host&&sender===host&&
   (phase==='lobby'||phase==='recording')&&
   meta.scene===scene.id&&meta.epoch===epoch&&
   Number.isInteger(bytes)&&bytes>0&&bytes<=maxBytes);
}

export function canAcceptVoice({owner,local,remote,expected}) {
  if(!owner||!Array.isArray(local)||!Array.isArray(remote))return false;
  const allowed=Number(expected?.[owner]);
  if(!Number.isInteger(allowed)||allowed<1||allowed>MAX_VOICE_CLIPS)return false;
  return local.filter(c=>c.owner===owner).length+
   remote.filter(c=>c.owner===owner).length < allowed;
}
