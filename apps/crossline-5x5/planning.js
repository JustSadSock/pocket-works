// Client-side planning projection. Combat server remains authoritative.
import {DIRECTIONS,STEPS,validatePlan} from './engine.js';
const clone=a=>JSON.parse(JSON.stringify(a));
const dirs=Object.keys(DIRECTIONS);
export const planErrorText={
 exactly_five_actions:'Нужно выбрать ровно пять команд.',
 unknown_action:'Неизвестная команда.',
 one_attack_only:'Атаковать можно один раз за раунд.',
 one_shield_only:'Защиту можно поставить один раз за раунд.',
 invalid_attack_directions:'Выбери от одного до четырёх разных направлений удара.',
 attack_direction_conflict:'Это направление используется для движения или атаки. Выбери другое.',
 no_slot:'Выбери шаг в плане.'
};
export const describeIssue=issue=>planErrorText[issue]||'Недопустимая последовательность команд.';
export function partialIssue(actions){
 if(!Array.isArray(actions)||actions.length>STEPS)return 'exactly_five_actions';
 let attack=false,shield=false;
 const moved=new Set(),strike=new Set();
 for(const cmd of actions){
  if(typeof cmd==='string'){
   if(cmd==='shield'){if(shield)return 'one_shield_only';shield=true;continue}
   if(!Object.hasOwn(DIRECTIONS,cmd))return 'unknown_action';
   if(strike.has(cmd))return 'attack_direction_conflict';
   moved.add(cmd);continue;
  }
  if(!cmd||Array.isArray(cmd)||cmd.type!=='attack'||!Array.isArray(cmd.dirs))return 'unknown_action';
  if(attack)return 'one_attack_only';
  attack=true;
  if(!cmd.dirs.length||cmd.dirs.length>4||new Set(cmd.dirs).size!==cmd.dirs.length)return 'invalid_attack_directions';
  for(const dir of cmd.dirs){
   if(!dirs.includes(dir))return 'invalid_attack_directions';
   if(moved.has(dir))return 'attack_direction_conflict';
   strike.add(dir);
  }
 }
 return null;
}
export function trySetCommand(actions,at,command){
 if(!Array.isArray(actions)||!Number.isInteger(at)||at<0||at>actions.length||at>=STEPS)return {error:'no_slot'};
 const next=clone(actions);
 if(at===next.length)next.push(clone(command));else next[at]=clone(command);
 const error=partialIssue(next)||(next.length===STEPS?validatePlan(next):null);
 return error?{error,actions}:{actions:next,error:null};
}
export function trySwapCommand(actions,index,offset){
 const target=index+offset;
 if(!Number.isInteger(index)||index<0||index>=actions.length||target<0||target>=actions.length)return {actions,error:'no_slot'};
 const next=clone(actions);
 [next[index],next[target]]=[next[target],next[index]];
 return {actions:next,error:partialIssue(next),index:target};
}
export const removeCommand=(actions,index)=>actions.filter((_,i)=>i!==index);
export const controlsFor=(actions,selected=null)=>{
 const existing=selected!==null&&selected<actions.length?actions.filter((_,i)=>i!==selected):actions;
 const moved=new Set(),attacked=new Set();
 for(const action of existing){
  if(typeof action==='string'&&Object.hasOwn(DIRECTIONS,action))moved.add(action);
  else if(action&&typeof action==='object')for(const dir of action.dirs||[])attacked.add(dir);
 }
 return {
  moved,attacked,
  attackUsed:existing.some(a=>typeof a==='object'),
  shieldUsed:existing.includes('shield'),
  directions:dirs.filter(d=>!attacked.has(d)),
  attackDirs:dirs.filter(d=>!moved.has(d))
 };
};
const clamp=n=>Math.min(4,Math.max(0,n));
const edge=(x,y)=>x===0||y===0||x===4||y===4;
export function previewOrders(match,player,orders){
 const start=match?.units?.[player];
 if(!start||!start.alive)return {origin:null,steps:[],targetCells:[],risk:null};
 const origin={x:start.x,y:start.y},steps=[],targetCells=[];
 let x=start.x,y=start.y,collapsed=Boolean(match.edgesCollapsed),dead=false,risk=null;
 for(let i=0;i<Math.min(STEPS,orders.length);i++){
  const cmd=orders[i],from={x,y},step={number:i+1,from,to:from,kind:'wait',command:cmd,fall:false,collapsed:false};
  if(!dead){
   if(typeof cmd==='string'&&Object.hasOwn(DIRECTIONS,cmd)){
    const [dx,dy]=DIRECTIONS[cmd];const dest={x:clamp(x+dx),y:clamp(y+dy)};
    step.kind='move';step.to=dest;x=dest.x;y=dest.y;
    if(collapsed&&edge(x,y)){step.fall=true;risk=i+1;dead=true}
   }else if(cmd==='shield')step.kind='shield';
   else if(cmd?.type==='attack'){
    step.kind='attack';
    const cells=[{x,y},...cmd.dirs.map(d=>({x:x+DIRECTIONS[d][0],y:y+DIRECTIONS[d][1]}))];
    step.targets=cells.filter(p=>p.x>=0&&p.x<=4&&p.y>=0&&p.y<=4);
    targetCells.push(...step.targets);
   }
   if(match.round===4&&i===0&&!collapsed){
    collapsed=true;step.collapsed=true;
    if(edge(x,y)){step.fall=true;risk=i+1;dead=true}
   }
  }else{step.kind='inactive';step.to={x,y}}
  steps.push(step);
 }
 return {origin,steps,targetCells,risk,final:{x,y},collapsed};
}
const SVG_NS='http://www.w3.org/2000/svg';
const svgElem=(tag,attrs={})=>{
 const el=document.createElementNS(SVG_NS,tag);
 for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
 return el;
};
export function paintPlanOverlay(host,projection,{selected=null}={}){
 if(!host)return;
 let overlay=host.querySelector(':scope > svg.arena-plan-route');
 if(!projection?.origin||!projection.steps.length){
  overlay?.remove();return;
 }
 const tiles=host.querySelectorAll(':scope > .cell');
 if(tiles.length!==25)return;
 if(!overlay){
  overlay=svgElem('svg',{class:'arena-plan-route','aria-hidden':'true',preserveAspectRatio:'none'});
  host.append(overlay);
 }
 overlay.setAttribute('viewBox','0 0 '+host.clientWidth+' '+host.clientHeight);
 overlay.replaceChildren();
 const cellPoint=p=>{
  const c=tiles[p.y*5+p.x];
  return {x:c.offsetLeft+c.offsetWidth/2,y:c.offsetTop+c.offsetHeight/2};
 };
 const line=(from,to,active=false)=>{
  const a=cellPoint(from),b=cellPoint(to);
  if(a.x===b.x&&a.y===b.y)return;
  overlay.append(svgElem('path',{
   d:'M '+a.x+' '+a.y+' L '+b.x+' '+b.y,
   class:'arena-route-line'+(active?' is-selected':''),
   'stroke-dasharray':active?'0':'4 5'
  }));
 };
 const origin=cellPoint(projection.origin);
 overlay.append(svgElem('circle',{cx:origin.x,cy:origin.y,r:4,class:'arena-route-origin'}));
 const counts=new Map();
 for(const step of projection.steps){
  const active=selected===step.number-1,point=cellPoint(step.to),key=step.to.x+','+step.to.y;
  line(step.from,step.to,active);
  const visited=counts.get(key)||0;counts.set(key,visited+1);
  const ring=visited%6,angle=(-Math.PI/3)+ring*Math.PI/3;
  const shift=visited?8:0;
  const cx=point.x+Math.cos(angle)*shift,cy=point.y+Math.sin(angle)*shift;
  const g=svgElem('g',{class:'arena-route-stop'+(active?' is-selected':'')+(step.fall?' is-fall':'')});
  g.append(svgElem('circle',{cx,cy,r:step.kind==='move'?8.4:7.4}));
  const t=svgElem('text',{x:cx,y:cy+3.3,'text-anchor':'middle'});
  t.textContent=String(step.number);g.append(t);overlay.append(g);
  if(step.kind==='attack')for(const target of step.targets){
   const p=cellPoint(target);
   overlay.append(svgElem('circle',{cx:p.x,cy:p.y,r:12,class:'arena-route-target'}));
  }
  if(step.kind==='shield')overlay.append(svgElem('circle',{cx:point.x,cy:point.y,r:15,class:'arena-route-shield'}));
 }
}
