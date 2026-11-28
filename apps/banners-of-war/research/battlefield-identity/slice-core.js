import {E} from '../../engine.js';
export const roster=["spear","sword","spear","sword","archer","archer","knight","lightHorse"];
export const conditions={complete:"Предыдущий этап завершён",time:"По времени, с",contact:"Вступили в контакт",clear:"Контакт прекращён",morale:"Мораль ниже, %",fatigue:"Усталость выше, %",allyWeak:"Соседний полк ослаб",targetBroken:"Цель потеряла боеспособность",enemyNear:"Враг ближе, м",groupReady:"Соединение готово",passage:"Проход свободен",isolated:"Изоляция выше, %",formed:"Строй восстановлен, %",gap:"Обнаружен разрыв"};
export const actions={advance:"Наступать",move:"Перемещение",brace:"Удерживать фронт",hold:"Удерживать позицию",retreat:"Отойти",attack:"Атаковать",charge:"Атака конницей",shoot:"Огонь",pursue:"Преследовать",rally:"Восстановить строй",cease:"Прекратить огонь"};
const clamp=E.clamp,copy=E.copy,pt=p=>({x:p.x,y:p.y}),distance=E.dist;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export function centre(us){return us.length?{x:us.reduce((s,u)=>s+u.x,0)/us.length,y:us.reduce((s,u)=>s+u.y,0)/us.length}:null}
export function initialBattle(){const s=E.create("reference valley 71",roster,roster,"adaptive","valley");s.aiVersion=4;s.difficulty="commander";s.fog=false;s.objective={kind:"power",seconds:360};E.deployAI(s,1);const y=s.terrain.ford,x=E.riverX(s.terrain,y);for(let u of s.units){let i=u.id%100,side=u.side,front=side?1:-1,base=side?Math.min(E.W-70,x+110):Math.min(E.W*.4-35,x-100);let slots=[[0,-27],[0,27],[0,-75],[0,75],[48,-40],[48,40],[8,-130],[8,130],[86,0]],p=slots[i];if(!p)continue;u.x=base+front*p[0];u.y=E.clamp(y+p[1],40,E.H-40);u.a=side?Math.PI:0}E.refreshVisibility(s);return s}
export function prospective(u,patch={}){return {...u,...patch,geometry:null}}
export function corners(u){const {w,d}=E.dims(u),ca=Math.cos(u.a),sa=Math.sin(u.a);return [[-d/2,-w/2],[d/2,-w/2],[d/2,w/2],[-d/2,w/2]].map(([x,y])=>({x:u.x+x*ca-y*sa,y:u.y+x*sa+y*ca}))}
export function deploymentProblems(state,patches={}){
 const all=state.units.filter(u=>u.side===0&&E.alive(u)).map(u=>prospective(u,patches[u.id]||{}));const errors=[];
 for(const u of all){
  const g=E.dims(u),cs=corners(u);
  if(!finite(u)||!Number.isFinite(u.a)||cs.some(p=>p.x<0||p.x>E.W*.4||p.y<0||p.y>E.H)){errors.push({id:u.id,reason:"За границей зоны развёртывания"});continue}
  const nx=Math.max(1,Math.ceil(g.d/4)),ny=Math.max(1,Math.ceil(g.w/4));let water=false;
  for(let i=0;i<=nx&&!water;i++)for(let j=0;j<=ny&&!water;j++){const x=(i/nx-.5)*g.d,y=(j/ny-.5)*g.w;water=E.sample(state.terrain,u.x+x*Math.cos(u.a)-y*Math.sin(u.a),u.y+x*Math.sin(u.a)+y*Math.cos(u.a)).water}
  if(water)errors.push({id:u.id,reason:"Часть построения находится в воде"});
 }
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(E.overlap(all[i],all[j]))errors.push({id:all[i].id,other:all[j].id,reason:"Пересечение построений"});
 return errors
}
export function lineSlots(us,a,b,formFor=u=>u,space=5){
 if(!us.length||!finite(a)||!finite(b))return {};
 const angle=Math.atan2(b.y-a.y,b.x-a.x),dx=Math.cos(angle),dy=Math.sin(angle),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 let ordered=[...us].sort((u,v)=>((u.x-v.x)*dx+(u.y-v.y)*dy)||u.id-v.id),widths=ordered.map(u=>E.dims(formFor(u)).w),sum=widths.reduce((s,v)=>s+v,0);
 const span=Math.max(distance(a,b),sum+space*(us.length-1)),gap=us.length>1?(span-sum)/(us.length-1):0;
 let cursor=-span/2;const out={};
 for(let i=0;i<ordered.length;i++){const u=ordered[i],w=widths[i],offset=us.length===1?0:cursor+w/2;out[u.id]={x:mid.x+dx*offset,y:mid.y+dy*offset,a:angle-Math.PI/2};cursor+=w+gap}
 return out
}
export function groupRoute(us,points){
 if(!us.length||!points.length||points.some(p=>!finite(p)))return {};
 const c=centre(us),first=points.find(p=>distance(c,p)>2)||c,base=distance(c,first)>2?E.angle(c,first):us[0].a,out={};
 for(const u of us){let dx=u.x-c.x,dy=u.y-c.y;out[u.id]=points.slice(0,64).map((p,i,all)=>{let prev=i?all[i-1]:c,next=all[i+1],heading=distance(prev,p)>2?E.angle(prev,p):base;if(next&&distance(p,next)>2){let a=E.angle(p,next)-heading;heading+=Math.atan2(Math.sin(a),Math.cos(a))*.5}let a=heading-base;return {x:p.x+dx*Math.cos(a)-dy*Math.sin(a),y:p.y+dx*Math.sin(a)+dy*Math.cos(a)}})}
 return out
}
export function screenWarnings(state,orders){
 const issues=[],friendly=state.units.filter(u=>u.side===0&&E.alive(u)&&!u.rout),ends=friendly.map(u=>{let o=orders[u.id],s=o?.stages?.at(-1)||o,p=s?.path?.at(-1)||u;return prospective(u,{...p,a:s?.a??u.a,form:s?.form||u.form,cols:s?.cols||u.cols})});
 for(let i=0;i<ends.length;i++){let u=ends[i];if(!orders[u.id])continue;
  if(corners(u).some(p=>p.x<0||p.x>E.W||p.y<0||p.y>E.H))issues.push({id:u.id,reason:"Контур выходит за поле"});
  if(E.sample(state.terrain,u.x,u.y).water)issues.push({id:u.id,reason:"Конечная позиция в воде"});
  for(let j=0;j<ends.length;j++)if(j!==i&&E.overlap(u,ends[j]))issues.push({id:u.id,reason:"Возможное пересечение конечных строев"});
  if(ends.length>1&&ends.every(v=>v.id===u.id||distance(v,u)>170))issues.push({id:u.id,reason:"Изолированная конечная позиция"});
 }
 const cross=(a,b,c,d)=>{let v={x:b.x-a.x,y:b.y-a.y},w={x:d.x-c.x,y:d.y-c.y},k=v.x*w.y-v.y*w.x;if(Math.abs(k)<1e-7)return false;let t=((c.x-a.x)*w.y-(c.y-a.y)*w.x)/k,s=((c.x-a.x)*v.y-(c.y-a.y)*v.x)/k;return t>.03&&t<.97&&s>.03&&s<.97};
 for(let i=0;i<friendly.length;i++)for(let j=i+1;j<friendly.length;j++){let a=friendly[i],b=friendly[j],aa=[a,...(orders[a.id]?.path||[])],bb=[b,...(orders[b.id]?.path||[])];if(aa.length<2||bb.length<2)continue;let hit=false;for(let x=1;x<aa.length&&!hit;x++)for(let y=1;y<bb.length&&!hit;y++)hit=cross(aa[x-1],aa[x],bb[y-1],bb[y]);if(hit)issues.push({id:a.id,reason:"Маршруты пересекаются; время прохождения не предсказывается"})}
 return [...new Map(issues.map(q=>[q.id+":"+q.reason,q])).values()]
}
export class Campaign{
 constructor(){this.state=initialBattle();this.phase="deploy";this.orders={};this.history=[];this.past=[];this.future=[];this.selected=new Set();this.initial=E.snapshot(this.state);this.metrics={actions:0,gestures:0,rejected:0,roundMs:[]}}
 own(){return this.state.units.filter(u=>u.side===0&&E.alive(u)&&!u.rout)}
 selection(){return this.own().filter(u=>this.selected.has(u.id))}
 select(ids,add=false){if(!add)this.selected.clear();const available=new Set(this.own().map(u=>u.id));for(const id of ids)if(available.has(id)){if(add&&this.selected.has(id))this.selected.delete(id);else this.selected.add(id)}}
 selectGroup(g){let us=this.own();if(g==="foot")us=us.filter(u=>!E.spec(u).horse&&!E.spec(u).range);else if(g==="missile")us=us.filter(u=>!E.spec(u).horse&&E.spec(u).range);else if(g==="horse")us=us.filter(u=>E.spec(u).horse&&u.type!=="guard");else if(g==="guard")us=us.filter(u=>u.type==="guard");this.select(us.map(u=>u.id))}
 get canEdit(){return this.phase==="deploy"||this.phase==="plan"}
 snapshot(){return {units:this.phase==="deploy"?copy(this.state.units):null,orders:copy(this.orders)}}
 restore(v){if(v.units)this.state.units=v.units;this.orders=v.orders}
 checkpoint(){this.past.push(this.snapshot());if(this.past.length>40)this.past.shift();this.future=[]}
 undo(){if(!this.canEdit||!this.past.length)return false;this.future.push(this.snapshot());this.restore(this.past.pop());return true}
 redo(){if(!this.canEdit||!this.future.length)return false;this.past.push(this.snapshot());this.restore(this.future.pop());return true}
 applyDeployment(patches){if(this.phase!=="deploy")return {ok:false,reason:"Не фаза развёртывания"};const ids=new Set(this.own().map(u=>u.id));if(Object.keys(patches).some(id=>!ids.has(+id)))return {ok:false,reason:"Недоступное подразделение"};let errors=deploymentProblems(this.state,patches);if(errors.length){this.metrics.rejected++;return {ok:false,reason:errors[0].reason,errors}}this.checkpoint();this.state.units=this.state.units.map(u=>patches[u.id]?prospective(u,patches[u.id]):u);return {ok:true}}
 planned(u,i=0){const base=this.orders[u.id];return i===0?base:base?.stages?.[i-1]}
 end(u,i=0){const o=this.planned(u,i),prev=i?this.end(u,i-1):u,p=o?.path?.at(-1)||prev;return {...u,x:p.x,y:p.y,a:o?.a??prev.a,form:o?.form||prev.form,cols:o?.cols||prev.cols,geometry:null}}
 previous(u,i){return i?this.end(u,i-1):u}
 setStage(u,i,patch){if(i<0||i>12)return;const base=this.orders[u.id]||{...copy(u.order),stages:copy(u.program||[])};if(i===0){this.orders[u.id]={...base,...patch,stages:base.stages||[]};return}if(i>base.stages.length+1)return;const prev=this.end(u,i-1),s=base.stages[i-1]||{kind:"move",path:[],a:prev.a,form:prev.form,cols:prev.cols,when:"complete"};base.stages[i-1]={...s,...patch};this.orders[u.id]=base}
 route(points,kind="advance",i=0,target=null){
  if(!this.canEdit||!points.length||points.some(p=>!finite(p)))return {ok:false,reason:"Нет допустимой точки"};
  const us=this.selection();if(!us.length)return {ok:false,reason:"Выберите войска"};
  if(this.phase==="deploy"){const c=centre(us),p=points.at(-1);return this.applyDeployment(Object.fromEntries(us.map(u=>[u.id,{x:u.x+p.x-c.x,y:u.y+p.y-c.y}])))}
  const from=us.map(u=>this.previous(u,i)),paths=groupRoute(from,points);this.checkpoint();const group="slice-"+us.map(u=>u.id).sort((a,b)=>a-b).join("-");
  for(const u of us){let prev=this.previous(u,i),path=paths[u.id].map(p=>({x:clamp(p.x,10,E.W-10),y:clamp(p.y,10,E.H-10)})),last=path.at(-1),a=distance(prev,last)>2?E.angle(path.length>1?path.at(-2):prev,last):prev.a;let patch={kind,path,a,group,nav:kind==="move"||kind==="retreat",target:undefined};if(target!==null&&["attack","charge","shoot","pursue"].includes(kind)){patch.target=target;patch.path=[];let t=this.state.units.find(v=>v.id===target);if(t)patch.a=E.angle(prev,t)}this.setStage(u,i,patch)}
  return {ok:true}
 }
 front(a,b,i=0,hold=false){
  if(!this.canEdit)return {ok:false,reason:"Приказы закрыты"};const us=this.selection();if(!us.length)return {ok:false,reason:"Выберите войска"};
  const slots=lineSlots(us.map(u=>this.previous(u,i)),a,b,u=>this.end(u,i));
  if(this.phase==="deploy")return this.applyDeployment(slots);
  this.checkpoint();for(const u of us){const p=slots[u.id];this.setStage(u,i,{kind:"move",path:[pt(p)],a:p.a,group:"slice-"+us.map(u=>u.id).join("-"),target:undefined,nav:true});if(hold&&i<12){this.setStage(u,i+1,{kind:"brace",path:[],a:p.a,when:"complete",group:"slice-"+us.map(u=>u.id).join("-")})}}return {ok:true}
 }
 transform(kind,value,i=0){
  if(!this.canEdit)return {ok:false,reason:"Приказы закрыты"};const us=this.selection();if(!us.length)return {ok:false,reason:"Выберите войска"};
  const ends=us.map(u=>this.end(u,i)),c=centre(ends),patches={};
  for(const u of ends){let p={};if(kind==="rotate"){let a=value,dx=u.x-c.x,dy=u.y-c.y;p={x:c.x+dx*Math.cos(a)-dy*Math.sin(a),y:c.y+dx*Math.sin(a)+dy*Math.cos(a),a:u.a+a}}else if(kind==="spread"){let normal=ends[0].a+Math.PI/2,dx=u.x-c.x,dy=u.y-c.y,lat=dx*Math.cos(normal)+dy*Math.sin(normal);p={x:u.x+lat*(value-1)*Math.cos(normal),y:u.y+lat*(value-1)*Math.sin(normal)};if(ends.length===1)p.cols=clamp(Math.round(u.cols*value),4,28)}else if(kind==="depth")p={cols:clamp(Math.round(u.cols/value),4,28)};else if(kind==="form")p={form:value,cols:E.forms[value].cols};patches[u.id]=p}
  if(this.phase==="deploy")return this.applyDeployment(patches);
  this.checkpoint();for(const u of us){let p=patches[u.id],o=this.planned(u,i),old=this.end(u,i),path=copy(o?.path||[]);if(finite(p)){if(path.length)path[path.length-1]=pt(p);else if(distance(old,p)>1)path.push(pt(p))}this.setStage(u,i,{...("a" in p?{a:p.a}:{}),...("cols" in p?{cols:p.cols}:{}),...("form" in p?{form:p.form}:{}),path,...(path.length&&!o?.path?.length?{kind:"move",nav:true,target:undefined}:{})})}return {ok:true}
 }
 moveEndpoint(i,delta){if(!this.canEdit||!finite(delta))return false;const us=this.selection();if(!us.length)return false;if(this.phase==="deploy"){let c=centre(us);return this.route([{x:c.x+delta.x,y:c.y+delta.y}]).ok}this.checkpoint();for(const u of us){let o=this.planned(u,i),e=this.end(u,i),path=copy(o?.path||[]),p={x:clamp(e.x+delta.x,10,E.W-10),y:clamp(e.y+delta.y,10,E.H-10)};if(path.length)path[path.length-1]=p;else path.push(p);this.setStage(u,i,{path,...(!o?.path?.length?{kind:"move",nav:true,target:undefined}:{})})}return true}
 editPoint(stage,index,delta){if(this.phase!=="plan")return false;const us=this.selection().filter(u=>this.planned(u,stage)?.path?.[index]);if(!us.length)return false;this.checkpoint();for(const u of us){const o=this.planned(u,stage),p=copy(o.path);p[index]={x:clamp(p[index].x+delta.x,10,E.W-10),y:clamp(p[index].y+delta.y,10,E.H-10)};this.setStage(u,stage,{path:p})}return true}
 stationary(kind,i=0){if(this.phase!=="plan"||!this.selection().length||!actions[kind])return false;this.checkpoint();for(const u of this.selection())this.setStage(u,i,{kind,path:[],a:this.end(u,i).a,target:undefined});return true}
 condition(i,when,seconds){if(this.phase!=="plan"||i<1||!conditions[when])return false;const us=this.selection().filter(u=>this.planned(u,i));if(!us.length)return false;this.checkpoint();for(const u of us)this.setStage(u,i,{when,seconds:clamp(Number(seconds)||30,1,300)});return true}
 removeStage(i){if(this.phase!=="plan"||i<1)return false;const us=this.selection().filter(u=>this.planned(u,i));if(!us.length)return false;this.checkpoint();for(const u of us)this.orders[u.id].stages.splice(i-1,1);return true}
 finishDeployment(){if(this.phase!=="deploy")return false;let errors=deploymentProblems(this.state);if(errors.length)return false;E.refreshVisibility(this.state);this.initial=E.snapshot(this.state);this.phase="plan";this.past=[];this.future=[];return true}
 resolve(){if(this.phase!=="plan"||this.state.result)throw Error("Round not available");let before=E.snapshot(this.state),orders=copy(this.orders),start=globalThis.performance?.now?.()??0;const result=E.resolve(this.state,orders,false),elapsed=(globalThis.performance?.now?.()??0)-start;this.state=result.state;this.history.push({before,orders,frames:result.frames,after:result.state,ms:elapsed});this.metrics.roundMs.push(elapsed);this.phase="replay";this.orders={};this.past=[];this.future=[];this.selected=new Set([...this.selected].filter(id=>this.own().some(u=>u.id===id)));return this.history.at(-1)}
 continue(){if(this.phase!=="replay")return false;this.phase=this.state.result?"result":"plan";return true}
 result(){const s=this.state;return {outcome:s.result,reason:s.resultReason,time:s.time,rounds:this.history.length,sides:[0,1].map(side=>({initial:E.total(this.initial,side),remaining:s.units.filter(u=>u.side===side).reduce((n,u)=>n+u.n,0),ready:E.power(s,side),routed:s.units.filter(u=>u.side===side&&u.rout).length,escaped:s.units.filter(u=>u.side===side&&u.escaped).length})),events:s.events.slice()}}
}
