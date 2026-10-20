// PEREKOS / compact 24x32 Forge-authored art runtime.
// The PNG and metadata are committed exports of asset-forge/mages.json.
// All cosmetic pixels are client-side only: positions, hitboxes, and aim stay authoritative.
import {facingSector} from './mage-facing.mjs';
import {DEFAULT_APPEARANCE,cosmeticFeatures} from './avatar-profile.mjs';

export const MAGE_PIXEL_SIZE=Object.freeze({width:24,height:32,pivotX:12,pivotY:23});
export const MAGE_PIXEL_CLASSES=Object.freeze(['kindle','cinder','wire','coil','pebble','slate']);
export const MAGE_PIXEL_DIRECTIONS=Object.freeze(['E','SE','S','SW','W','NW','N','NE']);
export const MAGE_PIXEL_STATES=Object.freeze(['idle','walk','cast']);
const paletteKeys={C:'#9a7662',D:'#624a42',L:'#bea18d',T:'#d5c3a1'};
const colorCache=new Map();
let source=null,status='loading';
let settle;
const ready=new Promise(resolve=>{settle=resolve});
if(typeof Image!=='undefined'){
 const img=new Image();
 img.decoding='async';
 img.onload=()=>{
  if(img.naturalWidth===3456&&img.naturalHeight===32){source=img;status='ready'}
  else status='error';
  settle(status==='ready');
 };
 img.onerror=()=>{status='error';settle(false)};
 img.src=new URL('./assets/mages.png',import.meta.url).href;
}else{status='unavailable';settle(false)}

