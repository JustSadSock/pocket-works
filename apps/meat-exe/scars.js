// MEAT.EXE v1.9.1: persistent physical damage memory, version-independent.
// Ledger is bounded and deterministic across replay, save/load and scene resets.
export const MAX_SCARS=96;
export const SCAR_TYPES=Object.freeze(['blood','rupture','burn']);
const valid=n=>Number.isFinite(n)&&Math.abs(n)<9999;
const quantize=n=>Math.round(n*4)/4;
export function sanitizeScars(input){
 if(!Array.isArray(input))return [];
 const result=[],seen=new Set();
 for(const entry of input.slice(-MAX_SCARS*3)){
   if(!entry||!Number.isInteger(entry.wave)||entry.wave<1||entry.wave>5||
     !valid(entry.x)||!valid(entry.z)||!SCAR_TYPES.includes(entry.kind))continue;
   const x=quantize(entry.x),z=quantize(entry.z);
   const wall=entry.surface==='wall'&&valid(entry.y)&&entry.y>=.25&&entry.y<=2.5&&
     (Math.abs(entry.nx)===1||Math.abs(entry.nz)===1);
   const nx=wall&&Math.abs(entry.nx)===1?Math.sign(entry.nx):0;
   const nz=wall&&!nx?Math.sign(entry.nz):0;
   const y=wall?quantize(entry.y):undefined;
   const key=entry.wave+':'+x+','+z+':'+(wall?'wall:'+y+':'+nx+','+nz:'floor')+':'+entry.kind;
   if(seen.has(key))continue;
   seen.add(key);
   result.push(wall?{wave:entry.wave,x,z,kind:entry.kind,surface:'wall',y,nx,nz}:
     {wave:entry.wave,x,z,kind:entry.kind});
 }
 return result.slice(-MAX_SCARS);
}
export function addScar(ledger,wave,x,z,kind,wall=null){
 const list=sanitizeScars(ledger);
 if(!Number.isInteger(wave)||wave<1||wave>5||!valid(x)||!valid(z)||
   !SCAR_TYPES.includes(kind))return list;
 const entry={wave,x:quantize(x),z:quantize(z),kind};
 if(wall&&valid(wall.y)&&wall.y>=.25&&wall.y<=2.5&&
   (Math.abs(wall.nx)===1||Math.abs(wall.nz)===1)){
   entry.surface='wall';entry.y=quantize(wall.y);
   entry.nx=Math.abs(wall.nx)===1?Math.sign(wall.nx):0;
   entry.nz=entry.nx?0:Math.sign(wall.nz);
 }
 const previous=list.findIndex(s=>s.wave===wave&&s.x===entry.x&&s.z===entry.z&&
   s.kind===kind&&s.surface===entry.surface&&
   (entry.surface!=='wall'||(s.y===entry.y&&s.nx===entry.nx&&s.nz===entry.nz)));
 if(previous>=0)list.splice(previous,1);
 list.push(entry);
 return list.slice(-MAX_SCARS);
}
export function scarSignature(ledger,wave){
 const selected=sanitizeScars(ledger).filter(s=>s.wave===wave);
 const counts={blood:0,rupture:0,burn:0};
 for(const s of selected)counts[s.kind]++;
 return {wave,count:selected.length,...counts};
}

export function deathPose(type,elapsed,duration=0.8){
 const t=Math.max(0,Math.min(1,(Number.isFinite(elapsed)?elapsed:0)/
   Math.max(.001,Number.isFinite(duration)?duration:.8)));
 const collapse=Math.pow(t,1.35);
 const heavy=['ossuary','brute','warden'].includes(type);
 return {
  complete:t>=1,
  fall:collapse*(heavy?.23:.30),
  pitch:collapse*(type==='synapse'?1.10:.58),
  yaw:collapse*.54,
  roll:collapse*(heavy?.88:1.32),
  horizontal:1-collapse*.80,
  vertical:1-collapse*.63
 };
}

// Wall scar must lie on a real axial wall plane, facing the shooter.
// Combat hitRay returns the last valid point before leaving walkable space.
export function locateWallWound(point,dir){
 if(!point||!dir||![point.x,point.y,point.z,dir.x,dir.z].every(Number.isFinite)||
    point.y<.25||point.y>2.5||Math.hypot(dir.x,dir.z)<.01)return null;
 const bx=Math.round(point.x),bz=Math.round(point.z);
 const sx=Math.sign(dir.x),sz=Math.sign(dir.z);
 const tx=sx?(bx+sx*.5-point.x)/dir.x:Infinity;
 const tz=sz?(bz+sz*.5-point.z)/dir.z:Infinity;
 const alongX=tx>=0&&tx<=tz||tz<0;
 const nx=alongX?-sx:0,nz=alongX?0:-sz;
 if(!nx&&!nz)return null;
 return {x:alongX?bx+sx*.5:point.x,z:alongX?point.z:bz+sz*.5,
   y:point.y,nx,nz};
}
export function scarSurfaceStats(ledger,wave){
 const entries=sanitizeScars(ledger).filter(s=>s.wave===wave);
 return {wall:entries.filter(s=>s.surface==='wall').length,
   floor:entries.filter(s=>s.surface!=='wall').length};
}
