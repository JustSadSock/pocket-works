// Render identity is separate from preparation identity. A small pan can
// reuse the same region, but only a draw for the current view certifies it.
export const covers=(a,b)=>!!a&&a[0]<=b[0]&&a[1]<=b[1]&&a[2]>=b[2]&&a[3]>=b[3];
export function regionKey(r){return r.revision+'|'+r.bounds.join(':');}
export function viewKey(r){return JSON.stringify([r.intent,r.revision,r.bounds,r.visible,r.view.x,r.view.y,r.view.s,r.view.viewport??null,r.tilt,r.width,r.height,r.motion]);}
export class SurfaceRequests{
 constructor(){this.seq=0;this.intent=0;this.current=null;this.presented=null;this.invalidated=0;this.stale=0;}
 invalidate(){this.intent++;this.current=null;this.presented=null;this.invalidated++;return this.intent;}
 update(r){const next={...r,intent:this.intent},key=viewKey(next);if(this.current?.key===key)return this.current;this.presented=null;this.current={...next,key,id:++this.seq};return this.current;}
 accepts(job,region){const r=this.current;return !!r&&r.intent===job.intent&&r.revision===job.revision&&covers(region,r.visible);}
 commit(r,active,lod){if(r!==this.current||active.revision!==r.revision||!covers(active.bounds,r.visible)||active.terrain.detail!==r.detail||active.terrain.stats.contours.detail!==r.contourDetail)return false;this.presented={id:r.id,intent:r.intent,key:r.key,revision:r.revision,region:active.bounds.slice(),detail:r.detail,contourDetail:r.contourDetail,lod,view:{...r.view},tilt:r.tilt};return true;}
}
