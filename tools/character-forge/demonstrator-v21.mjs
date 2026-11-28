// Integrated research-only character. Cyclic49 skeleton/cloth geometry is untouched.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {glb} from './glb.mjs';
import {pose,deform} from './core.mjs';
import {normals} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const key=p=>p.map(x=>Math.round(x*1e8)).join(':');
export function writeDemonstrator(cyclic,source,out){
 const hand=JSON.parse(readFileSync(join(out,'v21-hand-integration.json'),'utf8'));
 if(!hand.diagnosticOnly||hand.productionAllowed||cyclic.sampledWalk.rotations.length!==49||hand.sourceJointNames.length!==cyclic.joints.length||!cyclic.joints.every((j,i)=>j.name===hand.sourceJointNames[i]&&j.name===source.joints[i].name&&Math.hypot(...j.position.map((x,k)=>x-source.joints[i].position[k]))<1e-6))throw Error('Incompatible actual source rig for demonstrator');
 const dir=join(out,'v21-demonstrator');mkdirSync(dir,{recursive:true});
 const bodyName=source.parts[0].name,walk=structuredClone(cyclic),part=walk.parts.find(p=>p.name===bodyName);
 if(!part)throw Error('No visible MakeHuman body in Cyclic49 model');
 const matches=new Map();for(let i=0;i<part.positions.length/3;i++){const k=key(part.positions.slice(i*3,i*3+3));if(!matches.has(k))matches.set(k,[]);matches.get(k).push(i)}
 const delta=Array(part.positions.length).fill(0),changed=[];
 for(const row of hand.region){
  const ids=matches.get(key(row.position))??[];
  if(ids.length!==1)throw Error('Ambiguous or absent anatomical source vertex '+row.sourceVertex+' ('+ids.length+')');
  const i=ids[0];if(Math.hypot(...part.positions.slice(i*3,i*3+3).map((x,k)=>x-row.position[k]))>1e-7)throw Error('Source vertex mismatch');
  for(const [name,n] of [['joints8',8],['weights8',8],['joints',4],['weights',4]])for(let k=0;k<n;k++)part[name][n*i+k]=row[name][k];
  for(let k=0;k<3;k++)delta[3*i+k]=row.delta[k];
  changed.push({sourceVertex:row.sourceVertex,visibleVertex:i});
 }
 walk.approval='research-only: unreviewed anatomy and unqualified physical clothing';
 const flex=structuredClone(walk);flex.spec={...flex.spec,actions:['walk'],walkDuration:1};flex.sampledWalk={rotations:hand.rotations,offsets:hand.rotations.map(()=>[0,0,0])};
 const deltas=Object.fromEntries(flex.parts.map(p=>[p.name,p.name===bodyName?delta:Array(p.positions.length).fill(0)])),normalDeltas={};
 for(const p of flex.parts){const corrected={...p,positions:p.positions.map((x,i)=>x+deltas[p.name][i])};normals(corrected);normalDeltas[p.name]=corrected.normals.map((x,i)=>x-p.normals[i])}
 const walkBin=glb(walk),flexBin=glb(flex,{researchMorph:{deltas,normalDeltas,weights:hand.activation}});
 writeFileSync(join(dir,'walk.glb'),walkBin);writeFileSync(join(dir,'hand.glb'),flexBin);
 writeFileSync(join(dir,'walk.json'),JSON.stringify({model:walk,morph:null}));
 writeFileSync(join(dir,'hand.json'),JSON.stringify({model:flex,morph:{part:bodyName,delta,activation:hand.activation}}));
 const manifest={version:'v0.21',diagnosticOnly:true,productionAllowed:false,artApproved:false,gripAllowed:false,
  motion:'Cyclic49 unchanged exact 49-key joint and root paths; technical acceptance applies to source walk',anatomy:'C-matched eight-weight MCP correction on exact source vertices; hand morph only active in isolated flexion mode',
  clothing:'Historical artisan skinned wardrobe, not a qualified dynamic cloth cache; failed Remesh evidence remains separate and visible in the research report',
  walkDuration:cyclic.spec.walkDuration,mappedSourceVertices:changed,bodyVertexCount:part.positions.length/3,parts:walk.parts.map(p=>p.name),walkPathUnchanged:JSON.stringify(walk.sampledWalk)===JSON.stringify(cyclic.sampledWalk),
  originalCyclicGlbSha256:sha(readFileSync(join(out,'v15-walk-cyclic49.glb'))),walkGlbSha256:sha(walkBin),handGlbSha256:sha(flexBin)};
 if(!manifest.walkPathUnchanged)throw Error('Cyclic49 was mutated');
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
 // Matching original and integrated frames. No pose or cloth failure is retouched.
 const at=(m,t,mode,cycle=0)=>{const world=pose(m,'walk',t).map(b=>({...b,p:b.p.map((x,k)=>x+(k===2?cycle*(cyclic.sampledWalk.offsets.at(-1)[2]-cyclic.sampledWalk.offsets[0][2]):0))}));let activation=0;if(mode==='hand'){const u=t*(hand.activation.length-1),i=Math.floor(u),f=u-i;activation=hand.activation[i]*(1-f)+hand.activation[Math.min(i+1,hand.activation.length-1)]*f}
  return {parts:m.parts.map(p=>{const q={...p,positions:p.positions.map((x,i)=>x+(mode==='hand'&&p.name===bodyName?delta[i]*activation:0))};q.positions=deform(m,q,world).flat();normals(q);return q})}};
 for(const view of ['front','side']){
  const original=Array.from({length:73},(_,i)=>at(cyclic,(i%24)/24,'walk',Math.floor(i/24))),frames=Array.from({length:73},(_,i)=>at(walk,(i%24)/24,'walk',Math.floor(i/24))),bounds=commonBounds([...original,...frames],view);
  const seq=join(dir,'walk-'+view);mkdirSync(seq,{recursive:true});for(let i=0;i<frames.length;i++)writeFileSync(join(seq,String(i).padStart(2,'0')+'.png'),raster(frames[i],{view,bounds,size:640,mode:'B',groundLine:true}).png);
  for(const i of [0,12,24])writeFileSync(join(dir,'baseline-'+view+'-'+i+'.png'),raster(original[i],{view,bounds,size:640,mode:'B',groundLine:true}).png);
  const poses=[0,.5,1].map(t=>at(flex,t,'hand')),hb=commonBounds(poses,view);
  for(let i=0;i<poses.length;i++)writeFileSync(join(dir,'hand-'+view+'-'+i+'.png'),raster(poses[i],{view,bounds:hb,size:640,mode:'B',groundLine:true}).png);
 }
 return manifest;
}

if(process.argv[1]&&process.argv[1].endsWith('demonstrator-v21.mjs')){const out=process.env.CHARACTER_EVIDENCE;const read=n=>JSON.parse(readFileSync(join(out,n),'utf8'));writeDemonstrator(read('v21-cyclic49-source-model.json'),read('morph/makehuman-base.json'),out)}
