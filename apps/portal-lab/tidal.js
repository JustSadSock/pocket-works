/**
 * Nearby timelike geodesics (finite-difference Jacobi experiment).
 * The display is a diagnostic local-separation frame, not a rendering of
 * a deformable solid through curved light rays. No elastic material model.
 */
import {launch,advance,geometry,constraint} from './relativity.js';
const signedAngle=d=>Math.atan2(Math.sin(d),Math.cos(d));
export function createCongruence(m,{l=2.4*m.a,phi=0,speed=.72,size=.035*m.a}={}){
 if(!(size>0&&size<.2*m.a))throw Error('Неверный размер пробного облака');
 const source={l,phi,alpha:Math.PI,speed,kind:'matter'};
 const R=geometry(l,m).R;
 const ray=(loc,angle)=>launch(m,{...source,l:loc,phi:angle});
 return {
  m:{...m},size,source,
  center:ray(l,phi),
  radial:[ray(l+size,phi),ray(l-size,phi)],
  lateral:[ray(l,phi+size/R),ray(l,phi-size/R)],
  time:0,done:false
 };
}
export function strain(c){
 const g=geometry(c.center.l,c.m),r=c.radial,t=c.lateral,e=2*c.size;
 function separation(a,b){
  const dl=a.l-b.l,dphi=signedAngle(a.phi-b.phi);
  return {radial:dl/e,azimuth:g.R*dphi/e,length:Math.hypot(dl,g.R*dphi)/e};
 }
 const radial=separation(...r),transverse=separation(...t);
 const matrix=[[radial.radial,transverse.radial],[radial.azimuth,transverse.azimuth]];
 const determinant=matrix[0][0]*matrix[1][1]-matrix[0][1]*matrix[1][0];
 const maxError=Math.max(...[c.center,...r,...t].map(p=>Math.abs(constraint(p,c.m))));
 return {radial,transverse,matrix,areaRatio:Math.abs(determinant),
  maxError, crossings:c.center.crossings,
  l:c.center.l,localCurvature:g.K,
  properTime:c.center.tau,coordinateTime:c.center.t};
}
export function stepCongruence(c,dt){
 if(c.done)return strain(c);
 if(dt<0||dt>3*c.m.a)throw Error('Недопустимый шаг зонда');
 const rays=[c.center,...c.radial,...c.lateral];
 for(const ray of rays)advance(ray,c.m,dt,{record:false});
 c.time+=dt;
 if(Math.abs(c.center.l)>9*c.m.a)c.done=true;
 return strain(c);
}
export function diagnosticGeometry(state,{scale=42,maxScale=3}={}){
 const vectors=state.matrix.map(r=>r.slice()); // columns = reference basis.
 const a=state.matrix[0][0],b=state.matrix[0][1],c=state.matrix[1][0],d=state.matrix[1][1];
 const points=[];
 for(let i=0;i<=64;i++){
  const t=i*Math.PI/32,u=Math.cos(t),v=Math.sin(t);
  points.push({x:Math.max(-maxScale,Math.min(maxScale,a*u+b*v))*scale,
   y:Math.max(-maxScale,Math.min(maxScale,c*u+d*v))*scale});
 }
 return points;
}
