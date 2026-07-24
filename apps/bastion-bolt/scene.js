import {
  Node, boxGeometry, cylinderGeometry, coneGeometry, sphereGeometry, planeGeometry, wedgeGeometry,
  TAU, add3, sub3, mul3, len3,
} from './engine.js';

export function createSiegeScene() {
  const GEO = {
    box: boxGeometry(), cyl10: cylinderGeometry(10), cyl14: cylinderGeometry(14), cone: coneGeometry(12), sphere: sphereGeometry(7,10), wedge: wedgeGeometry(),
    ground: planeGeometry(190, 30, (x,z) => {
      const trench = -Math.exp(-((x+4)*(x+4))/270 - ((z+24)*(z+24))/450) * 1.25;
      return Math.sin(x*.18)*.18 + Math.cos(z*.13)*.14 + Math.sin((x+z)*.08)*.16 + trench;
    }),
  };
  const root = new Node({name:'root'});
  const world = new Node({name:'world'}); root.add(world);
  const castle = new Node({name:'castle'}); world.add(castle);
  const ballista = new Node({name:'ballista'}); world.add(ballista);
  const effects = new Node({name:'effects'}); world.add(effects);

  const COLORS = {
    stone:[.43,.42,.37], stoneLight:[.52,.50,.43], stoneDark:[.27,.28,.25], mortar:[.61,.57,.48],
    wood:[.31,.18,.095], woodLight:[.48,.29,.14], woodDark:[.16,.095,.055], metal:[.32,.33,.31], rope:[.47,.36,.22],
    ground:[.24,.235,.18], earth:[.31,.245,.16], cloth:[.38,.075,.045], ash:[.19,.18,.16],
  };

  function node(mesh, color, position, scale=[1,1,1], rotation=[0,0,0], parent=world, extra={}) {
    return parent.add(new Node({mesh,color,position,scale,rotation,...extra}));
  }
  function box(color,p,s,r=[0,0,0],parent=world,extra={}){ return node(GEO.box,color,p,s,r,parent,extra); }
  function cylinder(color,p,s,r=[0,0,0],parent=world,extra={}){ return node(GEO.cyl10,color,p,s,r,parent,extra); }
  function sphere(color,p,s,r=[0,0,0],parent=world,extra={}){ return node(GEO.sphere,color,p,s,r,parent,extra); }
  function beamBetween(a,b,thickness,color,parent=world,extra={}){
    const d=sub3(b,a), l=len3(d), mid=mul3(add3(a,b),.5), yaw=Math.atan2(d[0],d[2]), pitch=-Math.atan2(d[1],Math.hypot(d[0],d[2]));
    return box(color,mid,[thickness,thickness,l],[pitch,yaw,0],parent,extra);
  }
  function seeded(seed){ let s=seed>>>0; return()=>((s=Math.imul(1664525,s)+1013904223>>>0)/4294967296); }
  const rand = seeded(290744);

  node(GEO.ground, COLORS.ground, [0,-.36,-20], [1,1,1], [0,0,0], world, {roughness:1});
  for(let i=0;i<56;i++){
    const x=(rand()-.5)*95,z=20-rand()*125,s=.4+rand()*1.8;
    if(Math.abs(x)<8&&z>-2) continue;
    sphere(i%4===0?COLORS.ash:COLORS.earth,[x,-.05+rand()*.15,z],[s,.14+rand()*.25,s*(.7+rand()*.5)],[0,rand()*TAU,0],world,{roughness:1});
  }
  for(let i=0;i<12;i++){
    const x=(i-5.5)*22+(rand()-.5)*8,z=-135-rand()*32,h=18+rand()*28;
    node(GEO.cone,[.31,.32,.29],[x,h*.46,z],[18+rand()*14,h,18+rand()*10],[0,rand()*TAU,0],world,{roughness:1});
  }
  for(const x of [-31,-24,28,35]){
    node(GEO.wedge,[.30,.22,.14],[x,1.35,-8-rand()*18],[5.2,2.9,6.5],[0,rand()*.4-.2,0],world);
    box(COLORS.woodDark,[x,2.2,-10],[.15,2.8,.15],[0,0,.1],world);
  }
  for(let i=0;i<18;i++){
    const x=-43+i*5.1,z=-50+Math.sin(i*.8)*2.5;
    cylinder(COLORS.woodDark,[x,2.1,z],[.45,4.2,.45],[0,0,0],world);
    node(GEO.cone,COLORS.woodLight,[x,4.45,z],[.65,1.1,.65],[0,0,0],world);
  }

  const targetDefs = [];
  function target(def){ def.health=def.maxHealth;def.destroyed=false;def.damageMarks=[];targetDefs.push(def);return def; }
  function createBattlements(parent,xStart,xEnd,y,z,step=2.15){ for(let x=xStart;x<=xEnd+.01;x+=step) box(COLORS.stoneLight,[x,y,z],[1.25,1.55,1.55],[0,0,0],parent,{roughness:1}); }
  function stoneCourse(parent,xStart,xEnd,yStart,yEnd,z,depth=3){
    for(let y=yStart;y<yEnd;y+=1.35){const offset=(Math.round(y*10)%2)*.85;for(let x=xStart-offset;x<xEnd;x+=2.4){const w=2.18+(rand()-.5)*.18;box(rand()>.25?COLORS.stone:COLORS.stoneLight,[x+w*.5,y+.58,z+(rand()-.5)*.1],[w,1.08,depth],[0,0,(rand()-.5)*.018],parent,{roughness:1});}}
  }
  function makeWallSegment(name,label,center,width,height,maxHealth,material='stone'){
    const g=new Node({name});castle.add(g);stoneCourse(g,-width/2,width/2,0,height,0,3.4);createBattlements(g,-width/2+.7,width/2-.7,height+.75,0,2.55);g.position=[center[0],center[1]-height/2,center[2]];
    return target({id:name,label,center,size:[width,height+2,4],maxHealth,material,node:g,basePosition:[...g.position]});
  }
  function makeTower(name,label,x,z,maxHealth){
    const g=new Node({name});castle.add(g);const h=20,r=5.4;
    cylinder(COLORS.stone,[0,h/2,0],[r*2,h,r*2],[0,0,0],g,{roughness:1});
    cylinder(COLORS.stoneLight,[0,h+.45,0],[r*2.18,1.2,r*2.18],[0,0,0],g,{roughness:1});
    for(let i=0;i<10;i++){const a=i/10*TAU;box(COLORS.stoneLight,[Math.cos(a)*5.05,h+1.45,Math.sin(a)*5.05],[1.5,1.9,1.65],[0,-a,0],g,{roughness:1});}
    for(let i=0;i<3;i++){const a=(i/3)*TAU+.3;box(COLORS.stoneDark,[Math.cos(a)*5.28,10+Math.sin(i)*2,Math.sin(a)*5.28],[.45,2.3,1.1],[0,-a,0],g);}
    g.position=[x,0,z];return target({id:name,label,center:[x,10,z],size:[12,23,12],maxHealth,material:'stone',node:g,basePosition:[...g.position]});
  }

  makeWallSegment('wall-left','ЛЕВАЯ СТЕНА',[-10,8,-82],17,15,420);
  makeWallSegment('wall-right','ПРАВАЯ СТЕНА',[10,8,-82],17,15,420);
  makeTower('tower-left','ЛЕВАЯ БАШНЯ',-20,-84,560);
  makeTower('tower-right','ПРАВАЯ БАШНЯ',20,-84,560);

  const gateGroup=new Node({name:'gate'});castle.add(gateGroup);gateGroup.position=[0,0,-80];
  box(COLORS.stoneDark,[0,7,0],[9.8,14,3.9],[0,0,0],gateGroup);
  for(let i=-4;i<=4;i++) box(i%2?COLORS.wood:COLORS.woodLight,[i*.9,5.4,2.05],[.75,10.8,.38],[0,0,0],gateGroup,{roughness:1});
  for(const y of [2.5,5.5,8.5]) box(COLORS.metal,[0,y,2.3],[8.8,.34,.28],[0,0,0],gateGroup,{roughness:.25});
  for(const x of [-3.2,3.2]) for(const y of [2.5,5.5,8.5]) sphere(COLORS.metal,[x,y,2.52],[.28,.28,.18],[0,0,0],gateGroup,{roughness:.25});
  box(COLORS.stoneLight,[0,12.7,0],[12,2.1,4.1],[0,0,0],gateGroup);createBattlements(gateGroup,-4.8,4.8,14.6,0,2.4);
  const gate=target({id:'gate',label:'ГЛАВНЫЕ ВОРОТА',center:[0,5.5,-77.7],size:[9.6,11,2.5],maxHealth:260,material:'wood',node:gateGroup,basePosition:[...gateGroup.position]});

  const palisadeGroup=new Node({name:'palisade'});castle.add(palisadeGroup);palisadeGroup.position=[12,0,-62];
  for(let i=-4;i<=4;i++){cylinder(COLORS.wood,[i*1.05,2.6,0],[.7,5.2,.7],[0,0,.05*Math.sin(i)],palisadeGroup);node(GEO.cone,COLORS.woodLight,[i*1.05,5.55,0],[.78,1.15,.78],[0,0,0],palisadeGroup);}
  for(const y of [1.2,3.3])box(COLORS.woodDark,[0,y,.45],[10,.45,.5],[0,0,0],palisadeGroup);
  target({id:'palisade',label:'ДЕРЕВЯННЫЙ ЗАСЛОН',center:[12,2.8,-61.5],size:[10,6,2],maxHealth:125,material:'wood',node:palisadeGroup,basePosition:[...palisadeGroup.position]});

  box(COLORS.stoneDark,[0,15,-99],[24,25,15],[0,0,0],castle);createBattlements(castle,-10.5,10.5,28.3,-99,3.1);
  for(const x of [-7,7]){box(COLORS.stoneLight,[x,18,-91.3],[2.5,5,.5],[0,0,0],castle);}
  const flags=[];
  for(const [x,z,h] of [[-20,-84,30],[20,-84,30],[0,-99,34]]){
    box(COLORS.woodDark,[x,h-5,z],[.18,10,.18],[0,0,0],castle);
    const flag=box(COLORS.cloth,[x+1.25,h-1.8,z],[2.5,1.35,.08],[0,0,0],castle,{roughness:.7});flag.userData.baseX=x+1.25;flag.userData.phase=rand()*TAU;flags.push(flag);
  }

  ballista.position=[0,.15,19];
  const baseFrame=new Node({name:'base-frame'});ballista.add(baseFrame);
  box(COLORS.woodDark,[0,.65,0],[7.4,.75,4.8],[0,0,0],baseFrame);
  box(COLORS.wood,[0,1.28,0],[1.65,1.15,7.7],[0,0,0],baseFrame);
  for(const x of [-3.1,3.1]) for(const z of [-1.45,1.45]) cylinder(COLORS.woodLight,[x,.65,z],[2.05,.7,2.05],[0,0,Math.PI/2],baseFrame,{roughness:1});
  for(const x of [-2.45,2.45]){beamBetween([x,1.2,1.6],[x,3.8,-1.5],.52,COLORS.wood,baseFrame);beamBetween([x,1.2,-1.6],[x,3.8,1.1],.52,COLORS.wood,baseFrame);}
  box(COLORS.metal,[0,3.55,.3],[6.1,.45,.55],[0,0,0],baseFrame,{roughness:.25});
  const turret=new Node({name:'turret'});ballista.add(turret);turret.position=[0,3.8,-.6];
  box(COLORS.woodLight,[0,0,-1.0],[1.2,.7,9.2],[0,0,0],turret);
  box(COLORS.metal,[0,.05,-.8],[.32,.85,8.5],[0,0,0],turret,{roughness:.25});
  beamBetween([-0.45,0,-.8],[-5.9,.25,-1.3],.68,COLORS.woodLight,turret);
  beamBetween([.45,0,-.8],[5.9,.25,-1.3],.68,COLORS.woodLight,turret);
  for(const x of [-5.9,5.9]) cylinder(COLORS.metal,[x,.25,-1.3],[.72,.48,.72],[0,0,0],turret,{roughness:.2});
  const stringLeft=beamBetween([-5.9,.25,-1.3],[0,.2,2.55],.08,COLORS.rope,turret);
  const stringRight=beamBetween([5.9,.25,-1.3],[0,.2,2.55],.08,COLORS.rope,turret);
  const loadedProjectile=new Node({name:'loaded-projectile'});turret.add(loadedProjectile);
  const loadedShaft=box(COLORS.woodDark,[0,.42,-1.7],[.22,.22,7.7],[0,0,0],loadedProjectile);
  const loadedTip=node(GEO.cone,COLORS.metal,[0,.42,-6],[.58,1.15,.58],[Math.PI/2,0,0],loadedProjectile,{roughness:.2});
  const winch=cylinder(COLORS.woodLight,[0,-.1,2.15],[1.4,2.1,1.4],[0,0,Math.PI/2],turret);box(COLORS.metal,[0,-.1,2.15],[4.0,.18,.18],[0,0,0],turret,{roughness:.2});

  const particles=[];
  function spawnParticle({position,velocity,color=COLORS.ash,scale=.4,life=1,gravity=-4,alpha=1,emissive=0,kind='dust'}){
    const p=sphere(color,position,[scale,scale,scale],[0,0,0],effects,{alpha,emissive,roughness:1});p.userData={velocity:[...velocity],life,maxLife:life,gravity,kind,baseScale:scale};particles.push(p);return p;
  }
  const smokeColumns=[];
  for(const [x,z] of [[-28,-36],[31,-46],[-6,-101]]) smokeColumns.push({x,z,t:rand()*2});
  const rubble=[];
  const scars=[];
  return {
    GEO, root, world, castle, ballista, effects, COLORS, node, box, cylinder, sphere, beamBetween, rand,
    targetDefs, gate, loadedProjectile, loadedShaft, loadedTip, winch, turret, stringLeft, stringRight,
    particles, smokeColumns, rubble, scars, flags, spawnParticle,
  };
}
