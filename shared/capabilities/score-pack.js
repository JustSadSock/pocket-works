// Load a published Forge score pack without browser resampling of its musical grid.
const safeFile=/^(states|adaptive|bridges)\/[a-z0-9-]+\.wav$/;
export function decodeForgeWav(context,bytes,frames,sampleRate){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==44+frames*4)throw Error('Wrong Forge WAV length');
 const v=new DataView(bytes),tag=(at,s)=>[...s].every((c,i)=>v.getUint8(at+i)===c.charCodeAt(0));
 if(!tag(0,'RIFF')||v.getUint32(4,true)!==bytes.byteLength-8||!tag(8,'WAVE')||!tag(12,'fmt ')||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==2||v.getUint32(24,true)!==sampleRate||v.getUint32(28,true)!==sampleRate*4||v.getUint16(32,true)!==4||v.getUint16(34,true)!==16||!tag(36,'data')||v.getUint32(40,true)!==frames*4)throw Error('Invalid Forge PCM header');
 const b=context.createBuffer(2,frames,sampleRate);
 for(let c=0;c<2;c++){const a=b.getChannelData(c);for(let i=0;i<frames;i++)a[i]=v.getInt16(44+i*4+c*2,true)/32768;}
 return b;
}
export async function loadForgeScore({context,graph,metrics,baseUrl,fetcher=globalThis.fetch,signal,maxDecodedBytes=128*1024*1024,adaptive=true}={}){
 if(!context||!graph||graph.version!==1||!graph.states||!graph.edges||!Array.isArray(metrics?.metrics)||typeof fetcher!=='function'||!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<1)throw Error('Invalid score pack');
 const root=new URL(baseUrl);
 if(!['http:','https:'].includes(root.protocol)||!root.pathname.endsWith('/')||root.search||root.hash)throw Error('Invalid score root');
 const records=new Map();
 for(const m of metrics.metrics){if(records.has(m.file))throw Error('Duplicate score metric');records.set(m.file,m);}
 const entries=Object.entries(graph.states);
 if(!entries.length||entries.length>32||!Object.hasOwn(graph.states,graph.initial))throw Error('Invalid score states');
 const files=new Map(),stateDefs=new Map(),bridgeDefs=new Map();
 function add(d){
  if(!d||!safeFile.test(d.file)||!Number.isSafeInteger(d.frames)||d.frames<2||d.sampleRate!==48000)throw Error('Invalid score asset');
  const m=records.get(d.file);
  if(!m||m.frames!==d.frames||!(/^[a-f0-9]{64}$/).test(m.sha256))throw Error('Missing score integrity record');
  const prev=files.get(d.file);
  if(prev&&(prev.frames!==d.frames||prev.sha256!==m.sha256))throw Error('Conflicting score asset');
  files.set(d.file,{...d,sha256:m.sha256});return d;
 }
 for(const [id,s] of entries){
  if(!Array.isArray(graph.edges[id])||graph.edges[id].some(to=>!Object.hasOwn(graph.states,to)||to===id))throw Error('Invalid score edge');
  if(!Number.isFinite(s.tempo)||s.tempo<20||s.tempo>300||!Number.isInteger(s.beatsPerBar)||s.beatsPerBar<1||s.beatsPerBar>16||!Number.isInteger(s.bars)||s.bars<1||s.bars>128)throw Error('Invalid score grid');
  const a=adaptive?graph.adaptive?.[id]:null,base=add(a?.base??s),detail=a?add(a.detail):null;
  if(Math.abs(base.frames-60/s.tempo*s.beatsPerBar*s.bars*48000)>1.01||detail&&detail.frames!==base.frames)throw Error('Unaligned score assets');
  stateDefs.set(id,{base,detail});
 }
 for(const [edge,d] of Object.entries(graph.bridges??{})){
  const [from,to,...rest]=edge.split(':');
  if(rest.length||!graph.edges[from]?.includes(to)||!stateDefs.has(to)||d.frames>15*48000)throw Error('Invalid bridge');
  bridgeDefs.set(edge,add(d));
 }
 const baseBytes=[...files.values()].reduce((sum,d)=>sum+d.frames*8,0);
 const largest=Math.max(0,...[...bridgeDefs].map(([edge,d])=>{const s=stateDefs.get(edge.split(':')[1]);return (d.frames+s.base.frames)*8*(s.detail?2:1)}));
 const reservedBytes=baseBytes+2*largest;
 if(!Number.isSafeInteger(reservedBytes)||reservedBytes>maxDecodedBytes)throw Error('Score pack memory budget exceeded before fetch');
 const loaded=new Map();
 for(const [file,d] of files){
  if(signal?.aborted)throw Error('Score loading aborted');
  const response=await fetcher(new URL(file,root).href,{signal});
  if(!response.ok)throw Error('Score fetch failed '+file);
  const expected=44+d.frames*4;
  const declared=response.headers?.get('content-length');
  if(declared!==null&&declared!==undefined&&Number(declared)!==expected)throw Error('Score content length mismatch');
  const data=await response.arrayBuffer();
  if(data.byteLength!==expected)throw Error('Score asset length mismatch');
  const hash=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==d.sha256)throw Error('Score asset hash mismatch '+file);
  if(signal?.aborted)throw Error('Score loading aborted');
  loaded.set(file,decodeForgeWav(context,data,d.frames,d.sampleRate));
 }
 const buffers=Object.create(null),layers=Object.create(null),bridgeBuffers=Object.create(null);
 for(const [id,{base,detail}] of stateDefs){
  buffers[id]=loaded.get(base.file);
  if(detail)layers[id]=[{id:detail.id,buffer:loaded.get(detail.file),base:detail.base,threshold:detail.threshold,width:detail.width,gain:detail.gain}];
 }
 for(const [edge,d] of bridgeDefs)bridgeBuffers[edge]=loaded.get(d.file);
 return {graph,buffers,layers,bridgeBuffers,baseBytes,reservedBytes,files:files.size};
}
