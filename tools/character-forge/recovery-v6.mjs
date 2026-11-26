// V6 stage 1: exactly one human candidate, with v4 as reference.
// Never promote art on a numeric gate alone.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {dress,anatomicalSection,assertTailoredSections} from './garment.mjs';
import {weights} from './hybrid-human.mjs';
import {glb} from './glb.mjs';
import {preview} from './preview.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2));
const base=read('makehuman-base.json'),identity=JSON.parse(readFileSync(new URL('identities-v4.json',import.meta.url))).base.identity;
const opt={kit:'tunic',style:'historical-miniature',method:'hybrid',identity};
const range=(p,k)=>{let a=p.positions.filter((_,i)=>i%3===k);return [Math.min(...a),Math.max(...a)]};
function oldDiagnostics(source,kit){
 const body=source.parts[0],vs=Array.from({length:body.positions.length/3},(_,i)=>body.positions.slice(i*3,i*3+3)),H=Math.max(...vs.map(v=>v[1])),J=n=>source.joints.find(j=>j.name===n),hip=J('root').position[1],waist=J('spine03').position[1]-.04,shoulder=J('upperarm01.L').position[1],neck=J('neck01').position[1];
 const armIds=new Set(source.joints.filter(j=>/arm|wrist|finger|thumb|clavicle/i.test(j.name)).map(j=>j.id));
 const ids=vs.map((_,i)=>i).filter(i=>weights(body,i).reduce((s,[j,w])=>s+(armIds.has(j)?w:0),0)<.35);
 const rows=[];
 for(const y of [hip-(kit==='warrior'?.22:.255)*H,hip-.025,waist,shoulder-.17*H/1.75,shoulder+.027*H/1.75,neck-.013]){
   const picked=ids.filter(i=>Math.abs(vs[i][1]-y)<.058*H/1.75),xs=picked.map(i=>vs[i][0]),zs=picked.map(i=>vs[i][2]),rx=Math.max(.092,(Math.max(...xs)-Math.min(...xs))/2),rz=Math.max(.065,(Math.max(...zs)-Math.min(...zs))/2),cz=(Math.max(...zs)+Math.min(...zs))/2;
   let scale=1,worst=null;
   for(const i of picked){const v=vs[i],r=Math.hypot(v[0]/rx,(v[2]-cz)/rz);if(r>scale){scale=r;worst={position:v,weights:weights(body,i).map(([j,w])=>[source.joints[j].name,w])}}}
   rows.push({y,count:picked.length,center:[0,cz],radiusBefore:[rx,rz],scale,radiusAfter:[rx*scale,rz*scale],worst});
 }
 const measured=anatomicalSection({source,body,vs},waist,'bodice');
 return {kit,H,waist,rows,measuredWaist:measured};
}
const legacy=dress(base,{...opt,surfaceRevision:4}),candidate=dress(base,{...opt,surfaceRevision:6});
const outer=candidate.parts.find(p=>p.name==='tunic'),belt=candidate.parts.find(p=>p.name==='waist belt');
assertTailoredSections(outer.pattern.sections,'tunic',oldDiagnostics(base,'tunic').H);
const rest=m=>m.joints.map(()=>[0,0,0,1]),view='three-quarter';
const bounds=preview(legacy,{view,rotations:rest(legacy)}).bounds,b=preview(candidate,{view,rotations:rest(candidate)}).bounds;
const fixedBounds=[Math.min(bounds[0],b[0]),Math.max(bounds[1],b[1]),Math.min(bounds[2],b[2]),Math.max(bounds[3],b[3])];
for(const [name,m] of [['v6-control-v4',legacy],['v6-citizen',candidate]]){
 const t=performance.now();const p=preview(m,{view,rotations:rest(m),fixedBounds,width:960,height:960});write(name+'.svg',p.svg);
 if(name==='v6-citizen')write(name+'.glb',glb(m));
 json(name+'.metrics.json',{previewMs:performance.now()-t,...m.statistics,parts:m.parts.map(p=>({name:p.name,range:[0,1,2].map(k=>range(p,k)),attachment:p.attachment,pattern:p.pattern}))});
}
json('v6-citizen.model.json',candidate);
json('v6-sections.json',{old:[oldDiagnostics(base,'tunic'),oldDiagnostics(read('makehuman-tall-heavy.json'),'warrior')],candidate:outer.pattern.sections,belt:{range:range(belt,0),attachment:belt.attachment},source:base.spec.provenance,artisticGate:'pending-human-review',productionAuthorized:false});
json('v6-static-collision-input.json',[{kit:'tunic',label:'rest',phase:null,parts:[{name:'hidden anatomy',layer:0,positions:base.parts[0].positions,indices:base.parts[0].indices},...candidate.parts.filter(p=>p.layer).map(p=>({name:p.name,layer:p.layer,positions:p.positions,indices:p.indices}))]}]);
console.log(JSON.stringify({v6:{sections:outer.pattern.sections.map(q=>({y:q.y,region:q.region,radius:q.radius,anatomical:q.radii})),belt:range(belt,0),geometryMs:candidate.statistics.garmentMs,artisticGate:'pending-human-review'}}));
