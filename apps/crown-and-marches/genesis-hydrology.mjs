// Geography v3.1: opt-in hydrology aggregation. v3.0 geometry is immutable.
// Lake classification is an explicit static depth/area proxy, not seasonal climate.
import {classifyLakes,lakeNetwork} from './genesis-hydrography.mjs';
export const HYDRO_REVISION='genesis-3.1.0';
const D=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]],C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function aggregateHydrology(m,W,H,{natural=false,hydrography=false}={}){
 const g=m.geography,r=g.detail,w=g.width,h=g.height,n=W*H,N=w*h,oldDown=m.down.slice(),oldHeight=m.height.slice(),oldRiver=m.river.slice(),oldLand=m.land.slice(),cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r));
 const physical=hydrography?classifyLakes(g,W,H):null,lakeWater=physical?.lakeWater??new Uint8Array(N),seen=hydrography?null:new Uint8Array(N),coverage=physical?.coverage??new Uint32Array(n),lakes=physical?.records??[];
 // Connected depressions, not each filled pixel independently. Shallow pools
 // are diagnostic only; persistent status cannot be inferred from one static DEM.
 if(!hydrography)for(let i=0;i<N;i++){if(seen[i]||!g.land[i]||g.lake[i]<=.012)continue;const q=[i];seen[i]=1;let deep=0,maxDepth=0;const cells=new Map();
 for(let k=0;k<q.length;k++){const j=q[k],x=j%w,y=Math.floor(j/w);maxDepth=Math.max(maxDepth,g.lake[j]);if(g.lake[j]>.025){deep++;const c=cell(j);cells.set(c,(cells.get(c)||0)+1);}for(const [dx,dy] of D.slice(0,4)){const X=x+dx,Y=y+dy,t=Y*w+X;if(X<0||Y<0||X>=w||Y>=h||seen[t]||!g.land[t]||g.lake[t]<=.012)continue;seen[t]=1;q.push(t);}}
 const area=q.length/(r*r),eligible=area>=2&&deep>=r*r&&maxDepth>.045,selected=eligible?[...cells].filter(([i,a])=>oldLand[i]&&a>=r*r*.6).map(([i])=>i):[];
 if(selected.length){for(const c of selected)coverage[c]=1;for(const j of q)if(g.lake[j]>.012&&coverage[cell(j)])lakeWater[j]=1;}
 if(area>=.125)lakes.push({area,deepArea:deep/(r*r),maxDepth,classification:selected.length?'large-static-water':eligible?'unresolved-large-depression':'small-or-shallow',cells:selected.length});
 }
 for(let i=0;i<n;i++)if(coverage[i]){m.land[i]=0;m.terrain[i]=0;m.resource[i]=-1;m.fert[i]=0;m.pass[i]=0;m.river[i]=0;m.coast[i]=0;m.delta[i]=0;}
 const edges=Array.from({length:n},()=>new Map()),reverse=Array.from({length:n},()=>[]),maxFlow=new Float32Array(n),channel=new Uint8Array(n),outlet=new Uint8Array(n),edgeFlow=new Float32Array(n);
 const boundary=i=>i%W===0||i%W===W-1||i<W||i>=n-W;
 const add=(a,b,flow)=>{const prior=edges[a].get(b);if(prior===undefined||prior<flow)edges[a].set(b,flow);};
 // Coarse graph is the quotient of the fine drainage DAG. It can have
 // cycles because paths can re-enter a cell; reverse outlet search resolves
 // those cycles without inventing a second independent drainage network.
 for(let j=0;j<N;j++){if(!g.land[j]||lakeWater[j])continue;const a=cell(j);if(!m.land[a])continue;const discharge=g.flow[j]/(r*r);maxFlow[a]=Math.max(maxFlow[a],discharge);if(discharge>58)channel[a]=1;const t=g.down[j];if(t<0){if(boundary(a))outlet[a]=1;continue;}const b=cell(t);if(a!==b)add(a,b,discharge);else if(!g.land[t]&&boundary(a))outlet[a]=1;}
 // A fine shoreline can end inside a coarse land cell. Link it only to an
 // adjacent represented water cell. Record any legacy fallback separately.
 for(let a=0;a<n;a++){if(!m.land[a])continue;const x=a%W,y=Math.floor(a/W);for(const [dx,dy] of D){const X=x+dx,Y=y+dy,b=Y*W+X;if(X<0||Y<0||X>=W||Y>=H||m.land[b])continue;if(!edges[a].has(b))add(a,b,0);}if(boundary(a))outlet[a]=1;for(const [b,flow] of edges[a])reverse[b].push([a,flow]);}
 const down=new Int32Array(n).fill(-1),basin=new Int32Array(n).fill(-1),settled=new Uint8Array(n),order=[],dist=new Float64Array(n).fill(Infinity),heap=[];
 const push=(i,d)=>{let k=heap.length;heap.push([i,d]);while(k){const p=(k-1)>>1;if(heap[p][1]<=d)break;heap[k]=heap[p];k=p;}heap[k]=[i,d];};
 const pop=()=>{const a=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let j=k*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[k]=heap[j];k=j;}heap[k]=last;}return a;};
 for(let i=0;i<n;i++)if(!m.land[i]||outlet[i]){dist[i]=0;basin[i]=i;push(i,0);}
 while(heap.length){const [i,d]=pop();if(settled[i]||d!==dist[i])continue;settled[i]=1;order.push(i);for(const [a,f] of reverse[i]){if(settled[a])continue;const penalty=1+4/(1+Math.log1p(f))+Math.max(0,oldHeight[i]-oldHeight[a])*8+(natural&&channel[a]&&f<58?25:0),next=d+penalty;if(next<dist[a]){dist[a]=next;down[a]=i;edgeFlow[a]=f;basin[a]=basin[i];push(a,next);}}}
 // An unresolved coarse cell must not silently become an invented river.
 // The fallback uses the existing downhill route only for non-major cells.
 let fallback=0,unresolved=0;for(let pass=0;pass<W+H;pass++){let added=0;for(let i=0;i<n;i++)if(m.land[i]&&!settled[i]){const j=oldDown[i];if(j>=0&&settled[j]&&!channel[i]){settled[i]=1;down[i]=j;basin[i]=basin[j];order.push(i);fallback++;added++;}}if(!added)break;}
 for(let i=0;i<n;i++)if(m.land[i]&&!settled[i])unresolved++;
 let repair=null,runoff=null;if(hydrography){g.lakeWater=lakeWater;g.lakeId=physical.lakeId;g.lakeLevels=physical.lakeLevels;g.lakeCoverage=physical.wetCount;g.lakeNetwork=lakeNetwork(g);g.lakeClassification={accepted:physical.accepted,rejected:physical.rejected};const waterCoverage=new Uint16Array(n);let fineInput=0,fineOutput=0,fineUphill=0,physicalUphill=0;for(let i=0;i<N;i++){const j=g.down[i],x=i%w,y=Math.floor(i/w);if(x<W*r&&y<H*r&&(!g.land[i]||lakeWater[i]))waterCoverage[cell(i)]++;if(g.land[i]){fineInput+=.4+g.rain[i]*1.2;if(j>=0){fineUphill+=+(g.surface[j]>=g.surface[i]);physicalUphill+=+(g.bed[j]>g.bed[i]);}else fineOutput+=g.flow[i];}else fineOutput+=g.flow[i];}g.waterCoverage=waterCoverage;g.fineConservation={input:fineInput,output:fineOutput,relativeError:Math.abs(fineInput-fineOutput)/Math.max(1,fineInput),routingUphill:fineUphill,physicalUphill};
 // Prefer a physically observed major edge if it does not create a cycle.
 const candidates=[];for(let i=0;i<n;i++)if(m.land[i]&&channel[i]&&down[i]>=0&&m.land[down[i]]&&edgeFlow[i]<58)candidates.push(i);candidates.sort((a,b)=>maxFlow[b]-maxFlow[a]||a-b);const changes=[];for(const i of candidates){const choices=[...edges[i]].filter(([,f])=>f>=58).sort((a,b)=>b[1]-a[1]||a[0]-b[0]);for(const [j,f] of choices){let p=j,steps=0;while(p>=0&&p!==i&&m.land[p]&&steps++<=n)p=down[p];if(p===i||steps>n)continue;changes.push({cell:i,from:down[i],to:j,discharge:f});down[i]=j;edgeFlow[i]=f;break;}}
 // Recompute the topological order, coarse runoff and terminal basin IDs.
 const indegree=new Int32Array(n),queue=new Int32Array(n),mass=new Float64Array(n);let head=0,tail=0,input=0,output=0;for(let i=0;i<n;i++)if(m.land[i]&&down[i]>=0)indegree[down[i]]++;for(let i=0;i<n;i++){if(m.land[i]){mass[i]=.4+m.moisture[i]*1.2;input+=mass[i];}if(!indegree[i])queue[tail++]=i;}
 while(head<tail){const i=queue[head++],j=m.land[i]?down[i]:-1;if(j>=0){mass[j]+=mass[i];if(--indegree[j]===0)queue[tail++]=j;}else output+=mass[i];}if(tail!==n)throw Error('Hydrography coarse cycle');order.length=0;for(let k=tail-1;k>=0;k--){const i=queue[k],j=m.land[i]?down[i]:-1;basin[i]=j>=0?basin[j]:i;order.push(i);}runoff=Float32Array.from(mass);m.runoff=runoff;m.outletFlow=edgeFlow;repair={changes,input,output,error:Math.abs(input-output),visited:tail};}
 let maxLift=0,riverCount=0,matched=0,majorExitMismatch=0,up=0,changedLand=0;
 // Use the same fine channel discharge rather than summing overlapping
 // coarse catchments. Keep strictly descending coarse heights along chosen DAG.
 for(const i of order){if(!m.land[i])continue;const j=down[i];if(j>=0)m.height[i]=Math.max(m.height[i],m.height[j]+.000002);maxLift=Math.max(maxLift,m.height[i]-oldHeight[i]);}
 m.down=down;m.basin=basin;m.flow=maxFlow;
 for(let i=0;i<n;i++){changedLand+=+(m.land[i]!==oldLand[i]);if(!m.land[i])continue;const x=i%W,y=Math.floor(i/W),j=down[i];m.river[i]=channel[i];m.coast[i]=+D.slice(0,4).some(([dx,dy])=>x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<H&&!m.land[(y+dy)*W+x+dx]);m.delta[i]=+(m.coast[i]&&maxFlow[i]>85);m.fert[i]=C(m.fert[i]+.14*(m.river[i]-oldRiver[i]),.05,1);if(channel[i]){riverCount++;matched++;if(j>=0&&m.land[j]&&edgeFlow[i]<58)majorExitMismatch++;}if(j>=0&&m.height[j]>=m.height[i])up++;}
 const landmass=new Int32Array(n),visited=new Uint8Array(n);for(let i=0;i<n;i++){if(!m.land[i]||visited[i])continue;const q=[i];visited[i]=1;for(let k=0;k<q.length;k++){const j=q[k],x=j%W,y=Math.floor(j/W);for(const [dx,dy] of D.slice(0,4)){const X=x+dx,Y=y+dy,t=Y*W+X;if(X<0||Y<0||X>=W||Y>=H||!m.land[t]||visited[t])continue;visited[t]=1;q.push(t);}}for(const j of q)landmass[j]=q.length;}m.landmass=landmass;
 if(natural){let aggregation=0,contradiction=0;const cases=[];for(let i=0;i<n;i++)if(channel[i]&&m.land[i]&&down[i]>=0&&m.land[down[i]]&&edgeFlow[i]<58){const major=[...edges[i]].filter(([j,f])=>f>=58);const type=major.length===0?'no-major-crossing':'major-route-disagrees';if(major.length===0)aggregation++;else contradiction++;cases.push({cell:i,chosen:down[i],discharge:edgeFlow[i],major,type});}g.exitAudit={aggregation,contradiction,cases};}g.lakeWater=lakeWater;g.hydrologyAudit={riverCount,matched,majorExitMismatch,fallback,unresolved,up,maxLift,changedLand,lakes,...(hydrography?{repair}: {})};return m;
}

