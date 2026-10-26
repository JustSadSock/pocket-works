// Deterministic standards-based AAC in an audio-only MP4.
// Constructed with browser WebCodecs, no FFmpeg, network or native binaries.
// Includes a common two-entry edit list (empty lead-in + AAC priming).
const bytes=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
const u16=n=>Uint8Array.of((n>>>8)&255,n&255);
const u32=n=>Uint8Array.of((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);
const join=(...all)=>{const total=all.reduce((n,x)=>n+x.length,0),out=new Uint8Array(total);let at=0;for(const x of all){out.set(x,at);at+=x.length}return out};
const box=(name,...payload)=>{const data=join(...payload);return join(u32(data.length+8),bytes(name),data)};
const full=(name,...payload)=>box(name,u32(0),...payload);
const desc=(tag,payload)=>{
 let n=payload.length;const parts=[n&127];n>>=7;
 while(n){parts.unshift((n&127)|128);n>>=7}
 return join(Uint8Array.of(tag,...parts),payload);
};
export async function syntheticAACMP4(){
 if(typeof AudioEncoder!=='function')throw Error('AudioEncoder/WebCodecs unavailable in browser');
 const cfg={codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:1,bitrate:24000};
 const supported=await AudioEncoder.isConfigSupported(cfg);
 if(!supported?.supported)throw Error('This browser does not encode AAC fixture');
 const frames=[];let asc=null,encoderError=null;
 const encoder=new AudioEncoder({
  output:(chunk,metadata)=>{
   const arr=new Uint8Array(chunk.byteLength);chunk.copyTo(arr);
   frames.push({data:arr,delta:Math.max(1,Math.round((chunk.duration||21333)*48000/1e6))});
   if(metadata?.decoderConfig?.description)asc=new Uint8Array(metadata.decoderConfig.description);
  },
  error:e=>{encoderError=e}
 });
 try{
  encoder.configure(cfg);
  const rate=48000,block=4800;
  for(let frame=0;frame<20;frame++){
   const pcm=Float32Array.from({length:block},(_,i)=>.20*Math.sin(Math.PI*2*440*(frame*block+i)/rate));
   const packet=new AudioData({format:'f32-planar',sampleRate:rate,
    numberOfFrames:block,numberOfChannels:1,timestamp:Math.round(frame*block*1e6/rate),data:pcm});
   encoder.encode(packet);packet.close();
  }
  await encoder.flush();
  if(encoderError||frames.length<8)throw Error('AAC encoder fixture failed: '+encoderError);
 }finally{encoder.close()}
 asc=asc||Uint8Array.of(0x11,0x88);
 const totalTicks=frames.reduce((n,f)=>n+f.delta,0);
 const runs=[];
 for(const f of frames){
  const last=runs.at(-1);
  if(last&&last.delta===f.delta)last.count++;
  else runs.push({count:1,delta:f.delta});
 }
 const decSpecific=desc(5,asc);
 const decConfig=desc(4,join(Uint8Array.of(0x40,0x15),new Uint8Array(3),
  u32(64000),u32(64000),decSpecific));
 const es=desc(3,join(u16(2),Uint8Array.of(0),decConfig,desc(6,Uint8Array.of(2))));
 const esds=full('esds',es);
 const entry=box('mp4a',new Uint8Array(6),u16(1),new Uint8Array(8),
  u16(1),u16(16),u16(0),u16(0),u32(48000*65536),esds);
 const stsd=full('stsd',u32(1),entry);
 const stts=full('stts',u32(runs.length),...runs.flatMap(x=>[u32(x.count),u32(x.delta)]));
 const stsc=full('stsc',u32(1),u32(1),u32(frames.length),u32(1));
 const stsz=full('stsz',u32(0),u32(frames.length),...frames.map(f=>u32(f.data.length)));
 const ftyp=box('ftyp',bytes('isom'),u32(512),bytes('isom'),bytes('mp42'));
 const stco=full('stco',u32(1),u32(ftyp.length+8));
 const stbl=box('stbl',stsd,stts,stsc,stsz,stco);
 const dinf=box('dinf',full('dref',u32(1),box('url ',u32(1))));
 const minf=box('minf',full('smhd',u16(0),u16(0)),dinf,stbl);
 const mdhd=full('mdhd',u32(0),u32(0),u32(48000),u32(totalTicks),u16(0x55c4),u16(0));
 const hdlr=full('hdlr',u32(0),bytes('soun'),new Uint8Array(12),bytes('SoundHandler\0'));
 const mdia=box('mdia',mdhd,hdlr,minf);
 const mvhd=full('mvhd',u32(0),u32(0),u32(1000),u32(Math.ceil(totalTicks/48)),new Uint8Array(80));
 const edit=full('elst',u32(2),
  u32(10),u32(0xffffffff),u16(1),u16(0),
  u32(Math.ceil(totalTicks/48)),u32(1024),u16(1),u16(0));
 const moov=box('moov',mvhd,box('trak',box('edts',edit),mdia));
 const mdat=box('mdat',...frames.map(f=>f.data));
 return new Blob([ftyp,mdat,moov],{type:'video/mp4'});
}
