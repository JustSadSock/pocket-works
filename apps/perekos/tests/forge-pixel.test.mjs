import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {forgeFrameIndex,MAGE_PIXEL_CLASSES,MAGE_PIXEL_DIRECTIONS,MAGE_PIXEL_STATES,MAGE_PIXEL_SIZE,forgeMageReady,renderForgeMage} from '../mage-pixel.mjs';
const dir=fileURLToPath(new URL('../',import.meta.url));
const source=JSON.parse(readFileSync(join(dir,'asset-forge/mages.json')));
const manifest=JSON.parse(readFileSync(join(dir,'asset-forge/manifest.json')));
const atlas=JSON.parse(readFileSync(join(dir,'assets/mages.json')));
const index=JSON.parse(readFileSync(join(dir,'assets/forge-index.json')));
test('Universal Art Forge v2 declares authentic palette pixel source and immutable runtime exports',()=>{
 assert.equal(manifest.version,2);
 assert.equal(manifest.runtimeRoot,'.');
 assert.equal(manifest.jobs.length,3);
 assert.equal(manifest.jobs[0].adapter,'pixel');
 assert.equal(manifest.jobs[0].source,'asset-forge/mages.json');
 assert.equal(manifest.jobs[0].outputs.image,'assets/mages.png');
 assert.equal(manifest.jobs[0].outputs.atlas,'assets/mages.json');
 assert.equal(index.assets[0].id,'compact-mages');
 assert.equal(source.width,24);assert.equal(source.height,32);
 assert.equal(Object.keys(source.palette).length,15);
 assert.equal(source.palette['.'],'#00000000');
 assert.equal(atlas.sampling,'nearest');
 assert.equal(atlas.frames.length,144);
});
test('every class, direction and action is a separate layer-authored 24x32 frame',()=>{
 const signatures=new Set();
 const known=new Set(Object.keys(source.palette));
 for(const cls of MAGE_PIXEL_CLASSES){
  for(let dir=0;dir<8;dir++){
   let frames=[];
   for(let state=0;state<3;state++){
    const frame=source.frames[forgeFrameIndex(cls,dir*Math.PI/4,state===2?.4:0,state===1?1:0,{look:dir*Math.PI/4,move:state===1?1:0,step:1},.3)];
    assert.ok(frame,'missing '+cls+' '+dir+' '+state);
    assert.equal(frame.name,cls+'-'+MAGE_PIXEL_DIRECTIONS[dir]+'-'+MAGE_PIXEL_STATES[state]);
    assert.equal(frame.layers.length,4);
    const composite=Array.from({length:32},()=>Array(24).fill('.'));
    for(const layer of frame.layers){
     assert.equal(layer.rows.length,32);
     layer.rows.forEach((row,y)=>{
      assert.equal(row.length,24);
      for(let x=0;x<24;x++){assert.ok(known.has(row[x]));if(row[x]!=='.')composite[y][x]=row[x]}
     });
    }
    const coverage=composite.flat().filter(c=>c!=='.').length;
    assert.ok(coverage>=200&&coverage<500,cls+' coverage '+coverage);
    frames.push(composite.map(a=>a.join('')).join(''));
   }
   assert.equal(new Set(frames).size,3,'walk and cast must change real silhouette '+cls+'/'+dir);
   signatures.add(frames[0]);
  }
 }
 assert.ok(signatures.size>=42,'class silhouettes collapse to recolors');
 assert.deepEqual(MAGE_PIXEL_SIZE,{width:24,height:32,pivotX:12,pivotY:23});
});
test('Forge frames and motion choose consistent all-eight directional sectors',()=>{
 for(const cls of MAGE_PIXEL_CLASSES)for(let direction=0;direction<8;direction++){
  const face=direction*Math.PI/4;
  const idle=forgeFrameIndex(cls,face,0,0,{look:face,move:0});
  assert.equal(atlas.frames[idle].name,cls+'-'+MAGE_PIXEL_DIRECTIONS[direction]+'-idle');
  assert.equal(atlas.frames[idle+1].name,cls+'-'+MAGE_PIXEL_DIRECTIONS[direction]+'-walk');
  assert.equal(atlas.frames[idle+2].name,cls+'-'+MAGE_PIXEL_DIRECTIONS[direction]+'-cast');
 }
});
test('unavailable image environment safely defers to legacy non-browser tracing canvas',async()=>{
 assert.equal(await forgeMageReady(),false);
 assert.equal(renderForgeMage({},undefined,{x:200,y:310}),false);
});
