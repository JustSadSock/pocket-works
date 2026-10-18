// The user's Pocket ID is the ONLY identity source. The social record is used
// solely when it belongs to that same authenticated account. Never store artwork
// in match saves, a grimoire, localStorage or an opponent's client state.
import {safeMascot,mascotPublicUnlocks} from '../../shared/capabilities/maskot.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ART=/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]+={0,2}$/;
export const COLORSETS=Object.freeze({
 clay:['#b56e5d','#f0cdab','#7e5350'],moss:['#527e67','#cbdaa2','#3c6658'],
 ink:['#53718c','#d3e1df','#445570'],sun:['#c89849','#fff0b7','#986643'],
 wave:['#4b8794','#c1ead7','#366978'],ember:['#b55a40','#ffd09a','#8c3838'],
 plum:['#88628a','#e8c7dd','#634866'],stone:['#787f74','#e8e5d2','#585d59']
});
const mascotPalette={cat:['#996c55','#f6dbb8'],rabbit:['#cfad9f','#fff0dc'],frog:['#649c65','#e3eda9']};
export const DEFAULT_APPEARANCE=Object.freeze({
 source:'guest',accountId:'',name:'Гостевой маг',preset:'clay',colors:COLORSETS.clay,
 mascot:null,artwork:'',artCanvas:null,pattern:'clay'
});
export function safeArtwork(value){
 return typeof value==='string'&&value.length<=24000&&ART.test(value)?value:'';
}
const getPreset=x=>Object.hasOwn(COLORSETS,x)?x:'clay';
export function normalizeAppearance(identity,social=null){
 if(!identity||identity.complete!==true||!UUID.test(identity.id))return {...DEFAULT_APPEARANCE};
 const preset=getPreset(identity.avatar),name=typeof identity.nickname==='string'&&identity.nickname.trim()?identity.nickname.trim().slice(0,36):'Мой маг';
 const related=social&&typeof social==='object'&&social.profile?.id===identity.id?social.profile:null;
 const hasMascot=related?.maskot&&typeof related.maskot==='object'&&!Array.isArray(related.maskot);
 const mascot=hasMascot?safeMascot(related.maskot,mascotPublicUnlocks):null;
 const artwork=safeArtwork(related?.artwork)||safeArtwork(identity.artwork);
 const kind=mascot?'maskot':artwork?'drawing':'preset';
 const colors=mascot?[...(mascotPalette[mascot.animal]||mascotPalette.cat),COLORSETS[preset][2]]:[...COLORSETS[preset]];
 return {source:kind,accountId:identity.id,name,preset,colors,mascot,artwork,artCanvas:null,pattern:preset};
}
function vivid(rgb){const min=Math.min(...rgb),max=Math.max(...rgb);return max-min>=16&&max>=50&&min<245}
const hex=values=>'#'+values.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
// Select inks from the painted icon, not average of the white or transparent
// background. Quantized into stable buckets so tiny anti-aliasing variations
// cannot change the robe every frame.
export function paintingPigments(data,width,height){
 if(!data||data.length<width*height*4||width<1||height<1)return null;
 const histogram=new Map(),edge=[];
 const add=(x,y,weight=1)=>{
  const i=(y*width+x)*4;if(data[i+3]<75)return;
  const c=[data[i],data[i+1],data[i+2]],bucket=c.map(v=>Math.min(255,Math.floor(v/32)*32+16));
  const key=bucket.join(',');
  if(!vivid(bucket))return;
  const old=histogram.get(key)||0;histogram.set(key,old+weight);
 };
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,corner=(x<width*.12||x>width*.88)&&(y<height*.12||y>height*.88);
  if(corner){if(data[i+3]>=70)edge.push([data[i],data[i+1],data[i+2]]);continue}
  add(x,y,1);
 }
 const sorted=[...histogram.entries()].sort((a,b)=>b[1]-a[1]), colors=[];
 for(const [key] of sorted){const c=key.split(',').map(Number);
  if(colors.every(x=>Math.hypot(...c.map((v,i)=>v-x[i]))>65))colors.push(c);
  if(colors.length===2)break;
 }
 return colors.length?[hex(colors[0]),hex(colors[1]||[225,194,150])]:null;
}
export async function decodeAppearance(appearance,{imageFactory=()=>new Image(),canvasFactory=()=>document.createElement('canvas')}={}){
 if(appearance.source!=='drawing'||!appearance.artwork)return appearance;
 try{
  const img=imageFactory(),decoded=await new Promise((resolve,reject)=>{
   let done=false;const end=(value,error)=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;error?reject(error):resolve(value)};
   const timer=setTimeout(()=>end(null,new Error('portrait timeout')),3200);
   img.onload=()=>end(img);img.onerror=()=>end(null,new Error('invalid portrait'));
   img.src=appearance.artwork;
  });
  if(!decoded.naturalWidth||!decoded.naturalHeight||decoded.naturalWidth>1024||decoded.naturalHeight>1024)return {...appearance,source:'preset',artwork:'',artCanvas:null};
  const c=canvasFactory();c.width=16;c.height=16;const g=c.getContext('2d',{willReadFrequently:true});
  if(!g)return {...appearance,source:'preset',artwork:'',artCanvas:null};
  g.clearRect(0,0,16,16);g.imageSmoothingEnabled=true;
  // Contain the picture rather than crop any identifiable feature away.
  const scale=Math.min(16/decoded.naturalWidth,16/decoded.naturalHeight);
  const w=decoded.naturalWidth*scale,h=decoded.naturalHeight*scale;
  g.drawImage(decoded,(16-w)/2,(16-h)/2,w,h);
  const pixels=g.getImageData(0,0,16,16),pigments=paintingPigments(pixels.data,16,16);
  return {...appearance,colors:pigments?[pigments[0],appearance.colors[1],pigments[1]]:appearance.colors,artCanvas:c};
 }catch{return {...appearance,source:'preset',artwork:'',artCanvas:null}}
}
export function cosmeticFeatures(ids=[]){
 const set=new Set(Array.isArray(ids)?ids:[]);
 return {
  stone:set.has('armor')||set.has('wall')||set.has('on_guard'),
  ember:set.has('ball')||set.has('blast')||set.has('mine'),
  echoes:set.has('clone')||set.has('blink')||set.has('on_dash'),
  healing:set.has('heal')||set.has('drain')||set.has('on_heal'),
  frost:set.has('cool')||set.has('slow'),
  spark:set.has('on_overload')||set.has('triple')||set.has('double'),
  haste:set.has('haste')||set.has('fastshot')
 };
}
