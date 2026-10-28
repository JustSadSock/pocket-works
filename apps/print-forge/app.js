import {DEFINITIONS,DEFAULTS,normalizeJob,build,stlBuffer,gearOutline,transformedTriangle} from './geometry.js';
import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
installMobileRuntime();

const $=id=>document.getElementById(id);
const KEY='pocket-works:print-forge:v1';
const MATERIALS={PLA:1.24,PETG:1.27,ABS:1.04,TPU:1.21};
function loadMaterial(){try{const id=localStorage.getItem(KEY+':material');return Object.hasOwn(MATERIALS,id)?id:'PLA'}catch{return 'PLA'}}
const stage=$('stage'),ctx=stage.getContext('2d',{alpha:false});
const colors=['#d5dbcf','#d79a70','#d7b88a'];
const icons={
  gear_pair:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2 2M17.8 17.8l2 2M19.8 4.2l-2 2M6.2 17.8l-2 2"/>',
  tray:'<path d="m3 6 9-4 9 4-9 4zM3 6v11l9 5 9-5V6M12 10v12"/>',
  spacer:'<ellipse cx="12" cy="7" rx="9" ry="5"/><ellipse cx="12" cy="7" rx="3.5" ry="1.7"/><path d="M3 7v10c0 7 18 7 18 0V7"/>'
};
function loadJob(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return normalizeJob(saved)}catch{return {...DEFAULTS.gear_pair}}}
const state={job:loadJob(),material:loadMaterial(),model:null,view:'3d',zoom:1,yaw:.52,pitch:.67,
  running:false,rpm:30,direction:1,theta:0,last:0,drag:null,frame:false,
  cwidth:0,cheight:0,scale:1};