// Read-only diagnosis of an existing quotient graph. A different coarse
// neighbor is not excused by the existence of a river in the same cell.
export function auditMajorExits(m,W,H){
 const g=m.geography,r=g.detail,w=g.width,n=W*H,cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r)),edges=Array.from({length:n},()=>new Map());
 for(let i=0;i<g.land.length;i++){if(!g.land[i]||g.lakeWater?.[i])continue;const a=cell(i),j=g.down[i];if(!m.land[a]||j<0)continue;const b=cell(j);if(a===b)continue;const flow=g.flow[i]/(r*r),prior=edges[a].get(b);if(!prior||prior.flow<flow)edges[a].set(b,{flow,from:i,to:j});}
 const cases=[];for(let i=0;i<n;i++){const j=m.down[i];if(!m.land[i]||!m.river[i]||j<0||!m.land[j])continue;const chosen=edges[i].get(j)?.flow||0;if(chosen>=58)continue;const alternatives=[...edges[i]].filter(([b,e])=>e.flow>=58).sort((a,b)=>b[1].flow-a[1].flow);
 const coarse=new Set();let c=j;for(let k=0;k<8&&c>=0&&!coarse.has(c);k++){coarse.add(c);c=m.down[c];}
 let rejoin=false,returns=false;const fineCells=[];if(alternatives.length){let p=alternatives[0][1].to,prev=i;for(let k=0;k<r*r*32&&p>=0&&fineCells.length<8;k++){const next=cell(p);if(next!==prev){fineCells.push(next);prev=next;if(coarse.has(next))rejoin=true;if(next===i)returns=true;}p=g.down[p];}}
 cases.push({cell:i,chosen:j,chosenDischarge:chosen,alternatives:alternatives.map(([b,e])=>({cell:b,discharge:e.flow})),fineCells,classification:!alternatives.length?'no-major-crossing':returns?'cell-reentry':rejoin?'different-exit-rejoins':'different-major-route'});}
 return {total:cases.length,classes:Object.fromEntries([...new Set(cases.map(c=>c.classification))].map(k=>[k,cases.filter(c=>c.classification===k).length])),cases};
}

