import test from 'node:test';
import assert from 'node:assert/strict';
import { starter, sanitize, valid, dimensions, findSupport, moveWithChildren, removeWithChildren } from './state.js';

test('starter scene contains the readable room composition',()=>{
 const s=starter();
 assert.ok(s.items.length>=8);
 assert.ok(s.items.find(i=>i.type==='sofa'));
 assert.ok(s.items.find(i=>i.type==='rug'));
 assert.ok(s.items.find(i=>i.type==='frame'));
 for(const i of s.items) assert.equal(valid(s,i),true,'starter placement '+i.id);
});
test('sanitize discards malformed objects and duplicate ids',()=>{
 const s=sanitize({wallColor:999,pattern:'banana',floor:'bad',evening:'yes',items:[
  {id:'one',type:'sofa',x:0,z:0,color:'not a color'},
  {id:'one',type:'sofa',x:0,z:0},
  {id:'evil',type:'unknown'},
 ]});
 assert.equal(s.wallColor,5);assert.equal(s.pattern,'plain');assert.equal(s.floor,'honey');
 assert.equal(s.items.length,1);
 assert.match(s.items[0].color,/^#[0-9a-f]{6}$/i);
});
test('large floor furniture must fit in the room and not overlap',()=>{
 const s={items:[{id:'one',type:'sofa',x:0,z:0,rot:0}]};
 assert.equal(valid(s,s.items[0]),true);
 assert.equal(valid(s,{id:'two',type:'chair',x:0,z:0,rot:0}),false);
 assert.equal(valid(s,{id:'two',type:'chair',x:3.6,z:0,rot:0}),false);
 assert.equal(valid(s,{id:'two',type:'chair',x:2.3,z:0,rot:0}),true);
});
test('rotated furniture swaps footprint and respects obstruction',()=>{
 const a={id:'a',type:'bed',x:2.5,z:0,rot:0};
 const b={...a,rot:1};
 assert.notDeepEqual(dimensions(a),dimensions(b));
 assert.equal(valid({items:[a]},a),true);
 assert.equal(valid({items:[b]},b),false);
});
test('small items require a free tabletop',()=>{
 const s=starter();
 const mug={id:'new',type:'mug',x:0,z:-.5,rot:0,support:null};
 assert.equal(valid(s,mug),false);
 const support=findSupport(s,mug,0,-.5);
 assert.equal(support?.type,'coffee');
 mug.support=support.id;mug.y=.72;
 assert.equal(valid(s,mug),false,'table already contains books and cup in that footprint');
 mug.x=.25;mug.z=-.8;
 assert.equal(valid(s,mug),true);
});
test('moving furniture takes supported objects along',()=>{
 const s=starter(), table=s.items.find(i=>i.type==='coffee'),mug=s.items.find(i=>i.type==='mug');
 const oldX=mug.x,oldZ=mug.z;
 moveWithChildren(s,table.id,.5,-.25);
 table.x+=.5;table.z-=.25;
 assert.equal(mug.x,Math.round((oldX+.5)*4)/4);assert.equal(mug.z,Math.round((oldZ-.25)*4)/4);
 const without=removeWithChildren(s,table.id);
 assert.equal(without.some(i=>i.id===mug.id),false);
});
test('wall decor remains on a back or left surface',()=>{
 const s=starter();const frame=s.items.find(i=>i.type==='frame');
 assert.equal(valid(s,frame),true);
 assert.equal(valid(s,{...frame,x:3.8}),false);
});

test('desk lamps fit in tabletop corners without requiring the centre',()=>{
 const state={items:[{id:'table',type:'coffee',x:0,z:0,rot:0}]};
 const lamp={id:'lamp',type:'tablelamp',x:.5,z:.25,rot:0,support:'table',y:.72};
 assert.equal(findSupport(state,lamp,lamp.x,lamp.z)?.id,'table');
 assert.equal(valid(state,lamp),true);
 const cup={id:'cup',type:'mug',x:-.625,z:-.375,rot:0,support:'table',y:.72};
 assert.equal(valid(state,cup),true);
 state.items.push(lamp);
 assert.equal(valid(state,{...lamp,id:'second',x:.5,z:.25}),false,'overlapping lamps must still be rejected');
});
test('thin rugs remain valid below furniture and furniture blocks furniture',()=>{
 const state={items:[
  {id:'carpet',type:'rug',x:0,z:0,rot:0},
  {id:'chair',type:'chair',x:.25,z:.25,rot:0}
 ]};
 assert.equal(valid(state,state.items[0]),true);
 assert.equal(valid(state,state.items[1]),true);
 assert.equal(valid(state,{id:'duplicate-chair',type:'chair',x:.25,z:.25,rot:0}),false);
});

test('star decorations and curtains can be mounted to the same walls as frames',()=>{
 for(const type of ['starwall','curtains']){
  const size={starwall:.65,curtains:1.67}[type];
  for(const layout of ['classic','narrow','nook']){
   const s={layout,items:[]};
   const mounted={id:'wall-'+type,type,x:0,z:-3.91,y:2.5,wall:'back',rot:0};
   assert.equal(valid(s,mounted),true,`${type} on back wall in ${layout}`);
   assert.equal(valid(s,{...mounted,x:layout==='narrow'?2.85:3.6}),false,
    `${type} must not hang beyond the wall in ${layout}`);
   const left={...mounted,x:layout==='narrow'?-3.05:-3.91,z:0,wall:'left',rot:1};
   assert.equal(valid(s,left),true,`${type} on left wall in ${layout}`);
  }
 }
});
