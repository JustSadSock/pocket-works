// Analytic damped spring: no Euler instability; positions in app-defined units.
export class Spring{
 constructor({mass=1,stiffness=140,damping=15,value=0,target=0}={}){
  if(![mass,stiffness,damping,value,target].every(Number.isFinite)||mass<=0||stiffness<=0||damping<0)throw Error('Invalid spring');
  Object.assign(this,{mass,stiffness,damping,value,target,velocity:0});
 }
 impulse(force){if(!Number.isFinite(force))throw Error('Invalid impulse');this.velocity+=force/this.mass;}
 advance(dt){
  if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error('Invalid spring step');
  const a=this.damping/(2*this.mass),w2=this.stiffness/this.mass,d=a*a-w2,x=this.value-this.target,v=this.velocity,decay=Math.exp(-a*dt);
  let y,u;
  if(Math.abs(d)<1e-8){const b=v+a*x;y=decay*(x+b*dt);u=decay*(v-a*b*dt);}
  else if(d<0){const w=Math.sqrt(-d),c=Math.cos(w*dt),s=Math.sin(w*dt),b=(v+a*x)/w;y=decay*(x*c+b*s);u=decay*(v*c-(a*b+w*x)*s);}
  else{const w=Math.sqrt(d),r1=-a+w,r2=-a-w,b=(v-r2*x)/(r1-r2),c=x-b;y=b*Math.exp(r1*dt)+c*Math.exp(r2*dt);u=r1*b*Math.exp(r1*dt)+r2*c*Math.exp(r2*dt);}
  this.value=this.target+y;this.velocity=u;return this.value;
 }
 reset(value=this.target){this.value=value;this.velocity=0;}
}
export function impactParticles(seed,count=12){
 let n=seed>>>0;const rand=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
 return Array.from({length:Math.min(64,Math.max(0,count))},()=>{const angle=rand()*Math.PI;return {vx:Math.cos(angle)*(30+rand()*65),vy:-Math.sin(angle)*(30+rand()*55),size:2+rand()*3};});
}