// Read-only attribution of physical uphill coarse edges using their fine
// crossing evidence. A filled depression alone is not a represented lake.
export function auditPhysicalEdges(m,W,H){
 const g=m.geography,r=g.detail,w=g.width,n=W*H,cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r)),evidence=new Map(),counts={},cases=[];
 const key=(a,b)=>a*n+b;
 for(let i=0;i<g.land.length;i++){if(!g.land[i])continue;const j=g.down[i];if(j<0)continue;const a=cell(i),b=cell(j);if(a===b||!m.land[a]||m.down[a]!==b||m.height[b]<m.height[a])continue;const k=key(a,b),q=g.flow[i]/(r*r),old=evidence.get(k);if(old&&old.flow>=q)continue;evidence.set(k,{from:i,to:j,flow:q,bedDelta:g.bed[j]-g.bed[i],routingDelta:g.surface[j]-g.surface[i],depthFrom:g.lake[i],depthTo:g.lake[j],representedLake:!!(g.lakeWater?.[i]||g.lakeWater?.[j])});}
 for(let a=0;a<n;a++){const b=m.down[a];if(!m.land[a]||b<0||m.height[b]<m.height[a])continue;const e=evidence.get(key(a,b)),type=!e?'no-fine-crossing':e.representedLake?'represented-lake-crossing':e.bedDelta>0?(Math.max(e.depthFrom,e.depthTo)>.012?'filled-depression-bed-rise':'bed-rise-outside-depth-threshold'):'coarse-average-rise-fine-bed-descends';counts[type]=(counts[type]||0)+1;cases.push({from:a,to:b,coarseDelta:m.height[b]-m.height[a],representedWater:!m.land[b],type,evidence:e??null});}
 return {total:cases.length,counts,cases};
}

