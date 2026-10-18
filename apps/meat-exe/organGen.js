// 2D Simplex noise with deterministic seed. Based on Stefan Gustavson's algo
class SimplexNoise{
  constructor(seed=0){
    this.p=new Uint8Array(256);
    for(let i=0;i<256;i++)this.p[i]=i;
    let n=seed>>>0;
    for(let i=255;i>0;i--){
      n=(n*1664525+1013904223)>>>0;
      const r=n%(i+1);
      const t=this.p[i];this.p[i]=this.p[r];this.p[r]=t;
    }
  }
  noise2D(xin,yin){
    const grad3=[1,1,-1,1,1,-1,-1,-1,1,0,-1,0,0,1,0,-1];
    const F2=0.366025403,G2=0.211324865;
    let n0=0,n1=0,n2=0;
    const s=(xin+yin)*F2;
    let i=Math.floor(xin+s);let j=Math.floor(yin+s);
    const t=(i+j)*G2;
    const X0=i-t,Y0=j-t;
    const x0=xin-X0,y0=yin-Y0;
    let i1,j1;
    if(x0>y0){i1=1;j1=0;}else{i1=0;j1=1;}
    const x1=x0-i1+G2,y1=y0-j1+G2;
    const x2=x0-1+2*G2,y2=y0-1+2*G2;
    i&=255;j&=255;
    const gi0=this.p[i+this.p[j]]%8*2;
    const gi1=this.p[i+i1+this.p[j+j1]]%8*2;
    const gi2=this.p[i+1+this.p[j+1]]%8*2;
    let t0=0.5-x0*x0-y0*y0;
    if(t0>0){t0*=t0;n0=t0*t0*(grad3[gi0]*x0+grad3[gi0+1]*y0);} 
    let t1=0.5-x1*x1-y1*y1;
    if(t1>0){t1*=t1;n1=t1*t1*(grad3[gi1]*x1+grad3[gi1+1]*y1);} 
    let t2=0.5-x2*x2-y2*y2;
    if(t2>0){t2*=t2;n2=t2*t2*(grad3[gi2]*x2+grad3[gi2+1]*y2);} 
    return 70*(n0+n1+n2);
  }
}

let simplex=new SimplexNoise(0);
let worldSeed=0;
export const CELLS_PER_CHUNK=8;
export function setSeed(s){
  simplex=new SimplexNoise(s);
  worldSeed=s>>>0;
}

