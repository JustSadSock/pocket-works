import {
  Node, boxGeometry, cylinderGeometry, coneGeometry, sphereGeometry, planeGeometry, wedgeGeometry,
  TAU, add3, sub3, mul3, len3,
} from './engine.js';

export function createSiegeScene() {
  const terrainHeight = (x,z) => {
    const road = -Math.exp(-(x*x)/110 - ((z+22)*(z+22))/1050) * .55;
    const trench = -Math.exp(-((x+3)*(x+3))/260 - ((z+33)*(z+33))/330) * 1.15;
    const castleShelf = z < -72 ? .4 : 0;
    return Math.sin(x*.15)*.14 + Math.cos(z*.11)*.17 + Math.sin((x+z)*.055)*.2 + road + trench + castleShelf;
  };

  const GEO = {
    box: boxGeometry(), cyl8: cylinderGeometry(8), cyl12: cylinderGeometry(12), cyl16: cylinderGeometry(16),
    cone: coneGeometry(12), sphere: sphereGeometry(7,10), sphereFine: sphereGeometry(10,14), wedge: wedgeGeometry(),
    ground: planeGeometry(210, 34, terrainHeight),
  };

  const root = new Node({name:'root'});
  const world = root.add(new Node({name:'world'}));
  const castle = world.add(new Node({name:'castle'}));
  const camp = world.add(new Node({name:'camp'}));
  const ballista = world.add(new Node({name:'ballista'}));
  const effects = world.add(new Node({name:'effects'}));

  const COLORS = {
    stone:[.42,.405,.36], stoneLight:[.54,.515,.445], stoneWarm:[.47,.43,.36], stoneDark:[.235,.24,.225], mortar:[.64,.59,.49],
    wood:[.30,.17,.085], woodLight:[.49,.285,.13], woodDry:[.39,.235,.12], woodDark:[.135,.078,.042], metal:[.30,.31,.30], iron:[.19,.205,.205], rope:[.46,.345,.205],
    ground:[.235,.225,.165], earth:[.31,.235,.145], mud:[.19,.17,.12], grass:[.22,.26,.15], cloth:[.39,.065,.035], clothBlue:[.10,.17,.22], ash:[.17,.17,.15],
    water:[.12,.20,.22], fire:[1,.29,.055], ember:[.94,.50,.11], skin:[.42,.28,.20], leather:[.20,.12,.065], shadow:[.055,.052,.045],
  };

  function node(mesh,color,position,scale=[1,1,1],rotation=[0,0,0],parent=world,extra={}) {
    return parent.add(new Node({mesh,color,position,scale,rotation,...extra}));
  }
  const box = (color,p,s,r=[0,0,0],parent=world,extra={}) => node(GEO.box,color,p,s,r,parent,extra);
  const cylinder = (color,p,s,r=[0,0,0],parent=world,extra={}) => node(GEO.cyl12,color,p,s,r,parent,extra);
  const sphere = (color,p,s,r=[0,0,0],parent=world,extra={}) => node(GEO.sphere,color,p,s,r,parent,extra);
  function beamBetween(a,b,thickness,color,parent=world,extra={}) {
    const d=sub3(b,a), l=len3(d), mid=mul3(add3(a,b),.5), yaw=Math.atan2(d[0],d[2]), pitch=-Math.atan2(d[1],Math.hypot(d[0],d[2]));
    return box(color,mid,[thickness,thickness,l],[pitch,yaw,0],parent,extra);
  }
  function seeded(seed){ let s=seed>>>0; return()=>((s=Math.imul(1664525,s)+1013904223>>>0)/4294967296); }
  const rand=seeded(290744);

  const targets=[];
  const colliders=[];
  const props=[];
  const flags=[];
  const smokeColumns=[];
  const flames=[];
  const crew=[];
  const clouds=[];
  const dynamicDebris=[];
  const stuckProjectiles=[];

  function collider(def) {
    const c={ enabled:true, hardness:.5, material:'stone', kind:'solid', side:'enemy', ...def };
    colliders.push(c);
    if(c.target) c.target.colliders.push(c);
    return c;
  }
  function makeTarget(def) {
    const t={ health:def.maxHealth, maxHealth:def.maxHealth, armor:.2, chunks:[], colliders:[], destroyed:false, collapsing:false, burn:0, threshold:1, score:100, ...def };
    targets.push(t); return t;
  }
  function chunk(target,color,p,s,options={}) {
    const n=box(color,p,s,options.rotation||[0,0,0],options.parent||castle,{roughness:options.roughness??1,emissive:options.emissive||0});
    const ch={ node:n, target, basePosition:[...p], baseRotation:[...(options.rotation||[0,0,0])], size:[...s], hp:options.hp||Math.max(12,s[0]*s[1]*8), maxHp:options.hp||Math.max(12,s[0]*s[1]*8), level:options.level||0, column:options.column||0, attached:true, dynamic:false, support:[], mass:options.mass||Math.max(1,s[0]*s[1]*s[2]), material:options.material||target.material, collider:null };
    ch.collider=collider({ shape:'aabb', node:n, size:[...s], target, chunk:ch, material:ch.material, hardness:options.hardness??target.armor, kind:'structure', side:target.side||'enemy' });
    target.chunks.push(ch); return ch;
  }
  function propTarget(def) { const t=makeTarget({...def,optional:true,score:def.score||35}); props.push(t); return t; }
  function addShadow(p,s,parent=world) { return sphere(COLORS.shadow,[p[0],terrainHeight(p[0],p[2])+.035,p[2]],[s[0],.035,s[1]],[0,0,0],parent,{alpha:.34,roughness:1}); }

  node(GEO.ground,COLORS.ground,[0,-.36,-20],[1,1,1],[0,0,0],world,{roughness:1});
  node(GEO.sphereFine,[.92,.70,.40],[-48,47,-142],[10,10,10],[0,0,0],world,{emissive:.62,roughness:.1});
  for(let i=0;i<9;i++) {
    const c=sphere([.58,.56,.50],[-58+i*15,31+rand()*12,-118-rand()*24],[10+rand()*9,2.2+rand()*2.1,4+rand()*4],[0,0,0],world,{alpha:.16,roughness:1});
    c.userData.speed=.18+rand()*.18; clouds.push(c);
  }
  for(let i=0;i<14;i++) {
    const x=(i-6.5)*18+(rand()-.5)*8,z=-143-rand()*28,h=18+rand()*34;
    node(GEO.cone,[.27,.285,.27],[x,h*.47,z],[17+rand()*15,h,16+rand()*12],[0,rand()*TAU,0],world,{roughness:1});
  }
  for(let i=0;i<82;i++) {
    const x=(rand()-.5)*104,z=23-rand()*140,s=.35+rand()*1.5;
    if(Math.abs(x)<7&&z>1) continue;
    sphere(rand()>.7?COLORS.grass:(rand()>.48?COLORS.earth:COLORS.mud),[x,terrainHeight(x,z)+.05,z],[s,.12+rand()*.23,s*(.75+rand()*.55)],[0,rand()*TAU,0],world,{roughness:1});
  }
  for(const x of [-2.25,2.25]) for(let z=18;z>-57;z-=5.2) box(COLORS.mud,[x,terrainHeight(x,z)+.02,z],[.75,.035,3.8],[0,.03*Math.sin(z),0],world,{roughness:1});

  const water=box(COLORS.water,[0,-.53,-65],[88,.16,10],[0,0,0],world,{alpha:.78,roughness:.18,emissive:.03});
  water.userData.phase=0;
  collider({shape:'aabb',node:water,size:[88,.3,10],material:'water',kind:'water',hardness:0,side:'neutral'});
  const bridgeTarget=propTarget({id:'bridge',label:'ПОДЪЁМНЫЙ МОСТ',material:'wood',maxHealth:115,armor:.45,center:[0,1,-68],size:[9,3,14],score:60});
  for(let i=0;i<9;i++) chunk(bridgeTarget,i%2?COLORS.wood:COLORS.woodDry,[0,terrainHeight(0,-61-i*1.45)+.52,-61-i*1.45],[8.4,.48,1.25],{level:0,column:i,parent:world,hp:24,hardness:.44});
  for(const x of [-4.5,4.5]) beamBetween([x,.55,-59],[x,.9,-74],.18,COLORS.rope,world,{roughness:.8});

  function connectGridSupport(grid) {
    for(let row=1;row<grid.length;row++) for(let col=0;col<grid[row].length;col++) {
      const ch=grid[row][col]; if(!ch) continue;
      for(const d of [-1,0,1]) if(grid[row-1][col+d]) ch.support.push(grid[row-1][col+d]);
    }
  }

  function makeWall(id,label,cx,z,width,height,maxHealth) {
    const target=makeTarget({id,label,material:'stone',maxHealth,armor:.82,center:[cx,height*.52,z+1.75],size:[width,height+2,4.4],score:220});
    const core=box(COLORS.stoneDark,[cx,height*.48,z-1.15],[width*.98,height*.94,1.8],[0,0,0],castle,{roughness:1});
    collider({shape:'aabb',node:core,size:[width*.98,height*.94,1.8],target,material:'stone',hardness:1.05,kind:'structure'});
    const cols=Math.max(4,Math.round(width/3.25)),rows=Math.max(5,Math.round(height/1.85)),cw=width/cols,ch=height/rows,grid=[];
    for(let r=0;r<rows;r++){ grid[r]=[]; for(let c=0;c<cols;c++){
      const wobble=(rand()-.5)*.12, px=cx-width*.5+cw*(c+.5)+(r%2?cw*.12:0), py=ch*(r+.5), pz=z+(rand()-.5)*.12;
      grid[r][c]=chunk(target,rand()>.28?COLORS.stone:COLORS.stoneLight,[px,py,pz],[cw*.94,ch*.88,3.4],{rotation:[0,0,wobble],level:r,column:c,hp:34+rand()*10,hardness:.84});
    }}
    connectGridSupport(grid);
    const crenels=[]; for(let x=cx-width*.5+.85;x<cx+width*.5;x+=2.7) crenels.push(chunk(target,COLORS.stoneLight,[x,height+.78,z],[1.25,1.55,3.5],{level:rows,column:crenels.length,hp:24,hardness:.75}));
    for(const cr of crenels) cr.support.push(...grid[rows-1].filter(Boolean).slice(Math.max(0,cr.column-1),cr.column+2));
    return target;
  }

  function makeTower(id,label,x,z,maxHealth) {
    const h=20,radius=5.6,target=makeTarget({id,label,material:'stone',maxHealth,armor:.9,center:[x,10.5,z+4.3],size:[12.4,23,12.4],score:340});
    const core=cylinder(COLORS.stoneDark,[x,h*.5,z],[radius*1.55,h*.92,radius*1.55],[0,0,0],castle,{roughness:1});
    collider({shape:'sphere',node:core,radius:radius*.78,target,material:'stone',hardness:1.15,kind:'structure'});
    const rings=[],segments=9,levels=7;
    for(let level=0;level<levels;level++){ rings[level]=[]; for(let s=0;s<segments;s++){
      const a=s/segments*TAU+(level%2)*.12,px=x+Math.sin(a)*radius*.83,pz=z+Math.cos(a)*radius*.83,py=1.35+level*2.45;
      const ch=chunk(target,rand()>.3?COLORS.stone:COLORS.stoneLight,[px,py,pz],[2.25,2.05,1.7],{rotation:[0,a,0],level,column:s,hp:42+rand()*12,hardness:.92});
      rings[level][s]=ch; if(level>0) ch.support.push(rings[level-1][s],rings[level-1][(s+segments-1)%segments],rings[level-1][(s+1)%segments]);
    }}
    cylinder(COLORS.stoneLight,[x,h+.4,z],[radius*2.08,1.1,radius*2.08],[0,0,0],castle,{roughness:1});
    for(let s=0;s<segments;s++) { const a=s/segments*TAU,px=x+Math.sin(a)*radius*.92,pz=z+Math.cos(a)*radius*.92; const cr=chunk(target,COLORS.stoneLight,[px,h+1.45,pz],[1.5,1.85,1.65],{rotation:[0,a,0],level:levels,column:s,hp:22,hardness:.78}); cr.support.push(...rings[levels-1].slice(Math.max(0,s-1),s+2)); }
    for(const a of [0,Math.PI*.55,Math.PI*1.45]) box(COLORS.ash,[x+Math.sin(a)*radius*.92,10,z+Math.cos(a)*radius*.92],[.42,2.25,.42],[0,a,0],castle,{roughness:1});
    return target;
  }

  const wallLeft=makeWall('wall-left','ЛЕВАЯ СТЕНА',-11,-84,18,15,310);
  const wallRight=makeWall('wall-right','ПРАВАЯ СТЕНА',11,-84,18,15,310);
  const towerLeft=makeTower('tower-left','ЛЕВАЯ БАШНЯ',-22,-86,285);
  const towerRight=makeTower('tower-right','ПРАВАЯ БАШНЯ',22,-86,285);

  const gatehouse=makeTarget({id:'gatehouse',label:'НАДВРАТНАЯ БАШНЯ',material:'stone',maxHealth:250,armor:.96,center:[0,11,-84.5],size:[13,9,5],score:180,optional:true});
  const gate=makeTarget({id:'gate',label:'ГЛАВНЫЕ ВОРОТА',material:'wood',maxHealth:165,armor:.48,center:[0,5.7,-80.8],size:[10,11.5,2],score:500});
  const gatehouseCore=box(COLORS.stoneDark,[0,7,-84.6],[12.6,14,5],[0,0,0],castle,{roughness:1});
  collider({shape:'aabb',node:gatehouseCore,size:[12.6,14,5],target:gatehouse,material:'stone',hardness:1.08,kind:'structure'});
  for(const [px,py,sx,sy] of [[-5.1,7,2.1,13],[5.1,7,2.1,13],[0,13.2,8.2,2.1]]) chunk(gatehouse,COLORS.stoneWarm,[px,py,-81.7],[sx,sy,1.7],{hp:72,hardness:1.0});
  const gatePlanks=[];
  for(let i=-5;i<=5;i++) gatePlanks.push(chunk(gate,i%2?COLORS.wood:COLORS.woodDry,[i*.86,5.5,-80.9],[.75,10.8,.52],{level:0,column:i+5,hp:28,hardness:.48}));
  for(const y of [2.4,5.5,8.6]) { const brace=chunk(gate,COLORS.iron,[0,y,-80.55],[9.8,.34,.30],{level:0,column:20+y,hp:48,hardness:1.15,material:'metal'}); brace.support.push(...gatePlanks); }
  for(const x of [-3.6,3.6]) for(const y of [2.4,5.5,8.6]) sphere(COLORS.metal,[x,y,-80.35],[.28,.28,.18],[0,0,0],castle,{roughness:.2});
  for(let x=-4.2;x<=4.2;x+=1.4){ box(COLORS.iron,[x,6.2,-79.95],[.18,11.9,.18],[0,0,0],castle,{roughness:.2}); node(GEO.cone,COLORS.iron,[x,.05,-79.95],[.34,.85,.34],[0,0,0],castle,{roughness:.2}); }
  for(const x of [-5.1,5.1]) beamBetween([x,14,-84],[x,10,-80],.11,COLORS.rope,castle,{roughness:.7});

  const keep=makeTarget({id:'keep',label:'ДОНЖОН',material:'stone',maxHealth:430,armor:1,center:[0,18,-105],size:[25,30,17],score:900});
  const keepCore=box(COLORS.stoneDark,[0,15,-107],[25,28,16],[0,0,0],castle,{roughness:1});
  collider({shape:'aabb',node:keepCore,size:[25,28,16],target:keep,material:'stone',hardness:1.22,kind:'structure'});
  const keepGrid=[]; for(let r=0;r<8;r++){ keepGrid[r]=[]; for(let c=0;c<7;c++){
    const cw=3.35,ch=2.75,px=-10.05+c*cw,py=2+r*ch,pz=-98.75;
    keepGrid[r][c]=chunk(keep,rand()>.25?COLORS.stoneWarm:COLORS.stoneLight,[px,py,pz],[3.05,2.45,2.1],{level:r,column:c,hp:58,hardness:1.02});
  }} connectGridSupport(keepGrid);
  for(let x=-10.5;x<=10.5;x+=3) chunk(keep,COLORS.stoneLight,[x,29.1,-101],[1.45,2.1,3.4],{level:9,column:Math.round(x),hp:34,hardness:.86});
  for(const x of [-7,7]) box(COLORS.ash,[x,18,-97.6],[1.0,3.4,.25],[0,0,0],castle,{roughness:1});

  const hoarding=propTarget({id:'hoarding',label:'НАВЕС ЗАЩИТНИКОВ',material:'wood',maxHealth:95,armor:.38,center:[-11.5,17,-79.4],size:[10,5,3],score:90});
  for(let i=0;i<6;i++) chunk(hoarding,COLORS.woodDry,[-16+i*1.8,16.3,-79.5],[1.55,3.2,1.5],{level:0,column:i,hp:20,hardness:.38});
  chunk(hoarding,COLORS.woodDark,[-11.5,18.2,-80.1],[10.5,.65,3.4],{level:1,column:0,hp:32,hardness:.42});
  const crane=propTarget({id:'crane',label:'ВОРОТ ПОДЪЁМНИКА',material:'wood',maxHealth:80,armor:.42,center:[13.2,18,-81],size:[8,10,7],score:75});
  const craneBase=chunk(crane,COLORS.wood,[13.2,14.3,-83],[6,.65,4],{level:0,column:0,hp:32,hardness:.45});
  const craneArm=chunk(crane,COLORS.woodLight,[13.2,19.5,-81],[.65,.65,9],{rotation:[Math.PI/5,0,0],level:1,column:0,hp:28,hardness:.4}); craneArm.support.push(craneBase);
  beamBetween([13.2,19,-77],[13.2,12,-77],.12,COLORS.rope,castle,{roughness:.7});

  function flag(x,y,z,color=COLORS.cloth) { box(COLORS.woodDark,[x,y-2.5,z],[.16,5,.16],[0,0,0],castle); const f=box(color,[x+1.2,y-.45,z],[2.4,1.3,.07],[0,0,0],castle,{roughness:.7}); f.userData.phase=rand()*TAU; flags.push(f); }
  flag(-22,29,-86); flag(22,29,-86); flag(0,34,-105,COLORS.clothBlue);
  function brazier(x,y,z,parent=castle) { cylinder(COLORS.iron,[x,y,z],[1.1,.45,1.1],[0,0,0],parent,{roughness:.22}); for(let i=0;i<3;i++){ const f=sphere(i?COLORS.ember:COLORS.fire,[x+(rand()-.5)*.35,y+.45+rand()*.35,z+(rand()-.5)*.35],[.25,.55,.25],[0,0,0],parent,{emissive:1.1,alpha:.92}); f.userData.phase=rand()*TAU; flames.push(f); } smokeColumns.push({x,z,y:y+.5,t:rand()}); }
  brazier(-17,17,-82); brazier(17,17,-82); brazier(0,30,-101);
  function defender(x,y,z,side=1) { const g=castle.add(new Node({name:'defender',position:[x,y,z]})); cylinder(COLORS.leather,[0,1.15,0],[.65,2.1,.65],[0,0,0],g,{roughness:.8}); sphere(COLORS.skin,[0,2.55,0],[.62,.62,.62],[0,0,0],g,{roughness:.7}); beamBetween([0,1.8,0],[side*.95,1.1,-.4],.12,COLORS.skin,g); beamBetween([0,1.7,0],[-side*.8,1.3,.2],.12,COLORS.skin,g); g.userData.phase=rand()*TAU; crew.push(g); collider({shape:'sphere',node:g,radius:.65,material:'flesh',kind:'defender',hardness:.05,side:'enemy'}); }
  for(const x of [-17,-9,8,16]) defender(x,16.3,-82,x<0?-1:1);

  const siegeTower=propTarget({id:'siege-tower',label:'ЗАХВАЧЕННАЯ ОСАДНАЯ БАШНЯ',material:'wood',maxHealth:135,armor:.46,center:[-35,8,-68],size:[10,17,9],score:110});
  addShadow([-35,0,-68],[6,5]);
  for(const x of [-3.8,3.8]) for(const z of [-3.4,3.4]) chunk(siegeTower,COLORS.woodDark,[-35+x,1,-68+z],[2.2,.8,2.2],{rotation:[0,0,Math.PI/2],level:0,column:x+z,parent:world,hp:24,hardness:.4});
  for(const [x,z] of [[-4,-3],[-4,3],[4,-3],[4,3]]) chunk(siegeTower,COLORS.wood,[-35+x,7.5,-68+z],[.7,14,.7],{level:1,column:x+z,parent:world,hp:30,hardness:.46});
  for(let y=2.5;y<14;y+=3) chunk(siegeTower,COLORS.woodDry,[-35,y,-68],[9,.55,8],{level:Math.round(y),column:0,parent:world,hp:38,hardness:.45});
  node(GEO.wedge,[.28,.18,.11],[-35,15.5,-68],[10,3.5,9],[0,0,0],world,{roughness:.9});
  for(const x of [-26,-13,14,27]) { const ladder=propTarget({id:`ladder-${x}`,label:'ШТУРМОВАЯ ЛЕСТНИЦА',material:'wood',maxHealth:48,armor:.32,center:[x,8,-80],size:[3,17,2],score:35}); for(const dx of [-.8,.8]) chunk(ladder,COLORS.woodDry,[x+dx,8,-79.5],[.26,17,.26],{rotation:[0,0,-.14*Math.sign(x||1)],parent:world,hp:18,hardness:.3}); for(let y=1;y<16;y+=1.7) chunk(ladder,COLORS.woodLight,[x,y,-79.5],[2,.18,.22],{rotation:[0,0,-.14*Math.sign(x||1)],parent:world,hp:10,hardness:.25}); }

  for(const [x,z,rot,color] of [[-30,-8,.16,[.31,.23,.15]],[-23,-16,-.12,[.28,.20,.13]],[28,-11,.1,[.24,.19,.14]],[34,-23,-.16,[.30,.22,.14]]]) {
    node(GEO.wedge,color,[x,1.35,z],[6,3.2,7],[0,rot,0],camp,{roughness:.95});
    collider({shape:'aabb',center:[x,1.35,z],size:[6,3.2,7],material:'cloth',kind:'prop',side:'friendly',hardness:.12}); addShadow([x,0,z],[4.2,4.6],camp);
  }
  const cart=propTarget({id:'supply-cart',label:'ТЕЛЕГА СНАБЖЕНИЯ',material:'wood',maxHealth:85,armor:.38,center:[-12,2,8],size:[9,4,6],score:0,side:'friendly'});
  addShadow([-12,0,8],[5.5,3.5],camp);
  chunk(cart,COLORS.wood,[-12,2.1,8],[8,2.6,4.4],{parent:camp,hp:42,hardness:.42});
  for(const x of [-15.4,-8.6]) for(const z of [6.3,9.7]) chunk(cart,COLORS.woodDark,[x,.95,z],[2.3,.75,2.3],{rotation:[0,0,Math.PI/2],parent:camp,hp:25,hardness:.42});
  for(let i=0;i<8;i++) box(COLORS.woodLight,[-15+i*.85,3.7,8],[.12,.12,5.4],[0,Math.PI/2+.05*(i-4),0],camp,{roughness:.9});
  for(const [x,z] of [[-7,3],[-5,6],[-18,5],[12,8],[15,5]]) { cylinder(COLORS.woodDry,[x,.65,z],[1.3,1.3,1.3],[0,0,0],camp,{roughness:.9}); collider({shape:'sphere',center:[x,.65,z],radius:.7,material:'wood',kind:'prop',side:'friendly',hardness:.3}); }
  for(const [x,y,z,s] of [[8,.6,10,1.5],[10,.55,8,1.2],[17,.7,11,1.6],[-20,.5,1,1.2]]) { box(COLORS.woodDark,[x,y,z],[s,s,s],[0,.3*rand(),0],camp,{roughness:.95}); collider({shape:'aabb',center:[x,y,z],size:[s,s,s],material:'wood',kind:'prop',side:'friendly',hardness:.35}); }

  const trebuchet=camp.add(new Node({name:'trebuchet',position:[25,0,-34]}));
  addShadow([25,0,-34],[9,7],camp);
  for(const x of [-4,4]) { beamBetween([x,.5,4],[x,10,-2],.55,COLORS.woodDark,trebuchet,{roughness:.9}); beamBetween([x,.5,-4],[x,10,2],.55,COLORS.woodDark,trebuchet,{roughness:.9}); }
  beamBetween([-5,9,0],[5,9,0],.55,COLORS.wood,trebuchet,{roughness:.9});
  beamBetween([0,9,0],[0,20,-6],.7,COLORS.woodLight,trebuchet,{roughness:.9});
  box(COLORS.stoneDark,[0,19.7,-6.2],[3.1,3.8,3.1],[0,0,0],trebuchet,{roughness:1});
  collider({shape:'aabb',center:[25,6,-34],size:[12,13,11],material:'wood',kind:'prop',side:'friendly',hardness:.45});

  ballista.position=[0,.15,19]; addShadow([0,0,19],[7.8,8.5],world);
  const baseFrame=ballista.add(new Node({name:'base-frame'}));
  box(COLORS.woodDark,[0,.65,0],[8.2,.85,5.4],[0,0,0],baseFrame,{roughness:.95});
  box(COLORS.wood,[0,1.32,-.2],[1.9,1.25,9.2],[0,0,0],baseFrame,{roughness:.9});
  for(const x of [-3.5,3.5]) for(const z of [-1.65,1.65]) cylinder(COLORS.woodLight,[x,.7,z],[2.4,.82,2.4],[0,0,Math.PI/2],baseFrame,{roughness:1});
  for(const x of [-2.75,2.75]) { beamBetween([x,1.25,2],[x,4.05,-1.9],.58,COLORS.wood,baseFrame,{roughness:.9}); beamBetween([x,1.25,-2],[x,4.05,1.4],.58,COLORS.wood,baseFrame,{roughness:.9}); }
  for(const z of [-2.4,2.4]) beamBetween([-3.5,.85,z],[3.5,.85,z],.36,COLORS.woodDry,baseFrame,{roughness:.9});
  box(COLORS.iron,[0,3.8,.1],[6.7,.48,.62],[0,0,0],baseFrame,{roughness:.2});
  const turret=ballista.add(new Node({name:'turret',position:[0,4.02,-.65]}));
  box(COLORS.woodLight,[0,0,-1],[1.35,.78,10.4],[0,0,0],turret,{roughness:.88});
  box(COLORS.iron,[0,.07,-.8],[.38,.92,9.6],[0,0,0],turret,{roughness:.18});
  beamBetween([-.5,0,-.8],[-6.6,.28,-1.7],.78,COLORS.woodLight,turret,{roughness:.86});
  beamBetween([.5,0,-.8],[6.6,.28,-1.7],.78,COLORS.woodLight,turret,{roughness:.86});
  for(const x of [-6.6,6.6]) { cylinder(COLORS.iron,[x,.28,-1.7],[.82,.58,.82],[0,0,0],turret,{roughness:.14}); beamBetween([x,.28,-1.7],[x*.45,-.2,-.3],.13,COLORS.rope,turret,{roughness:.75}); }
  const stringLeft=beamBetween([-6.6,.28,-1.7],[0,.22,2.85],.09,COLORS.rope,turret,{roughness:.72});
  const stringRight=beamBetween([6.6,.28,-1.7],[0,.22,2.85],.09,COLORS.rope,turret,{roughness:.72});
  const loadedProjectile=turret.add(new Node({name:'loaded-projectile'}));
  const loadedShaft=box(COLORS.woodDark,[0,.47,-1.9],[.24,.24,8.5],[0,0,0],loadedProjectile,{roughness:.9});
  const loadedTip=node(GEO.cone,COLORS.metal,[0,.47,-6.6],[.62,1.28,.62],[Math.PI/2,0,0],loadedProjectile,{roughness:.16});
  const winch=cylinder(COLORS.woodLight,[0,-.12,2.35],[1.55,2.5,1.55],[0,0,Math.PI/2],turret,{roughness:.9});
  box(COLORS.iron,[0,-.12,2.35],[4.8,.2,.2],[0,0,0],turret,{roughness:.16});
  for(const x of [-1.25,1.25]) cylinder(COLORS.rope,[x,-.12,2.35],[.55,.55,.55],[0,0,Math.PI/2],turret,{roughness:.8});
  collider({shape:'aabb',center:[0,2.6,19],size:[10,5.4,11],material:'wood',kind:'ballista',side:'friendly',hardness:.55});

  function friendlyCrew(x,z,phase) { const g=camp.add(new Node({name:'crew',position:[x,terrainHeight(x,z),z]})); cylinder(COLORS.leather,[0,1.1,0],[.75,2.1,.75],[0,0,0],g,{roughness:.8}); sphere(COLORS.skin,[0,2.5,0],[.65,.65,.65],[0,0,0],g,{roughness:.7}); node(GEO.cone,COLORS.iron,[0,2.95,0],[.8,.65,.8],[0,0,0],g,{roughness:.25}); g.userData.phase=phase; crew.push(g); }
  friendlyCrew(-4.8,20,0); friendlyCrew(4.9,18.5,1.7); friendlyCrew(-6.4,15.5,3.2);

  for(let i=0;i<18;i++) { const x=-43+i*5.1,z=-48+Math.sin(i*.8)*2.5; cylinder(COLORS.woodDark,[x,2.1,z],[.45,4.2,.45],[0,0,0],world,{roughness:1}); node(GEO.cone,COLORS.woodLight,[x,4.45,z],[.65,1.1,.65],[0,0,0],world,{roughness:1}); collider({shape:'sphere',center:[x,2.1,z],radius:.58,material:'wood',kind:'prop',side:'neutral',hardness:.35}); }
  for(const x of [-18,0,18]) { const m=propTarget({id:`mantlet-${x}`,label:'ПЕРЕДВИЖНОЙ ЩИТ',material:'wood',maxHealth:58,armor:.36,center:[x,2.8,-42],size:[7,5.5,2],score:30}); chunk(m,COLORS.woodDry,[x,2.9,-42],[6.8,5.3,.55],{parent:world,hp:45,hardness:.4}); for(const dx of [-2.5,2.5]) cylinder(COLORS.woodDark,[x+dx,.55,-42],[1.2,.55,1.2],[0,0,Math.PI/2],world,{roughness:.9}); }

  const particles=[];
  function spawnParticle({position,velocity,color=COLORS.ash,scale=.4,life=1,gravity=-4,alpha=1,emissive=0,kind='dust'}) {
    const p=sphere(color,position,[scale,scale,scale],[0,0,0],effects,{alpha,emissive,roughness:1});
    p.userData={velocity:[...velocity],life,maxLife:life,gravity,kind,baseScale:scale}; particles.push(p); return p;
  }
  for(const [x,y,z] of [[-28,.5,-34],[31,.5,-47],[-6,30,-103],[18,.5,-20],[-34,16,-68]]) smokeColumns.push({x,y,z,t:rand()*2});

  return {
    GEO, root, world, castle, camp, ballista, effects, COLORS, node, box, cylinder, sphere, beamBetween, rand,
    targets, colliders, props, gate, wallLeft, wallRight, towerLeft, towerRight, keep, bridgeTarget,
    loadedProjectile, loadedShaft, loadedTip, winch, turret, stringLeft, stringRight,
    particles, smokeColumns, flags, flames, crew, clouds, water, dynamicDebris, stuckProjectiles,
    spawnParticle, terrainHeight, collider,
  };
}
