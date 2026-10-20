// PEREKOS / spell grammar authored in Universal Art Forge.
// 154 palette-locked 24px sprite frames: seven material silhouettes with
// eight directions and animation, seven impact families, six class glyphs,
// three elemental reactions. Neither prediction nor game state is touched.
export const FORGE_SPELL_SIZE=24;
export const FORGE_SPELL_STYLES=Object.freeze(['orb','flame','bolt','arc','rock','wave','echo']);
export const FORGE_REACTIONS=Object.freeze(['steam','crack','slag']);
export const FORGE_CLASSES=Object.freeze(['kindle','cinder','wire','coil','pebble','slate']);
export const FORGE_FRAME_COUNT=154;
const ATLAS_WIDTH=FORGE_FRAME_COUNT*FORGE_SPELL_SIZE;
let source=null,status='loading';let resolveReady;
const ready=new Promise(resolve=>{resolveReady=resolve});
if(typeof Image!=='undefined'){
 const sprite=new Image();sprite.decoding='async';
 sprite.onload=()=>{
  if(sprite.naturalWidth===ATLAS_WIDTH&&sprite.naturalHeight===24){source=sprite;status='ready'}
  else status='invalid';
  resolveReady(!!source);
 };
 sprite.onerror=()=>{status='error';resolveReady(false)};
 sprite.src=new URL('./assets/spell-frames.png',import.meta.url).href;
}else{status='unavailable';resolveReady(false)}
export const forgeSpellsReady=()=>ready;
export const forgeSpellsStatus=()=>status;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a));
const STYLE_PIVOT=112,IMPACT_PIVOT=133,REACTION_PIVOT=145;
const toneOrigins={K:'#142724',D:'#563a30',B:'#945a3e',M:'#df9660',H:'#ffcc82',W:'#fff2bf',S:'#b4d4c5',C:'#5e9d91',T:'#315b59'};
const elementColors={
 fire:{K:'#142724',D:'#563a30',B:'#945a3e',M:'#df9660',H:'#ffcc82',W:'#fff2bf',S:'#d5c4a0',C:'#ab7753',T:'#5d4033'},
 storm:{K:'#102b2e',D:'#28585b',B:'#3c7d85',M:'#6dc6c2',H:'#b1efe4',W:'#f1fff0',S:'#82c9d0',C:'#50959c',T:'#234e57'},
 stone:{K:'#182820',D:'#384a3c',B:'#5b715a',M:'#8caa83',H:'#c4d2ad',W:'#f1edcc',S:'#a4ae94',C:'#728875',T:'#314339'}
};
const palettes=new Map();
function tint(el='fire'){
 if(!source||typeof document==='undefined')return null;
 const element=elementColors[el]?el:'fire';
 if(palettes.has(element))return palettes.get(element);
 const canvas=document.createElement('canvas');canvas.width=ATLAS_WIDTH;canvas.height=24;
 const c=canvas.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;
 c.drawImage(source,0,0);
 if(element!=='fire'){
  const d=c.getImageData(0,0,ATLAS_WIDTH,24),pix=d.data;
  const map=new Map(Object.entries(toneOrigins).map(([key,color])=>{
   const from=color.toLowerCase(),to=elementColors[element][key];
   return [from,to]
  }));
  const rgba=str=>[1,3,5].map(i=>Number.parseInt(str.slice(i,i+2),16));
  const sourceMapping=Array.from(map,([a,b])=>({a:rgba(a),b:rgba(b)}));
  for(let i=0;i<pix.length;i+=4){
   if(pix[i+3]===0)continue;
   for(const m of sourceMapping)if(pix[i]===m.a[0]&&pix[i+1]===m.a[1]&&pix[i+2]===m.a[2]){
    pix[i]=m.b[0];pix[i+1]=m.b[1];pix[i+2]=m.b[2];break;
   }
  }
  c.putImageData(d,0,0);
 }
 palettes.set(element,canvas);
 return canvas;
}
const isCanvas=ctx=>!!(source&&ctx&&typeof ctx.drawImage==='function'&&typeof document!=='undefined');
function stamp(ctx,index,x,y,element='fire',alpha=1,scale=1){
 if(!Number.isFinite(x)||!Number.isFinite(y))return;
 const sheet=tint(element),k=clamp(Math.round(scale),1,2);
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha*=clamp(alpha,0,1);
 ctx.drawImage(sheet,index*24,0,24,24,Math.round(x-12*k),Math.round(y-12*k),24*k,24*k);
 ctx.restore();
}
const styleIndex=q=>Math.max(0,FORGE_SPELL_STYLES.indexOf(q?.style==='echo'||q?.clone?'echo':q?.style));
export function forgeProjectileFrame(q,time=0,reduced=false){
 const i=styleIndex(q),angle=Math.atan2(q?.vy??0,q?.vx??1);
 const sector=((Math.round(angle/(Math.PI/4))%8)+8)%8;
 const phase=reduced?0:((Math.floor(time*11)+(q?.owner||0))&1);
 return (i*8+sector)*2+phase;
}
export function forgeImpactFrame(style,age=0,life=1,reduced=false){
 const i=Math.max(0,FORGE_SPELL_STYLES.indexOf(style));
 return STYLE_PIVOT+i*3+Math.min(2,Math.floor(clamp(age/(life||1),0,.9999)*3));
}
export function forgeClassFrame(cls,progress=0,reduced=false){
 return IMPACT_PIVOT+Math.max(0,FORGE_CLASSES.indexOf(cls))*2+(reduced?0:Number(progress)>.48?1:0);
}
export function forgeReactionFrame(reaction,progress=0,reduced=false){
 return REACTION_PIVOT+Math.max(0,FORGE_REACTIONS.indexOf(reaction))*3+(reduced?0:Math.min(2,Math.floor(clamp(progress,0,.999)*3)));
}
const validShot=q=>q&&[q.x,q.y,q.vx,q.vy].every(Number.isFinite)&&
 Math.hypot(q.vx,q.vy)>1&&Math.abs(q.x)<1200&&Math.abs(q.y)<1400;
