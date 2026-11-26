// Original CMU motion, parse hierarchy and rotation order. No raw asset redistribution.
import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {build,quat,qmul,rotate,pose,poseFrom,animation} from './core.mjs';import {preview} from './preview.mjs';
const out=process.env.CHARACTER_EVIDENCE,raw=readFileSync('/tmp/character-cmu.bvh','utf8'),[header,motion]=raw.split('MOTION'),tokens=header.match(/[{}]|[^\s{}]+/g);let i=0,joints=[];const take=e=>{let v=tokens[i++];if(e&&v!==e)throw Error('Expected '+e+' got '+v);return v};take('HIERARCHY');
function node(parent){let typ=take(),name=take();if(!['ROOT','JOINT'].includes(typ))throw Error('Unexpected node');take('{');take('OFFSET');let offset=[+take(),+take(),+take()];take('CHANNELS');let n=+take(),channels=Array.from({length:n},()=>take()),id=joints.length;joints.push({name,parent,offset,channels});while(tokens[i]!=='}'){if(tokens[i]==='End'){take('End');take('Site');take('{');take('OFFSET');take();take();take();take('}')}else node(id)}take('}')}
node(-1);let rows=motion.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean),n=+rows[0].split(':')[1],dt=+rows[1].split(':')[1],frames=rows.slice(2).map(s=>s.split(/\s+/).map(Number));if(frames.length!==n)throw Error('Frame count');
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a,s)=>a.map(x=>x*s),unit=a=>mul(a,1/(Math.hypot(...a)||1)),inv=q=>[-q[0],-q[1],-q[2],q[3]],axes=[[1,0,0],[0,1,0],[0,0,1]];
function world(values){let p=0,w=[];for(let j of joints){let t=j.offset.slice(),q=[0,0,0,1];for(let ch of j.channels){let val=values[p++],axis=axes['XYZ'.indexOf(ch[0].toUpperCase())];if(ch.toLowerCase().endsWith('position'))t=add(t,rotate(q,mul(axis,val)));else q=qmul(q,quat(axis,val*Math.PI/180))}let pa=w[j.parent];w.push(pa?{p:add(pa.p,rotate(pa.q,t)),q:qmul(pa.q,q)}:{p:t,q})}return w}
const id=n=>{let i=joints.findIndex(j=>j.name.toLowerCase().endsWith(n.toLowerCase()));if(i<0)throw Error('Missing source '+n);return i};
// Source directions are expressed in an anatomical basis, not source
// absolute BVH bone rotations. No end-effector IK or forced foot locking.
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),angle=(a,b)=>Math.acos(clamp(dot(unit(a),unit(b)),-1,1))*180/Math.PI;
function swing(a,b){a=unit(a);b=unit(b);let d=dot(a,b);if(d>1-1e-10)return [0,0,0,1];if(d< -1+1e-8){let axis=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return quat(axis,Math.PI)}let c=cross(a,b),q=[...c,1+d];return q.map(v=>v/Math.hypot(...q))}
let hips=id('Hips'),rhip=id('RightUpLeg'),lhip=id('LeftUpLeg'),rf=id('RightFoot'),lf=id('LeftFoot'),worlds=frames.slice(2).map(world),side=unit(worlds.reduce((v,w)=>add(v,sub(w[lhip].p,w[rhip].p)),[0,0,0]).map((x,i)=>i===1?0:x)),forward=unit(cross(side,[0,1,0])),travel=sub(worlds.at(-1)[hips].p,worlds[0][hips].p);if(dot(travel,forward)<0)forward=mul(forward,-1);
const basis=v=>[dot(v,side),v[1],dot(v,forward)];
let signal=worlds.map(w=>dot(sub(w[rf].p,w[hips].p),forward)),peaks=[];for(let i=5;i<signal.length-5;i++)if(signal[i]>=Math.max(...signal.slice(i-5,i+6)))peaks.push(i);let pairs=peaks.slice(1).map((v,i)=>[peaks[i],v]).filter(([a,b])=>(b-a)*dt>.65&&(b-a)*dt<1.65);if(!pairs.length)throw Error('No capture cycle');pairs.sort((a,b)=>Math.abs((a[1]-a[0])*dt-1.08)-Math.abs((b[1]-b[0])*dt-1.08));let [a,b]=pairs[0],m=build({version:2,recipe:'citizen',style:'historical-miniature',lod:'medium',actions:['idle','walk']});
const by=n=>{let j=m.joints.find(j=>j.name===n);if(!j)throw Error('Missing target '+n);return j};
const optional=(...names)=>{for(let n of names){let i=joints.findIndex(j=>j.name.toLowerCase().endsWith(n.toLowerCase()));if(i>=0)return i}return null};
const mappings=[];
function map(t,end,s,se){let x=m.joints.find(j=>j.name===t),y=m.joints.find(j=>j.name===end),si=optional(...s),ei=optional(...se);if(x&&y&&si!==null&&ei!==null)mappings.push({joint:x.id,child:y.id,source:si,sourceChild:ei,rest:sub(y.position,x.position)})}
for(let [tag,s] of [['L','Left'],['R','Right']]){
 map(tag+'-hip',tag+'-knee',[s+'UpLeg'],[s+'Leg']);
 map(tag+'-knee',tag+'-foot',[s+'Leg'],[s+'Foot']);
 map(tag+'-shoulder',tag+'-elbow',[s+'Arm'],[s+'ForeArm']);
 map(tag+'-elbow',tag+'-hand',[s+'ForeArm'],[s+'Hand']);
 // Native foot shape is fixed in its semantic foot frame. If there is a
 // toe joint in both rigs, transfer foot segment direction independently.
 map(tag+'-foot',tag+'-toe',[s+'Foot'],[s+'ToeBase',s+'Toe']);
}
map('chest','neck',['Spine','LowerBack'],['Neck','Neck1']);map('neck','head',['Neck','Neck1'],['Head']);
if(mappings.length<8)throw Error('Incomplete anatomical mappings '+mappings.length);
const first=worlds[a],sourceLen=norm(sub(first[rhip].p,first[id('RightLeg')].p))+norm(sub(first[id('RightLeg')].p,first[rf].p)),targetLen=norm(sub(by('R-hip').position,by('R-knee').position))+norm(sub(by('R-knee').position,by('R-foot').position)),scale=targetLen/sourceLen;
function transfer(w){
 let globals=[],rotations=[],directions=new Map(mappings.map(v=>[v.joint,v]));
 let targetSide=sub(by('L-hip').position,by('R-hip').position),srcSide=basis(sub(w[lhip].p,w[rhip].p)),pelvis=swing(targetSide,srcSide);
 for(let j of m.joints){let pa=j.parent<0?[0,0,0,1]:globals[j.parent],x=directions.get(j.id),q=j.parent<0?pelvis:x?swing(x.rest,basis(sub(w[x.sourceChild].p,w[x.source].p))):pa;globals.push(q);rotations.push(qmul(inv(pa),q))}
 let ret=poseFrom(m,rotations),errors=mappings.map(x=>({joint:m.joints[x.joint].name,source:joints[x.source].name,angle:angle(sub(ret[x.child].p,ret[x.joint].p),basis(sub(w[x.sourceChild].p,w[x.source].p)))}));
 let srcFoot=[rf,lf].map(k=>mul(basis(sub(w[k].p,w[hips].p)),scale)),dstFoot=['R-foot','L-foot'].map(k=>sub(ret[by(k).id].p,ret[0].p)),sourceGap=Math.abs(srcFoot[0][0]-srcFoot[1][0]),targetGap=Math.abs(dstFoot[0][0]-dstFoot[1][0]);
 return {rotations,ret,errors,maxDirectionError:Math.max(...errors.map(e=>e.angle)),sourceFootRelative:srcFoot,retargetFootRelative:dstFoot,sourceGap,targetGap,gapError:Math.abs(targetGap-sourceGap)}
}
// Render source skeleton with same fixed anatomical projection, metre
// scale and root alignment as the target. Source positions are captured,
// not an illustration drawn from expected results.
function skeletonSVG(w,view,bounds){
 const dir=unit(view==='side'?[1,.12,0]:[0,.12,1]),right=unit(cross([0,1,0],dir)),up=cross(dir,right),margin=70,size=720,sc=Math.min((size-2*margin)/(bounds[1]-bounds[0]),(size-2*margin)/(bounds[3]-bounds[2])),p=v=>[size/2+(dot(v,right)-(bounds[0]+bounds[1])/2)*sc,size/2-(dot(v,up)-(bounds[2]+bounds[3])/2)*sc],origin=by('pelvis').position,positions=w.map(q=>add(origin,mul(basis(sub(q.p,w[hips].p)),scale)));
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="100%" height="100%" fill="#dedbd0"/><g stroke="#52676b" stroke-width="3" stroke-linecap="round">';
 for(let j of joints){let k=joints.indexOf(j);if(j.parent<0)continue;let x=p(positions[j.parent]),y=p(positions[k]);svg+='<line x1="'+x[0]+'" y1="'+x[1]+'" x2="'+y[0]+'" y2="'+y[1]+'"/>'}svg+='</g>';for(let v of positions){let x=p(v);svg+='<circle cx="'+x[0]+'" cy="'+x[1]+'" r="3" fill="#243d43"/>'}return svg+'</svg>'
}
const write=(name,s)=>writeFileSync(join(out,name),s),report={clip:'35_01',method:'anatomical basis + target rest segment swing; no IK',duration:(b-a)*dt,sourceFrameRange:[a+2,b+2],sourceFrameTime:dt,scale,mappings,static:null,phases:[],fullCycle:false};
function render(w,tag,r){for(let view of ['front','side']){let bounds=[-.95,.95,-.35,1.95]; // fixed target-scale framing for all comparisons
 write(tag+'-source-'+view+'.svg',skeletonSVG(w,view,bounds));write(tag+'-target-'+view+'.svg',preview(m,{view,rotations:r.rotations,neutral:true,skeleton:true,fixedBounds:bounds}).svg)}}
