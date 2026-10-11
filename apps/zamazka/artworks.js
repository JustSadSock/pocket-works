import { svgFor as legacySvg, ARTS as LEGACY } from './legacy-artworks.js';

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
  {title:'Рождение Венеры',artist:'Сандро Боттичелли',date:'ок. 1485',style:'Раннее Возрождение',museum:'Галерея Уффици · Флоренция',file:'Birth_of_Venus_Botticelli.jpg',path:'1/14/',source:'https://commons.wikimedia.org/wiki/File:Birth_of_Venus_Botticelli.jpg'}
];
export const REAL_COUNT=REAL.length;
export const PLAYABLE_IDS=[1,2,3,4,5,6,7];
export const ARTS=[
 ...REAL.map((entry,id)=>({...entry,id,isReal:true})),
 ...LEGACY.map((entry,i)=>({...entry,id:i+REAL.length,artist:'Коллекция ЗАМАЗКИ 1.0',date:'2026',museum:'Личный архив',isReal:false}))
];
const thumbnails=new Map();
export function artworkURL(id){
 if(thumbnails.has(id))return thumbnails.get(id);
 const entry=ARTS[id];
 if(!entry)return '';
 const url=entry.isReal ? ROOT+entry.path+entry.file+'/960px-'+entry.file : 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(legacySvg(id-REAL_COUNT));
 thumbnails.set(id,url);
 return url;
}
const pending=new Map();
export function loadArtwork(id){
 if(pending.has(id))return pending.get(id);
 const url=artworkURL(id);
 if(!url)return Promise.reject(Error('Произведение не найдено'));
 const task=new Promise((resolve,reject)=>{
   const image=new Image();
   if(ARTS[id].isReal)image.crossOrigin='anonymous';
   image.decoding='async';
   image.onload=()=>resolve(image);
   image.onerror=()=>reject(Error('Не удалось получить картину. Проверь подключение или попробуй ещё раз.'));
   image.src=url;
 }).catch(error=>{pending.delete(id);throw error});
 pending.set(id,task);return task;
}
/** Identical framing in the museum, editor, voting, and reveal: never distort a source. */
export function drawArtwork(ctx,image,id){
 const ratio=W/H, natural=image.naturalWidth/image.naturalHeight;
 if(!Number.isFinite(natural)||!natural)return;
 const entry=ARTS[id];
 ctx.fillStyle='#242621';ctx.fillRect(0,0,W,H);
 // The pearl portrait is featured on the cover but not used for 4:3 restoration rounds.
 if(entry?.native==='portrait'){
   const width=H*natural;ctx.drawImage(image,(W-width)/2,0,width,H);return;
 }
 let sx=0,sy=0,sw=image.naturalWidth,sh=image.naturalHeight;
 if(natural>ratio){sw=Math.round(sh*ratio);sx=Math.round((image.naturalWidth-sw)/2)}
 else {sh=Math.round(sw/ratio);sy=Math.round((image.naturalHeight-sh)/2)}
 ctx.drawImage(image,sx,sy,sw,sh,0,0,W,H);
}
function rand(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
export function zoneFor(id,variation=0){
 const r=rand((id+11)*16331+(variation+1)*113);
 return {x:Math.floor(65+r()*340),y:Math.floor(55+r()*205),w:116,h:106};
}
export function primeGallery(){return Promise.allSettled(PLAYABLE_IDS.map(id=>loadArtwork(id)))}
