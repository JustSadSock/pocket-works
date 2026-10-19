// Pointer vectors are directions, not positions inside the court.
// Never clamp the gameplay aim endpoint: clipping its x/y independently
// rotates the projectile near the edges of a portrait viewport.
export function directionalAim(origin,dx,dy,length=900){
 const size=Math.hypot(dx,dy);
 if(!Number.isFinite(size)||size<.0001)return {x:origin.x+length,y:origin.y};
 return {x:origin.x+dx/size*length,y:origin.y+dy/size*length};
}
export function aimHeading(origin,target){
 return Math.atan2(target.y-origin.y,target.x-origin.x);
}
export function visualReticle(origin,target,width=400,height=620){
 if(target.x>=0&&target.x<=width&&target.y>=0&&target.y<=height)
  return {x:target.x,y:target.y,edge:false};
 const dx=target.x-origin.x,dy=target.y-origin.y;
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<.001)
  return {x:origin.x,y:origin.y,edge:false};
 let t=1;
 if(dx>0)t=Math.min(t,(width-13-origin.x)/dx);
 else if(dx<0)t=Math.min(t,(13-origin.x)/dx);
 if(dy>0)t=Math.min(t,(height-13-origin.y)/dy);
 else if(dy<0)t=Math.min(t,(13-origin.y)/dy);
 t=Math.max(0,t);
 return {x:origin.x+dx*t,y:origin.y+dy*t,edge:true};
}

// PocketNet v3 accepts only aim coordinates inside the court. Intersect
// the pointer ray with the inset court boundary, not independent x/y clamps.
export function courtAim(origin,dx,dy,width=400,height=620){
 const p=visualReticle(origin,directionalAim(origin,dx,dy),width,height);
 return {x:p.x,y:p.y};
}
