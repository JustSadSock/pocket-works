// Pocket Forge 3D · deterministic millimetre-space mesh kernel.
// No external services or runtime dependencies.
export const DEFINITIONS = {
  gear_pair: {title:'Зубчатая передача',description:'Две эвольвентные шестерни с общей осью зацепления',fields:[
    ['teeth_a','Зубья ведущей',17,90,1],['teeth_b','Зубья ведомой',17,90,1],
    ['module_mm','Модуль · мм',0.8,4,0.1],['thickness_mm','Толщина · мм',2,25,0.5],['bore_mm','Диаметр вала · мм',2,24,0.5]]},
  tray: {title:'Корпус-лоток',description:'Полый корпус с плоским дном и открытым верхом',fields:[
    ['width_mm','Ширина · мм',20,200,1],['depth_mm','Глубина · мм',20,200,1],
    ['height_mm','Высота · мм',6,100,1],['wall_mm','Стенка · мм',1.2,6,0.2]]},
  spacer: {title:'Втулка',description:'Цилиндрическая дистанционная втулка с отверстием',fields:[
    ['outer_diameter_mm','Внешний Ø · мм',5,100,0.5],['bore_mm','Внутренний Ø · мм',1,60,0.5],
    ['height_mm','Высота · мм',1,100,0.5]]}
};
export const DEFAULTS = {
  gear_pair:{type:'gear_pair',teeth_a:18,teeth_b:36,module_mm:2,thickness_mm:7,bore_mm:5},
  tray:{type:'tray',width_mm:80,depth_mm:60,height_mm:25,wall_mm:2},
  spacer:{type:'spacer',outer_diameter_mm:22,bore_mm:8,height_mm:12}
};
const TAU=Math.PI*2;
const pt=(r,a)=>[r*Math.cos(a),r*Math.sin(a)];
const mesh=()=>({triangles:[]});
function triangle(out,a,b,c){out.triangles.push([a,b,c]);}
function quad(out,a,b,c,d){triangle(out,a,b,c);triangle(out,a,c,d);}
export function normalizeJob(data){
  if(!data || typeof data!=='object' || !Object.hasOwn(DEFINITIONS,data.type)) throw Error('Неизвестный тип изделия');
  const job={type:data.type};
  for(const [key,,min,max,step] of DEFINITIONS[data.type].fields){
    const n=Number(data[key]);
    if(!Number.isFinite(n)||n<min||n>max||(key.startsWith('teeth_')&&!Number.isInteger(n))) throw Error('Недопустимый параметр: '+key);
    job[key]=Math.round(n/step)*step;
    job[key]=Number(job[key].toFixed(4));
  }
  if(data.type==='gear_pair'){
    const {teeth_a:a,teeth_b:b,module_mm:m,bore_mm:hole}=job;
    if(m*(Math.max(a,b)+2)>250)throw Error('Диаметр шестерни превышает 250 мм');
    if(hole>=m*(Math.min(a,b)-2.5)-2)throw Error('Отверстие слишком велико для ступицы шестерни');
  }
  if(data.type==='tray' && (job.wall_mm*2>=Math.min(job.width_mm,job.depth_mm)||job.wall_mm>=job.height_mm))throw Error('Стенка слишком толстая для корпуса');
  if(data.type==='spacer' && job.bore_mm>=job.outer_diameter_mm-2)throw Error('Толщина стенки втулки должна быть не менее 1 мм');
  return job;
}
export function gearOutline(teeth,module){
  const rp=module*teeth/2,rb=rp*Math.cos(Math.PI/9),rr=Math.max(module*.3,rp-1.25*module),ra=rp+module;
  const alpha=Math.PI/9,halfBase=Math.PI/(2*teeth)+(Math.tan(alpha)-alpha);
  const half=(r)=>{
    if(r<=rb)return halfBase;
    const beta=Math.acos(Math.min(1,rb/r));
    return halfBase-(Math.tan(beta)-beta);
  };
  const outline=[];
  for(let i=0;i<teeth;i++){
    const center=i*TAU/teeth;
    outline.push(pt(rr,center-Math.PI/teeth),pt(rr,center-halfBase));
    for(let k=1;k<=8;k++){const r=rr+(ra-rr)*k/8;outline.push(pt(r,center-half(r)));}
    for(let k=1;k<=4;k++){outline.push(pt(ra,center+half(ra)*(-1+2*k/4)));}
    for(let k=1;k<=8;k++){const r=ra-(ra-rr)*k/8;outline.push(pt(r,center+half(r)));}
  }
  return outline;
}
// Annular extrusion of a star-shaped CCW outline, with an independent round bore.
function ring(outer,innerRadius,height){
  const out=mesh(),n=outer.length;
  for(let i=0;i<n;i++){
    const j=(i+1)%n, a=outer[i],b=outer[j];
    const ar=Math.hypot(...a),br=Math.hypot(...b);
    const ai=[a[0]*innerRadius/ar,a[1]*innerRadius/ar],bi=[b[0]*innerRadius/br,b[1]*innerRadius/br];
    const oa=[...a,height],ob=[...b,height],ia=[...ai,height],ib=[...bi,height];
    const oaz=[...a,0],obz=[...b,0],iaz=[...ai,0],ibz=[...bi,0];
    quad(out,oa,ob,ib,ia); // upward annular top
    quad(out,obz,oaz,iaz,ibz); // downward annular bottom
    quad(out,oaz,obz,ob,oa); // outward perimeter
    quad(out,ibz,iaz,ia,ib); // inward bore
  }
  return out;
}
function makeTray({width_mm:w,depth_mm:d,height_mm:h,wall_mm:t}){
  const out=mesh(),o=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  const inn=[[-w/2+t,-d/2+t],[w/2-t,-d/2+t],[w/2-t,d/2-t],[-w/2+t,d/2-t]];
  const v=(p,z)=>[p[0],p[1],z];
  quad(out,v(o[3],0),v(o[2],0),v(o[1],0),v(o[0],0));
  quad(out,v(inn[0],t),v(inn[1],t),v(inn[2],t),v(inn[3],t));
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    quad(out,v(o[i],0),v(o[j],0),v(o[j],h),v(o[i],h));
    quad(out,v(o[i],h),v(o[j],h),v(inn[j],h),v(inn[i],h));
    quad(out,v(inn[i],t),v(inn[i],h),v(inn[j],h),v(inn[j],t));
  }
  return out;
}
export function build(jobInput){
  const job=normalizeJob(jobInput);
  let parts=[],facts={},warnings=[];
  if(job.type==='gear_pair'){
    const {teeth_a:a,teeth_b:b,module_mm:m,thickness_mm:h,bore_mm:hole}=job;
    const distance=m*(a+b)/2;
    parts=[
      {name:'gear-a',title:'Ведущая шестерня',mesh:ring(gearOutline(a,m),hole/2,h),x:-distance/2,y:0,teeth:a},
      {name:'gear-b',title:'Ведомая шестерня',mesh:ring(gearOutline(b,m),hole/2,h),x:distance/2,y:0,teeth:b}
    ];
    facts={ratio:b/a,center_mm:distance,rpm_factor:-a/b,tip_a_mm:m*(a+2),tip_b_mm:m*(b+2)};
    warnings.push('Корень зуба упрощён; перед печатью проверь посадку, зазор и зацепление на реальном образце.');
  }else if(job.type==='tray'){
    parts=[{name:'tray',title:'Корпус',mesh:makeTray(job),x:0,y:0}];
    facts={wall_mm:job.wall_mm,capacity_mm3:(job.width_mm-2*job.wall_mm)*(job.depth_mm-2*job.wall_mm)*(job.height_mm-job.wall_mm)};
  }else{
    const {outer_diameter_mm:od,bore_mm:hole,height_mm:h}=job;
    const circle=Array.from({length:128},(_,i)=>pt(od/2,i*TAU/128));
    parts=[{name:'spacer',title:'Втулка',mesh:ring(circle,hole/2,h),x:0,y:0}];
    facts={radial_wall_mm:(od-hole)/2};
  }
  const summaries=parts.map(part=>({name:part.name,...checkMesh(part.mesh)}));
  return {job,parts,facts,warnings,checks:summaries};
}
const keyPoint=(p)=>p.map(x=>Math.round(x*1e5)).join(',');
export function checkMesh(m){
  const edges=new Map(),points=[];
  let signed=0;
  for(const tri of m.triangles){
    for(let i=0;i<3;i++){
      const a=tri[i],b=tri[(i+1)%3],k1=keyPoint(a),k2=keyPoint(b);
      const k=k1<k2?k1+'|'+k2:k2+'|'+k1;
      edges.set(k,(edges.get(k)||0)+1);points.push(a);
    }
    const [a,b,c]=tri;
    signed+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  const bounds=[0,1,2].map(k=>[Math.min(...points.map(p=>p[k])),Math.max(...points.map(p=>p[k]))]);
  return {triangles:m.triangles.length,watertight:[...edges.values()].every(v=>v===2),
    volume_mm3:Math.abs(signed),signed_volume_mm3:signed,size_mm:bounds.map(b=>b[1]-b[0])};
}
export function transformedTriangle(tri,part,rotation=0){
  const c=Math.cos(rotation),s=Math.sin(rotation);
  return tri.map(([x,y,z])=>[x*c-y*s+part.x,x*s+y*c+part.y,z]);
}
export function stlBuffer(part,angle=0){
  const tris=part.mesh.triangles,n=tris.length;
  const buffer=new ArrayBuffer(84+n*50),view=new DataView(buffer);
  const marker='Pocket Forge 3D | mm | watertight mesh';
  for(let i=0;i<marker.length;i++)view.setUint8(i,marker.charCodeAt(i));
  view.setUint32(80,n,true);
  for(let i=0;i<n;i++){
    const [a,b,c]=transformedTriangle(tris[i],{x:0,y:0},angle);
    const u=b.map((n,k)=>n-a[k]),v=c.map((n,k)=>n-a[k]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const len=Math.hypot(...normal)||1;
    let off=84+i*50;
    for(let k=0;k<3;k++)view.setFloat32(off+k*4,normal[k]/len,true);off+=12;
    for(const p of [a,b,c]){for(let k=0;k<3;k++)view.setFloat32(off+k*4,p[k],true);off+=12;}
    view.setUint16(off,0,true);
  }
  return buffer;
}
