// World-anchored stump geometry: a deterministic cut oak trunk whose lower
// bark touches the true playing terrain. Geometry is visual-only; collision
// radius, launch physics, seeds and saved game objects are unchanged.
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function hash(a,b,seed) {
  const n=Math.sin(a*12.9898+b*78.233+seed*37.719)*43758.5453;
  return n-Math.floor(n);
}
export function planGroundedStump(x,y,r,height,seed,heightAt) {
  const radius=Math.max(14,Number(r)||56);
  const rise=Math.max(18,Number(height)||radius*1.15);
  const segments=24;
  const ground=heightAt(x,y);
  const tiltX=(hash(seed,3,11)-.5)*.062;
  const tiltY=(hash(seed,5,17)-.5)*.062;
  const phase=hash(seed,7,23)*TAU;
  const outerFactor=(j)=>{
    const a=j/segments*TAU;
    return .964+.015*Math.sin(3*a+phase)+.011*Math.sin(5*a-phase*.6);
  };
  const topHeight=(px,py)=>ground+rise+tiltX*(px-x)+tiltY*(py-y);
  const ring=(fraction,mode)=>{
    return Array.from({length:segments},(_,j)=>{
      const angle=j/segments*TAU;
      const contour=outerFactor(j);
      const spread=radius*fraction*contour;
      const px=x+Math.cos(angle)*spread;
      const py=y+Math.sin(angle)*spread;
      const local=heightAt(px,py);
      const z=mode==='foot'?local-2.0
        :mode==='flared'?lerp(local,ground+rise*.35,.67)
        :mode==='shoulder'?topHeight(px,py)-rise*.095
        :mode==='lip'?topHeight(px,py)-1.45
        :topHeight(px,py)+.12;
      return [px,py,z];
    });
  };
  const bark=[
    ring(.955,'foot'),
    ring(.935,'flared'),
    ring(.895,'shoulder'),
    ring(.868,'lip')
  ];
  // The cut face is entirely within the silhouette. Imperfect concentric
  // bands are modeled in the same tilted plane; no floating discs or pots.
  const cut=[
    ring(.862,'cut'),
    ring(.758,'cut'),
    ring(.615,'cut'),
    ring(.466,'cut'),
    ring(.319,'cut'),
    ring(.167,'cut')
  ];
  const center=[x,y,topHeight(x,y)+.12];
  // Individual fine checks radiate through the center wood, always tucked
  // inside the cut rim. Their relief is low and noninteractive.
  const checks=Array.from({length:4},(_,i)=>{
    const angle=((i+hash(seed,i,33)*.31)/4)*TAU+phase*.34;
    const inner=radius*(.15+hash(seed,i,37)*.19);
    const outer=radius*(.54+hash(seed,i,41)*.15);
    const stroke=radius*.009;
    const point=(distance,da=0)=>{
      const px=x+Math.cos(angle+da)*distance,py=y+Math.sin(angle+da)*distance;
      return [px,py,topHeight(px,py)+.31];
    };
    return {a:point(inner,-.002),b:point(outer,-stroke/Math.max(outer,1)),
      c:point(outer,stroke/Math.max(outer,1))};
  });
  return {x,y,radius,rise,segments,ground,bark,cut,center,checks};
}
