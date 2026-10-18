/**
 * Equatorial geodesics for an explicitly defined static, spherical spacetime:
 * ds² = -N(l)² dt² + dl² + R(l)² dφ², with c=G=1.
 * R(l)=sqrt(l²+a²); N(l)=exp(-η a/R(l)).
 * η=0: ultrastatic Ellis wormhole (exact 4D Einstein/phantom-field solution).
 * η>0: phenomenological redshift metric ANSATZ, not the same matter solution.
 * The signed proper radial coordinate l runs continuously through l=0.
 */
export const MAX_ETA=.85;
export function metric({a=1,eta=0}={}){
 if(!Number.isFinite(a)||a<=0||!Number.isFinite(eta)||eta<0||eta>MAX_ETA)throw Error('Недопустимые параметры метрики');
 return {a,eta};
}
export function geometry(l,m){
 const r2=l*l+m.a*m.a,R=Math.sqrt(r2);
 const N=Math.exp(-m.eta*m.a/R);
 const dlogN=m.eta*m.a*l/(R*r2);
 return {R,N,dlogN,K:-m.a*m.a/(r2*r2),z:m.a*Math.asinh(l/m.a)};
}
export function staticAcceleration(l,m){return -geometry(l,m).dlogN;}
export function staticClockRate(l,m){return geometry(l,m).N;}
export function nullEnergyRadial(l,m){
 if(m.eta!==0)return null; // Only display Einstein tensor NEC formula for Ellis.
 const r2=l*l+m.a*m.a;
 return -2*m.a*m.a/(r2*r2); // 8πG (ρ + p_radial), c=G=1
}
export function launch(m,{l=3.2*m.a,phi=Math.PI,alpha=Math.PI,speed=.7,kind='light'}={}){
 if(!Number.isFinite(l)||!Number.isFinite(phi)||!Number.isFinite(alpha))throw Error('Положение источника некорректно');
 const g=geometry(l,m),side=l>=0?1:-1;
 const light=kind==='light';
 const beta=light?1:Math.min(.975,Math.max(.02,speed));
 const gamma=light?1:1/Math.sqrt(1-beta*beta);
 const E=g.N*gamma;
 const tangent=gamma*beta*Math.sin(alpha);
 const p=side*gamma*beta*Math.cos(alpha);
 const L=g.R*tangent;
 return {kind:light?'light':'matter',l,phi,p,L,E,k:light?0:1,t:0,tau:0,crossings:0,
  path:[{l,phi}],initial:{l,phi,alpha,speed:beta}};
}
export function constraint(s,m){
 const g=geometry(s.l,m);
 return -s.E*s.E/(g.N*g.N)+s.p*s.p+s.L*s.L/(g.R*g.R)+s.k;
}
export function localSpeed(s,m){
 const g=geometry(s.l,m);
 return Math.min(1,Math.sqrt(s.p*s.p+s.L*s.L/(g.R*g.R))*g.N/s.E);
}
function differential(q,s,m){
 const g=geometry(q.l,m),R2=g.R*g.R;
 const n2=g.N*g.N;
 const scalar=n2/s.E;
 return {
  l:q.p*scalar,
  phi:s.L*scalar/R2,
  p:-s.E*g.dlogN+n2*s.L*s.L*q.l/(s.E*R2*R2),
  tau:s.k?scalar:0
 };
}
function stage(q,k,dt){return {l:q.l+k.l*dt,phi:q.phi+k.phi*dt,p:q.p+k.p*dt,tau:q.tau+k.tau*dt};}
function rk4(s,m,dt){
 const q={l:s.l,phi:s.phi,p:s.p,tau:s.tau};
 const k1=differential(q,s,m);
 const k2=differential(stage(q,k1,dt*.5),s,m);
 const k3=differential(stage(q,k2,dt*.5),s,m);
 const k4=differential(stage(q,k3,dt),s,m);
 const next={l:q.l+dt*(k1.l+2*k2.l+2*k3.l+k4.l)/6,
  phi:q.phi+dt*(k1.phi+2*k2.phi+2*k3.phi+k4.phi)/6,
  p:q.p+dt*(k1.p+2*k2.p+2*k3.p+k4.p)/6,
  tau:q.tau+dt*(k1.tau+2*k2.tau+2*k3.tau+k4.tau)/6};
 const oldSign=Math.sign(s.l),newSign=Math.sign(next.l);
 if(oldSign*newSign<0)s.crossings++;
 Object.assign(s,next);
 s.t+=dt;
}
export function advance(s,m,dt,{record=true}={}){
 if(!Number.isFinite(dt)||dt<0||dt>10)throw Error('Недопустимый шаг симуляции');
 let remainder=dt;
 while(remainder>1e-10){
  // Proper radial size / local light-crossing time sets step limit near throat.
  const h=Math.min(remainder,.018*m.a);
  rk4(s,m,h);remainder-=h;
  if(record&&(!s.path.length||Math.abs(s.l-s.path.at(-1).l)>m.a*.017||Math.abs(s.phi-s.path.at(-1).phi)>.008)){
   s.path.push({l:s.l,phi:s.phi});
   if(s.path.length>900)s.path.shift();
  }
 }
 return s;
}
export function trace(s,m,seconds,dt=.025){
 const out=structuredClone(s);
 for(let t=0;t<seconds-1e-10;t+=dt)advance(out,m,Math.min(dt,seconds-t));
 return out;
}
export function collectBeam(m,source,{count=13,spread=.53,kind='light',speed=.65}={}){
 if(!Number.isInteger(count)||count<1||count>101)throw Error('Количество лучей вне диапазона');
 const rays=[];
 for(let i=0;i<count;i++){
  const offset=count===1?0:(i/(count-1)-.5)*spread;
  rays.push(launch(m,{...source,alpha:source.alpha+offset,kind,speed}));
 }
 return rays;
}
export function embedding(l,m){const g=geometry(l,m);return {r:g.R,z:g.z};}
export function rayMetrics(s,m){
 return {energy:s.E,angularMomentum:s.L,localSpeed:localSpeed(s,m),
  constraint:constraint(s,m),crossings:s.crossings,coordinateTime:s.t,properTime:s.tau};
}
