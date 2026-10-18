import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaign,endless,solve,step,solved} from './engine.js';
import {THEMES,THEME_IDS,themeForLevel,themeIndexForLevel,drawFloorTheme,drawFurnitureTheme,drawThemeAccents} from './themes.js';
import {sceneFingerprint,scenePlan,drawDiorama} from './diorama.js';
const makeCanvas=()=>{
 const stats={labels:[],draws:0,arcs:0};
 const ctx={
  setTransform(){},save(){},restore(){},fillRect(){stats.draws++},strokeRect(){},beginPath(){},
  roundRect(){},arc(){stats.arcs++},moveTo(){},lineTo(){},fill(){stats.draws++},stroke(){},
  fillText(s){stats.labels.push(s)},createLinearGradient(){return {addColorStop(){}}},
  createRadialGradient(){return {addColorStop(){}}}
 };
 return {ctx,stats};
};
test('four distinct, named, physically styled themes',()=>{
 assert.deepEqual(THEME_IDS,['sorting','archive','packing','night']);
 assert.equal(THEMES.length,4);
 for(const t of THEMES){
  assert.ok(t.name.length>3);
  assert.equal(t.floor.length,4);assert.equal(t.frame.length,4);
  assert.equal(t.light.length,2);
  assert.ok(t.floor.every(x=>/^#[a-f0-9]{6}$/i.test(x)));
  assert.ok(t.frame.every(x=>/^#[a-f0-9]{6}$/i.test(x)));
 }
 assert.equal(new Set(THEMES.map(t=>t.floor[0])).size,4);
 assert.equal(new Set(THEMES.map(t=>t.lip)).size,4);
});
test('12 campaign maps form four contiguous three-level chapters',()=>{
 for(let i=0;i<12;i++){
  const l=campaign(i);
  assert.equal(themeIndexForLevel(l),Math.floor(i/3));
  assert.equal(themeForLevel(l).id,THEME_IDS[Math.floor(i/3)]);
 }
 assert.equal(themeForLevel(null).id,'sorting');
});
test('endless shifts repeat four looks predictably across clients',()=>{
 for(let i=1;i<=24;i++){
  const a=endless(i),b=endless(i);
  assert.equal(themeForLevel(a).id,THEME_IDS[i%4]);
  assert.equal(themeForLevel(a).id,themeForLevel(b).id);
  assert.equal(sceneFingerprint(a,300,300,2),sceneFingerprint(b,300,300,2));
 }
});
test('four themes never change colliders, target docking or shortest-path solutions',()=>{
 for(const i of [0,3,6,9]){
  const level=campaign(i),before=JSON.stringify(level);
  const plan=scenePlan(level),solution=solve(level);
  assert.equal(plan.floor.length+plan.walls.length,level.width*level.height);
  assert.equal(plan.goals.length,2);
  assert.ok(solution?.path.length>0);
  let p=level.starts.map(a=>({...a}));
  for(const direction of solution.path)p=step(level,p,direction).positions;
  assert.ok(solved(level,p));
  const {ctx,stats}=makeCanvas();
  const ret=drawDiorama(ctx,level,19,2);
  assert.ok(ret.floor.length>0&&stats.draws>10);
  assert.deepEqual(stats.labels,['Y','X']);
  assert.equal(JSON.stringify(level),before);
 }
});
test('theme changes invalidate static canvas cache without changing physical layout',()=>{
 const a=campaign(0),b={...a,index:4},c={...a,index:9};
 assert.notEqual(sceneFingerprint(a,384,384,2),sceneFingerprint(b,384,384,2));
 assert.notEqual(sceneFingerprint(a,384,384,2),sceneFingerprint(c,384,384,2));
 assert.deepEqual(scenePlan(a),scenePlan(b));
 assert.deepEqual(scenePlan(a),scenePlan(c));
});
test('every environment draws at 16px, 32px and 70px with docks above scenery',()=>{
 for(const index of [0,3,6,9])for(const size of [16,32,70]){
  const level=campaign(index),t=themeForLevel(level);
  const {ctx,stats}=makeCanvas();
  drawDiorama(ctx,level,size,2);
  assert.deepEqual(stats.labels,['Y','X']);
  assert.ok(stats.draws>level.width*level.height);
  assert.doesNotThrow(()=>drawFloorTheme(ctx,1,1,size,t,level.seed));
  assert.doesNotThrow(()=>drawFurnitureTheme(ctx,{x:0,y:0},size,t,level.seed));
  assert.doesNotThrow(()=>drawThemeAccents(ctx,level,size,t));
 }
});
