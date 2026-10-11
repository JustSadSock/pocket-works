// A personal hand-drawn exhibition seal. The editable strokes stay on-device;
// the room only receives a small raster preview, never executable SVG/HTML.
const STORAGE_KEY='pocket-works:zamazka:emblem-v1';
const HEX=/^#[0-9a-f]{6}$/i;
export const EMBLEM_COLORS=['#382b23','#915243','#b78a47','#497064','#526888','#c1a27c'];
export const EMBLEM_SIZE={w:240,h:144};
export const EMBLEM_LIMITS={strokes:72,points:2600,encoded:12000};
export function normalizeEmblemStrokes(input){
 if(!Array.isArray(input)||input.length>EMBLEM_LIMITS.strokes)return [];
 let total=0;
 const out=[];
 for(const s of input){
  if(!s||!HEX.test(s.c)||!Number.isFinite(s.s)||s.s<2||s.s>32||!Array.isArray(s.p)||s.p.length>300)return [];
  total+=s.p.length;if(total>EMBLEM_LIMITS.points)return [];
  if(s.p.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>240)))return [];
  out.push({c:s.c,s:s.s,p:s.p.map(p=>[Math.round(p[0]),Math.round(p[1])])});
 }
 return out;
}
export function getSavedEmblem(storage=globalThis.localStorage){
 try{
  const parsed=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
  const strokes=normalizeEmblemStrokes(parsed?.strokes);
  const data=typeof parsed?.image==='string'&&/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(parsed.image)&&parsed.image.length<=EMBLEM_LIMITS.encoded?parsed.image:'';
  return {strokes,image:data};
 }catch{return {strokes:[],image:''}}
}
export function storeEmblem(strokes,image,storage=globalThis.localStorage){
 const safe=normalizeEmblemStrokes(strokes);
 if(safe.length!==strokes.length||typeof image!=='string'||image.length>EMBLEM_LIMITS.encoded||!/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))return false;
 try{storage?.setItem(STORAGE_KEY,JSON.stringify({strokes:safe,image}));return true}catch{return false}
}
export function paintEmblem(canvas,strokes){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const kx=canvas.width/EMBLEM_SIZE.w,ky=canvas.height/EMBLEM_SIZE.h;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const s of strokes){
  if(!s.p.length)continue;
  ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle=s.c;ctx.fillStyle=s.c;ctx.lineWidth=s.s*(kx+ky)/2;
  const [x,y]=s.p[0];
  if(s.p.length===1){ctx.beginPath();ctx.arc(x*kx,y*ky,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();continue}
  ctx.beginPath();ctx.moveTo(x*kx,y*ky);
  for(let i=1;i<s.p.length;i++)ctx.lineTo(s.p[i][0]*kx,s.p[i][1]*ky);
  ctx.stroke();
 }
 ctx.globalCompositeOperation='source-over';
}
export function exportEmblem(strokes,documentRef=globalThis.document){
 for(const width of [160,128,96,72]){
  const canvas=documentRef.createElement('canvas');
  canvas.width=width;canvas.height=Math.round(width*EMBLEM_SIZE.h/EMBLEM_SIZE.w);
  paintEmblem(canvas,strokes);
  const encoded=canvas.toDataURL('image/webp',.82);
  if(encoded.startsWith('data:image/')&&encoded.length<=EMBLEM_LIMITS.encoded)return encoded;
 }
 return '';
}
