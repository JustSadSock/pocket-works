import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicV2Practice,tick,STEP,validState} from '../core.mjs';

const idle={x:0,y:0,attack:false,shield:false,dash:false,aim:{x:320,y:484}};
function network(shield){
 const s=makeMagicV2Practice('storm',20101);
 s.phase='fight';s.actors[1].x=190;s.actors[1].y=530;
 s.actors[1].shield=shield;
 s.barriers.push(
  {owner:0,x:125,y:530,r:13,life:3,hp:24,v2Pylon:true,nodeId:1001},
  {owner:0,x:245,y:530,r:13,life:3,hp:24,v2Pylon:true,nodeId:1002}
 );
 // Independently stacked real conduits recreate the maximum secondary
 // exposure; all share ONE authoritatively owned damage-and-drain budget.
 for(let k=0;k<8;k++)s.mines.push({owner:0,x:125,y:530,x2:245,y2:530,
  aId:1001,bId:1002,life:2.7,arm:0,damage:2.4,element:'storm',
  v2Conduit:true,conduitCd:0});
 return s;
}
const step=s=>tick(s,idle,STEP,idle);
test('eight concurrent electrical wires cannot drain more than 12 combined shield points in a second',()=>{
 const s=network(50);
 step(s);
 assert.equal(s.actors[1].shield,38,'free extra shield-drain must share the secondary allowance');
 assert.equal(s.actors[1].hp,100);
 assert.equal(s.actors[0].v2SecondaryWindow.spent,12);
 for(let i=0;i<55;i++)step(s);
 assert.equal(s.actors[1].shield,38,'other pulses remain blocked for the same budget window');
 assert.equal(validState(s),true);
});
test('secondary shield stripping does not waste the damage budget when enemy has no shield',()=>{
 const s=network(0);
 step(s);
 assert.ok(Math.abs(s.actors[1].hp-88)<1e-8,'no phantom shield drainage should deny legitimate secondary HP damage');
 assert.equal(s.actors[0].v2SecondaryWindow.spent,12);
 assert.equal(validState(s),true);
});
test('sphere pulse and stacked conduits share one shield/health window',()=>{
 const s=network(45);
 const q={owner:0,x:160,y:530,vx:0,vy:0,r:12,life:.85,
  damage:9,element:'storm',style:'arc',depth:0,
  v2Sphere:true,v2Orbit:false,spherePulse:0};
 s.shots.push(q);
 step(s);
 assert.ok(s.actors[1].shield>=33,'orb pulse plus 8 wires must not exceed shared 12-point budget');
 assert.equal(s.actors[1].hp,100);
 assert.ok(s.actors[0].v2SecondaryWindow.spent<=12);
 assert.equal(validState(s),true);
});
