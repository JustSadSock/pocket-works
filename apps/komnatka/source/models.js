import { MeshBuilder, Mesh, VertexData, Vector3, TransformNode, StandardMaterial, DynamicTexture, Color3 } from '@babylonjs/core';

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
  // Bevelled cuboid from a rounded-surface projection; consistent soft silhouette from every side.
  const p=[], normals=[],uvs=[], indices=[], ext=[w/2,h/2,d/2],n=8;
  for(let axis=0;axis<3;axis++)for(let sign of [-1,1]){
    const a=(axis+1)%3,b=(axis+2)%3,base=p.length/3;
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const q=[0,0,0];q[axis]=sign*ext[axis];q[a]=(i/n*2-1)*ext[a];q[b]=(j/n*2-1)*ext[b];
      const cl=q.map((v,k)=>Math.min(ext[k]-r,Math.max(-ext[k]+r,v)));
      const dv=q.map((v,k)=>v-cl[k]), len=Math.hypot(...dv)||1;
      const normal=dv.map(v=>v/len);
      p.push(...cl.map((v,k)=>v+normal[k]*r));normals.push(...normal);uvs.push(i/n,j/n);
    }
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const a0=base+j*(n+1)+i,b0=a0+1,c0=a0+n+1,d0=c0+1;
      if(sign>0)indices.push(a0,b0,c0,b0,d0,c0);
      else indices.push(a0,c0,b0,b0,c0,d0);
    }
  }
  const mesh=new Mesh(name,scene),v=new VertexData();v.positions=p;v.indices=indices;v.normals=normals;v.uvs=uvs;v.applyToMesh(mesh);
  mesh.material=material;mesh.parent=parent;mesh.position.set(x,y,z);return mesh;
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
export function makeItem(scene,item){
 const meta=byType[item.type];if(!meta)throw new Error('Unknown item: '+item.type);
 const M=getMaterials(scene), root=new TransformNode('item-'+item.id,scene);
 const cloth=makeMaterial(scene,'fabric-'+item.id,item.color||COLORS[2]), pastel=makeMaterial(scene,'detail-'+item.id,item.color||COLORS[2]);
 root.position.set(item.x||0,item.y||0,item.z||0);root.rotation.y=(item.rot||0)*Math.PI/2;
 const t=item.type, shadow=[];
 if(!['frame','window','rug','tablelamp','books','mug'].includes(t)) {
  const sm=makeMaterial(scene,'shadow-'+item.id,'#645447');sm.alpha=.12;sm.disableLighting=true;
  const disc=MeshBuilder.CreateDisc('foot-shadow',{radius:1,tessellation:36},scene);
  disc.parent=root;disc.rotation.x=-Math.PI/2;disc.position.y=.012;disc.scaling.set(meta.size[0]*.53,meta.size[1]*.54,1);disc.material=sm;disc.isPickable=false;shadow.push(disc);
 }
 if(t==='sofa'||t==='chair'){
  const w=t==='sofa'?2.45:1.12,d=1.14;
  box(scene,'upholstered-base',root,cloth,w,.48,d,0,.52,0,.2);
  box(scene,'sofa-back',root,cloth,w,.98,.29,0,.94,-d/2+.10,.14);
  for(let s of [-1,1]){box(scene,'soft-arm',root,cloth,.30,.60,d,s*(w/2-.15),.72,0,.14);
    cylinder(scene,'wood-foot',root,M.wood,s*(w/2-.24),.18,.39,.14,.26);
    cylinder(scene,'wood-foot',root,M.wood,s*(w/2-.24),.18,-.37,.14,.26);}
  const count=t==='sofa'?2:1;
  for(let i=0;i<count;i++){const cw=(w-.58)/count;
   box(scene,'seat-cushion',root,pastel,cw-.06,.20,.77,(-w+.58)/2+cw*(i+.5),.82,.17,.09);
   const pillow=makeMaterial(scene,'cushion-'+i+'-'+item.id,i?'#e4beaa':'#f4dfb9');
   box(scene,'scatter-cushion',root,pillow,t==='sofa'?.45:.38,.40,.16,(-w/2+.44)+(i*(w-.8)/(Math.max(1,count-1))),1.05,-.33,.11);
  }
 }
 if(t==='coffee'||t==='shelf'||t==='stool'){
   const w=meta.size[0],d=meta.size[1],top=meta.top;
   if(t==='shelf'){
    box(scene,'drawer-body',root,M.lightWood,w,top-.17,d,0,(top-.17)/2+.08,0,.08);
    for(let i=-1;i<=1;i++){box(scene,'drawer-front',root,M.wood,.48,.23,.035,i*.54,.78,d/2+.012,.035);
     orb(scene,'brass-knob',root,M.metal,i*.54,.78,d/2+.057,.065,.065,.038);}
   } else {
    box(scene,'tabletop',root,M.lightWood,w,.16,d,0,top-.06,0,.10);
    for(const x of [-1,1])for(const z of [-1,1])cylinder(scene,'turned-leg',root,M.wood,x*(w/2-.15),(top-.18)/2,z*(d/2-.14),.13,top-.18);
    if(t==='coffee')box(scene,'table-edge-inlay',root,M.wood,w-.16,.025,d-.16,0,top+.026,0,.012);
   }
 }
 if(t==='bed'){
   box(scene,'frame',root,M.wood,2.28,.32,2.62,0,.30,0,.15);
   box(scene,'mattress',root,M.cream,2.14,.30,2.46,0,.62,0,.13);
   box(scene,'cover',root,cloth,2.09,.13,1.60,0,.82,.48,.09);
   box(scene,'headboard',root,M.lightWood,2.28,.89,.20,0,.60,-1.28,.08);
   for(const x of [-.55,.55])box(scene,'pillow',root,M.paper,.83,.19,.47,x,.87,-.80,.13);
   for(const x of [-.88,.88])for(const z of [-1.1,1.1])cylinder(scene,'bed-foot',root,M.wood,x,.12,z,.16,.24);
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
   const pot=MeshBuilder.CreateCylinder('terracotta-pot',{height:.53,diameterTop:.46,diameterBottom:.30,tessellation:18},scene);
   pot.parent=root;pot.position.y=.30;pot.material=makeMaterial(scene,'pot-'+item.id,item.color||'#bf9078');
   cylinder(scene,'pot-rim',root,M.wood,0,.55,0,.47,.08);
   cylinder(scene,'stem',root,M.darkWood,0,1.01,0,.07,.91);
   for(let i=0;i<9;i++){const a=i*2.399,p=.25+(i%3)*.17,y=.88+(i%4)*.18;
    orb(scene,'leaf-cluster',root,i%2?M.leaf:M.leaf2,Math.cos(a)*p,y,Math.sin(a)*p,.39,.18,.25);}
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
   torus.parent=root;torus.position.set(.155,.16,0);torus.rotation.y=Math.PI/2;torus.material=cloth;
   cylinder(scene,'coffee',root,M.wood,0,.274,0,.19,.004);
 }
 if(t==='frame'){
   box(scene,'picture-mat',root,M.wood,1.37,1.13,.095,0,0,0,.035);
   box(scene,'picture-paper',root,M.cream,1.23,1.00,.022,0,0,.057,.012);
   box(scene,'hand-painted-landscape',root,M.art[(item.variant||0)%3],1.10,.87,.014,0,0,.071,.006);
 }
 if(t==='window'){
   box(scene,'outer-window',root,M.white,1.80,1.95,.11,0,0,0,.035);
   box(scene,'blue-glass',root,M.sky,1.52,1.70,.02,0,0,.064,.015);
   box(scene,'crossbar-vertical',root,M.white,.08,1.77,.09,0,0,.092,.012);
   box(scene,'crossbar-horizontal',root,M.white,1.57,.08,.09,0,0,.092,.012);
   box(scene,'window-ledge',root,M.lightWood,1.94,.11,.30,0,-.97,.17,.025);
   for(let i=0;i<3;i++)box(scene,'distant-hill',root,M.leaf2,.38,.37,.025,-.48+i*.50,-.57+i*.04,.082,.09);
 }
 for(const node of root.getChildMeshes(false)){node.metadata={itemId:item.id};node.isPickable=!shadow.includes(node);node.receiveShadows=true;}
 return root;
}
