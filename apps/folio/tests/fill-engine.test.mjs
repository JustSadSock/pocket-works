import test from 'node:test';
import assert from 'node:assert/strict';
import {floodLinework} from '../fill-engine.mjs';

function inkMap(width,height,ink){
  const image=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    image[(y*width+x)*4+3]=ink(x,y)||0;
  }
  return image;
}
function has(runs,x,y){return runs.some(([row,l,r])=>row===y&&x>=l&&x<=r);}
test('closed outlines confine paint and spill into line antialias, not other paper',()=>{
  const input=inkMap(19,17,(x,y)=>(x>=4&&x<=14&&(y===3||y===13))||
    (y>=3&&y<=13&&(x===4||x===14))?255:0);
  const runs=floodLinework(input,19,17,7,7,28);
  assert.ok(has(runs,7,7));
  assert.ok(has(runs,4,7),'underfill must meet outline');
  assert.ok(!has(runs,1,1));
  assert.ok(!has(runs,17,15));
});
test('existing colored fills do not affect line-only segmentation',()=>{
  const mask=inkMap(23,17,(x,y)=>x===11?255:0);
  const first=floodLinework(mask,23,17,5,8,28);
  const afterOtherBucket=floodLinework(mask,23,17,5,8,28);
  assert.deepEqual(afterOtherBucket,first);
  assert.ok(!has(first,20,8));
});
test('one pixel holes at crossings are sealed without bridging different areas',()=>{
  const input=inkMap(21,21,(x,y)=>((x>=4&&x<=16&&(y===4||y===16))||
    (y>=4&&y<=16&&(x===4||x===16)))&&!(x===10&&y===4)?255:0);
  const runs=floodLinework(input,21,21,8,8,28);
  assert.ok(has(runs,8,8));
  assert.ok(!has(runs,10,1));
});
test('an unmarked sheet fills edge to edge',()=>{
  const runs=floodLinework(inkMap(10,6,()=>0),10,6,4,2,28);
  assert.equal(runs.reduce((sum,[,left,right])=>sum+right-left+1,0),60);
});
test('tolerance opens only weak boundaries',()=>{
  const image=inkMap(11,9,x=>x===5?70:0);
  assert.ok(!has(floodLinework(image,11,9,2,3,0),8,4));
  assert.ok(has(floodLinework(image,11,9,2,3,90),8,4));
});
test('pointer outside paper does nothing',()=>{
  assert.deepEqual(floodLinework(inkMap(9,9,()=>0),9,9,-1,4,25),[]);
});
