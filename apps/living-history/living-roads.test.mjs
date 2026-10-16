import test from 'node:test';
import assert from 'node:assert/strict';
import {walkPath,pathEffort,roadCost,roadWetness,walkingSteps,workdayFraction} from './navigation.js';
import {createWorld,advanceDays,audit,serialize,deserialize,SIZE} from './model.js';
const idx=(x,y)=>y*SIZE+x;
const makeMap=()=>({seed:11,day:300,roadRevision:0,landRevision:0,
 terrain:new Uint8Array(SIZE*SIZE),usage:new Uint8Array(SIZE*SIZE),
 traffic:new Uint8Array(SIZE*SIZE)});
test('finite weather-aware road speed follows actual effort; no teleporting',()=>{
 const s=makeMap(),bare=idx(25,25),lane=idx(26,25);
 assert.ok(roadWetness(s)>=0&&roadWetness(s)<=1);
 const old=roadCost(s,bare);
 s.traffic[lane]=90;
 assert.ok(roadCost(s,lane)<old);
 assert.ok(roadCost(s,lane)>=.76);
 assert.ok(Number.isFinite(pathEffort(s,[{x:25,y:25},{x:26,y:25}])));
 assert.equal(pathEffort(s,[{x:25,y:25},{x:27,y:25}]),Infinity);
 assert.ok(workdayFraction(roadCost(s,lane))>=workdayFraction(roadCost(s,bare)));
});
test('worn roads can cause a physical longer route; private crofts cannot be shortcuts',()=>{
 const s=makeMap(),from={x:10,y:10},to={x:18,y:10};
 const direct=walkPath(s,from,to);
 assert.equal(direct.length-1,8);
 for(let x=10;x<=18;x++)s.traffic[idx(x,9)]=255;
 s.roadRevision++;
 const rerouted=walkPath(s,from,to);
 assert.ok(rerouted.length>=direct.length);
 assert.ok(pathEffort(s,rerouted)<=pathEffort(s,direct)+1e-6);
 // Physical titles prohibit third-party shortcutting through gardens.
 for(let x=12;x<=16;x++)s.usage[idx(x,10)]=3;
 s.landRevision++;
 const reroutedCroft=walkPath(s,from,to);
 assert.ok(reroutedCroft.every(({x,y})=>s.usage[idx(x,y)]!==3));
 assert.equal(pathEffort(s,reroutedCroft)<=pathEffort(s,direct),false);
});
test('walking distances invalidate when new enclosed crofts block a corridor',()=>{
 const s=makeMap();
 const from={x:10,y:10},to={x:15,y:10};
 const before=walkingSteps(s,from,to);
 s.usage[idx(12,10)]=3;s.landRevision++;
 const after=walkingSteps(s,from,to);
 assert.ok(after>before);
});
test('old save lacking revisions remains loadable, and routing after restore is identical',()=>{
 const world=createWorld(413);
 advanceDays(world,40);
 const restored=deserialize(serialize(world));
 assert.equal(serialize(restored),serialize(world));
 const a=world.households[0],b=world.communities.find(c=>c.id===a.communityId);
 assert.deepEqual(walkPath(restored,a,b),walkPath(world,a,b));
 advanceDays(world,21);advanceDays(restored,21);
 assert.equal(serialize(restored),serialize(world));
 assert.ok(audit(world).ok);
 const legacy=JSON.parse(serialize(world));
 delete legacy.roadRevision;delete legacy.landRevision;
 for(const h of legacy.households)delete h.commuteMemo;
 const loaded=deserialize(JSON.stringify(legacy));
 assert.ok(audit(loaded).ok);
 assert.ok(walkPath(loaded,loaded.households[0],loaded.communities[0]).length>1);
});
test('traffic decays on unused routes; farm travel requires real effective hours',()=>{
 const s=createWorld(7777),away=idx(1,1);
 s.traffic[away]=20;
 const initial=s.traffic[away];
 advanceDays(s,30);
 assert.equal(s.traffic[away],initial-1);
 const h=s.households.find(h=>h.commuteMemo);
 assert.ok(h,'farming household records a physical site-specific commute');
 assert.ok(h.commuteMemo.effort>=0&&Number.isFinite(h.commuteMemo.effort));
 assert.ok(workdayFraction(h.commuteMemo.effort)<=1);
 assert.ok(audit(s).ok,audit(s).issues.slice(0,5).join('; '));
});
