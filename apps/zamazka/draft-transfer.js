// PocketNet accepts at most 16 KiB per WebSocket frame. An entire painting
// can exceed that size: transmit atomic revisions in small ordered packets.
// The server publishes only the complete, validated last part.
export const PAINT_PACKET_BUDGET=11*1024;
let nextRevision=0;
// Deterministic integrity marker over the exact vector format accepted by the server.
// Exclude local gesture metadata and match server coordinate quantization.
export function paintingChecksum(strokes){
 const canonical=strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p.map(p=>[Math.round(p[0]*10)/10,Math.round(p[1]*10)/10])}));
 const data=JSON.stringify(canonical);
 let hash=2166136261;
 for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0}
 return hash.toString(16).padStart(8,'0');
}

export function paintPackets({type,round,art,variation,strokes,revision,basePrefix=0,baseChecksum}){
 if(!['draft_chunk','submit_chunk'].includes(type)||!Array.isArray(strokes)||strokes.length>768)
  throw new Error('invalid_painting');
 // A compact draft references only the server-confirmed prefix. Finals never
 // depend on a previous draft: they remain independently recoverable.
 if(!Number.isInteger(basePrefix)||basePrefix<0||basePrefix>strokes.length||
    (basePrefix>0&&(type!=='draft_chunk'||typeof baseChecksum!=='string'||!/^[0-9a-f]{8}$/.test(baseChecksum))))
  throw new Error('invalid_painting_prefix');
 const id=revision||'r'+Date.now().toString(36)+'-'+(++nextRevision).toString(36);
 const chunks=[],envelope={type,round,art,variation,revision:id,checksum:paintingChecksum(strokes),
  ...(basePrefix>0?{basePrefix,baseChecksum}:{})};
 let part=[];
 for(const stroke of strokes.slice(basePrefix)){
  if(part.length>=8||JSON.stringify({...envelope,index:0,parts:160,strokes:[...part,stroke]}).length>PAINT_PACKET_BUDGET){
   if(part.length){chunks.push(part);part=[]}
  }
  if(JSON.stringify({...envelope,index:0,parts:160,strokes:[stroke]}).length>PAINT_PACKET_BUDGET)
   throw new Error('stroke_too_large');
  part.push(stroke);
 }
 chunks.push(part);
 if(chunks.length>160)throw new Error('too_many_parts');
 return chunks.map((items,index)=>({...envelope,index,parts:chunks.length,strokes:items}));
}
export function sendPainting(send,meta){
 const packets=paintPackets(meta);
 for(const packet of packets)send(packet);
 return {revision:packets[0].revision,parts:packets.length};
}

// PocketNet throttles WebSocket messages at 30/second. Paintings of 300+
// strokes require dozens of chunks: blasting them synchronously deterministically
// trips the limit, and repeating the burst cannot succeed. Leave headroom for
// presence, sync and timer traffic. The caller owns cancellation / retries.
export function sendPaintingPaced(send,meta,{intervalMs=95,startIndex=0,signal,onProgress=()=>{}}={}){
 const packets=paintPackets(meta);
 const delay=Math.max(80,Number(intervalMs)||95);
 const start=Number.isInteger(startIndex)&&startIndex>=0&&startIndex<=packets.length?startIndex:0;
 const completion=(async()=>{
  for(let i=start;i<packets.length;i++){
   if(signal?.aborted)throw new Error('paint_transfer_cancelled');
   if(i>start)await new Promise(resolve=>setTimeout(resolve,delay));
   if(signal?.aborted)throw new Error('paint_transfer_cancelled');
   send(packets[i]);
   onProgress(i+1,packets.length);
  }
 })();
 return {revision:packets[0].revision,parts:packets.length,completion};
}
