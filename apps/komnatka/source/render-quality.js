// Native Retina presentation until a genuine framebuffer budget is exceeded.
// Never switch resolution between still and moving phases: the texture must
// not visibly blur as the player drags furniture.
export function hardwareScale({width,height,dpr=1,pixelBudget=3700000}){
 const ratio=Math.min(3,Math.max(1,Number.isFinite(dpr)?dpr:1));
 const pixels=Math.max(1,width)*Math.max(1,height);
 const maxRatio=Math.sqrt(pixelBudget/pixels);
 const actual=Math.max(1,Math.min(ratio,maxRatio));
 return Math.max(1,Math.round((ratio/actual)*100)/100);
}
