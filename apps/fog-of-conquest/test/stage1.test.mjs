import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../server/module.ts');
const snapshot=read('../../../pocketnet/module-versions/fog-of-conquest/v9.ts');
const previous=read('../../../pocketnet/module-versions/fog-of-conquest/v8.ts');
const rules=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sizes=[['tiny',5,8],['small',10,15],['medium',20,30],['large',20,60]];
const player1={id:'p1',name:'North'},player2={id:'p2',name:'South'};
function reachable(g){
  const seen=new Set(['1,1']),queue=[[1,1]];
  for(let i=0;i<queue.length;i++){
    const [r,c]=queue[i];
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const rr=r+dr,cc=c+dc,key=rr+','+cc;
      if(rr<0||cc<0||rr>=g.rows||cc>=g.cols||seen.has(key)||
        g.map[rr][cc]===4||g.map[rr][cc]===1)continue;
      seen.add(key);queue.push([rr,cc]);
    }
  }
  return seen.has((g.rows-2)+','+(g.cols-2));
}
test('v8 snapshot is immutable, old v7 remains a distinct ruleset',()=>{
  assert.equal(snapshot,source);
  assert.match(previous,/RULESET_VERSION=8;/);
  assert.match(source,/RULESET_VERSION=8;/);
  const lock=JSON.parse(read('../../../pocketnet/modules.lock.json'));
  assert.equal(lock['fog-of-conquest'].current,'v9');
});
test('FOG-012: rescue counter decrements only after the affected side ends a turn',()=>{
  const g=rules.createOriginalMatch({size:'small'});
  g.state.turn=1;
  g.buildings=g.buildings.filter(b=>b.owner!==1);
  let step=rules.originalAction(g,1,{type:'end'});
  assert.equal(step.error,null);assert.equal(step.state.state.grace[1],5);
  step=rules.originalAction(step.state,2,{type:'end'});
  assert.equal(step.state.state.grace[1],5);
  const wounded=step.state.units.find(u=>u.owner===1&&u.type==='archer');
  wounded.r=1;wounded.c=1;wounded.hp=1;
  const mage=step.state.units.find(u=>u.owner===1&&u.type==='swordsman');
  mage.type='mage';mage.mp=2;
  step=rules.originalAction(step.state,1,{type:'heal',unit:mage.id,r:1,c:1});
  assert.equal(step.error,null);assert.equal(step.state.state.grace[1],5);
  assert.equal(step.state.units.find(u=>u.id===wounded.id).hp,3);
  for(let n=4;n>=0;n--){
    step=rules.originalAction(step.state,1,{type:'end'});
    assert.equal(step.error,null);
    assert.equal(step.state.state.grace[1],n);
    if(n){
      step=rules.originalAction(step.state,2,{type:'end'});
      assert.equal(step.state.state.grace[1],n,'other side must not tick rescue');
      assert.equal(step.state.phase,'battle');
    }
  }
  assert.equal(step.state.phase,'finished');
  assert.equal(step.state.winner,2);
});
test('FOG-017: military buildings still count as original bases',()=>{
  const g=rules.createOriginalMatch({size:'small'});
  g.state.turn=1;
  g.buildings=g.buildings.filter(b=>b.owner!==1||b.type==='barracks');
  g.buildings.push({id:'owned-barracks',r:0,c:0,owner:1,hp:3,type:'barracks',gen:0});
  const step=rules.originalAction(g,1,{type:'end'});
  assert.equal(step.error,null);
  assert.equal(step.state.state.grace[1],null);
});
test('FOG-020: recruitment refuses the 141st unit',()=>{
  const g=rules.createOriginalMatch({size:'medium'});
  g.state.gold[1]=100;
  while(g.units.length<140)g.units.push({...g.units[0],id:g.nextUnitId++,r:10,c:10});
  const base=g.buildings.find(b=>b.type==='base'&&b.owner===1);
  const result=rules.originalAction(g,1,{type:'spawn',building:base.id,unitType:'swordsman',r:0,c:1});
  assert.match(result.error,/слишком велика/);
  assert.equal(result.state.units.length,140);
});
test('FOG-016: seeded map generation is reproducible and does not disclose the seed',()=>{
  for(const [size] of sizes){
    const a=rules.createOriginalMatch({size,beta:true,seed:143});
    const b=rules.createOriginalMatch({size,beta:true,seed:143});
    assert.deepEqual({map:a.map,units:a.units,buildings:a.buildings},
      {map:b.map,units:b.units,buildings:b.buildings});
    const room={phase:'battle',host:'p1',revision:1,seats:[player1,player2],game:a};
    assert.equal(rules.default.viewForPlayer({state:room,player:player1}).game.seed,undefined);
  }
});
test('FOG-015: hidden enemy construction is last-known, not current HP',()=>{
  const g=rules.createOriginalMatch({size:'medium',seed:41});
  const b=g.buildings.find(x=>x.owner===2&&x.type==='base');
  const k=b.r+','+b.c;
  assert.equal(g.state.fog[1][b.r][b.c],true);
  g.state.seen[1][b.r][b.c]=true;
  g.state.lastSeen[1][k]={id:b.id,r:b.r,c:b.c,owner:2,type:b.type,hp:2,gen:0};
  b.hp=4;
  const room={phase:'battle',host:'p1',revision:1,seats:[player1,player2],game:g};
  const view=rules.default.viewForPlayer({state:room,player:player1}).game;
  const remembered=view.buildings.find(x=>x.r===b.r&&x.c===b.c);
  assert.equal(remembered.hp,2);
  assert.equal(remembered.lastSeen,true);
  assert.equal(view.state.lastSeen[2],undefined);
  assert.equal(view.state.gold[2],undefined);
});
test('FOG-016: 500 seeded worlds per size keep all entities valid and bases connected',()=>{
  for(const [size,rows,cols] of sizes)for(let seed=0;seed<500;seed++){
    const g=rules.createOriginalMatch({size,seed,beta:seed%2===0});
    assert.equal(g.map.length,rows);assert.equal(g.map[0].length,cols);
    assert.ok(reachable(g),size+' seed '+seed+' disconnected');
    assert.equal(g.buildings.filter(b=>b.type==='base').length,2);
    const occ=new Set();
    for(const u of g.units){
      assert.ok(u.r>=0&&u.r<rows&&u.c>=0&&u.c<cols);
      const key=u.r+','+u.c;
      assert.ok(!occ.has(key),size+' seed '+seed+' duplicate unit '+key);
      occ.add(key);
    }
    for(const b of g.buildings)assert.ok(b.r>=0&&b.r<rows&&b.c>=0&&b.c<cols);
  }
});
function aiContext({healer=false,level=0}={}){
  const types={
    mage:{hpMax:4,move:2,range:1,atk:0,def:0,cost:7},
    heavy:{hpMax:6,move:1,range:1,atk:3,def:2,cost:5},
    swordsman:{hpMax:5,move:2,range:1,atk:2,def:1,cost:3}
  };
  const unit=healer?
    {id:1,owner:2,type:'mage',r:1,c:1,hp:4,mp:2}:
    {id:1,owner:2,type:'swordsman',r:1,c:1,hp:5,mp:2};
  const units=healer?[unit,{id:2,owner:2,type:'heavy',r:1,c:2,hp:2,mp:0}]:[unit];
  const map=Array.from({length:4},()=>Array(4).fill(0));
  const w={console,Math,map,units,buildings:[],state:{
    currentPlayer:2,gold:{2:0},fog:{2:map.map(row=>row.map(()=>false))},
    seen:{2:map.map(row=>row.map(()=>true))}},
    aiLevel:level,TERRAIN:{PLAIN:0,WATER:1,MOUNTAIN:4},TERR_COST:[1,2,2,2,999],TERR_DEF:[0,-1,1,2,0],
    UNIT_TYPES:types,BUILD_TYPES:{},UNIT_LABELS:{mage:'Маг',heavy:'Тяжёлый',swordsman:'Мечник'},
    hasLOS:()=>true,computeZone:u=>{
      const rem=map.map(row=>row.map(()=>-1));
      rem[u.r][u.c]=u.mp;
      const destination={r:u.r,c:u.c===1?2:1};
      if(u.mp>0)rem[destination.r][destination.c]=u.mp-1;
      return {list:u.mp>0?[destination]:[],rem};
    },doAttack:()=>{throw Error('Mage must not attack');},updateFog:()=>{},nextTurn:()=>{},
    recordEvent:()=>{},addReplay:()=>{},nextUnitId:3};
  vm.runInNewContext(read('../js/ai.js'),{window:w,console,Math});
  return {w,unit,units};
}
test('FOG-013: AI mage heals and consumes its action instead of attacking',()=>{
  const {w,unit,units}=aiContext({healer:true,level:6});
  w.aiTakeTurn();
  assert.equal(units[1].hp,4);assert.equal(unit.mp,0);
});
test('FOG-014/018: all seven AI levels use affordable zone moves',()=>{
  for(let level=0;level<7;level++)for(let match=0;match<20;match++){
    const {w,unit}=aiContext({level});
    for(let turn=0;turn<50;turn++){
      unit.mp=2;
      w.aiTakeTurn();
      assert.ok(unit.mp>=0&&unit.mp<=2);
      assert.ok(unit.r>=0&&unit.r<4&&unit.c>=0&&unit.c<4);
    }
  }
});

