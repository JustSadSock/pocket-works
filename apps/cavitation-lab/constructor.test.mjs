import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from './physics.js';
import {simulateCloud,cloudAt} from './coupling.js';
import {MAX_BUBBLES,layoutTemplate,normalizeBubbles,layoutIssue,editedBubble,findNewBubble,cascadeMetrics} from './constructor.js';
import {BUBBLE_COLORS} from './cloud-render.js';

test('all editor starter compositions satisfy minimum wall clearance',()=>{
 for(const name of ['cascade','arc','stagger']){
  const layout=layoutTemplate(name);
  assert.equal(layout.length,5);
  assert.equal(layoutIssue(layout,1.15),null);
 }
});
test('edit constraints reject overlapping bubbles and wall penetration',()=>{
 const b=layoutTemplate('cascade');
 assert.match(editedBubble(b,1,{x:b[0].x,y:b[0].y},1.65).error,/пересекаются/);
 assert.match(editedBubble(b,0,{x:0,s:1.3},1.15).error,/стенке/);
 assert.equal(editedBubble(b,1,{x:-2.65,y:1.2},1.65).error,null);
});
test('new bubbles are real editable entities and cannot exceed editor limit',()=>{
 let b=[{x:-.4,y:0,s:.7}];
 for(let i=0;i<MAX_BUBBLES-1;i++){
  const result=findNewBubble(b,1.65);
  assert.equal(result.error,null);
  assert.equal(result.bubbles.length,b.length+1);
  b=result.bubbles;
 }
 assert.match(findNewBubble(b,1.65).error,/Предел/);
});
test('invalid imported editor records are bounded and cannot allocate unbounded bubbles',()=>{
 const raw=Array.from({length:500},(_,i)=>({x:i,y:Infinity,s:-100}));
 const b=normalizeBubbles(raw);
 assert.equal(b.length,MAX_BUBBLES);
 assert.ok(b.every(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)&&x.s>=.35&&x.s<=1.3));
});
test('custom bubble centers, size and gas cushion enter the actual coupled model',()=>{
 const base=layoutTemplate('cascade');
 const a=simulateCloud(DEFAULTS,{mode:'custom',wall:true,bubbles:base});
 const edited=editedBubble(base,1,{s:.55},DEFAULTS.standOff);
 assert.equal(edited.error,null);
 const b=simulateCloud(DEFAULTS,{mode:'custom',wall:true,bubbles:edited.bubbles});
 assert.equal(a.geometry.length,5);
 assert.equal(a.config.gasPressurePa,6500);
 assert.equal(b.geometry[1].r0,.55);
 assert.ok(Math.abs(a.individualCollapseUs[1]-b.individualCollapseUs[1])>1);
 const displaced=editedBubble(base,1,{x:-3.35,y:1},DEFAULTS.standOff);
 assert.equal(displaced.error,null);
 const c=simulateCloud(DEFAULTS,{mode:'custom',wall:true,bubbles:displaced.bubbles});
 assert.ok(Math.abs(a.individualCollapseUs[0]-c.individualCollapseUs[0])>1e-5);
});
test('ordered first-collapse measurements are sorted by calculated times',()=>{
 const s=simulateCloud(DEFAULTS,{mode:'custom',bubbles:layoutTemplate('cascade'),wall:false});
 assert.equal(s.truncated,false);
 const {order,spreadUs}=cascadeMetrics(s);
 assert.deepEqual([...order].sort((a,b)=>a-b),[0,1,2,3,4]);
 assert.ok(spreadUs>0);
 const times=order.map(i=>s.individualCollapseUs[i]);
 assert.ok(times.every((time,i)=>i===0||time>=times[i-1]));
});
test('270 pressure-radius-wall scenarios finish stable first implosions',()=>{
 let count=0;
 for(const layout of ['cascade','arc','stagger'])
 for(const pressureBar of [.3,.6,1.8,3,4])
 for(const radiusMm of [.25,.9,2.5])
 for(const standOff of [1.15,1.65,4])
 for(const wall of [true,false]){
  const s=simulateCloud({radiusMm,pressureBar,standOff},{mode:'custom',wall,bubbles:layoutTemplate(layout)});
  assert.equal(s.truncated,false,layout+':'+pressureBar+':'+radiusMm+':'+standOff+':'+wall);
  assert.equal(cloudAt(s,s.durationTau).bubbles.length,5);
  assert.ok(s.individualCollapseUs.every(t=>Number.isFinite(t)&&t>0&&t<=s.durationTau*s.scaleUs));
  count++;
 }
 assert.equal(count,270);
});

test('all seven editable bubbles have valid optical and graph colors',()=>{
 assert.ok(BUBBLE_COLORS.length>=MAX_BUBBLES);
 for(const color of BUBBLE_COLORS.slice(0,MAX_BUBBLES))
   assert.match(color,/^#[0-9a-f]{6}$/i);
});

test('editor additions remain stable for one through seven spheres at pressure extremes',()=>{
 let bubbles=layoutTemplate('cascade').slice(0,1),count=0;
 for(let n=1;n<=MAX_BUBBLES;n++){
  if(n>1){
   const next=findNewBubble(bubbles,1.65);
   assert.equal(next.error,null);
   bubbles=next.bubbles;
  }
  for(const pressureBar of [.3,.9,2.5,4])
   for(const wall of [true,false]){
    const model=simulateCloud({radiusMm:.9,pressureBar,standOff:1.65},{mode:'custom',wall,bubbles});
    assert.equal(model.truncated,false,'bubble count '+n+', pressure '+pressureBar+', wall '+wall);
    assert.equal(model.individualCollapseUs.length,n);
    count++;
   }
 }
 assert.equal(count,56);
});
