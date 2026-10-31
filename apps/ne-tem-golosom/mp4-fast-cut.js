// Lossless MP4 cut for ordinary unfragmented AVC/AAC files. Unsupported
// timelines fall back to the existing browser encoder; no external binaries.
const enc=new TextEncoder();
const u32=(v,p)=>v.getUint32(p);
const name=(v,p)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,4));
const put32=(v,p,n)=>v.setUint32(p,n>>>0);
const bytes=(...numbers)=>new Uint8Array(numbers);
function join(parts){const n=parts.reduce((n,x)=>n+x.byteLength,0),b=new Uint8Array(n);let at=0;for(const x of parts){b.set(x,at);at+=x.byteLength}return b}
function atom(type,...body){const payload=join(body);if(payload.length>0xffffffff-8)throw Error('box too large');const b=new Uint8Array(payload.length+8),v=new DataView(b.buffer);put32(v,0,b.length);b.set(enc.encode(type),4);b.set(payload,8);return b}
const raw=(v,b)=>new Uint8Array(v.buffer,v.byteOffset+b.start,b.end-b.start).slice();
function boxes(v,a=0,z=v.byteLength){const out=[];for(let p=a;p+8<=z;){const length=u32(v,p),type=name(v,p+4);if(length<8||p+length>z)return null;out.push({type,start:p,body:p+8,end:p+length});p+=length}return out}
function kid(v,box,type){return boxes(v,box.body,box.end)?.find(x=>x.type===type)}
const parsed=(v,box)=>new DataView(v.buffer,v.byteOffset+box.start,box.end-box.start);
function patchDuration(v,box,seconds,scale){const b=raw(v,box),d=new DataView(b.buffer);const ver=d.getUint8(8),pos=box.type==='tkhd'?(ver===1?36:28):ver===1?32:24;if(ver!==0||seconds*scale>=0xffffffff)return null;put32(d,pos,Math.round(seconds*scale));return b}
function table(v,box,stride){if(!box||box.end-box.body<8)return null;const count=u32(v,box.body+4);if(count>300000||box.body+8+count*stride>box.end)return null;return Array.from({length:count},(_,i)=>box.body+8+i*stride)}
function compact(rows){const out=[];for(const [count,value] of rows){const last=out[out.length-1];if(last&&last[1]===value)last[0]+=count;else out.push([count,value])}return out}
function entries(type,rows){const p=new Uint8Array(8+rows.length*8),v=new DataView(p.buffer);put32(v,4,rows.length);rows.forEach(([n,delta],i)=>{put32(v,8+i*8,n);put32(v,12+i*8,delta)});return atom(type,p)}
function parseTrack(v,trak,blobSize,mediaRanges){
 const mdia=kid(v,trak,'mdia'),hdlr=mdia&&kid(v,mdia,'hdlr'),mdhd=mdia&&kid(v,mdia,'mdhd'),minf=mdia&&kid(v,mdia,'minf'),stbl=minf&&kid(v,minf,'stbl'),tkhd=kid(v,trak,'tkhd');
 if(!hdlr||!mdhd||!stbl||!tkhd)return null;
 const kind=name(v,hdlr.body+8);if(!['vide','soun'].includes(kind))return null;
 const mdhdVer=v.getUint8(mdhd.body);if(mdhdVer!==0)return null;
 const scale=u32(v,mdhd.body+12);if(!scale)return null;
 const stsd=kid(v,stbl,'stsd'),stsz=kid(v,stbl,'stsz'),stsc=kid(v,stbl,'stsc'),stts=kid(v,stbl,'stts');
 const stco=kid(v,stbl,'stco')||kid(v,stbl,'co64');
 if(!stsd||!stsz||!stsc||!stts||!stco||stco.type!=='stco')return null;
 if(u32(v,stsd.body+4)!==1)return null;
 const codec=name(v,stsd.body+12);
 if((kind==='vide'&&codec!=='avc1')||(kind==='soun'&&codec!=='mp4a'))return null;
 const n=u32(v,stsz.body+8);if(n<1||n>300000)return null;
 const sizes=[];const constant=u32(v,stsz.body+4);
 if(!constant&&stsz.body+12+n*4>stsz.end)return null;
 for(let i=0;i<n;i++)sizes.push(constant||u32(v,stsz.body+12+i*4));
 const chunks=table(v,stco,4),patterns=table(v,stsc,12),times=table(v,stts,8),ctsBox=kid(v,stbl,'ctts'),cts=ctsBox?table(v,ctsBox,8):null;
 if(!chunks?.length||!patterns?.length||!times?.length||(ctsBox&&!cts))return null;
 if(ctsBox&&v.getUint8(ctsBox.body)>1)return null;
 let at=0,pat=0;const positions=[];
 for(let c=0;c<chunks.length;c++){
  while(pat+1<patterns.length&&u32(v,patterns[pat+1])<=c+1)pat++;
  const entry=patterns[pat];if(u32(v,entry)>c+1||u32(v,entry+8)!==1)return null;
  let offset=u32(v,chunks[c]);const count=u32(v,entry+4);
  if(!count||at+count>n)return null;
  for(let i=0;i<count;i++){
   const sz=sizes[at++];
   if(!sz||offset+sz>blobSize||!mediaRanges.some(r=>offset>=r.from&&offset+sz<=r.to))return null;
   positions.push(offset);offset+=sz;
  }
 }
 if(at!==n)return null;
 const dts=[],durations=[],compositions=[];let cursor=0;
 for(const p of times){let count=u32(v,p),delta=u32(v,p+4);if(!count||!delta||cursor+count>n)return null;while(count--){dts.push(cursor?dts[cursor-1]+durations[cursor-1]:0);durations.push(delta);cursor++}}
 if(cursor!==n)return null;
 if(cts){for(const p of cts){const count=u32(v,p),offset=ctsBox&&v.getUint8(ctsBox.body)===1?v.getInt32(p+4):u32(v,p+4);if(count<1||compositions.length+count>n)return null;for(let i=0;i<count;i++)compositions.push(offset)}if(compositions.length!==n)return null}
 const syncBox=kid(v,stbl,'stss');const sync=syncBox?table(v,syncBox,4)?.map(p=>u32(v,p)-1):null;
 if(syncBox&&(!sync||!sync.length||sync.some(i=>i<0||i>=n)))return null;
 return {kind,scale,trak,mdia,mdhd,minf,stbl,tkhd,stsd,stss:sync,positions,sizes,dts,durations,compositions,ctsBox};
}
function cutTrack(track,start,duration){
 const {scale,dts,durations,stss,kind}=track;
 const firstTick=start*scale,endTick=(start+duration)*scale;
 let a=0;while(a<dts.length-1&&dts[a+1]<=firstTick)a++;
 if(kind==='vide'){
  if(!stss)return null;const before=stss.filter(i=>i<=a);if(!before.length)return null;a=before[before.length-1];
  if((firstTick-dts[a])/scale>5)return null; // Don't copy a long GOP as a "fast" cut.
 }
 let b=a+1;while(b<dts.length&&dts[b]<endTick)b++;
 if(b===dts.length&&dts[b-1]+durations[b-1]<endTick-scale*.15)return null;
 const sizes=track.sizes.slice(a,b),positions=track.positions.slice(a,b),durationTicks=track.durations.slice(a,b);
 const sampleLength=sizes.reduce((n,x)=>n+x,0);
 const editTick=Math.max(0,Math.round(firstTick-dts[a]));
 const composition=track.compositions.length?track.compositions.slice(a,b):[];
 const sync=stss?.filter(i=>i>=a&&i<b).map(i=>i-a+1)||[];
 return {...track,a,b,sizes,positions,durationTicks,composition,sync,sampleLength,editTick};
}
function makeStbl(v,t,chunkOffset){
 const rows=compact(t.durationTicks.map(x=>[1,x]));
 const n=t.sizes.length;
 const sizes=new Uint8Array(12+4*n),sz=new DataView(sizes.buffer);
 put32(sz,8,n);t.sizes.forEach((s,i)=>put32(sz,12+i*4,s));
 const map=new Uint8Array(20),m=new DataView(map.buffer);put32(m,4,1);put32(m,8,1);put32(m,12,n);put32(m,16,1);
 const off=new Uint8Array(12),o=new DataView(off.buffer);put32(o,4,1);put32(o,8,chunkOffset);
 const subs=[raw(v,t.stsd),entries('stts',rows)];
 if(t.composition.length){const ctts=entries('ctts',compact(t.composition.map(x=>[1,x])));if(t.ctsBox&&v.getUint8(t.ctsBox.body)===1)ctts[8]=1;subs.push(ctts)}
 subs.push(atom('stsc',map),atom('stsz',sizes),atom('stco',off));
 if(t.kind==='vide'){
  const indices=new Uint8Array(8+4*t.sync.length),d=new DataView(indices.buffer);put32(d,4,t.sync.length);t.sync.forEach((x,i)=>put32(d,8+i*4,x));subs.push(atom('stss',indices));
 }
 return atom('stbl',...subs);
}
function rewrite(v,parent,replace){const all=boxes(v,parent.body,parent.end);if(!all)throw Error('bad atoms');return atom(parent.type,...all.map(b=>replace[b.type]?.(b)??raw(v,b)))}
function buildTrack(v,t,duration,movieScale,dataOffset){
 const mediaDuration=t.durationTicks.reduce((a,x)=>a+x,0)/t.scale;
 const tkhd=patchDuration(v,t.tkhd,duration,movieScale),mdhd=patchDuration(v,t.mdhd,mediaDuration,t.scale);
 if(!tkhd||!mdhd)return null;
 const minf=rewrite(v,t.minf,{stbl:()=>makeStbl(v,t,dataOffset)});
 const mdia=rewrite(v,t.mdia,{mdhd:()=>mdhd,minf:()=>minf});
 const elst=new Uint8Array(20),ed=new DataView(elst.buffer);
 put32(ed,4,1);put32(ed,8,Math.round(duration*movieScale));put32(ed,12,t.editTick);ed.setInt16(16,1);
 const trackAtoms=boxes(v,t.trak.body,t.trak.end).filter(x=>x.type!=='edts');
 return atom('trak',...trackAtoms.map(x=>x.type==='tkhd'?tkhd:x.type==='mdia'?mdia:raw(v,x)),atom('edts',atom('elst',elst)));
}
function buildMovie(v,moov,tracks,duration,movieScale,offsets){
 const all=boxes(v,moov.body,moov.end),result=[];
 for(const item of all){
  if(item.type==='mvhd'){
   const mvhd=patchDuration(v,item,duration,movieScale);if(!mvhd)return null;result.push(mvhd);
  }else if(item.type==='trak'){
   const i=tracks.findIndex(t=>t.trak.start===item.start);
   if(i>=0){const built=buildTrack(v,tracks[i],duration,movieScale,offsets[i]);if(!built)return null;result.push(built)}
  }else if(!['mvex','meta'].includes(item.type))result.push(raw(v,item));
 }
 return atom('moov',...result);
}
function slices(blob,t){const parts=[];let prev=-1,size=0;for(let i=0;i<t.positions.length;i++){
 const at=t.positions[i],bytes=t.sizes[i];if(at===prev+size)size+=bytes;else{if(size)parts.push(blob.slice(prev,prev+size));prev=at;size=bytes}
 }if(size)parts.push(blob.slice(prev,prev+size));return parts}
