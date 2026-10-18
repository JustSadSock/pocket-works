// Shared event renderer for the live board, scrubbable replay and WebM export.
// The rules engine is the only source of truth. No physics or outcome logic here.
export const ARENA_COLORS=Object.freeze({
 A:'#00aaff',B:'#ff4400',board:'#101a2d',tile:'#202e47',
 border:'#475873',warning:'#673633',lava:'#c13c16',
 attack:'#f45d42',block:'#71dfff',hit:'#ffe6a5'
});
export const COMBAT_BEAT_MS=820;
export const COMBAT_MIN_MS=125;
const SIDES=['A','B'];
const outer=(x,y)=>x===0||x===4||y===0||y===4;
const cellsOf=events=>events.flatMap(event=>event.type==='attack'?event.cells||[]:[]);
const cellsEqual=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
export const frameBefore=(record,index)=>{
 if(!record||!Array.isArray(record.frames))return null;
 if(index<=0)return {units:record.begin,edgesCollapsed:record.round>4,events:[],round:record.round,beat:0};
 const previous=record.frames[Math.min(index-1,record.frames.length-1)];
 return {...previous,round:record.round};
};
export const frameAfter=(record,index)=>record?.frames?.[index]||null;
export const timing=(speed=1,reduced=false)=>reduced?COMBAT_MIN_MS:Math.round(COMBAT_BEAT_MS/Math.max(.25,Math.min(5,speed)));
export function classifyFrame(events=[]){
 const kinds=new Set(events.map(e=>e.type));
 return {
  move:kinds.has('move'),attack:kinds.has('attack'),shield:kinds.has('shield'),
  hit:kinds.has('hit'),block:kinds.has('block'),
  collapse:kinds.has('collapse'),fall:kinds.has('fall')
 };
}
export function effectPositions(units,events=[]){
 const hits=[],blocks=[],falls=[],shields=[],attacks=[];
 for(const e of events){
  if(e.type==='attack')for(const cell of e.cells||[])attacks.push(cell);
  if(e.type==='shield'&&units?.[e.side])shields.push(units[e.side]);
  if(e.type==='hit'&&units?.[e.side])hits.push(units[e.side]);
  if(e.type==='block'&&units?.[e.side])blocks.push(units[e.side]);
  if(e.type==='fall')falls.push(e.at||units?.[e.side]);
 }
 return {hits,blocks,falls:falls.filter(Boolean),shields,attacks};
}
const hasCoord=(cells,x,y)=>cells.some(c=>c.x===x&&c.y===y);
const actorUnits=(before,after,events=[])=>{
 const units={};
 for(const side of SIDES){
  const next=after.units[side],prev=before.units[side];
  const falling=events.find(e=>e.type==='fall'&&e.side===side);
  units[side]={...next,alive:next.alive||prev?.alive===true,
   ...(falling?.at?{x:falling.at.x,y:falling.at.y}:{})};
 }
 return units;
};
function prepareBoard(host){
 let tiles=host.querySelectorAll(':scope > .cell');
 if(tiles.length!==25){
  host.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(let y=0;y<5;y++)for(let x=0;x<5;x++){
   const cell=document.createElement('div');
   cell.className='cell';cell.dataset.x=x;cell.dataset.y=y;cell.dataset.trace='';
   cell.setAttribute('role','gridcell');fragment.append(cell);
  }
  host.append(fragment);tiles=host.querySelectorAll(':scope > .cell');
 }
 for(const side of SIDES){
  if(host.querySelector(':scope > .piece[data-side="'+side+'"]'))continue;
  const piece=document.createElement('div');piece.className='piece '+side.toLowerCase();
  piece.dataset.side=side;piece.setAttribute('aria-hidden','true');host.append(piece);
 }
 return tiles;
}
export function paintArena(host,units,edges,events=[],{
 round=1,traces=null,targets=null,duration=0,instant=false
}={}){
 if(!host||!units)return;
 const tiles=prepareBoard(host),positions=effectPositions(units,events),
  collapse=events.some(e=>e.type==='collapse');
 const warning=round===4&&!edges;
 tiles.forEach(cell=>{
  const x=Number(cell.dataset.x),y=Number(cell.dataset.y),
   coord=x+','+y,perimeter=outer(x,y);
  cell.className='cell';
  if(perimeter&&warning)cell.classList.add('edge-warning');
  if(perimeter&&edges)cell.classList.add('lava');
  if(perimeter&&collapse)cell.classList.add('shatter');
  if(traces?.has?.(coord)){cell.classList.add('trace');cell.dataset.trace=String(traces.get(coord))}
  else cell.dataset.trace='';
  if(targets?.has?.(coord))cell.classList.add('target');
  if(hasCoord(positions.attacks,x,y))cell.classList.add('attack-zone');
  if(hasCoord(positions.shields,x,y))cell.classList.add('shield-pulse');
  if(hasCoord(positions.hits,x,y))cell.classList.add('impact');
  if(hasCoord(positions.blocks,x,y))cell.classList.add('block');
  if(hasCoord(positions.falls,x,y))cell.classList.add('fall-burst');
 });
 const overlap=units.A?.alive&&units.B?.alive&&cellsEqual(units.A,units.B);
 for(const side of SIDES){
  const actor=host.querySelector(':scope > .piece[data-side="'+side+'"]');
  const state=units[side],hit=events.some(e=>e.side===side&&e.type==='hit'),
   fall=events.find(e=>e.side===side&&e.type==='fall');
  const visible=state?.alive||hit||fall;
  if(!visible){actor.hidden=true;actor.classList.remove('dying');continue}
  const location=fall?.at||state;
  const cell=tiles[location.y*5+location.x];
  if(!cell){actor.hidden=true;continue}
  const left=cell.offsetLeft+cell.offsetWidth/2,top=cell.offsetTop+cell.offsetHeight/2;
  const wasHidden=actor.hidden||!actor.dataset.position;
  actor.hidden=false;
  actor.style.transitionDuration=instant||wasHidden?'0ms':Math.max(0,duration)+'ms';
  actor.style.left=left+'px';actor.style.top=top+'px';
  actor.dataset.position=location.x+','+location.y;
  actor.classList.toggle('overlap',Boolean(overlap));
  actor.classList.toggle('dying',Boolean(hit||fall));
  if(hit||fall)actor.style.animationDuration=Math.max(160,duration||460)+'ms';
  if(side==='A')actor.setAttribute('aria-label','Игрок А');else actor.setAttribute('aria-label','Игрок Б');
 }
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function playArenaBeat(host,before,after,{
 round=1,speed=1,reduced=false,alive=()=>true,sound=()=>{},feedback=()=>{}
}={}){
 if(!before||!after||!alive())return false;
 const total=timing(speed,reduced),events=after.events||[];
 const state=classifyFrame(events),instant=reduced;
 const ensure=()=>Boolean(alive());
 if(reduced){
  paintArena(host,after.units,after.edgesCollapsed,events,{round,instant:true});
  if(state.hit||state.fall)sound('hit');else if(state.block)sound('block');
  else if(state.attack)sound('attack');else if(state.shield)sound('shield');
  else if(state.move)sound('move');
  if(state.collapse)sound('collapse');
  await sleep(total);
  return ensure();
 }
 const moving=actorUnits(before,after,events);
 paintArena(host,moving,before.edgesCollapsed,[],{round,duration:total*.33});
 if(state.move)sound('move');
 await sleep(total*.37);if(!ensure())return false;
 const telegraph=events.filter(e=>e.type==='attack'||e.type==='shield');
 paintArena(host,moving,before.edgesCollapsed,telegraph,{round,instant:true});
 if(state.attack)sound('attack');else if(state.shield)sound('shield');
 await sleep(total*.25);if(!ensure())return false;
 const contact=events.filter(e=>e.type!=='collapse'&&!(state.collapse&&e.type==='fall'));
 paintArena(host,actorUnits(before,after,contact),before.edgesCollapsed,contact,{round,instant:true,duration:total*.27});
 // Set casualties dead only after the attack / block has visually landed.
 if(state.hit||state.block||(!state.collapse&&state.fall)){
  paintArena(host,after.units,before.edgesCollapsed,contact,{round,instant:true,duration:total*.27});
  if(state.hit||state.fall)sound('hit');else sound('block');
  feedback(state.hit?18:state.block?9:10);
 }
 await sleep(total*.22);if(!ensure())return false;
 if(state.collapse){
  paintArena(host,after.units,after.edgesCollapsed,events,{round,instant:true,duration:total*.27});
  sound('collapse');feedback(14);
 }
 await sleep(total*.16);
 return ensure();
}
// Palette and effects are identical to those used by paintArena (rather than
// the previous gold/teal export-only rendering). progress: 0..1.
export function drawArenaCanvas(ctx,from,to,round=1,progress=1,{
 width=800,height=840,step=0
}={}){
 const C=ARENA_COLORS,unit=140,gap=3,ox=50,oy=83;
 ctx.clearRect(0,0,width,height);
 ctx.fillStyle='#0a101d';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#e2e8f0';ctx.font='bold 32px system-ui';
 ctx.fillText('5×5 ARENA',50,52);
 ctx.font='bold 18px system-ui';ctx.fillStyle='#aabacf';
 ctx.fillText('РАУНД '+round+'  ·  ШАГ '+step+' / 5',470,52);
 const prev=from||to,events=to?.events||[],positions=effectPositions(to?.units,events),
  shouldCollapse=Boolean(to?.edgesCollapsed&&progress>=.72);
 for(let y=0;y<5;y++)for(let x=0;x<5;x++){
  const border=outer(x,y),baseX=ox+x*(unit+gap),baseY=oy+y*(unit+gap);
  const lava=border&&shouldCollapse,warning=border&&round===4&&!lava;
  ctx.fillStyle=lava?C.lava:warning?C.warning:C.tile;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(baseX,baseY,unit-3,unit-3,10);
  else ctx.rect(baseX,baseY,unit-3,unit-3);
  ctx.fill();
  ctx.strokeStyle=C.border;ctx.lineWidth=1;ctx.stroke();
  if(progress>=.38&&hasCoord(positions.attacks,x,y)){
   ctx.save();ctx.globalAlpha=.34;ctx.fillStyle=C.attack;ctx.fillRect(baseX+8,baseY+8,unit-19,unit-19);ctx.restore();
  }
  if(progress>=.61&&hasCoord(positions.hits,x,y)){
   ctx.strokeStyle=C.hit;ctx.lineWidth=6;ctx.strokeRect(baseX+7,baseY+7,unit-17,unit-17);
  }
  if(progress>=.61&&hasCoord(positions.blocks,x,y)){
   ctx.strokeStyle=C.block;ctx.lineWidth=6;ctx.strokeRect(baseX+6,baseY+6,unit-15,unit-15);
  }
  if(progress>=.72&&hasCoord(positions.falls,x,y)){
   ctx.fillStyle='rgba(255,88,19,.5)';ctx.fillRect(baseX+10,baseY+10,unit-24,unit-24);
  }
 }
 for(const side of SIDES){
  const a=prev?.units?.[side],b=to?.units?.[side];
  if(!a&&!b)continue;
  const death=events.some(e=>e.side===side&&(e.type==='hit'||e.type==='fall'));
  if(!b?.alive&&(!a?.alive||(!death&&progress>=.67)))continue;
  if(!b?.alive&&progress>=.9)continue;
  const final=events.find(e=>e.type==='fall'&&e.side===side)?.at||b||a,
   advance=Math.min(1,progress/.36),
   x=(a?.x??final.x)+((final.x)-(a?.x??final.x))*advance,
   y=(a?.y??final.y)+((final.y)-(a?.y??final.y))*advance,
   cx=ox+x*(unit+gap)+(unit-3)/2,
   cy=oy+y*(unit+gap)+(unit-3)/2;
  ctx.save();
  ctx.globalAlpha=!b?.alive?Math.min(1,Math.max(0,(.91-progress)/.18)):1;
  ctx.fillStyle=C[side];ctx.shadowBlur=13;ctx.shadowColor=C[side];
  ctx.beginPath();ctx.arc(cx,cy,unit*.28,0,2*Math.PI);ctx.fill();
  ctx.restore();
 }
 ctx.fillStyle='#cbd5e1';ctx.font='bold 21px system-ui';
 ctx.fillText('5×5 Arena   •   пять скрытых команд',50,816);
}
