// Three distinct gastric landmarks selected by world seed and sector.
// Geometry is decoration: the existing connected floor graph and combat remain authoritative.
export const GASTRIC_CHAMBERS=Object.freeze(['pylorus','cistern','rugae']);
export function gastricChamber(cx,cz,seed){
 const k=(Math.imul(cx,73856093)^Math.imul(cz,19349663)^(seed>>>0)^0x614ae11b)>>>0;
 let v=Math.imul(k^(k>>>16),2246822519);v=Math.imul(v^(v>>>13),3266489917);v=(v^(v>>>16))>>>0;
 const type=cx===0&&cz===0?'pylorus':GASTRIC_CHAMBERS[v%3];
 return {type,folds:type==='rugae'?1:type==='cistern'?.72:.48,arches:type==='pylorus'?3:type==='rugae'?1:2,
  hang:type==='cistern'?1.12:type==='rugae'?.67:.40,seed:v};
}
export function gastricLandmarkSafe(type,y,radius){
 // Keep every major animated form above player eye level and all attack traces;
 // hazards and collisions belong solely to the deterministic floor model.
 return GASTRIC_CHAMBERS.includes(type)&&y>=1.85&&radius<=1.2;
}
