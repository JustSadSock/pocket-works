import test from 'node:test';
import assert from 'node:assert/strict';
import {animateViewmodel} from '../renderer.mjs';

function triangle(){
 // Tiny valid 10-float vertices, independent of a WebGL context.
 return [
  .27,-1.20,-1.20,.4,.4,.4,0,0,1,7,
  .75,-.52,-1.50,.4,.4,.4,0,0,1,7,
  .48,-.72,-1.86,.4,.4,.4,0,0,1,7
 ]
}
const bounds=mesh=>{
 const xs=[],ys=[];for(let i=0;i<mesh.length;i+=10){xs.push(mesh[i]);ys.push(mesh[i+1])}
 return{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
};
test('portrait gun occupies less screen geometry while preserving desktop model',()=>{
 const mesh=triangle(),baseline=animateViewmodel(mesh,{time:0,aspect:1.78}),
  phone=animateViewmodel(mesh,{time:0,aspect:390/844});
 assert.deepEqual(baseline,animateViewmodel(mesh,{time:0,aspect:1.78}));
 assert.ok(bounds(phone).width<bounds(baseline).width*.65);
 assert.ok(bounds(phone).height<bounds(baseline).height*.65);
 assert.deepEqual(mesh,triangle(),'animation must not mutate original mesh')
});
test('reload recoil and reduced-motion effects remain physical and finite on mobile',()=>{
 const src=triangle(),staticMobile=animateViewmodel(src,{aspect:.46,reduceMotion:true});
 const shot=animateViewmodel(src,{aspect:.46,recoil:1});
 const reload=animateViewmodel(src,{aspect:.46,reload:.5});
 assert.ok(shot.every(Number.isFinite)&&reload.every(Number.isFinite));
 assert.notDeepEqual(staticMobile,shot);
 assert.notDeepEqual(staticMobile,reload);
 assert.equal(reload.length,src.length);
});
