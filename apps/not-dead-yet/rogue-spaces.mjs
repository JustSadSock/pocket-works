// v3 architectural memory: hall alcoves carved into unused masonry.
// Existing corridor/room topology and all sector seam ports remain intact.
// This runs only for new layoutVersion=3 games, preserving older saves.
const N=18;
const idx=(x,z)=>z*N+x;
const inside=(x,z)=>x>=2&&x<=15&&z>=2&&z<=15;
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
export function addAlcoves(base,seed,hash){
 const tiles=new Uint8Array(base.tiles),alcoves=[];
 const banned=new Set();
 for(const d of base.doors)for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)
  banned.add(idx(d.x-base.cx*N+dx,d.z-base.cz*N+dz));
 let potentials=[];
 for(let z=2;z<=15;z++)for(let x=2;x<=15;x++){
  if(tiles[idx(x,z)]!==1)continue;
  for(const [dx,dz] of directions){
   const ax=x+dx,az=z+dz;
   if(!inside(ax,az)||tiles[idx(ax,az)]||banned.has(idx(ax,az)))continue;
   // A real recess must be carved out of masonry, not through another
   // apartment's wall or a second hallway. Otherwise the new topology can
   // erase privacy and make the entire sector one big room.
   const contacts=directions.reduce((sum,[xx,zz])=>sum+(tiles[idx(ax+xx,az+zz)]?1:0),0);
   if(contacts!==1)continue;
   const secondX=ax+dx,secondZ=az+dz;
   const deep=inside(secondX,secondZ)&&!tiles[idx(secondX,secondZ)]&&!banned.has(idx(secondX,secondZ))&&
    directions.every(([xx,zz])=>!tiles[idx(secondX+xx,secondZ+zz)]||(xx===-dx&&zz===-dz));
   const rank=hash(seed,base.cx,base.cz,base.epoch,x,z,dx+3,dz+3);
   potentials.push({x:ax,z:az,dx,dz,deep,rank,entranceX:x,entranceZ:z})
  }
 }
 potentials.sort((a,b)=>a.rank-b.rank);
 const max=2+(hash(seed,base.cx,base.cz,base.epoch,701)%2);
 for(const p of potentials){
  if(alcoves.length>=max)break;
  if(alcoves.some(q=>Math.abs(q.x-p.x)+Math.abs(q.z-p.z)<5))continue;
  // Prevent two candidate alcoves from destroying their common wall.
  if(tiles[idx(p.x,p.z)])continue;
  tiles[idx(p.x,p.z)]=1;
  const shape=hash(seed,p.x,p.z,base.epoch)%3;
  const bay={x:p.x,z:p.z,dx:p.dx,dz:p.dz,kind:shape,deep:false};
  // Long narrow vestibules, coat recesses and wall service bays differ
  // by physical silhouette. Keep the outermost cell on the safe side.
  if(p.deep&&((p.rank>>>5)%3)===0){
   const tx=p.x+p.dx,tz=p.z+p.dz;
   if(!tiles[idx(tx,tz)]){
    tiles[idx(tx,tz)]=1;bay.deep=true
   }
  }
  alcoves.push(bay)
 }
 return {...base,tiles,alcoves,layoutName:base.layoutName,architectureVersion:3}
}
