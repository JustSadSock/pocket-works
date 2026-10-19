// MEAT.EXE v1.8 / physical biome architecture. Pure seeded descriptions:
// art never changes the navigation graph, membrane cells, or hit resolution.
export const STRUCTURAL_CHAMBERS=Object.freeze({
  vascular:Object.freeze(['valve-hall','anastomosis','arterial-arch']),
  marrow:Object.freeze(['bone-well','trabecular-vault','marrow-crypt']),
  neural:Object.freeze(['synapse','axon-bridge','ganglion'])
});
function hash(x,z,seed,salt){
  let n=(Math.imul(x,374761393)^Math.imul(z,668265263)^(seed>>>0)^Math.imul(salt,1442695041))>>>0;
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967296;
}
export function structuralChamber(cx,cz,seed,biome){
  const types=STRUCTURAL_CHAMBERS[biome];
  if(!types) return null;
  const salt=biome==='vascular'?31:biome==='marrow'?43:59;
  // The starting room of each anatomical zone is a recognizable visual anchor.
  const index=cx===0&&cz===0?0:Math.floor(hash(cx,cz,seed,salt)*types.length);
  return Object.freeze({
    biome,type:types[index],index,
    seed:Math.floor(hash(cx,cz,seed,salt+1)*65535),
    ribs:2+Math.floor(hash(cx,cz,seed,salt+2)*3),
    filaments:3+Math.floor(hash(cx,cz,seed,salt+3)*4),
    pores:.25+hash(cx,cz,seed,salt+4)*.33,
    twist:hash(cx,cz,seed,salt+5)*Math.PI*2,
    mass:.72+hash(cx,cz,seed,salt+6)*.48
  });
}
// Standalone hero forms stay above the camera and central hitscan lane.
// Wall relief is permitted at any height because it occupies blocked tiles.
export function structuralLandmarkSafe(bottom,height,radius){
  return Number.isFinite(bottom)&&Number.isFinite(height)&&Number.isFinite(radius)
    &&bottom>=1.96&&height<=.78&&radius<=.94&&radius>0&&height>0;
}
