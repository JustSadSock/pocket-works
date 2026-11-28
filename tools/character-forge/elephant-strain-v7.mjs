// Localize extreme strain, then repair only its neighboring skin weights.
// Rest surface/triangles/joint positions remain bit-for-bit unchanged.
import {pose,deform} from './core.mjs';
import {part,push,weights,normals} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),pos=(p,i)=>p.positions.slice(3*i,3*i+3),phases=[0,.25,.5,.75];
function edges(p){const e=new Map();for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){let a=p.indices[i+k],b=p.indices[i+(k+1)%3];if(a>b)[a,b]=[b,a];const key=a+':'+b,x=e.get(key);if(x)x.multiplicity++;else{const length=dist(pos(p,a),pos(p,b));if(length>1e-5)e.set(key,{a,b,length,multiplicity:1})}}return [...e.values()]}
function measure(m,lists){return phases.map(phase=>{const w=pose(m,'walk',phase),parts=m.parts.map((p,i)=>{const vs=deform(m,p,w);return lists[i].map(e=>({...e,ratio:dist(vs[e.a],vs[e.b])/e.length}))});const ratios=parts.flatMap(es=>es.flatMap(e=>Array(e.multiplicity).fill(e.ratio))).sort((a,b)=>a-b);return {phase,parts,max:ratios.at(-1),p95:ratios[Math.floor((ratios.length-1)*.95)],collapsed:ratios.filter(r=>r<.5).length}})}
const summary=r=>r.map(({parts,...x})=>x),worst=r=>({max:Math.max(...r.map(x=>x.max)),p95:Math.max(...r.map(x=>x.p95)),collapsed:Math.max(...r.map(x=>x.collapsed))});
function region(m,p,i){const ws=weights(p,i).map(([j,w])=>[m.joints[j].name,w]);return {position:pos(p,i),influences:ws,region:ws[0]?.[0].split('-')[0]}}
export function repairElephant(source,rebound,{write=null,render=false}={}){
 const lists=source.parts.map(edges),before=measure(source,lists),reb=measure(rebound,lists),original=worst(before),base=worst(reb),local=[];
 for(let p=0;p<source.parts.length;p++){
   const n=source.parts[p].positions.length/3,adj=Array.from({length:n},()=>new Set()),risk=new Set();
   for(const e of lists[p]){adj[e.a].add(e.b);adj[e.b].add(e.a)}
   for(let f=0;f<phases.length;f++)for(let k=0;k<lists[p].length;k++){
     const a=before[f].parts[p][k],b=reb[f].parts[p][k];
     if((b.ratio>Math.max(1.45,a.ratio*1.12)||b.ratio<Math.min(.65,a.ratio*.88))){risk.add(b.a);risk.add(b.b)}
   }
   const alpha=new Float32Array(n).fill(1);for(const i of risk){alpha[i]=0;for(const j of adj[i])alpha[j]=Math.min(alpha[j],.35)}
   local.push({alpha,risk,adj});
 }
 const trials=[];
 function candidate(strength){
   const m=structuredClone(rebound);
   for(let k=0;k<m.parts.length;k++){const a=source.parts[k],b=rebound.parts[k],q=part(a.name,a.color,'body'),{alpha}=local[k];
     for(let i=0;i<alpha.length;i++){const t=alpha[i]*strength;push(q,pos(a,i),[...weights(a,i).map(([j,w])=>[j,w*(1-t)]),...weights(b,i).map(([j,w])=>[j,w*t])])}
     q.indices=a.indices.slice();m.parts[k]=normals(q);
   }
   m.spec.sourceAdapter='v7 local strain-guided source/rebound binding; unapproved';return m;
 }
 let selected=null;
 for(const strength of [1,.75,.5,.25]){
   const m=candidate(strength),r=measure(m,lists),metrics=worst(r);trials.push({strength,metrics});
   if(metrics.max<=original.max+1e-6&&metrics.collapsed<=original.collapsed&&metrics.p95<=original.p95+1e-6&&(!selected||metrics.p95<selected.metrics.p95))selected={m,r,metrics,strength};
 }
 const final=selected?.m??source,r=selected?.r??before;
 const hot=[];
 for(const [label,m,rows] of [['source',source,before],['rebound',rebound,reb],['local',final,r]])for(const f of rows){
   const edges=f.parts.flatMap((es,i)=>es.map(e=>({...e,part:i}))).sort((a,b)=>Math.abs(Math.log(Math.max(b.ratio,1e-8)))-Math.abs(Math.log(Math.max(a.ratio,1e-8))));
   for(const e of edges.slice(0,12)){const p=m.parts[e.part];hot.push({label,phase:f.phase,part:p.name,ratio:e.ratio,restMetres:e.length,deltaMetres:e.length*(e.ratio-1),a:region(m,p,e.a),b:region(m,p,e.b)})}
 }
 if(render&&write)for(const [label,m,rows] of [['source',source,before],['rebound',rebound,reb],['local',final,r]]){
   const f=rows.reduce((a,b)=>a.max>b.max?a:b),w=pose(m,'walk',f.phase),heat=structuredClone(m);
   for(let i=0;i<heat.parts.length;i++){
     const p=heat.parts[i],v=deform(m,m.parts[i],w),score=new Float32Array(v.length);
     for(const e of f.parts[i]){const s=Math.min(1,Math.abs(Math.log(Math.max(e.ratio,1e-8)))/Math.log(4));score[e.a]=Math.max(score[e.a],s);score[e.b]=Math.max(score[e.b],s)}
     p.positions=v.flat();normals(p);p.vertexColors=Array.from(score).flatMap(t=>[.16+.72*t,.36*(1-t)+.035,.44*(1-t)+.025]);
   }
   for(const view of ['side','front'])write('source-v7-elephant-'+label+'-'+view+'-strain.png',raster(heat,{view,size:768,bounds:commonBounds([heat],view)}).png);
 }
 return {model:final,report:{source:summary(before),rebound:summary(reb),local:summary(r),worst:{source:original,rebound:base,local:worst(r)},trials,selectedStrength:selected?.strength??0,localizedVertices:local.map(x=>x.risk.size),hotEdges:hot,restSurfaceUnchanged:final.parts.every((p,i)=>JSON.stringify(p.positions)===JSON.stringify(source.parts[i].positions)&&JSON.stringify(p.indices)===JSON.stringify(source.parts[i].indices)),note:'Unique edges with original face multiplicity for comparison. No candidate adopted if max/collapse/P95 regress versus Source. Heatmap uses maximum log strain per visible vertex at worst sampled phase, not acceptance.'}};
}