function mulberry32(a){
  return function(){
    let t=a+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

// Determine if a chunk edge is open for corridor generation
function edgeOpen(cx,cy,dir){
  // dir:0=N,1=E,2=S,3=W
  // previously edge openings were random which could isolate rooms. always open
  // all edges so chunks seamlessly connect with corridors
  return 1;
}

// Get corridor coordinate along a chunk edge
function edgeCoord(cx,cy,dir){
  let seed;
  if(dir===0) seed=(cx*73856093 ^ cy*19349663 ^ worldSeed ^ 0)>>>0;
  else if(dir===2) seed=(cx*73856093 ^ (cy+1)*19349663 ^ worldSeed ^ 0)>>>0;
  else if(dir===1) seed=((cx+1)*73856093 ^ cy*19349663 ^ worldSeed ^ 1)>>>0;
  else seed=(cx*73856093 ^ cy*19349663 ^ worldSeed ^ 1)>>>0;
  const rnd=mulberry32(seed);
  return Math.floor(rnd()*CELLS_PER_CHUNK);
}

function listFirst(set){
  for(const v of set) return v;
  return null;
}

let floorGeo, wallGeo;
let floorMat, wallMat;

// Every sector is a *connected* miniature room graph. The peripheral vessel loop
// deliberately creates two viable routes, letting a rupture open a shortcut
// without ever being required to traverse the level.
export function getOrganProfile(cx,cy){
  const rnd=mulberry32((Math.imul(cx,73856093)^Math.imul(cy,19349663)^worldSeed^0x741acf2d)>>>0);
  return {archetype:['atrium','rib-vault','artery'][Math.floor(rnd()*3)],rotation:Math.floor(rnd()*4),
    vent:Math.floor(rnd()*4),growth:rnd(),tone:rnd()};
}
export function generateOrgan(cx,cy){
  const SIZE=CELLS_PER_CHUNK,bx=cx*SIZE,by=cy*SIZE;
  const rnd=mulberry32((Math.imul(cx,73856093)^Math.imul(cy,19349663)^worldSeed)>>>0);
  const profile=getOrganProfile(cx,cy);
  const found=new Set(),cells=[];
  const dig=(x,y)=>{
    if(x<0||y<0||x>=SIZE||y>=SIZE)return;
    const key=x+','+y;
    if(!found.has(key)){found.add(key);cells.push({x:bx+x,y:by+y});}
  };
  const corridor=(start,end,horizontalFirst=true)=>{
    let x=start.x,y=start.y;dig(x,y);
    const xWalk=()=>{while(x!==end.x){x+=Math.sign(end.x-x);dig(x,y);}};
    const yWalk=()=>{while(y!==end.y){y+=Math.sign(end.y-y);dig(x,y);}};
    if(horizontalFirst){xWalk();yWalk();}else{yWalk();xWalk();}
  };
  // Closed vessel loop around a mechanically distinct inner chamber. No false
  // dead ends: every portal is connected to this loop via a short stem.
  const left=1,right=6,top=1,bottom=6;
  for(let x=left;x<=right;x++){dig(x,top);dig(x,bottom);}
  for(let y=top;y<=bottom;y++){dig(left,y);dig(right,y);}
  const center={x:3+(profile.rotation%2),y:3+Math.floor(profile.rotation/2)};
  if(profile.archetype==='atrium'){
    for(let x=2;x<=5;x++)for(let y=2;y<=5;y++){
      if((x===2||x===5)&&(y===2||y===5)&&profile.growth<.63)continue;
      dig(x,y);
    }
  }else if(profile.archetype==='rib-vault'){
    for(let y=2;y<=5;y++)for(let x=2;x<=5;x++){
      if(y===3||y===4||((x+y+profile.rotation)%3===0))dig(x,y);
    }
  }else{
    for(let y=2;y<=5;y++)for(let x=2;x<=5;x++){
      if(x===center.x||y===center.y||((x+y+profile.rotation)%5===0))dig(x,y);
    }
  }
  // Bridges from the loop into the chamber have different orientations.
  const links=[{x:1,y:center.y},{x:6,y:center.y},{x:center.x,y:1},{x:center.x,y:6}];
  for(let i=0;i<4;i++)if(i%2===profile.rotation%2||rnd()>.54)
    corridor(center,links[i],i%2===0);
  // Inter-chunk portals always match their neighbours.
  const portals=[
    {x:edgeCoord(cx,cy,0),y:0,inner:{x:edgeCoord(cx,cy,0),y:1}},
    {x:7,y:edgeCoord(cx,cy,1),inner:{x:6,y:edgeCoord(cx,cy,1)}},
    {x:edgeCoord(cx,cy,2),y:7,inner:{x:edgeCoord(cx,cy,2),y:6}},
    {x:0,y:edgeCoord(cx,cy,3),inner:{x:1,y:edgeCoord(cx,cy,3)}}
  ];
  for(const p of portals){
    dig(p.x,p.y);
    const loopEntry={x:Math.min(6,Math.max(1,p.inner.x)),y:Math.min(6,Math.max(1,p.inner.y))};
    corridor(p,loopEntry,true);
    // Corner portals are pulled inward to the vessel loop before entering a chamber.
  }
  // A few irregular vessel bulbs; never carve disconnected cells.
  for(let j=0;j<3;j++){
    const x=2+Math.floor(rnd()*4),y=2+Math.floor(rnd()*4);
    if(found.has(x+','+y)){
      const dx=[-1,1,0,0][j],dy=[0,0,-1,1][j];
      if(rnd()>.28)dig(x+dx,y+dy);
    }
  }
  return cells;
}

// Select a destructible membrane ONLY from cells whose removal leaves the
// sector's remaining traversal graph connected. Entrance and spawn are exempt.
export function getTissueNodes(cx,cy){
  const cells=generateOrgan(cx,cy),open=new Set(cells.map(c=>c.x+','+c.y));
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const baseX=cx*CELLS_PER_CHUNK,baseY=cy*CELLS_PER_CHUNK;
  const options=[];
  for(const c of cells){
    const lx=c.x-baseX,ly=c.y-baseY;
    if(lx<=0||ly<=0||lx>=7||ly>=7)continue;
    if(cx===0&&cy===0&&Math.hypot(lx-3.5,ly-3.5)<2.2)continue;
    const neighbors=dirs.filter(([dx,dy])=>open.has((c.x+dx)+','+(c.y+dy))).length;
    if(neighbors<2||neighbors>3)continue;
    const removed=c.x+','+c.y;
    const first=cells.find(v=>v.x+','+v.y!==removed);
    const queue=[first],seen=new Set([first.x+','+first.y]);
    for(let i=0;i<queue.length;i++){
      const v=queue[i];
      for(const [dx,dy] of dirs){
        const k=(v.x+dx)+','+(v.y+dy);
        if(k!==removed&&open.has(k)&&!seen.has(k)){seen.add(k);queue.push({x:v.x+dx,y:v.y+dy});}
      }
    }
    if(seen.size===cells.length-1)options.push(c);
  }
  if(!options.length)return [];
  const rnd=mulberry32((Math.imul(cx,83492791)^Math.imul(cy,2654435761)^worldSeed^0x515a3d3)>>>0);
  const c=options[Math.floor(rnd()*options.length)];
  return [{id:c.x+','+c.y,x:c.x,z:c.y,hp:100,archetype:getOrganProfile(cx,cy).archetype}];
}

// Helper for the Three.js renderer. Builds a tunnel mesh for a chunk.
export function generateTunnelMesh(cx,cy,THREE){
  const cells=generateOrgan(cx,cy);
  if(!floorGeo){
    // Slightly raise the floor to avoid depth fighting with walls
    floorGeo=new THREE.PlaneGeometry(1,1)
      .rotateX(-Math.PI/2)
      .translate(0,0.01,0);   // кладём горизонтально (XZ)
  }

  if(!wallGeo){
    wallGeo=new THREE.BoxGeometry(1,2,0.1).translate(0,1,0);       // основание в Y-0
  }

  if(!floorMat){
    floorMat=new THREE.MeshStandardMaterial({
        color:0xb01515,   // ярче
        emissive:0x300000,
        roughness:0.9,
        metalness:0,
        side:THREE.DoubleSide
    });
    wallMat=floorMat;       // тот же материал для стен
  }
  const group=new THREE.Group();
  group.castShadow=group.receiveShadow=true;
  const cellSet=new Set(cells.map(c=>c.x+','+c.y));
  const SIZE=CELLS_PER_CHUNK;
  const edgeCoords=[edgeCoord(cx,cy,0),edgeCoord(cx,cy,1),edgeCoord(cx,cy,2),edgeCoord(cx,cy,3)];
  const edgeOpenings=[edgeOpen(cx,cy,0),edgeOpen(cx,cy,1),edgeOpen(cx,cy,2),edgeOpen(cx,cy,3)];
  for(const c of cells){
    const fx=c.x;
    const fz=c.y;
    const floor=new THREE.Mesh(floorGeo,floorMat);
    floor.position.set(fx,0,fz);
    group.add(floor);
    const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
    const lx=c.x-cx*SIZE;
    const ly=c.y-cy*SIZE;
    for(let i=0;i<4;i++){
      const dx=dirs[i][0],dy=dirs[i][1];
      const nx=c.x+dx, ny=c.y+dy;
      let neighbor=cellSet.has(nx+','+ny);
      if(!neighbor){
        let skip=false;
        if(i===0) skip=lx===SIZE-1 && edgeOpenings[1] && ly===edgeCoords[1];
        else if(i===1) skip=ly===SIZE-1 && edgeOpenings[2] && lx===edgeCoords[2];
        else if(i===2) skip=lx===0 && edgeOpenings[3] && ly===edgeCoords[3];
        else if(i===3) skip=ly===0 && edgeOpenings[0] && lx===edgeCoords[0];
        if(!skip){
          const wall=new THREE.Mesh(wallGeo,wallMat);
          // position so the bottom aligns with the floor
          wall.position.set(fx+dx*0.5,0,fz+dy*0.5);
          wall.rotation.y=i===0?-Math.PI/2:i===2?Math.PI/2:i===1?Math.PI:0;
          group.add(wall);
        }
      }
    }
  }
  group.userData.materials={floor:floorMat,wall:wallMat};
  return group;
}

// Expose helpers for other modules (e.g. collision and rendering)
export { edgeOpen, edgeCoord };