// Experimental repair on a detached graph only. Do not alter Genesis 3.3
// or serialize a different routing graph under the same revision.
export function auditExitRepair(m,W,H){
 const g=m.geography,r=g.detail,w=g.width,n=W*H,cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r)),original=auditMajorExits(m,W,H),down=m.down.slice(),results=[];
 const terminal=(start,graph,avoid=-1)=>{const seen=new Set();let i=start;while(i>=0&&!seen.has(i)){if(i===avoid)return {cycle:true,terminal:i,steps:seen.size};seen.add(i);if(!m.land[i]||graph[i]<0)return {cycle:false,terminal:i,steps:seen.size};i=graph[i];}return {cycle:true,terminal:i,steps:seen.size};};
 for(const c of [...original.cases].sort((a,b)=>(b.alternatives[0]?.discharge??0)-(a.alternatives[0]?.discharge??0))){
 const old=terminal(c.chosen,down),choices=c.alternatives.map(a=>({...a,...terminal(a.cell,down,c.cell)})),chosen=choices.find(a=>!a.cycle);
 if(chosen)down[c.cell]=chosen.cell;
 results.push({cell:c.cell,oldExit:c.chosen,oldDischarge:c.chosenDischarge,oldTerminal:old,choices,proposed:chosen?.cell??null,status:chosen?'acyclic-major-repair':'requires-quotient-cycle-resolution'});
 }
 const candidate=auditMajorExits({...m,down},W,H);return {original:original.total,remaining:candidate.total,results,remainingCases:candidate.cases,changed:results.filter(r=>r.proposed!==null).length};
}

