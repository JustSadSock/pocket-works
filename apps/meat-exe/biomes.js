// Four anatomical stages with distinct visual materials, architecture and real hazards.
// All biome decisions use pure integer hashes: replay, save, and multiplayer-ready.
export const BIOMES=Object.freeze([
 Object.freeze({id:'vascular',name:'СОСУДИСТАЯ СИСТЕМА',short:'СОСУДЫ',hazard:null,
   background:0x120408,fog:0x23080b,fogDensity:.09,light:0xffb49a,pulse:0xe72c3c,
   hue:.965,saturation:.48,floorLight:.46,wallLight:.42,bone:0xc19a8b,
   vein:0x972334,accent:0xe86168,landmark:'artery'}),
 Object.freeze({id:'gastric',name:'ЖЕЛУДОК',short:'ЖЕЛУДОК',hazard:'acid',
   background:0x17120a,fog:0x282012,fogDensity:.112,light:0xffcc79,pulse:0xa5ba4d,
   hue:.105,saturation:.44,floorLight:.45,wallLight:.38,bone:0xdbc68a,
   vein:0x738035,accent:0xc3dd59,landmark:'fold'}),
 Object.freeze({id:'marrow',name:'КОСТНЫЙ МОЗГ',short:'КОСТНЫЙ МОЗГ',hazard:'marrow',
   background:0x140d10,fog:0x2b1b22,fogDensity:.081,light:0xf7d1af,pulse:0xba6975,
   hue:.058,saturation:.20,floorLight:.65,wallLight:.58,bone:0xe6d1b8,
   vein:0x9a5d62,accent:0xffd0ad,landmark:'rib'}),
 Object.freeze({id:'neural',name:'НЕРВНАЯ ТКАНЬ',short:'НЕРВЫ',hazard:'charge',
   background:0x0c0b16,fog:0x19182c,fogDensity:.102,light:0xb6bce9,pulse:0xc0b4fe,
   hue:.705,saturation:.21,floorLight:.47,wallLight:.40,bone:0xaaa8c0,
   vein:0x8685b3,accent:0xd7d6ff,landmark:'axon'})
]);
export function biomeForWave(wave){
 const n=Number.isFinite(wave)?Math.trunc(wave):1;
 return BIOMES[Math.max(0,Math.min(3,n-1))];
}
export function stageSeed(seed,wave){
 const s=seed>>>0,w=Number.isFinite(wave)?Math.max(1,Math.min(5,Math.trunc(wave))):1;
 return (s ^ Math.imul(w-1,0x9e3779b1))>>>0;
}
function hash(x,z,seed,wave){
 let n=(Math.imul(x,374761393)^Math.imul(z,668265263)^(seed>>>0)^Math.imul(wave,1442695041))>>>0;
 n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
}
// Environment hazards never obstruct traversal; walkable floor remains connected.
// The starting 3x3 inner safety circle is exempt in *every* world stage.
export function biomeHazard(seed,wave,x,z){
 const biome=biomeForWave(wave);
 if(!biome.hazard||!Number.isInteger(x)||!Number.isInteger(z))return null;
 if(x>=1&&x<=6&&z>=1&&z<=6&&Math.hypot(x-3.5,z-3.5)<2.5)return null;
 const r=hash(x,z,seed,wave);
 const threshold=biome.hazard==='acid'?.25:biome.hazard==='marrow'?.20:.22;
 if(r>=threshold)return null;
 return biome.hazard;
}
export function biomeSpeedFactor(hazard){return hazard==='marrow'?.68:1;}
export function biomeDamage(hazard){return hazard==='acid'?6:hazard==='charge'?8:0;}
export function biomeRuptureHeal(wave){return biomeForWave(wave).id==='vascular'?6:0;}
export function biomeSpawnWeight(wave){
 return biomeForWave(wave).id==='marrow'?.42:biomeForWave(wave).id==='neural'?.29:.20;
}
