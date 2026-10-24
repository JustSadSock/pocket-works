import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRange,moveBound,filmTime,MIN_SCENE_SECONDS,MAX_SCENE_SECONDS} from '../trim-range.js';

test('selected scene remains 10 to 90 seconds',()=>{
 assert.equal(MIN_SCENE_SECONDS,10);
 assert.equal(MAX_SCENE_SECONDS,90);
 assert.deepEqual(normalizeRange(0,60,222),{start:0,end:60,total:222});
 assert.deepEqual(normalizeRange(80,190,222),{start:80,end:170,total:222});
 assert.deepEqual(normalizeRange(214,290,222),{start:212,end:222,total:222});
});
test('each trim handle enforces the other boundary and duration limits',()=>{
 const r=normalizeRange(10,70,150);
 assert.deepEqual(moveBound(r,'start',64),{start:60,end:70,total:150});
 assert.deepEqual(moveBound(r,'start',-100),{start:0,end:70,total:150});
 assert.deepEqual(moveBound(r,'end',120),{start:10,end:100,total:150});
 assert.deepEqual(moveBound(r,'end',11),{start:10,end:20,total:150});
});
test('dragging the whole selection preserves clip length',()=>{
 const r=normalizeRange(10,70,150);
 assert.deepEqual(moveBound(r,'window',142),{start:90,end:150,total:150});
 assert.deepEqual(moveBound(r,'window',-100),{start:0,end:60,total:150});
 assert.deepEqual(moveBound(r,'window',40),{start:40,end:100,total:150});
});
test('time labels are readable and formatted consistently',()=>{
 assert.equal(filmTime(0),'00:00');
 assert.equal(filmTime(61.8),'01:01');
 assert.equal(filmTime(222),'03:42');
});
test('editor preparation has one main confirmation and no obsolete numeric controls',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 for(const id of ['trim-range-track','trim-range-handle-start','trim-range-handle-end','trim-mark-start','trim-mark-end','media-preview-switch','confirm-scene']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(html,/id="media-accept"/);
 assert.match(html,/id="trim-start" type="hidden"/);
 assert.match(html,/id="trim-length" type="hidden"/);
 assert.match(app,/Использовать и продолжить/);
 assert.match(app,/createTrimRange/);
});