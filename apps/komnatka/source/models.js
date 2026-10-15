import { MeshBuilder, Mesh, VertexData, Vector3, TransformNode, StandardMaterial, DynamicTexture, Color3 } from '@babylonjs/core';
import { roundedGeometry } from './geometry.js';

export const CATALOG = [
  { type:'sofa', name:'Диван', group:'furniture', icon:'sofa', size:[2.55,1.26] },
  { type:'chair', name:'Кресло', group:'furniture', icon:'chair', size:[1.18,1.18] },
  { type:'coffee', name:'Столик', group:'furniture', icon:'table', size:[1.58,1.08], top:0.72 },
  { type:'shelf', name:'Комод', group:'furniture', icon:'shelf', size:[1.75,0.72], top:1.02 },
  { type:'bed', name:'Кровать', group:'furniture', icon:'bed', size:[2.3,2.7] },
  { type:'stool', name:'Табурет', group:'furniture', icon:'stool', size:[0.72,0.72], top:0.52 },
  { type:'floorlamp', name:'Торшер', group:'lights', icon:'lamp', size:[0.92,0.92] },
  { type:'tablelamp', name:'Лампа', group:'lights', icon:'lamp', size:[0.55,0.55], tabletop:true },
  { type:'plant', name:'Фикус', group:'decor', icon:'plant', size:[0.96,0.96] },
  { type:'rug', name:'Ковёр', group:'decor', icon:'rug', size:[2.95,2.12], layer:'rug' },
  { type:'books', name:'Книги', group:'decor', icon:'books', size:[0.52,0.36], tabletop:true },
  { type:'mug', name:'Чашка', group:'decor', icon:'mug', size:[0.3,0.3], tabletop:true },
  { type:'frame', name:'Картина', group:'walls', icon:'frame', size:[1.37,0.1], layer:'wall' },
  { type:'window', name:'Окно', group:'walls', icon:'window', size:[1.94,0.1], layer:'wall' },
  {type:'wardrobe',name:'Шкафчик',group:'furniture',icon:'shelf',size:[1.62,.86]},
  {type:'desk',name:'Письменный стол',group:'furniture',icon:'table',size:[1.75,.92],top:.80},
  {type:'nightstand',name:'Тумбочка',group:'furniture',icon:'shelf',size:[.79,.66],top:.65},
  {type:'bookcase',name:'Этажерка',group:'furniture',icon:'shelf',size:[1.42,.66]},
  {type:'loveseat',name:'Диванчик',group:'furniture',icon:'sofa',size:[1.87,1.21]},
  {type:'pouf',name:'Пуфик',group:'furniture',icon:'stool',size:[.69,.69]},
  {type:'teddy',name:'Медвежонок',group:'decor',icon:'plant',size:[.39,.34],tabletop:true},
  {type:'vase',name:'Ваза',group:'decor',icon:'mug',size:[.28,.28],tabletop:true},
  {type:'candle',name:'Свечка',group:'lights',icon:'tablelamp',size:[.22,.22],tabletop:true},
  {type:'pillow',name:'Подушечка',group:'decor',icon:'rug',size:[.63,.43]},
  {type:'basket',name:'Корзинка',group:'decor',icon:'shelf',size:[.62,.52]},
  {type:'cactus',name:'Кактус',group:'decor',icon:'plant',size:[.56,.56]},
  {type:'mirror',name:'Зеркало',group:'walls',icon:'frame',size:[1.08,.10],layer:'wall'},
  {type:'clock',name:'Часики',group:'walls',icon:'frame',size:[.79,.10],layer:'wall'},
  {type:'deskclock',name:'Будильник',group:'decor',icon:'mug',size:[.28,.23],tabletop:true},
  {type:'teapot',name:'Чайничек',group:'decor',icon:'mug',size:[.42,.38],tabletop:true}
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
 // Two stage lights + up to four real lamps must fit the material shader.
 m.maxSimultaneousLights=6;
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

const fabricCache=new WeakMap();
export function fabricMaterial(scene,color){
 let byColor=fabricCache.get(scene);
 if(!byColor){byColor=new Map();fabricCache.set(scene,byColor);}
 if(byColor.has(color))return byColor.get(color);
 const tex=texture(scene,'weave-'+color,(c)=>{
  c.fillStyle=color;c.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=4){
   c.strokeStyle='rgba(255,255,255,.075)';c.lineWidth=1;
   c.beginPath();c.moveTo(0,y+.5);c.lineTo(256,y+.5);c.stroke();
  }
  for(let x=0;x<256;x+=4){
   c.strokeStyle='rgba(67,46,34,.045)';
   c.beginPath();c.moveTo(x+.5,0);c.lineTo(x+.5,256);c.stroke();
  }
 });
 const mat=new StandardMaterial('matte-woven-'+color,scene);
 mat.diffuseColor=Color3.White();mat.specularColor=new Color3(.018,.018,.018);mat.specularPower=8;
 mat.diffuseTexture=tex;mat.backFaceCulling=true;mat.maxSimultaneousLights=6;
 byColor.set(color,mat);return mat;
}
function grainMaterial(scene,name,color){
 const tx=texture(scene,'wood-fibres-'+name,c=>{
  c.fillStyle=color;c.fillRect(0,0,256,256);
  let seed=123;const rand=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  for(let i=0;i<80;i++){
   const y=rand()*256,x=rand()*256;
   c.strokeStyle=i%2?'rgba(73,46,30,.065)':'rgba(255,248,225,.085)';
   c.lineWidth=.4+rand()*.7;c.beginPath();c.moveTo(x-50,y);
   c.bezierCurveTo(x,y-3,x+40,y+2,x+150,y+rand()*2);c.stroke();
  }
 });
 const m=new StandardMaterial('warm-wood-'+name,scene);
 m.diffuseColor=Color3.White();m.specularColor=new Color3(.05,.045,.04);m.specularPower=9;
 m.diffuseTexture=tx;m.maxSimultaneousLights=6;return m;
}

