import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { buildCourse18Geometry } from './terrain18.js';
import { ScenicFrameGate } from './scenic-frame-gate.js';
import {
  courseFit, portraitCourseRotation, anchoredCameraOffset,
  inverseRotateXY, worldToScreenPoint, keepFocusInSafeArea
} from './camera-space.js';
import { gardenSites } from './garden-identity.js';

const defaultScene={level:{},mode:'playing',renderer:{offsetX:0,offsetY:0,scale:1,cameraRotation:0},width:390,height:844,dpr:2,quality:1,reducedMotion:false,active:true};
const gate=new ScenicFrameGate();
assert.equal(gate.shouldDraw(0,defaultScene),true,'initial paint must occur');
assert.equal(gate.shouldDraw(.016,defaultScene),false,'static decoration should not repaint at 60fps');
assert.equal(gate.shouldDraw(.040,defaultScene),true,'active decoration can update at 30fps');
assert.equal(gate.shouldDraw(.056,defaultScene),false);
assert.equal(gate.shouldDraw(.090,{...defaultScene,active:false}),false,'idle decoration is slower than active');
assert.equal(gate.shouldDraw(.110,{...defaultScene,active:false}),true);
assert.equal(gate.shouldDraw(.125,{...defaultScene,active:false,quality:.5}),true,'quality tier change forces repaint');
assert.equal(gate.shouldDraw(.151,{...defaultScene,active:true,quality:.5}),false,'low power caps decorative frame rate');
assert.equal(gate.shouldDraw(.179,{...defaultScene,active:true,quality:.5}),true);
const reduced={...defaultScene,quality:.5,active:false,reducedMotion:true};
assert.equal(gate.shouldDraw(.251,reduced),false,'reduced-motion static scene can freeze');
assert.equal(gate.shouldDraw(.261,{...reduced,renderer:{...reduced.renderer,offsetY:12}}),true,'camera motion must always refresh');
assert.equal(gate.shouldDraw(.270,{...reduced,mode:'menu'}),true,'mode switch repaints immediately');

let tested=0,sites=0,totalVerts=0,maxVerts=0;
for(const raw of LEVELS) {
  const level=compileCourse19(raw);
  assert.ok(inspectCourse19(level).ok,`hole ${level.id}: playable geometry must stay valid`);
  const geometry=buildCourse18Geometry(level);
  const count=geometry.opaque.length/11;
  maxVerts=Math.max(maxVerts,count);
  totalVerts+=count;
  assert.ok(count<=27000,`hole ${level.id}: high detail budget ${count}`);
  for(const [width,height,hud,control] of [
    [320,568,68,81],[390,844,100,97],[430,932,94,94],
    [768,1024,78,80],[844,390,58,55],[1366,768,72,66],
    [1920,1080,75,73]
  ]){
    const rotation=portraitCourseRotation(level,width,height);
    const full=courseFit(level,width,height,rotation,hud,control);
    const world=inverseRotateXY(full.bounds.centerX,full.bounds.centerY,rotation);
    const offset=anchoredCameraOffset(world.x,world.y,full.scale,rotation,full.view);
    const holeTop=worldToScreenPoint(level.hole.x,level.hole.y,
      level.course18.field.heightAt(level.hole.x,level.hole.y)+126,full.scale,offset.x,offset.y,rotation);
    assert.ok(holeTop.y >= full.view.top-1,`hole ${level.id}: flag cannot enter the top HUD`);
    assert.ok(holeTop.y <= height-full.view.bottom+1);
    for(const site of gardenSites(level)){
      const point=worldToScreenPoint(site.x,site.y,126,full.scale,offset.x,offset.y,rotation);
      assert.ok(point.x>=-2&&point.x<=width+2,`hole ${level.id}: garden site clipped horizontally`);
      assert.ok(point.y>=full.view.top-2,`hole ${level.id}: garden top clipped into HUD`);
      sites++;
    }
    const followScale=Math.max(full.scale,full.scale*1.8);
    const margin=Math.min(64,Math.max(37,36+22*followScale*.65));
    for(const focus of [level.start,level.hole]){
      const z=level.course18.field.heightAt(focus.x,focus.y)+22;
      const p=keepFocusInSafeArea(world.x,world.y,focus.x,focus.y,z,followScale,rotation,full.view,margin);
      const projected=anchoredCameraOffset(p.x,p.y,followScale,rotation,full.view);
      const frame=worldToScreenPoint(focus.x,focus.y,z,followScale,projected.x,projected.y,rotation);
      assert.ok(frame.y>=full.view.top+margin-1,`hole ${level.id}: ball under top HUD`);
      assert.ok(frame.y<=full.view.top+full.view.height-margin+1,`hole ${level.id}: ball under bottom controls`);
      assert.ok(frame.x>=full.view.centerX-full.view.width*.5+margin-1);
      assert.ok(frame.x<=full.view.centerX+full.view.width*.5-margin+1);
    }
    tested++;
  }
}
assert.equal(tested,63);
assert.equal(sites,252);
console.log('Moss & Marble final polish:',tested,'responsive elevated views,',sites,'garden projections;',totalVerts,'static campaign vertices, max',maxVerts,'per hole');
