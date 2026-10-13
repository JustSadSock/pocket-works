// PocketNet accepts at most 16 KiB per WebSocket frame. An entire painting
// can exceed that size: transmit atomic revisions in small ordered packets.
// The server publishes only the complete, validated last part.
export const PAINT_PACKET_BUDGET=11*1024;
let nextRevision=0;
export function paintPackets({type,round,art,variation,strokes,revision}){
 if(!['draft_chunk','submit_chunk'].includes(type)||!Array.isArray(strokes)||strokes.length>400)
  throw new Error('invalid_painting');
 const id=revision||'r'+Date.now().toString(36)+'-'+(++nextRevision).toString(36);
 const chunks=[],envelope={type,round,art,variation,revision:id};
 let part=[];
 for(const stroke of strokes){
  if(part.length>=8||JSON.stringify({...envelope,index:0,parts:64,strokes:[...part,stroke]}).length>PAINT_PACKET_BUDGET){
   if(part.length){chunks.push(part);part=[]}
  }
  if(JSON.stringify({...envelope,index:0,parts:64,strokes:[stroke]}).length>PAINT_PACKET_BUDGET)
   throw new Error('stroke_too_large');
  part.push(stroke);
 }
 chunks.push(part);
 if(chunks.length>64)throw new Error('too_many_parts');
 return chunks.map((items,index)=>({...envelope,index,parts:chunks.length,strokes:items}));
}
export function sendPainting(send,meta){
 const packets=paintPackets(meta);
 for(const packet of packets)send(packet);
 return {revision:packets[0].revision,parts:packets.length};
}
