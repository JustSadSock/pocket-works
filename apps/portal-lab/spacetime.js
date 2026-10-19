/**
 * Static spherically symmetric 3+1D metric in proper radial gauge:
 * ds²=-N(l)²dt²+dl²+R(l)²dΩ², c=G=1.
 * An exact prescribed metric; the required matter source is derived from
 * Einstein's equations rather than assumed physically realizable.
 *
 * z=l/a, B=sqrt(1+z²), F=z² exp(-(z/w)²)
 * R=a(B+shape*F).
 * log N=-eta/B + lapseBump*exp(-z²/(2 lapseWidth²)).
 *
 * Zero editor amplitudes recover exactly the previous Ellis/redshift models.
 * Mirror symmetry, smooth throat and asymptotic flatness are guaranteed.
 */
export const DESIGN_DEFAULTS=Object.freeze({a:1,eta:0,shape:0,shapeWidth:1.45,lapseBump:0,lapseWidth:1.3});
const PI8=8*Math.PI;
function bounded(n,lo,hi,name){if(!Number.isFinite(n)||n<lo||n>hi)throw Error('Некорректный параметр '+name);return n;}
export function metric(options={}){
 const a=bounded(options.a??1,.1,20,'радиус');
 const eta=bounded(options.eta??0,0,.85,'потенциал');
 const shape=bounded(options.shape??0,-.35,.55,'профиль');
 const shapeWidth=bounded(options.shapeWidth??1.45,.65,3,'ширина профиля');
 const lapseBump=bounded(options.lapseBump??0,-.45,.45,'поправка хода часов');
 const lapseWidth=bounded(options.lapseWidth??1.3,.65,3,'ширина хода часов');
 return {a,eta,shape,shapeWidth,lapseBump,lapseWidth};
}
export function geometry(l,m){
 const a=m.a,z=l/a,zz=z*z,B=Math.sqrt(1+zz),w=m.shapeWidth??1.45;
 const q=m.shape??0,k=1/(w*w),E=Math.exp(-k*zz);
 const F=zz*E,Fp=2*z*(1-k*zz)*E,Fpp=(2-10*k*zz+4*k*k*zz*zz)*E;
 const R=a*(B+q*F),Rp=z/B+q*Fp,Rpp=(1/(B*B*B)+q*Fpp)/a;
 const u=m.lapseWidth??1.3,g=(m.lapseBump??0),ku=1/(u*u);
 const P=Math.exp(-zz*ku/2),logN=-m.eta/B+g*P;
 const dlogN=(m.eta*z/(B*B*B)-g*z*ku*P)/a;
 const ddlogN=(m.eta*(1-2*zz)/(B**5)+g*(zz*ku*ku-ku)*P)/(a*a);
 const N=Math.exp(logN),NppOverN=ddlogN+dlogN*dlogN;
 return {R,Rp,Rpp,N,dlogN,ddlogN,NppOverN,
  K:-Rpp/R,z:a*Math.asinh(z),logN,
  embeddingAllowed:Math.abs(Rp)<=1+1e-12};
}
export function stressEnergy(l,m){
 const g=geometry(l,m),R=g.R,R2=R*R;
 // Einstein tensor / (8π), orthonormal frame of static observers:
 // 8πρ = (1 - R'² - 2RR'')/R²
 // 8πp_r = (-1 + R'² + 2RR'N'/N)/R²
 // 8πp_t = N''/N + R''/R + R'N'/(RN)
 const G00=(1-g.Rp*g.Rp-2*R*g.Rpp)/R2;
 const Grr=(-1+g.Rp*g.Rp+2*R*g.Rp*g.dlogN)/R2;
 const Gtt=g.NppOverN+g.Rpp/R+g.Rp*g.dlogN/R;
 const rho=G00/PI8,pr=Grr/PI8,pt=Gtt/PI8;
 const radial=rho+pr,tangential=rho+pt;
 const nec=Math.min(radial,tangential)>=-1e-12;
 const wec=nec&&rho>=-1e-12;
 const dec=rho>=Math.max(Math.abs(pr),Math.abs(pt))-1e-12&&rho>=0;
 const sec=nec&&rho+pr+2*pt>=-1e-12;
 const Ricci=8*Math.PI*(rho-pr-2*pt); // R = -trace(G) = 8π (ρ - pr - 2pt)
 return {l,rho,pr,pt,radial,tangential,nec,wec,dec,sec,Ricci,
  G00,Grr,Gtt,
  shapeFunction:R*(1-g.Rp*g.Rp),
  g};
}
export function throatDiagnostics(m){
 const t=stressEnergy(0,m),a=m.a;
 const near=[];
 let minR=Infinity,minL=0,invalid=false,violations=0;
 for(let i=-200;i<=200;i++){
  const l=i*a/50, g=geometry(l,m),s=stressEnergy(l,m);
  if(g.R<minR){minR=g.R;minL=l;}
  if(!g.embeddingAllowed)invalid=true;
  if(s.radial<0||s.tangential<0)violations++;
  if(i%10===0)near.push({z:l/a,R:g.R/a,N:g.N,rho:s.rho*a*a,
   pr:s.pr*a*a,pt:s.pt*a*a,necR:s.radial*a*a,necT:s.tangential*a*a,
   k:g.K*a*a,shapeFunction:s.shapeFunction/a});
 }
 return {throat:t,minimumRadius:minR/a,minimumAt:minL/a,
  redshiftAtThroat:t.g.N,
  radialNEC:t.radial*a*a,tangentialNEC:t.tangential*a*a,
  flaring:t.g.Rpp*a,
  sampledViolations:violations,sampledCount:401,
  embeddingPossible:!invalid,profile:near};
}
export function sampleEinstein(m,start=-4,end=4,count=241){
 if(!Number.isInteger(count)||count<3||count>2001)throw Error('Неверное число выборок');
 const out=[];
 for(let i=0;i<count;i++){
  const z=start+(end-start)*i/(count-1),s=stressEnergy(z*m.a,m);
  out.push({z,R:s.g.R/m.a,N:s.g.N,rho:s.rho*m.a*m.a,pr:s.pr*m.a*m.a,
   pt:s.pt*m.a*m.a,necR:s.radial*m.a*m.a,necT:s.tangential*m.a*m.a,
   ricci:s.Ricci*m.a*m.a,rpp:s.g.Rpp*m.a});
 }
 return out;
}

/** Limiting b=L/E for photons to cross from infinity to the opposite region.
 * It is the minimum R(l)/N(l) along the radial optical path, which can be
 * outside the throat in a user-defined metric with multiple photon spheres.
 */
export function criticalImpact(m){
 let best=Infinity,at=0;
 for(let i=0;i<=1200;i++){
  const l=(i/100)*m.a,g=geometry(l,m),b=g.R/g.N;
  if(b<best){best=b;at=l;}
 }
 return {b:best,at};
}
