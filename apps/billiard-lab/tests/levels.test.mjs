import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {traceShot} from '../physics.mjs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const expression=source.match(/const LEVELS=(\[[\s\S]*?\]);\s*const readSaved=/);
assert.ok(expression,'The app must expose a level catalogue.');
const levels=runInNewContext(expression[1]);

test('all eight authored courses admit a successful shot',()=>{
 for(const level of levels){
   const world={
     shape:level.shape,origin:{x:level.origin[0],y:level.origin[1]},target:{x:level.target[0],y:level.target[1]},
     bumpers:level.bumps.map(b=>({x:b[0],y:b[1]})),
     segments:level.mirrors.map(s=>({x1:s[0],y1:s[1],x2:s[2],y2:s[3]})),
     gravity:0,friction:0.006,restitution:1,requiredBounces:level.required
   };
   let good=null;
   for(let a=0;a<360;a+=.5){
     const result=traceShot(world,a,75);
     if(result.hit){good={angle:a,bounces:result.bounces,time:result.time};break}
   }
   console.log(level.name+': '+JSON.stringify(good));
   assert.ok(good,'The '+level.name+' course must have a real solution');
 }
});
