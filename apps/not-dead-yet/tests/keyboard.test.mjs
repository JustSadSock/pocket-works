import test from 'node:test';
import assert from 'node:assert/strict';
import {GameKeyboard,physicalKey,isTextEditingTarget} from '../keyboard.mjs';

test('WASD/E/R/F/I work on English, Ukrainian and Russian physical keyboard layouts',()=>{
 const cases=[
  {code:'KeyW',key:'w',action:'forward'},
  {code:'KeyW',key:'ц',action:'forward'},
  {code:'KeyW',key:'w',action:'forward'},
  {code:'KeyA',key:'ф',action:'strafeLeft'},
  {code:'KeyD',key:'в',action:'strafeRight'},
  {code:'KeyS',key:'ы',action:'backward'},
  {code:'KeyE',key:'у',action:'interact'},
  {code:'KeyR',key:'к',action:'reload'},
  {code:'KeyF',key:'а',action:'torch'},
  {code:'KeyI',key:'ш',action:'inventory'}
 ];
 const board=new GameKeyboard();
 for(const event of cases){
  const press=board.down(event);assert.equal(press.action,event.action);
  assert.equal(press.first,true);
  board.up(event)
 }
 assert.equal(board.intent.forward,0)
});
test('standard FPS movement, diagonal and turn keys remain independent',()=>{
 const kb=new GameKeyboard();
 kb.down({code:'KeyW'});kb.down({code:'KeyD'});
 assert.deepEqual(kb.intent,{forward:1,strafe:1,turn:0,sprint:false});
 kb.down({code:'ArrowRight'});kb.down({code:'ShiftLeft'});
 assert.deepEqual(kb.intent,{forward:1,strafe:1,turn:1,sprint:true});
 kb.up({code:'KeyW'});
 assert.equal(kb.intent.forward,0);
 assert.equal(kb.intent.strafe,1);
 assert.equal(kb.intent.turn,1);
 kb.clear();assert.deepEqual(kb.intent,{forward:0,strafe:0,turn:0,sprint:false})
});
test('repeat, physical left and right Shift, aliases, and stop on release',()=>{
 const kb=new GameKeyboard();
 assert.equal(kb.down({code:'Space',key:' '}).first,true);
 assert.equal(kb.down({code:'Space',key:' ',repeat:true}).first,false);
 kb.up({code:'Space'});
 assert.equal(kb.down({code:'Space'}).first,true);
 assert.equal(physicalKey({key:'ArrowUp'}),'ArrowUp');
 assert.equal(physicalKey({key:' '}),'Space');
 kb.down({code:'ShiftLeft'});kb.down({code:'ShiftRight'});
 assert.equal(kb.intent.sprint,true);
 kb.up({code:'ShiftLeft'});assert.equal(kb.intent.sprint,true);
 kb.up({code:'ShiftRight'});assert.equal(kb.intent.sprint,false)
});
test('arrow keys turn and advance without changing strafe',()=>{
 const kb=new GameKeyboard();
 kb.down({code:'ArrowUp'});kb.down({code:'ArrowLeft'});
 assert.equal(kb.intent.forward,1);
 assert.equal(kb.intent.strafe,0);
 assert.equal(kb.intent.turn,-1);
 kb.up({code:'ArrowLeft'});assert.equal(kb.intent.turn,0);
 kb.down({code:'ArrowRight'});assert.equal(kb.intent.turn,1)
});
test('editing targets are ignored by gameplay input layer',()=>{
 for(const tag of ['INPUT','TEXTAREA','SELECT'])assert.equal(isTextEditingTarget({tagName:tag}),true);
 assert.equal(isTextEditingTarget({tagName:'DIV',isContentEditable:true}),true);
 assert.equal(isTextEditingTarget({tagName:'BUTTON'}),false)
});
