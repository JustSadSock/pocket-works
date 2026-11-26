// Semantic segmentation before binding. No interpolation between Source
// and Rebound. Surface coordinates and topology are never modified.
import {part,push,weights,normals} from './hybrid-human.mjs';
import {pose,deform,rotate} from './core.mjs';
import {raster,commonBounds} from './material-study.mjs';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const pos=(p,i)=>p.positions.slice(i*3,i*3+3),sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),len=a=>Math.hypot(...a),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},ramp=(x,a,b)=>smooth((x-a)/(b-a)),phases=[0,.25,.5,.75];
const distance=(v,a,b)=>{let d=sub(b,a),t=clamp(dot(sub(v,a),d)/Math.max(1e-12,dot(d,d)));return {d:len(sub(sub(v,a),d.map(x=>x*t))),t}};
function geodesic(adj,seeds){
 const d=new Float64Array(adj.length).fill(Infinity),heap=[];
 function pushHeap(a){let i=heap.length;heap.push(a);while(i){let p=(i-1)>>1;if(heap[p][0]<=a[0])break;heap[i]=heap[p];i=p;heap[i]=a}}
 function pop(){let a=heap[0],b=heap.pop();if(heap.length){let i=0;heap[0]=b;for(;;){let j=i*2+1;if(j>=heap.length)break;if(j+1<heap.length&&heap[j+1][0]<heap[j][0])j++;if(heap[j][0]>=b[0])break;heap[i]=heap[j];i=j;heap[i]=b}}return a}
 for(const i of seeds){d[i]=0;pushHeap([0,i])}
 while(heap.length){let [dd,i]=pop();if(dd!==d[i])continue;for(const [j,l] of adj[i])if(dd+l<d[j]){d[j]=dd+l;pushHeap([dd+l,j])}}
 return d;
}
function segmented(source,{passes=4,selfWeight=.45,neighborWeight=.55,geoScale=.35,distanceScale=.065}={}){
 const m=structuredClone(source),J=n=>m.joints.find(j=>j.name===n),groupNames=['body','head','trunk','tail','foreL','foreR','hindL','hindR'],groups=Object.fromEntries(groupNames.map(k=>[k,[]]));
 for(const j of m.joints){const k=/^(fore[LR]|hind[LR])-/.exec(j.name)?.[1]??(j.name.startsWith('trunk-')?'trunk':j.name.startsWith('tail-')?'tail':/^(head|neck|ear)/.test(j.name)?'head':'body');groups[k].push(j)}
 const H=m.spec.morphology.height,head=J('head'),neck=J('neck'),chest=J('chest'),tail=J('tail-0'),hip=J('body'),regions=[],vertexRegions=[],forbidden={crossLimb:0,tailFoot:0,earFore:0,trunkShoulder:0};
 function masks(v){
   const [x,y,z]=v,ax=Math.abs(x),side=x<0?'L':'R',front=z>(J('foreL-scapula').position[2]+J('hindL-hip').position[2])/2;
   const foot=ramp(y,.65*H,.45*H),leg=foot*ramp(ax,.04*H,.12*H);
   const ear=ramp(y,.69*H,.80*H)*ramp(ax,.20*H,.31*H)*ramp(z,chest.position[2]-.18*H,chest.position[2]+.08*H);
   const nose=ramp(z,head.position[2]+.025*H,head.position[2]+.19*H)*ramp(ax,.22*H,.10*H);
   const tr=nose*ramp(y,head.position[1]+.05*H,head.position[1]-.10*H);
   const ta=ramp(z,tail.position[2]+.02*H,tail.position[2]-.17*H)*ramp(ax,.20*H,.055*H);
   const hd=Math.max(ear,ramp(z,chest.position[2],head.position[2])*(1-tr)*ramp(y,.50*H,.80*H));
   const a={body:Math.max(.001,(1-leg)*(1-hd)*(1-tr)*(1-ta)),head:hd,trunk:tr,tail:ta,foreL:0,foreR:0,hindL:0,hindR:0};
   a[(front?'fore':'hind')+side]=leg*(1-tr)*(1-ta)*(1-ear);
   // Fully distal appendages and ears cannot borrow unrelated bones.
   if(ear>.75){a.foreL=a.foreR=a.hindL=a.hindR=0;a.head=1;a.body*=.15}
   if(tr>.8){a.body=0;a.head=Math.min(.25,1-tr);a.foreL=a.foreR=a.hindL=a.hindR=a.tail=0}
   if(leg>.8&&tr<.35){a.tail=a.trunk=a.head=0;a.body=0}
   if(ta>.8){a.body=0;a.head=a.trunk=a.foreL=a.foreR=a.hindL=a.hindR=0}
   return {a,ear,tr,leg};
 }
 for(let pi=0;pi<m.parts.length;pi++){
   const p=source.parts[pi],q=part(p.name,p.color,'body'),n=p.positions.length/3,vs=Array.from({length:n},(_,i)=>pos(p,i)),adj=vs.map(()=>new Map());
   for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){const a=p.indices[i+k],b=p.indices[i+(k+1)%3],d=len(sub(vs[a],vs[b]));adj[a].set(b,d);adj[b].set(a,d)}
   const labels=vs.map(masks),rigid=/iris|pupil|eyeball|corneal|tusk/i.test(p.name)?head:/tail bristle/i.test(p.name)?groups.tail.at(-1):/toenail/i.test(p.name)?m.joints.filter(j=>j.name.endsWith('-hoof')).sort((a,b)=>len(sub(vs[0],a.position))-len(sub(vs[0],b.position)))[0]:null;
   const geo={};
   if(!rigid)for(const k of groupNames){const seeds=labels.flatMap((x,i)=>x.a[k]>.82?[i]:[]);if(seeds.length)geo[k]=geodesic(adj,seeds)}
   const raw=[],dominant=[];
   for(let i=0;i<n;i++){
     if(rigid){raw.push(new Map([[rigid.id,1]]));dominant.push('rigid-'+rigid.name);continue}
     let v=vs[i],a=labels[i].a,ws=new Map(),groupsUsed=groupNames.filter(k=>a[k]>.001);
     for(const k of groupsUsed){
       const g=groups[k],d=geo[k]?.[i],mass=a[k]*(Number.isFinite(d)?Math.exp(-Math.min(5,d/(geoScale*H))):.65);
       const hits=g.map(j=>{const parent=m.joints[j.parent]??j,hit=distance(v,parent.position,j.position);return {j,parent,...hit,w:1/(distanceScale*H+hit.d)**3}});
       const sum=hits.reduce((s,x)=>s+x.w,0)||1;
       for(const h of hits){
         // Parent influence remains within the semantic chain, except
         // legitimate neighboring attachment (head-neck, limb-root).
         const parent=g.some(j=>j.id===h.parent.id)?h.parent:h.j;
         ws.set(h.j.id,(ws.get(h.j.id)||0)+mass*h.w/sum*h.t);
         ws.set(parent.id,(ws.get(parent.id)||0)+mass*h.w/sum*(1-h.t));
       }
     }
     const sum=[...ws.values()].reduce((s,x)=>s+x,0);if(sum<=0)ws.set(hip.id,1);else for(const [j,w] of ws)ws.set(j,w/sum);raw.push(ws);
     dominant.push(groupsUsed.sort((a,b)=>labels[i].a[b]-labels[i].a[a])[0]??'body');
   }
   // Smooth only within allowed masks on actual mesh neighbors. Distinct
   // connected accessories use rigid anatomy, not Euclidean skin transfer.
   let sm=raw;
   if(!rigid)for(let pass=0;pass<passes;pass++)sm=sm.map((ws,i)=>{
     const allowed=new Set(groupNames.filter(k=>labels[i].a[k]>.001).flatMap(k=>groups[k].map(j=>j.id))),out=new Map([...ws].map(([j,w])=>[j,w*selfWeight]));let count=0;
     for(const [j,l] of adj[i]){const w=1/Math.max(l,.003*H);count+=w;for(const [bone,x] of sm[j])if(allowed.has(bone))out.set(bone,(out.get(bone)||0)+x*w)}
     if(count){for(const [j,w] of out){const self=(ws.get(j)||0)*selfWeight;out.set(j,self+(w-self)*neighborWeight/count)}}
     const sum=[...out.values()].reduce((s,w)=>s+w,0);return sum>0?new Map([...out].map(([j,w])=>[j,w/sum])):ws;
   });
   for(let i=0;i<n;i++){push(q,vs[i],[...sm[i]]);const names=weights(q,i).map(([j])=>m.joints[j].name),l=labels[i];if(l.leg>.8&&l.tr<.35&&names.some(n=>n.startsWith('tail-')))forbidden.tailFoot++;if(l.ear>.75&&names.some(n=>/^fore/.test(n)))forbidden.earFore++;if(l.tr>.8&&names.some(n=>/^fore|^hind|^chest$/.test(n)))forbidden.trunkShoulder++;if(!rigid&&names.some(n=>/^(fore|hind)[LR]/.test(n)&&n[4]!== (vs[i][0]<0?'L':'R')))forbidden.crossLimb++}
   q.indices=p.indices.slice();m.parts[pi]=normals(q);regions.push({name:p.name,counts:Object.fromEntries([...new Set(dominant)].map(k=>[k,dominant.filter(x=>x===k).length]))});vertexRegions.push(dominant);
 }
 m.spec.sourceAdapter='v8 semantic region + mesh geodesic segmentation; experimental';return {m,regions,vertexRegions,forbidden};
}
function compare(m,vertexRegions){
 return phases.map(phase=>{const w=pose(m,'walk',phase),ratios=[],heat=[],regional={};
   for(let pi=0;pi<m.parts.length;pi++){const p=m.parts[pi],v=deform(m,p,w),s=new Float32Array(v.length),labels=vertexRegions[pi]??[];
     for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){const a=p.indices[i+k],b=p.indices[i+(k+1)%3],d=len(sub(pos(p,a),pos(p,b)));if(d<=1e-5)continue;const r=len(sub(v[a],v[b]));const ratio=r/d;ratios.push(ratio);const q=Math.min(1,Math.abs(Math.log(Math.max(1e-8,ratio)))/Math.log(4));s[a]=Math.max(s[a],q);s[b]=Math.max(s[b],q);
       const ra=labels[a]??'body',rb=labels[b]??'body',region=ra===rb?ra:ra==='body'?rb:rb==='body'?ra:'transition';(regional[region]??=[]).push(ratio);
     }heat.push(s);
   }
   ratios.sort((a,b)=>a-b);const stats=x=>{x.sort((a,b)=>a-b);return {samples:x.length,max:x.at(-1),p95:x[Math.floor((x.length-1)*.95)],collapsed:x.filter(v=>v<.5).length}};
   return {phase,max:ratios.at(-1),p95:ratios[Math.floor((ratios.length-1)*.95)],collapsed:ratios.filter(x=>x<.5).length,regions:Object.fromEntries(Object.entries(regional).map(([k,v])=>[k,stats(v)])),heat};
 });
}
const worst=rows=>({max:Math.max(...rows.map(x=>x.max)),p95:Math.max(...rows.map(x=>x.p95)),collapsed:Math.max(...rows.map(x=>x.collapsed))});
export function segmentElephant(source,{write,out,name}){
 const sourceBinding=segmented(source),a=compare(source,sourceBinding.vertexRegions),before=worst(a);
 const trials=[],configs=name==='massive'?[
  {passes:0,selfWeight:.45,neighborWeight:.55},
  {passes:1,selfWeight:.58,neighborWeight:.42},
  {passes:2,selfWeight:.62,neighborWeight:.38},
  {passes:3,selfWeight:.66,neighborWeight:.34},
  {passes:4,selfWeight:.70,neighborWeight:.30},
  {passes:2,selfWeight:.72,neighborWeight:.28},
  {passes:3,selfWeight:.76,neighborWeight:.24}
 ]:[{passes:4,selfWeight:.45,neighborWeight:.55}];
 let chosen=null,bestRows=null,bestStats=null,chosenConfig=null;
 for(const config of configs){
  const candidate=segmented(source,config),rows=compare(candidate.m,candidate.vertexRegions),stats=worst(rows),forbidden=Object.values(candidate.forbidden).every(v=>v===0);
  const accepted=stats.max<=before.max&&stats.p95<=before.p95&&stats.collapsed<=before.collapsed&&forbidden;
  trials.push({config,stats,forbidden:candidate.forbidden,accepted,regions:rows.map(r=>({phase:r.phase,regions:r.regions}))});
  if(accepted&&(!bestStats||stats.p95<bestStats.p95||(stats.p95===bestStats.p95&&stats.max<bestStats.max))){chosen=candidate;bestRows=rows;bestStats=stats;chosenConfig=config}
 }
 const selected=chosen??sourceBinding,m=selected.m,b=bestRows??compare(m,selected.vertexRegions),after=bestStats??worst(b),approved=!!chosen;
 const active=approved?m:source;
 if(name==='base'){
   for(const [label,x,rows] of [['source',source,a],['segmented',m,b]]){
     const row=rows.reduce((x,y)=>x.max>y.max?x:y),q=structuredClone(x),w=pose(x,'walk',row.phase);
     for(let i=0;i<q.parts.length;i++){const p=q.parts[i];p.positions=deform(x,x.parts[i],w).flat();normals(p);p.vertexColors=Array.from(row.heat[i]).flatMap(t=>[.13+.77*t,.35*(1-t)+.035,.44*(1-t)+.025])}
     for(const view of ['side','front'])write('source-v9-elephant-'+label+'-'+view+'-strain.png',raster(q,{view,size:768}).png);
   }
   mkdirSync(join(out,'source-v9-elephant-motion'),{recursive:true});const frames=[],contact=[],ground=[],stride=active.spec.gaitStride??active.spec.morphology.height*.105;
   for(let i=0;i<=24;i++){const phase=i/24,q=structuredClone(active),w=pose(active,'walk',phase);for(let j=0;j<q.parts.length;j++){q.parts[j].positions=deform(active,active.parts[j],w).flat();normals(q.parts[j])}frames.push(q);contact.push({phase,contacts:active.contacts.map(c=>({joint:active.joints[c.joint].name,point:rotate(w[c.joint].q,c.local).map((x,k)=>x+w[c.joint].p[k])}))});ground.push({phase,feet:measureSurfaceFeet(active,q,phase,stride)})}
   const bounds=commonBounds(frames,'side');for(let i=0;i<frames.length;i++)write('source-v9-elephant-motion/'+String(i).padStart(2,'0')+'.png',raster(frames[i],{view:'side',size:640,bounds}).png);
   write('source-v9-elephant-contact.json',JSON.stringify({candidate:approved?'segmented':'source-fallback',frames:contact,surfaceMeasurements:ground,notes:'Measured from actual deformed mesh vertices weighted to foot joints; world root travel included.'},null,2));
 }
 return {model:m,active,report:{name,regions:selected.regions,forbidden:selected.forbidden,before,after,approvedTechnical:approved,selectedConfig:chosenConfig,trials,regionComparison:{source:a.map(({heat,...x})=>x),segmented:b.map(({heat,...x})=>x)},restSurfaceUnchanged:m.parts.every((p,i)=>JSON.stringify(p.positions)===JSON.stringify(source.parts[i].positions)&&JSON.stringify(p.indices)===JSON.stringify(source.parts[i].indices)),note:'Independent region/graph binding; no blending previous rigs. Massive uses a bounded smoothing sweep; Source retained if no strict non-regression candidate.'}};
}
function measureSurfaceFeet(model,deformed,phase,stride){
 const duty=model.spec.gaitDuty??.76;
 return (model.contacts??[]).map(c=>{const p=model.parts,base=model.joints[c.joint].position,local=((phase+(c.phase??0))%1+1)%1,stance=local<duty,points=[];
  for(let pi=0;pi<p.length;pi++){const src=p[pi],now=deformed.parts[pi];for(let i=0;i<src.positions.length/3;i++){const w=weights(src,i).reduce((s,[j,v])=>s+(j===c.joint?v:0),0);if(w>.18){const v=now.positions.slice(i*3,i*3+3);if(Math.hypot(v[0]-base[0],v[2]-base[2])<model.spec.morphology.height*.17)points.push(v)}}}
  if(!points.length)return {joint:model.joints[c.joint].name,stance,vertices:0};
  const low=Math.min(...points.map(v=>v[1])),sole=points.filter(v=>v[1]<=low+model.spec.morphology.height*.012),center=sole.reduce((a,v)=>a.map((x,k)=>x+v[k]/sole.length),[0,0,0]),anchor=base.map((x,k)=>x+c.local[k]),expected=[anchor[0],(c.groundY??model.spec.groundY??0),anchor[2]+stride*(phase-local)];
  return {joint:model.joints[c.joint].name,stance,vertices:sole.length,minimumY:low,groundError:Math.abs(low-(c.groundY??model.spec.groundY??0)),horizontalDrift:Math.hypot(center[0]-expected[0],center[2]-expected[2]),soleRange:Math.max(...sole.map(v=>v[1]))-low};
 });
}
