import {E} from '../../engine.js';
import {Campaign,deploymentProblems} from './slice-core.js';
import assert from 'node:assert/strict';
const c=new Campaign();assert.equal(c.state.units.length,18);
assert.equal(deploymentProblems(c.state).length,0,JSON.stringify(deploymentProblems(c.state)));
assert(c.finishDeployment());let frames=[],types=new Set(c.state.units.map(u=>u.type));assert.deepEqual([...types].sort(),['archer','guard','knight','lightHorse','spear','sword']);
for(let i=0;i<12&&!c.state.result;i++){for(let u of c.own()){let v=c.state.units.filter(v=>v.side!==u.side&&E.alive(v)).sort((a,b)=>E.dist(a,u)-E.dist(b,u))[0];if(!v)continue;c.select([u.id]);assert(c.route([v],E.spec(u).range?'shoot':E.spec(u).horse?'charge':'attack',0,v.id).ok)}let r=c.resolve();frames.push(...r.frames);c.continue()}
const metrics={time:c.state.time,result:c.state.result,contact:Math.max(...frames.map(f=>f.units.filter(u=>u.contact>0).length)),horseContact:frames.some(f=>f.units.some(u=>E.spec(u).horse&&u.contact>0)),shots:frames.some(f=>f.shots?.length),minCohesion:Math.min(...frames.flatMap(f=>f.units.map(u=>u.cohesion))),loss:frames[0].units.reduce((s,u)=>s+u.n,0)-frames.at(-1).units.reduce((s,u)=>s+u.n,0)}
console.log(JSON.stringify(metrics));assert(metrics.result);assert(metrics.contact>0);assert(metrics.shots);assert(metrics.horseContact);
