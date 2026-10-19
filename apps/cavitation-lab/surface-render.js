import { contourFactors, ambientVelocity } from './surface-flow.js';

const TAU=2*Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// A 64-node area-preserving noncircular gas/liquid cross-section.
export function contourPath(ctx,x,y,r,shape,gain=1){
  const values=contourFactors(shape,gain,64);
  ctx.beginPath();
  for(let i=0;i<values.length;i++){
    const a=TAU*i/values.length;
    const px=x+r*values[i]*Math.cos(a),py=y+r*values[i]*Math.sin(a);
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();
}
export function drawJetTongue(ctx,x,y,r,shape,gain,collapseRatio=1){
  if(!shape||shape.jet<.06||collapseRatio>.73||r<3)return;
  // Kinematic jet indicator: direction comes from integrated ambient potential
  // velocity, not an arbitrary vector painted toward the screen edge.
  const strength=clamp((shape.jet-.06)*gain*1.3,0,.85);
  const {angle}=shape,ux=Math.cos(angle),uy=Math.sin(angle);
  const sx=x-ux*r*.82,sy=y-uy*r*.82;
  const ex=x+ux*r*(.10+.80*strength),ey=y+uy*r*(.10+.80*strength);
  const width=r*(.075+.14*strength);
  const nX=-uy,nY=ux;
  const grad=ctx.createLinearGradient(sx,sy,ex,ey);
  grad.addColorStop(0,'rgba(175,255,231,0.02)');
  grad.addColorStop(.35,'rgba(122,236,215,0.38)');
  grad.addColorStop(1,'rgba(227,255,232,0.92)');
  ctx.save();contourPath(ctx,x,y,r,shape,gain);ctx.clip();
  ctx.beginPath();
  ctx.moveTo(sx+nX*width,sy+nY*width);
  ctx.quadraticCurveTo(x+nX*width*.55,y+nY*width*.55,ex,ey);
  ctx.quadraticCurveTo(x-nX*width*.55,y-nY*width*.55,sx-nX*width,sy-nY*width);
  ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.lineWidth=Math.max(.75,r*.018);
  ctx.strokeStyle='rgba(220,255,229,.55)';
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
  ctx.restore();
}

// Real vector samples from the instantaneous potential field: this is the
// water-velocity direction around the bubble, not an acoustic wavefront.
export function drawFlowTracers(ctx,solution,point,index,x,y,scale,r,enabled=true){
 if(!enabled||r<5)return;
 const g=solution.geometry[index];
 ctx.save();
 for(let i=0;i<12;i++){
  const angle=TAU*i/12+Math.PI/24;
  const distance=point.bubbles[index].radius*1.55;
  const wx=g.x+distance*Math.cos(angle),wy=g.y+distance*Math.sin(angle);
  const velocity=ambientVelocity(solution,point,wx,wy,index);
  // Include its own spherical radial flow, which dominates near collapse.
  const deltaX=wx-g.x,deltaY=wy-g.y,d2=deltaX*deltaX+deltaY*deltaY;
  const s=point.bubbles[index];
  const flux=s.radius*s.radius*s.velocity;
  const self=flux/Math.pow(Math.max(.001,d2),1.5);
  let dx=velocity.x+self*deltaX,dy=velocity.y+self*deltaY;
  const mag=Math.hypot(dx,dy);
  if(mag<.003)continue;
  dx/=mag;dy/=mag;
  const cx=x+Math.cos(angle)*distance*scale;
  const cy=y+Math.sin(angle)*distance*scale;
  const len=clamp(Math.log1p(mag)*4.5,3,13);
  const alpha=clamp(mag*.33,.11,.47);
  ctx.strokeStyle='rgba(170,250,226,'+alpha.toFixed(3)+')';
  ctx.lineWidth=Math.max(.75,Math.min(1.4,r*.018));
  ctx.beginPath();ctx.moveTo(cx-dx*len*.5,cy-dy*len*.5);
  ctx.lineTo(cx+dx*len*.5,cy+dy*len*.5);ctx.stroke();
  ctx.fillStyle='rgba(226,255,237,'+alpha.toFixed(3)+')';
  ctx.beginPath();ctx.arc(cx+dx*len*.5,cy+dy*len*.5,1.2,0,TAU);ctx.fill();
 }
 ctx.restore();
}
