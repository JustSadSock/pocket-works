// Species-specific anatomical landmark templates. Local units: nominal height.
export const animalTemplates=Object.freeze({
 horse:{body:[[0,.76,-.58,.08,.10],[0,.78,-.43,.21,.24],[0,.77,-.18,.25,.29],[0,.77,.16,.23,.27],[0,.81,.38,.18,.23],[0,.90,.43,.10,.14]],neck:[[0,.84,.28],[0,1.02,.43],[0,1.20,.64],[0,1.23,.72]],neckR:[.18,.15,.095,.080],head:[[0,1.24,.66],[0,1.19,.79],[0,1.07,.91],[0,1.04,1.00]],headR:[[.090,.12],[.102,.125],[.064,.071],[.055,.045]],fore:[[.14,.88,.28],[.15,.63,.38],[.15,.40,.33],[.15,.14,.35],[.15,.045,.42]],hind:[[.16,.83,-.39],[.17,.65,-.18],[.16,.40,-.47],[.16,.14,-.39],[.16,.045,-.31]],foreR:[.11,.071,.043,.024,.029],hindR:[.15,.11,.049,.025,.032],ear:[.065,1.36,.70],eye:[.085,1.22,.79],hoof:[.046,.05,.071],tail:[[0,.90,-.52],[0,.70,-.73],[0,.38,-.78],[0,.19,-.75]],tailR:[.050,.045,.035,.008],seat:[0,1.04,-.05]},
 dog:{body:[[0,.60,-.57,.04,.08],[0,.64,-.40,.14,.18],[0,.64,-.12,.18,.21],[0,.68,.21,.20,.26],[0,.70,.40,.12,.16]],neck:[[0,.70,.26],[0,.83,.43],[0,.94,.54],[0,.96,.60]],neckR:[.14,.12,.09,.075],head:[[0,.96,.52],[0,.96,.65],[0,.90,.81],[0,.89,.89]],headR:[[.09,.11],[.115,.12],[.066,.064],[.055,.045]],fore:[[.14,.75,.28],[.15,.48,.36],[.15,.27,.29],[.15,.12,.30],[.15,.045,.38]],hind:[[.15,.69,-.40],[.15,.48,-.22],[.15,.24,-.49],[.15,.12,-.40],[.15,.045,-.32]],foreR:[.088,.065,.037,.029,.034],hindR:[.11,.077,.042,.028,.034],ear:[.10,1.08,.57],eye:[.10,.98,.69],hoof:[.055,.045,.08],tail:[[0,.68,-.48],[0,.75,-.69],[0,.90,-.80],[0,1.0,-.79]],tailR:[.04,.034,.022,.007]},
 elephant:{body:[[0,.72,-.57,.12,.18],[0,.74,-.43,.28,.29],[0,.74,-.10,.33,.32],[0,.75,.22,.31,.32],[0,.78,.43,.21,.23]],neck:[[0,.79,.30],[0,.88,.43],[0,.91,.54],[0,.93,.64]],neckR:[.23,.21,.18,.14],head:[[0,.93,.51],[0,.98,.63],[0,.91,.75],[0,.81,.79]],headR:[[.15,.19],[.19,.21],[.155,.16],[.10,.09]],fore:[[.19,.74,.31],[.19,.54,.34],[.19,.35,.31],[.19,.16,.33],[.19,.065,.36]],hind:[[.21,.72,-.37],[.21,.53,-.29],[.21,.35,-.40],[.21,.16,-.38],[.21,.065,-.34]],foreR:[.14,.12,.095,.081,.09],hindR:[.16,.13,.10,.084,.09],ear:[.21,.94,.60],eye:[.16,.96,.73],hoof:[.105,.065,.12],tail:[[0,.81,-.52],[0,.55,-.65],[0,.29,-.66],[0,.23,-.71]],tailR:[.032,.022,.016,.012],seat:[0,1.10,-.02]}
});
// Explicit shaped anatomical components, not rescaled eggs.
// A hoof has an inclined coronet, broad flat ground plane and bevel;
// elephant ear is a curved, double-sided fan with a continuous rim.
function hoofSurface(b,name,f,h,w,type,j,color){
 const r=type==='horse'?[.052,.073]:[.112,.124],scale=Math.sqrt(w),rings=[{dy:-.044,dz:.018,x:1,z:1},{dy:-.033,dz:.016,x:1.03,z:1.01},{dy:.015,dz:.005,x:.88,z:.84},{dy:.056,dz:-.018,x:.61,z:.60}];
 if(type==='elephant'){rings[0].dy=-.065;rings[1].dy=-.052;rings[3].dy=.07;rings[3].x=.83;rings[3].z=.85}
 return b.loft(name,rings.map(q=>({p:[f[0],f[1]+q.dy*h,f[2]+q.dz*h],r:[r[0]*h*q.x*scale,r[1]*h*q.z],j})),color,Math.max(10,b.profile.sides))
}
function elephantEar(b,s,e,h,m,head,color){
 let p=b.part('shaped pinna '+s,color,head),N=18,R=5,base=e.slice(),layers=2;
 // Offset and height are anatomical surface coordinates. The ear flares
 // behind the cheek, narrows at the inferior lobe and curves at the edge.
 const outline=[[.01,.08], [.08,.16],[.18,.20],[.29,.16],[.35,.05],[.33,-.10],[.24,-.24],[.13,-.29],[.045,-.23],[0,-.11]];
 const sample=t=>{let i=Math.floor(t*outline.length),f=t*outline.length-i,a=outline[i%outline.length],c=outline[(i+1)%outline.length];return a.map((x,k)=>x+(c[k]-x)*f)};
 for(let layer=0;layer<layers;layer++)for(let r=0;r<=R;r++)for(let i=0;i<N;i++){
  let a=sample(i/N),q=Math.max(.025,r/R),x=a[0]*q*m.ear,y=a[1]*q*m.ear,z=-.05*q-.07*Math.sin(Math.PI*q/2)*Math.abs(a[0])+(layer?.006:-.006);
  b.vertex(p,[base[0]+s*x*h,base[1]+y*h,base[2]+z*h],[0,0,layer?1:-1],head)
 }
 const S=(R+1)*N;for(let layer=0;layer<2;layer++)for(let r=0;r<R;r++)for(let i=0;i<N;i++){let a=layer*S+r*N+i,c=layer*S+r*N+(i+1)%N,d=c+N,e=a+N;p.indices.push(...(layer?[a,c,d,a,d,e]:[a,d,c,a,e,d]))}
 for(let r of [0,R])for(let i=0;i<N;i++){let a=r*N+i,c=r*N+(i+1)%N;p.indices.push(a,c,a+S,c,c+S,a+S)}
 return p
}
function curvedChain(b,name,pts,radii,js,color){
 let rings=[];for(let i=0;i<pts.length-1;i++){let a=pts[Math.max(0,i-1)],p=pts[i],q=pts[i+1],d=pts[Math.min(pts.length-1,i+2)];for(let t of [0,.25,.5,.75]){let t2=t*t,t3=t2*t,v=p.map((x,k)=>.5*((2*x)+(-a[k]+q[k])*t+(2*a[k]-5*x+4*q[k]-d[k])*t2+(-a[k]+3*x-3*q[k]+d[k])*t3)),r=radii[i]+(radii[i+1]-radii[i])*t;rings.push({p:v,r:[r,r*.88],j:js[i],k:js[i+1],w:1-t})}}
 rings.push({p:pts.at(-1),r:[radii.at(-1),radii.at(-1)*.88],j:js.at(-1)});return b.loft(name,rings,color)
}