test('FOG-018: one thousand seeded authoritative orders preserve basic invariants',()=>{
  let tick=0,accepted=0;
  const random=()=>{tick=(Math.imul(tick,1664525)+1013904223)>>>0;return tick/4294967296;};
  for(const [size] of sizes){
    let g=rules.createOriginalMatch({size,seed:17});
    for(let n=0;n<250;n++){
      if(g.phase==='finished')g=rules.createOriginalMatch({size,seed:n+23});
      const p=g.state.currentPlayer;
      const mine=g.units.filter(x=>x.owner===p);
      const owned=g.buildings.filter(x=>x.owner===p&&['base','barracks','stable','mageTower'].includes(x.type));
      const r=random();
      let action={type:'end'};
      if(r<0.17&&mine.length){
        const u=mine[Math.floor(random()*mine.length)];
        const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
        const [dr,dc]=dirs[Math.floor(random()*dirs.length)];
        action={type:'move',unit:u.id,r:u.r+dr,c:u.c+dc};
      }else if(r<0.30&&owned.length){
        const b=owned[Math.floor(random()*owned.length)];
        const types={base:'swordsman',barracks:'heavy',stable:'cavalry',mageTower:'mage'};
        action={type:'spawn',building:b.id,unitType:types[b.type],r:b.r,c:b.c+1};
      }else if(r<0.40&&mine.length){
        const u=mine[Math.floor(random()*mine.length)];
        action={type:'attack',unit:u.id,r:u.r,c:u.c+1};
      }
      const before=JSON.stringify(g);
      const step=rules.originalAction(g,p,action);
      if(step.error){
        assert.equal(JSON.stringify(g),before,'denied action must not mutate authoritative state');
      }else{
        accepted++;g=step.state;
        assert.ok(g.revision>0);
        assert.ok(g.state.gold[1]>=0&&g.state.gold[2]>=0);
        for(const u of g.units){
          assert.ok(u.mp>=0&&Number.isFinite(u.mp));
          assert.ok(u.hp>0&&Number.isFinite(u.hp));
          assert.ok(u.r>=0&&u.r<g.rows&&u.c>=0&&u.c<g.cols);
        }
      }
    }
  }
  assert.ok(accepted>500,'orders must exercise meaningful accepted gameplay');
});
