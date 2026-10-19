// PetriForge 0.4: bounded, data-only combat rules. Never evaluate imported code.
export const COMBAT_W=800,COMBAT_H=480;
export const RULE_PRESETS=Object.freeze([
 {id:'duel',name:'Тактическая дуэль',description:'Устранение команды'},
 {id:'control',name:'Контроль территории',description:'Захват и удержание центра'},
 {id:'score',name:'Охота за очками',description:'Победа по нанесённому урону'}
]);
export const SKILL_KEYS=['bolt','dash','shield','strike','mine','heal'];
const cl=(n,min,max)=>Math.max(min,Math.min(max,n));
const numeric=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Недопустимое значение: '+label);return value;};
const rect=r=>{
 if(!r||typeof r!=='object')throw Error('Повреждённое препятствие');
 const o={x:numeric(r.x,20,750,'x'),y:numeric(r.y,20,430,'y'),w:numeric(r.w,15,180,'width'),h:numeric(r.h,15,180,'height')};
 if(o.x+o.w>780||o.y+o.h>460)throw Error('Препятствие выходит за пределы арены');
 return o;
};
const zone=z=>{
 if(!z||typeof z!=='object')throw Error('Повреждённая опасная зона');
 return {x:numeric(z.x,20,780,'zone x'),y:numeric(z.y,20,460,'zone y'),r:numeric(z.r,18,110,'radius'),dps:numeric(z.dps,1,45,'damage')};
};
const team=t=>{if(!t||typeof t!=='object')throw Error('Отсутствуют характеристики команды');return {
 hp:numeric(t.hp,60,220,'HP'),speed:numeric(t.speed,70,220,'speed'),energyRegen:numeric(t.energyRegen,3,35,'energy'),
  };
};
export function defaultCombatRules(mode='elimination'){
 if(!['elimination','control','score'].includes(mode))throw Error('Неизвестный режим боя');
 return {version:1,name:mode==='control'?'Захват центра':mode==='score'?'Охота за очками':'Мой поединок',
  mode,limitSeconds:40,targetScore:mode==='control'?75:mode==='score'?180:0,
  teams:[{hp:120,speed:140,energyRegen:14},{hp:120,speed:140,energyRegen:14}],
  skillPower:{bolt:19,dash:70,shield:38,strike:31,mine:29,heal:35},
  walls:[],zones:[],point:{x:400,y:240,r:75}};
}
export function validateCombatRules(value){
 if(!value||value.version!==1||typeof value.name!=='string'||value.name.length>64)throw Error('Несовместимый набор правил');
 if(!['elimination','control','score'].includes(value.mode))throw Error('Неизвестная цель боя');
 if(!Array.isArray(value.teams)||value.teams.length!==2)throw Error('Ожидаются две команды');
 const wallList=value.walls,zoneList=value.zones;
 if(!Array.isArray(wallList)||wallList.length>22||!Array.isArray(zoneList)||zoneList.length>12)throw Error('Слишком много объектов на карте');
 const powers=value.skillPower||{},bounds={bolt:[5,55],dash:[20,120],shield:[10,75],strike:[8,65],mine:[8,65],heal:[8,60]};
 const skillPower={};
 for(const id of SKILL_KEYS)skillPower[id]=numeric(powers[id],...bounds[id],id);
 const r={version:1,name:value.name,mode:value.mode,limitSeconds:numeric(value.limitSeconds,10,120,'seconds'),
  targetScore:value.mode==='elimination'?0:numeric(value.targetScore,20,600,'targetScore'),
  teams:value.teams.map(team),skillPower,walls:wallList.map(rect),zones:zoneList.map(zone),point:{
   x:numeric(value.point?.x,90,710,'point x'),y:numeric(value.point?.y,70,410,'point y'),r:numeric(value.point?.r,35,110,'point radius')
  }};
 // Keep start positions usable, including the 2v2 spawn pads.
 for(const w of r.walls){
  for(const x of [110,690])for(const y of [163,240,317])if(x+21>w.x&&x-21<w.x+w.w&&y+21>w.y&&y-21<w.y+w.h)throw Error('Препятствие перекрывает старт команды');
 }
 return r;
}
export function presetRules(id='duel'){
 const r=defaultCombatRules(id==='control'?'control':id==='score'?'score':'elimination');
 if(id==='control'){
  r.walls=[{x:346,y:80,w:30,h:100},{x:424,y:300,w:30,h:100}];
  r.targetScore=65;
 }else if(id==='score'){
  r.zones=[{x:400,y:130,r:50,dps:10},{x:400,y:350,r:50,dps:10}];
  r.targetScore=145;
 }
 return validateCombatRules(r);
}
export function addArenaObject(rules,kind,x,y){
 const next=validateCombatRules(rules);
 x=Math.round(cl(x,20,780)/10)*10;y=Math.round(cl(y,20,460)/10)*10;
 if(kind==='erase'){
  let idx=-1,dist=Infinity,of='';
  for(let i=0;i<next.walls.length;i++){const w=next.walls[i],d=Math.hypot(w.x+w.w/2-x,w.y+w.h/2-y);if(x>=w.x-12&&x<=w.x+w.w+12&&y>=w.y-12&&y<=w.y+w.h+12&&d<dist){idx=i;dist=d;of='walls';}}
  for(let i=0;i<next.zones.length;i++){const z=next.zones[i],d=Math.hypot(z.x-x,z.y-y);if(d<z.r+12&&d<dist){idx=i;dist=d;of='zones';}}
  if(idx>=0)next[of].splice(idx,1);
 }else if(kind==='wall'){
  if(next.walls.length>=22)throw Error('Достигнут предел препятствий');
  next.walls.push({x:cl(x-30,20,710),y:cl(y-30,20,400),w:60,h:60});
 }else if(kind==='danger'){
  if(next.zones.length>=12)throw Error('Достигнут предел опасных зон');
  next.zones.push({x,y,r:48,dps:13});
 }else if(kind==='point'){next.point={...next.point,x:cl(x,90,710),y:cl(y,70,410)};}
 else throw Error('Неизвестный инструмент карты');
 return validateCombatRules(next);
}
export function serializeCombatRules(rules){return JSON.stringify({format:'petri-combat-rules',rules:validateCombatRules(rules)},null,2);}
export function importCombatRules(raw){if(typeof raw!=='string'||raw.length>30000)throw Error('Файл правил слишком большой');const value=JSON.parse(raw);if(value?.format!=='petri-combat-rules')throw Error('Формат файла не подходит');return validateCombatRules(value.rules);}
