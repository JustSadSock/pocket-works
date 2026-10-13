// Small painted-dollhouse stage: stable numeric controls, no object or mesh mutations.
// The envelope deliberately puts light on miniature furniture rather than dimming
// the entire scene with a fullscreen effect.
export const MAX_PRACTICAL_LAMPS=4;
export const STUDIO_LIGHTS=2;
export function lightingEnvelope(fraction){
 const night=Math.max(0,Math.min(1,Number.isFinite(fraction)?fraction:0));
 return Object.freeze({
  ambient:.53-.33*night,
  sun:.48-.40*night,
  exposure:.89+.01*night,
  lamp:.045+2.205*night,
  floorGlow:.86*night,
  wallGlow:.48*night,
  shadeRed:.017+.63*night,
  shadeGreen:.013+.37*night,
  shadeBlue:.010+.16*night,
  bulbRed:.06+.91*night,
  bulbGreen:.043+.59*night,
  bulbBlue:.020+.29*night
 });
}
export function physicalLampEnabled(index){
 return Number.isInteger(index)&&index>=0&&index<MAX_PRACTICAL_LAMPS;
}