let rest=world(frames[0]),stat=transfer(rest);report.static={maxDirectionError:stat.maxDirectionError,errors:stat.errors,sourceGap:stat.sourceGap,targetGap:stat.targetGap,gapError:stat.gapError};render(rest,'static',stat);
let phaseGate=stat.maxDirectionError<.01;
for(let f of [0,4,8,12]){let phase=f/16,w=worlds[a+Math.round((b-a)*phase)],r=transfer(w);render(w,'phase-'+f,r);report.phases.push({phase,maxDirectionError:r.maxDirectionError,sourceGap:r.sourceGap,targetGap:r.targetGap,gapError:r.gapError,errors:r.errors});phaseGate&&=r.maxDirectionError<.01&&r.gapError<.15}
report.staticGate=stat.maxDirectionError<.01;report.phaseGate=phaseGate;
if(phaseGate){let comparison=[];for(let f=0;f<16;f++){let phase=f/16,w=worlds[a+Math.round((b-a)*phase)],r=transfer(w);render(w,'cycle-'+String(f).padStart(2,'0'),r);comparison.push({phase,rootCaptureMetres:mul(basis(sub(w[hips].p,first[hips].p)),scale),sourceFootRelative:r.sourceFootRelative,retargetFootRelative:r.retargetFootRelative,sourceGap:r.sourceGap,targetGap:r.targetGap,errors:r.errors,rotations:r.rotations})}report.fullCycle=true;report.comparison=comparison}
report.limitations='Direct segment directions preserve swing, not exact axial twist, toe orientation or local source bone roll. Target bone lengths and pelvis width differ. No contact solver; full cycle withheld on failed static/sample gate.';
write('capture-v4-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({static:report.static,phases:report.phases.map(({errors,...r})=>r),fullCycle:report.fullCycle}));
