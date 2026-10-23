import test from 'node:test';
import assert from 'node:assert/strict';
import {validRoom,roleOf,acceptOnlineSnapshot} from './online-flow.js';
test('only real short code and UUID invites accepted',()=>{
 assert.ok(validRoom('A1B2C3D4'));
 assert.ok(validRoom('01234567-89ab-cdef-0123-456789abcdef'));
 for(const value of ['ABCDEFGH','00','',null,'http://evil.test','a'.repeat(200)])assert.equal(validRoom(value),false);
});
test('each player sees only their authorized button',()=>{
 const state={roles:['host','guest']};
 assert.equal(roleOf(state,'host'),0);assert.equal(roleOf(state,'guest'),1);
 assert.equal(roleOf(state,'intruder'),-1);assert.equal(roleOf(null,'host'),-1);
});
test('restarted round replaces old messages even if time goes backward',()=>{
 const first={phase:'play',players:[],robot:{t:9},round:1,revision:12};
 const restarted={phase:'play',players:[],robot:{t:0},round:2,revision:13};
 assert.ok(acceptOnlineSnapshot(first,restarted));
 assert.equal(acceptOnlineSnapshot(restarted,first),false);
});
test('same-round stale packet never rolls the robot backward',()=>{
 const first={phase:'play',players:[],robot:{t:1.2},round:2,revision:3};
 const backward={...first,robot:{t:.9}};
 assert.equal(acceptOnlineSnapshot(first,backward),false);
 assert.ok(acceptOnlineSnapshot(first,{...first,robot:{t:1.4}}));
 assert.equal(acceptOnlineSnapshot(first,{...first,revision:2}),false);
});
test('reject invalid room snapshots instead of breaking UI',()=>{
 assert.equal(acceptOnlineSnapshot(null,{}),false);
 assert.equal(acceptOnlineSnapshot(null,{phase:'unknown',players:[]}),false);
 assert.equal(acceptOnlineSnapshot(null,{phase:'lobby',players:[]}),true);
});

test('compact movement snapshots hydrate the prior round without modifying authoritative packets',()=>{
 const old={round:3,revision:1,phase:'play',players:[],robot:{level:{seed:23},x:1,t:1}};
 const input={round:3,revision:2,phase:'play',players:[],robot:{x:2,t:2}};
 const merged=hydrateOnlineSnapshot(old,input);
 assert.equal(merged.robot.level.seed,23);
 assert.equal(input.robot.level,undefined);
 assert.equal(old.robot.x,1);
 assert.equal(merged.robot.x,2);
});
test('compact snapshots cannot use a level from a different round or unknown peer',()=>{
 const old={round:3,revision:1,phase:'play',players:[],robot:{level:{seed:1},x:2,t:1}};
 assert.equal(hydrateOnlineSnapshot(null,{round:3,robot:{x:1}}),null);
 assert.equal(hydrateOnlineSnapshot(old,{round:4,robot:{x:2}}),null);
 assert.equal(hydrateOnlineSnapshot(old,{round:4,robot:{level:{seed:9},x:2}}).robot.level.seed,9);
});
