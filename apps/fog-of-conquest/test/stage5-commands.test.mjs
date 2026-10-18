import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../server/module.ts');
const prior=read('../../../pocketnet/module-versions/fog-of-conquest/v7.ts');
const pinned=read('../../../pocketnet/module-versions/fog-of-conquest/v8.ts');
const rules=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const old=await import('data:text/javascript;base64,'+Buffer.from(prior).toString('base64'));
const context={};context.window=context;vm.createContext(context);
vm.runInContext(read('../js/rules-core.js'),context);
const k=context.FogRuleKernel;
const clean=o=>JSON.parse(JSON.stringify(o));
const types={swordsman:{hpMax:5,move:2,cost:3},mage:{hpMax:4,move:2,cost:7}};
const buildings={base:{spawn:['swordsman','archer'],hpMax:4},mageTower:{spawn:['mage'],hpMax:3}};
const simple=()=>Array.from({length:5},()=>Array(8).fill(0));
test('v8 embedded kernel stays byte-identical to client and immutable pin',()=>{
 const block=c=>c.slice(c.lastIndexOf('const FogRuleKernel=',c.indexOf('function reach')),
   c.indexOf('})();',c.indexOf('function reach'))+5);
 assert.equal(block(source),block(read('../js/rules-core.js')));
 assert.equal(source,pinned);
 assert.match(prior,/RULESET_VERSION=6;/);
 assert.match(source,/RULESET_VERSION=7;/);
});
test('LOS and fog parity with previous rules on 4 sizes × 40 seeds, including stale buildings',()=>{
 for(const size of ['tiny','small','medium','large']){
  for(let seed=1;seed<=40;seed++){
   const current=rules.createOriginalMatch({size,seed});
   const previous=old.createOriginalMatch({size,seed});
   assert.deepEqual(current.map,previous.map);
   for(const side of [1,2]){
    assert.deepEqual(current.state.fog[side],previous.state.fog[side]);
    const fog=clean(k.fogForSide(current.map,current.units,current.buildings,side));
    assert.deepEqual(fog,current.state.fog[side]);
    const seat={id:side===1?'a':'b'};
    let room=rules.default.createRoom({player:{id:'a'}}).state;
    room=rules.default.onJoin({state:room,player:{id:'b'},players:[{id:'a'},{id:'b'}]}).state;
    room.phase='battle';room.game=current;
    const projected=rules.default.viewForPlayer({state:room,player:seat});
    assert.ok(projected.game.units.every(u=>u.owner===side||
      !current.state.fog[side][u.r][u.c]));
    assert.equal(projected.game.state.gold[3-side],undefined);
   }
  }
 }
});
test('fog does not leak hidden buildings after ownership/HP changes',()=>{
 const g=rules.createOriginalMatch({size:'small',seed:40});
 const enemy=g.buildings.find(b=>b.owner===2);
 assert.ok(enemy);
 const position={r:enemy.r,c:enemy.c};
 assert.equal(g.state.fog[1][position.r][position.c],true);
 const a={id:'a'},b={id:'b'};
 let room=rules.default.createRoom({player:a}).state;
 room=rules.default.onJoin({state:room,player:b,players:[a,b]}).state;
 room.phase='battle';room.game=g;
 const before=rules.default.viewForPlayer({state:room,player:a}).game;
 enemy.hp=1;enemy.owner=0; // unobserved mutation remains confidential
 const after=rules.default.viewForPlayer({state:room,player:a}).game;
 assert.deepEqual(before.buildings,after.buildings);
 assert.equal(after.buildings.some(x=>x.r===position.r&&x.c===position.c&&x.hp===1),false);
});
test('heal validator agrees with server, caps health and consumes mage movement',()=>{
 const g=rules.createOriginalMatch({size:'tiny',seed:33});
 g.map=simple();
 const mage={id:500,owner:1,type:'mage',r:2,c:2,hp:4,mp:2};
 const wounded={id:501,owner:1,type:'swordsman',r:2,c:3,hp:2,mp:0};
 g.units=[mage,wounded];g.state.currentPlayer=1;g.phase='battle';
 assert.equal(k.canHeal(mage,wounded,1,types),true);
 let result=rules.originalAction(g,1,{type:'heal',unit:500,r:2,c:3});
 assert.equal(result.error,null);
 assert.equal(result.state.units.find(u=>u.id===501).hp,4);
 assert.equal(result.state.units.find(u=>u.id===500).mp,0);
 assert.equal(k.canHeal(result.state.units[0],result.state.units[1],1,types),false);
 const invalid=rules.originalAction(result.state,1,{type:'heal',unit:500,r:2,c:3});
 assert.ok(invalid.error);
 assert.equal(invalid.state,result.state);
 const enemy={...wounded,owner:2,hp:1};
 assert.equal(k.canHeal(mage,enemy,1,types),false);
});
test('recruit from owned building, reject foreign spawn, overlap and 140-unit boundary',()=>{
 const g=rules.createOriginalMatch({size:'tiny',seed:42});
 g.map=simple();g.units=[];g.state.currentPlayer=1;g.state.gold[1]=70;
 const base=g.buildings.find(b=>b.owner===1&&b.type==='base');
 const at=[{r:base.r+1,c:base.c},{r:base.r-1,c:base.c},{r:base.r,c:base.c+1},{r:base.r,c:base.c-1}]
  .find(p=>p.r>=0&&p.r<5&&p.c>=0&&p.c<8);
 assert.ok(at);
 const cmd={type:'spawn',building:base.id,unitType:'swordsman',...at};
 assert.equal(k.canSpawn(g.map,g.units,g.buildings,g.state,base,'swordsman',at,
   types,buildings,false),true);
 const first=rules.originalAction(g,1,cmd);
 assert.equal(first.error,null);
 assert.equal(first.state.state.gold[1],67);
 assert.equal(first.state.units.at(-1).mp,0);
 const duplicate=rules.originalAction(first.state,1,cmd);
 assert.match(duplicate.error,/недоступно/);
 const wrong=rules.originalAction(g,1,{...cmd,building:g.buildings.find(b=>b.owner===2).id});
 assert.ok(wrong.error);
 const limit=clean(g);limit.units=Array.from({length:140},(_,i)=>({
  id:1000+i,owner:1,type:'swordsman',r:100+i,c:100,hp:5,mp:0
 }));
 assert.equal(k.canSpawn(limit.map,limit.units,limit.buildings,limit.state,base,
   'swordsman',at,types,buildings,false),false);
 assert.match(rules.originalAction(limit,1,cmd).error,/велика/);
});
test('capturing destroyed enemy base restores original HP and updates owner',()=>{
 const g=rules.createOriginalMatch({size:'tiny',seed:45});
 g.map=simple();
 const b=g.buildings.find(x=>x.owner===2&&x.type==='base');
 b.hp=0;
 const r=b.r,c=b.c;
 const from=c>0?{r,c:c-1}:{r,c:c+1};
 const attacker={id:800,owner:1,type:'swordsman',...from,mp:2,hp:5};
 g.units=[attacker];
 const direct=clean(b);const directUnit={...attacker,r,c};
 const result=k.capture(directUnit,direct,{base:{hpMax:4}});
 assert.deepEqual(clean(result),{valid:true,captured:true});
 assert.equal(direct.owner,1);assert.equal(direct.hp,4);
 const moved=rules.originalAction(g,1,{type:'move',unit:800,r,c});
 assert.equal(moved.error,null);
 const actual=moved.state.buildings.find(x=>x.id===b.id);
 assert.equal(actual.owner,1);
 assert.equal(actual.hp,4);
 assert.equal(moved.state.units[0].r,r);
 assert.equal(moved.state.units[0].c,c);
});
