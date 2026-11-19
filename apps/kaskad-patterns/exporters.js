import { cloneWorld, stepWorld } from './engine.js';
import { rasterize } from './renderer.js';
const little=(a,n)=>{a.push(n&255,(n>>8)&255);};
function lzw(indices) {
  const bytes=[];let bits=0,pending=0,size=9,next=258;
  const clear=256,end=257,dict=new Map();
  const put=(code)=>{pending|=code<<bits;bits+=size;while(bits>=8){bytes.push(pending&255);pending>>>=8;bits-=8;}};
  const reset=()=>{dict.clear();size=9;next=258;};
  put(clear);
  let previous=indices[0];
  for(let i=1;i<indices.length;i++){
    const value=indices[i],key=previous*256+value;
    if(dict.has(key)){previous=dict.get(key);continue;}
    put(previous);
    if(next<4096){
      dict.set(key,next++);
      if(next===(1<<size)&&size<12)size++;
    }else{put(clear);reset();}
    previous=value;
  }
  put(previous);put(end);
  if(bits>0)bytes.push(pending&255);
  return bytes;
}
export function makeGif(world,palette,frames=22) {
  const w=cloneWorld(world),n=w.n,bytes=[71,73,70,56,57,97];
  little(bytes,n);little(bytes,n);bytes.push(0xf7,0,0);
  for(let i=0;i<256;i++)bytes.push(Math.round(((i>>5)&7)*255/7),Math.round(((i>>2)&7)*255/7),Math.round((i&3)*255/3));
  // Infinite loop extension.
  bytes.push(0x21,0xff,11,...Array.from('NETSCAPE2.0',c=>c.charCodeAt(0)),3,1,0,0,0);
  for(let f=0;f<frames;f++){
    const rgba=rasterize(w,palette).data,indices=new Uint8Array(n*n);
    for(let i=0,p=0;i<indices.length;i++,p+=4)indices[i]=((rgba[p]>>5)<<5)|((rgba[p+1]>>5)<<2)|(rgba[p+2]>>6);
    bytes.push(0x21,0xf9,4,0);little(bytes,10);bytes.push(0,0);
    bytes.push(0x2c);little(bytes,0);little(bytes,0);little(bytes,n);little(bytes,n);bytes.push(0,8);
    const zipped=lzw(indices);
    for(let p=0;p<zipped.length;p+=255){const slice=zipped.slice(p,p+255);bytes.push(slice.length,...slice);}
    bytes.push(0);
    stepWorld(w,w.mode==='sand'?1:w.mode==='ant'?200:4);
  }
  bytes.push(0x3b);
  return new Blob([Uint8Array.from(bytes)],{type:'image/gif'});
}
export function makePng(canvas) {
  const target=document.createElement('canvas');target.width=1280;target.height=1280;
  const ctx=target.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,0,0,1280,1280);
  return new Promise(resolve=>target.toBlob(resolve,'image/png'));
}
export function saveBlob(blob,name){
  if(!blob)throw Error('Не удалось создать файл');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