let toastTimer=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state.job))}catch{}}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2700)}
function fmt(n,digits=1){return Number(n).toLocaleString('ru-RU',{maximumFractionDigits:digits})}
function renderTemplates(){
  const root=$('templateButtons');root.replaceChildren();
  for(const [type,def] of Object.entries(DEFINITIONS)){
    const b=document.createElement('button');b.type='button';b.className=type===state.job.type?'selected':'';
    b.setAttribute('aria-pressed',type===state.job.type?'true':'false');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=icons[type];
    const label=document.createElement('span');label.textContent=type==='gear_pair'?'Шестерни':type==='tray'?'Корпус':'Втулка';
    b.append(svg,label);
    b.addEventListener('click',()=>{if(state.job.type===type)return;state.job={...DEFAULTS[type]};state.theta=0;state.running=false;state.view='3d';state.zoom=1;refresh();toast('Создан новый тип изделия')});
    root.append(b);
  }
}
function renderFields(){
  const root=$('modelFields');root.replaceChildren();
  for(const [key,label,min,max,step] of DEFINITIONS[state.job.type].fields){
    const field=document.createElement('label');field.className='field';
    const caption=document.createElement('span');caption.textContent=label;
    const wrap=document.createElement('div');wrap.className='input-wrap';
    const inp=document.createElement('input');inp.type='number';inp.inputMode='decimal';inp.min=String(min);inp.max=String(max);inp.step=String(step);inp.value=state.job[key];inp.dataset.key=key;inp.setAttribute('aria-label',label);
    const unit=document.createElement('small');unit.textContent=key.startsWith('teeth_')?'Z':'';
    inp.addEventListener('change',()=>{
      try{
        state.job=normalizeJob({...state.job,[key]:Number(inp.value)});
        $('errors').hidden=true;state.theta=0;refresh({keepFields:true});
      }catch(err){$('errors').textContent=err.message;$('errors').hidden=false;inp.value=state.job[key];toast('Проверь размеры: '+err.message)}
    });
    wrap.append(inp,unit);field.append(caption,wrap);root.append(field);
  }
}
function updatePartSelector(){
  const select=$('partSelect'),prior=select.value;select.replaceChildren();
  for(const part of state.model.parts){
    const option=document.createElement('option');option.value=part.name;option.textContent=part.title;select.append(option);
  }
  if(state.model.parts.some(p=>p.name===prior))select.value=prior;
}
function showReport(){
  const m=state.model;
  const good=m.checks.every(v=>v.watertight&&v.signed_volume_mm3>0);
  $('checkFlag').textContent=good?'СЕТКА ЗАМКНУТА':'НАЙДЕН ДЕФЕКТ';
  $('checkFlag').className=good?'pass':'fail';
  $('exportSTL').disabled=!good;
  const total=m.checks.reduce((n,v)=>n+v.triangles,0);
  const volume=m.checks.reduce((n,v)=>n+v.volume_mm3,0);
  const slots=[
    ['ДЕТАЛЕЙ',String(m.parts.length)],
    ['ТРЕУГОЛЬНИКОВ',fmt(total,0)],
    ['ОБЪЁМ',fmt(volume/1000,1)+' см³'],
    ['ЗАЦЕПЛЕНИЕ',m.job.type==='gear_pair'?fmt(m.facts.center_mm)+' мм':'—'],
    ['МАССА · 100%',fmt(volume/1000*MATERIALS[state.material],1)+' г']
  ];
  $('reportFacts').replaceChildren(...slots.map(([name,value])=>{
    const box=document.createElement('div'),cap=document.createElement('small'),val=document.createElement('strong');
    cap.textContent=name;val.textContent=value;box.append(cap,val);return box;
  }));
  $('reportNote').textContent=(m.warnings.join(' ')||'STL проверен на замкнутость и ориентацию поверхности.')+' Масса — оценка для сплошного тела без заполнения/поддержек. Прочность и печатаемость требуют проверки на принтере.';
  $('partExtras').replaceChildren();
  const strong=document.createElement('strong');
  const message=document.createElement('div');
  if(m.job.type==='gear_pair'){
    strong.textContent='Передаточное отношение '+fmt(m.facts.ratio,2)+' : 1';
    message.textContent='Межосевое расстояние '+fmt(m.facts.center_mm,2)+' мм · Угол давления 20° · Ведомая вращается в обратную сторону.';
  }else if(m.job.type==='tray'){
    strong.textContent='Толщина стенки '+fmt(m.job.wall_mm)+' мм';
    message.textContent='Открытая полость · Дно толщиной '+fmt(m.job.wall_mm)+' мм · Возможна печать отверстием вверх.';
  }else{
    strong.textContent='Радиальная стенка '+fmt(m.facts.radial_wall_mm,2)+' мм';
    message.textContent='Втулка с отверстием · Проверь посадочный зазор под реальный вал.';
  }
  $('partExtras').append(strong,message);
  const materialLabel=document.createElement('label');materialLabel.className='material-field';materialLabel.textContent='МАТЕРИАЛ ДЛЯ РАСЧЁТА МАССЫ';
  const materialSelect=document.createElement('select');materialSelect.setAttribute('aria-label','Материал для расчёта массы');
  for(const id of Object.keys(MATERIALS)){const option=document.createElement('option');option.value=id;option.textContent=id+' · '+MATERIALS[id]+' г/см³';materialSelect.append(option)}
  materialSelect.value=state.material;
  materialSelect.addEventListener('change',()=>{state.material=materialSelect.value;try{localStorage.setItem(KEY+':material',state.material)}catch{}showReport();toast('Оценка массы обновлена')});
  materialLabel.append(materialSelect);$('partExtras').append(materialLabel);
  $('modelTitle').textContent=DEFINITIONS[m.job.type].title;
  $('modelSubtitle').textContent=DEFINITIONS[m.job.type].description;
  $('modeMechanics').hidden=m.job.type!=='gear_pair';
  if(m.job.type!=='gear_pair'&&state.view==='mechanics')state.view='3d';
  $('mechanicsDock').hidden=state.view!=='mechanics';
  updateModeButtons();updateMotionInfo();
}
function updateModeButtons(){
  for(const [id,mode] of [['mode3d','3d'],['modeMechanics','mechanics']]){
    const b=$(id);b.classList.toggle('active',state.view===mode);b.setAttribute('aria-pressed',state.view===mode?'true':'false');
  }
  $('stageMode').textContent=state.view==='3d'?'ИЗОМЕТРИЯ / МИЛЛИМЕТРЫ':'ВИД СВЕРХУ / КИНЕМАТИКА';
  $('canvasHint').textContent=state.view==='3d'?'Потяни, чтобы повернуть модель':'Поверни любую шестерню пальцем';
  $('mechanicsDock').hidden=state.view!=='mechanics';
}
function updateMotionInfo(){
  if(state.job.type!=='gear_pair')return;
  const m=state.model;
  $('rpmValue').textContent=state.rpm;
  $('driveRpm').textContent=(state.rpm*state.direction)+' об/мин';
  $('drivenRpm').textContent=fmt(state.rpm*state.direction*m.facts.rpm_factor,2)+' об/мин';
  $('gearRatio').textContent='1 : '+fmt(m.facts.ratio,2);
  $('playMotion').textContent=state.running?'Ⅱ Пауза':'▶ Запустить';
  $('playMotion').setAttribute('aria-pressed',state.running?'true':'false');
}
function refresh({keepFields=false}={}){
  try{
    state.model=build(state.job);
    $('errors').hidden=true;save();
    renderTemplates();if(!keepFields)renderFields();
    showReport();requestRender();
  }catch(e){$('errors').textContent=e.message;$('errors').hidden=false;toast(e.message)}
}
function resize(){
  const rect=stage.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  if(!rect.width||!rect.height)return;
  state.cwidth=rect.width;state.cheight=rect.height;
  const cw=Math.round(rect.width*dpr),ch=Math.round(rect.height*dpr);
  if(stage.width!==cw||stage.height!==ch){stage.width=cw;stage.height=ch}
  ctx.setTransform(dpr,0,0,dpr,0,0);requestRender();
}
function background(){
  const w=state.cwidth,h=state.cheight;
  ctx.fillStyle='#13292c';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#284448';ctx.lineWidth=.6;
  const spacing=32;
  for(let x=(w/2)%spacing;x<w;x+=spacing){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
  for(let y=(h/2)%spacing;y<h;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  ctx.strokeStyle='#36575a';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(w/2-9,h/2);ctx.lineTo(w/2+9,h/2);ctx.moveTo(w/2,h/2-9);ctx.lineTo(w/2,h/2+9);ctx.stroke();
}
function dimensionSpan(){
  const {job}=state.model;
  if(job.type==='gear_pair'){
    const r1=job.module_mm*(job.teeth_a+2)/2,r2=job.module_mm*(job.teeth_b+2)/2;
    return {x:state.model.facts.center_mm+r1+r2,y:2*Math.max(r1,r2),z:job.thickness_mm};
  }
  if(job.type==='tray')return{x:job.width_mm,y:job.depth_mm,z:job.height_mm};
  return{x:job.outer_diameter_mm,y:job.outer_diameter_mm,z:job.height_mm};
}
function fitScale(){
  const span=dimensionSpan(),w=state.cwidth,h=state.cheight;
  state.scale=Math.max(.2,Math.min((w-72)/(span.x*1.45+span.y*.25),(h-85)/(span.y*.9+span.z*1.3+span.x*.22))*state.zoom);
  $('scaleLabel').textContent=fmt(80/state.scale,1)+' мм';
  return state.scale;
}
function project(p){
  const [x,y,z]=p,cy=Math.cos(state.yaw),sy=Math.sin(state.yaw);
  const rx=x*cy-y*sy,ry=x*sy+y*cy;
  const tilt=state.pitch,cz=Math.cos(tilt),sz=Math.sin(tilt);
  const height=dimensionSpan().z/2;
  return {x:state.cwidth/2+rx*state.scale,y:state.cheight/2-(ry*sz-(z-height)*cz)*state.scale,depth:ry*cz+(z-height)*sz};
}
function render3D(){
  fitScale();
  const triangles=[];
  for(let i=0;i<state.model.parts.length;i++){
    const part=state.model.parts[i], angle=state.job.type==='gear_pair'?(i===0?state.theta:Math.PI/state.job.teeth_b-state.theta*state.job.teeth_a/state.job.teeth_b):0;
    for(const tri of part.mesh.triangles){
      const world=transformedTriangle(tri,part,angle);
      const p=world.map(project);
      const area=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x);
      if(area>=-.015)continue;
      const u=world[1].map((v,k)=>v-world[0][k]),v=world[2].map((q,k)=>q-world[0][k]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const norm=Math.hypot(...normal)||1;
      const light=Math.max(.13,Math.min(.95,.55+(.65*normal[2]-.32*normal[1]-.25*normal[0])/norm*.4));
      triangles.push({p,depth:(p[0].depth+p[1].depth+p[2].depth)/3,light,i});
    }
  }
  triangles.sort((a,b)=>a.depth-b.depth);
  for(const t of triangles){
    const tint=t.i===0?[205,214,200]:[217,156,113];
    const l=t.light+.12;
    ctx.fillStyle='rgb('+tint.map(x=>Math.max(0,Math.min(255,Math.round(x*l)))).join(',')+')';
    ctx.beginPath();ctx.moveTo(t.p[0].x,t.p[0].y);
    ctx.lineTo(t.p[1].x,t.p[1].y);ctx.lineTo(t.p[2].x,t.p[2].y);ctx.closePath();ctx.fill();
  }
}
function angleFor(i){return i===0?state.theta:Math.PI/state.job.teeth_b-state.theta*state.job.teeth_a/state.job.teeth_b}
function renderMechanics(){
  fitScale();const {job}=state.model;
  const scale=state.scale,cy=state.cheight/2,cx=state.cwidth/2;
  ctx.save();ctx.translate(cx,cy);ctx.scale(scale,-scale);
  for(let i=0;i<state.model.parts.length;i++){
    const part=state.model.parts[i],n=i===0?job.teeth_a:job.teeth_b;
    const r=job.module_mm*n/2,angle=angleFor(i),poly=gearOutline(n,job.module_mm);
    ctx.save();ctx.translate(part.x,part.y);ctx.rotate(angle);
    ctx.beginPath();poly.forEach((p,k)=>k?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
    ctx.moveTo(job.bore_mm/2,0);ctx.arc(0,0,job.bore_mm/2,0,Math.PI*2);
    ctx.fillStyle=i===0?'#cfd8cb':'#d7a27c';ctx.fill('evenodd');
    ctx.lineWidth=.18;ctx.strokeStyle=i===0?'#8eaa9d':'#aa744c';ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.strokeStyle='#b38f668a';ctx.lineWidth=.18;ctx.setLineDash([1.8,1.4]);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(job.bore_mm/2+1,0);ctx.lineTo(r*.75,0);ctx.strokeStyle='#1c4244';ctx.lineWidth=.8;ctx.stroke();
    ctx.restore();
    ctx.beginPath();ctx.arc(part.x,0,.8,0,Math.PI*2);ctx.fillStyle='#2c4e4b';ctx.fill();
  }
  ctx.strokeStyle='#70b19f';ctx.lineWidth=.25;ctx.setLineDash([2,2]);
  ctx.beginPath();ctx.moveTo(-state.model.facts.center_mm/2,0);ctx.lineTo(state.model.facts.center_mm/2,0);ctx.stroke();
  ctx.restore();
  ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillStyle='#b9cdcc';
  for(let i=0;i<2;i++){
    const part=state.model.parts[i];
    ctx.fillText(i===0?'ВЕДУЩАЯ':'ВЕДОМАЯ',cx+part.x*scale,cy+((i===0?-1:1)*(job.module_mm*(i===0?job.teeth_a:job.teeth_b)/2+9))*scale*-1);
  }
}
function draw(){if(!state.model||!state.cwidth)return;background();try{if(state.view==='mechanics')renderMechanics();else render3D()}catch(e){console.error('Render error',e);toast('Не удалось отобразить модель')}}
function requestRender(){
  if(state.frame)return;state.frame=true;
  requestAnimationFrame(now=>{
    state.frame=false;
    if(state.running&&state.view==='mechanics'&&!document.hidden){
      if(state.last){let dt=Math.min(.05,(now-state.last)/1000);state.theta+=state.direction*state.rpm*2*Math.PI/60*dt;}
      state.last=now;
    }else state.last=0;
    draw();
    if(state.running&&state.view==='mechanics'&&!document.hidden)requestRender();
  });
}
function setView(view){
  if(view==='mechanics'&&state.job.type!=='gear_pair')return;
  state.view=view;
  if(view==='3d')state.running=false;
  state.zoom=1;updateModeButtons();updateMotionInfo();requestRender();
}
function download(name,data,mime){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('mode3d').addEventListener('click',()=>setView('3d'));
$('modeMechanics').addEventListener('click',()=>setView('mechanics'));
$('zoomIn').addEventListener('click',()=>{state.zoom=Math.min(2.8,state.zoom*1.2);requestRender()});
$('zoomOut').addEventListener('click',()=>{state.zoom=Math.max(.45,state.zoom/1.2);requestRender()});
$('resetCamera').addEventListener('click',()=>{state.zoom=1;state.yaw=.52;state.pitch=.67;requestRender();toast('Вид восстановлен')});
$('newProject').addEventListener('click',()=>$('resetDialog').showModal());
$('cancelReset').addEventListener('click',()=>$('resetDialog').close());
$('acceptReset').addEventListener('click',()=>{state.job={...DEFAULTS.gear_pair};state.view='3d';state.zoom=1;state.theta=0;state.running=false;refresh();$('resetDialog').close();toast('Новый проект создан')});
$('rpm').addEventListener('input',e=>{state.rpm=Number(e.target.value);updateMotionInfo();requestRender()});
$('playMotion').addEventListener('click',()=>{state.running=!state.running;state.last=0;updateMotionInfo();requestRender()});
$('reverseMotion').addEventListener('click',()=>{state.direction*=-1;updateMotionInfo();requestRender();toast('Направление вращения изменено')});
$('zeroMotion').addEventListener('click',()=>{state.theta=0;state.running=false;updateMotionInfo();requestRender();toast('Механизм в исходном положении')});
$('exportSTL').addEventListener('click',()=>{
  try{
    const part=state.model.parts.find(p=>p.name===$('partSelect').value);
    if(!part)throw Error('Деталь не выбрана');
    const check=state.model.checks.find(c=>c.name===part.name);
    if(!check.watertight||check.signed_volume_mm3<=0)throw Error('Сетка не прошла проверку');
    download('pocket-forge-'+part.name+'.stl',stlBuffer(part),'model/stl');
    toast(part.title+' · STL сохранён в миллиметрах');
  }catch(e){toast(e.message)}
});
$('exportSpec').addEventListener('click',()=>{download('pocket-forge-job.json',JSON.stringify(state.job,null,2)+'\n','application/json');toast('CAD-задание сохранено')});
$('importSpec').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(file.size>20000)throw Error('Размер файла превышает 20 КБ');
    const job=normalizeJob(JSON.parse(await file.text()));
    state.job=job;state.theta=0;state.running=false;state.view='3d';state.zoom=1;refresh();toast('Проект успешно открыт');
  }catch(err){toast('Не удалось открыть проект: '+err.message)}
  finally{e.target.value=''}
});
stage.addEventListener('pointerdown',e=>{
  if(!state.model)return;
  stage.setPointerCapture(e.pointerId);
  if(state.view==='3d'){state.drag={mode:'camera',x:e.clientX,y:e.clientY};return}
  const rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  fitScale();
  for(let i=0;i<2;i++){
    const part=state.model.parts[i];
    const px=state.cwidth/2+part.x*state.scale,py=state.cheight/2;
    const rad=state.job.module_mm*((i===0?state.job.teeth_a:state.job.teeth_b)+2)/2*state.scale;
    if(Math.hypot(x-px,y-py)<=rad&&Math.hypot(x-px,y-py)>state.job.bore_mm/2*state.scale){
      state.running=false;updateMotionInfo();
      state.drag={mode:'gear',index:i,angle:Math.atan2(py-y,x-px),px,py};return;
    }
  }
});
stage.addEventListener('pointermove',e=>{
  const d=state.drag;if(!d)return;
  if(d.mode==='camera'){state.yaw+=Math.max(-50,Math.min(50,e.clientX-d.x))*.009;state.pitch=Math.max(.23,Math.min(1.45,state.pitch+(e.clientY-d.y)*.006));d.x=e.clientX;d.y=e.clientY;}
  if(d.mode==='gear'){
    const rect=stage.getBoundingClientRect(),angle=Math.atan2(d.py-(e.clientY-rect.top),(e.clientX-rect.left)-d.px);
    let delta=angle-d.angle;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;
    state.theta+=d.index===0?delta:-delta*state.job.teeth_b/state.job.teeth_a;d.angle=angle;
  }
  requestRender();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>state.drag=null);
stage.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.45,Math.min(2.8,state.zoom*(e.deltaY>0?.9:1.1)));requestRender()},{passive:false});
stage.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    e.preventDefault();if(state.view==='mechanics'){state.theta+=(e.key==='ArrowRight'?1:-1)*.11}else state.yaw+=(e.key==='ArrowRight'?1:-1)*.12;requestRender();
  }
});
document.addEventListener('visibilitychange',()=>{state.last=0;if(!document.hidden)requestRender()});
if(!ctx){$('errors').textContent='Canvas 2D недоступен в этом браузере';$('errors').hidden=false;}else{
  refresh();const observer=new ResizeObserver(resize);observer.observe(stage);resize();
}

createWorkshopMode({appName:'Pocket Forge 3D',version:'1.0.0',cachePrefix:'print-forge-',storageNamespace:'pocket-works:print-forge',onReset:()=>{state.job={...DEFAULTS.gear_pair};state.running=false;state.theta=0;state.view='3d';refresh()}});
