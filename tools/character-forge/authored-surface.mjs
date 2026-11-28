// Reusable authored mesh operations. Recipes supply geometry and semantics.
// No role, species, style or action enumeration.
import {part,push,weights,normals} from './hybrid-human.mjs';
import {sewLining} from './garment.mjs';
export const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
export function validateGeometry(model){
 for(const p of model.parts){const n=p.positions.length/3;if(!Number.isInteger(n)||n===0)throw Error('Empty or malformed geometry: '+p.name);
  for(const field of ['positions','normals','indices','joints','weights',...(p.weights8?['joints8','weights8']:[])])for(let i=0;i<p[field].length;i++)if(!Number.isFinite(p[field][i]))throw Error(JSON.stringify({error:'nonfinite geometry',part:p.name,field,index:i,value:String(p[field][i])}));
  if(p.normals.length!==p.positions.length||p.indices.length%3||p.indices.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid topology '+p.name);
 }
 return model;
}
export function openOuterShell(p){
 const n=p.outerVertexCount;if(!Number.isInteger(n)||n<=0||n*2!==p.positions.length/3)throw Error('Explicit lined shell required: '+p.name);
 const q={...p,positions:p.positions.slice(0,n*3),normals:p.normals.slice(0,n*3),indices:[],joints:p.joints.slice(0,n*4),weights:p.weights.slice(0,n*4),joints8:p.joints8.slice(0,n*8),weights8:p.weights8.slice(0,n*8)};
 for(let i=0;i<p.indices.length;i+=3){const f=p.indices.slice(i,i+3);if(f.every(j=>j<n))q.indices.push(...f)}
 delete q.outerVertexCount;return normals(q);
}
export function authoredPatch({name,color,material,rows,columns,sample,thickness,host,region,closedColumns=false}){
 const p=part(name,color,'clothing');Object.assign(p,{material,layer:4,region,attachmentSpec:{type:'skinned-trim',host}});
 const directions=[];
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const s=sample(r/(rows-1),c/(closedColumns?columns:columns-1));push(p,s.position,s.weights);directions.push(s.outward)}
 for(let r=0;r<rows-1;r++)for(let c=0;c<(closedColumns?columns:columns-1);c++){const a=r*columns+c,b=r*columns+(c+1)%columns,d=a+columns,e=b+columns;for(const f of [[a,b,e],[a,e,d]]){const [x,y,z]=f.map(j=>p.positions.slice(j*3,j*3+3));if(dot(cross(sub(y,x),sub(z,x)),directions[f[0]])<0)[f[1],f[2]]=[f[2],f[1]];p.indices.push(...f)}}
 return sewLining(p,thickness);
}
// Sample the supplied ring grid using the actual triangle diagonal; project
// along the caller's radial line onto the locally nearest real outer surface.
export function ringSampler(p){
 const N=p.pattern.ringCount,sections=p.pattern.sections,n=p.outerVertexCount??p.positions.length/3,faces=[];
 for(let i=0;i<p.indices.length;i+=3){const f=p.indices.slice(i,i+3);if(f.every(j=>j<n))faces.push({ids:f,vertices:f.map(j=>p.positions.slice(j*3,j*3+3))})}
 return (row,column,offset,{maxExtension=.045}={})=>{
  const r=Math.min(sections.length-2,Math.floor(row)),t=row-r,k=Math.floor(column),u=column-k,idx=(rr,kk)=>rr*N+((kk%N)+N)%N;
  const ids=[idx(r,k),idx(r,k+1),idx(r+1,k),idx(r+1,k+1)],w=u>=t?[1-u,u-t,0,t]:[1-t,0,t-u,u];
  const v=ids.reduce((s,i,j)=>add(s,mul(p.positions.slice(i*3,i*3+3),w[j])),[0,0,0]),center=sections[r].center.map((x,i)=>x*(1-t)+sections[r+1].center[i]*t);
  const origin=[center[0],v[1],center[1]],d=unit(sub(v,origin)),expected=Math.hypot(...sub(v,origin));let best=expected,skin=ids.flatMap((i,j)=>weights(p,i).map(([b,v])=>[b,v*w[j]]));
  for(const {ids:face,vertices:[a,b,c]} of faces){const e=sub(b,a),f=sub(c,a),h=cross(d,f),det=dot(e,h);if(Math.abs(det)<1e-10)continue;const inv=1/det,s=sub(origin,a),x=inv*dot(s,h);if(x<0||x>1)continue;const q=cross(s,e),y=inv*dot(d,q);if(y<0||x+y>1)continue;const distance=inv*dot(f,q);if(distance>=expected-.008&&distance<=expected+maxExtension&&distance>=best){best=distance;skin=face.flatMap((i,j)=>weights(p,i).map(([b,v])=>[b,v*[1-x-y,x,y][j]]))}}
  return {position:add(origin,mul(d,best+offset)),outward:d,weights:skin};
 }
}
export function fourInfluenceCandidate(model){
 validateGeometry(model);const m=structuredClone(model),rows=[];
 for(const p of m.parts){if(!p.weights8)continue;let affected=0,discarded=0;for(let i=0;i<p.weights8.length;i+=8){const d=p.weights8.slice(i+4,i+8).reduce((a,b)=>a+b,0);if(d>1e-7)affected++;discarded=Math.max(discarded,d)}
  rows.push({part:p.name,affectedVertices:affected,maxDiscardedWeight:discarded});delete p.weights8;delete p.joints8;
 }
 m.spec.skinProfile='p0-four-influence-candidate';return {model:m,rows};
}