export function animal(b,type,human){
 const m=b.spec.morphology,living=b.spec.anatomy==='v4'&&type!=='dog',advanced=['v3','v4'].includes(b.spec.anatomy)&&type!=='dog',t=structuredClone(animalTemplates[type]),h=m.height,w=m.build*b.profile.width,c=type,p=(v)=>[v[0]*h*w,v[1]*h,v[2]*h],J=(n,pa,v,r,a=[1,0,0],l=80)=>b.joint(n,pa,p(v),r,a,l);
 if(advanced){let n=t.neck[0];for(let pts of [t.neck,t.head])for(let v of pts){v[1]=n[1]+(v[1]-n[1])*m.neck;v[2]=n[2]+(v[2]-n[2])*m.neck}for(let v of t.head){v[2]=t.head[0][2]+(v[2]-t.head[0][2])*m.muzzle}for(let v of [t.ear,t.eye]){v[1]=n[1]+(v[1]-n[1])*m.neck;v[2]=n[2]+(v[2]-n[2])*m.neck}for(let v of t.body){v[3]*=m.chest;v[4]*=m.chest}for(let pts of [t.fore,t.hind])for(let i=0;i<pts.length-1;i++)pts[i][1]=.065+(pts[i][1]-.065)*m.limb;for(let v of t.tail){v[1]=t.tail[0][1]+(v[1]-t.tail[0][1])*m.tail;v[2]=t.tail[0][2]+(v[2]-t.tail[0][2])*m.tail}}
 const root=J('body',-1,[0,.76,-.16],'pelvis'),ch=J('chest',root,[0,.80,.25],'spine',[1,0,0],22),neck=J('neck',ch,t.neck[1],'neck',[1,0,0],55),head=J('head',neck,t.head[0],'head',[1,0,0],45);
 if(advanced){
   // One continuous thorax-to-poll loft: measured widths stay large through
   // the withers and taper through neck/jaw. Distinct cross-sections per species.
   if(living){ // muscle cross-section landmarks and non-elliptic transition
     if(type==='horse'){t.body.splice(1,0,[0,.78,-.51,.155,.19]);t.body.splice(4,0,[0,.78,-.02,.255,.295]);t.body.at(-2)[3]*=1.13;t.body.at(-2)[4]*=1.10}
     else{t.body.splice(1,0,[0,.76,-.50,.235,.27]);t.body.at(-2)[3]*=1.08;t.body.at(-2)[4]*=1.10}
   }
   let rings=t.body.slice(0,-1).map((v,i)=>({p:p(v.slice(0,3)),r:[v[3]*h*w,v[4]*h],j:i<2?root:ch,k:root,w:i===2?.65:1}));
   let n=t.neck;let neckr=type==='horse'?[[.19,.25],[.14,.20],[.087,.12],[.073,.09]]:[[.26,.27],[.22,.23],[.19,.21],[.15,.18]];
   for(let i=1;i<n.length-1;i++)rings.push({p:p(n[i]),r:neckr[i].map((v,k)=>v*h*(k===0?w:1)),j:i===1?ch:neck,k:neck,w:i===1?.42:1});
   let first=t.head[0];rings.push({p:p(first),r:t.headR[0].map(v=>v*h*m.head),j:neck,k:head,w:.34});
   for(let i=1;i<t.head.length;i++)rings.push({p:p(t.head[i]),r:t.headR[i].map(v=>v*h*m.head),j:head});
   b.loft('thorax neck and head',rings,c);
 }else{
 b.loft('barrel',t.body.map((v,i)=>({p:p(v.slice(0,3)),r:[v[3]*h*w,v[4]*h],j:i<2?root:ch,k:root,w:i===2?.65:1})),c);
 b.limb('neck',t.neck.map(p),t.neckR.map(r=>r*h),[ch,neck,neck,head],c);
 b.loft('head',t.head.map((v,i)=>({p:p(v),r:t.headR[i].map(r=>r*h*m.head),j:head})),c);
 }
 for(let s of [-1,1]){
  let e=[s*t.ear[0],t.ear[1],t.ear[2]],eye=[s*t.eye[0],t.eye[1],t.eye[2]];
  if(type==='elephant'&&living){elephantEar(b,s,p(e),h,m,head,c)}else if(type==='elephant'){b.egg('ear'+s,p(e),[.067*h,.235*h*m.ear,.17*h*m.ear],c,head);b.egg('ear inner'+s,p([e[0]+s*.022,e[1]-.015,e[2]+.017]),[.045*h,.19*h*m.ear,.13*h*m.ear],[.31,.30,.29],head)}
  else b.loft('ear'+s,[{p:p([e[0],e[1]-.06,e[2]]),r:[.038*h,.028*h],j:head},{p:p(e),r:[.027*h,.022*h],j:head},{p:p([e[0]+s*.018,e[1]+(type==='horse'?.10:.045),e[2]-.015]),r:[.002*h,.003*h],j:head}],c);
  b.egg('eye'+s,p(eye),[.012*h,.012*h,.015*h],'dark',head);
  if(type==='horse'||type==='dog'){let a=t.head.at(-1);b.egg('nostril'+s,p([s*.04,a[1]+.02,a[2]+.011]),[.016*h,.011*h,.009*h],'dark',head)}
  if(type==='elephant'){let pts=[[s*.11,.86,.76],[s*.15,.70,.91],[s*.17,.70,1.04],[s*.17,.78,1.12]];if(advanced)pts=pts.map((v,i)=>i===0?v:v.map((x,k)=>pts[0][k]+(x-pts[0][k])*m.tusk));(living?curvedChain:b.limb.bind(b))(...(living?[b,'tusk'+s,pts.map(p),[.035,.027,.016,.002].map(r=>r*h),pts.map(()=>head),'ivory']:['tusk'+s,pts.map(p),[.035,.027,.016,.002].map(r=>r*h),pts.map(()=>head),'ivory']))}
  for(let front of [true,false]){let name=(front?'fore':'hind')+(s<0?'L':'R'),pts=(front?t.fore:t.hind).map(v=>[v[0]*s,v[1],v[2]]),r=(front?t.foreR:t.hindR).map(r=>r*h*Math.sqrt(w)),roles=['leg.upper','leg.lower','leg.distal','leg.pastern','foot'],js=[],parent=front?ch:root;
   for(let i=0;i<pts.length;i++){parent=J(name+'-'+(front?['scapula','elbow','carpus','fetlock','hoof']:['hip','stifle','hock','fetlock','hoof'])[i],parent,pts[i],roles[i],[1,0,0],[75,115,90,45,40][i]);js.push(parent)}
   if(living){let start=pts[0],outer=[start[0]*.52,start[1]+.085,start[2]-(front?.045:.035)],pts2=[p(outer),...pts.map(p)],r2=r.map((v,i)=>v*(type==='horse'?[1.22,1.22,1.30,1.34,1.22][i]:[1.16,1.10,1.09,1.04,1.06][i]));curvedChain(b,name,pts2,[r2[0]*1.06,...r2],[front?ch:root,...js],c)}else if(advanced){let start=pts[0],next=pts[1],outer=[start[0]*.71,start[1]+.052,start[2]-.018];let limbPts=[p(outer),...pts.map(p)];b.limb(name,limbPts,[r[0]*.87,...r],[front?ch:root,...js],c)}else b.limb(name,pts.map(p),r,js,c);let f=pts.at(-1);if(living)hoofSurface(b,name+'-sole',p(f),h,w,type,parent,type==='elephant'?c:'dark');else b.egg(name+'-sole',p(f),t.hoof.map(v=>v*h),type==='elephant'?c:'dark',parent);b.contacts.push({joint:parent,role:'sole',local:[0,-(living?(type==='horse'?.044:.065):t.hoof[1])*h,living?.018*h:0],phase:({foreL:.25,foreR:.75,hindL:0,hindR:.5})[name]})
  }
 }
 let tail=[],pa=root;for(let i=0;i<t.tail.length;i++){pa=J('tail-'+i,pa,t.tail[i],'tail',[1,0,0],55);tail.push(pa)}b.limb('tail',t.tail.map(p),t.tailR.map(r=>r*h),tail,type==='horse'?'hair':c);
 if(type==='horse'){let pts=t.neck.map(v=>[0,v[1]+.09,v[2]-.075]);b.limb('mane',pts.map(p),[.065,.065,.048,.015].map(r=>r*h),[ch,neck,neck,head],'hair');b.egg('forelock',p([0,1.30,.75]),[.06*h,.075*h,.06*h],'hair',head)}
 if(type==='elephant'){let pts=[[0,.86,.76],[0,.67,.87],[0,.46,.92],[0,.25,.97],[0,.31,1.10]],js=[],par=head;if(advanced){let anchor=t.head.at(-1);pts=pts.map((v,i)=>i===0?[anchor[0],anchor[1]+.02,anchor[2]-.02]:[v[0],anchor[1]+(v[1]-.86)*m.trunk,anchor[2]+(v[2]-.76)*m.trunk])}for(let i=0;i<pts.length;i++){par=J('trunk-'+i,par,pts[i],'trunk',[1,0,0],55);js.push(par)}living?curvedChain(b,'trunk',pts.map(p),[.101,.081,.057,.039,.027].map(r=>r*h),js,c):b.limb('trunk',pts.map(p),[.091,.077,.057,.036,.025].map(r=>r*h),js,c)}
 b.components.push({name:type,family:type==='elephant'?'specialized':'quadruped',root,template:type+(living?'-v4':advanced?'-v3':'-v2')});
 if(!t.seat||b.spec.composite===false)return;
 let seat=J('saddle',root,t.seat,'mount',[1,0,0],10);b.socket('seat',seat,p(t.seat),'riderSeat');b.egg('saddle blanket',p([0,t.seat[1]-.06,t.seat[2]]),[.26*h,.045*h,.28*h],type==='horse'?'leather':'red',seat);
 if(type==='horse')human(b,'rider/',p(t.seat),seat,1.72,'mail',true);
 else {b.loft('howdah floor',[{p:p([0,t.seat[1]-.04,0]),r:[.24*h,.24*h],j:seat},{p:p([0,t.seat[1],0]),r:[.24*h,.24*h],j:seat}],'wood');for(let s of [-1,1])for(let z of [-.23,.23])b.bar('howdah rail '+s+z,p([s*.23,t.seat[1],z]),p([s*.23,t.seat[1]+.20,z]),.022*h,'wood',seat);human(b,'crew/',p([0,t.seat[1],-.09]),seat,1.58,'roman',false)}
}

