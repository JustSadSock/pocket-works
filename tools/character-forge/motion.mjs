// Motion providers are independent of geometry. Clip and retarget sampling
// operate on semantic keys; no claim of mocap quality or solved contacts.
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=t=>t*t*(3-2*t), cyc=t=>((t%1)+1)%1;
function sampleCurve(phase,keys){let p=cyc(phase),i=keys.findIndex(k=>k[0]>=p);if(i<=0)return keys[0][1];let a=keys[i-1],b=keys[i],t=smooth((p-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t}
export const gaitProfiles={
 humanoid:{duty:.62,offset:[0,.5],stride:.38,swing:.50,knee:.75,distal:.12},
 horse:{duty:.66,offset:[.25,.75,0,.5],stride:.48,swing:.32,knee:.46,distal:.31},
 elephant:{duty:.76,offset:[.25,.75,0,.5],stride:.28,swing:.18,knee:.23,distal:.10},
 dog:{duty:.62,offset:[.25,.75,0,.5],stride:.40,swing:.37,knee:.58,distal:.24}
};
export function motionFrame(model,action,phase,quat){
 const fam=model.spec.family,g=gaitProfiles[fam]??gaitProfiles.humanoid,move=['walk','run'].includes(action),speed=action==='run'?1.45:1;
 return model.joints.map(j=>{
 let a=0,name=j.name,attached=/^(rider|crew)\//.test(name),left=/L(?:-|$)|\.L$/.test(name),leg=/^fore|^hind/.test(name),id=leg?(name.startsWith('fore')?(left?0:1):(left?2:3)):(left?0:1);
 let off=g.offset[id]??0,t=cyc(phase+off),swing=t>=g.duty,u=swing?(t-g.duty)/(1-g.duty):t/g.duty;
 if(move&&!attached){if(j.role==='leg.upper')a=swing?g.swing*Math.cos(Math.PI*u):-g.swing*Math.cos(Math.PI*u);if(j.role==='leg.lower')a=swing?g.knee*Math.sin(Math.PI*u):.04*Math.sin(Math.PI*u);if(j.role==='leg.distal')a=(fam==='horse'?-1:1)*(swing?g.distal*Math.sin(Math.PI*u):0);if(j.role==='leg.pastern'||j.role==='foot')a=swing?-.12*Math.sin(Math.PI*u):.04*Math.sin(Math.PI*u);if(j.role==='arm.upper')a=(left?1:-1)*.24*Math.sin(phase*TAU);a*=speed}
 if(j.role==='spine')a=(fam==='elephant'?.022:.045)*Math.sin(phase*TAU*2);
 if(j.role==='neck'&&move&&!attached)a=.06*Math.sin(phase*TAU*2+.7);
 if(j.role==='tail'||j.role==='trunk')a=.10*Math.sin(phase*TAU+j.id*.35);
 if(attached&&move){if(j.role==='spine')a=-.045*Math.sin(phase*TAU*2);if(j.role==='arm.lower')a=.025*Math.sin(phase*TAU*2+.6);if(model.spec.motionRevision==='v3'){if(j.role==='pelvis')a=-.035*Math.sin(phase*TAU*2+.35);if(j.role==='head')a=.025*Math.sin(phase*TAU*2-.45);if(j.role==='leg.upper')a=.035*Math.sin(phase*TAU*2+(left?0:.6));if(j.role==='leg.lower')a=-.025*Math.sin(phase*TAU*2)}}
 if(j.role.startsWith('wing')){let s=left?-1:1;if(action==='fly')a=s*(j.role==='wing'?sampleCurve(phase,[[0,-.6],[.32,.65],[.70,-.85],[1,-.6]]):.35*Math.sin(phase*TAU+.8));else a=s*.10;}
 if(action==='turn'&&j.parent<0)return quat([0,1,0],.6*Math.sin(phase*TAU));
 if(action==='guard'&&j.role==='arm.upper')a=-.25;if(action==='interact'&&j.role==='arm.lower')a=.35*Math.sin(phase*TAU);
 return quat(j.axis,clamp(a,-j.limitDegrees*Math.PI/180,j.limitDegrees*Math.PI/180))
 })}
export function blendFrames(a,b,t){if(a.length!==b.length||!Number.isFinite(t)||t<0||t>1)throw Error('Invalid blend');return a.map((q,i)=>{let r=b[i],sign=q.reduce((s,x,k)=>s+x*r[k],0)<0?-1:1,v=q.map((x,k)=>(1-t)*x+t*sign*r[k]),n=Math.hypot(...v);return v.map(x=>x/n)})}
export function semanticRetarget(source,target,frame){const key=j=>j.role+':'+j.name.replace(/^(rider|crew)\//,'').replace(/[^LR]*([LR])(?:-|$).*/,'$1');let by=new Map(source.joints.map((j,i)=>[key(j),frame[i]]));return target.joints.map(j=>by.get(key(j))??[0,0,0,1])}
export function sampleClip(clip,t){if(!clip.frames?.length||!Number.isFinite(t)||t<0||t>1)throw Error('Invalid sampled clip');let f=t*(clip.frames.length-1),i=Math.floor(f);return blendFrames(clip.frames[i],clip.frames[Math.min(i+1,clip.frames.length-1)],f-i)}
export function contactIntent(model,phase){let g=gaitProfiles[model.spec.family]??gaitProfiles.humanoid;return model.contacts.map(c=>({...c,stance:cyc(phase+(c.phase??0))<g.duty}))}
