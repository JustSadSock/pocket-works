// Stable fictional cartography: 12 connected counties, not a physical-world simulation.
// Geometry is pure and generated WITHOUT consuming the world PRNG. Same seed means
// the same geography even after births, inheritance or save/load.
export const ATLAS_W=860, ATLAS_H=570;
const SHAPES={12:{cols:4,rows:3,width:860,height:570,x0:49,y0:54,cw:191,ch:151},
  48:{cols:8,rows:6,width:1720,height:1140,x0:49,y0:54,cw:199,ch:168}};
const mix32=n=>{n=(n^(n>>>16))>>>0;n=Math.imul(n,0x7feb352d);n=(n^(n>>>15))>>>0;n=Math.imul(n,0x846ca68b);return(n^(n>>>16))>>>0};
export function atlasNoise(seed,key){return mix32((seed>>>0)^Math.imul(key+1,0x9e3779b1))/4294967296}
const round=n=>+n.toFixed(2);
function sharedEdge(a,b,seed){
  const [p,q]=[a,b].sort((u,v)=>u.key-v.key);
  const dx=q.x-p.x,dy=q.y-p.y,dist=Math.hypot(dx,dy)||1;
  const bias=(atlasNoise(seed,p.key*97+q.key*19)-.5)*76;
  const ripple=(atlasNoise(seed,p.key*151+q.key*53)-.5)*23;
  const samples=[p];
  for(let i=1;i<=5;i++){
    const t=i/6;
    // The same coastline/feudal boundary is used from both sides, in
    // opposite traversal order. No gaps, random-jump seams or rectilinear grid.
    const offset=Math.sin(Math.PI*t)*bias+Math.sin(3*Math.PI*t)*ripple;
    samples.push({x:round(p.x+t*dx-dy/dist*offset),
      y:round(p.y+t*dy+dx/dist*offset)});
  }
  samples.push(q);
  return a.key===p.key?samples:samples.reverse();
}
export function makeAtlasGeometry(seed=413,size=12){
  const shape=SHAPES[size];if(!shape)throw RangeError('Unknown atlas size');
  const {cols:COLS,rows:ROWS,width,height,x0:X0,y0:Y0,cw:CW,ch:CH}=shape;
  const vertices=[];
  for(let y=0;y<=ROWS;y++){
    const row=[];
    for(let x=0;x<=COLS;x++){
      const key=y*(COLS+1)+x,edge=x===0||x===COLS||y===0||y===ROWS;
      row.push({key,x:round(X0+x*CW+(atlasNoise(seed,key*2)-.5)*(edge?38:78)),
        y:round(Y0+y*CH+(atlasNoise(seed,key*2+1)-.5)*(edge?32:65))});
    }
    vertices.push(row);
  }
  const toXY=p=>round(p.x)+','+round(p.y);
  const polyline=(a,b)=>sharedEdge(a,b,seed).slice(1).map(p=>'L'+toXY(p)).join(' ');
  const polys=[];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const nw=vertices[y][x],ne=vertices[y][x+1],se=vertices[y+1][x+1],sw=vertices[y+1][x];
    const path='M'+toXY(nw)+' '+polyline(nw,ne)+' '+polyline(ne,se)+' '+polyline(se,sw)+' '+polyline(sw,nw)+' Z';
    const centre={x:round((nw.x+ne.x+se.x+sw.x)/4),y:round((nw.y+ne.y+se.y+sw.y)/4)};
    polys.push({id:'pr-'+String(y*COLS+x+1).padStart(2,'0'),x,y,path,
      center:centre,corners:[nw,ne,se,sw]});
  }
  // Nonrectangular outer boundary is composed of the exact same shared edges.
  const edgeVertices=[...vertices[0],...vertices.slice(1).map(row=>row[COLS]),
    ...vertices[ROWS].slice(0,COLS).reverse(),...vertices.slice(1,ROWS).reverse().map(row=>row[0])];
  let perimeter='M'+toXY(edgeVertices[0]);
  for(let i=0;i<edgeVertices.length;i++)
    perimeter+=' '+polyline(edgeVertices[i],edgeVertices[(i+1)%edgeVertices.length]);
  perimeter+=' Z';
  return {polys,perimeter,width,height};
}
const HERALDRY=[
  {main:'#626f51',alt:'#ead7a7',ink:'#354735',charge:'oak'},
  {main:'#784b45',alt:'#edcfaa',ink:'#482d2e',charge:'chevron'},
  {main:'#536c75',alt:'#f1dcb3',ink:'#2a424e',charge:'river'},
  {main:'#88734b',alt:'#e4d9ac',ink:'#4d442f',charge:'sun'},
  {main:'#4b685e',alt:'#ebd5ae',ink:'#30483e',charge:'tower'},
  {main:'#7a6455',alt:'#f3dcb7',ink:'#513a31',charge:'wheat'},
  {main:'#567367',alt:'#efe1bd',ink:'#345044',charge:'moon'},
  {main:'#785d61',alt:'#f2dfc0',ink:'#543b3f',charge:'sword'},
  {main:'#59657a',alt:'#e8d0ae',ink:'#384251',charge:'star'},
  {main:'#81754b',alt:'#f1dbb4',ink:'#554b32',charge:'mountain'},
  {main:'#68615b',alt:'#ecdbb8',ink:'#443e3a',charge:'bridge'},
  {main:'#56695c',alt:'#edd6aa',ink:'#35473a',charge:'crown'}
];
export function heraldryFor(dynastyId){
  const n=Number(String(dynastyId).split('-').at(-1));
  return HERALDRY[(Number.isInteger(n)&&n>0?n-1:0)%HERALDRY.length];
}
export function countyAtlasModel(world,geometry=makeAtlasGeometry(world.seed,world.provinces.length)){
  const polygons=geometry.polys.map(shape=>{
    const province=world.provinces.find(p=>p.id===shape.id);
    if(!province)throw Error('Atlas has no province '+shape.id);
    const title=world.titles.find(t=>t.id===province.titleId);
    const holder=world.people.find(p=>p.id===title?.holderId);
    if(!title||!holder)throw Error('Atlas missing title/holder '+shape.id);
    return {...shape,province,title,holder,heraldry:heraldryFor(holder.dynastyId)};
  });
  return {...geometry,polygons};
}
export function transferHighlights(before,world){
  if(!before)return [];
  return world.titles.filter(t=>t.rank==='county'&&before[t.id]&&before[t.id]!==t.holderId)
    .map(t=>t.provinceId);
}
export function atlasOwnerSnapshot(world){
  return Object.fromEntries(world.titles.filter(t=>t.rank==='county').map(t=>[t.id,t.holderId]));
}
export function familyRelations(world,personId){
  const person=world.people.find(p=>p.id===personId);
  if(!person)throw RangeError('Unknown subject');
  const find=id=>world.people.find(p=>p.id===id)||null;
  const parents=person.parentIds.map(find).filter(Boolean);
  const spouse=find(person.spouseId);
  const children=world.people.filter(p=>p.parentIds.includes(personId))
    .sort((a,b)=>a.birthYear-b.birthYear||a.id.localeCompare(b.id));
  const dynasty=world.dynasties.find(d=>d.id===person.dynastyId);
  return {person,parents,spouse,children,dynasty,
    held:world.titles.filter(t=>t.holderId===person.id)};
}
