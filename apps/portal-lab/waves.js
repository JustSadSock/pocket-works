/**
 * One radial partial wave of the test massless scalar Klein-Gordon equation
 * on the same fixed static, spherical 3+1D metric as relativity.js:
 *
 * ds²=-N(l)² dt²+dl²+R(l)² dOmega²
 * Φ(t,l,theta,phi)=ψ(t,x)/R(l) Y_jm(theta,phi)
 * dx/dl = 1/N(l), and (∂²_t-∂²_x+U_j)ψ = 0
 * U_j = N²[j(j+1)/R² + R_xx/(N² R)]
 *     = N²[j(j+1)/R² + R''/R + (N'/N)(R'/R)].
 *
 * Spatial x, time t and potential are normalized by throat a:
 * X=x/a, T=ct/a, W=a²U, z=l/a.
 * This is a linear test field with no back-reaction, *not* a GR
 * gravitational wave or full 3D scalar field solver.
 */
export const WAVE_POINTS=801;
export const WAVE_SPAN=20;
export const WAVE_SOURCE=8;
export const WAVE_DETECTOR=12;
export const WAVE_SPONGE=15.5;
export const WAVE_CFL=.62;
const SQ=Math.sqrt;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function waveLapse(z,eta=0){return Math.exp(-eta/SQ(1+z*z));}
export function waveGeometry(eta=0,points=WAVE_POINTS,span=WAVE_SPAN){
 if(!Number.isFinite(eta)||eta<0||eta>.85||points<121||points%2!==1||span<14)throw Error('Неверная волновая геометрия');
 const dx=2*span/(points-1),x=new Float64Array(points),z=new Float64Array(points),lapse=new Float64Array(points);
 const mid=(points-1)/2;
 // Exact metric tortoise transformation integrated using fourth-order RK.
 function f(u){return waveLapse(u,eta);}
 function rk4(v,h){
  const k1=f(v),k2=f(v+h*k1/2),k3=f(v+h*k2/2),k4=f(v+h*k3);
  return v+h*(k1+2*k2+2*k3+k4)/6;
 }
 for(let i=0;i<points;i++)x[i]=(i-mid)*dx;
 z[mid]=0;lapse[mid]=f(0);
 for(let i=mid+1;i<points;i++){z[i]=rk4(z[i-1],dx);z[points-1-i]=-z[i];lapse[i]=f(z[i]);lapse[points-1-i]=lapse[i];}
 return {eta,dx,x,z,lapse,points,span,mid};
}
export function scalarPotential(z,j=0,eta=0){
 if(!Number.isInteger(j)||j<0||j>8)throw Error('Неверная гармоника');
 const r2=1+z*z,R=SQ(r2),N=waveLapse(z,eta);
 return N*N*(j*(j+1)/r2+1/(r2*r2)+eta*z*z/(r2*r2*R));
}
export function wavePotential(grid,j){
 const u=new Float64Array(grid.points);
 for(let i=0;i<grid.points;i++)u[i]=scalarPotential(grid.z[i],j,grid.eta);
 return u;
}
function packet(x,x0,width,lambda,amplitude,phase=0){
 const z=x-x0,k=2*Math.PI/lambda;
 return amplitude*Math.exp(-z*z/(2*width*width))*Math.cos(k*z+phase);
}
export function createWave(options={}){
 const params={
  eta:clamp(Number(options.eta??0),0,.85),
  j:Math.floor(clamp(Number(options.j??1),0,5)),
  wavelength:clamp(Number(options.wavelength??1.25),.6,3.5),
  width:clamp(Number(options.width??1.25),.7,2.5),
  double:options.double===true,
  relativePhase:options.relativePhase===Math.PI?Math.PI:0,
  amplitude:clamp(Number(options.amplitude??1),.1,2)
 };
 const grid=waveGeometry(params.eta),potential=wavePotential(grid,params.j);
 const n=grid.points,field=new Float64Array(n),velocity=new Float64Array(n);
 const gradient=(data,i)=>(data[i+1]-data[i-1])/(2*grid.dx);
 for(let i=0;i<n;i++){
  const x=grid.x[i];
  field[i]=packet(x,WAVE_SOURCE,params.width,params.wavelength,params.amplitude);
  if(params.double)field[i]+=packet(x,-WAVE_SOURCE,params.width,params.wavelength,params.amplitude,params.relativePhase);
 }
 // Initial Cauchy data select leftward motion from A and rightward from B.
 for(let i=1;i<n-1;i++){
  const x=grid.x[i],h=grid.dx;
  const plus=(packet(x+h,WAVE_SOURCE,params.width,params.wavelength,params.amplitude)-
    packet(x-h,WAVE_SOURCE,params.width,params.wavelength,params.amplitude))/(2*h);
  const minus=params.double?(packet(x+h,-WAVE_SOURCE,params.width,params.wavelength,params.amplitude,params.relativePhase)-
    packet(x-h,-WAVE_SOURCE,params.width,params.wavelength,params.amplitude,params.relativePhase))/(2*h):0;
  velocity[i]=plus-minus;
 }
 const wave={params,grid,potential,field,velocity,t:0,steps:0,
  outgoingA:0,outgoingB:0,loss:0,initialEnergy:0,history:[],waterfall:[],finished:false,
  detectorA:Math.round((WAVE_DETECTOR+grid.span)/grid.dx),
  detectorB:Math.round((-WAVE_DETECTOR+grid.span)/grid.dx),
  sponge:null};
 wave.sponge=new Float64Array(n);
 for(let i=0;i<n;i++){
  const d=Math.abs(grid.x[i]);
  wave.sponge[i]=d<=WAVE_SPONGE?0:2.3*((d-WAVE_SPONGE)/(grid.span-WAVE_SPONGE))**2;
 }
 wave.initialEnergy=waveEnergy(wave);
 sampleWave(wave);
 return wave;
}
function acceleration(w,out){
 const {field,grid,potential}=w,dx2=1/(grid.dx*grid.dx),n=grid.points;
 for(let i=1;i<n-1;i++)
  out[i]=(field[i-1]-2*field[i]+field[i+1])*dx2-potential[i]*field[i];
 out[0]=0;out[n-1]=0;
}
export function waveEnergy(w,{from=1,to=w.grid.points-1}={}){
 const {field,velocity,grid,potential}=w,dx=grid.dx;
 let total=0;
 for(let i=from;i<to;i++){
  const grad=(field[i+1]-field[i-1])/(2*dx);
  total+=.5*(velocity[i]*velocity[i]+grad*grad+potential[i]*field[i]*field[i])*dx;
 }
 return total;
}
function addFlux(w,dt){
 const {grid,field,velocity}=w,dx=grid.dx,a=w.detectorA,b=w.detectorB;
 const gradientA=(field[a+1]-field[a-1])/(2*dx),gradientB=(field[b+1]-field[b-1])/(2*dx);
 // Stress tensor energy flux: rightward -ψ_t ψ_x, leftward +ψ_t ψ_x.
 w.outgoingA+=-velocity[a]*gradientA*dt;
 w.outgoingB+=velocity[b]*gradientB*dt;
}
function waveStep(w,dt){
 const {field,velocity,potential,grid,sponge}=w,n=field.length,dx=grid.dx;
 const accelOld=new Float64Array(n),accelNew=new Float64Array(n);
 acceleration(w,accelOld);
 for(let i=1;i<n-1;i++)field[i]+=dt*velocity[i]+.5*dt*dt*accelOld[i];
 field[0]=0;field[n-1]=0;
 acceleration(w,accelNew);
 for(let i=1;i<n-1;i++)velocity[i]+=.5*dt*(accelOld[i]+accelNew[i]);
 velocity[0]=0;velocity[n-1]=0;
 addFlux(w,dt);
 const pre=waveEnergy(w);
 for(let i=1;i<n-1;i++){
  if(!sponge[i])continue;
  const fade=Math.exp(-sponge[i]*dt);
  field[i]*=fade;velocity[i]*=fade;
 }
 const post=waveEnergy(w);
 w.loss+=Math.max(0,pre-post);
 w.t+=dt;w.steps++;
 if(w.t>=42)w.finished=true;
}
export function advanceWave(w,dt){
 if(!Number.isFinite(dt)||dt<0||dt>2)throw Error('Недопустимый шаг волновой схемы');
 if(w.finished||dt===0)return diagnostics(w);
 let remaining=Math.min(dt,42-w.t);
 const dtMax=WAVE_CFL*w.grid.dx;
 while(remaining>1e-10){
  const h=Math.min(dtMax,remaining);
  waveStep(w,h);remaining-=h;
 }
 if(w.steps%13<Math.ceil(dt/dtMax)||w.finished)sampleWave(w);
 return diagnostics(w);
}
export function diagnostics(w){
 const grid=w.grid,energy=waveEnergy(w),initial=w.initialEnergy;
 const peak=w.field.reduce((a,v)=>Math.max(a,Math.abs(v)),0);
 const outgoingA=clamp(w.outgoingA/initial,0,2),
       outgoingB=clamp(w.outgoingB/initial,0,2);
 const budget=(energy+w.loss)/initial;
 return {t:w.t,energy,initial,relativeEnergy:energy/initial,
  loss:w.loss/initial,budget,reflection:outgoingA,transmission:outgoingB,
  peak,phase:w.finished?'finished':w.t===0?'ready':'running',
  spread:w.params.double?'two-sided':'one-sided',steps:w.steps,
  grid: grid.points,dx:grid.dx,
  centerPotential:w.potential[grid.mid],width:w.params.width,
  wavelength:w.params.wavelength};
}
function sampleWave(w){
 const d=diagnostics(w),n=w.grid.points,peak=Array.from(w.field).reduce((a,b)=>Math.max(a,Math.abs(b)),0);
 w.history.push({t:d.t,reflection:d.reflection,transmission:d.transmission,energy:d.relativeEnergy,
  loss:d.loss,budget:d.budget,peak,fieldAtThroat:w.field[w.grid.mid]});
 if(w.history.length>600)w.history.shift();
 const strip=new Float32Array(201);
 for(let i=0;i<strip.length;i++)strip[i]=w.field[Math.round(i*(n-1)/(strip.length-1))];
 w.waterfall.push(strip);if(w.waterfall.length>160)w.waterfall.shift();
 return d;
}
export function waveSnapshot(w){
 const d=diagnostics(w);
 return {...d,params:{...w.params},geometry:{eta:w.grid.eta},
  history:w.history.map(x=>({...x}))};
}
