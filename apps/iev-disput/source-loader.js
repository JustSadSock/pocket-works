import { SOURCE_GZIP_B64 } from './source-packed.js';

export async function loadSourceSections(){
  if(typeof DecompressionStream!=='function') return [];
  try{
    const binary=atob(SOURCE_GZIP_B64);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }catch{return []}
}
