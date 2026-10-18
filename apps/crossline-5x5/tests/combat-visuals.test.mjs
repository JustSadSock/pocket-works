import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialMatch,simulateRound} from '../engine.js';
import {ARENA_COLORS,COMBAT_BEAT_MS,COMBAT_MIN_MS,
 frameBefore,frameAfter,timing,classifyFrame,effectPositions,
 paintArena,playArenaBeat,drawArenaCanvas} from '../combat-visuals.js';

const swords={type:'attack',dirs:['down']};
const planA=[swords,'up','left','right','shield'];
const planB=['up','down','left','right','shield'];
const tactical=()=>{const g=initialMatch();g.units.A={x:2,y:2,alive:true};g.units.B={x:2,y:3,alive:true};return simulateRound(g,{A:planA,B:planB}).record};

test('combat event pipeline derives movement, attack, hit, block, fall and shield without inventing state',()=>{
 const record=tactical(),first=record.frames[0],flags=classifyFrame(first.events);
 assert.equal(flags.move,true);
 assert.equal(flags.attack,true);
 assert.equal(flags.hit,true);
 assert.equal(flags.collapse,false);
 const impact=effectPositions(first.units,first.events);
 const hit=first.events.find(e=>e.type==='hit');
 assert.ok(hit,'expected real hit');
 assert.ok(impact.hits.some(p=>p.x===first.units[hit.side].x&&p.y===first.units[hit.side].y));
 assert.deepEqual(frameBefore(record,0).units,record.begin);
 assert.deepEqual(frameBefore(record,1).units,record.frames[0].units);
 assert.deepEqual(frameAfter(record,0),record.frames[0]);
});
test('fall is always painted at real event.at, not an old unit position',()=>{
 const units={A:{x:1,y:2,alive:false},B:{x:3,y:2,alive:true}};
 const effects=effectPositions(units,[{side:'A',type:'fall',at:{x:0,y:2}}]);
 assert.deepEqual(effects.falls,[{x:0,y:2}]);
 assert.deepEqual(effects.hits,[]);
});
test('round four perimeter collapse data and simultaneous shield block survive',()=>{
 const g=initialMatch();g.round=4;
 const collapse=simulateRound(g,{A:planB,B:planB}).record.frames[0];
 assert.equal(collapse.edgesCollapsed,true);
 assert.equal(classifyFrame(collapse.events).collapse,true);
 const h=initialMatch();h.units.A={x:2,y:2,alive:true};h.units.B={x:2,y:3,alive:true};
 const shield=simulateRound(h,{A:planA,B:['shield','up','down','left','right']}).record.frames[0];
 assert.equal(classifyFrame(shield.events).block,true);
 assert.equal(classifyFrame(shield.events).shield,true);
 assert.ok(effectPositions(shield.units,shield.events).shields.length>0);
});
test('speed scaling and reduced motion remain bounded',()=>{
 assert.equal(timing(1,false),COMBAT_BEAT_MS);
 assert.equal(timing(4,false),COMBAT_BEAT_MS/4);
 assert.equal(timing(999,false),Math.round(COMBAT_BEAT_MS/5));
 assert.equal(timing(1,true),COMBAT_MIN_MS);
 assert.equal(timing(4,true),COMBAT_MIN_MS);
});
class FakeElement{
 constructor(tag='div'){this.tag=tag;this.children=[];this.className='';this.dataset={};this.style={};this.hidden=false;this.attributes={}}
 append(node){if(node.tag==='fragment')this.children.push(...node.children);else this.children.push(node)}
 replaceChildren(...nodes){this.children=[];nodes.forEach(n=>this.append(n))}
 setAttribute(k,v){this.attributes[k]=v}
 querySelectorAll(selector){if(selector===':scope > .cell')return this.children.filter(x=>x.className.split(' ').includes('cell'));return []}
 querySelector(selector){const side=selector.match(/data-side="([^"]+)"/)?.[1];return this.children.find(c=>c.dataset.side===side)||null}
 get offsetLeft(){return Number(this.dataset.x)*59+7}
 get offsetTop(){return Number(this.dataset.y)*59+7}
 get offsetWidth(){return 56}
 get offsetHeight(){return 56}
 get classList(){return {
  add:(...classes)=>{const parts=new Set(this.className.split(/\s+/).filter(Boolean));classes.forEach(c=>parts.add(c));this.className=[...parts].join(' ')},
  remove:(...classes)=>{const parts=new Set(this.className.split(/\s+/).filter(Boolean));classes.forEach(c=>parts.delete(c));this.className=[...parts].join(' ')},
  toggle:(name,force)=>{const parts=new Set(this.className.split(/\s+/).filter(Boolean));const yes=force??!parts.has(name);yes?parts.add(name):parts.delete(name);this.className=[...parts].join(' ')}
 }}
}
test('board keeps persistent actors and 25 cells across event frames, with round-four effects',()=>{
 const saved=globalThis.document;
 globalThis.document={createElement:()=>new FakeElement(),createDocumentFragment:()=>new FakeElement('fragment')};
 try{
  const host=new FakeElement(),units={A:{x:0,y:2,alive:true},B:{x:4,y:2,alive:true}};
  paintArena(host,units,false,[],{round:1});
  assert.equal(host.children.length,27);
  const actor=host.querySelector(':scope > .piece[data-side="A"]');
  const cell=host.children[10];
  assert.equal(actor.style.left,'35px');
  const first=host.children[0];
  paintArena(host,{A:{x:1,y:2,alive:true},B:units.B},false,[{side:'A',type:'move'}],{round:1,duration:240});
  assert.equal(host.children.length,27);
  assert.strictEqual(host.children[0],first);
  assert.strictEqual(host.querySelector(':scope > .piece[data-side="A"]'),actor);
  assert.equal(actor.style.left,'94px');
  assert.equal(actor.style.transitionDuration,'240ms');
  paintArena(host,{A:{x:0,y:2,alive:false},B:units.B},true,
   [{type:'collapse'},{side:'A',type:'fall',at:{x:0,y:2}}],{round:4});
  assert.ok(host.children[10].className.includes('fall-burst'));
  assert.ok(host.children[0].className.includes('shatter'));
  assert.ok(host.children[0].className.includes('lava'));
  assert.ok(actor.className.includes('dying'));
 }finally{globalThis.document=saved}
});
test('reduced-motion playback resolves one engine event frame without future callbacks',async()=>{
 const saved=globalThis.document;
 globalThis.document={createElement:()=>new FakeElement(),createDocumentFragment:()=>new FakeElement('fragment')};
 try{
  const host=new FakeElement(),record=tactical();
  paintArena(host,record.begin,false,[],{round:1});
  const sounds=[];
  const ok=await playArenaBeat(host,frameBefore(record,0),record.frames[0],{
   round:1,reduced:true,alive:()=>true,sound:s=>sounds.push(s)
  });
  assert.equal(ok,true);
  assert.ok(sounds.includes('hit'));
  assert.equal(host.children.length,27);
 }finally{globalThis.document=saved}
});
test('WebM draws cyan/orange fighters and the same event positions as UI',()=>{
 const recorded=[];
 const ctx={fillRect(){recorded.push(this.fillStyle)},beginPath(){},rect(){},fill(){recorded.push(this.fillStyle)},stroke(){},arc(){},
  fillText(){},clearRect(){},save(){},restore(){}};
 const record=tactical(),before=frameBefore(record,0),after=record.frames[0];
 drawArenaCanvas(ctx,before,after,1,0.5,{step:1});
 assert.ok(recorded.includes(ARENA_COLORS.A),'export missing original blue');
 assert.ok(recorded.includes(ARENA_COLORS.B),'export missing original orange');
 assert.ok(recorded.includes(ARENA_COLORS.attack),'contact cells should use game effect palette');
});
test('live match, replay and video all wire into one visual source',async()=>{
 const js=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(js,/playArenaBeat\(\$\('board'\)/);
 assert.match(js,/playArenaBeat\(\$\('replayBoard'\)/);
 assert.match(js,/drawArenaCanvas\(ctx,before,frame/);
 assert.match(js,/const reduceMotion=/);
 assert.match(html,/id="motionToggle"/);
 assert.match(css,/\.board> *\.piece/);
 assert.match(css,/\.cell\.attack-zone/);
 assert.match(css,/\[data-motion="off"\]/);
});
