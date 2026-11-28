// V7 authored local surface recovery. Same source anatomy and rig; v6 stays
// immutable. No independent per-phenotype model, no global garment inflation.
import {part,push,weights,normals,compact} from './hybrid-human.mjs';
import {sewLining} from './garment.mjs';
import {openOuterShell} from './authored-surface.mjs';
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
function sourceSkinPatch(source,control){
 const body=source.parts[0],J=n=>source.joints.find(j=>j.name===n),neck=J('neck01').position[1],wrists=['L','R'].map(s=>J('wrist.'+s).position);
 const hand=new Set(source.joints.filter(j=>/^(wrist|finger|metacarpal|thumb)/.test(j.name)).map(j=>j.id));
 const oldVisible=i=>{const v=pos(body,i);return v[1]>neck-.018||wrists.some(w=>Math.abs(v[0])>=Math.abs(w[0])-.016&&Math.hypot(...sub(v,w))<.24)};
 const include=i=>{const v=pos(body,i);return v[1]>neck-.085&&v[1]<neck+.02&&Math.abs(v[0])<.16||weights(body,i).some(([j,w])=>hand.has(j)&&w>.12)||wrists.some(w=>Math.hypot(...sub(v,w))<.068)};
 const q=compact(body,f=>!f.every(oldVisible)&&f.every(include));q.name='source body continuity';q.color=control.parts[0].color;q.component='body';return q;
}
function repairPouch(p,tunic){
 const q=roundedPouch(p),sections=tunic.pattern.sections,N=tunic.pattern.ringCount;
 const sideAt=y=>{let i=sections.findIndex(s=>s.y>=y);i=Math.max(1,i<0?sections.length-1:i);let a=sections[i-1],b=sections[i],t=clamp((y-a.y)/(b.y-a.y));return mix(pos(tunic,(i-1)*N),pos(tunic,i*N),t)};
 const rows=[...new Set(q.positions.filter((_,i)=>i%3===1))].sort((a,b)=>a-b),shifts=new Map();
 for(const y of rows){let min=Infinity;for(let i=0;i<q.positions.length;i+=3)if(Math.abs(q.positions[i+1]-y)<1e-8)min=Math.min(min,q.positions[i]);shifts.set(y,Math.max(0,sideAt(y)[0]+.012-min))}
 for(let i=0;i<q.positions.length;i+=3)q.positions[i]+=shifts.get(q.positions[i+1]);
 normals(q);
 const waist=sections[2].y,top=rows.at(-1),a=sideAt(waist),z=a[2]+.016,bind=weights(tunic,2*N),loop=part('pouch belt loop',[.14,.085,.045],'equipment');loop.layer=4;loop.region='waist';
 const lastX=Math.min(...q.positions.filter((_,i)=>i%3===0&&Math.abs(q.positions[i+1]-top)<1e-8));
 for(const [y,x] of [[waist+.012,a[0]+.016],[waist-.019,sideAt(waist-.019)[0]+.017],[top-.015,lastX+.022]])for(const dz of [-.012,.012])push(loop,[x,y,z+dz],bind);
 for(let i=0;i<4;i+=2)loop.indices.push(i,i+1,i+3,i,i+3,i+2);
 return {pouch:q,loop:sewLining(loop,.003),maxShift:Math.max(...shifts.values())};
}
export function sculptCitizen(control,source=null,{outerFirst=false}={}){
 const m=structuredClone(control),original=m.parts.find(p=>p.name==='tunic'),sections=original.pattern.sections,N=original.pattern.ringCount,waist=sections[2].y,hem=sections[0].y,top=sections[4].y;
 const tunic=midpointMesh(outerFirst?openOuterShell(original):original);
 // Broad gravity folds originate at the belt and spread toward the hem.
 // Zero displacement on all waist attachment and neckline bands. Positive
 // radial relief avoids consuming the already verified skirt clearance.
 for(let i=0;i<tunic.positions.length;i+=3){
   const v=tunic.positions.slice(i,i+3),y=v[1],under=y<waist-.045,above=y>waist+.045&&y<top-.035;
   if(!under&&!above)continue;
   if(above&&Math.abs(v[0])>.20)continue; // sleeve root treated separately
   const t=under?clamp((waist-.045-y)/(waist-hem-.045)):clamp((y-waist-.045)/(top-waist-.08));
   const z=sections[2].center[1],a=Math.atan2(v[2]-z,v[0]),r=unit([v[0],0,v[2]-z]);
   // Unevenly spaced seam-origin folds, broader than the previous
   // regular radial wave. Lift the hem locally where cloth is gathered.
   const pleat=Math.max(...[-2.65,-1.55,-.32,.72,1.83,2.74].map((center,j)=>{let d=Math.atan2(Math.sin(a-center-.22*t*Math.sin(j)),Math.cos(a-center-.22*t*Math.sin(j)));return Math.exp(-d*d/(.20+.09*t)**2)*(j%2?.72:1)}));
   const amplitude=under?.031*Math.sin(t*Math.PI*.66):.011*Math.sin(t*Math.PI);
   if(under)tunic.positions[i+1]+=.009*pleat*t*t;
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
 if(outerFirst)sewLining(tunic,original.thickness);
 const down=.019/(waist-sections[1].y),up=.019/(sections[3].y-waist);
 const belt=panelBand(original,'waist belt',[.14,.085,.045],[[1,1-down],[2,0],[2,up]],.014,.005,'waist');
 // Collar is not an independent horizontal cylinder: it traces the sloping
 // upper bodice panel, with subdued material and an exposed bound edge.
 const collar=panelBand(original,'tunic neck binding',[.15,.20,.13],[[4,.76],[4,.88],[4,1]],.007,.0025,'neck');
 const bag=repairPouch(m.parts.find(p=>p.name==='belt pouch'),original);
 m.parts=m.parts.map(p=>p.name==='tunic'?tunic:p.name==='waist belt'?belt:p.name==='tunic neck binding'?collar:p.name==='belt pouch'?bag.pouch:p.name==='pouch belt loop'?bag.loop:p);
 if(source){const skin=sourceSkinPatch(source,control);if(skin.indices.length)m.parts.push(skin)}
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
     const neighbors=Array.from({length:p.positions.length/3},()=>[]);for(const k of edges.keys()){const [a,b]=k.split(':').map(Number);neighbors[a].push(b);neighbors[b].push(a)}
     const distance=new Int16Array(neighbors.length).fill(99),queue=[...boundary];for(const i of queue)distance[i]=0;
     for(let i=0;i<queue.length;i++){let a=queue[i];if(distance[a]>=3)continue;for(const b of neighbors[a])if(distance[b]>distance[a]+1){distance[b]=distance[a]+1;queue.push(b)}}
     // Feather the thick sculpted edge and blend its pigment toward skin.
     const hair=p.color.slice(),skin=control.parts[0].color,beard=p.name==='beard';
     p.color=skin.slice();p.vertexTint=[];
     for(let i=0;i<neighbors.length;i++){
       const t=clamp(distance[i]/(beard?2:1.5)),fade=beard?.005:.004;
       for(let k=0;k<3;k++)p.positions[3*i+k]-=p.normals[3*i+k]*fade*(1-t)*(outerFirst?.25:1);
       for(let k=0;k<3;k++)p.vertexTint.push(clamp((hair[k]/skin[k])*t+(1-t)*(beard?.67:.56)));
     }
     normals(p);
   }
 }
 m.statistics={...m.statistics,triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0)};
 m.spec.surfaceStudy='v7 sculptural local relief, bound collar, attached belt and tapered cuffs';
 return {model:m,diagnostics:{cuff,pouchMaxShift:bag.maxShift,skinPatchTriangles:m.parts.find(p=>p.name==='source body continuity')?.indices.length/3||0,waist,hem,sourceTriangles:control.statistics.triangleCount,candidateTriangles:m.statistics.triangleCount,notes:'Bounded local sculptural changes; no dynamic or artistic acceptance.'}};
}
