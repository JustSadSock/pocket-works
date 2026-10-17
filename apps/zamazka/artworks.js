import { svgFor as legacySvg, ARTS as LEGACY } from './legacy-artworks.js';
import { MUSEUM_ADDITIONS } from './museum-catalog.js';
import {PLAYFUL_ADDITIONS} from './museum-playful.js';
import {APPROVED_2026_ADDITIONS} from './museum-approved-2026.js';
import {SECOND_APPROVED_2026_ADDITIONS} from './museum-approved-second-2026.js';
import {artworkOrigin} from './art-provenance.js';

/** An entirely public-domain gallery. Descriptions and source links are kept beside the images. */
export const W = 600, H = 450;
const ROOT='https://thumb.wikimedia.org/wikipedia/commons/thumb/';
const REAL=[
  {title:'Девушка с жемчужной серёжкой',artist:'Ян Вермеер',date:'ок. 1665',style:'Голландский барокко',museum:'Маурицхёйс · Гаага',file:'Girl_with_a_Pearl_Earring.jpg',path:'c/ce/',source:'https://commons.wikimedia.org/wiki/File:Girl_with_a_Pearl_Earring.jpg',native:'portrait'},
  {title:'Звёздная ночь',artist:'Винсент ван Гог',date:'1889',style:'Постимпрессионизм',museum:'Музей современного искусства · Нью-Йорк',file:'Vincent_van_Gogh_Starry_Night.jpg',path:'d/de/',source:'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_Starry_Night.jpg'},
  {title:'Ночной дозор',artist:'Рембрандт',date:'1642',style:'Голландский барокко',museum:'Рейксмюсеум · Амстердам',file:'The_Night_Watch.jpg',path:'0/0e/',source:'https://commons.wikimedia.org/wiki/File:The_Night_Watch.jpg'},
  {title:'Большая волна в Канагаве',artist:'Кацусика Хокусай',date:'ок. 1831',style:'Укиё-э',museum:'Дереворит · Япония',file:'Great_Wave_off_Kanagawa.jpg',path:'f/f7/',source:'https://commons.wikimedia.org/wiki/File:Great_Wave_off_Kanagawa.jpg'},
  {title:'Телега для сена',artist:'Джон Констебл',date:'1821',style:'Романтизм',museum:'Национальная галерея · Лондон',file:'John-constable-the-hay-wain.jpg',path:'9/96/',source:'https://commons.wikimedia.org/wiki/File:John-constable-the-hay-wain.jpg'},
  {title:'Впечатление. Восход солнца',artist:'Клод Моне',date:'1872',style:'Импрессионизм',museum:'Музей Мармоттан-Моне · Париж',file:'Monet_-_Impression%2C_Sunrise.jpg',path:'5/59/',source:'https://commons.wikimedia.org/wiki/File:Monet_-_Impression,_Sunrise.jpg'},
  {title:'Спальня в Арле',artist:'Винсент ван Гог',date:'1889',style:'Постимпрессионизм',museum:'Институт искусств · Чикаго',file:'Vincent_van_Gogh_-_The_Bedroom_-_1926.417_-_Art_Institute_of_Chicago.jpg',path:'5/50/',source:'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_The_Bedroom_-_1926.417_-_Art_Institute_of_Chicago.jpg'},
  {title:'Рождение Венеры',artist:'Сандро Боттичелли',date:'ок. 1485',style:'Раннее Возрождение',museum:'Галерея Уффици · Флоренция',file:'Birth_of_Venus_Botticelli.jpg',path:'1/14/',source:'https://commons.wikimedia.org/wiki/File:Birth_of_Venus_Botticelli.jpg'},
  ...MUSEUM_ADDITIONS,
  ...PLAYFUL_ADDITIONS,
  ...APPROVED_2026_ADDITIONS,
  ...SECOND_APPROVED_2026_ADDITIONS
];
export const REAL_COUNT=REAL.length;
// User's removal selection of 26 historical originals. Keep their IDs and
// artwork records intact for archives and existing rooms.
export const RETIRED_ARTWORK_IDS=Object.freeze([2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69,115]);
export const PRE_EXPANSION_REAL_COUNT=54;
export const PRE_APPROVAL_REAL_COUNT=72;
export const PRE_SECOND_APPROVAL_REAL_COUNT=108;
export const ARCHIVE_EDITION=6;
export const PLAYABLE_IDS=Array.from({length:REAL.length-1},(_,i)=>i+1)
 .filter(id=>!RETIRED_ARTWORK_IDS.includes(id));
