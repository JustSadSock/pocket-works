import {appearance,styles,lods,classifyPart} from "./style.mjs";
import {animal} from "./animals.mjs";
// Character Core v0.2: metres, +Y up, +Z forward (glTF). No editor/runtime dependencies.
export const profiles=Object.freeze({simplified:{sides:8,rings:5,head:1.08,width:1.02,faceted:true},miniature:{sides:12,rings:8,head:1.16,width:1.10,faceted:false},realistic:{sides:24,rings:14,head:1,width:1,faceted:false}});
export const recipes=Object.freeze({
 swordsman:{family:'humanoid',outfit:'mail',height:1.78,build:1.04},
 legionary:{family:'humanoid',outfit:'roman',height:1.73,build:1.12},
 citizen:{family:'humanoid',outfit:'town',height:1.69,build:.90},
 horse:{family:'horse',outfit:'none',height:1.55,build:1},
 rider:{family:'horse',outfit:'rider',height:1.62,build:1},
 elephant:{family:'elephant',outfit:'crew',height:2.9,build:1},
 dog:{family:'dog',outfit:'none',height:.65,build:.86},
 bird:{family:'bird',outfit:'none',height:.55,build:1}
});
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const lerp=(a,b,t)=>add(mul(a,1-t),mul(b,t)),mix=(a,b,t)=>a+(b-a)*t;
const palette={skin:[.60,.36,.23],mail:[.27,.33,.36],iron:[.48,.55,.57],bronze:[.62,.39,.16],red:[.48,.10,.065],blue:[.14,.29,.40],linen:[.72,.62,.43],leather:[.18,.10,.065],wood:[.33,.19,.09],dark:[.045,.038,.03],hair:[.20,.12,.07],ivory:[.83,.75,.55],horse:[.35,.19,.105],elephant:[.38,.40,.40],dog:[.58,.36,.18],feather:[.32,.42,.49]};
const finite=(v,min,max,n)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+n);return v};
export function validate(spec){
 if(!spec||![1,2].includes(spec.version)||!Object.hasOwn(recipes,spec.recipe)||(spec.version===1?!Object.hasOwn(profiles,spec.profile):!Object.hasOwn(styles,spec.style)||!Object.hasOwn(lods,spec.lod)))throw Error('Unknown version, recipe or profile');
 const r=recipes[spec.recipe],m=spec.morphology??{},allowed=['height','build','head','limb','age'];
 if(Object.keys(m).some(k=>!allowed.includes(k)))throw Error('Unknown morphology');
 if(spec.seed!==undefined&&(!Number.isInteger(spec.seed)||spec.seed<0||spec.seed>4294967295))throw Error('Invalid seed');
 const morph={height:finite(m.height??r.height,r.height*.65,r.height*1.4,'height'),build:finite(m.build??r.build,.65,1.5,'build'),head:finite(m.head??1,.8,1.25,'head'),limb:finite(m.limb??1,.85,1.15,'limb'),age:finite(m.age??.45,0,1,'age')};
 const actions=spec.actions??['idle','walk','run','turn'];if(!Array.isArray(actions)||!actions.length||new Set(actions).size!==actions.length||actions.some(a=>!['idle','walk','run','turn','guard','interact','fly'].includes(a)))throw Error('Unsupported action');
 if(spec.format!==undefined&&spec.format!=='glb')throw Error('Unsupported target format');
 const budget={maxTriangles:spec.budget?.maxTriangles??100000,maxJoints:spec.budget?.maxJoints??128,maxBytes:spec.budget?.maxBytes??16000000};
 for(const [k,v] of Object.entries(budget))if(!Number.isSafeInteger(v)||v<1||v>100000000)throw Error('Invalid budget '+k);
 return {version:spec.version,recipe:spec.recipe,family:r.family,profile:spec.version===1?spec.profile:undefined,...(spec.version===2?{style:spec.style,lod:spec.lod,surface:spec.surface??'transported',composite:spec.composite??spec.recipe==='rider',modules:spec.modules??[]}:{}),seed:spec.seed??17,morphology:morph,actions,budget,format:'glb',provenance:[{author:'Pocket Works',license:'original',origin:'Character Forge research geometry'}]};
}
function rng(seed){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}}
class Builder{
 constructor(spec){this.spec=spec;this.profile=spec.version===1?profiles[spec.profile]:appearance(spec.style,spec.lod);this.joints=[];this.parts=[];this.contacts=[];this.sockets=[];this.components=[];this.random=rng(spec.seed)}
 joint(name,parent,p,role,axis=[1,0,0],limit=90){if(this.joints.some(j=>j.name===name)||parent>=this.joints.length||parent<-1)throw Error('Invalid hierarchy');const id=this.joints.length;this.joints.push({id,name,parent,position:p,local:parent<0?p:sub(p,this.joints[parent].position),role,axis:unit(axis),limitDegrees:limit});return id}
 socket(name,joint,point,role){this.sockets.push({name,joint,local:sub(point,this.joints[joint].position),role})}
 part(name,color,joint){const p={name,component:classifyPart(name),color:palette[color]??color,positions:[],normals:[],indices:[],joints:[],weights:[],binding:joint};this.parts.push(p);return p}
 vertex(p,v,n,j,k=j,w=1){p.positions.push(...v);p.normals.push(...unit(n));p.joints.push(j,k,0,0);p.weights.push(w,1-w,0,0);return p.positions.length/3-1}
 // Connected indexed surface with capped rings; weights interpolate at each anatomical bend.
 loft(name,stations,color,sideCount=this.profile.sides){
  const p=this.part(name,color,stations[0].j),N=sideCount;let priorU=null;
  for(let i=0;i<stations.length;i++){let s=stations[i],a=stations[Math.max(0,i-1)].p,b=stations[Math.min(stations.length-1,i+1)].p,t=unit(sub(b,a)),u=unit(cross(Math.abs(t[1])>.9?[0,0,1]:[0,1,0],t)),v=cross(t,u);
   if(this.spec.version===2&&this.spec.surface==='transported'&&priorU){let projected=sub(priorU,mul(t,dot(priorU,t)));if(Math.hypot(...projected)>.001)u=unit(projected);v=cross(t,u)}priorU=u;
   for(let k=0;k<N;k++){let q=k*2*Math.PI/N,rad=add(mul(u,Math.cos(q)*s.r[0]),mul(v,Math.sin(q)*s.r[1]));this.vertex(p,add(s.p,rad),add(mul(u,Math.cos(q)/s.r[0]),mul(v,Math.sin(q)/s.r[1])),s.j,s.k??s.j,s.w??1)}
  }
  for(let i=0;i<stations.length-1;i++)for(let k=0;k<N;k++){let a=i*N+k,b=i*N+(k+1)%N,c=b+N,d=a+N;p.indices.push(a,b,c,a,c,d)}
  for(let i of [0,stations.length-1]){let s=stations[i],n=unit(sub(s.p,stations[i===0?1:i-1].p)),c=this.vertex(p,s.p,n,s.j,s.k??s.j,s.w??1);for(let k=0;k<N;k++){let a=i*N+k,b=i*N+(k+1)%N;p.indices.push(c,...(i===0?[b,a]:[a,b]))}}
  return p
 }
 egg(name,c,r,color,j){let M=this.profile.rings,N=this.profile.sides,stations=[];for(let i=0;i<=M;i++){let t=Math.PI*i/M,q=Math.max(.004,Math.sin(t));stations.push({p:add(c,[0,-r[1]*Math.cos(t),0]),r:[r[0]*q,r[2]*q],j})}return this.loft(name,stations,color,N)}
 limb(name,points,radii,js,color){let stations=[];for(let i=0;i<points.length-1;i++){let a=points[i],b=points[i+1];for(let t of [0,.20,.48,.78]){let r=mix(radii[i],radii[i+1],t);stations.push({p:lerp(a,b,t),r:[r,r*.87],j:js[i],k:js[i+1],w:t<.48?1:mix(1,.5,(t-.48)/.52)})}}stations.push({p:points.at(-1),r:[radii.at(-1),radii.at(-1)*.87],j:js.at(-1)});return this.loft(name,stations,color)}
 bar(name,a,b,r,color,j,r2=r){return this.loft(name,[{p:a,r:[r,r],j},{p:b,r:[r2,r2],j}],color)}
}
function human(b,prefix,origin,parent,scale,outfit,seated=false){
 const m=b.spec.morphology, P=b.profile, w=m.build*P.width, h=scale, head=m.head*P.head, leg=m.limb, pos=(x,y,z)=>add(origin,[x*h,y*h,z*h]), J=(n,p,v,r,a,l)=>b.joint(prefix+n,p,pos(...v),r,a,l);
 const hipY=seated?0:.53*leg,hip=J('pelvis',parent,[0,hipY,0],'pelvis'),chest=J('chest',hip,[0,hipY+.20,0],'spine',[1,0,0],35),neck=J('neck',chest,[0,hipY+.32,0],'neck',[0,1,0],65),skull=J('head',neck,[0,hipY+.40,0],'head',[0,1,0],75);
 const armor=outfit==='roman',town=outfit==='town',cloth=armor?'red':town?'linen':'blue',bodyColor=town?cloth:'mail';
 let skin=palette.skin.map((x,i)=>Math.max(0,x+(b.random()-.5)*.09-(m.age-.45)*.035));
 b.loft(prefix+'torso',[{p:pos(0,hipY-.09,0),r:[.105*h*w,.075*h*w],j:hip},{p:pos(0,hipY+.03,0),r:[.115*h*w,.082*h*w],j:hip},{p:pos(0,hipY+.10,0),r:[.102*h*w,.076*h*w],j:hip,k:chest,w:.5},{p:pos(0,hipY+.23,0),r:[.157*h*w,.095*h*w],j:chest},{p:pos(0,hipY+.29,0),r:[.11*h*w,.073*h*w],j:chest}],bodyColor);
 b.bar(prefix+'neck',pos(0,hipY+.27,0),pos(0,hipY+.37,0),.038*h,skin,neck);
 b.egg(prefix+'head',pos(0,hipY+.405,0),[.065*h*head,.087*h*head,.062*h*head],skin,skull);
 b.egg(prefix+'nose',pos(0,hipY+.397,.057*head),[.015*h,.023*h,.022*h],skin,skull);
 for(let s of [-1,1]){b.egg(prefix+'eye'+s,pos(s*.028*head,hipY+.421,.054*head),[.008*h,.005*h,.004*h],'dark',skull);b.egg(prefix+'ear'+s,pos(s*.065*head,hipY+.405,0),[.012*h,.022*h,.014*h],skin,skull)}
 b.egg(prefix+'hair or helmet',pos(0,hipY+.451,-.008),[.072*h*head,.053*h*head,.070*h*head],town?'hair':armor?'bronze':'iron',skull);
 if(b.spec.version===2){
  const hem=hipY-.12,top=hipY+.055; b.loft(prefix+(town?'tunic skirt':'mail skirt'),[{p:pos(0,hem,0),r:[.139*h*w,.101*h*w],j:hip},{p:pos(0,hem+.05,0),r:[.129*h*w,.095*h*w],j:hip},{p:pos(0,top,0),r:[.118*h*w,.088*h*w],j:hip}],town?cloth:'mail');
  if(town){b.egg(prefix+'shoulder bag',pos(-.145*w,hipY+.01,.045),[.069*h,.087*h,.041*h],'leather',hip);b.bar(prefix+'bag strap',pos(-.13*w,hipY+.23,.09),pos(.09*w,hipY+.035,.09),.012*h,'leather',chest)}
  b.socket(prefix+'waist',hip,pos(0,hipY+.035,0),'belt'); b.socket(prefix+'headwear',skull,pos(0,hipY+.45,0),'headwear');
 }
 if(armor){b.egg(prefix+'crest',pos(0,hipY+.516,-.005),[.018*h,.04*h,.075*h],'red',skull);for(let i=0;i<5;i++)b.loft(prefix+'lamella'+i,[{p:pos(0,hipY+.08+i*.034,0),r:[(.125+i*.004)*h*w,.091*h*w],j:chest},{p:pos(0,hipY+.104+i*.034,0),r:[(.127+i*.004)*h*w,.093*h*w],j:chest}],'iron')}
 b.loft(prefix+'belt',[{p:pos(0,hipY+.018,0),r:[.119*h*w,.086*h*w],j:hip},{p:pos(0,hipY+.047,0),r:[.120*h*w,.087*h*w],j:hip}],'leather');
 b.egg(prefix+'buckle',pos(0,hipY+.033,.087*w),[.024*h,.017*h,.009*h],'bronze',hip);
 for(let s of [-1,1]){
  let tag=s<0?'L':'R',a=[s*.078*w,hipY,0],k=seated?[s*.23,-.12,.16]:[s*.083*w,.27*leg,.018],f=seated?[s*.24,-.31,-.02]:[s*.083*w,.055,0],u=J(tag+'-hip',hip,a,'leg.upper'),v=J(tag+'-knee',u,k,'leg.lower',[1,0,0],125),foot=J(tag+'-foot',v,f,'foot',[1,0,0],45);
  b.limb(prefix+tag+'-leg',[pos(...a),pos(...k),pos(...f)],[.063*h*w,.042*h*w,.030*h*w],[u,v,foot],armor?skin:'leather');
  b.egg(prefix+tag+'-shoe',pos(f[0],f[1]-.022,f[2]+.031),[.043*h,.029*h,.078*h],'leather',foot);b.contacts.push({joint:foot,role:'sole',local:[0,-.051*h,.03*h],phase:s<0?0:.5});
  let sh=[s*.147*w,hipY+.24,0],el=[s*.183*w,hipY+.075,.038],ha=[s*.175*w,hipY-.045,.088];if(!town){el=[s*.205*w,hipY+.125,.055];ha=[s*.165*w,hipY+.095,.17]}
  if(seated){el=[s*.15,hipY+.13,.10];ha=[s*.11,hipY+.09,.26]}
  let arm=J(tag+'-shoulder',chest,sh,'arm.upper',[1,0,0],100),fore=J(tag+'-elbow',arm,el,'arm.lower',[1,0,0],130),hand=J(tag+'-hand',fore,ha,'hand',[1,0,0],35);
  b.limb(prefix+tag+'-arm',[pos(...sh),pos(...el),pos(...ha)],[.047*h*w,.033*h*w,.023*h],[arm,fore,hand],armor?skin:town?cloth:'mail');b.egg(prefix+tag+'-hand',pos(...ha),[.030*h,.040*h,.027*h],skin,hand);
  b.socket(prefix+tag+'-grip',hand,pos(...ha),'grip');
  if(!town&&!seated&&s>0){let c=pos(...ha),tip=add(c,[0,.49*h,.065*h]);b.bar(prefix+'hilt',add(c,[0,-.07*h,0]),add(c,[0,.055*h,0]),.014*h,'leather',hand);b.bar(prefix+'guard',add(c,[-.07*h,.064*h,0]),add(c,[.07*h,.064*h,0]),.013*h,'bronze',hand);b.loft(prefix+'blade',[{p:add(c,[0,.079*h,0]),r:[.024*h,.006*h],j:hand},{p:lerp(c,tip,.88),r:[.017*h,.004*h],j:hand},{p:tip,r:[.001*h,.001*h],j:hand}],'iron',4)}
  if(!town&&!seated&&s<0){let c=add(pos(...ha),[0,0,.085*h]);let shield=b.egg(prefix+'shield',c,[.167*h, (armor?.247:.178)*h,.033*h],armor?'red':'wood',fore);b.egg(prefix+'boss',add(c,[0,0,.034*h]),[.038*h,.038*h,.025*h],'bronze',fore)}
 }
 b.components.push({name:prefix||'human',family:'humanoid',root:hip,attachedTo:parent,template:'humanoid-v1'});
 return hip
}
function quadruped(b,type){
 const m=b.spec.morphology,h=m.height,w=m.build*b.profile.width,ele=type==='elephant',dog=type==='dog',c=ele?'elephant':dog?'dog':'horse',p=(x,y,z)=>[x*h,y*h,z*h],J=(n,pa,v,r,a,l)=>b.joint(n,pa,p(...v),r,a,l);
 const root=J('body',-1,[0,.69,0],'pelvis'),chest=J('chest',root,[0,.72,.27],'spine',[1,0,0],25),neck=J('neck',chest,[0,.82,.43],'neck',[1,0,0],45),head=J('head',neck,[0,ele?.88:1.02,.60],'head',[1,0,0],45);
 b.loft('barrel',[{p:p(0,.70,-.48),r:[.07*h,.09*h],j:root},{p:p(0,.70,-.36),r:[.24*h*w,.25*h*w],j:root},{p:p(0,.72,0),r:[.26*h*w,.29*h*w],j:root,k:chest,w:.5},{p:p(0,.72,.31),r:[.23*h*w,.25*h*w],j:chest},{p:p(0,.77,.43),r:[.13*h*w,.13*h*w],j:neck}],c);
 b.limb('neck',[p(0,.73,.29),p(0,.85,.45),p(0,ele?.90:1.03,.57)],[.19*h*w,.15*h*w,.10*h],[chest,neck,head],c);
 b.egg('head',p(0,ele?.89:1.04,.64),[.15*h*w,.15*h,.19*h],c,head);
 if(!ele){b.egg('muzzle',p(0,.96,.79),[.085*h,.085*h,.12*h],dog?'dark':c,head);b.egg('nose',p(0,.97,.88),[.075*h,.05*h,.045*h],'dark',head)}
 for(let s of [-1,1]){
  b.egg('ear'+s,p(s*(ele?.17:.085),ele?.93:1.18,.60),[ (ele?.13:.036)*h,(ele?.19:.08)*h,.045*h],c,head);
  b.egg('eye'+s,p(s*.139,ele?.93:1.08,.71),[.012*h,.015*h,.012*h],'dark',head);
  if(ele){let a=p(s*.12,.83,.72),mid=p(s*.15,.64,.87),tip=p(s*.15,.70,1.01);b.loft('tusk'+s,[{p:a,r:[.036*h,.036*h],j:head},{p:mid,r:[.023*h,.023*h],j:head},{p:tip,r:[.002*h,.002*h],j:head}],'ivory')}
  for(let front of [false,true]){let n=(front?'fore':'hind')+(s<0?'L':'R'),z=front?.28:-.33,x=s*.17*w,a=[x,.63,z],k=[x,.34,z+(front?.02:-.08)],f=[x,.065,z+.025],u=J(n+'-upper',front?chest:root,a,'leg.upper',[1,0,0],80),l=J(n+'-lower',u,k,'leg.lower',[1,0,0],110),foot=J(n+'-foot',l,f,'foot',[1,0,0],45);b.limb(n,[p(...a),p(...k),p(...f)],[ (ele?.106:.086)*h*w,(ele?.079:.047)*h*w,(ele?.072:.031)*h*w],[u,l,foot],c);b.egg(n+'-hoof',p(x,.043,z+.048),[(ele?.091:.051)*h,.043*h,(ele?.105:.067)*h],ele?c:'dark',foot);b.contacts.push({joint:foot,role:'sole',local:[0,-.065*h,.023*h],phase:(front===(s<0))?0:.5})}
 }
 let tail=J('tail',root,[0,.72,-.44],'tail',[1,0,0],60),tail2=J('tail-tip',tail,[0,.48,-.65],'tail',[1,0,0],60);b.limb('tail',[p(0,.72,-.44),p(0,.48,-.65),p(0,dog?.65:.27,-.72)],[.035*h,.025*h,.012*h],[tail,tail2,tail2],c);
 if(ele){let points=[[0,.89,.75],[0,.64,.89],[0,.40,.95],[0,.22,1.05],[0,.31,1.18]],js=[],pa=head;for(let i=0;i<points.length;i++){pa=J('trunk-'+i,pa,points[i],'trunk',[1,0,0],55);js.push(pa)}b.limb('trunk',points.map(v=>p(...v)),[.082*h,.066*h,.049*h,.031*h,.025*h],js,c)}
 b.components.push({name:type,family:ele?'specialized':type==='horse'||dog?'quadruped':type,root,template:type+'-v1'});
 if(!dog){
  let saddle=J('saddle',root,[0,1.01,-.03],'mount',[1,0,0],5);b.socket('seat',saddle,p(0,1.05,-.03),'riderSeat');b.egg('saddle blanket',p(0,.96,-.02),[.28*h,.045*h,.27*h],ele?'red':'leather',saddle);
  if(ele){for(let s of [-1,1])b.bar('howdah rail'+s,p(s*.23,1.02,-.24),p(s*.23,1.24,-.24),.025*h,'wood',saddle);b.loft('howdah floor',[{p:p(0,1.00,0),r:[.235*h,.24*h],j:saddle},{p:p(0,1.04,0),r:[.24*h,.24*h],j:saddle}],'wood');human(b,'crew/',p(0,1.05,-.08),saddle,1.58,'roman',false)}
  else human(b,'rider/',p(0,1.05,-.03),saddle,1.72,'mail',true);
 }
}
function bird(b){let h=b.spec.morphology.height,p=(x,y,z)=>[x*h,y*h,z*h],root=b.joint('body',-1,p(0,.55,0),'pelvis'),head=b.joint('head',root,p(0,.87,.32),'head',[0,1,0],75);b.egg('body',p(0,.55,0),[.24*h,.30*h,.35*h],'feather',root);b.egg('head',p(0,.87,.32),[.15*h,.16*h,.16*h],'feather',head);b.bar('beak',p(0,.86,.43),p(0,.83,.68),.078*h,'bronze',head,.005*h);
 for(let s of [-1,1]){let a=b.joint('wing-'+s,root,p(s*.17,.65,.04),'wing',[0,0,1],85),tip=b.joint('wing-tip-'+s,a,p(s*.54,.58,-.18),'wing.tip',[0,0,1],60);b.limb('wing'+s,[p(s*.17,.65,.04),p(s*.54,.58,-.18),p(s*.82,.51,-.31)],[.15*h,.12*h,.012*h],[a,tip,tip],'feather');let f=b.joint('foot-'+s,root,p(s*.12,.07,0),'foot',[1,0,0],40);b.bar('leg'+s,p(s*.12,.36,0),p(s*.12,.07,0),.026*h,'bronze',f);b.contacts.push({joint:f,role:'sole',local:[0,-.07*h,0],phase:s<0?0:.5})}
 b.components.push({name:'bird',family:'avian',root,template:'avian-v1'})}
