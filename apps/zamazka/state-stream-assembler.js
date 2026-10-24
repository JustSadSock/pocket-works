// Reassemble private authoritative gallery snapshots from PocketNet. A mobile
// download may take longer than 15 seconds while chunks are still arriving.
// Bound age, inactive streams and bytes without expiring a healthy transfer.
export function createStateStreamAssembler({
 idleTimeoutMs=60_000,maximumAgeMs=180_000,maxStreams=3,
 maxParts=512,maxPartChars=15_000,maxBytes=5*1024*1024
}={}){
 const pending=new Map(),encoder=new TextEncoder();
 const expire=now=>{
  for(const [id,item] of pending){
   if(now-item.updated>idleTimeoutMs||now-item.created>maximumAgeMs)
    pending.delete(id);
  }
 };
 return {
  accept(p,now=Date.now()){
   expire(now);
   if(!p||typeof p.stream!=='string'||p.stream.length>128||
      !Number.isInteger(p.total)||p.total<1||p.total>maxParts||
      !Number.isInteger(p.index)||p.index<0||p.index>=p.total||
      typeof p.part!=='string'||p.part.length>maxPartChars)
    return {status:'invalid'};
   let entry=pending.get(p.stream);
   if(!entry){
    if(pending.size>=maxStreams){
     let oldestId=null,oldestTime=Infinity;
     for(const [id,item] of pending){
      if(item.updated<oldestTime){oldestTime=item.updated;oldestId=id}
     }
     if(oldestId!==null)pending.delete(oldestId);
    }
    entry={created:now,updated:now,total:p.total,parts:new Array(p.total),
      count:0,bytes:0};
    pending.set(p.stream,entry);
   }
   if(entry.total!==p.total)return {status:'invalid'};
   if(entry.parts[p.index]===undefined){
    const count=encoder.encode(p.part).length;
    if(entry.bytes+count>maxBytes){
     pending.delete(p.stream);
     return {status:'error'};
    }
    entry.parts[p.index]=p.part;entry.count++;entry.bytes+=count;
   }
   entry.updated=now;
   if(entry.count<entry.total)return {status:'pending'};
   pending.delete(p.stream);
   try{
    const event=JSON.parse(entry.parts.join(''));
    if(event?.type!=='state')return {status:'error'};
    return {status:'complete',event};
   }catch{return {status:'error'}}
  },
  clear(){pending.clear()},
  get activeCount(){return pending.size}
 };
}