// Research only: resolve quotient cycles using an actual fine outlet path,
// not a made-up adjacency. Existing map, saved routing and fields unchanged.
export function auditQuotientComponents(m,W,H){
 const g=m.geography,r=g.detail,w=g.width,n=W*H,cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor(i%w/r)),original=auditMajorExits(m,W,H),results=[];
 for(const issue of original.cases){for(const alternative of issue.alternatives){
  const component=[issue.cell],seen=new Set(component);let j=alternative.cell;while(j>=0&&m.land[j]&&!seen.has(j)){component.push(j);seen.add(j);j=m.down[j];}if(j!==issue.cell)continue;
  let best=-1,discharge=-1;for(let i=0;i<g.land.length;i++){const k=g.down[i];if(k<0||!g.land[i]||g.lakeWater?.[i]||cell(i)!==issue.cell||cell(k)!==alternative.cell)continue;const f=g.flow[i]/(r*r);if(f>discharge){best=i;discharge=f;}}
  if(best<0){results.push({cell:issue.cell,component,status:'no-fine-crossing'});continue;}
  const path=[],crossings=[];let current=best,last=-1;const fineSeen=new Set();
  while(current>=0&&!fineSeen.has(current)){fineSeen.add(current);const k=cell(current);if(k!==last){if(last>=0)crossings.push({from:last,to:k,fromNode:previous,toNode:current,flow:g.flow[previous]/(r*r),bedRise:g.bed[current]-g.bed[previous]});path.push(k);last=k;}if(!g.land[current]||g.lakeWater?.[current])break;var previous=current;current=g.down[current];}
  // Test direct exit from the component along the strongest fine catchment.
  // A loop-erased suffix may require changing more than one downstream cell.
  const loop=[];for(const k of path){const at=loop.indexOf(k);if(at>=0)loop.splice(at+1);else loop.push(k);}
  const down=m.down.slice(),changes=[];for(let k=0;k<loop.length-1;k++){const i=loop[k],to=loop[k+1];if(!m.land[i])break;if(down[i]!==to){changes.push({cell:i,from:down[i],to,evidence:crossings.filter(c=>c.from===i&&c.to===to).sort((a,b)=>b.flow-a.flow)[0]});down[i]=to;}if(!seen.has(i)&&!seen.has(to)&&k>0){ // only change the component and necessary immediate escape
   let p=to,steps=0;while(p>=0&&m.land[p]&&!seen.has(p)&&steps++<=n)p=down[p];if(p<0||!m.land[p])break;
  }}
  const indegree=new Int32Array(n),queue=new Int32Array(n);let head=0,tail=0;for(let i=0;i<n;i++)if(m.land[i]&&down[i]>=0)indegree[down[i]]++;for(let i=0;i<n;i++)if(!indegree[i])queue[tail++]=i;while(head<tail){const i=queue[head++],k=m.land[i]?down[i]:-1;if(k>=0&&--indegree[k]===0)queue[tail++]=k;}
  const after=auditMajorExits({...m,down},W,H),candidate=tail===n&&after.total<original.total&&changes.every(c=>c.evidence);
  results.push({cell:issue.cell,component,discharge,fromNode:best,finePath:path,crossings,loopErased:loop,changes,visited:tail,acyclic:tail===n,remaining:after.total,remainingCases:after.cases,candidate,status:candidate?'physical-component-exit-candidate':'unresolved'});
 }}return {original:original.total,results};
}
