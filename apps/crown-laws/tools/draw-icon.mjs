// Deterministic hand-coded raster emblem for Pocket Works. No external art assets.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const SIZE = 96;
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const crown = [[20,35],[30,47],[39,26],[48,44],[57,26],[66,47],[76,35],[72,68],[24,68]];
function insidePolygon(x, y, shape) {
  let inside = false;
  for (let i=0,j=shape.length-1;i<shape.length;j=i++) {
    const [xi,yi]=shape[i], [xj,yj]=shape[j];
    if ((yi>y)!==(yj>y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) {
  const i=(y*SIZE+x)*4;
  const grain=(x*37+y*59+x*y*11)%17-8;
  const edge=x<7||x>88||y<7||y>88;
  const value=(edge?17:35)+grain;
  let r=value+5,g=value+11,b=value+6;
  if(x>12&&x<83&&y>12&&y<83&&(x<15||x>80||y<15||y>80)){r=116;g=103;b=76;}
  if(insidePolygon(x,y,crown)){const light=(x+y)%7;r=194+light;g=164+light;b=102+light;}
  if(y>67&&y<74&&x>20&&x<76){r=225;g=188;b=114;}
  if(y>74&&y<78&&x>24&&x<72){r=88;g=78;b=55;}
  if(y>52&&y<61&&[34,48,62].some(v=>Math.abs(x-v)<4)){r=105;g=51;b=45;}
  pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;pixels[i+3]=255;
}
const rows=Buffer.alloc(SIZE*(1+SIZE*4));
for(let y=0;y<SIZE;y++) pixels.copy(rows,y*(1+SIZE*4)+1,y*SIZE*4,(y+1)*SIZE*4);
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=table[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,payload){const size=Buffer.alloc(4),crc=Buffer.alloc(4),tag=Buffer.from(type);size.writeUInt32BE(payload.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,payload])));return Buffer.concat([size,tag,payload,crc]);}
const header=Buffer.alloc(13);header.writeUInt32BE(SIZE,0);header.writeUInt32BE(SIZE,4);header[8]=8;header[9]=6;
const result=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
writeFileSync(new URL('../icons/icon.png',import.meta.url),result);
console.log('Crown icon written:',result.length,'bytes');