export function build(spec){let s=validate(spec),b=new Builder(s),t=performance.now();
 if(s.version===2&&!['transported','legacy-rings'].includes(s.surface))throw Error('Unsupported surface');
 if(s.family==='humanoid')human(b,'',[0,0,0],-1,s.morphology.height,recipes[s.recipe].outfit);
 else if(s.family==='bird')bird(b);else if(s.version===2)animal(b,s.family,human);else quadruped(b,s.family);
 const triangleCount=b.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices=b.parts.reduce((n,p)=>n+p.positions.length/3,0);
 if(triangleCount>s.budget.maxTriangles||b.joints.length>s.budget.maxJoints)throw Error('Geometry budget exceeded');
 return {spec:s,joints:b.joints,parts:b.parts,contacts:b.contacts,sockets:b.sockets,components:b.components,modules:b.parts.map(p=>({part:p.name,kind:p.component,binding:p.binding})),statistics:{triangleCount,vertices,joints:b.joints.length,geometryAndRigMs:performance.now()-t},approval:'unreviewed'}
}
export function quat(axis,angle){return [...mul(unit(axis),Math.sin(angle/2)),Math.cos(angle/2)]}
export function qmul(a,b){let av=a.slice(0,3),bv=b.slice(0,3);return [...add(add(mul(bv,a[3]),mul(av,b[3])),cross(av,bv)),a[3]*b[3]-dot(av,bv)]}
export function rotate(q,v){let u=q.slice(0,3),t=mul(cross(u,v),2);return add(v,add(mul(t,q[3]),cross(u,t)))}
export function animation(model,action,phase){if(!model.spec.actions.includes(action))throw Error('Action not declared');let t=phase*Math.PI*2,move=action==='walk'||action==='run',amp=action==='run'?.60:.33;
 return model.joints.map(j=>{let angle=0,s=/L|left|-1/.test(j.name)?1:-1;if(/hind/.test(j.name))s=-s;
 const attached=j.name.startsWith('rider/')||j.name.startsWith('crew/');if(move&&!attached){if(j.role==='leg.upper')angle=s*amp*Math.sin(t);if(j.role==='leg.lower')angle=Math.max(0,s*Math.cos(t))*.42;if(j.role==='foot')angle=-s*.12*Math.sin(t);if(j.role==='arm.upper')angle=-s*amp*.65*Math.sin(t)}
 if(j.role==='spine')angle=.035*Math.sin(t);if(j.role==='tail'||j.role==='trunk')angle=.12*Math.sin(t+j.id*.3);if(j.role==='wing'||j.role==='wing.tip')angle=move?.4*Math.sin(t):.04*Math.sin(t);if(action==='turn'&&j.parent===-1)return quat([0,1,0],.7*Math.sin(t));if(action==='guard'&&j.role==='arm.upper')angle=-.25;if(action==='interact'&&j.role==='arm.lower')angle=.35*Math.sin(t);
 return quat(j.axis,Math.max(-j.limitDegrees*Math.PI/180,Math.min(j.limitDegrees*Math.PI/180,angle)))})
}
export function pose(model,action,phase){let qs=animation(model,action,phase),world=[];for(let j of model.joints){let p=j.parent<0?null:world[j.parent];world.push({q:p?qmul(p.q,qs[j.id]):qs[j.id],p:p?add(p.p,rotate(p.q,j.local)):j.position})}return world}
export function deform(model,part,world){let out=[];for(let i=0;i<part.positions.length/3;i++){let p=part.positions.slice(i*3,i*3+3),sum=[0,0,0];for(let k=0;k<4;k++){let n=i*4+k,w=part.weights[n];if(!w)continue;let j=part.joints[n],b=world[j];sum=add(sum,mul(add(b.p,rotate(b.q,sub(p,model.joints[j].position))),w))}out.push(sum)}return out}
