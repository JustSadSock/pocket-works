// Weakly non-spherical kinematic extension of the radial bubble model.
//
// The ambient potential velocity is computed from the SAME spherical source
// strengths q_j = R_j^2 * dR_j/dtau and same-sign rigid-wall images as coupling.js.
// Removing the l=0/1 boundary terms isolates shape modes l=2/3; accumulating
// center-flow displacement yields a directional impulse proxy for an incipient
// liquid tongue. This is a reduced-order diagnostic, NOT resolved free-boundary
// Euler / Navier-Stokes CFD or a prediction of impact pressure / jet speed.
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const COUNT=32;
const COS=Array.from({length:COUNT},(_,i)=>Math.cos(TAU*i/COUNT));
const SIN=Array.from({length:COUNT},(_,i)=>Math.sin(TAU*i/COUNT));

export function ambientVelocity(solution,point,x,y,excludeIndex=-1){
  let vx=0,vy=0;
  const bodies=solution.geometry;
  for(let j=0;j<bodies.length;j++){
    const bubble=point.bubbles[j],g=bodies[j];
    if(!bubble||!Number.isFinite(bubble.velocity))continue;
    const flux=bubble.radius*bubble.radius*bubble.velocity;
    if(j!==excludeIndex){
      const dx=x-g.x,dy=y-g.y;
      const d2=Math.max((bubble.radius*1.15)**2,dx*dx+dy*dy,1e-6);
      const strength=flux/(d2*Math.sqrt(d2));
      vx+=strength*dx;vy+=strength*dy;
    }
    if(solution.cloud.wall){
      const mirror=2*solution.config.standOff-g.x;
      const dx=x-mirror,dy=y-g.y;
      const d2=Math.max((bubble.radius*1.15)**2,dx*dx+dy*dy,1e-6);
      const strength=flux/(d2*Math.sqrt(d2));
      vx+=strength*dx;vy+=strength*dy;
    }
  }
  return {x:vx,y:vy};
}

function pointAtSample(solution,index){
  const item=solution.samples[index];
  if(solution.kind==='single')return {t:item.t,bubbles:[{
    radius:item.radius,velocity:item.velocity,acceleration:0
  }]};
  return item;
}
function makeEmpty(){return {c2:0,s2:0,c3:0,s3:0,flowX:0,flowY:0,jet:0,angle:0};}

export function buildSurfaceHistory(solution){
  const state=solution.geometry.map(makeEmpty);
  const samples=[];
  let lastT=0;
  for(let k=0;k<solution.samples.length;k++){
    const point=pointAtSample(solution,k);
    const dt=clamp(point.t-lastT,0,.02);
    const frame=[];
    for(let i=0;i<state.length;i++){
      const g=solution.geometry[i],bubble=point.bubbles[i],s=state[i],r=Math.max(.02,bubble.radius);
      // Surface terms of the ambient velocity: remove l=0, l=1, and retain
      // angular wavenumbers 2 and 3 (discrete orthogonal projection).
      let d2c=0,d2s=0,d3c=0,d3s=0;
      const ambient=ambientVelocity(solution,point,g.x,g.y,i);
      for(let a=0;a<COUNT;a++){
        const nx=COS[a],ny=SIN[a];
        const at=ambientVelocity(solution,point,g.x+r*nx,g.y+r*ny,i);
        const normal=((at.x-ambient.x)*nx+(at.y-ambient.y)*ny)/r;
        const angle=TAU*a/COUNT;
        d2c+=normal*Math.cos(2*angle);
        d2s+=normal*Math.sin(2*angle);
        d3c+=normal*Math.cos(3*angle);
        d3s+=normal*Math.sin(3*angle);
      }
      const factor=2/COUNT;
      // Stop accumulating at the first minimum: post-rebound details are
      // unsupported by the incompressible weak-perturbation approximation.
      const tMin=solution.kind==='single'?solution.firstMinimumTau:
        solution.individualCollapseUs[i]/solution.scaleUs;
      if(point.t<=tMin+.002){
        s.c2+=d2c*factor*dt;s.s2+=d2s*factor*dt;
        s.c3+=d3c*factor*dt;s.s3+=d3s*factor*dt;
        s.flowX+=ambient.x*dt;s.flowY+=ambient.y*dt;
      }
      const amplitude=Math.hypot(s.c2,s.s2,s.c3,s.s3);
      // Surface diagnostic remains within the perturbative regime.
      if(amplitude>.19){
        const scale=.19/amplitude;
        s.c2*=scale;s.s2*=scale;s.c3*=scale;s.s3*=scale;
      }
      const displacement=Math.hypot(s.flowX,s.flowY);
      s.jet=clamp(displacement/(g.r0*.22),0,.72);
      if(displacement>1e-6)s.angle=Math.atan2(s.flowY,s.flowX);
      frame.push({...s,
        deformation:100*Math.hypot(s.c2,s.s2,s.c3,s.s3),
        flowMagnitude:Math.hypot(ambient.x,ambient.y)
      });
    }
    samples.push({t:point.t,bubbles:frame});
    lastT=point.t;
  }
  return {samples,durationTau:solution.durationTau,model:'kinematic-potential-l2-l3'};
}

export function surfaceAt(history,t){
  const arr=history.samples;
  if(!arr.length)return {t:0,bubbles:[]};
  if(t<=0)return arr[0];
  const time=clamp(t,0,history.durationTau);
  let lo=0,hi=arr.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(arr[mid].t<time)lo=mid;else hi=mid;}
  const a=arr[lo],b=arr[hi],frac=clamp((time-a.t)/Math.max(1e-9,b.t-a.t),0,1);
  return {t:time,bubbles:a.bubbles.map((v,i)=>{
    const w=b.bubbles[i];
    const out={};
    for(const key of ['c2','s2','c3','s3','flowX','flowY','jet','deformation','flowMagnitude'])
      out[key]=v[key]+(w[key]-v[key])*frac;
    out.angle=Math.atan2(out.flowY,out.flowX);
    return out;
  })};
}
// A periodic radius modulation, then rescaled so the enclosed 2D area matches
// that of an equivalent circular cross section. Jet indentation is oriented
// upstream of the integrated center flow (which for a wall points toward it).
export function contourFactors(shape,amplification=1,count=64){
  if(!shape||count<8)return Array.from({length:Math.max(8,count)},()=>1);
  const gain=clamp(amplification,0,4);
  const factors=[];
  const indentation=clamp(shape.jet*gain*.38,0,.46);
  let square=0;
  for(let i=0;i<count;i++){
    const a=TAU*i/count;
    const diff=Math.atan2(Math.sin(a-shape.angle-Math.PI),Math.cos(a-shape.angle-Math.PI));
    const tip=Math.exp(-Math.pow(diff/.38,2));
    const rim=Math.exp(-Math.pow((Math.abs(diff)-.67)/.45,2));
    const eps=gain*(shape.c2*Math.cos(2*a)+shape.s2*Math.sin(2*a)
                   +shape.c3*Math.cos(3*a)+shape.s3*Math.sin(3*a));
    const f=clamp(1+eps-indentation*tip+indentation*.20*rim,.43,1.65);
    factors.push(f);square+=f*f;
  }
  const inv=1/Math.sqrt(square/count);
  return factors.map(f=>f*inv);
}
export function jetDirectionLabel(surface,withWall){
 if(!surface||surface.jet<.025)return 'Нет выраженной асимметрии';
 if(withWall&&Math.cos(surface.angle)>.65)return 'Поток к стенке';
 if(withWall&&Math.cos(surface.angle)<-.65)return 'Поток от стенки';
 return 'Поток от соседних полостей';
}