/** Return null for unfamiliar containers, codecs or edit patterns. Caller then transcodes. */
export async function fastCutMP4({blob,start,duration,keepAudio=true,signal}){
 if(!(blob instanceof Blob)||!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<1||duration>90||signal?.aborted)return null;
 if(blob.size>512*1048576)return null;
 const top=[],ranges=[];
 for(let pos=0;pos+8<=blob.size;){
  if(signal?.aborted)return null;
  const header=new DataView(await blob.slice(pos,pos+16).arrayBuffer());
  let len=u32(header,0),headerSize=8;
  if(len===1){if(header.byteLength<16)return null;len=header.getUint32(8)*4294967296+header.getUint32(12);headerSize=16}
  else if(len===0)len=blob.size-pos;
  if(!Number.isSafeInteger(len)||len<headerSize||pos+len>blob.size)return null;
  const type=name(header,4);top.push({type,at:pos,size:len});if(type==='mdat')ranges.push({from:pos+headerSize,to:pos+len});pos+=len;
 }
 const ftyp=top.find(x=>x.type==='ftyp'),moov=top.find(x=>x.type==='moov');
 if(!ftyp||ftyp.size>1024*1024||!moov||moov.size>32*1048576||!ranges.length||top.some(x=>x.type==='moof'))return null;
 const mv=new DataView(await blob.slice(moov.at,moov.at+moov.size).arrayBuffer());
 const root=boxes(mv)?.find(x=>x.type==='moov'),mvhd=root&&kid(mv,root,'mvhd');
 if(!root||!mvhd||mv.getUint8(mvhd.body)!==0)return null;
 const scale=u32(mv,mvhd.body+12);if(!scale)return null;
 const candidates=boxes(mv,root.body,root.end).filter(x=>x.type==='trak').map(x=>parseTrack(mv,x,blob.size,ranges)).filter(Boolean);
 if(candidates.filter(t=>t.kind==='vide').length!==1)return null;
 const video=candidates.find(t=>t.kind==='vide'),audio=candidates.find(t=>t.kind==='soun');
 if(keepAudio&&!audio)return null;
 const chosen=[video,...(keepAudio&&audio?[audio]:[])].map(t=>cutTrack(t,start,duration));
 if(chosen.some(t=>!t))return null;
 const total=chosen.reduce((n,t)=>n+t.sampleLength,0);
 if(total<1||total>0xffffffff-8)return null;
 // First pass computes the new moov size; second writes absolute stco offsets.
 let rebuilt=buildMovie(mv,root,chosen,duration,scale,chosen.map(()=>0));if(!rebuilt)return null;
 const prefix=ftyp.size+rebuilt.length+8,offsets=[];let current=prefix;
 for(const t of chosen){offsets.push(current);current+=t.sampleLength}
 rebuilt=buildMovie(mv,root,chosen,duration,scale,offsets);
 if(!rebuilt)return null;
 const head=new Uint8Array(8),h=new DataView(head.buffer);put32(h,0,total+8);head.set(enc.encode('mdat'),4);
 return new Blob([blob.slice(ftyp.at,ftyp.at+ftyp.size),rebuilt,head,...chosen.flatMap(t=>slices(blob,t))],{type:'video/mp4'});
}

