import assert from 'node:assert/strict';
import { routePosition, strengthLabel, fitAreaInsets } from './field-guide.js';
import { LEVELS } from './levels.js';
import { generateEndlessLevel } from './procedural.js';
import { compileCourse19 } from './course19.js';
import { portraitCourseRotation, courseFit, anchoredCameraOffset, inverseRotateXY, worldToScreenPoint } from './camera-space.js';

const centerline = [{x:0,y:0},{x:100,y:0},{x:100,y:200}];
assert.equal(routePosition(centerline,{x:0,y:0}).progress,0);
assert.equal(routePosition(centerline,{x:100,y:200}).progress,1);
assert.ok(Math.abs(routePosition(centerline,{x:105,y:0}).progress - 1/3) < .001);
assert.ok(Math.abs(routePosition(centerline,{x:100,y:100}).progress - 2/3) < .001);
assert.equal(strengthLabel(0),'Потяни дальше');
assert.equal(strengthLabel(1),'Максимальный удар');

let cases=0;
for(const level of [...LEVELS,...Array.from({length:40},(_,i)=>generateEndlessLevel(12639+i*127,i%23))]){
  const course=compileCourse19(level);
  assert.ok(Math.abs(routePosition(course.centerline,course.start).progress) < .10);
  assert.ok(Math.abs(routePosition(course.centerline,course.hole).progress-1)<.10);
  for(const [width,height,chromeTop,chromeBottom] of [[320,568,56,70],[390,844,98,83],[430,932,90,95],[768,1024,79,80],[844,390,50,56],[1366,768,65,63],[1920,1080,70,68]]){
    const viewport=fitAreaInsets(width,height,chromeTop,chromeBottom);
    assert.ok(viewport.top>=chromeTop, 'HUD must not overlap play area');
    assert.ok(viewport.bottom>=chromeBottom,'Overview controls must be reserved');
    assert.ok(viewport.centerY>=viewport.top && viewport.centerY<=height-viewport.bottom);
    const rotation=portraitCourseRotation(course,width,height);
    const fit=courseFit(course,width,height,rotation,chromeTop,chromeBottom);
    const worldCenter=inverseRotateXY(fit.bounds.centerX,fit.bounds.centerY,rotation);
    const offset=anchoredCameraOffset(worldCenter.x,worldCenter.y,fit.scale,rotation,fit.view);
    for(const p of course.outline){
      const screen=worldToScreenPoint(p.x,p.y,0,fit.scale,offset.x,offset.y,rotation);
      assert.ok(screen.x>=-1 && screen.x<=width+1, 'no horizontal clipping');
      assert.ok(screen.y>=viewport.top-1 && screen.y<=height-viewport.bottom+1, 'no HUD/controls clipping in overview');
    }
    cases++;
  }
}
console.log('Moss & Marble field-guide UX:',cases,'responsive fits and physical route indicators OK');
