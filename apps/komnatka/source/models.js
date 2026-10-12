import { MeshBuilder, Mesh, VertexData, Vector3, TransformNode, StandardMaterial, DynamicTexture, Color3 } from '@babylonjs/core';
import { roundedGeometry } from './geometry.js';

export const CATALOG = [
  { type:'sofa', name:'Диван', group:'furniture', icon:'sofa', size:[2.55,1.26] },
  { type:'chair', name:'Кресло', group:'furniture', icon:'chair', size:[1.18,1.18] },
  { type:'coffee', name:'Столик', group:'furniture', icon:'table', size:[1.58,1.08], top:0.72 },
  { type:'shelf', name:'Комод', group:'furniture', icon:'shelf', size:[1.75,0.72], top:1.02 },
  { type:'bed', name:'Кровать', group:'furniture', icon:'bed', size:[2.3,2.7] },
  { type:'stool', name:'Табурет', group:'furniture', icon:'stool', size:[0.72,0.72], top:0.52 },
  { type:'floorlamp', name:'Торшер', group:'lights', icon:'lamp', size:[0.63,0.63] },
  { type:'tablelamp', name:'Лампа', group:'lights', icon:'lamp', size:[0.48,0.48], tabletop:true },
  { type:'plant', name:'Фикус', group:'decor', icon:'plant', size:[0.68,0.68] },
  { type:'rug', name:'Ковёр', group:'decor', icon:'rug', size:[2.95,2.12], layer:'rug' },
  { type:'books', name:'Книги', group:'decor', icon:'books', size:[0.52,0.36], tabletop:true },
  { type:'mug', name:'Чашка', group:'decor', icon:'mug', size:[0.3,0.3], tabletop:true },
  { type:'frame', name:'Картина', group:'walls', icon:'frame', size:[1.28,0.1], layer:'wall' },
  { type:'window', name:'Окно', group:'walls', icon:'window', size:[1.68,0.1], layer:'wall' }
];
export const byType = Object.fromEntries(CATALOG.map(x=>[x.type,x]));
export const COLORS = ['#e8a58f','#d6bd80','#8eae99','#8baab8','#bc9bb5','#e8d8bf','#a58f77','#d2a993'];
const hex = h=>Color3.FromHexString(h);
const sharedMaterials=new WeakMap();
export function makeMaterial(scene, name, color, rough=0.92) {
 let map=sharedMaterials.get(scene);if(!map){map=new Map();sharedMaterials.set(scene,map);}
 const key=color+'/'+rough;
 if(map.has(key))return map.get(key);
 const m=new StandardMaterial(name,scene);m.diffuseColor=hex(color);m.specularColor=new Color3(0.055,0.052,0.047);m.specularPower=28*(1-rough)+8;
 map.set(key,m);return m;
}
export function rounded(scene,name,w,h,d,r,material,parent,x=0,y=0,z=0) {
 const mesh=new Mesh(name,scene);
 const geometry=roundedGeometry(w,h,d,r);
 const vertex=new VertexData();
 Object.assign(vertex,geometry);
 vertex.applyToMesh(mesh);
 mesh.material=material;mesh.parent=parent;mesh.position.set(x,y,z);
 return mesh;
}
function orb(scene,name,parent,mat,x,y,z,sx,sy,sz,segments=12){
 const mesh=MeshBuilder.CreateSphere(name,{diameter:1,segments},scene);
 mesh.parent=parent;mesh.position.set(x,y,z);mesh.scaling.set(sx,sy,sz);mesh.material=mat;return mesh;
}
function cylinder(scene,name,parent,mat,x,y,z,diam=0.1,h=1,taper=0){
 const mesh=MeshBuilder.CreateCylinder(name,{height:h,diameterTop:diam*(1-taper),diameterBottom:diam,tessellation:12},scene);
 mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
}
function box(scene,name,parent,mat,w,h,d,x,y,z,r=.06){return rounded(scene,name,w,h,d,Math.min(r,w/2-.001,h/2-.001,d/2-.001),mat,parent,x,y,z);}
function texture(scene,label,draw) {
 const tex=new DynamicTexture(label,{width:256,height:256},scene,false);
 const c=tex.getContext();draw(c);tex.update();return tex;
}
const cached=new WeakMap();
function getMaterials(scene) {
 if(cached.has(scene))return cached.get(scene);
 const colors={wood:'#ad8062',lightWood:'#c9a684',darkWood:'#785544',metal:'#9c876d',ink:'#644f43',cream:'#f1debc',paper:'#fff5e4',leaf:'#6d8f74',leaf2:'#a8b88b',soil:'#5e5342',light:'#fff0ba',sky:'#c2dce2',white:'#f9efe1',glass:'#badbe0'};
 const m={};for(const [k,v] of Object.entries(colors))m[k]=makeMaterial(scene,'material-'+k,v);
 const art = ['landscape','abstract','flowers'];
 m.art=art.map((kind,i)=>{
  const tx=texture(scene,'paint-'+kind,(c)=>{
   const g=c.createLinearGradient(0,0,256,256);g.addColorStop(0,['#cfdbca','#e9c4b4','#d6dbd0'][i]);g.addColorStop(1,['#b7c8b3','#d5a9a6','#f4e5c8'][i]);
   c.fillStyle=g;c.fillRect(0,0,256,256);
   if(i===0){c.fillStyle='#e5d1a5';c.beginPath();c.arc(186,73,33,0,7);c.fill();c.fillStyle='#8ea892';c.beginPath();c.moveTo(0,210);c.lineTo(80,110);c.lineTo(150,190);c.lineTo(210,132);c.lineTo(256,187);c.lineTo(256,256);c.lineTo(0,256);c.fill();}
   else if(i===1){c.fillStyle='#9b8ca6';c.beginPath();c.ellipse(128,150,62,94,.5,0,7);c.fill();c.strokeStyle='#f2ddbd';c.lineWidth=12;c.strokeRect(48,47,162,164);}
   else {for(let k=0;k<7;k++){const x=45+(k*57)%171,y=45+(k*63)%169;c.fillStyle=k%2?'#dfaa9d':'#edcf97';for(let f=0;f<5;f++){c.beginPath();c.ellipse(x+Math.cos(f*1.256)*15,y+Math.sin(f*1.256)*15,13,9,f*1.256,0,7);c.fill()}c.fillStyle='#8c997b';c.beginPath();c.arc(x,y,7,0,7);c.fill();}}});
   const mat=new StandardMaterial('painting-'+kind,scene);mat.diffuseColor=Color3.White();mat.specularColor=new Color3(.03,.03,.03);mat.diffuseTexture=tx;mat.backFaceCulling=false;return mat;
 });
 cached.set(scene,m);return m;
}
let outdoorMaterials=new WeakMap();
function windowViewMaterial(scene){
 if(outdoorMaterials.has(scene))return outdoorMaterials.get(scene);
 const tx=texture(scene,'window-distance',(c)=>{
  const g=c.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#b5d5dc');g.addColorStop(.58,'#e5e7d7');g.addColorStop(1,'#bac6aa');
  c.fillStyle=g;c.fillRect(0,0,256,256);
  c.fillStyle='#f7ecd9';c.globalAlpha=.65;
  for(let i=0;i<4;i++){c.beginPath();c.ellipse(35+i*73,54+(i%2)*11,37,12,0,0,7);c.fill();}
  c.globalAlpha=1;
  c.fillStyle='#b6c6b2';c.beginPath();c.moveTo(0,205);c.lineTo(62,162);c.lineTo(115,186);c.lineTo(186,152);c.lineTo(256,202);c.lineTo(256,256);c.lineTo(0,256);c.fill();
  c.fillStyle='#8fae9b';for(let i=0;i<8;i++){const x=i*42-12,y=202+(i%3)*12;c.beginPath();c.moveTo(x,y+28);c.lineTo(x+13,y-33);c.lineTo(x+29,y+28);c.fill();}
 });
 const m=new StandardMaterial('outside-scenery',scene);m.diffuseTexture=tx;m.specularColor=new Color3(.05,.06,.06);
 outdoorMaterials.set(scene,m);return m;
}
export function makeItem(scene,item){
 const meta=byType[item.type];if(!meta)throw new Error('Unknown item: '+item.type);
 const M=getMaterials(scene), root=new TransformNode('item-'+item.id,scene);
 const cloth=makeMaterial(scene,'fabric-'+item.id,item.color||COLORS[2]), pastel=makeMaterial(scene,'detail-'+item.id,item.color||COLORS[2]);
 root.position.set(item.x||0,item.y||0,item.z||0);root.rotation.y=(item.rot||0)*Math.PI/2;
 const t=item.type;
 // Opaque materials only. The room renderer owns physical floor shadows;
 // translucent decals no longer sit between the floor and furniture.
 
 if(t==='sofa'||t==='chair'){
  const couch=t==='sofa',w=couch?2.43:1.10,d=1.12;
  // A single upholstered carcass, then cushions and armrests on distinct non-intersecting planes.
  box(scene,'upholstered-base',root,cloth,w,.44,d,0,.48,0,.17);
  box(scene,'sofa-back',root,cloth,w,.86,.24,0,.96,-.44,.11);
  const seatWidth=w-.43,sections=couch?2:1;
  for(let i=0;i<sections;i++){
   const width=seatWidth/sections-.035;
   const x=(i-(sections-1)/2)*(seatWidth/sections);
   box(scene,'seat-cushion',root,cloth,width,.17,.73,x,.78,.18,.09);
   // Seat-back cushions sit in front of the back, never inside the arms.
   const backPillow=makeMaterial(scene,'back-pillow-'+item.id,'#e9d9c5');
   const cushion=box(scene,'loose-back-cushion',root,backPillow,width-.075,.49,.13,x,1.12,-.234,.07);
   cushion.rotation.x=-.075;
  }
  for(let side of [-1,1]){
   const armX=side*(w/2-.135);
   box(scene,'rounded-armrest',root,cloth,.26,.62,.94,armX,.82,.075,.125);
   for(const z of [-.33,.36])cylinder(scene,'tapered-wood-foot',root,M.wood,side*(w/2-.24),.14,z,.17,.28,.35);
  }
  const stitch=makeMaterial(scene,'upholstery-seam-'+item.id,'#d3b8a0');
  for(let i=1;i<sections;i++)box(scene,'cushion-seam',root,stitch,.012,.012,.67,0,.872,.18,.005);
 }
 
 if(t==='coffee'||t==='shelf'||t==='stool'){
  const w=meta.size[0],d=meta.size[1],top=meta.top;
  if(t==='shelf'){
   box(scene,'closed-cabinet-body',root,M.lightWood,w,top-.17,d,0,(top-.17)/2+.08,0,.045);
   for(let i=-1;i<=1;i++){
    box(scene,'drawer-front',root,M.wood,.48,.23,.022,i*.54,.78,d/2+.019,.018);
    orb(scene,'brass-knob',root,M.metal,i*.54,.78,d/2+.060,.055,.055,.035);
   }
   box(scene,'cabinet-top',root,M.lightWood,w+.06,.09,d+.06,0,top-.015,0,.04);
   for(const x of [-w/2+.14,w/2-.14])for(const z of [-d/2+.12,d/2-.12])
    cylinder(scene,'cabinet-foot',root,M.wood,x,.055,z,.12,.11);
  } else {
   box(scene,'tabletop',root,M.lightWood,w,.15,d,0,top-.06,0,.075);
   // Feet flare out slightly: tiny turned wooden legs rather than vertical sticks.
   for(const x of [-1,1])for(const z of [-1,1]){
    const leg=cylinder(scene,'turned-tapered-leg',root,M.wood,x*(w/2-.16),(top-.19)/2,z*(d/2-.15),.18,top-.19,.32);
    leg.rotation.z=x*.065;
   }
   if(t==='coffee')box(scene,'table-edge-inlay',root,M.wood,w-.13,.018,d-.13,0,top+.025,0,.008);
  }
 }
 
 if(t==='bed'){
  box(scene,'solid-wood-frame',root,M.wood,2.25,.26,2.63,0,.29,0,.11);
  for(const x of [-.87,.87])for(const z of [-1.06,1.06])
   cylinder(scene,'wooden-foot',root,M.wood,x,.105,z,.15,.21,.27);
  box(scene,'mattress',root,M.cream,2.10,.30,2.35,0,.57,.05,.10);
  box(scene,'duvet',root,cloth,2.055,.11,1.54,0,.773,.48,.065);
  const fold=makeMaterial(scene,'fold-'+item.id,'#ead9c7');
  box(scene,'turned-down-duvet-edge',root,fold,2.03,.035,.23,0,.85,-.30,.013);
  const head=box(scene,'headboard',root,M.lightWood,2.25,.85,.14,0,.65,-1.29,.065);
  for(const x of [-.52,.52]){
   box(scene,'soft-pillow',root,M.paper,.89,.145,.46,x,.80,-.81,.09);
  }
 }
  if(t==='floorlamp'||t==='tablelamp'){
   const tall=t==='floorlamp',h=tall?2.35:.76;
   cylinder(scene,'round-base',root,M.metal,0,.065,0,tall?.52:.34,.13);
   cylinder(scene,'thin-stem',root,M.metal,0,h*.49,0,.075,h-.19);
   const shade=MeshBuilder.CreateCylinder('fabric-shade',{height:tall?.62:.33,diameterTop:tall?.45:.27,diameterBottom:tall?.88:.55,tessellation:24},scene);
   shade.parent=root;shade.position.y=h;shade.material=M.cream;
   orb(scene,'warm-bulb',root,M.light,0,h-.27,0,.12,.12,.12);
 }

 if(t==='plant'){
  const pot=MeshBuilder.CreateCylinder('terracotta-pot',{height:.54,diameterTop:.49,diameterBottom:.34,tessellation:18},scene);
  pot.parent=root;pot.position.y=.31;pot.material=makeMaterial(scene,'pot-'+item.id,item.color||'#bf9078');
  cylinder(scene,'pot-rim',root,M.wood,0,.55,0,.49,.065);
  cylinder(scene,'soil',root,M.soil,0,.562,0,.42,.015);
  cylinder(scene,'main-stem',root,M.darkWood,0,.89,0,.052,.65);
  // Pointed, folded leaves built from actual leaf blades; no ellipsoid clusters.
  const leafMats=[makeMaterial(scene,'leaf-sage','#708e70'),makeMaterial(scene,'leaf-olive','#90a37d')];
  for(const mat of leafMats){mat.backFaceCulling=false;mat.twoSidedLighting=true;}
  for(let i=0;i<12;i++){
   const angle=i*2.399,reach=.31+.095*(i%3),baseY=.92+(i%4)*.13,rise=.17+((i+1)%3)*.065;
   const axis=new Vector3(Math.cos(angle),0,Math.sin(angle));
   const side=new Vector3(-axis.z,0,axis.x);
   const pts=[],normals=[],uv=[],indices=[];
   for(let j=0;j<=6;j++){
    const t=j/6,width=Math.sin(t*Math.PI)**.8*(.13+(i%3)*.012);
    const middle=new Vector3(axis.x*reach*t,baseY+rise*t+Math.sin(t*Math.PI)*.08,axis.z*reach*t);
    for(const k of [-1,0,1]){
     const leafPoint=middle.add(side.scale(k*width)).add(new Vector3(0,k===0?.035*Math.sin(t*Math.PI):0,0));
     pts.push(leafPoint.x,leafPoint.y,leafPoint.z);normals.push(0,1,0);uv.push(t,(k+1)/2);
    }
   }
   for(let j=0;j<6;j++)for(let k=0;k<2;k++){
    const a=j*3+k,b=a+3;indices.push(a,b,a+1,a+1,b,b+1);
   }
   const leaf=new Mesh('pointed-leaf',scene),geo=new VertexData();
   geo.positions=pts;geo.indices=indices;geo.uvs=uv;
   VertexData.ComputeNormals(pts,indices,geo.normals=[]);geo.applyToMesh(leaf);
   leaf.material=leafMats[i%2];leaf.parent=root;
   const tip=new Vector3(axis.x*reach*.89,baseY+rise*.89,axis.z*reach*.89);
   const stalk=MeshBuilder.CreateTube('leaf-petiole',{path:[new Vector3(0,baseY,0),tip],radius:.015,tessellation:5},scene);
   stalk.parent=root;stalk.material=M.leaf;
  }
 }
  if(t==='rug'){
   box(scene,'carpet-edge',root,M.cream,3.02,.045,2.19,0,.035,0,.16);
   box(scene,'carpet',root,cloth,2.88,.055,2.04,0,.068,0,.12);
   box(scene,'carpet-medallion',root,M.paper,1.15,.015,.79,0,.107,0,.23);
   for(const x of [-1.26,1.26])box(scene,'woven-lines',root,M.cream,.032,.012,1.8,x,.109,0,.008);
 }
 if(t==='books'){
   const palette=['#c18d7d','#8ca18f','#d6bb82','#9b91a6'];
   for(let i=0;i<4;i++){const m=makeMaterial(scene,'book-'+i,palette[i]);box(scene,'little-book',root,m,.10,.23+.035*(i%2),.32,-.19+i*.13,.16,0,.025);
    box(scene,'pages',root,M.paper,.088,.012,.30,-.19+i*.13,.30+.035*(i%2),0,.006);}
 }
 if(t==='mug'){
   cylinder(scene,'cup',root,cloth,0,.135,0,.24,.27);
   const torus=MeshBuilder.CreateTorus('handle',{diameter:.18,thickness:.052,tessellation:16},scene);
   torus.parent=root;torus.position.set(.164,.16,0);torus.rotation.x=Math.PI/2;torus.material=cloth;
   cylinder(scene,'coffee',root,M.wood,0,.274,0,.19,.004);
 }
 if(t==='frame'){
   box(scene,'picture-mat',root,M.wood,1.37,1.13,.095,0,0,0,.035);
   box(scene,'picture-paper',root,M.cream,1.23,1.00,.022,0,0,.057,.012);
   box(scene,'hand-painted-landscape',root,M.art[(item.variant||0)%3],1.10,.87,.014,0,0,.071,.006);
 }

 if(t==='window'){
  // Recessed painted outdoor view, fine wooden mullions and side curtains instead of solid sky blocks.
  box(scene,'window-reveal-shadow',root,M.darkWood,1.84,2.02,.035,0,0,.015,.024);
  const outer=box(scene,'window-outer-frame',root,M.white,1.73,1.90,.11,0,0,.081,.025);
  const glassMat=windowViewMaterial(scene);
  box(scene,'painted-outside-view',root,glassMat,1.46,1.64,.012,0,.015,.144,.005);
  for(const x of [-.746,.746])box(scene,'sash-side',root,M.white,.091,1.77,.052,x,0,.173,.014);
  for(const y of [-.85,.87])box(scene,'sash-crossbar',root,M.white,1.57,.09,.052,0,y,.173,.014);
  box(scene,'middle-mullion',root,M.white,.095,1.75,.064,0,0,.177,.012);
  box(scene,'middle-transom',root,M.white,1.51,.078,.064,0,.04,.177,.012);
  box(scene,'window-sill',root,M.lightWood,1.91,.085,.30,0,-.974,.17,.024);
  const curtain=makeMaterial(scene,'curtain-'+item.id,item.color||'#e6d8bf');
  for(const side of [-1,1]){
   const x=side*.85;
   const fabric=box(scene,'linen-side-curtain',root,curtain,.15,1.73,.082,x,-.015,.22,.037);
   fabric.rotation.z=side*.055;
   orb(scene,'curtain-tieback',root,M.wood,x,-.46,.285,.095,.06,.055);
  }
 }
  for(const node of root.getChildMeshes(false)){node.metadata={itemId:item.id};node.isPickable=true;node.receiveShadows=false;}
 return root;
}
