/**
 * Frame pacing for non-interactive decoration only.
 * World physics, WebGL gameplay, aiming and pointer events stay at the host
 * requestAnimationFrame frequency. This module never schedules timers.
 */
const changed=(a,b,threshold)=>!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>threshold;
export class ScenicFrameGate {
  constructor() {
    this.lastPaint = -Infinity;
    this.level = null;
    this.mode = null;
    this.pose = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 0;
    this.quality = 1;
  }
  shouldDraw(time, {level,mode,renderer,width,height,dpr=1,quality=1,reducedMotion=false,active=false} = {}) {
    const now = Number(time)*1000;
    if(!Number.isFinite(now))return true;
    const pose={
      x:Number(renderer?.offsetX)||0,
      y:Number(renderer?.offsetY)||0,
      scale:Number(renderer?.scale)||1,
      angle:Number(renderer?.cameraRotation)||0
    };
    const layoutChanged=level!==this.level||mode!==this.mode||
      width!==this.width||height!==this.height||dpr!==this.dpr||quality!==this.quality;
    const moved=!this.pose||changed(pose.x,this.pose.x,.60)||
      changed(pose.y,this.pose.y,.60)||
      changed(pose.scale,this.pose.scale,.00025)||
      changed(pose.angle,this.pose.angle,.0008);
    const elapsed=now-this.lastPaint;
    // Background composition is mostly static; 15fps when idle is ample.
    // Tracking/motion gets 30fps, easing load without stuttering inputs.
    // On budget-constrained screens use 20fps visual-only animation.
    const cadence=quality<.65?(active||moved?50:92):(active||moved?33:67);
    const should=layoutChanged || (elapsed>=cadence && (!reducedMotion || moved || active));
    if(should) {
      this.lastPaint=now;
      this.level=level;this.mode=mode;
      this.pose=pose;this.width=width;this.height=height;
      this.dpr=dpr;this.quality=quality;
    }
    return should;
  }
}
