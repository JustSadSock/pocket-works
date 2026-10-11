export function drawFrame(context,image,track,{x,y,width,height}){
 if(track?.type!=='frames')throw Error('Expected frame sample');
 context.drawImage(image,...track.rect,x,y,width,height);
}
// Babylon's paused animation group is sampled by the common clock, never by
// a competing render-loop clock. Native frame units come from the imported group.
export function bindSkeletal(group,duration){
 if(!group||!Number.isFinite(duration)||duration<=0)throw Error('Invalid skeletal group');
 group.start(false,1,group.from,group.to);group.pause();
 return {sample(seconds){group.goToFrame(group.from+Math.max(0,Math.min(1,seconds/duration))*(group.to-group.from));},dispose(){group.stop();}};
}