export function avian(b){
 const h=b.spec.morphology.height,p=v=>v.map(x=>x*h),J=(n,pa,v,r,ax=[1,0,0],l=80)=>b.joint(n,pa,p(v),r,ax,l);
 const root=J('body',-1,[0,.51,0],'pelvis'),ch=J('sternum',root,[0,.58,.17],'spine'),neck=J('neck',ch,[0,.79,.30],'neck'),head=J('head',neck,[0,.93,.38],'head',[0,1,0],80);
 b.loft('body',[[-.40,.49,.04,.07],[-.24,.55,.20,.22],[0,.57,.26,.28],[.25,.65,.19,.23],[.36,.72,.07,.10]].map((v,i)=>({p:p([0,v[1],v[0]]),r:[v[2]*h,v[3]*h],j:i<2?root:ch})),'feather');
 b.limb('neck',[[0,.69,.23],[0,.81,.32],[0,.92,.37]].map(p),[.12,.075,.08].map(x=>x*h),[ch,neck,head],'feather');b.egg('head',p([0,.96,.40]),[.115*h,.115*h,.14*h],'feather',head);b.bar('beak',p([0,.94,.51]),p([0,.90,.68]),.05*h,'bronze',head,.004*h);
 for(let s of [-1,1]){const tag=s<0?'L':'R',a=J('wing-'+tag,ch,[s*.19,.66,.12],'wing',[0,0,1],85),e=J('wing-elbow-'+tag,a,[s*.49,.63,-.03],'wing.elbow',[0,1,0],95),w=J('wing-wrist-'+tag,e,[s*.78,.60,.01],'wing.tip',[0,0,1],70);
 b.limb('wing core '+tag,[[s*.17,.66,.13],[s*.49,.63,-.03],[s*.78,.60,.01],[s*1.04,.57,-.20]].map(p),[.125,.105,.067,.012].map(x=>x*h),[a,e,w,w],'feather');
 for(let i=0;i<5;i++){let x=.34+i*.155,base=p([s*x,.62,-.035]),end=p([s*(x+.15),.55,-.48+i*.025]);b.loft('flight feather '+tag+i,[{p:base,r:[.038*h,.016*h],j:i<2?e:w},{p:end,r:[.006*h,.004*h],j:i<2?e:w}],'feather',6)}
 let hip=J('leg-'+tag,root,[s*.13,.50,-.04],'leg.upper'),k=J('knee-'+tag,hip,[s*.13,.32,.07],'leg.lower'),f=J('foot-'+tag,k,[s*.13,.055,.03],'foot');b.limb('leg '+tag,[[s*.13,.50,-.04],[s*.13,.32,.07],[s*.13,.055,.03]].map(p),[.06,.027,.018].map(x=>x*h),[hip,k,f],'bronze');for(let i=-1;i<=1;i++)b.bar('toe '+tag+i,p([s*.13,.045,.03]),p([s*.13+i*.038,.025,.15]),.014*h,'bronze',f,.006*h);b.contacts.push({joint:f,role:'sole',local:[0,-.055*h,.04*h],phase:s<0?0:.5});b.egg('eye '+tag,p([s*.102,.985,.45]),[.015*h,.017*h,.015*h],'dark',head)}
 const tail=J('tail',root,[0,.51,-.32],'tail');for(let i=-2;i<=2;i++)b.loft('tail feather '+i,[{p:p([i*.022,.52,-.31]),r:[.04*h,.017*h],j:tail},{p:p([i*.082,.48,-.67]),r:[.015*h,.007*h],j:tail}],'feather',6);
 b.components.push({name:'bird',family:'avian',root,template:'avian-v2'})
}
