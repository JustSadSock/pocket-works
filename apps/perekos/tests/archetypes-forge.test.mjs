import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHETYPES,makeMatch,stats,forgeEdit,startRound,tick,validState,grantEvolution,STEP} from '../core.mjs';
import server,{RULESET_VERSION} from '../server/module.ts';
const control={x:0,y:0,aim:{x:250,y:310},attack:false,shield:false,dash:false};
test('three archetypes are separate from six retained magicians and stat bonuses affect combat',()=>{
 assert.deepEqual(ARCHETYPES.map(x=>x.id),['striker','shaper','distorter']);
 const striker=makeMatch(100,'wire','coil','rupture','striker','striker').actors[0];
 const shaper=makeMatch(100,'wire','coil','rupture','shaper','shaper').actors[0];
 const distorter=makeMatch(100,'wire','coil','rupture','distorter','distorter').actors[0];
 assert.ok(stats(striker).damage>stats(shaper).damage);
 assert.ok(stats(striker).reload<stats(distorter).reload);
 assert.ok(stats(shaper).shield>stats(striker).shield);
 assert.equal(distorter.archetype,'distorter');
});
test('archetype persists through actual death and respawn',()=>{
 const s=makeMatch(71,'wire','pebble','rupture','distorter','shaper');
 s.actors[0].hp=0;tick(s,control,STEP,control);
 for(let i=0;i<162;i++)tick(s,control,STEP,control);
 assert.equal(s.actors[0].archetype,'distorter');assert.equal(s.actors[1].archetype,'shaper');assert.ok(validState(s));
});
test('distorter applies actual slow and heat on damaging an enemy',()=>{
 const s=makeMatch(122,'wire','wire','rupture','distorter','shaper');
 const a=s.actors[0],b=s.actors[1];a.x=140;a.y=310;b.x=198;b.y=310;a.cast=0;b.invuln=0;
 tick(s,{...control,attack:true,aim:{x:b.x,y:b.y}},STEP,control);
 for(let i=0;i<30;i++)tick(s,control,STEP,control);
 assert.ok(b.hp<100);assert.ok(b.slow>0||b.heat>0);
});
test('shaper makes physically larger persistent field than striker',()=>{
 const create=kind=>{const s=makeMatch(95,'wire','wire','rupture',kind,'striker');assert.ok(grantEvolution(s.actors[0],'mutate','field'));s.actors[0].cast=0;tick(s,{...control,attack:true},STEP,control);return s};
 const a=create('shaper'),b=create('striker');
 assert.ok(a.fields[0].r>b.fields[0].r);
 assert.ok(a.fields[0].life>b.fields[0].life);
});
test('forge lives without clock, phase switches to editing and simulation resumes',()=>{
 const s=makeMatch(140,'wire','pebble','forge','striker','shaper');
 assert.equal(s.remaining,0);assert.ok(validState(s));s.forgeDummy=true;
 for(let i=0;i<1200;i++)tick(s,control,STEP);
 assert.equal(s.phase,'fight');assert.equal(s.remaining,0);assert.deepEqual(s.score,[0,0]);
 s.phase='build';assert.ok(forgeEdit(s,'add','on_cast'));assert.ok(forgeEdit(s,'add','ball'));
 assert.ok(forgeEdit(s,'add','as_storm'));assert.ok(forgeEdit(s,'fuse','storm_lattice'));
 assert.ok(forgeEdit(s,'mutate','swarm'));
 assert.equal(s.actors[0].fusions[0],'storm_lattice');assert.equal(s.actors[0].evolution.form,'swarm');
 assert.ok(startRound(s)===undefined);assert.equal(s.phase,'fight');tick(s,{...control,attack:true},STEP);
 assert.ok(s.shots.some(q=>q.evo));assert.ok(validState(s));
});
test('forge enforces rune count, chain count, duplicate prevention and fusion prerequisites',()=>{
 const s=makeMatch(207,'wire','pebble','forge');s.phase='build';
 assert.equal(forgeEdit(s,'fuse','storm_lattice'),false);
 assert.equal(forgeEdit(s,'add','armor'),false);
 for(const id of ['on_cast','ball','as_storm','on_hit','heal','mine','strong'])assert.equal(forgeEdit(s,'add',id),true);
 assert.equal(s.actors[0].runes.length,9);
 assert.equal(forgeEdit(s,'add','strong'),false);
 assert.equal(forgeEdit(s,'mutate','nope'),false);
 assert.ok(forgeEdit(s,'fuse','storm_lattice'));
 assert.ok(forgeEdit(s,'remove','as_storm'));
 assert.deepEqual(s.actors[0].fusions,[]);
 assert.ok(forgeEdit(s,'reset'));assert.equal(s.actors[0].runes.length,2);assert.equal(s.actors[0].evolution,null);
});
test('forge training dummy is passive but combat-enabled bot setting makes a real response',()=>{
 const s=makeMatch(321,'wire','pebble','forge');s.forgeDummy=true;
 for(let i=0;i<90;i++)tick(s,control,STEP);
 assert.equal(s.actors[1].x,336);assert.equal(s.actors[1].y,134);
 s.forgeDummy=false;let moved=false;
 for(let i=0;i<90;i++){const x=s.actors[1].x;tick(s,control,STEP);if(s.actors[1].x!==x)moved=true}
 assert.ok(moved);
});
test('authoritative online player can choose role only before match',()=>{
 assert.equal(RULESET_VERSION,20);
 const host={id:'a'},guest={id:'b'},s=server.createRoom({player:host}).state;
 server.onJoin({state:s,player:guest,players:[host,guest]});
 const send=(p,data)=>server.onMessage({state:s,player:p,payload:data});
 assert.equal(s.archetypes[0],'striker');
 send(host,{type:'archetype',archetype:'shaper'});
 send(guest,{type:'archetype',archetype:'distorter'});
 assert.deepEqual(s.archetypes,['shaper','distorter']);
 send(host,{type:'archetype',archetype:'fake'});
 assert.equal(s.archetypes[0],'shaper');
 send(host,{type:'start'});
 assert.equal(s.match.actors[0].archetype,'shaper');assert.equal(s.match.actors[1].archetype,'distorter');
 send(host,{type:'archetype',archetype:'striker'});
 assert.equal(s.match.actors[0].archetype,'shaper');
});
test('old v0.24 saves remain accepted without explicit archetype',()=>{
 const s=makeMatch(210,'wire','kindle','rupture');
 for(const a of s.actors)delete a.archetype;
 assert.ok(validState(s));
 tick(s,{...control,attack:true},STEP);
 assert.ok(validState(s));
});
