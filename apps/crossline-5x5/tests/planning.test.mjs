import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialMatch,validatePlan} from '../engine.js';
import {partialIssue,trySetCommand,trySwapCommand,removeCommand,controlsFor,previewOrders,describeIssue,paintPlanOverlay} from '../planning.js';

const attack=dirs=>({type:'attack',dirs});
test('all legal five-step sequences remain accepted by the server engine',()=>{
 const legal=['right','right','shield',{type:'attack',dirs:['up','down']},'left'];
 assert.equal(partialIssue(legal),null);
 assert.equal(validatePlan(legal),null);
 assert.equal(trySetCommand([],0,'right').error,null);
 assert.equal(trySetCommand(legal,5,'up').error,'no_slot');
});
test('replace any occupied step without changing later commands',()=>{
 const original=['right','right','up','shield','down'];
 const result=trySetCommand(original,2,'left');
 assert.equal(result.error,null);
 assert.deepEqual(result.actions,['right','right','left','shield','down']);
 assert.deepEqual(original,['right','right','up','shield','down']);
 assert.equal(validatePlan(result.actions),null);
});
test('edited attack conflicts are rejected atomically without dropping five commands',()=>{
 const original=['up','shield','right','down','left'];
 const result=trySetCommand(original,1,attack(['right']));
 assert.equal(result.error,'attack_direction_conflict');
 assert.strictEqual(result.actions,original);
 assert.equal(original[1],'shield');
 const fixed=trySetCommand(original,1,attack(['up']));
 assert.equal(fixed.error,'attack_direction_conflict');
 const ok=trySetCommand(original,1,attack(['left']));
 assert.equal(ok.error,'attack_direction_conflict');
});
test('attack can replace itself while valid used directions become available for movement',()=>{
 const initial=['shield','up',attack(['right']),'down','left'];
 assert.equal(validatePlan(initial),null);
 const available=controlsFor(initial,2);
 assert.equal(available.attackUsed,false);
 assert.equal(available.moved.has('up'),true);
 const revised=trySetCommand(initial,2,attack(['right','right']));
 assert.equal(revised.error,'invalid_attack_directions');
 assert.equal(trySetCommand(initial,2,'shield').error,'one_shield_only');
 assert.equal(trySetCommand(initial,2,'right').error,null);
});
test('swap and remove preserve plan integrity without rebuilding five commands',()=>{
 const initial=['right','up','shield','down','left'];
 const swapped=trySwapCommand(initial,3,-1);
 assert.equal(swapped.error,null);
 assert.equal(swapped.index,2);
 assert.deepEqual(swapped.actions,['right','up','down','shield','left']);
 assert.equal(validatePlan(swapped.actions),null);
 assert.deepEqual(removeCommand(swapped.actions,1),['right','down','shield','left']);
});
test('repeated visits remain individual numbered steps, not a single overwritten cell',()=>{
 const match=initialMatch();
 const path=previewOrders(match,'A',['right','left','right','left','shield']);
 assert.equal(path.steps.length,5);
 assert.deepEqual(path.steps.map(s=>[s.to.x,s.to.y]),[[1,2],[0,2],[1,2],[0,2],[0,2]]);
 assert.deepEqual(path.steps.map(s=>s.number),[1,2,3,4,5]);
 assert.equal(path.risk,null);
});
test('round-four first beat collapse predicts lethal edge and stops further movement',()=>{
 const match=initialMatch();match.round=4;
 const doomed=previewOrders(match,'A',['up','right','right','shield','down']);
 assert.equal(doomed.risk,1);
 assert.equal(doomed.steps[0].collapsed,true);
 assert.equal(doomed.steps[0].fall,true);
 assert.ok(doomed.steps.slice(1).every(s=>s.kind==='inactive'));
 const escaped=previewOrders(match,'A',['right','down','left','up','shield']);
 assert.equal(escaped.steps[0].fall,false);
 assert.equal(escaped.risk,3);
 assert.equal(escaped.steps[2].fall,true);
});
test('attack cells, shield stop, and unavailable commands are shown without claiming hits',()=>{
 const m=initialMatch();m.units.A={x:2,y:2,alive:true};
 const path=previewOrders(m,'A',['shield',attack(['up','right']),'left','down','up']);
 assert.equal(path.steps[0].kind,'shield');
 assert.equal(path.steps[1].kind,'attack');
 assert.deepEqual(path.targetCells,[{x:2,y:2},{x:2,y:1},{x:3,y:2}]);
 assert.equal(controlsFor(['up',attack(['left'])]).directions.includes('left'),false);
 assert.match(describeIssue('attack_direction_conflict'),/направление/);
});
class FakeSvg{
 constructor(tag){this.tagName=tag;this.attrs={};this.children=[];this.textContent='';this.className=''}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v)}
 append(child){this.children.push(child)}
 replaceChildren(){this.children=[]}
 remove(){this.removed=true}
}
test('SVG overlay preserves distinct numbered stops for revisited cells',()=>{
 const previous=globalThis.document;
 globalThis.document={createElementNS:(_,tag)=>new FakeSvg(tag)};
 try{
  let layer;
  const cells=Array.from({length:25},(_,i)=>({offsetLeft:(i%5)*42,offsetTop:Math.floor(i/5)*42,offsetWidth:40,offsetHeight:40}));
  const host={clientWidth:230,clientHeight:230,
   querySelector:()=>layer||null,
   querySelectorAll:()=>cells,
   append(el){layer=el}
  };
  const projected=previewOrders(initialMatch(),'A',['right','left','right','shield','left']);
  paintPlanOverlay(host,projected,{selected:2});
  const stops=layer.children.filter(x=>x.tagName==='g');
  assert.equal(stops.length,5);
  assert.deepEqual(stops.map(g=>g.children.find(c=>c.tagName==='text').textContent),['1','2','3','4','5']);
  assert.match(stops[2].className,/is-selected/);
  assert.equal(layer.attrs.viewBox,'0 0 230 230');
 }finally{globalThis.document=previous}
});
test('UI exposes all edit actions with keyboard shortcuts, live messages and mobile controls',async()=>{
 const [app,html,styles]=await Promise.all(['app.js','index.html','styles.css'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
 for(const id of ['editBar','editDescription','moveEarlier','moveLater','removeSelected','endEdit','planFeedback'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/function selectSlot/);
 assert.match(app,/function reorderSlot/);
 assert.match(app,/function removeSlot/);
 assert.match(app,/paintPlanOverlay/);
 assert.match(app,/e\.key>='1'&&e\.key<='5'/);
 assert.match(styles,/\.arena-route-stop/);
 assert.match(styles,/\.slot\.editing/);
 assert.match(styles,/\@media\(max-height:580px\) and \(orientation:landscape\)/);
});
