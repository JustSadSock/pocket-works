// Headless FoC campaign: real original aiTakeTurn (levels 0–6) versus a
// deterministic opponent submitting originalAction() orders to PocketNet rules.
// No toy unit fixture or fake turn counter. Includes recruiting, movement,
// healing, battle, building capture, fog and income on generated worlds.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const rules=await import('data:text/javascript;base64,'+
  Buffer.from(read('../server/module.ts')).toString('base64'));
const scope={};scope.window=scope;vm.runInNewContext(read('../js/data.js'),{window:scope});
vm.runInNewContext(read('../js/rules-core.js'),{window:scope});
vm.runInNewContext(read('../js/fog-controller.js'),{window:scope});
const {UNIT_TYPES,BUILD_TYPES,FogRuleKernel:k,FogVisibility:visibility}=scope;
const COST=[1,2,2,2,999],DEF=[0,-1,1,2,0];
const types={PLAIN:0,WATER:1,FOREST:2,HILL:3,MOUNTAIN:4};
const labels=Object.fromEntries(Object.keys(UNIT_TYPES).map(x=>[x,x]));
function randomizer(seed){
 let x=seed>>>0||1;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
}
const dist=(a,b)=>Math.abs(a.r-b.r)+Math.abs(a.c-b.c);
function refresh(g){
 for(const side of [1,2])
  visibility.project({map:g.map,units:g.units,buildings:g.buildings,state:g.state,
    side,modeBeta:g.modeBeta,kernel:k});
}
function invariant(g,ctx){
 if(g.units.length>140)throw Error(ctx+' exceeds unit cap');
 if(![1,2].includes(g.state.currentPlayer))throw Error(ctx+' invalid side');
 if(g.state.gold[1]<0||g.state.gold[2]<0)throw Error(ctx+' negative gold');
 if(!Number.isInteger(g.state.turn)||g.state.turn<0)throw Error(ctx+' invalid turn');
 const ids=new Set(),places=new Map();
 for(const u of g.units){
  if(ids.has(u.id))throw Error(ctx+' duplicate unit id');ids.add(u.id);
  const key=u.r+','+u.c;
  if(places.has(key))throw Error(ctx+' overlapping armies at '+key+' '+JSON.stringify([places.get(key),u]));
  places.set(key,u);
  if(u.r<0||u.c<0||u.r>=g.rows||u.c>=g.cols||
    !Number.isFinite(u.mp)||u.mp<0||!Number.isFinite(u.hp)||
    u.hp<=0||u.hp>UNIT_TYPES[u.type].hpMax)
    throw Error(ctx+' invalid unit '+JSON.stringify(u));
 }
 for(const b of g.buildings)if(b.r<0||b.c<0||b.r>=g.rows||b.c>=g.cols||
   b.hp<0||b.hp>BUILD_TYPES[b.type].hpMax||
   ![0,1,2].includes(b.owner))
   throw Error(ctx+' invalid building '+JSON.stringify(b));
 for(const side of [1,2]){
  const fog=g.state.fog[side],seen=g.state.seen[side];
  if(fog.length!==g.rows||seen.length!==g.rows||
    fog.some(row=>row.length!==g.cols)||seen.some(row=>row.length!==g.cols))
   throw Error(ctx+' wrong fog size');
  for(const u of g.units.filter(u=>u.owner===side))
   if(fog[u.r][u.c])throw Error(ctx+' own army concealed from owner');
 }
}
function runCampaign({level=6,seed=1,size='small',maxHalfTurns=60}={}){
 let g=rules.createOriginalMatch({size,seed});
 const random=randomizer((seed*1777+level*733)>>>0);
 const randMath=Object.create(Math);randMath.random=random;
 const metric={level,seed,size,turns:0,winner:null,accepted:0,rejected:0,
  move:0,spawn:0,attack:0,heal:0,aiAttack:0,aiSpawn:0,aiHeal:0,
  captures:0,maximumArmy:g.units.length,maximumGold:5};
 const initialBuildingOwners=new Map(g.buildings.map(b=>[b.id,b.owner]));
 function command(action){
  const before=g;
  const result=rules.originalAction(g,1,action);
  if(result.error){metric.rejected++;return false;}
  if(result.state===before)throw Error('accepted order not copied');
  g=result.state;metric.accepted++;
  invariant(g,'opponent order '+JSON.stringify(action)+' seed '+seed+' level '+level);
  metric[action.type]=(metric[action.type]||0)+1;
  return true;
 }
 function opponentTurn(){
  if(g.phase!=='battle'||g.state.currentPlayer!==1)return;
  // Build real units from the economic stockpile, but keep supply bounded.
  let built=0;
  for(const b of g.buildings.filter(b=>b.owner===1&&BUILD_TYPES[b.type].spawn.length)){
    if(built>=2||g.units.length>=115)break;
    const options=BUILD_TYPES[b.type].spawn.filter(t=>UNIT_TYPES[t].cost<=g.state.gold[1]);
    if(!options.length)continue;
    const unitType=options[(seed+g.state.turn+b.r+b.c)%options.length];
    const points=[[0,1],[1,0],[0,-1],[-1,0]].map(([dr,dc])=>({r:b.r+dr,c:b.c+dc}));
    const place=points.find(p=>k.canSpawn(g.map,g.units,g.buildings,g.state,b,unitType,
      p,UNIT_TYPES,BUILD_TYPES,false));
    if(place&&command({type:'spawn',building:b.id,unitType,...place}))built++;
  }
  for(const original of [...g.units.filter(x=>x.owner===1)].slice(0,55)){
    let attempts=0;
    while(attempts++<3&&g.phase==='battle'){
      const u=g.units.find(x=>x.id===original.id);
      if(!u||u.mp<=0)break;
      if(u.type==='mage'){
        const ally=g.units.filter(x=>k.canHeal(u,x,1,UNIT_TYPES))
          .sort((a,b)=>a.hp/UNIT_TYPES[a.type].hpMax-b.hp/UNIT_TYPES[b.type].hpMax)[0];
        if(ally&&command({type:'heal',unit:u.id,r:ally.r,c:ally.c}))break;
      }
      const enemies=g.units.filter(x=>x.owner===2&&!g.state.fog[1][x.r][x.c]);
      const buildings=g.buildings.filter(x=>x.owner!==1&&!g.state.fog[1][x.r][x.c]);
      if(u.type!=='mage'&&g.map[u.r][u.c]!==1){
        const targets=[...enemies,...buildings].filter(x=>dist(u,x)<=UNIT_TYPES[u.type].range&&
          k.lineOfSight(g.map,u.r,u.c,x.r,x.c,false))
          .sort((a,b)=>a.hp-b.hp);
        if(targets[0]&&command({type:'attack',unit:u.id,r:targets[0].r,c:targets[0].c}))break;
      }
      const rem=k.reach(g.map,g.units,g.buildings,u,COST);
      const choices=[];
      for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++)
       if(rem[r][c]>=0&&(r!==u.r||c!==u.c)&&
         !g.units.some(x=>x.r===r&&x.c===c))
        choices.push({r,c,left:rem[r][c]});
      if(!choices.length)break;
      // Pursue last-known enemy strongholds, then explore into the opposite side.
      const known=buildings.filter(b=>b.owner===2);
      const goal=known[0]||{r:g.rows-2,c:g.cols-2};
      choices.sort((a,b)=>
        (dist(a,goal)*3-a.left*.04)-(dist(b,goal)*3-b.left*.04));
      let best=choices[0];
      if(dist(best,goal)>=dist(u,goal))best=choices[Math.floor(random()*Math.min(5,choices.length))];
      if(!command({type:'move',unit:u.id,r:best.r,c:best.c}))break;
    }
  }
  if(g.phase==='battle')command({type:'end'});
 }
 const ai={Math:randMath,console};
 const w={Math:randMath,console};
 vm.runInNewContext(read('../js/ai.js'),{window:w,Math:randMath,console},{timeout:30000});
 function aiTurn(){
  if(g.phase!=='battle'||g.state.currentPlayer!==2)return;
  Object.assign(w,{map:g.map,units:g.units,buildings:g.buildings,
    state:g.state,nextUnitId:g.nextUnitId,aiLevel:level,TERRAIN:types,
    TERR_DEF:DEF,TERR_COST:COST,UNIT_TYPES,BUILD_TYPES,UNIT_LABELS:labels,
    hasLOS:(r,c,rr,cc,{forestBlock=true}={})=>
      k.lineOfSight(g.map,r,c,rr,cc,forestBlock),
    computeZone:u=>{
      const rem=k.reach(g.map,g.units,g.buildings,u,COST),list=[];
      for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++)
        if(rem[r][c]>=0&&(r!==u.r||c!==u.c)&&
          !g.units.some(x=>x.r===r&&x.c===c))list.push({r,c});
      return{list,rem};
    },
    doAttack:(a,b)=>{
      const result=k.unitDamage(a,b,g.map,g.buildings,UNIT_TYPES,BUILD_TYPES,DEF);
      if(b.type!=='bog')b.hp-=result.damage;
      if(a.type!=='bog')a.hp-=result.retaliation;
      const killed=b.hp<=0&&b.type!=='bog';
      if(killed)g.units.splice(g.units.indexOf(b),1);
      if(a.hp<=0&&a.type!=='bog')g.units.splice(g.units.indexOf(a),1);
      return{dmg:result.damage,rdmg:result.retaliation,killed};
    },
    damageBuilding:(b,damage=1)=>{b.hp=Math.max(0,b.hp-damage);},
    attemptCapture:(a,b)=>k.capture(a,b,BUILD_TYPES),
    addReplay:event=>{
      if(event.type==='spawn')metric.aiSpawn++;
      else if(event.type==='heal')metric.aiHeal++;
      else if(event.type==='attack')metric.aiAttack++;
    },
    recordEvent:()=>{},
    updateFog:()=>refresh(g),
    nextTurn:()=>{
      k.advanceTurn(g.state,g.units,g.buildings,UNIT_TYPES,BUILD_TYPES);
      const winner=k.evaluateVictory(g.state,g.units,g.buildings,BUILD_TYPES,2);
      if(winner){g.phase='finished';g.winner=winner;}
      g.revision++;
      refresh(g);
    }
  });
  // The actual original AI's action economy and tactical decisions execute here.
  w.aiTakeTurn();
  g.nextUnitId=w.nextUnitId;
 }
 invariant(g,'spawn');
 for(let turn=0;turn<maxHalfTurns&&g.phase==='battle';turn++){
  const before=g.state.turn;
  if(g.state.currentPlayer===1)opponentTurn();
  else aiTurn();
  if(g.phase==='battle'&&g.state.turn!==before+1)
   throw Error('turn did not advance exactly once: '+JSON.stringify({seed,level,turn,before,after:g.state.turn,side:g.state.currentPlayer}));
  if(g.phase==='finished'&&g.state.turn!==before&&g.state.turn!==before+1)
   throw Error('victory changed turn unexpectedly');
  invariant(g,'seed '+seed+' level '+level+' turn '+turn);
  metric.turns++;
  metric.maximumArmy=Math.max(metric.maximumArmy,g.units.length);
  metric.maximumGold=Math.max(metric.maximumGold,g.state.gold[1],g.state.gold[2]);
 }
 metric.winner=g.winner;
 metric.captures=[...g.buildings].filter(b=>initialBuildingOwners.get(b.id)!==b.owner).length;
 return metric;
}
export {runCampaign};
