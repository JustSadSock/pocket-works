// Species-specific anatomical landmark templates. Local units: nominal height.
export const animalTemplates=Object.freeze({
 horse:{body:[[0,.76,-.58,.08,.10],[0,.78,-.43,.21,.24],[0,.77,-.18,.25,.29],[0,.77,.16,.23,.27],[0,.81,.38,.18,.23],[0,.90,.43,.10,.14]],neck:[[0,.84,.28],[0,1.02,.43],[0,1.20,.64],[0,1.23,.72]],neckR:[.18,.15,.095,.080],head:[[0,1.24,.66],[0,1.19,.79],[0,1.07,.91],[0,1.04,1.00]],headR:[[.090,.12],[.102,.125],[.064,.071],[.055,.045]],fore:[[.14,.88,.28],[.15,.63,.38],[.15,.40,.33],[.15,.14,.35],[.15,.045,.42]],hind:[[.16,.83,-.39],[.17,.65,-.18],[.16,.40,-.47],[.16,.14,-.39],[.16,.045,-.31]],foreR:[.11,.071,.043,.024,.029],hindR:[.15,.11,.049,.025,.032],ear:[.065,1.36,.70],eye:[.085,1.22,.79],hoof:[.046,.05,.071],tail:[[0,.90,-.52],[0,.70,-.73],[0,.38,-.78],[0,.19,-.75]],tailR:[.050,.045,.035,.008],seat:[0,1.04,-.05]},
 dog:{body:[[0,.60,-.57,.04,.08],[0,.64,-.40,.14,.18],[0,.64,-.12,.18,.21],[0,.68,.21,.20,.26],[0,.70,.40,.12,.16]],neck:[[0,.70,.26],[0,.83,.43],[0,.94,.54],[0,.96,.60]],neckR:[.14,.12,.09,.075],head:[[0,.96,.52],[0,.96,.65],[0,.90,.81],[0,.89,.89]],headR:[[.09,.11],[.115,.12],[.066,.064],[.055,.045]],fore:[[.14,.75,.28],[.15,.48,.36],[.15,.27,.29],[.15,.12,.30],[.15,.045,.38]],hind:[[.15,.69,-.40],[.15,.48,-.22],[.15,.24,-.49],[.15,.12,-.40],[.15,.045,-.32]],foreR:[.088,.065,.037,.029,.034],hindR:[.11,.077,.042,.028,.034],ear:[.10,1.08,.57],eye:[.10,.98,.69],hoof:[.055,.045,.08],tail:[[0,.68,-.48],[0,.75,-.69],[0,.90,-.80],[0,1.0,-.79]],tailR:[.04,.034,.022,.007]},
 elephant:{body:[[0,.72,-.57,.12,.18],[0,.74,-.43,.28,.29],[0,.74,-.10,.33,.32],[0,.75,.22,.31,.32],[0,.78,.43,.21,.23]],neck:[[0,.79,.30],[0,.88,.43],[0,.91,.54],[0,.93,.64]],neckR:[.23,.21,.18,.14],head:[[0,.93,.51],[0,.98,.63],[0,.91,.75],[0,.81,.79]],headR:[[.15,.19],[.19,.21],[.155,.16],[.10,.09]],fore:[[.19,.74,.31],[.19,.54,.34],[.19,.35,.31],[.19,.16,.33],[.19,.065,.36]],hind:[[.21,.72,-.37],[.21,.53,-.29],[.21,.35,-.40],[.21,.16,-.38],[.21,.065,-.34]],foreR:[.14,.12,.095,.081,.09],hindR:[.16,.13,.10,.084,.09],ear:[.21,.94,.60],eye:[.16,.96,.73],hoof:[.105,.065,.12],tail:[[0,.81,-.52],[0,.55,-.65],[0,.29,-.66],[0,.23,-.71]],tailR:[.032,.022,.016,.012],seat:[0,1.10,-.02]}
});
export function animal(b,type,human){
 const t=animalTemplates[type],m=b.spec.morphology,h=m.height,w=m.build*b.profile.width,c=type,p=(v)=>[v[0]*h*w,v[1]*h,v[2]*h],J=(n,pa,v,r,a=[1,0,0],l=80)=>b.joint(n,pa,p(v),r,a,l);
 const root=J('body',-1,[0,.76,-.16],'pelvis'),ch=J('chest',root,[0,.80,.25],'spine',[1,0,0],22),neck=J('neck',ch,t.neck[1],'neck',[1,0,0],55),head=J('head',neck,t.head[0],'head',[1,0,0],45);
 b.loft('barrel',t.body.map((v,i)=>({p:p(v.slice(0,3)),r:[v[4]*h,v[3]*h*w],j:i<2?root:ch,k:root,w:i===2?.65:1})),c);
 b.limb('neck',t.neck.map(p),t.neckR.map(r=>r*h),[ch,neck,neck,head],c);
 b.loft('head',t.head.map((v,i)=>({p:p(v),r:t.headR[i].map(r=>r*h*m.head),j:head})),c);
 for(let s of [-1,1]){
  let e=[s*t.ear[0],t.ear[1],t.ear[2]],eye=[s*t.eye[0],t.eye[1],t.eye[2]];
  if(type==='elephant'){b.egg('ear'+s,p(e),[.067*h,.235*h,.17*h],c,head);b.egg('ear inner'+s,p([e[0]+s*.022,e[1]-.015,e[2]+.017]),[.045*h,.19*h,.13*h],[.31,.30,.29],head)}
  else b.loft('ear'+s,[{p:p([e[0],e[1]-.06,e[2]]),r:[.038*h,.028*h],j:head},{p:p(e),r:[.027*h,.022*h],j:head},{p:p([e[0]+s*.018,e[1]+(type==='horse'?.10:.045),e[2]-.015]),r:[.002*h,.003*h],j:head}],c);
  b.egg('eye'+s,p(eye),[.012*h,.012*h,.015*h],'dark',head);
  if(type==='horse'||type==='dog'){let a=t.head.at(-1);b.egg('nostril'+s,p([s*.04,a[1]+.02,a[2]+.011]),[.016*h,.011*h,.009*h],'dark',head)}
  if(type==='elephant'){let pts=[[s*.11,.86,.76],[s*.15,.70,.91],[s*.17,.70,1.04],[s*.17,.78,1.12]];b.limb('tusk'+s,pts.map(p),[.035,.027,.016,.002].map(r=>r*h),pts.map(()=>head),'ivory')}
  for(let front of [true,false]){let name=(front?'fore':'hind')+(s<0?'L':'R'),pts=(front?t.fore:t.hind).map(v=>[v[0]*s,v[1],v[2]]),r=(front?t.foreR:t.hindR).map(r=>r*h*Math.sqrt(w)),roles=['leg.upper','leg.lower','leg.distal','leg.pastern','foot'],js=[],parent=front?ch:root;
   for(let i=0;i<pts.length;i++){parent=J(name+'-'+(front?['scapula','elbow','carpus','fetlock','hoof']:['hip','stifle','hock','fetlock','hoof'])[i],parent,pts[i],roles[i],[1,0,0],[75,115,90,45,40][i]);js.push(parent)}
   b.limb(name,pts.map(p),r,js,c);let f=pts.at(-1);b.egg(name+'-sole',p(f),t.hoof.map(v=>v*h),type==='elephant'?c:'dark',parent);b.contacts.push({joint:parent,role:'sole',local:[0,-t.hoof[1]*h,0],phase:({foreL:.25,foreR:.75,hindL:0,hindR:.5})[name]})
  }
 }
 let tail=[],pa=root;for(let i=0;i<t.tail.length;i++){pa=J('tail-'+i,pa,t.tail[i],'tail',[1,0,0],55);tail.push(pa)}b.limb('tail',t.tail.map(p),t.tailR.map(r=>r*h),tail,type==='horse'?'hair':c);
 if(type==='horse'){let pts=t.neck.map(v=>[0,v[1]+.09,v[2]-.075]);b.limb('mane',pts.map(p),[.065,.065,.048,.015].map(r=>r*h),[ch,neck,neck,head],'hair');b.egg('forelock',p([0,1.30,.75]),[.06*h,.075*h,.06*h],'hair',head)}
 if(type==='elephant'){let pts=[[0,.86,.76],[0,.67,.87],[0,.46,.92],[0,.25,.97],[0,.31,1.10]],js=[],par=head;for(let i=0;i<pts.length;i++){par=J('trunk-'+i,par,pts[i],'trunk',[1,0,0],55);js.push(par)}b.limb('trunk',pts.map(p),[.091,.077,.057,.036,.025].map(r=>r*h),js,c)}
 b.components.push({name:type,family:type==='elephant'?'specialized':'quadruped',root,template:type+'-v2'});
 if(!t.seat||b.spec.composite===false)return;
 let seat=J('saddle',root,t.seat,'mount',[1,0,0],10);b.socket('seat',seat,p(t.seat),'riderSeat');b.egg('saddle blanket',p([0,t.seat[1]-.06,t.seat[2]]),[.26*h,.045*h,.28*h],type==='horse'?'leather':'red',seat);
 if(type==='horse')human(b,'rider/',p(t.seat),seat,1.72,'mail',true);
 else {b.loft('howdah floor',[{p:p([0,t.seat[1]-.04,0]),r:[.24*h,.24*h],j:seat},{p:p([0,t.seat[1],0]),r:[.24*h,.24*h],j:seat}],'wood');for(let s of [-1,1])for(let z of [-.23,.23])b.bar('howdah rail '+s+z,p([s*.23,t.seat[1],z]),p([s*.23,t.seat[1]+.20,z]),.022*h,'wood',seat);human(b,'crew/',p([0,t.seat[1],-.09]),seat,1.58,'roman',false)}
}
