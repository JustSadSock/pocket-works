// MEAT.EXE v1.9 / deterministic biological material, light and motility curves.
// Pure bounded functions allow headless testing without Three.js or a GPU.
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const PHYSIOLOGY=Object.freeze({
  1:Object.freeze({id:'vascular',kind:'blood',motes:58,speed:.21,pulse:3.8,roughness:.32,brightness:1.13}),
  2:Object.freeze({id:'gastric',kind:'mucus',motes:36,speed:.085,pulse:2.7,roughness:.43,brightness:.90}),
  3:Object.freeze({id:'marrow',kind:'dust',motes:45,speed:.065,pulse:2.1,roughness:.86,brightness:.97}),
  4:Object.freeze({id:'neural',kind:'sparks',motes:76,speed:.31,pulse:5.2,roughness:.52,brightness:1.28}),
  5:Object.freeze({id:'heart',kind:'blood',motes:88,speed:.35,pulse:5.6,roughness:.27,brightness:1.44})
});
const TYPE_MATERIAL=Object.freeze({
 crawler:'vascular',spitter:'gastric',brute:'marrow',warden:'gastric',leech:'neural',
 heart:'vascular',clot:'vascular',ossuary:'marrow',synapse:'neural'
});
export function tissueFamily(type){return TYPE_MATERIAL[type]||'vascular';}
export function materialProperties(type){
 const family=tissueFamily(type);
 return {family,
  roughness:family==='marrow'?.87:family==='neural'?.52:family==='gastric'?.43:.34,
  bumpScale:family==='marrow'?.14:family==='neural'?.11:family==='gastric'?.07:.11};
}
export function atmosphereProfile(stage,quality='medium',conservative=false){
 const spec=PHYSIOLOGY[stage]||PHYSIOLOGY[1];
 const max=conservative||quality==='low'?0:quality==='high'?spec.motes:Math.round(spec.motes*.56);
 return {...spec,count:max,quality,conservative:Boolean(conservative)};
}
export function organLight(stage,time,pressure=0,trauma=0){
 const spec=PHYSIOLOGY[stage]||PHYSIOLOGY[1];
 const t=Number.isFinite(time)?time:0;
 const p=clamp(Number.isFinite(pressure)?pressure:0,0,1);
 const w=clamp(Number.isFinite(trauma)?trauma:0,0,1.7);
 const beat=Math.pow(Math.max(0,Math.sin(t*spec.pulse)),2);
 // Keep a recognizable pulse without blinking the level to black.
 return {beat,light:clamp((4.25+beat*3.7+p*4.3+w*3.0)*spec.brightness,2,18),
  fog:clamp(.94+beat*.075+p*.045,.9,1.1),
  wetness:clamp(spec.roughness-beat*.025-w*.017,.22,.92)};
}
function frac(n){return n-Math.floor(n);}
function hash(seed,index,salt){
 const n=(seed>>>0)+Math.imul(index+1,0x9e3779b1)+Math.imul(salt+1,0x85ebca6b);
 let x=n>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);
 return ((x^(x>>>16))>>>0)/4294967296;
}
export function moteAt(seed,stage,index,time,centerX,centerZ){
 const spec=PHYSIOLOGY[stage]||PHYSIOLOGY[1];
 const a=hash(seed,index,stage*11),b=hash(seed,index,stage*17+1),c=hash(seed,index,stage*23+2);
 const t=Number.isFinite(time)?time:0;
 const drift=t*spec.speed;
 // Modulo wraps motes within a player-centered 8m cloud. This prevents
 // unbounded travelling sprites or allocation of new meshes/chunks.
 const x=frac(a+drift*.071)-.5,z=frac(b+drift*.048)-.5;
 const y=.26+frac(c+drift*.10)*2.2;
 return {x:(Number.isFinite(centerX)?centerX:0)+x*8.2,
  y,z:(Number.isFinite(centerZ)?centerZ:0)+z*8.2};
}
export function enemyMotion(type,time,id,windup=0,hit=0,reduced=false){
 const t=Number.isFinite(time)?time:0;
 const seed=Number.isFinite(id)?id:0;
 const hurt=clamp(Number.isFinite(hit)?hit:0,0,1);
 const warn=clamp(Number.isFinite(windup)?windup:0,0,1);
 if(reduced)return {bob:-hurt*.027,roll:0,pitch:0,breath:1,limb:0};
 const f=type==='crawler'?12:type==='leech'?8:type==='synapse'?4.8:type==='spitter'?3.2:
   type==='brute'||type==='ossuary'?2.6:5;
 const wave=Math.sin(t*f+seed*.8);
 const heavy=type==='brute'||type==='ossuary'||type==='warden';
 const hovering=type==='synapse';
 return {
  bob:(hovering?.12:heavy?.028:.065)*wave-hurt*.08,
  roll:(hovering?.095:heavy?.019:.050)*Math.sin(t*f*.61+seed)-hurt*.035,
  pitch:warn*(heavy?-.17:.13)+(hovering?.065:.015)*wave,
  breath:1+Math.sin(t*(heavy?1.9:3.7)+seed)*.035+warn*.045,
  limb:f
 };
}
export function fxLimits(quality='medium',conservative=false){
 return {motes:conservative||quality==='low'?0:quality==='high'?88:50,
  deaths:conservative||quality==='low'?0:5,additionalLights:conservative?0:1};
}
