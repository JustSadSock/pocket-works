import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize} from './model.js';
import {personPosition,cattlePosition} from './visual-land.js';
import {walkable} from './navigation.js';

test('0.25x and 0.5x playback controls are actionable and fit the mobile six-column strip',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const speeds=[...html.matchAll(/data-native-press data-speed="([\d.]+)"/g)].map(m=>Number(m[1]));
 assert.deepEqual(speeds,[0,.25,.5,1,5,20]);
 assert.match(css,/repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(app,/acc\+=speed\*dt/);
 assert.match(app,/speed===0&&next>0&&!previousPeople/);
 assert.match(app,/const pending=sim\.households\.filter\(h=>h\.buildProject\?\.site\)/);
 assert.match(app,/stock=sim\.forest\[i\]/);
});

test('farm-worker microactivity is continuous, individually phased, within the actual work tile',()=>{
 const s=createWorld(17),h=s.households[0],p=s.people.find(p=>p.houseId===h.id);
 const field=h.fields[4],before=serialize(s);
 p.job='farm';p.x=field%160;p.y=(field/160)|0;
 const baseline=serialize(s);
 const previous=new Map([[p.id,{x:p.x,y:p.y}]]);
 const positions=[.10,.3,.5,.7,.83,.94].map(t=>personPosition(p,s,previous,t,true));
 for(const at of positions){
  assert.ok(walkable(s,at.x,at.y),'real worker should not walk through private crofts, water, or rocks');
  assert.ok(Math.hypot(at.x-p.x,at.y-p.y)<.5,'micro-activity stays inside actual job cell');
 }
 assert.ok(positions.some((pt,i)=>i&&Math.hypot(pt.x-positions[0].x,pt.y-positions[0].y)>.02));
 assert.deepEqual(personPosition(p,s,previous,1,true),{x:p.x,y:p.y});
 assert.equal(serialize(s),baseline,'rendering does not mutate simulation');
 assert.notEqual(before,baseline,'fixture explicitly changed the worker job');
});

test('grazing positions are distributed per animal across walkable community meadow without touching economy',()=>{
 const s=createWorld(413);advanceDays(s,160);
 const h=s.households.find(h=>h.cattle+h.sheep>=3&&Number.isInteger(h.lastPastureCell));
 assert.ok(h,'at least one herd must have a recorded meadow destination');
 const before=serialize(s),day=s.day+.5;
 const points=Array.from({length:5},(_,i)=>cattlePosition(h,day,i+23,s));
 for(const p of points){
  assert.ok(walkable(s,p.x,p.y));
  assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
 assert.deepEqual(cattlePosition(h,day,23,s),points[0],'same time and animal has deterministic position');
 assert.ok(new Set(points.map(p=>`${p.x.toFixed(2)}:${p.y.toFixed(2)}`)).size>1,'animals must not share a synchronized fixed point');
 assert.equal(serialize(s),before,'pasture animation never eats forage or changes ownership');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('existing houses and construction history stay physical, without synthetic five-year build guarantees',()=>{
 const s=createWorld(43821),initial=s.households.length;
 advanceDays(s,365*5);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 assert.equal(s.households.filter(h=>h.builtDay>0).length,s.stats.built);
 assert.ok(s.households.length>=initial,'abandoned houses are preserved rather than erased visually');
 assert.ok(s.households.every(h=>s.usage[h.y*160+h.x]===1));
});