export const forgeMageReady=()=>ready;
export const forgeMageStatus=()=>status;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number.isFinite(n)?n:min));
const rgb=value=>{
 if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))return null;
 return [1,3,5].map(k=>Number.parseInt(value.slice(k,k+2),16));
};
const average=(left,right)=>left.map((v,i)=>Math.round(v*.55+right[i]*.45));
export function forgeFrameIndex(mageId='kindle',face=0,casting=0,moving=0,pose=null,time=0,dashing=0){
 const actor=Math.max(0,MAGE_PIXEL_CLASSES.indexOf(mageId));
 const dir=facingSector(pose?.look??face);
 const striking=casting>.08||(pose?.windup||0)>.12||(pose?.release||0)>.12;
 const stride=clamp(pose?.move??moving,0,1);
 const phase=pose?.step??time*14;
 const stepping=(stride>.12||dashing>.025)&&Math.sin(phase)>-.1;
 return (actor*8+dir)*3+(striking?2:stepping?1:0);
}
function pixelPalette(look,enemy){
 const profile=look||DEFAULT_APPEARANCE;
 const colors=enemy&&(profile.source==='guest'||!look)?['#b26258','#ecc08f','#7a393f']:(profile.colors||DEFAULT_APPEARANCE.colors);
 const coat=rgb(colors[0])||rgb('#9a7662');
 const trim=rgb(colors[1])||rgb('#d5c3a1');
 const shade=rgb(colors[2])||rgb('#624a42');
 return {profile,colors,mapping:[{from:rgb(paletteKeys.C),to:coat},{from:rgb(paletteKeys.D),to:shade},
  {from:rgb(paletteKeys.L),to:average(coat,trim)},{from:rgb(paletteKeys.T),to:trim}]};
}
function tintedAtlas(appearance,enemy){
 const selected=pixelPalette(appearance,enemy);
 if(typeof document==='undefined'||!source)return source;
 const key=JSON.stringify(selected.colors);
 if(colorCache.has(key))return colorCache.get(key);
 const canvas=document.createElement('canvas');
 canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
 const c=canvas.getContext('2d',{willReadFrequently:true});
 c.imageSmoothingEnabled=false;c.drawImage(source,0,0);
 const data=c.getImageData(0,0,canvas.width,canvas.height);
 const bytes=data.data;
 for(let p=0;p<bytes.length;p+=4){
  if(!bytes[p+3])continue;
  for(const swatch of selected.mapping){
   const from=swatch.from;
   if(bytes[p]===from[0]&&bytes[p+1]===from[1]&&bytes[p+2]===from[2]){
    const to=swatch.to;
    bytes[p]=to[0];bytes[p+1]=to[1];bytes[p+2]=to[2];
    break;
   }
  }
 }
 c.putImageData(data,0,0);
 colorCache.set(key,canvas);
 if(colorCache.size>12)colorCache.delete(colorCache.keys().next().value);
 return canvas;
}
const drawPixel=(ctx,x,y,s,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),s,s)};
function pixelPlaceholder(ctx,x,y,k){
 // Stable loading silhouette, not the previous oversized procedural fighter.
 ctx.fillStyle='#202e28';
 ctx.fillRect(x-7*k,y-8*k,14*k,13*k);
 ctx.fillStyle='#a47752';
 ctx.fillRect(x-4*k,y-16*k,8*k,9*k);
 ctx.fillStyle='#e4b884';
 ctx.fillRect(x-3*k,y-13*k,6*k,5*k);
 ctx.fillStyle='#d8ac71';
 ctx.fillRect(x-7*k,y-18*k,14*k,3*k);
}
function identityOverlay(ctx,look,x,y,k,frame,enemy){
 const mascot=look?.mascot;
 // Minimal priority-based motifs. MASKOT identity is visible without extra bulk.
 if(mascot?.animal==='rabbit'){
  drawPixel(ctx,x-4*k,y-25*k,k,'#d8bb9b');
  drawPixel(ctx,x+3*k,y-25*k,k,'#d8bb9b');
 }else if(mascot?.animal==='cat'){
  drawPixel(ctx,x-5*k,y-20*k,k,'#d8bb9b');
  drawPixel(ctx,x+4*k,y-20*k,k,'#d8bb9b');
 }else if(mascot?.animal==='frog'){
  drawPixel(ctx,x-4*k,y-14*k,k,'#b9d28b');
  drawPixel(ctx,x+3*k,y-14*k,k,'#b9d28b');
 }
 if(mascot?.hat==='crown'){
  ctx.fillStyle='#ebc56e';ctx.fillRect(x-4*k,y-25*k,8*k,2*k);
  for(let i=-3;i<=3;i+=3)drawPixel(ctx,x+i*k,y-27*k,k,'#ebc56e');
 }else if(mascot?.hat==='flower'){
  drawPixel(ctx,x+4*k,y-22*k,2*k,'#f2d8d1');
 }else if(mascot?.hat==='beret'){
  ctx.fillStyle='#a18aa8';ctx.fillRect(x-6*k,y-21*k,11*k,2*k);
 }
 // Full account artwork remains intact in the profile portrait; tiny coat cameo
 // uses nearest-neighbour and can never affect simulation.
 if(look?.source==='drawing'&&look.artCanvas&&typeof ctx.drawImage==='function'){
  try{ctx.drawImage(look.artCanvas,x-3*k,y-4*k,6*k,6*k)}catch{ /* Unsupported source: keep authored coat. */ }
 }
 if(enemy){ctx.fillStyle='#c76a58';ctx.fillRect(x-4*k,y+7*k,8*k,k)}
}
export function renderForgeMage(ctx,look=DEFAULT_APPEARANCE,{x=0,y=0,enemy=false,alpha=1,scale=1,time=0,shield=0,flash=0,runes=[],mageId='kindle',casting=0,dashing=0,face=0,moving=0,pose=null}={}){
 // Test/non-browser geometry tracers intentionally retain the legacy painter;
 // real browsers always use the Forge export, never procedural vector outfits.
 if(typeof document==='undefined'||typeof Image==='undefined'||typeof ctx?.drawImage!=='function')return false;
 if(!Number.isFinite(x)||!Number.isFinite(y))return true;
 const k=clamp(Math.round(scale),1,4);
 const px=Math.round(x),py=Math.round(y),index=forgeFrameIndex(mageId,face,casting,moving,pose,time,dashing);
 ctx.save();ctx.globalAlpha*=clamp(alpha,0,1);
 ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#0b201d99';ctx.fillRect(px-8*k,py+5*k,16*k,2*k);
 if(!source){
  pixelPlaceholder(ctx,px,py,k);
  ctx.restore();
  return true;
 }
 const art=tintedAtlas(look,enemy);
 ctx.drawImage(art,index*24,0,24,32,px-12*k,py-23*k,24*k,32*k);
 identityOverlay(ctx,look||DEFAULT_APPEARANCE,px,py,k,index,enemy);
 const features=cosmeticFeatures(Array.isArray(runes)?runes:[]);
 // Rune build identity is two or three isolated foreground pixels, not
 // stacking entire chest plates, floating symbols and weapon ornaments.
 if(features.stone)drawPixel(ctx,px-7*k,py-2*k,2*k,'#b5bca3');
 else if(features.ember)drawPixel(ctx,px+5*k,py-17*k,2*k,'#f0a267');
 else if(features.frost)drawPixel(ctx,px+5*k,py-16*k,2*k,'#90c9c7');
 if(features.echoes)drawPixel(ctx,px-7*k,py+2*k,2*k,'#92b2a3');
 if(features.healing)drawPixel(ctx,px+3*k,py-2*k,2*k,'#b9d6a9');
 const strike=(pose?.release||0)>.25;
 const wind=(pose?.windup||0)>.25;
 if(strike)drawPixel(ctx,px+9*k,py-17*k,2*k,'#e8cb90');
 else if(wind)drawPixel(ctx,px+6*k,py-21*k,2*k,'#b8d8c2');
 if((pose?.recover||0)>.25)drawPixel(ctx,px-5*k,py+2*k,2*k,'#e4c199');
 if((pose?.guard||0)>.25||shield>0){
  for(let i=0;i<16;i++){
   const theta=i*Math.PI/8;
   drawPixel(ctx,px+Math.round(Math.cos(theta)*15)*k,py-7*k+Math.round(Math.sin(theta)*16)*k,k,'#b1d5b2');
  }
 }
 if(dashing>.02)for(let i=0;i<3;i++)drawPixel(ctx,px-(13+i*3)*k,py+(3-i*2)*k,k,'#9db6a4');
 if(flash>.03||(pose?.impact||0)>.25){
  drawPixel(ctx,px-6*k,py-14*k,2*k,'#fff0cf');
  drawPixel(ctx,px+5*k,py-4*k,2*k,'#f5dcb0');
 }
 ctx.restore();
 return true;
}