/** Rebase legacy (procedurally drawn) archive IDs after new real paintings.
 *  Edition 3 used 54 real paintings, so stored legacy IDs from 54 onward
 *  must move up without changing the content of the saved drawing.
 */
export function normalizeArchiveEntry(entry){
 const id=Number(entry?.art);
 if(!Number.isInteger(id)||id<0)return entry;
 if(entry.edition===ARCHIVE_EDITION)return entry;
 let art=id;
 if(entry.edition===5){
  if(id>=PRE_SECOND_APPROVAL_REAL_COUNT)art+=REAL_COUNT-PRE_SECOND_APPROVAL_REAL_COUNT;
 }else if(entry.edition===4){
  if(id>=PRE_APPROVAL_REAL_COUNT)art+=REAL_COUNT-PRE_APPROVAL_REAL_COUNT;
 }else if(entry.edition===3){
  if(id>=PRE_EXPANSION_REAL_COUNT)art+=REAL_COUNT-PRE_EXPANSION_REAL_COUNT;
 }else if(entry.edition===2){
  art=id>=8?id+46:id; // Historical 8-real-painting build
  if(art>=PRE_EXPANSION_REAL_COUNT)art+=REAL_COUNT-PRE_EXPANSION_REAL_COUNT;
 }else art+=REAL_COUNT; // Original synthetic-only gallery
 return {...entry,art,edition:ARCHIVE_EDITION};
}
export const ARTS=[
 ...REAL.map((entry,id)=>({...entry,id,isReal:true})),
 ...LEGACY.map((entry,i)=>({...entry,id:i+REAL.length,artist:'Коллекция ЗАМАЗКИ 1.0',date:'2026',museum:'Личный архив',isReal:false}))
].map(art=>({...art,...(art.isReal?artworkOrigin(art.id):{})}));
// Preview and editor use the same high-resolution master. If Commons only
// provides a smaller raster, the existing fallback chain finds it safely.
const PREVIEW_WIDTH=1920;
const MASTER_WIDTHS=[1920,1280,960];
// Share the service worker's persistent artwork cache. Using a different
// namespace caused two copies of large masters to compete for phone storage.
const ART_CACHE='zamazka-artworks-v1.12.5';
export function artworkURL(id,width=PREVIEW_WIDTH){
 const entry=ARTS[id];if(!entry)return '';
 return entry.isReal ? ROOT+entry.path+entry.file+'/'+width+'px-'+entry.file
   : 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(legacySvg(id-REAL_COUNT));
}
export function artworkOriginalURL(id){
 const entry=ARTS[id];if(!entry?.isReal)return '';
 return 'https://upload.wikimedia.org/wikipedia/commons/'+entry.path+entry.file;
}
export function artworkFallbackURL(id,failedUrl){
 const entry=ARTS[id];if(!entry?.isReal)return '';
 const index=MASTER_WIDTHS.findIndex(width=>artworkURL(id,width)===failedUrl);
 if(index<0)return failedUrl===artworkOriginalURL(id)?'':artworkURL(id,960);
 return MASTER_WIDTHS[index+1]?artworkURL(id,MASTER_WIDTHS[index+1]):artworkOriginalURL(id);
}
const MAX_DECODED_IMAGES=8;
const pending=new Map();
async function imageSource(id){
 if(!ARTS[id].isReal)return artworkURL(id);
 const cache=typeof caches==='undefined'?null:await caches.open(ART_CACHE).catch(()=>null);
 for(const url of [...MASTER_WIDTHS.map(width=>artworkURL(id,width)),artworkOriginalURL(id)]){
   try{
     const saved=await cache?.match(url);
     if(saved&&saved.ok)return URL.createObjectURL(await saved.blob());
     const response=await fetch(url,{mode:'cors',credentials:'omit'});
     if(!response.ok)continue;
     const copy=response.clone();
     const blob=await response.blob();
     if(!blob.type.startsWith('image/')||blob.size<4096)continue;
     try{await cache?.put(url,copy)}catch{}
     return URL.createObjectURL(blob);
   }catch{}
 }
 return artworkOriginalURL(id);
}
export function loadArtwork(id){
 if(pending.has(id)){
   const cached=pending.get(id);
   pending.delete(id);pending.set(id,cached);
   return cached;
 }
 if(!ARTS[id])return Promise.reject(Error('Произведение не найдено'));
 const task=imageSource(id).then(src=>new Promise((resolve,reject)=>{
   const image=new Image();
   if(ARTS[id].isReal)image.crossOrigin='anonymous';
   image.decoding='async';
   image.onload=()=>{if(src.startsWith('blob:'))URL.revokeObjectURL(src);resolve(image)};
   image.onerror=()=>{if(src.startsWith('blob:'))URL.revokeObjectURL(src);reject(Error('Изображение недоступно. Подключи интернет для первого просмотра.'))};
   image.src=src;
 })).catch(error=>{pending.delete(id);throw error});
 pending.set(id,task);
 while(pending.size>MAX_DECODED_IMAGES)pending.delete(pending.keys().next().value);
 return task;
}
/** The network and brush protocol intentionally use a stable 600×450
 * coordinate space. The artwork fills that entire space; the DOM canvas/frame
 * adopts the natural aspect ratio, cancelling the logical raster stretch.
 * This avoids letterbox strips, including inside the editable damage mask,
 * without invalidating old multiplayer drawings or changing their positions.
 */