const cached=new WeakMap();
function getMaterials(scene) {
 if(cached.has(scene))return cached.get(scene);
 const colors={wood:'#ad8062',lightWood:'#c9a684',darkWood:'#785544',metal:'#9c876d',ink:'#644f43',cream:'#f1debc',paper:'#fff5e4',leaf:'#6d8f74',leaf2:'#a8b88b',soil:'#5e5342',light:'#fff0ba',sky:'#c2dce2',white:'#f9efe1',glass:'#badbe0'};
 const m={};for(const [k,v] of Object.entries(colors))m[k]=makeMaterial(scene,'material-'+k,v);
 for(const key of ['wood','lightWood','darkWood'])m[key]=grainMaterial(scene,key,colors[key]);
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
export function tintWindowView(scene,nightFraction){
 const material=outdoorMaterials.get(scene);
 if(!material||material.isDisposed===true)return;
 const t=Math.max(0,Math.min(1,nightFraction));
 material.diffuseColor.set(1-.63*t,1-.59*t,1-.48*t);
}
// Handmade oval braided dollhouse rug. Texture follows the yarn's material,
// while short 3D braid cords, binding and embroidered flowers establish relief.
// All details sit below 3cm so furniture feet remain visible.
// Fabric lampshades visibly illuminate from within, independently of room
// exposure. Materials are cached per scene and never rebuilt on mode changes.
const lampShadeCache=new WeakMap();
function lampShade(scene,color){
 let map=lampShadeCache.get(scene);
 if(!map){map=new Map();lampShadeCache.set(scene,map);}
 if(map.has(color))return map.get(color);
 const material=new StandardMaterial('dollhouse-shade-'+color,scene);
 material.diffuseColor=hex(color);material.specularColor=new Color3(.018,.013,.011);
 material.specularPower=8;material.backFaceCulling=false;
 material.maxSimultaneousLights=6;
 material.emissiveColor=new Color3(.012,.008,.004);
 map.set(color,material);
 return material;
}
export function setLampVisuals(scene,night){
 const t=Math.max(0,Math.min(1,night));
 const materials=lampShadeCache.get(scene);
 if(materials)for(const mat of materials.values()){
  if(mat.isDisposed===true)continue;
  mat.emissiveColor.set(.017+.63*t,.013+.37*t,.010+.16*t);
 }
 // These small glowing bulbs are physically inside the solid fabric shades.
 const bulb=getMaterials(scene).light;
 bulb.emissiveColor.set(.06+.91*t,.043+.59*t,.020+.29*t);
}
const rugMaterials=new WeakMap();
function yarn(scene,color){
 let set=rugMaterials.get(scene);if(!set){set=new Map();rugMaterials.set(scene,set);}
 if(set.has(color))return set.get(color);
 const tx=texture(scene,'braided-wool-'+color,c=>{
  c.fillStyle=color;c.fillRect(0,0,256,256);
  let seed=92;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  // Individual fibrous stitches: irregular and fine, never a flat geometric print.
  for(let row=0;row<256;row+=6)for(let col=0;col<256;col+=9){
   const x=col+(row%12?3:0)+rand()*2,y=row+rand()*2;
   c.strokeStyle=rand()>.55?'rgba(255,247,222,.24)':'rgba(90,64,53,.13)';
   c.lineWidth=1.1;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+4,y-2,x+7,y+1);c.stroke();
  }
 });
 const mat=new StandardMaterial('mini-woven-yarn-'+color,scene);
 mat.diffuseTexture=tx;mat.diffuseColor=Color3.White();
 mat.specularColor=new Color3(.011,.011,.009);mat.specularPower=5;
 set.set(color,mat);return mat;
}
function ovalCord(scene,root,material,rx,rz,height=.028,radius=.012){
 const path=[];
 for(let i=0;i<=64;i++){
  const angle=i*Math.PI*2/64;
  path.push(new Vector3(Math.cos(angle)*rx,height+.0015*Math.sin(angle*12),Math.sin(angle)*rz));
 }
 const mesh=MeshBuilder.CreateTube('woven-oval-cord',{path,radius,tessellation:5,cap:0},scene);
 mesh.parent=root;mesh.material=material;return mesh;
}
function ovalLayer(scene,root,name,material,width,depth,height,y){
 const mesh=MeshBuilder.CreateCylinder(name,{height,diameter:width,tessellation:64},scene);
 mesh.scaling.z=depth/width;mesh.position.y=y;mesh.material=material;mesh.parent=root;
 return mesh;
}
function littleEmbroidery(scene,root,x,z,floret,center){
 for(let j=0;j<5;j++){
  const a=j*Math.PI*2/5;
  const petal=MeshBuilder.CreateSphere('stitched-petal',{diameter:1,segments:6},scene);
  petal.parent=root;petal.position.set(x+Math.cos(a)*.069,.037,z+Math.sin(a)*.069);
  petal.scaling.set(.067,.006,.037);petal.rotation.y=-a;
  petal.material=floret;
 }
 const dot=MeshBuilder.CreateSphere('thread-knot',{diameter:1,segments:6},scene);
 dot.parent=root;dot.position.set(x,.040,z);dot.scaling.set(.032,.007,.032);dot.material=center;
}
export function makeItem(scene,item){
 const meta=byType[item.type];if(!meta)throw new Error('Unknown item: '+item.type);
 const M=getMaterials(scene), root=new TransformNode('item-'+item.id,scene);
 const cloth=fabricMaterial(scene,item.color||COLORS[2]), pastel=fabricMaterial(scene,item.color||COLORS[2]);
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
  const accent=item.color===COLORS[2]?M.lightWood:cloth;
  if(t==='shelf'){
   box(scene,'closed-cabinet-body',root,M.lightWood,w,top-.17,d,0,(top-.17)/2+.08,0,.045);
   for(let i=-1;i<=1;i++){
    box(scene,'drawer-front',root,item.color===COLORS[2]?M.wood:accent,.48,.23,.022,i*.54,.78,d/2+.019,.018);
    orb(scene,'brass-knob',root,M.metal,i*.54,.78,d/2+.060,.055,.055,.035);
   }
   box(scene,'cabinet-top',root,M.lightWood,w+.06,.09,d+.06,0,top-.015,0,.04);
   for(const x of [-w/2+.14,w/2-.14])for(const z of [-d/2+.12,d/2-.12])
    cylinder(scene,'cabinet-foot',root,M.wood,x,.055,z,.12,.11);
  } else {
   box(scene,'tabletop',root,accent,w,.15,d,0,top-.06,0,.075);
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
   shade.parent=root;shade.position.y=h;
   shade.material=lampShade(scene,item.color===COLORS[2]?'#f3ddb9':item.color);
   // Visible diffused light at the underside of the shade, like a toy bulb.
   orb(scene,'warm-bulb',root,M.light,0,h-.27,0,tall?.15:.11,tall?.15:.11,tall?.15:.11);
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
  // A small oval woven keeps the floor visible at its corners and feels like
  // cloth made for dolls, not a printed rectangle / a thick platform.
  const backing=makeMaterial(scene,'rug-binding','#e1caab');
  const cream=makeMaterial(scene,'rug-cotton','#f0dfc4');
  const dark=makeMaterial(scene,'rug-warm-edge','#b98476');
  ovalLayer(scene,root,'hand-bound-edge',backing,2.99,2.15,.012,.007);
  ovalLayer(scene,root,'wool-pile',yarn(scene,item.color||'#d6ab93'),2.89,2.07,.013,.016);
  ovalCord(scene,root,cream,1.432,1.027,.028,.013);
  ovalCord(scene,root,dark,1.314,.939,.031,.014);
  ovalCord(scene,root,cream,1.201,.847,.032,.011);
  // One restrained embroidered rosette motif; stays legible at a toy scale.
  littleEmbroidery(scene,root,0,0,cream,dark);
  for(const [x,z] of [[-.62,0],[.62,0]])
   littleEmbroidery(scene,root,x,z,makeMaterial(scene,'rug-rose','#e7c3ae'),cream);
  // Loose short cotton ends, following the oval rather than a rectangular fringe.
  for(const side of [-1,1])for(let j=-6;j<=6;j++){
   const x=j*.16,z=side*(1.052-.21*Math.pow(x/1.49,2));
   const fringe=box(scene,'woven-fringe',root,cream,.018,.007,.065,x,.011,z+side*.035,.005);
   fringe.rotation.y=(j/6)*side*.16;
  }
 }
 // Toy-sized additional pieces — modeled from rounded wooden forms,
 // stitched fabric and genuine silhouettes rather than placeholder primitives.
 if(['wardrobe','bookcase','nightstand','desk'].includes(t)){
  const heights={wardrobe:2.36,bookcase:2.12,nightstand:.65,desk:.80};
  const h=heights[t],w=byType[t].size[0],d=byType[t].size[1];
  if(t==='desk'){
   box(scene,'desk-rounded-top',root,M.lightWood,w,.14,d,0,h-.075,0,.07);
   for(const x of [-.73,.73])for(const z of [-.30,.30])cylinder(scene,'turned-desk-leg',root,M.wood,x,(h-.14)/2,z,.09,h-.14,.19);
   box(scene,'tiny-desk-drawer',root,M.wood,.68,.20,.10,.44,.57,d/2-.10,.045);
   orb(scene,'desk-drawer-knob',root,M.metal,.44,.56,d/2-.02,.045,.045,.03);
  }else{
   box(scene,'tiny-cabinet-shell',root,M.lightWood,w,h-.14,d,0,h/2+.01,0,.075);
   box(scene,'cabinet-top',root,M.wood,w+.06,.09,d+.05,0,h-.035,0,.045);
   for(const x of [-w/2+.14,w/2-.14])for(const z of [-d/2+.12,d/2-.12])
    cylinder(scene,'mini-cabinet-foot',root,M.wood,x,.07,z,.12,.14);
   if(t==='bookcase'){
    for(let y=.36;y<h-.1;y+=.48){
     box(scene,'shelf-plank',root,M.wood,w-.12,.055,d+.035,0,y,0,.024);
     for(let j=0;j<5;j++){
      const color=['#be8d82','#859e87','#d5b985','#97acbd','#c39f8e'][j];
      box(scene,'mini-stacked-book',root,makeMaterial(scene,'storybook-'+j,color),.13,.28,.24,-w/2+.23+j*.18,y+.16,.035,.018);
     }
    }
   }else{
    const drawers=t==='wardrobe'?2:1;
    for(let i=0;i<drawers;i++){
     const x=drawers===2?(i? w*.25:-w*.25):0;
     box(scene,'carved-cupboard-door',root,item.color===COLORS[2]?M.wood:cloth,w/drawers-.13,h-.3,.044,x,h/2+.06,d/2+.015,.07);
     box(scene,'door-inlay',root,M.lightWood,w/drawers-.23,h-.48,.022,x,h/2+.06,d/2+.046,.045);
     orb(scene,'little-brass-handle',root,M.metal,x+(i?-.10:.10),h*.55,d/2+.080,.045,.07,.045);
    }
   }
  }
 }
 if(t==='loveseat'){
  const w=1.85,d=1.20;
  box(scene,'little-couch',root,cloth,w,.41,d,0,.45,0,.14);
  box(scene,'little-sofa-back',root,cloth,w,.77,.22,0,.89,-.45,.10);
  for(const x of [-.45,.45]){
   box(scene,'soft-cushion',root,M.cream,.73,.15,.72,x,.74,.14,.095);
   box(scene,'cushion-pillow',root,cloth,.45,.37,.19,x,.99,-.23,.08);
  }
  for(const x of [-.80,.80])box(scene,'padded-arm',root,cloth,.22,.54,.89,x,.75,.09,.12);
  for(const x of [-.68,.68])for(const z of [-.35,.35])cylinder(scene,'little-turned-foot',root,M.wood,x,.13,z,.11,.25,.2);
 }
 if(t==='pouf'||t==='pillow'){
  if(t==='pouf'){
   cylinder(scene,'pouf-rounded-base',root,cloth,0,.27,0,.67,.50,.06);
   orb(scene,'tufted-pouf-crown',root,cloth,0,.52,0,.58,.09,.58);
   orb(scene,'pouf-center-button',root,M.cream,0,.575,0,.058,.025,.058);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;
    box(scene,'pouf-stitched-rib',root,M.cream,.014,.015,.14,Math.cos(a)*.24,.55,Math.sin(a)*.24,.006).rotation.y=a;}
  }else{
   box(scene,'stitched-floor-pillow',root,cloth,.62,.11,.42,0,.066,0,.055);
   for(const x of [-.24,.24])orb(scene,'hand-knotted-tassel',root,M.cream,x,.07,.13,.043,.034,.043);
  }
 }
 if(t==='basket'){
  cylinder(scene,'woven-basket-bottom',root,M.wood,0,.20,0,.52,.38,.26);
  cylinder(scene,'basket-inner',root,M.darkWood,0,.397,0,.39,.018);
  for(let i=0;i<3;i++)cylinder(scene,'basket-rattan-braid',root,M.lightWood,0,.16+i*.10,0,.52,.035);
  for(const x of [-.22,.22]){const handle=cylinder(scene,'woven-loop',root,M.wood,x,.47,0,.08,.30);handle.rotation.z=x>0?.36:-.36;}
 }
 if(t==='cactus'){
  cylinder(scene,'small-terracotta-pot',root,M.wood,0,.19,0,.37,.35,.22);
  cylinder(scene,'cactus-soil',root,M.soil,0,.37,0,.32,.015);
  orb(scene,'plump-cactus',root,M.leaf,0,.68,0,.31,.66,.31);
  for(const dx of [-.18,.18])orb(scene,'cactus-side-shoot',root,M.leaf,dx,.60,0,.14,.32,.15);
  for(let j=0;j<10;j++){const a=j*6.283/10;
   box(scene,'soft-prickle',root,M.cream,.013,.075,.012,Math.cos(a)*.14,.83,Math.sin(a)*.14,.006);}
 }
 if(t==='teddy'){
  orb(scene,'teddy-plush-body',root,cloth,0,.23,-.015,.32,.35,.28);
  orb(scene,'teddy-belly-patch',root,M.cream,0,.245,.135,.175,.19,.025);
  orb(scene,'teddy-round-head',root,cloth,0,.52,-.012,.34,.315,.31);
  for(const side of [-1,1]){
   const x=side*.133;
   orb(scene,'teddy-ear',root,cloth,x,.668,-.04,.14,.14,.115);
   orb(scene,'teddy-ear-lining',root,M.cream,x,.677,.026,.079,.085,.027);
   orb(scene,'teddy-shiny-eye',root,M.darkWood,side*.073,.548,.142,.029,.033,.016);
   const arm=orb(scene,'teddy-sloping-arm',root,cloth,side*.172,.278,.044,.15,.24,.15);
   arm.rotation.z=-side*.27;
   orb(scene,'teddy-feet',root,cloth,side*.102,.095,.119,.145,.13,.19);
   orb(scene,'teddy-stitched-paw',root,M.cream,side*.102,.082,.215,.083,.065,.018);
  }
  orb(scene,'teddy-cream-muzzle',root,M.cream,0,.469,.145,.185,.132,.09);
  orb(scene,'teddy-triangle-nose',root,M.darkWood,0,.49,.204,.057,.04,.024);
  box(scene,'teddy-smile-stitch',root,M.darkWood,.012,.037,.008,0,.432,.231,.004);
 }
 if(t==='vase'||t==='teapot'||t==='candle'||t==='deskclock'){
  if(t==='vase'){
   orb(scene,'ceramic-vase-belly',root,cloth,0,.206,0,.30,.32,.285);
   orb(scene,'ceramic-vase-shoulder',root,cloth,0,.319,0,.218,.147,.22);
   cylinder(scene,'ceramic-vase-neck',root,cloth,0,.38,0,.133,.145,.08);
   cylinder(scene,'ceramic-vase-dark-opening',root,M.darkWood,0,.458,0,.105,.009);
   const rim=MeshBuilder.CreateTorus('ceramic-vase-rim',{diameter:.146,thickness:.021,tessellation:18},scene);
   rim.parent=root;rim.position.set(0,.461,0);rim.material=cloth;
   cylinder(scene,'ceramic-vase-foot',root,cloth,0,.063,0,.157,.044);
   const flowerColors=[M.cream,M.art[1],M.cream];
   for(let i=0;i<3;i++){
    const x=(i-1)*.078,z=i===1?.018:-.015,height=.23+(i===1?.06:0);
    const stem=cylinder(scene,'thin-flower-stem',root,M.leaf,x*.55,.48+height*.44,z,.014,height);
    stem.rotation.z=-x*.8;
    orb(scene,'small-flower-head',root,flowerColors[i],x,.48+height,z,.085,.071,.079);
    if(i<2)orb(scene,'silk-leaf',root,M.leaf,x+.048,.545,z,.083,.041,.066).rotation.z=.4;
   }
  }else if(t==='teapot'){
   orb(scene,'porcelain-teapot',root,cloth,0,.19,0,.36,.29,.34);
   cylinder(scene,'teapot-lid',root,M.cream,0,.34,0,.22,.045);
   orb(scene,'teapot-knob',root,M.wood,0,.39,0,.08,.06,.08);
   const spout=cylinder(scene,'curved-porcelain-spout',root,cloth,.20,.21,0,.095,.22);spout.rotation.z=-.70;
   orb(scene,'handle-loop',root,M.cream,-.22,.20,0,.095,.17,.12);
  }else if(t==='candle'){
   cylinder(scene,'wax-candle',root,M.cream,0,.17,0,.17,.31);
   cylinder(scene,'candle-copper-holder',root,M.metal,0,.035,0,.26,.07);
   orb(scene,'candle-flame',root,M.light,0,.38,0,.056,.13,.056);
  }else{
   // Cylinders default to a horizontal disk. Rotate both dial layers into XY.
   orb(scene,'alarm-bell-shaped-body',root,cloth,0,.238,-.014,.32,.32,.18);
   for(const side of [-1,1]){
    box(scene,'alarm-little-foot',root,M.darkWood,.064,.07,.09,side*.098,.06,.005,.026);
    orb(scene,'alarm-metal-bell',root,M.metal,side*.104,.445,-.028,.125,.085,.12);
    cylinder(scene,'alarm-bell-peg',root,M.darkWood,side*.104,.395,-.025,.024,.068);
   }
   const bezel=cylinder(scene,'alarm-front-bezel',root,M.metal,0,.238,.085,.267,.055);
   bezel.rotation.x=Math.PI/2;
   const dial=cylinder(scene,'alarm-upright-ivory-dial',root,M.cream,0,.238,.118,.231,.016);
   dial.rotation.x=Math.PI/2;
   for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    const notch=box(scene,'alarm-minute-mark',root,M.darkWood,.013,.023,.008,
     Math.sin(a)*.089,.238+Math.cos(a)*.089,.133,.004);
    notch.rotation.z=-a;
   }
   box(scene,'alarm-hour-hand',root,M.darkWood,.017,.076,.009,-.018,.259,.146,.006).rotation.z=.47;
   box(scene,'alarm-minute-hand',root,M.darkWood,.012,.092,.009,.023,.266,.148,.005).rotation.z=-.55;
   orb(scene,'alarm-center-pin',root,M.metal,0,.238,.157,.029,.029,.019);
  }
 }
 if(t==='mirror'||t==='clock'){
  if(t==='mirror'){
   box(scene,'oval-wall-mirror-frame',root,M.wood,1.06,1.35,.075,0,0,0,.21);
   box(scene,'gentle-mirror-glass',root,makeMaterial(scene,'silvery-mirror','#c4d6d3'),.87,1.13,.02,0,0,.065,.17);
   box(scene,'mirror-light-reflection',root,M.cream,.075,.91,.006,-.23,0,.079,.037).rotation.z=-.23;
  }else{
   cylinder(scene,'carved-wall-clock',root,M.wood,0,0,0,.78,.08);
   // Wall objects lie vertically in local XY; rotate face cylinder.
   for(const node of root.getChildMeshes(false))node.rotation.x=Math.PI/2;
   cylinder(scene,'clock-dial',root,M.cream,0,0,.064,.60,.020).rotation.x=Math.PI/2;
   box(scene,'clock-hour-pointer',root,M.darkWood,.023,.23,.024,0,.09,.080,.008);
   box(scene,'clock-minute-pointer',root,M.darkWood,.19,.017,.024,.075,0,.083,.007);
   orb(scene,'clock-pivot',root,M.metal,0,0,.092,.044,.044,.032);
  }
 }
 if(t==='books'){
   const palette=['#c18d7d','#8ca18f','#d6bb82','#9b91a6'];
   for(let i=0;i<4;i++){const m=i===0&&item.color!==COLORS[2]?cloth:makeMaterial(scene,'book-'+i,palette[i]);box(scene,'little-book',root,m,.10,.23+.035*(i%2),.32,-.19+i*.13,.16,0,.025);
    box(scene,'pages',root,M.paper,.088,.012,.30,-.19+i*.13,.30+.035*(i%2),0,.006);}
 }
 if(t==='mug'){
   cylinder(scene,'cup',root,cloth,0,.135,0,.24,.27);
   const torus=MeshBuilder.CreateTorus('handle',{diameter:.18,thickness:.052,tessellation:16},scene);
   torus.parent=root;torus.position.set(.164,.16,0);torus.rotation.x=Math.PI/2;torus.material=cloth;
   cylinder(scene,'coffee',root,M.wood,0,.274,0,.19,.004);
 }
 if(t==='frame'){
   box(scene,'picture-mat',root,item.color===COLORS[2]?M.wood:cloth,1.37,1.13,.095,0,0,0,.035);
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
   box(scene,'stitched-curtain-band',root,M.cream,.16,.033,.088,x,-.46,.276,.012);
  }
 }
  for(const node of root.getChildMeshes(false)){node.metadata={itemId:item.id};node.isPickable=true;node.receiveShadows=false;}
 return root;
}
