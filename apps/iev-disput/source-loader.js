import { SOURCE_PACK_1 } from './source-pack-1.js';
import { SOURCE_PACK_2 } from './source-pack-2.js';
import { SOURCE_PACK_3 } from './source-pack-3.js';
import { SOURCE_PACK_4 } from './source-pack-4.js';

let sourcePromise=null;

export function loadSourceSections(){
  if(sourcePromise) return sourcePromise;
  sourcePromise=(async()=>{
    if(typeof DecompressionStream!=='function') return [];
    try{
      const packed=SOURCE_PACK_1+SOURCE_PACK_2+SOURCE_PACK_3+SOURCE_PACK_4;
      const binary=atob(packed);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    }catch{return []}
  })();
  return sourcePromise;
}
