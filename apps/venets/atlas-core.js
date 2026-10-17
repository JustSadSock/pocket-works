// Stable fictional cartography: 12 connected counties, not a physical-world simulation.
// Geometry is pure and generated WITHOUT consuming the world PRNG. Same seed means
// the same geography even after births, inheritance or save/load.
export const ATLAS_W=860, ATLAS_H=570;
const COLS=4,ROWS=3;
const X0=49,Y0=54,CW=191,CH=151;
const mix32=n=>{n=(n^(n>>>16))>>>0;n=Math.imul(n,0x7feb352d);n=(n^(n>>>15))>>>0;n=Math.imul(n,0x846ca68b);return(n^(n>>>16))>>>0};
export function atlasNoise(seed,key){return mix32((seed>>>0)^Math.imul(key+1,0x9e3779b1))/4294967296}
const round=n=>+n.toFixed(2);
function sharedEdge(a,b,seed){
  const points=[a,b].sort((p,q)=>p.key-q.key);
  const [p,q]=points;
  const dx=q.x-p.x,dy=q.y-p.y,dist=Math.hypot(dx,dy)||1;
  const side=atlasNoise(seed,p.key*97+q.key*19)-.5;
  const bend=side*14;
  const middle={x:round((p.x+q.x)/2-dy/dist*bend),
    y:round((p.y+q.y)/2+dx/dist*bend)};
  const endPoints=a.key===p.key?[a,middle,b]:[a,middle,b];
  return endPoints;
}
export function makeAtlasGeometry(seed=413){
  const vertices=[];
  for(let y=0;y<=ROWS;y++){
    const row=[];
    for(let x=0;x<=COLS;x++){
      const key=y*(COLS+1)+x,edge=x===0||x===COLS||y===0||y===ROWS;
      row.push({key,x:round(X0+x*CW+(atlasNoise(seed,key*2)-.5)*(edge?26:48)),
        y:round(Y0+y*CH+(atlasNoise(seed,key*2+1)-.5)*(edge?24:46))});
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
  return {polys,perimeter,width:ATLAS_W,height:ATLAS_H};
}
const HERALDRY=[
  {main:'#626f51',alt:'#ead7a7',ink:'#354735',charge:'oak'},
  {main:'#784b45',alt:'#edcfaa',ink:'#482d2e',charge:'chevron'},
  {main:'#536c75',alt:'#f1dcb3',ink:'#2a424e',charge:'river'},
  {main:'#88734b',alt:'#e4d9ac',ink:'#4d442f',charge:'sun'},
  {main:'#4b685e',alt:'#ebd5ae',ink:'#30483e',charge:'tower'}
];
export function heraldryFor(dynastyId){
  const n=Number(String(dynastyId).split('-').at(-1));
  return HERALDRY[(Number.isInteger(n)&&n>0?n-1:0)%HERALDRY.length];
}
export function countyAtlasModel(world,geometry=makeAtlasGeometry(world.seed)){
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
