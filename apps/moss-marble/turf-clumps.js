// Miniature tufts replacing the former tall one-triangle placeholders.
// No collision meshes, no changing game state, no random runtime flicker.
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function hash(index, seed, salt) {
  const v = Math.sin(index * 12.9898 + seed * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
function inside(x, y, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x-a.x) * (y-a.y) / (b.y-a.y) + a.x) result = !result;
  }
  return result;
}
function nearObject(x, y, level) {
  if (Math.hypot(x - level.start.x, y - level.start.y) < 90) return true;
  if (Math.hypot(x - level.hole.x, y - level.hole.y) < (level.hole.r || 30) + 68) return true;
  for (const prop of level.course18?.props || []) {
    if (Math.hypot(x-prop.x, y-prop.y) < (prop.r || 38)+25) return true;
  }
  for (const rotor of level.rotors || []) {
    if (Math.hypot(x-rotor.x,y-rotor.y) < (rotor.length || 180)*.55 + 23) return true;
  }
  return false;
}
function routeSample(points, t) {
  const f = clamp(t,0,1)*(points.length-1);
  const i = Math.min(points.length-2,Math.floor(f));
  const a=points[i],b=points[i+1],alpha=f-i;
  const dx=b.x-a.x,dy=b.y-a.y,mag=Math.hypot(dx,dy)||1;
  return {x:a.x+dx*alpha,y:a.y+dy*alpha,nx:-dy/mag,ny:dx/mag};
}
function shadeLocal(color, scale) {
  return [clamp(color[0]*scale,0,1),clamp(color[1]*scale,0,1),clamp(color[2]*scale,0,1),1];
}
export function planTurfClumps(level, seed, palette = {}, limit = 25) {
  const field=level?.course18?.field;
  if (!field?.heightAt || !field?.surfaceAt || !level?.centerline || level.centerline.length<2) return [];
  const clumps=[];
  const source=palette.leaf || [.29,.47,.26,1];
  const candidates=85;
  for(let i=0;i<candidates && clumps.length<limit;i++){
    const rt=routeSample(level.centerline,.055 + .89*hash(i,seed,31));
    const offset=(hash(i,seed,37)*2-1)*207;
    const x=rt.x+rt.nx*offset,y=rt.y+rt.ny*offset;
    if(!inside(x,y,level.outline) || nearObject(x,y,level)) continue;
    const surface=field.surfaceAt(x,y);
    if(surface!=='grass' && surface!=='moss') continue;
    const ground=field.heightAt(x,y);
    const live=field.colorAt?.(x,y,ground,field.normalAt?.(x,y) || [0,0,1]);
    const turf=live || source;
    const base=[turf[0]*.72+source[0]*.28,turf[1]*.72+source[1]*.28,turf[2]*.72+source[2]*.28,1];
    const blades=[];
    const bladeCount=3+Math.floor(hash(i,seed,41)*2);
    for(let j=0;j<bladeCount;j++){
      const phi=(j/bladeCount+.13*hash(i+j,seed,43))*TAU;
      const ux=Math.cos(phi),uy=Math.sin(phi);
      const x0=x+(hash(i+j,seed,47)-.5)*3.4;
      const y0=y+(hash(i+j,seed,53)-.5)*3.4;
      const height=4.5+hash(i+j,seed,59)*5.8;
      const lean=height*(.30+hash(i+j,seed,61)*.20);
      const width=.68+hash(i+j,seed,67)*.70;
      const tx=-uy,ty=ux;
      const tipX=x0+ux*lean,tipY=y0+uy*lean;
      if(!inside(x0,y0,level.outline)||!inside(tipX,tipY,level.outline)) continue;
      if(field.surfaceAt(tipX,tipY)!==surface) continue;
      const z0=field.heightAt(x0,y0)+.28;
      const zm=field.heightAt(x0+ux*lean*.40,y0+uy*lean*.40)+height*.54;
      const zt=field.heightAt(tipX,tipY)+height;
      const midX=x0+ux*lean*.40,midY=y0+uy*lean*.40;
      const normal=[ux*.28,uy*.28,.96];
      blades.push({
        vertices:[
          [x0-tx*width,y0-ty*width,z0],
          [x0+tx*width,y0+ty*width,z0],
          [midX+tx*width*.55,midY+ty*width*.55,zm],
          [midX-tx*width*.55,midY-ty*width*.55,zm],
          [tipX,tipY,zt]
        ],
        color:shadeLocal(base,.87+hash(i+j,seed,73)*.26),normal
      });
    }
    if(blades.length>=2) clumps.push({x,y,surface,blades});
  }
  return clumps;
}
export function appendTurfClumps(mesh, clumps) {
  for(const clump of clumps)for(const blade of clump.blades){
    const [a,b,c,d,e]=blade.vertices;
    const color=blade.color,normal=blade.normal;
    mesh.triangle(a,b,c,color,0,normal);
    mesh.triangle(a,c,d,color,0,normal);
    mesh.triangle(d,c,e,color,0,normal);
  }
}