export function drawForgeVolley(ctx,state,time=0,{reduced=false}={}){
 if(!isCanvas(ctx))return null;
 if(state?.phase!=='fight'||!Array.isArray(state.shots))return 0;
 let count=0;
 for(const q of state.shots){
  if(count===24)break;
  if(!validShot(q))continue;
  const style=styleIndex(q),element=elementColors[q.element]?q.element:'fire',id=forgeProjectileFrame(q,time,reduced);
  const nominal=[5,5,3,5,8,12,4][style],scale=Number.isFinite(q.r)&&q.r>=nominal*1.65?2:1;
  stamp(ctx,id,q.x,q.y,element,1,scale);
  count++;
 }
 return count;
}
export function drawForgeContacts(ctx,contacts,reduced=false){
 if(!isCanvas(ctx))return false;
 for(const c of (contacts||[]).slice(0,18)){
  const school=c.style==='bolt'||c.style==='arc'?'storm':c.style==='rock'||c.style==='wave'?'stone':'fire';
  const t=clamp(c.age/(c.life||1),0,1);
  stamp(ctx,forgeImpactFrame(c.style,c.age,c.life,reduced),c.x,c.y,school,1-t*.85);
 }
 return true;
}
const classSchool=id=>id==='wire'||id==='coil'?'storm':id==='pebble'||id==='slate'?'stone':'fire';
const reactionSchool=id=>id==='crack'?'stone':id==='steam'?'storm':'fire';
export function drawForgeGround(ctx,motifs,reduced=false){
 if(!isCanvas(ctx))return false;
 for(const m of (motifs||[]).slice(0,24)){
  const t=clamp(m.age/(m.life||1),0,1);
  if(m.kind==='cast')stamp(ctx,forgeClassFrame(m.style,t,reduced),m.x,m.y+7,m.element||classSchool(m.style),(1-t)*.65);
  else if(m.kind==='reaction'){
   const kind=(m.reaction||'').replace('react_','');
   stamp(ctx,forgeReactionFrame(kind,t,reduced),m.x,m.y,reactionSchool(kind),(1-t)*.48,1);
  }else if(m.kind==='overload')
   stamp(ctx,forgeReactionFrame('slag',t,reduced),m.x,m.y,'fire',1-t,2);
  else if(m.kind==='guard')
   stamp(ctx,forgeClassFrame('coil',t,reduced),m.x,m.y,'storm',1-t);
 }
 return true;
}
export function drawForgeActors(ctx,state,reduced=false){
 if(!isCanvas(ctx))return false;
 if(state?.phase!=='fight')return true;
 for(const a of (state.actors||[]).slice(0,2)){
  if(!Number.isFinite(a.x)||!Number.isFinite(a.y)||!Number.isFinite(a.cast)||a.cast<=.08)continue;
  const t=clamp(a.cast/.7,0,1);
  stamp(ctx,forgeClassFrame(a.mageId,1-t,reduced),a.x,a.y-19,classSchool(a.mageId),.7*t);
 }
 return true;
}
export function drawForgeForeground(ctx,motifs,reduced=false,{impacts=true}={}){
 if(!isCanvas(ctx))return false;
 // The contact pool already owns actual impact_* events. Do not draw them
 // a second time or invent client-side collisions.
 for(const m of (motifs||[]).slice(0,24)){
  const t=clamp(m.age/(m.life||1),0,1);
  if(m.kind==='reaction'){
   const kind=(m.reaction||'').replace('react_','');
   stamp(ctx,forgeReactionFrame(kind,t,reduced),m.x,m.y-5,reactionSchool(kind),(1-t)*.8);
  }else if(m.kind==='impact'&&impacts){
   const school=classSchool(m.style);
   stamp(ctx,forgeImpactFrame(m.style,m.age,m.life,reduced),m.x,m.y,school,1-t);
  }
 }
 return true;
}
