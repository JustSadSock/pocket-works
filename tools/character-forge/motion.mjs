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
// MakeHuman's bent-arm rest frame is not a neutral presentation pose.
// This opt-in research pose uses the original skeleton and semantic joints.
function miniatureFrame(model,action,phase,quat){
 const walk=action==='walk',t=phase*TAU,mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
 return model.joints.map(j=>{
   const name=j.name,left=name.endsWith('.L'),sign=left?1:-1,cycle=t+(left?0:Math.PI),swing=Math.sin(cycle),lift=Math.max(0,Math.sin(cycle));
   let x=0,y=0,z=0;
   if(/^upperarm01\./.test(name)){z=-sign*.34;x=walk?-.18*swing:0}
   if(/^lowerarm01\./.test(name)){x=.38+(walk?.08*lift:0)}
   if(/^upperleg01\./.test(name)){z=-sign*.09;x=walk?.29*Math.cos(cycle):0}
   if(/^lowerleg01\./.test(name)){x=walk?.47*lift:0}
   if(/^foot\./.test(name)){x=walk?-.20*Math.cos(cycle)-.21*lift:0;z=sign*.09}
   if(name==='root'){y=walk?.035*Math.sin(t):0;z=walk?.025*Math.sin(t):0}
   if(name==='spine03'){x=.025;y=walk?-.055*Math.sin(t):0}
   if(name==='head')y=walk?.025*Math.sin(t):.03;
   return mul(quat([0,0,1],z),mul(quat([0,1,0],y),quat([1,0,0],x)));
 });
}
function miniatureFrameV9(model,action,phase,quat){
 const walk=action==='walk',t=phase*TAU,duty=model.spec.gaitDuty??.62;
 const cyc=x=>((x%1)+1)%1,smooth=x=>x*x*(3-2*x);
 const gait=p=>{
  const local=cyc(p),stance=local<duty,u=stance?local/duty:(local-duty)/(1-duty),e=smooth(u);
  const hip=stance?-.34+.64*smooth(local/duty):.30-.64*e;
  const knee=stance?.025*Math.sin(Math.PI*local/duty):.62*Math.sin(Math.PI*u);
  return {local,stance,u,hip,knee};
 };
 const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
 return model.joints.map(j=>{
  const name=j.name,left=name.endsWith('.L'),sign=left?1:-1,arm=gait(phase+(left?.5:0));
  let x=0,y=0,z=0;
  if(/^upperarm01\./.test(name)){z=-sign*.08;x=walk?-.50*arm.hip:0}
  if(/^lowerarm01\./.test(name)){x=.20+(walk&&!arm.stance?.07*Math.sin(Math.PI*arm.u):0)}
  // Leg rotations are solved from the measured sole path below, not layered
  // on top of a second procedural swing curve.
  if(/^upperleg01\./.test(name))x=0;
  if(/^lowerleg01\./.test(name))x=0;
  if(/^foot\./.test(name))x=0;
  if(name==='pelvis')y=walk?.035*Math.sin(t):0;
  if(name==='spine03'){y=walk?-.040*Math.sin(t):0;x=walk?.018*Math.sin(2*t):.012}
  if(name==='spine02')y=walk?.023*Math.sin(t+.25):0;
  if(name==='spine01')y=walk?.012*Math.sin(t+.48):0;
  if(name==='neck01')x=walk?-.012*Math.sin(2*t):0;
  if(name==='head'){x=walk?.010*Math.sin(2*t+.2):.015;y=walk?-.014*Math.sin(t):0}
  return mul(quat([0,0,1],z),mul(quat([0,1,0],y),quat([1,0,0],x)));
 });
}
export function motionFrame(model,action,phase,quat){
 if(model.spec.miniaturePose==='v9')return miniatureFrameV9(model,action,phase,quat);if(model.spec.miniaturePose==='v8')return miniatureFrame(model,action,phase,quat);
 const fam=model.spec.family,g=gaitProfiles[fam]??gaitProfiles.humanoid,move=['walk','run'].includes(action),speed=action==='run'?1.45:1;
 return model.joints.map(j=>{
 let a=0,name=j.name,attached=/^(rider|crew)\//.test(name),left=/L(?:-|$)|\.L$/.test(name),leg=/^fore|^hind/.test(name),id=leg?(name.startsWith('fore')?(left?0:1):(left?2:3)):(left?0:1);
 let off=g.offset[id]??0,t=cyc(phase+off),swing=t>=g.duty,u=swing?(t-g.duty)/(1-g.duty):t/g.duty;
 if(move&&!attached){if(j.role==='leg.upper')a=swing?g.swing*Math.cos(Math.PI*u):-g.swing*Math.cos(Math.PI*u);if(j.role==='leg.lower')a=swing?g.knee*Math.sin(Math.PI*u):.04*Math.sin(Math.PI*u);if(j.role==='leg.distal')a=(fam==='horse'?-1:1)*(swing?g.distal*Math.sin(Math.PI*u):0);if(j.role==='leg.pastern'||j.role==='foot')a=swing?-.12*Math.sin(Math.PI*u):.04*Math.sin(Math.PI*u);if(j.role==='arm.upper')a=(left?1:-1)*.24*Math.sin(phase*TAU);a*=speed}
 if(j.role==='spine')a=(fam==='elephant'?.022:.045)*Math.sin(phase*TAU*2);
 if(j.role==='neck'&&move&&!attached)a=.06*Math.sin(phase*TAU*2+.7);
 if(j.role==='tail'||j.role==='trunk')a=(model.spec.motionRevision==='v9'?(j.role==='trunk'?.13:.075):.10)*Math.sin(phase*TAU*(j.role==='tail'?1.35:1)+j.id*.35);if(j.role==='ear')a=.11*Math.sin(phase*TAU*2+j.id*.47);
 if(attached&&move){if(j.role==='spine')a=-.045*Math.sin(phase*TAU*2);if(j.role==='arm.lower')a=.025*Math.sin(phase*TAU*2+.6);if(['v3','v4'].includes(model.spec.motionRevision)){if(j.role==='pelvis')a=-.035*Math.sin(phase*TAU*2+.35);if(j.role==='head')a=.025*Math.sin(phase*TAU*2-.45);if(j.role==='leg.upper')a=.035*Math.sin(phase*TAU*2+(left?0:.6));if(j.role==='leg.lower')a=-.025*Math.sin(phase*TAU*2)}}
 if(j.role.startsWith('wing')){let s=left?-1:1;if(action==='fly')a=s*(j.role==='wing'?sampleCurve(phase,[[0,-.6],[.32,.65],[.70,-.85],[1,-.6]]):.35*Math.sin(phase*TAU+.8));else a=s*.10;}
 if(['v4','v9'].includes(model.spec.motionRevision)&&move&&['horse','elephant'].includes(fam)){
   let t=phase*TAU,horse=fam==='horse',roll=(horse?.035:.055)*Math.sin(t),pitch=(horse?.047:.022)*Math.sin(2*t+.25);
   if(j.parent<0)return quat([0,0,1],roll);
   if(j.role==='spine'&&!attached)a=pitch;
   if(j.role==='neck'&&!attached)a=-pitch*.72+.025*Math.sin(t-.4);
   if(j.role==='head'&&!attached)a=-pitch*.30+.018*Math.sin(t-.8);
   if(j.role==='mount')a=-pitch*.4;
   if(attached&&j.role==='pelvis')a=-pitch*.65;
   if(attached&&j.role==='spine')a=-pitch*.8;
 }
 if(model.spec.garment?.identity?.posture&&j.role==='spine')a+=model.spec.garment.identity.posture;
 if(action==='turn'&&j.parent<0)return quat([0,1,0],.6*Math.sin(phase*TAU));
 if(action==='guard'&&j.role==='arm.upper')a=-.25;if(action==='interact'&&j.role==='arm.lower')a=.35*Math.sin(phase*TAU);
 return quat(j.axis,clamp(a,-j.limitDegrees*Math.PI/180,j.limitDegrees*Math.PI/180))
 })}