// Fast premiere mux: retain H.264 samples and replace only the AAC sound.
// The caller supplies AAC access units generated by WebCodecs from an offline
// Web Audio mix. Unsupported ASC/timestamps/containers return null; no video
// or voice data is modified.
function aacDescription(v,t){
 const entry=boxes(v,t.stsd.body+8,t.stsd.end)?.[0];
 if(!entry||entry.type!=='mp4a'||entry.end<entry.body+28)return null;
 const channels=v.getUint16(entry.body+16);
 const sampleRate=u32(v,entry.body+24)>>>16;
 const esds=boxes(v,entry.body+28,entry.end)?.find(b=>b.type==='esds');
 if(!esds)return null;
 for(let p=esds.body+4;p+3<esds.end;p++){
  if(v.getUint8(p)!==5)continue;
  let size=0,q=p+1;
  for(let i=0;i<4;i++){
   if(q>=esds.end)break;
   const b=v.getUint8(q++);size=size*128+(b&127);
   if(!(b&128))break;
  }
  if(size>=2&&size<=16&&q+size<=esds.end)
   return {channels,sampleRate,asc:new Uint8Array(v.buffer,v.byteOffset+q,size).slice()};
 }
 return null;
}
/** Preflight: WebCodecs can mux just the selected H.264 segment with fresh AAC. */
export async function inspectFastDubMP4(blob,signal){
 if(!(blob instanceof Blob)||blob.size>512*1048576||blob.size===0||signal?.aborted)return null;
 let moov=null;
 for(let at=0;at+8<=blob.size;){
  if(signal?.aborted)return null;
  const header=new DataView(await blob.slice(at,at+16).arrayBuffer());
  let len=u32(header,0);if(len===1)len=header.getUint32(8)*4294967296+header.getUint32(12);
  else if(len===0)len=blob.size-at;
  if(!Number.isSafeInteger(len)||len<8||at+len>blob.size)return null;
  if(name(header,4)==='moov'){if(len>32*1048576)return null;moov=new DataView(await blob.slice(at,at+len).arrayBuffer());break}
  at+=len;
 }
 if(!moov)return null;
 const root=boxes(moov)?.find(b=>b.type==='moov');
 if(!root)return null;
 const tracks=boxes(moov,root.body,root.end).filter(b=>b.type==='trak');
 const audio=tracks.map(b=>parseTrack(moov,b,blob.size,[{from:0,to:blob.size}])).find(t=>t?.kind==='soun');
 return audio?aacDescription(moov,audio):null;
}
/** Return a standalone MP4 with copied H.264 video and new AAC audio samples. */
export async function fastDubMP4({blob,start,duration,frames,description,signal}){
 if(!(blob instanceof Blob)||!Array.isArray(frames)||!frames.length||
    !Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<1||duration>90||
    signal?.aborted)return null;
 const top=[],ranges=[];
 for(let pos=0;pos+8<=blob.size;){
  if(signal?.aborted)return null;
  const header=new DataView(await blob.slice(pos,pos+16).arrayBuffer());
  let len=u32(header,0),head=8;
  if(len===1){len=header.getUint32(8)*4294967296+header.getUint32(12);head=16}
  else if(len===0)len=blob.size-pos;
  if(!Number.isSafeInteger(len)||len<head||pos+len>blob.size)return null;
  const type=name(header,4);top.push({type,at:pos,size:len});
  if(type==='mdat')ranges.push({from:pos+head,to:pos+len});
  pos+=len;
 }
 const ftyp=top.find(x=>x.type==='ftyp'),moov=top.find(x=>x.type==='moov');
 if(!ftyp||ftyp.size>1048576||!moov||moov.size>32*1048576||
    !ranges.length||top.some(x=>x.type==='moof'))return null;
 const mv=new DataView(await blob.slice(moov.at,moov.at+moov.size).arrayBuffer());
 const root=boxes(mv)?.find(x=>x.type==='moov'),mvhd=root&&kid(mv,root,'mvhd');
 if(!root||!mvhd||mv.getUint8(mvhd.body)!==0)return null;
 const scale=u32(mv,mvhd.body+12);if(!scale)return null;
 const tracks=boxes(mv,root.body,root.end).filter(x=>x.type==='trak').map(x=>parseTrack(mv,x,blob.size,ranges)).filter(Boolean);
 if(tracks.filter(t=>t.kind==='vide').length!==1||tracks.filter(t=>t.kind==='soun').length!==1)return null;
 const video=cutTrack(tracks.find(t=>t.kind==='vide'),start,duration);
 const template=tracks.find(t=>t.kind==='soun'),spec=aacDescription(mv,template);
 if(!video||!spec||!(description instanceof Uint8Array)||description.length!==spec.asc.length||
    description.some((n,i)=>n!==spec.asc[i]))return null;
 const frameDuration=1024; // AAC-LC access units are exactly 1024 samples.
 const expected=duration*spec.sampleRate,actual=frames.length*frameDuration;
 if(Math.abs(actual-expected)>frameDuration*2)return null;
 if(frames.some((f,i)=>!(f?.data instanceof Uint8Array)||!f.data.length||f.data.length>1048576||
    !Number.isFinite(f.timestamp)||Math.abs(f.timestamp-i*frameDuration*1e6/spec.sampleRate)>24000))return null;
 const audio={
  ...template,sizes:frames.map(f=>f.data.length),
  durationTicks:frames.map(()=>frameDuration),positions:[],composition:[],sync:[],editTick:0,
  sampleLength:frames.reduce((sum,f)=>sum+f.data.byteLength,0)
 };
 if(video.sampleLength+audio.sampleLength>0xffffffff-8)return null;
 const chosen=[video,audio];
 let rebuilt=buildMovie(mv,root,chosen,duration,scale,[0,0]);if(!rebuilt)return null;
 const positions=[],startOffset=ftyp.size+rebuilt.length+8;
 let offset=startOffset;for(const t of chosen){positions.push(offset);offset+=t.sampleLength}
 rebuilt=buildMovie(mv,root,chosen,duration,scale,positions);if(!rebuilt)return null;
 const head=new Uint8Array(8),h=new DataView(head.buffer);
 put32(h,0,video.sampleLength+audio.sampleLength+8);head.set(enc.encode('mdat'),4);
 return new Blob([blob.slice(ftyp.at,ftyp.at+ftyp.size),rebuilt,head,
  ...slices(blob,video),...frames.map(f=>f.data)],{type:'video/mp4'});
}
