import { expandBounds } from './engine.js';

const TETS = [
  [0,5,1,6], [0,1,2,6], [0,2,3,6],
  [0,3,7,6], [0,7,4,6], [0,4,5,6]
];
const CORNERS = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const EPS = 1e-8;

export function meshCompiledPart(part, options = {}) {
  const detail = Math.max(20, Math.min(96, Math.round(options.detail || 46)));
  const margin = Math.max(0.5, Number(options.margin || 2));
  const bounds = expandBounds(part.compiled.bounds, margin);
  const maxSize = Math.max(...bounds.size, 1);
  const step = Math.max(0.12, maxSize / detail);
  const nx = Math.max(2, Math.ceil(bounds.size[0] / step));
  const ny = Math.max(2, Math.ceil(bounds.size[1] / step));
  const nz = Math.max(2, Math.ceil(bounds.size[2] / step));
  const sx = bounds.size[0] / nx, sy = bounds.size[1] / ny, sz = bounds.size[2] / nz;
  const gx = nx + 1, gy = ny + 1, gz = nz + 1;
  const values = new Float32Array(gx * gy * gz);
  const index = (x,y,z) => x + gx * (y + gy * z);
  const sdf = part.compiled.sdf;
  for (let z = 0; z < gz; z++) {
    const pz = bounds.min[2] + z * sz;
    for (let y = 0; y < gy; y++) {
      const py = bounds.min[1] + y * sy;
      for (let x = 0; x < gx; x++) {
        let value=sdf(bounds.min[0] + x * sx, py, pz);
        if(Math.abs(value)<1e-7)value=1e-7;
        values[index(x,y,z)] = value;
      }
    }
    options.onProgress?.(z / Math.max(1, gz - 1) * 0.42);
  }

  const vertices = [];
  const indices = [];
  const vertexMap = new Map();
  const p = new Array(8);
  const d = new Float32Array(8);

  function addVertex(v) {
    const key = `${Math.round(v[0]*1e5)},${Math.round(v[1]*1e5)},${Math.round(v[2]*1e5)}`;
    let id = vertexMap.get(key);
    if (id === undefined) {
      id = vertices.length / 3;
      vertices.push(v[0], v[1], v[2]);
      vertexMap.set(key, id);
    }
    return id;
  }

  function edgePoint(a, b) {
    const da = d[a], db = d[b];
    const t = Math.abs(da - db) < EPS ? 0.5 : da / (da - db);
    return [
      p[a][0] + (p[b][0] - p[a][0]) * t,
      p[a][1] + (p[b][1] - p[a][1]) * t,
      p[a][2] + (p[b][2] - p[a][2]) * t
    ];
  }

  function orientAndAdd(a, b, c) {
    const ux = b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
    const vx = c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
    let nxv = uy*vz-uz*vy, nyv=uz*vx-ux*vz, nzv=ux*vy-uy*vx;
    const area2 = Math.hypot(nxv, nyv, nzv);
    if (area2 < 1e-10) return;
    const cx=(a[0]+b[0]+c[0])/3, cy=(a[1]+b[1]+c[1])/3, cz=(a[2]+b[2]+c[2])/3;
    const e = Math.max(0.02, Math.min(sx,sy,sz)*0.35);
    const gxv=sdf(cx+e,cy,cz)-sdf(cx-e,cy,cz);
    const gyv=sdf(cx,cy+e,cz)-sdf(cx,cy-e,cz);
    const gzv=sdf(cx,cy,cz+e)-sdf(cx,cy,cz-e);
    if (nxv*gxv + nyv*gyv + nzv*gzv < 0) [b,c] = [c,b];
    const ai=addVertex(a), bi=addVertex(b), ci=addVertex(c);
    if(ai===bi||bi===ci||ci===ai)return;
    indices.push(ai,bi,ci);
  }

  function polygonizeTet(tet) {
    const inside = tet.filter(i => d[i] < 0);
    if (inside.length === 0 || inside.length === 4) return;
    const outside = tet.filter(i => d[i] >= 0);
    if (inside.length === 1) {
      const i = inside[0];
      orientAndAdd(edgePoint(i,outside[0]), edgePoint(i,outside[1]), edgePoint(i,outside[2]));
    } else if (inside.length === 3) {
      const o = outside[0];
      orientAndAdd(edgePoint(o,inside[0]), edgePoint(o,inside[2]), edgePoint(o,inside[1]));
    } else {
      const [i0,i1] = inside, [o0,o1] = outside;
      const a=edgePoint(i0,o0), b=edgePoint(i0,o1), c=edgePoint(i1,o0), e=edgePoint(i1,o1);
      orientAndAdd(a,b,c);
      orientAndAdd(b,e,c);
    }
  }

  let cellsDone = 0;
  const totalCells = nx*ny*nz;
  for (let z=0; z<nz; z++) {
    for (let y=0; y<ny; y++) {
      for (let x=0; x<nx; x++) {
        for (let i=0; i<8; i++) {
          const c=CORNERS[i], xi=x+c[0], yi=y+c[1], zi=z+c[2];
          p[i]=[bounds.min[0]+xi*sx,bounds.min[1]+yi*sy,bounds.min[2]+zi*sz];
          d[i]=values[index(xi,yi,zi)];
        }
        let allIn=true, allOut=true;
        for (let i=0;i<8;i++) { if (d[i] < 0) allOut=false; else allIn=false; }
        if (!allIn && !allOut) for (const tet of TETS) polygonizeTet(tet);
        cellsDone++;
      }
    }
    options.onProgress?.(0.42 + 0.52 * cellsDone/totalCells);
  }

  const mesh = finalizeMesh(vertices, indices, part);
  mesh.grid = { nx, ny, nz, step: Math.max(sx,sy,sz) };
  options.onProgress?.(1);
  return mesh;
}

