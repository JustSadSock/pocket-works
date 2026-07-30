const FORMATS=new Set(['forma-blueprint-1','forma-plan-1','blueprint-1']);
const COLORS=['#d7d3c8','#e46f3f','#294f53','#76908a','#d2a34b','#8b6d64'];
const KINDS=new Set(['spurGear','flywheel','plate','box','cylinder','tube','axle','knob','gearboxFrame','custom']);
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const pos=(v,d)=>{const x=n(v,d);return x>0?x:d};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const v3=(v,d=[0,0,0])=>Array.isArray(v)?[n(v[0],d[0]),n(v[1],d[1]),n(v[2],d[2])]:d.slice();
const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const clean=v=>String(v||'part').trim().replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'part';
const color=(v,d)=>/^#[\da-f]{6}$/i.test(String(v||''))?String(v).toLowerCase():d;
const round=(v,p=2)=>Math.round(v*10**p)/10**p;

export class BlueprintError extends Error{
  constructor(issues,source){const a=Array.isArray(issues)?issues:[issues];super(`FormaBlueprint отклонён:\n${a.map((x,i)=>`${i+1}. ${x}`).join('\n')}`);this.name='BlueprintError';this.issues=a;this.source=source;}
}
export const isFormaBlueprint=o=>Boolean(o&&typeof o==='object'&&FORMATS.has(String(o.format||o.schema||'').toLowerCase()));
export const looksLikeBlueprintText=s=>/["'](?:format|schema)["']\s*:\s*["'](?:forma-blueprint-1|forma-plan-1|blueprint-1)["']/i.test(String(s||''));

export function compileBlueprint(source){
  const issues=[],warnings=[],decisions=[];
  if(!isFormaBlueprint(source))throw new BlueprintError('Ожидается "format": "forma-blueprint-1".',source);
  const print={clearance:pos(source.print?.clearance,.28),minWall:pos(source.print?.minWall,1.6),nozzle:pos(source.print?.nozzle,.4)};
  const raw=Array.isArray(source.parts)?source.parts:[];
  if(!raw.length)issues.push('Нужен непустой массив parts.');
  const ids=new Set();
  const parts=raw.map((r,i)=>{
    r=r&&typeof r==='object'?r:{};
    const id=clean(r.id||`part-${i+1}`),kind=String(r.kind||'');
    if(ids.has(id))issues.push(`Повторяющийся id: ${id}.`);ids.add(id);
    if(!KINDS.has(kind))issues.push(`${id}: неизвестный kind «${kind||'пусто'}».`);
    return {raw:r,id,kind,name:String(r.name||id).slice(0,80),color:color(r.color,COLORS[i%COLORS.length]),position:v3(r.position),explicit:Array.isArray(r.position),g:{}};
  });
  const byId=new Map(parts.map(p=>[p.id,p]));
  parts.forEach(p=>describe(p,print,issues,warnings));
  const constraints=(Array.isArray(source.constraints)?source.constraints:[]).map((c,i)=>normalizeConstraint(c,i,byId,issues)).filter(Boolean);
  solve(parts,byId,constraints,issues,decisions);
  validate(parts,constraints,print,issues,warnings);
  if(issues.length)throw new BlueprintError(issues,source);
  const out=[];
  for(const p of parts)out.push(...compilePart(p,byId,print,issues,warnings,decisions));
  if(issues.length)throw new BlueprintError(issues,source);
  const pairs=constraints.filter(c=>c.type==='gearMesh').map(c=>({a:c.a,b:c.b,ratio:round(byId.get(c.b).g.teeth/byId.get(c.a).g.teeth,3),centerDistance:round(dist(byId.get(c.a).position,byId.get(c.b).position),3)}));
  const report={sourceParts:parts.length,outputParts:out.length,constraints:constraints.length,gearPairs:pairs,warnings,decisions};
  return {document:{format:'formacode-1',name:String(source.name||'Blueprint').slice(0,120),units:'mm',author:'FORMA Blueprint compiler',notes:`Скомпилировано из FormaBlueprint 1. ${out.length} печатных деталей.`,settings:{detail:clamp(Math.round(n(source.settings?.detail,56)),24,86),margin:clamp(n(source.settings?.margin,2),.5,12)},parts:out},report};
}

function describe(p,print,issues,warnings){const r=p.raw,g=p.g;
  if(p.kind==='spurGear'){g.teeth=Math.round(pos(r.teeth,16));g.module=pos(r.module,1.2);g.thickness=pos(r.thickness,5);g.bore=pos(r.bore,3.4);g.pitch=g.teeth*g.module/2;g.outer=g.pitch+g.module;g.root=Math.max(g.pitch-1.25*g.module,g.bore/2+print.minWall);g.hub=pos(r.hubDiameter,Math.max(g.bore+2*print.minWall,g.root));g.holes=r.lighteningHoles||null;if(g.teeth<8)issues.push(`${p.id}: минимум 8 зубьев.`);if(g.module<print.nozzle*1.5)warnings.push(`${p.id}: module ${g.module} мал для сопла ${print.nozzle}.`);}
  else if(p.kind==='flywheel'){g.diameter=pos(r.diameter,36);g.thickness=pos(r.thickness,6);g.bore=pos(r.bore,4);g.rim=pos(r.rimWidth,4);g.spokes=clamp(Math.round(pos(r.spokes,6)),3,16);g.spoke=pos(r.spokeWidth,3);g.hub=pos(r.hubDiameter,10);}
  else if(p.kind==='plate'||p.kind==='box'){g.size=v3(r.size,p.kind==='plate'?[40,24,3]:[20,20,20]).map(Math.abs);g.radius=clamp(n(r.radius,2),0,Math.min(...g.size)/2-.001);g.features=Array.isArray(r.features)?r.features:[];}
  else if(p.kind==='cylinder'||p.kind==='axle'){g.radius=pos(r.radius,pos(r.diameter,8)/2);g.height=pos(r.height||r.length,10);g.axis=['x','y','z'].includes(r.axis)?r.axis:'z';}
  else if(p.kind==='tube'){g.outer=pos(r.outerDiameter,12);g.inner=pos(r.innerDiameter||r.bore,6);g.height=pos(r.height,8);if(g.inner+2*print.minWall>=g.outer)issues.push(`${p.id}: стенка tube слишком тонкая.`);}
  else if(p.kind==='knob'){g.diameter=pos(r.diameter,28);g.height=pos(r.height,16);g.bore=pos(r.bore,6);g.grips=clamp(Math.round(pos(r.grips,24)),8,64);}
  else if(p.kind==='gearboxFrame'){g.gears=Array.isArray(r.gears)?r.gears.map(String):[];g.expose=new Set(Array.isArray(r.expose)?r.expose.map(String):[]);g.wall=pos(r.wall,2.4);g.base=pos(r.baseThickness,2.2);g.cover=pos(r.coverThickness,2);g.axial=pos(r.axialClearance,.3);g.peg=pos(r.pegDiameter,3);g.fit=pos(r.pegFit,.08);if(!g.gears.length)issues.push(`${p.id}: gearboxFrame требует gears:[id,...].`);}
  else if(p.kind==='custom'){if(!r.node||typeof r.node!=='object')issues.push(`${p.id}: custom требует node.`);}
}
function normalizeConstraint(c,i,byId,issues){if(!c||typeof c!=='object'){issues.push(`constraints[${i}] неверен.`);return null;}const type=String(c.type||'');if(!['gearMesh','coaxial','offset','align'].includes(type)){issues.push(`constraints[${i}]: неизвестный type «${type}».`);return null;}const a=String(c.a||''),b=String(c.b||'');if(!byId.has(a)||!byId.has(b))issues.push(`constraints[${i}]: неизвестная ссылка ${!byId.has(a)?a:b}.`);return {...c,type,a,b};}
function solve(parts,byId,constraints,issues,decisions){
  for(let pass=0;pass<4;pass++)for(const c of constraints){const a=byId.get(c.a),b=byId.get(c.b);if(!a||!b)continue;
    if(c.type==='gearMesh'){if(a.kind!=='spurGear'||b.kind!=='spurGear'){issues.push(`gearMesh ${c.a}/${c.b}: обе детали должны быть spurGear.`);continue;}if(Math.abs(a.g.module-b.g.module)>.001){issues.push(`gearMesh ${c.a}/${c.b}: module должен совпадать (${a.g.module} ≠ ${b.g.module}).`);continue;}const d=a.g.pitch+b.g.pitch+Math.max(0,n(c.clearance,.2));const ang=n(c.angle,0)*Math.PI/180;if(!b.explicit){b.position=[a.position[0]+Math.cos(ang)*d,a.position[1]+Math.sin(ang)*d,a.position[2]];b.explicit=true;}else if(!a.explicit){a.position=[b.position[0]-Math.cos(ang)*d,b.position[1]-Math.sin(ang)*d,a.position[2]];a.explicit=true;}decisions.push(`${c.a}↔${c.b}: межосевое ${round(d)} мм.`);}
    if(c.type==='coaxial'&&!b.explicit){b.position=a.position.slice();b.explicit=true;}
    if(c.type==='offset'&&!b.explicit){const q=v3(c.offset);b.position=a.position.map((v,i)=>v+q[i]);b.explicit=true;}
    if(c.type==='align'&&!b.explicit){b.position=a.position.slice();const axes=String(c.axes||'xy');if(!axes.includes('x'))b.position[0]=0;if(!axes.includes('y'))b.position[1]=0;if(!axes.includes('z'))b.position[2]=0;b.explicit=true;}
  }
  let cursor=0;for(const p of parts){if(!p.explicit&&p.kind!=='gearboxFrame'){p.position=[cursor,0,0];p.explicit=true;cursor+=span(p)+6;}}
}
function validate(parts,constraints,print,issues,warnings){for(const p of parts){if(p.kind==='gearboxFrame')for(const id of p.g.gears)if(!parts.some(x=>x.id===id&&['spurGear','flywheel'].includes(x.kind)))issues.push(`${p.id}: gears содержит неподдерживаемую ссылку ${id}.`);if(p.kind==='spurGear'&&p.g.bore/2+print.minWall>=p.g.root)issues.push(`${p.id}: bore оставляет недостаточно материала у корня зубьев.`);}for(const c of constraints.filter(x=>x.type==='gearMesh')){const a=parts.find(p=>p.id===c.a),b=parts.find(p=>p.id===c.b);if(a&&b){const expected=a.g.pitch+b.g.pitch+Math.max(0,n(c.clearance,.2)),actual=dist(a.position,b.position);if(Math.abs(expected-actual)>.35)warnings.push(`${c.a}/${c.b}: фактическое межосевое ${round(actual)} вместо ${round(expected)} мм.`);}}}
function compilePart(p,byId,print,issues,warnings,decisions){let node;
  if(p.kind==='spurGear')node=gearNode(p,print);
  else if(p.kind==='flywheel')node=flywheelNode(p);
  else if(p.kind==='plate'||p.kind==='box')node=featureNode(box(p.g.size,p.g.radius,[0,0,p.g.size[2]/2]),p.g.features,p.g.size[2],issues,p.id);
  else if(p.kind==='cylinder'||p.kind==='axle')node=cyl(p.g.radius,p.g.height,p.g.axis,axisCenter(p.g.axis,p.g.height/2));
  else if(p.kind==='tube')node=sub(cyl(p.g.outer/2,p.g.height,'z',[0,0,p.g.height/2]),cyl(p.g.inner/2,p.g.height+2,'z',[0,0,p.g.height/2]));
  else if(p.kind==='knob'){const body=cyl(p.g.diameter/2,p.g.height,'z',[0,0,p.g.height/2]);const grip={type:'radialArray',count:p.g.grips,axis:'z',child:box([2.2,3,p.g.height-1],.7,[p.g.diameter/2,0,p.g.height/2])};node=sub(union(body,grip),cyl(p.g.bore/2,p.g.height+2,'z',[0,0,p.g.height/2]));}
  else if(p.kind==='custom')node=clone(p.raw.node);
  else if(p.kind==='gearboxFrame')return frameNodes(p,byId,print,issues,warnings,decisions);
  if(!node)return[];node=move(node,p.position);return[{id:p.id,name:p.name,color:p.color,visible:true,node,meta:{blueprintKind:p.kind,moving:Boolean(p.raw.moving)}}];
}
function gearNode(p,print){const g=p.g,toothDepth=g.outer-g.root,arc=2*Math.PI*g.pitch/g.teeth,toothW=Math.max(g.module*.55,arc*.42);const tooth=box([toothDepth+g.module*.2,toothW,g.thickness],Math.min(.22,g.module*.18),[g.root+toothDepth/2,0,g.thickness/2]);let solid=union(cyl(g.root,g.thickness,'z',[0,0,g.thickness/2]),{type:'radialArray',count:g.teeth,axis:'z',child:tooth},cyl(g.hub/2,g.thickness,'z',[0,0,g.thickness/2]));const cuts=[cyl(g.bore/2,g.thickness+2,'z',[0,0,g.thickness/2])];if(g.holes){const count=clamp(Math.round(pos(g.holes.count,6)),3,16),d=pos(g.holes.diameter,4),r=pos(g.holes.radius,(g.root+g.hub/2)/2);if(r+d/2<g.root-print.minWall)cuts.push({type:'radialArray',count,axis:'z',child:cyl(d/2,g.thickness+2,'z',[r,0,g.thickness/2])});}return sub(solid,...cuts);}
function flywheelNode(p){const g=p.g,R=g.diameter/2,inner=R-g.rim;const rim=sub(cyl(R,g.thickness,'z',[0,0,g.thickness/2]),cyl(inner,g.thickness+2,'z',[0,0,g.thickness/2]));const spoke=box([Math.max(1,inner-g.hub/2),g.spoke,g.thickness],Math.min(.7,g.spoke/2),[(inner+g.hub/2)/2,0,g.thickness/2]);return sub(union(rim,cyl(g.hub/2,g.thickness,'z',[0,0,g.thickness/2]),{type:'radialArray',count:g.spokes,axis:'z',child:spoke}),cyl(g.bore/2,g.thickness+2,'z',[0,0,g.thickness/2]));}
function frameNodes(p,byId,print,issues,warnings,decisions){const gears=p.g.gears.map(id=>byId.get(id)).filter(Boolean);if(!gears.length)return[];const ext=gears.map(x=>({x:x.position[0],y:x.position[1],r:radius(x),h:x.g.thickness||6,bore:x.g.bore||4}));const minX=Math.min(...ext.map(x=>x.x-x.r))-p.g.wall*2,maxX=Math.max(...ext.map(x=>x.x+x.r))+p.g.wall*2,minY=Math.min(...ext.map(x=>x.y-x.r))-p.g.wall*2,maxY=Math.max(...ext.map(x=>x.y+x.r))+p.g.wall*2;const w=maxX-minX,d=maxY-minY,cx=(minX+maxX)/2,cy=(minY+maxY)/2,gearH=Math.max(...ext.map(x=>x.h)),H=p.g.base+p.g.axial+gearH+p.g.axial,corner=Math.min(5,p.g.wall*1.7);const outer=box([w,d,H],corner,[cx,cy,H/2]),inner=box([w-2*p.g.wall,d-2*p.g.wall,H-p.g.base+.5],Math.max(.5,corner-p.g.wall),[cx,cy,p.g.base+(H-p.g.base)/2+.25]);const cuts=[inner];for(let i=0;i<ext.length;i++){const x=ext[i];if(p.g.expose.has(gears[i].id)){const side=x.x<cx?-1:1;cuts.push(box([x.r*1.25,p.g.wall*4,gearH+2],2,[x.x+side*x.r*.55,x.y,H-p.g.wall]));}}const posts=ext.map(x=>cyl(Math.max(.8,x.bore/2-print.clearance),H-.1,'z',[x.x,x.y,(H-.1)/2]));const inset=p.g.wall+p.g.peg,pegs=[[minX+inset,minY+inset],[maxX-inset,minY+inset],[minX+inset,maxY-inset],[maxX-inset,maxY-inset]];const pegNodes=pegs.map(([x,y])=>cyl(p.g.peg/2,H+p.g.cover,'z',[x,y,(H+p.g.cover)/2]));const base=union(sub(outer,...cuts),...posts,...pegNodes);const coverSolid=box([w,d,p.g.cover],corner,[cx,cy,H+p.g.cover/2]);const coverCuts=pegs.map(([x,y])=>cyl(Math.max(.6,p.g.peg/2-p.g.fit),p.g.cover+1,'z',[x,y,H+p.g.cover/2]));ext.forEach((x,i)=>coverCuts.push(cyl(p.g.expose.has(gears[i].id)?x.r*.72:Math.max(x.bore*.85,x.r*.38),p.g.cover+1,'z',[x.x,x.y,H+p.g.cover/2])));decisions.push(`${p.id}: корпус и крышка рассчитаны вокруг ${gears.length} вращающихся деталей.`);return[{id:`${p.id}-base`,name:`${p.name} · основание`,color:p.color,visible:true,node:base,meta:{blueprintKind:'gearboxFrameBase',fixed:true}},{id:`${p.id}-cover`,name:`${p.name} · крышка`,color:shade(p.color,.12),visible:true,node:sub(coverSolid,...coverCuts),meta:{blueprintKind:'gearboxFrameCover',removable:true}}];}
function featureNode(base,features,height,issues,id){const cuts=[],adds=[];(features||[]).forEach((f,i)=>{const at=v3(f.at||f.position);if(f.type==='hole')cuts.push(cyl(pos(f.diameter,4)/2,pos(f.length,height+2),f.axis||'z',[at[0],at[1],height/2+at[2]]));else if(f.type==='slot')cuts.push(box([pos(f.length,12),pos(f.width,4),pos(f.depth,height+1)],pos(f.radius,1),[at[0],at[1],height/2+at[2]]));else if(f.type==='rib'){const s=v3(f.size,[20,1.6,height]);adds.push(box(s,pos(f.radius,.6),[at[0],at[1],at[2]+s[2]/2]));}else issues.push(`${id}.features[${i}]: неизвестный type.`);});return sub(union(base,...adds),...cuts);}
const union=(...children)=>{children=children.flat().filter(Boolean);return children.length===1?children[0]:{type:'union',children}};
const sub=(base,...cuts)=>cuts.flat().filter(Boolean).length?{type:'subtract',children:[base,...cuts.flat().filter(Boolean)]}:base;
const box=(size,radius=0,position=[0,0,0])=>radius>0?{type:'roundedBox',size,radius,position}:{type:'box',size,position};
const cyl=(radius,height,axis='z',position=[0,0,0])=>({type:'cylinder',radius,height,axis,position});
const move=(node,position)=>position.some(x=>Math.abs(x)>.0001)?{type:'union',position,children:[node]}:node;
const axisCenter=(a,v)=>a==='x'?[v,0,0]:a==='y'?[0,v,0]:[0,0,v];
function span(p){return p.kind==='spurGear'?p.g.outer*2:p.kind==='flywheel'?p.g.diameter:p.kind==='plate'||p.kind==='box'?p.g.size[0]:30;}
function radius(p){return p.kind==='spurGear'?p.g.outer:p.kind==='flywheel'?p.g.diameter/2:span(p)/2;}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function shade(hex,k){const q=parseInt(hex.slice(1),16);return'#'+[q>>16,(q>>8)&255,q&255].map(v=>clamp(Math.round(v*(1+k)),0,255).toString(16).padStart(2,'0')).join('');}

export function createRepairPacket(source,error){const issues=error?.issues||[error?.message||String(error)];return `Исправь FormaBlueprint 1 по отчёту компилятора.\n\nВерни только один JSON-объект. Сохрани format \"forma-blueprint-1\". Не рисуй шестерни и корпуса вручную через box/cylinder/subtract: используй kind, constraints и ссылки по id.\n\nОшибки:\n${issues.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nИсходный Blueprint:\n${typeof source==='string'?source:JSON.stringify(source,null,2)}`;}
export function formatBlueprintReport(r){const pairs=r.gearPairs?.length?r.gearPairs.map(p=>`${p.a}→${p.b} ${p.ratio}:1`).join(' · '):'без передач';return `${r.outputParts} печатных деталей · ${r.constraints} связей · ${pairs}${r.warnings?.length?` · предупреждений: ${r.warnings.length}`:''}`;}
export const AI_BLUEPRINT_PROMPT=`Ты создаёшь не полигональную модель, а инженерный FormaBlueprint 1 для приложения FORMA. Верни ТОЛЬКО один JSON-объект без Markdown.\n\nКорень: {\"format\":\"forma-blueprint-1\",\"name\":\"...\",\"print\":{\"clearance\":0.28,\"minWall\":1.6,\"nozzle\":0.4},\"parts\":[...],\"constraints\":[...]}.\n\nРазрешённые kind: spurGear, flywheel, plate, box, cylinder, tube, axle, knob, gearboxFrame, custom. Для шестерён указывай teeth, module, thickness, bore. Для gearboxFrame указывай gears:[id,...] и expose:[id,...]. Связи: gearMesh, coaxial, offset, align. НЕ создавай зубья, оси и корпус вручную через примитивы — FORMA рассчитывает их сама. Каждая физически отдельная или цветная деталь имеет свой id.\n\nОпиши модель: [НАЗНАЧЕНИЕ, ДВИЖЕНИЕ, ГАБАРИТЫ, ПРИНТЕР И МАТЕРИАЛ].`;
export const BLUEPRINT_EXAMPLE={format:'forma-blueprint-1',name:'Pocket Gearfly Fidget',print:{nozzle:.4,clearance:.28,minWall:1.6},settings:{detail:58,margin:2},parts:[{id:'flywheel',name:'Маховик',kind:'spurGear',teeth:28,module:1.05,thickness:5.2,bore:4.6,hubDiameter:9,lighteningHoles:{count:6,diameter:4.2},color:'#d2a34b',moving:true},{id:'thumb',name:'Привод большим пальцем',kind:'spurGear',teeth:10,module:1.05,thickness:5.2,bore:3.6,hubDiameter:7.2,color:'#e46f3f',moving:true},{id:'frame',name:'Карманный корпус',kind:'gearboxFrame',gears:['flywheel','thumb'],expose:['thumb'],wall:2.4,baseThickness:2.2,coverThickness:2,axialClearance:.3,color:'#294f53'}],constraints:[{type:'gearMesh',a:'thumb',b:'flywheel',angle:180,clearance:.25}]};
