import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../server/module.ts');
const pinned=read('../../../pocketnet/module-versions/fog-of-conquest/v9.ts');
const originalV6=read('../../../pocketnet/module-versions/fog-of-conquest/v8.ts');
const client=read('../js/rules-core.js');
const load=async text=>import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
const newer=await load(source),legacy=await load(originalV6);
const context={};context.window=context;vm.createContext(context);
vm.runInContext(client,context,{filename:'rules-core.js'});
const kernel=context.FogRuleKernel;
const clean=x=>JSON.parse(JSON.stringify(x));
const positions=(u,g)=>Array.from({length:g.rows},(_,r)=>
 Array.from({length:g.cols},(_,c)=>({r,c}))).flat().filter(p=>
 p.r!==u.r||p.c!==u.c);
function trim(s){return {
 phase:s.phase,winner:s.winner,revision:s.revision,
 state:{turn:s.state.turn,currentPlayer:s.state.currentPlayer,gold:s.state.gold,grace:s.state.grace},
 units:s.units.map(u=>({id:u.id,type:u.type,owner:u.owner,r:u.r,c:u.c,hp:u.hp,mp:u.mp})),
 buildings:s.buildings.map(b=>({type:b.type,owner:b.owner,r:b.r,c:b.c,hp:b.hp,gen:b.gen}))
};}
test('embedded PocketNet rules exactly match the client kernel and v7 immutable snapshot',()=>{
 const marker='const FogRuleKernel=';
 const extract=s=>s.slice(s.lastIndexOf(marker,s.indexOf('function reach')),
   s.indexOf('})();',s.indexOf('function reach'))+5);
 const a=extract(client),b=extract(source);
 assert.equal(a,b,'Current server embedded kernel drifted from client source');
 assert.equal(source,pinned);
 assert.match(originalV6,/RULESET_VERSION=7;/);
 assert.match(source,/RULESET_VERSION=8;/);
});
test('movement legality and movement points match authoritative historical rules on 4 sizes',()=>{
 let checks=0;
 for(const size of ['tiny','small','medium','large']){
  for(let seed=1;seed<=100;seed++){
   const state=newer.createOriginalMatch({size,seed});
   for(const unit of state.units.filter(u=>u.owner===1&&u.type!=='bog')){
    const reach=clean(kernel.reach(state.map,state.units,state.buildings,unit,[1,2,2,2,999]));
    const targets=positions(unit,state);
    const available=targets.filter(p=>reach[p.r][p.c]>=0&&
      !state.units.some(other=>other.r===p.r&&other.c===p.c));
    if(!available.length)continue;
    const target=available[(seed*13+unit.id)%available.length];
    const cmd={type:'move',unit:unit.id,...target};
    const a=newer.originalAction(state,1,cmd),b=legacy.originalAction(state,1,cmd);
    assert.equal(a.error,b.error);
    assert.deepEqual(trim(a.state),trim(b.state));
    assert.equal(a.state.units.find(u=>u.id===unit.id).mp,reach[target.r][target.c]);
    checks++;
   }
  }
 }
 assert.ok(checks>=500,'insufficient executable movement parity cases');
});
test('income, healing, movement refresh, attrition and wins match 1000 historical turns',()=>{
 let count=0;
 for(const size of ['tiny','small','medium','large']){
  for(let seed=21;seed<=45;seed++){
   let game=newer.createOriginalMatch({size,seed});
   for(let turn=0;turn<10&&game.phase==='battle';turn++){
    const side=game.state.currentPlayer;
    const a=newer.originalAction(game,side,{type:'end'});
    const b=legacy.originalAction(game,side,{type:'end'});
    assert.equal(a.error,null);
    assert.deepEqual(trim(a.state),trim(b.state));
    game=a.state;count++;
   }
  }
 }
 assert.equal(count,1000);
});
test('damage formulas preserve original outcome across units, terrain and defensive structures',()=>{
 const types={
  swordsman:{atk:2,def:1,range:1},archer:{atk:3,def:0,range:2},
  cavalry:{atk:3,def:1,range:1},heavy:{atk:3,def:2,range:1},
  mage:{atk:0,def:0,range:1},bog:{atk:2,def:1,range:1}
 };
 const terrain=[0,-1,1,1,2];
 const unitDefs=Object.fromEntries(Object.entries(types).map(([name,t])=>[name,{...t}]));
 const buildingDefs={base:{def:1},fort:{def:2},mill:{def:0}};
 const map=Array.from({length:4},()=>[0,0,0,0]);
 let n=0;
 for(const attackerType of ['swordsman','archer','heavy','cavalry','bog'])
 for(const defenderType of Object.keys(types))
 for(const terrainCode of [0,1,2,3,4]){
   map[1][2]=terrainCode;
   const a={id:1,type:attackerType,owner:1,r:1,c:1,hp:5,mp:2};
   const d={id:2,type:defenderType,owner:2,r:1,c:2,hp:defenderType==='bog'?1000:5,mp:1};
   for(const fortified of [false,true]){
     const buildings=fortified?[{r:1,c:2,owner:2,type:'fort'}]:[];
     const result=kernel.unitDamage(a,d,map,buildings,unitDefs,buildingDefs,terrain);
     let atk=types[attackerType].atk;
     if(attackerType==='cavalry'&&fortified)atk--;
     const expected=Math.max(1,atk-types[defenderType].def-terrain[terrainCode]);
     assert.equal(result.damage,expected);
     assert.equal(result.retaliation,
       types[attackerType].range===1&&(defenderType==='bog'||d.hp>expected)?
       Math.max(1,types[defenderType].atk-types[attackerType].def-terrain[0]):0);
     n++;
   }
 }
 assert.ok(n>=250);
});
test('cavalry loses attack only against buildings owned by the defending unit',()=>{
 const map=[[0,0,0],[0,0,0],[0,0,0]];
 const units={cavalry:{atk:3,def:1,range:1},swordsman:{atk:2,def:1,range:1}};
 const buildings={fort:{def:2}};
 const a={type:'cavalry',owner:1,r:1,c:0,hp:5},d={type:'swordsman',owner:2,r:1,c:1,hp:5};
 const enemy=kernel.unitDamage(a,d,map,[{r:1,c:1,owner:2,type:'fort'}],units,buildings,[0]);
 const neutral=kernel.unitDamage(a,d,map,[{r:1,c:1,owner:0,type:'fort'}],units,buildings,[0]);
 assert.equal(enemy.damage,1);
 assert.equal(neutral.damage,2);
});
