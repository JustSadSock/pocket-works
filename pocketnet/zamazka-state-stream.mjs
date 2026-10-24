// Turn an authoritative per-player gallery snapshot into bounded WebSocket
// messages. Never serialize the global room state here: the caller MUST pass
// the already projected private view for one authenticated participant.
const encoder=new TextEncoder();
const byteLength=value=>encoder.encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;

export function packPrivateZamazkaState(roomId,event,{
 maxPacketBytes=256*1024,
 maxStateBytes=5*1024*1024,
 chunkBytes=12_000,
 maxParts=512,
 streamId=()=>crypto.randomUUID()
}={}){
 const packet={roomId,event};
 const size=byteLength(packet);
 if(size<=maxPacketBytes)return [packet];
 if(size>maxStateBytes)throw Error('event_too_large');
 const serialized=JSON.stringify(event);
 // Split at Unicode codepoint boundaries and never exceed a 12KB transport
 // part. A 12K-character slice could occupy 36KB when most text is Cyrillic
 // or CJK, despite appearing within the previous 12K character budget.
 const parts=[];
 let current='',currentBytes=0;
 for(const symbol of serialized){
  const cp=symbol.codePointAt(0);
  const width=cp<=0x7f?1:cp<=0x7ff?2:cp<=0xffff?3:4;
  if(currentBytes+width>chunkBytes&&current){
   parts.push(current);
   if(parts.length>=maxParts)throw Error('event_too_large');
   current='';currentBytes=0;
  }
  current+=symbol;currentBytes+=width;
 }
 if(current)parts.push(current);
 if(parts.length>maxParts)throw Error('event_too_large');
 const stream=streamId(),total=parts.length;
 return parts.map((part,index)=>({
  roomId,event:{type:'state_stream',payload:{stream,index,total,part}}
 }));
}
