// Runtime-neutral decoder for precomputed cloth playback; no Blender or
// simulation engine is required after the cache has been baked.
export function decodeClothCache(metadata,bytes){
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),count=metadata.frameCount*metadata.vertexCount*3;
 if(data.byteLength!==count*2)throw new Error('Cloth cache byte length mismatch');
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),min=metadata.bounds.min,max=metadata.bounds.max,frames=[];
 let offset=0;
 for(let f=0;f<metadata.frameCount;f++){const positions=new Float32Array(metadata.vertexCount*3);for(let i=0;i<positions.length;i++){const q=view.getUint16(offset,true);offset+=2;const axis=i%3,span=max[axis]-min[axis];positions[i]=span>1e-12?min[axis]+q/65535*span:min[axis]}frames.push(positions)}
 return {frames,fps:metadata.fps,vertexCount:metadata.vertexCount,frameCount:metadata.frameCount,duration:(metadata.frameCount-1)/metadata.fps,encoding:metadata.encoding};
}
export function sampleClothCache(cache,timeSeconds){
 const t=Math.max(0,Math.min(cache.duration,timeSeconds))*cache.fps,a=Math.floor(t),b=Math.min(cache.frameCount-1,a+1),f=t-a,A=cache.frames[a],B=cache.frames[b],out=new Float32Array(A.length);
 for(let i=0;i<out.length;i++)out[i]=A[i]+(B[i]-A[i])*f;
 return out;
}