export function finalizeMesh(vertexArray, indexArray, part = {}) {
  const positions = vertexArray instanceof Float32Array ? vertexArray : new Float32Array(vertexArray);
  const indices = indexArray instanceof Uint32Array ? indexArray : new Uint32Array(indexArray);
  const normals = new Float32Array(positions.length);
  for (let i=0;i<indices.length;i+=3) {
    const ia=indices[i]*3, ib=indices[i+1]*3, ic=indices[i+2]*3;
    const ax=positions[ia], ay=positions[ia+1], az=positions[ia+2];
    const ux=positions[ib]-ax, uy=positions[ib+1]-ay, uz=positions[ib+2]-az;
    const vx=positions[ic]-ax, vy=positions[ic+1]-ay, vz=positions[ic+2]-az;
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    for (const j of [ia,ib,ic]) { normals[j]+=nx; normals[j+1]+=ny; normals[j+2]+=nz; }
  }
  for (let i=0;i<normals.length;i+=3) {
    const l=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
    normals[i]/=l; normals[i+1]/=l; normals[i+2]/=l;
  }
  const bounds = meshBounds(positions);
  const analysis = analyzeMesh(positions, indices, bounds);
  return {
    id: part.id || 'part', name: part.name || part.id || 'Деталь', color: part.color || '#d9dfd3', visible: part.visible !== false,
    positions, normals, indices, bounds, analysis
  };
}

export function meshBounds(positions) {
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3) for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i+k]);max[k]=Math.max(max[k],positions[i+k]);}
  if (!positions.length) return {min:[0,0,0],max:[0,0,0],size:[0,0,0],center:[0,0,0]};
  return {min,max,size:max.map((v,i)=>v-min[i]),center:max.map((v,i)=>(v+min[i])/2)};
}

export function analyzeMesh(positions, indices, bounds = meshBounds(positions)) {
  let area=0, volume=0, degenerate=0;
  const edges=new Map();
  const edge=(a,b)=>{ if(a>b)[a,b]=[b,a]; const k=`${a}:${b}`; edges.set(k,(edges.get(k)||0)+1); };
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2]; edge(a,b);edge(b,c);edge(c,a);
    const ia=a*3,ib=b*3,ic=c*3;
    const ax=positions[ia],ay=positions[ia+1],az=positions[ia+2];
    const bx=positions[ib],by=positions[ib+1],bz=positions[ib+2];
    const cx=positions[ic],cy=positions[ic+1],cz=positions[ic+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    const triArea=Math.hypot(nx,ny,nz)/2; area+=triArea; if(triArea<1e-12)degenerate++;
    volume += (ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;
  }
  let boundaryEdges=0, nonManifoldEdges=0;
  for(const count of edges.values()){if(count===1)boundaryEdges++;else if(count!==2)nonManifoldEdges++;}
  volume=Math.abs(volume);
  return {
    vertices: positions.length/3, triangles: indices.length/3, surfaceArea: area, volume,
    boundaryEdges, nonManifoldEdges, degenerate,
    watertight: boundaryEdges===0 && nonManifoldEdges===0,
    size: bounds.size.slice(), minZ: bounds.min[2], maxZ: bounds.max[2],
    plaWeight: volume/1000*1.24
  };
}

export function combineBounds(meshes) {
  const visible=meshes.filter(m=>m.visible!==false && m.positions.length);
  if(!visible.length)return {min:[-10,-10,-10],max:[10,10,10],size:[20,20,20],center:[0,0,0]};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const mesh of visible) for(let i=0;i<3;i++){min[i]=Math.min(min[i],mesh.bounds.min[i]);max[i]=Math.max(max[i],mesh.bounds.max[i]);}
  return {min,max,size:max.map((v,i)=>v-min[i]),center:max.map((v,i)=>(v+min[i])/2)};
}