export function artworkAspect(image){
 const w=image?.naturalWidth,h=image?.naturalHeight;
 return w>0&&h>0&&Number.isFinite(w/h)?w/h:W/H;
}
export function artworkBounds(image){
 if(!(image?.naturalWidth>0&&image?.naturalHeight>0))return null;
 return {x:0,y:0,w:W,h:H};
}
// Older restored collections could use a letterboxed, fixed 4:3 master.
// Keep that presentation available for damaged historical archive entries.
export function setArtworkFrame(canvas,image,legacyFrame=false){
 const ratio=legacyFrame?W/H:artworkAspect(image);
 if(canvas?.style){
   canvas.style.aspectRatio=String(ratio);
   canvas.style.setProperty?.('--art-aspect',String(ratio));
 }
 const parent=canvas?.closest?.('.viewport,.unveil-frame,.round-view-window,.round-art-image,.stake-frame,.reveal-option-image,.picture-image,.verdict-image,.compare');
 parent?.style?.setProperty?.('--art-aspect',String(ratio));
 return ratio;
}
export function drawArtwork(ctx,image,id,legacyFrame=false){
 if(!artworkBounds(image))return;
 if(legacyFrame){
  // Recover the 1.26.1-era placement without ever rewriting archived strokes.
  const aspect=artworkAspect(image),width=Math.min(W,H*aspect),
    height=Math.min(H,W/aspect);
  ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,
    (W-width)/2,(H-height)/2,width,height);
  return;
 }
 // Live multiplayer protocol remains a full-frame logical 600×450 painting.
 ctx.drawImage(image,0,0,image.naturalWidth,image.naturalHeight,0,0,W,H);
}
function rand(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const SHAPES=['round','oval','star','torn','diamond','burst'];
// Generated afresh by the server for every player and every round. A 32-bit
// variation seed is part of the signed game state; all clients can reproduce
// exactly the same contour in editor, votes, reveals and saved paintings.
// Legacy variations are 32-bit unsigned integers. Values above 2^32
// identify the balanced-area geometry without invalidating old matches,
// downloaded drafts or archive entries whose exact masks must remain stable.
export const BALANCED_ZONE_OFFSET=0x100000000;
export function freshZoneVariation(){
 return BALANCED_ZONE_OFFSET+Math.floor(Math.random()*0x100000000);
}
export function zoneFor(id,variation=0){
 const seed=(Math.imul((id+11)>>>0,2654435761)^(Number(variation)>>>0)^0x5195afd3)>>>0;
 const r=rand(seed);
 const kind=SHAPES[Math.floor(r()*SHAPES.length)];
 const cx=100+r()*400,cy=85+r()*275;
 const rx=44+r()*36,ry=40+r()*30;
 const rotation=r()*Math.PI*2;
 const count=kind==='star'?10:kind==='diamond'?4:kind==='burst'?20:kind==='torn'?15:32;
 const points=[];
 for(let i=0;i<count;i++){
  const angle=i/count*Math.PI*2+rotation;
  let radius=1;
  if(kind==='star')radius=i%2===0?1:.46+r()*.09;
  else if(kind==='burst')radius=i%2===0?1:.69+r()*.18;
  else if(kind==='torn')radius=.71+r()*.3;
  else if(kind==='diamond')radius=.96;
  else radius=kind==='round'?.94+r()*.06:.93+r()*.08;
  const arx=kind==='round'?(rx+ry)/2:rx;
  const ary=kind==='round'?(rx+ry)/2:ry;
  points.push([Math.round((cx+Math.cos(angle)*arx*radius)*10)/10,Math.round((cy+Math.sin(angle)*ary*radius)*10)/10]);
 }
 // All geometries use the full 600×450 logical canvas, whose area
 // fraction is preserved under non-uniform presentation scaling. Different
 // polygon families historically covered 0.9%–6.1%; rebalance NEW seeds to
 // exactly 3% of the actual painting, while retaining their contour, angle,
 // relative dimensions, and deterministic placement.
 // Do not alter 32-bit legacy variations: a mid-game deployment must not
 // move anyone's existing restoration mask.
 if(Number.isSafeInteger(variation)&&variation>=BALANCED_ZONE_OFFSET){
  const polygonArea=Math.abs(points.reduce((sum,[x,y],i)=>{
   const [nx,ny]=points[(i+1)%points.length];
   return sum+x*ny-nx*y;
  },0))*.5;
  if(polygonArea>0){
   const scale=Math.sqrt((W*H*.03)/polygonArea);
   for(const p of points){
    p[0]=cx+(p[0]-cx)*scale;
    p[1]=cy+(p[1]-cy)*scale;
   }
   // Shifting (never clipping) keeps the entire 3% mask inside the source
   // image, including very narrow portrait or star-shaped damage.
   const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
   const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
   const margin=2;
   const shiftX=minX<margin?margin-minX:maxX>W-margin?W-margin-maxX:0;
   const shiftY=minY<margin?margin-minY:maxY>H-margin?H-margin-maxY:0;
   for(const p of points){
    p[0]=Math.round((p[0]+shiftX)*100)/100;
    p[1]=Math.round((p[1]+shiftY)*100)/100;
   }
  }
 }
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y,kind,points};
}
export function damagePath(ctx,zone){
 ctx.beginPath();
 if(!zone.points?.length){ctx.rect(zone.x,zone.y,zone.w,zone.h);return}
 zone.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();
}
export function insideDamage(zone,point){
 if(!zone.points?.length)return point[0]>=zone.x&&point[0]<=zone.x+zone.w&&point[1]>=zone.y&&point[1]<=zone.y+zone.h;
 let hit=false;
 for(let i=0,j=zone.points.length-1;i<zone.points.length;j=i++){
  const a=zone.points[i],b=zone.points[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
// Never preload 48 masters at once. The first eight power the menu; other
// artworks are loaded on demand during preview and cached after first view.
export function primeGallery(){return Promise.allSettled(Array.from({length:8},(_,id)=>loadArtwork(id)))}
