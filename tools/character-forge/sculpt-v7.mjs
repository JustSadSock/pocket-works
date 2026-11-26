// V7 authored local surface recovery. Same source anatomy and rig; v6 stays
// immutable. No independent per-phenotype model, no global garment inflation.
import {part,push,weights,normals} from './hybrid-human.mjs';
import {sewLining} from './garment.mjs';
import {materialKind,profiles} from './material-study.mjs';
const add=(a,b)=>a.map((x,k)=>x+b[k]),sub=(a,b)=>a.map((x,k)=>x-b[k]),mul=(a,s)=>a.map(x=>x*s),mix=(a,b,t)=>add(a,mul(sub(b,a),t)),unit=v=>mul(v,1/(Math.hypot(...v)||1)),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const pos=(p,i)=>p.positions.slice(i*3,i*3+3);
function midpointMesh(p){
 const q=part(p.name,p.color,p.component);Object.assign(q,{layer:p.layer,region:p.region,thickness:p.thickness,pattern:p.pattern,attachment:p.attachment});
 for(let i=0;i<p.positions.length/3;i++)push(q,pos(p,i),weights(p,i));
 const edges=new Map(),mid=(a,b)=>{const k=a<b?a+':'+b:b+':'+a;if(!edges.has(k))edges.set(k,push(q,mix(pos(p,a),pos(p,b),.5),[...weights(p,a).map(([j,w])=>[j,w*.5]),...weights(p,b).map(([j,w])=>[j,w*.5])]));return edges.get(k)};
 for(let i=0;i<p.indices.length;i+=3){const [a,b,c]=p.indices.slice(i,i+3),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);q.indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca)}
 return normals(q);
}
// Read the actual triangles of the outer ring mesh at a given fraction of a
// panel. Include the diagonal crossing, not only two independently sampled
// edge loops. Every offset band follows the same underlying surface.
function panelBand(tunic,name,color,stationRows,offset,thickness,region){
 const N=tunic.pattern.ringCount,p=part(name,color,'equipment');Object.assign(p,{layer:4,region,attachment:{garment:tunic.name,rows:stationRows}});
 for(const [row,t] of stationRows){
   const center=mix(tunic.pattern.sections[row].center,tunic.pattern.sections[row+1].center,t);
   for(let k=0;k<N;k++){
     const a=row*N+k,b=(row+1)*N+k,v=mix(pos(tunic,a),pos(tunic,b),t),n=unit([v[0]-center[0],0,v[2]-center[1]]);
     const ws=[...weights(tunic,a).map(([j,w])=>[j,w*(1-t)]),...weights(tunic,b).map(([j,w])=>[j,w*t])];
     push(p,add(v,mul(n,offset)),ws);
   }
 }
 for(let i=0;i<stationRows.length-1;i++)for(let k=0;k<N;k++){let a=i*N+k,b=i*N+(k+1)%N;p.indices.push(a,b,b+N,a,b+N,a+N)}
 return sewLining(p,thickness);
}
function roundedPouch(p){
 // Preserve attachment and rim; round the vertical panel transitions.
 const q=midpointMesh(p),n=p.positions.length/3,center=[0,0,0];for(let i=0;i<n;i++)for(let k=0;k<3;k++)center[k]+=p.positions[3*i+k]/n;
 for(let i=0;i<q.positions.length;i+=3){const y=q.positions[i+1],t=clamp(1-Math.abs(y-center[1])/.065);q.positions[i]=center[0]+(q.positions[i]-center[0])*(1+.065*t);q.positions[i+2]=center[2]+(q.positions[i+2]-center[2])*(1+.10*t)}
 return normals(q);
}
export function sculptCitizen(control){
 const m=structuredClone(control),original=m.parts.find(p=>p.name==='tunic'),sections=original.pattern.sections,N=original.pattern.ringCount,waist=sections[2].y,hem=sections[0].y,top=sections[4].y;
 const tunic=midpointMesh(original);
 // Broad gravity folds originate at the belt and spread toward the hem.
 // Zero displacement on all waist attachment and neckline bands. Positive
 // radial relief avoids consuming the already verified skirt clearance.
 for(let i=0;i<tunic.positions.length;i+=3){
   const v=tunic.positions.slice(i,i+3),y=v[1],under=y<waist-.045,above=y>waist+.045&&y<top-.035;
   if(!under&&!above)continue;
   if(above&&Math.abs(v[0])>.20)continue; // sleeve root treated separately
   const t=under?clamp((waist-.045-y)/(waist-hem-.045)):clamp((y-waist-.045)/(top-waist-.08));
   const z=sections[2].center[1],a=Math.atan2(v[2]-z,v[0]),r=unit([v[0],0,v[2]-z]);
   const pleat=(.5+.5*Math.cos(6*a+.75*t+.25*Math.sin(2*a)))**2;
   const amplitude=under?.016*Math.sin(t*Math.PI*.73):.008*Math.sin(t*Math.PI);
   for(let k=0;k<3;k++)tunic.positions[i+k]+=r[k]*amplitude*pleat;
 }
 // Soften the armhole transition with one bounded tangential smoothing
 // pass around the joined shoulder, excluding all neckline/waist edges.
 const adj=Array.from({length:tunic.positions.length/3},()=>new Set());
 for(let i=0;i<tunic.indices.length;i+=3)for(let k=0;k<3;k++){const a=tunic.indices[i+k],b=tunic.indices[i+(k+1)%3];adj[a].add(b);adj[b].add(a)}
 const prev=tunic.positions.slice();
 for(let i=0;i<adj.length;i++){let v=prev.slice(i*3,i*3+3);if(v[1]<sections[3].y-.035||v[1]>top+.01||Math.abs(v[0])<.17||Math.abs(v[0])>.32||!adj[i].size)continue;
   const avg=[0,0,0];for(let j of adj[i])for(let k=0;k<3;k++)avg[k]+=prev[j*3+k]/adj[i].size;
   const d=sub(avg,v),len=Math.hypot(...d);if(len>1e-8)for(let k=0;k<3;k++)tunic.positions[i*3+k]+=d[k]*Math.min(.18,.0035/len);
 }
 normals(tunic);
 const down=.019/(waist-sections[1].y),up=.019/(sections[3].y-waist);
 const belt=panelBand(original,'waist belt',[.14,.085,.045],[[1,1-down],[2,0],[2,up]],.014,.005,'waist');
 // Collar is not an independent horizontal cylinder: it traces the sloping
 // upper bodice panel, with subdued material and an exposed bound edge.
 const collar=panelBand(original,'tunic neck binding',[.15,.20,.13],[[4,.76],[4,.88],[4,1]],.007,.0025,'neck');
 m.parts=m.parts.map(p=>p.name==='tunic'?tunic:p.name==='waist belt'?belt:p.name==='tunic neck binding'?collar:p.name==='belt pouch'?roundedPouch(p):p);
 // Taper only the concealed end of the trouser into the boot shaft. Keep
 // the ankle, calf and all original skin weights intact.
 const cuff=[];
 for(const side of ['L','R']){
   const pants=m.parts.find(p=>p.name==='trousers '+side),boot=m.parts.find(p=>p.name==='boot '+side);
   const n=18,bn=16,ring=4,center=[0,0,0];for(let k=0;k<bn;k++)for(let d=0;d<3;d++)center[d]+=boot.positions[(ring*bn+k)*3+d]/bn;
   const radii=[0,2].map(d=>Math.max(...Array.from({length:bn},(_,k)=>Math.abs(boot.positions[(ring*bn+k)*3+d]-center[d])))),before=pants.positions.slice();
   for(let shell=0;shell<2;shell++)for(let row of [3,4])for(let k=0;k<n;k++){
     const idx=(shell*5*n+row*n+k)*3,y=pants.positions[idx+1],t=clamp((center[1]+.033-y)/.05),dx=pants.positions[idx]-center[0],dz=pants.positions[idx+2]-center[2],limit=Math.hypot(dx/(radii[0]-.011),dz/(radii[1]-.011));
     if(limit>1){const f=1-t*(1-1/limit);pants.positions[idx]=center[0]+dx*f;pants.positions[idx+2]=center[2]+dz*f}
   }
   normals(pants);cuff.push({side,center,radii,maxDisplacement:Math.max(...pants.positions.map((x,i)=>Math.abs(x-before[i])))});
 }
 for(const p of m.parts){
   const kind=materialKind(p.name),mat=profiles[kind];p.material={kind,roughness:mat.roughness,metallic:mat.metallic};
   if(kind==='hair'){
     // Smooth large clumps while retaining directed underlying relief and
     // feather the source-derived scalp/beard boundary, not a new hair cap.
     const edges=new Map();for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){let a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1)}
     const boundary=new Set([...edges].filter(([k,n])=>n===1).flatMap(([k])=>k.split(':').map(Number)));
     for(const i of boundary)for(let k=0;k<3;k++)p.positions[3*i+k]-=p.normals[3*i+k]*(p.name==='beard'?.003:.002);
     normals(p);
   }
 }
 m.statistics={...m.statistics,triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0)};
 m.spec.surfaceStudy='v7 sculptural local relief, bound collar, attached belt and tapered cuffs';
 return {model:m,diagnostics:{cuff,waist,hem,sourceTriangles:control.statistics.triangleCount,candidateTriangles:m.statistics.triangleCount,notes:'Bounded local sculptural changes; no dynamic or artistic acceptance.'}};
}
