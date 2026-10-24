// Byte-accurate RIFF/WebP envelope validation for the five-tile ballot.
// Reject extended metadata, animation, trailing bytes and non-keyframe VP8.
// This validates the CONTAINER, not the compressed image's pixel semantics;
// a future trusted image decoder must still validate/render the payload.
export function validBallotWebp(value){
 const prefix='data:image/webp;base64,';
 if(typeof value!=='string'||!value.startsWith(prefix)||value.length>450000)return false;
 const raw=value.slice(prefix.length);
 if(raw.length<28||raw.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return false;
 const pad=raw.endsWith('==')?2:raw.endsWith('=')?1:0;
 const size=raw.length/4*3-pad;
 if(size<30||size>337500)return false;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 function byte(i){
  const j=(i/3|0)*4;
  const a=alphabet.indexOf(raw[j]),b=alphabet.indexOf(raw[j+1]);
  const c=alphabet.indexOf(raw[j+2]),d=alphabet.indexOf(raw[j+3]);
  const word=(a<<18)|(b<<12)|(Math.max(c,0)<<6)|Math.max(d,0);
  return (word>>((2-i%3)*8))&255;
 }
 const u16=p=>byte(p)|(byte(p+1)<<8);
 const u24=p=>byte(p)|(byte(p+1)<<8)|(byte(p+2)<<16);
 const u32=p=>(byte(p)|(byte(p+1)<<8)|(byte(p+2)<<16)|(byte(p+3)<<24))>>>0;
 const fourcc=p=>String.fromCharCode(byte(p),byte(p+1),byte(p+2),byte(p+3));
 if(fourcc(0)!=='RIFF'||fourcc(8)!=='WEBP'||u32(4)!==size-8)return false;
 let pos=12,sawExtension=false,sawImage=false;
 // A single opaque still image, with optional non-animated VP8X prelude.
 for(let chunks=0;pos<size&&chunks<3;chunks++){
  if(pos+8>size)return false;
  const type=fourcc(pos),len=u32(pos+4),data=pos+8;
  if(len>size-data)return false;
  const next=data+len+(len%2);
  if(next>size||(len%2&&byte(data+len)!==0))return false;
  if(type==='VP8X'){
   if(chunks!==0||len!==10||sawExtension||sawImage)return false;
   // Canvas is always opaque. Animation, metadata, alpha and ICC are not
   // produced by our compositor and can carry hidden payloads.
   if(byte(data)!==0||byte(data+1)!==0||byte(data+2)!==0||byte(data+3)!==0)return false;
   if(1+u24(data+4)!==3000||1+u24(data+7)!==450)return false;
   sawExtension=true;
  }else if(type==='VP8 '){
   if(sawImage||len<20)return false;
   const frame=u24(data);
   const keyFrame=(frame&1)===0,showFrame=(frame&16)!==0;
   const partition=frame>>>5;
   if(!keyFrame||!showFrame||partition<1||partition>len-10)return false;
   if(byte(data+3)!==157||byte(data+4)!==1||byte(data+5)!==42)return false;
   if((u16(data+6)&16383)!==3000||(u16(data+8)&16383)!==450)return false;
   sawImage=true;
  }else if(type==='VP8L'){
   if(sawImage||len<6||byte(data)!==47)return false;
   const width=1+(byte(data+1)|((byte(data+2)&63)<<8));
   const height=1+((byte(data+2)>>6)|(byte(data+3)<<2)|((byte(data+4)&15)<<10));
   const version=byte(data+4)>>5;
   if(width!==3000||height!==450||version!==0)return false;
   sawImage=true;
  }else{return false}
  pos=next;
 }
 return sawImage&&pos===size;
}
