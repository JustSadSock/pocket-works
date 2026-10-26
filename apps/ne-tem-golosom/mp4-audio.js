// Fast, bounded-memory extraction of AAC audio from standard MP4/MOV with
// WebCodecs. Reads only moov metadata and the selected compressed AAC packets.
// No video frames are decoded, no full-file ArrayBuffer is ever constructed.
// Unsupported codecs, fragmented MP4 or unusual edit lists use the fallback.
const RATE=44100;
const u32=(v,p)=>v.getUint32(p,false);
const str=(v,p,n=4)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,n));
function boxes(v,from=0,end=v.byteLength){
 const result=[];
 while(from+8<=end){
  let size=u32(v,from),head=8;
  const type=str(v,from+4);
  if(size===1){
   if(from+16>end)break;
   const hi=u32(v,from+8),lo=u32(v,from+12);
   size=hi*4294967296+lo;head=16;
  }else if(size===0)size=end-from;
  if(!Number.isSafeInteger(size)||size<head||from+size>end)break;
  result.push({type,from,body:from+head,end:from+size});
  from+=size;
 }
 return result;
}
const child=(v,b,name)=>boxes(v,b.body,b.end).find(x=>x.type===name);
function table(v,b,word=4){
 if(!b)return null;
 const count=u32(v,b.body+4),start=b.body+8;
 if(count>1000000||start+count*word>b.end)return null;
 return Array.from({length:count},(_,i)=>{
  const at=start+i*word;
  if(word===8){const val=u32(v,at)*4294967296+u32(v,at+4);return Number.isSafeInteger(val)?val:NaN}
  return u32(v,at);
 });
}
async function metadata(blob,signal,diagnostics=[]){
 let moov=null;
 for(let at=0;at<blob.size;){
  if(signal?.aborted)throw new DOMException('Обработка отменена','AbortError');
  const header=new DataView(await blob.slice(at,at+16).arrayBuffer());
  if(header.byteLength<8)break;
  let size=u32(header,0),head=8;const name=str(header,4);
  if(size===1){if(header.byteLength<16)break;size=u32(header,8)*4294967296+u32(header,12);head=16}
  else if(size===0)size=blob.size-at;
  if(!Number.isSafeInteger(size)||size<head||at+size>blob.size)break;
  if(name==='moov'){
   if(size>32*1048576)break; // Metadata cap on low-memory devices.
   moov=new DataView(await blob.slice(at,at+size).arrayBuffer());
   break;
  }
  at+=size;
 }
 if(!moov){diagnostics.push('no-moov');return null}
 const root=boxes(moov).find(x=>x.type==='moov');
 if(!root){diagnostics.push('bad-moov');return null}
 for(const trak of boxes(moov,root.body,root.end).filter(x=>x.type==='trak')){
  const mdia=child(moov,trak,'mdia'),hdlr=mdia&&child(moov,mdia,'hdlr');
  if(!hdlr||str(moov,hdlr.body+8)!=='soun')continue;
  diagnostics.push('audio-track');
  const mdhd=child(moov,mdia,'mdhd'),minf=child(moov,mdia,'minf'),
   stbl=minf&&child(moov,minf,'stbl');
  if(!mdhd||!stbl){diagnostics.push('no-stbl');continue}
  const version=moov.getUint8(mdhd.body);
  const timescale=u32(moov,mdhd.body+(version===1?20:12));
  if(timescale<1)continue;
  const stsd=child(moov,stbl,'stsd'),stsz=child(moov,stbl,'stsz'),
   stsc=child(moov,stbl,'stsc'),stts=child(moov,stbl,'stts');
  const offsets=table(moov,child(moov,stbl,'stco'))||
   table(moov,child(moov,stbl,'co64'),8);
  if(!stsd||!stsz||!stsc||!stts||!offsets?.length){diagnostics.push('missing-stbl-tables');continue}
  const entry=boxes(moov,stsd.body+8,stsd.end)[0];
  if(entry?.type!=='mp4a'||entry.body+28>entry.end){diagnostics.push('entry:'+String(entry?.type));continue}
  const channels=moov.getUint16(entry.body+16);
  const sampleRate=u32(moov,entry.body+24)>>>16;
  if(channels<1||channels>2||sampleRate<8000||sampleRate>192000)continue;
  const esds=boxes(moov,entry.body+28,entry.end).find(x=>x.type==='esds');
  if(!esds){diagnostics.push('no-esds');continue}
  let asc=null;
  for(let p=esds.body+4;p+3<esds.end;p++){
   if(moov.getUint8(p)!==5)continue;
   let size=0,q=p+1;
   for(let i=0;i<4;i++){
    if(q>=esds.end)break;
    const b=moov.getUint8(q++);size=(size<<7)|(b&127);
    if(!(b&128))break;
   }
   if(size>=2&&size<=16&&q+size<=esds.end){
    asc=new Uint8Array(moov.buffer.slice(q,q+size));break;
   }
  }
  if(!asc){diagnostics.push('no-asc');continue}
  const codecType=(asc[0]>>3)&31;
  if(codecType!==2&&codecType!==5&&codecType!==29){diagnostics.push('aac-object:'+codecType);continue}
  const sizesCount=u32(moov,stsz.body+8),constant=u32(moov,stsz.body+4);
  if(sizesCount<1||sizesCount>1000000){diagnostics.push('sample-count:'+sizesCount);continue}
  if(!constant&&stsz.body+12+sizesCount*4>stsz.end)continue;
  const sizeAt=i=>constant||u32(moov,stsz.body+12+i*4);
  const mappings=table(moov,stsc,12); // custom record parsing below
  if(!mappings||mappings.length<1){diagnostics.push('stsc-invalid');continue}
  const maps=Array.from({length:u32(moov,stsc.body+4)},(_,i)=>({
   first:u32(moov,stsc.body+8+i*12),
   count:u32(moov,stsc.body+12+i*12),
   description:u32(moov,stsc.body+16+i*12)
  }));
  if(maps.some(x=>x.first<1||x.count<1||x.description!==1))continue;
  const durations=Array.from({length:u32(moov,stts.body+4)},(_,i)=>({
   count:u32(moov,stts.body+8+i*8),delta:u32(moov,stts.body+12+i*8)
  }));
  if(durations.length>100000||durations.some(x=>x.delta<1))continue;
  const edit=child(moov,trak,'edts'),list=edit&&child(moov,edit,'elst');
  let mediaShift=0;
  if(list){
   const version=moov.getUint8(list.body),entries=u32(moov,list.body+4);
   const mvhd=child(moov,root,'mvhd');
   const movieRate=mvhd&&u32(moov,mvhd.body+(moov.getUint8(mvhd.body)===1?20:12));
   if(entries<1||entries>2||!movieRate){diagnostics.push('edit-count:'+entries);continue}
   const word=version===1?8:4,stride=word*2+4;
   let leading=0,ok=true,found=false;
   for(let i=0;i<entries;i++){
    const at=list.body+8+i*stride;
    if(at+stride>list.end){ok=false;break}
    const readTime=p=>word===8?
      Number(moov.getBigInt64(p,false)):moov.getInt32(p,false);
    const length=word===8?
      u32(moov,at)*4294967296+u32(moov,at+4):u32(moov,at);
    const mediaTime=readTime(at+word),rate=moov.getInt16(at+word*2,false);
    if(!Number.isSafeInteger(mediaTime)||!Number.isSafeInteger(length)||rate!==1){ok=false;break}
    if(mediaTime===-1&&i===0){leading+=length/movieRate;continue}
    // One real media interval, optionally preceded by initial silence.
    if(mediaTime<0||i!==entries-1){ok=false;break}
    mediaShift=mediaTime/timescale-leading;
    found=true;
   }
   if(!ok||!found){diagnostics.push('unsupported-edit-list');continue}
  }
  diagnostics.push('aac-meta-ok');
  return {timescale,sampleRate,channels,asc,sizesCount,sizeAt,offsets,maps,durations,mediaShift};
 }
 return null;
}
export async function inspectMp4AAC(blob){
 const m=await metadata(blob,null,[]);
 return m?{codec:'mp4a.40.2',sampleRate:m.sampleRate,channels:m.channels,timescale:m.timescale,sampleCount:m.sizesCount,chunkCount:m.offsets.length,mediaShift:m.mediaShift}:null;
}
export async function extractMp4AAC(blob,start,duration,{signal,onProgress=()=>{}}={}){
 if(typeof AudioDecoder==='undefined'||typeof EncodedAudioChunk==='undefined')return null;
 if(!/mp4|quicktime|octet-stream|^$/.test(blob.type)&&!/(\.mp4|\.m4v|\.mov)$/i.test(blob.name||''))return null;
 const diagnostic=[];
 const meta=await metadata(blob,signal,diagnostic);
 if(!meta){onProgress({stage:'decode',detail:'AAC metadata: '+diagnostic.join(',')});return null}
 const config={codec:'mp4a.40.2',description:meta.asc,sampleRate:meta.sampleRate,numberOfChannels:meta.channels};
 let supported;
 try{supported=await AudioDecoder.isConfigSupported(config)}catch{return null}
 if(!supported?.supported){onProgress({stage:'decode',detail:'AAC decoder unsupported '+meta.sampleRate+'Hz/'+meta.channels+'ch'});return null}
 const end=start+duration,lead=start-.12,samples=[];
 let ordinal=0,t=0,di=0,within=0;
 for(let ci=0;ci<meta.offsets.length;ci++){
  let sampleOffset=meta.offsets[ci];
  const mapping=meta.maps.findLast(x=>x.first<=ci+1);
  if(!mapping)return null;
  for(let j=0;j<mapping.count&&ordinal<meta.sizesCount;j++){
   const size=meta.sizeAt(ordinal);
   while(di<meta.durations.length&&within>=meta.durations[di].count){di++;within=0}
   const step=meta.durations[di]?.delta;
   if(!step||!size||size>1000000)return null;
   const time=t/meta.timescale-meta.mediaShift;
   if(time>=lead&&time<end+.1)samples.push({offset:sampleOffset,size,time});
   sampleOffset+=size;t+=step;within++;ordinal++;
  }
  if(t/meta.timescale>end+.2)break;
 }
 if(samples.length<1)return null;
 const pcm=[new Float32Array(Math.round(duration*RATE)),new Float32Array(Math.round(duration*RATE))];
 let copied=0,decoderError=null;
 const decoder=new AudioDecoder({
  output:data=>{
   try{
    const srcRate=data.sampleRate,frameTime=data.timestamp/1000000;
    const first=Math.max(0,Math.ceil((frameTime-start)*RATE)),
     last=Math.min(pcm[0].length,Math.ceil((frameTime-start+data.numberOfFrames/srcRate)*RATE));
    if(last>first){
     const planes=Array.from({length:Math.min(data.numberOfChannels,2)},()=>new Float32Array(data.numberOfFrames));
     for(let ch=0;ch<planes.length;ch++)data.copyTo(planes[ch],{planeIndex:ch,format:'f32-planar'});
     for(let i=first;i<last;i++){
      const pos=(start+i/RATE-frameTime)*srcRate,index=Math.max(0,Math.min(planes[0].length-1,Math.floor(pos))),
       factor=Math.max(0,Math.min(1,pos-index)),next=Math.min(index+1,planes[0].length-1);
      for(let ch=0;ch<2;ch++){
       const plane=planes[Math.min(ch,planes.length-1)];
       pcm[ch][i]=plane[index]*(1-factor)+plane[next]*factor;
      }
     }
     copied+=last-first;
    }
   }catch(e){decoderError=e}finally{data.close()}
  },
  error:e=>{decoderError=e}
 });
 try{
  decoder.configure(config);
  // Limit compressed packet staging to 256 KiB. Never read video mdat as one blob.
  let cacheFrom=-1,cache=new Uint8Array(0);
  for(let i=0;i<samples.length;i++){
   if(signal?.aborted)throw new DOMException('Обработка отменена','AbortError');
   if(decoderError)throw decoderError;
   const item=samples[i];
   if(item.offset<cacheFrom||item.offset+item.size>cacheFrom+cache.length){
    cacheFrom=item.offset;
    cache=new Uint8Array(await blob.slice(cacheFrom,Math.min(blob.size,cacheFrom+Math.max(262144,item.size))).arrayBuffer());
   }
   const offset=item.offset-cacheFrom;
   decoder.decode(new EncodedAudioChunk({type:'key',timestamp:Math.round(item.time*1000000),
    data:cache.subarray(offset,offset+item.size)}));
   if(i%48===47||decoder.decodeQueueSize>24){
    await decoder.flush();if(decoderError)throw decoderError;
    onProgress({stage:'decode',detail:'Быстро извлекаем AAC · '+Math.round(i/samples.length*100)+'%'});
   }
  }
  await decoder.flush();if(decoderError)throw decoderError;
  if(copied<pcm[0].length*.85)throw Error('AAC-декодер вернул слишком мало аудиоданных.');
  onProgress({stage:'decode',detail:'AAC извлечён напрямую из MP4, без воспроизведения видео'});
  return pcm;
 }finally{decoder.close()}
}