export function blendFrames(a,b,t){if(a.length!==b.length||!Number.isFinite(t)||t<0||t>1)throw Error('Invalid blend');return a.map((q,i)=>{let r=b[i],sign=q.reduce((s,x,k)=>s+x*r[k],0)<0?-1:1,v=q.map((x,k)=>(1-t)*x+t*sign*r[k]),n=Math.hypot(...v);return v.map(x=>x/n)})}
export function semanticRetarget(source,target,frame){const key=j=>j.role+':'+j.name.replace(/^(rider|crew)\//,'').replace(/[^LR]*([LR])(?:-|$).*/,'$1');let by=new Map(source.joints.map((j,i)=>[key(j),frame[i]]));return target.joints.map(j=>by.get(key(j))??[0,0,0,1])}
export function sampleClip(clip,t){if(!clip.frames?.length||!Number.isFinite(t)||t<0||t>1)throw Error('Invalid sampled clip');let f=t*(clip.frames.length-1),i=Math.floor(f);return blendFrames(clip.frames[i],clip.frames[Math.min(i+1,clip.frames.length-1)],f-i)}
export function contactIntent(model,phase){let g=gaitProfiles[model.spec.family]??gaitProfiles.humanoid;return model.contacts.map(c=>({...c,stance:cyc(phase+(c.phase??0))<g.duty}))}
