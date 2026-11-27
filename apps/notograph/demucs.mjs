import {neuralAnalyze} from './neural.mjs';
import {readAnalysis} from './advanced.mjs';
export const MODEL_URL='https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx';
export const STEMS=['drums','bass','other','vocals'];
export const CHUNK=343980,OVERLAP=Math.floor(CHUNK/4),STRIDE=CHUNK-OVERLAP,SR=44100;
export async function separateStereo(stereo,session,Tensor,progress=()=>{}){
 if(!Array.isArray(stereo)||stereo.length!==2||stereo.some(a=>!(a instanceof Float32Array)||a.length!==stereo[0].length)||!stereo[0].length||stereo[0].length>30*SR)throw Error('Demucs: требуется стерео 44,1 кГц, не более 30 секунд.');
 const n=stereo[0].length,out=STEMS.map(()=>[new Float32Array(n),new Float32Array(n)]),weight=new Float32Array(n);
 for(let start=0;start<n;start+=STRIDE){
  const count=Math.min(CHUNK,n-start),chunk=new Float32Array(2*CHUNK);
  for(let c=0;c<2;c++)chunk.set(stereo[c].subarray(start,start+count),c*CHUNK);
  const tensor=new Tensor('float32',chunk,[1,2,CHUNK]);let result;
  try{
   result=await session.run({mix:tensor});const y=result.stems;
   if(!y||y.dims.join(',')!=='1,4,2,'+CHUNK||y.data.length!==8*CHUNK)throw Error('Неверная геометрия выходного тензора Demucs.');
   for(let i=0;i<count;i++){
    const w=Math.min(1,start===0?1:(i+1)/OVERLAP,start+count===n?1:(CHUNK-i)/OVERLAP);
    weight[start+i]+=w;
    for(let s=0;s<4;s++)for(let c=0;c<2;c++){
     const sample=y.data[(2*s+c)*CHUNK+i];if(!Number.isFinite(sample))throw Error('Нечисловой выход модели.');
     out[s][c][start+i]+=sample*w;
    }
   }
  }finally{tensor.dispose?.();for(const t of Object.values(result||{}))t.dispose?.()}
  progress(Math.min(1,(start+count)/n));
  if(start+count===n)break;
 }
 for(let i=0;i<n;i++){if(!(weight[i]>0))throw Error('Пропуск в overlap-add');for(const stem of out)for(const channel of stem)channel[i]/=weight[i]}
 return out;
}
export function stereoWav(pair){
 const n=pair[0].length,buf=new ArrayBuffer(44+n*4),v=new DataView(buf);
 for(const [o,s] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));
 v.setUint32(4,buf.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,SR,true);v.setUint32(28,SR*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,n*4,true);
 for(let i=0;i<n;i++)for(let c=0;c<2;c++)v.setInt16(44+i*4+c*2,Math.round(Math.max(-1,Math.min(1,pair[c][i]))*32767),true);
 return buf;
}
export function toMono22(pair){
 const n=Math.floor(pair[0].length/2),out=new Float32Array(n);
 // Windowed-sinc anti-alias filtering for decimation by two.
 const kernel=Array.from({length:33},(_,i)=>{const k=i-16;return (k===0?.45:Math.sin(Math.PI*.45*k)/(Math.PI*k))*(.5+.5*Math.cos(Math.PI*k/17))});
 const norm=kernel.reduce((a,b)=>a+b,0);
 for(let i=0;i<n;i++){let s=0;for(let k=-16;k<=16;k++){const j=2*i+k;if(j>=0&&j<pair[0].length)s+=(pair[0][j]+pair[1][j])*.5*kernel[k+16]}out[i]=s/norm}
 return out;
}
export async function demucsAnalyze(stereo,progress=()=>{},runtime,modelUrl=MODEL_URL){
 const ort=runtime??await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.mjs');
 ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
 const session=await ort.InferenceSession.create(modelUrl,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
 let separated;
 try{if(session.inputNames.join()!=='mix'||!session.outputNames.includes('stems'))throw Error('Неподдерживаемая модель Demucs.');separated=await separateStereo(stereo,session,ort.Tensor,p=>progress(.55*p))}
 finally{await session.release()}
 const stems=[],audio=[];
 for(let i=0;i<STEMS.length;i++){
  const id=STEMS[i],wav=stereoWav(separated[i]),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',wav)),x=>x.toString(16).padStart(2,'0')).join('');
  const tracks=id==='drums'?[]:await neuralAnalyze(toMono22(separated[i]),p=>progress(.55+.45*(i+p)/4));
  stems.push({id,file:id+'.wav',sha256:hash,notes:tracks.flatMap(t=>t.events.map(({pitch,start,end,confidence})=>({pitch,start,end,confidence})))});
  audio.push({id,wav});progress(.55+.45*(i+1)/4);
 }
 const parsed=readAnalysis({schema:'notograph-analysis-v1',duration:stereo[0].length/SR,stems,title:'Разделённая композиция'});
 return {...parsed,audio};
}
