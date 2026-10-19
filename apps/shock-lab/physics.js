// SHOCK — finite-volume, two-dimensional compressible Euler laboratory.
// Cell-centered conserved variables [rho, rho*u, rho*v, total energy].
// HLL interface flux; reflective slip at raster walls; transmissive domain edges.
// Dimensionless ideal gas: gamma=1.4, ambient density=pressure=1.
export const GAMMA = 1.4;
const FLOOR = 0.025;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class ShockField {
  constructor(nx = 144, ny = 88) {
    this.nx = nx;
    this.ny = ny;
    this.size = nx * ny;
    this.solid = new Uint8Array(this.size);
    this.body = new Uint8Array(this.size);
    this.bodyBounds = null;
    this.incidence = 0;
    this.bodyType = null;
    this.camber = 0;
    this.thickness = 11;
    this.gustAmplitude = 0;
    this.gustPeriod = 6;
    this.gustAngle = 0;
    this.lastInletAngle = 0;
    this.U = new Float32Array((this.size + 1) * 4);
    this.V = new Float32Array((this.size + 1) * 4);
    this.fx = new Float32Array((nx + 1) * ny * 4);
    this.fy = new Float32Array(nx * (ny + 1) * 4);
    this.time = 0;
    this.maxPressure = 1;
    this.maxMach = 0;
    this.flowActive = false;
    this.flowMach = 1.8;
    this.resetGas();
  }

  resetGas() {
    this.flowActive = false;
    const a = this.U;
    for (let i = 0; i < this.size; i++) {
      const k = i * 4;
      a[k] = 1;
      a[k + 1] = 0;
      a[k + 2] = 0;
      a[k + 3] = 1 / (GAMMA - 1);
    }
    this.V.set(a);
    this.time = 0;
    this.maxPressure = 1;
    this.maxMach = 0;
    this.gustAngle = 0;
    this.lastInletAngle = 0;
  }

  // Uniform dimensionless freestream: rho=1, p=1, u=M sqrt(gamma).
  // Inlet ghost state is held fixed at x=0, while the outlet and transverse
  // boundaries extrapolate. Supersonic inlet is the best posed case; subsonic
  // inlet is a simplified Dirichlet demonstration, not a stagnation plenum.
  startFlow(mach = 1.8) {
    this.resetGas();
    this.flowActive = true;
    this.flowMach = clamp(Number.isFinite(mach) ? mach : 1.8, .3, 3.2);
    const u = this.flowMach * Math.sqrt(GAMMA);
    const E = 1 / (GAMMA - 1) + .5 * u * u;
    for (let i = 0; i <= this.size; i++) {
      const k = i * 4;
      this.U[k] = 1;
      this.U[k + 1] = u;
      this.U[k + 2] = 0;
      this.U[k + 3] = E;
    }
    this.V.set(this.U);
    this.maxMach = this.flowMach;
    return this.flowMach;
  }

  setGust(amplitude = 0, period = 6) {
    this.gustAmplitude = clamp(Number.isFinite(amplitude) ? amplitude : 0, 0, 14);
    this.gustPeriod = clamp(Number.isFinite(period) ? period : 6, 2, 18);
  }

  // The cross-flow is a time-varying, energy-consistent Euler inlet boundary.
  // The resulting downstream vortical structures derive from conserved states.
  // It does not model real turbulence, skin friction, or viscous shedding.
  setFlowInlet(mach = this.flowMach) {
    this.flowMach = clamp(Number.isFinite(mach) ? mach : 1.8, .3, 3.2);
    const speed = this.flowMach * Math.sqrt(GAMMA), k = this.size * 4;
    const angle = this.gustAmplitude * Math.sin(2 * Math.PI * this.time / this.gustPeriod);
    const phi = angle * Math.PI / 180;
    const u=speed*Math.cos(phi),v=-speed*Math.sin(phi);
    this.gustAngle=angle;
    this.lastInletAngle=angle;
    this.U[k] = this.V[k] = 1;
    this.U[k+1] = this.V[k+1] = u;
    this.U[k+2] = this.V[k+2] = v;
    this.U[k+3] = this.V[k+3] = 1/(GAMMA-1)+.5*(u*u+v*v);
  }

  setWall(x, y, on = true, radius = 1.3) {
    const rr = radius * radius;
    for (let iy = Math.max(0, Math.floor(y - radius)); iy <= Math.min(this.ny - 1, Math.ceil(y + radius)); iy++) {
      for (let ix = Math.max(0, Math.floor(x - radius)); ix <= Math.min(this.nx - 1, Math.ceil(x + radius)); ix++) {
        if ((ix - x) ** 2 + (iy - y) ** 2 <= rr) {
          this.solid[iy * this.nx + ix] = on ? 1 : 0;
        }
      }
    }
  }

  stroke(x0, y0, x1, y1, on, radius = 1.45) {
    const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.8));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      this.setWall(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, on, radius);
    }
    // A changed cell cannot hold a trapped explosive gas sample.
    for (let i = 0; i < this.size; i++) {
      if (!this.solid[i]) continue;
      const k = i * 4;
      this.U[k] = this.V[k] = 1;
      this.U[k + 1] = this.V[k + 1] = 0;
      this.U[k + 2] = this.V[k + 2] = 0;
      this.U[k + 3] = this.V[k + 3] = 2.5;
    }
  }

  geometry(preset, incidence = 0, shape = {}) {
    this.solid.fill(0);
    this.body.fill(0);
    this.bodyBounds = null;
    this.bodyType = null;
    this.incidence = clamp(Number.isFinite(incidence) ? incidence : 0,-14,14);
    this.camber=clamp(Number.isFinite(shape?.camber) ? shape.camber : 0,-6,6);
    this.thickness=clamp(Number.isFinite(shape?.thickness) ? shape.thickness : 11,5,22);
    const W = this.nx, H = this.ny;
    const line = (x0, y0, x1, y1, r = 1.35) =>
      this.stroke(x0 * W, y0 * H, x1 * W, y1 * H, true, r);
    if (preset === 'reflector') {
      let px = null, py = null;
      for (let t = -1; t <= 1.001; t += 0.025) {
        const y = (0.5 + 0.345 * t) * H;
        const x = (0.75 + 0.17 * t * t) * W;
        if (px !== null) this.stroke(px, py, x, y, true, 1.9);
        px = x; py = y;
      }
      line(0.41, 0.13, 0.47, 0.25);
      line(0.41, 0.87, 0.47, 0.75);
    } else if (preset === 'slits') {
      line(0.46, 0.04, 0.46, 0.385, 1.65);
      line(0.46, 0.53, 0.46, 0.96, 1.65);
      line(0.69, 0.04, 0.69, 0.22);
      line(0.69, 0.32, 0.69, 0.64);
      line(0.69, 0.74, 0.69, 0.96);
    } else if (preset === 'maze') {
      line(0.27, 0.00, 0.27, 0.68, 1.75);
      line(0.48, 0.32, 0.48, 1.0, 1.75);
      line(0.69, 0, 0.69, 0.65, 1.75);
      line(0.87, 0.36, 0.87, 1.0, 1.75);
      line(0.27, 0.68, 0.38, 0.68);
      line(0.58, 0.32, 0.69, 0.32);
    } else if (preset === 'tube') {
      // A sealed rectangular shock tube. Two initially separated states are
      // initialized by loadTube; the UI holds the diaphragm until release.
      line(0.055, 0.20, 0.945, 0.20, 1.6);
      line(0.055, 0.80, 0.945, 0.80, 1.6);
      line(0.055, 0.20, 0.055, 0.80, 1.6);
      line(0.945, 0.20, 0.945, 0.80, 1.6);
    } else if (preset === 'wedge') {
      this.fillPolygon(this.rotateProfile([[.265,.5],[.66,.34],[.86,.5],[.66,.66]],this.incidence));
      this.bodyType = 'wedge';
    } else if (preset === 'airfoil') {
      this.fillPolygon(this.rotateProfile(this.airfoilProfile(this.camber,this.thickness),this.incidence));
      this.bodyType = 'airfoil';
    } else if (preset === 'cylinder') {
      this.bodyType = 'cylinder';
      const radius = H * .135, cx = W*.50, cy = H*.50;
      for (let y=0;y<H;y++)for(let x=0;x<W;x++) {
        if ((x-cx)**2+(y-cy)**2 <= radius*radius) this.solid[y*W+x]=1;
      }
    } else if (preset === 'nozzle') {
      // Convergent-divergent channel with raster-solid exterior; its exact
      // response follows the prescribed inlet state, not an assumed nozzle law.
      for(let x=0;x<W;x++){
        const t=x/Math.max(1,W-1);
        const half=t<.50 ? .335-(.335-.155)*(t/.50)
          : .155+(.33-.155)*((t-.50)/.50);
        for(let y=0;y<H;y++){
          if(Math.abs(y/Math.max(1,H-1)-.5) > half)
            this.solid[y*W+x]=1;
        }
      }
    } else if (preset === 'channel') {
      line(0.2, 0.26, 0.48, 0.26, 1.65);
      line(0.2, 0.74, 0.48, 0.74, 1.65);
      line(0.48, 0.26, 0.69, 0.44, 1.65);
      line(0.48, 0.74, 0.69, 0.56, 1.65);
      line(0.69, 0.44, 0.93, 0.28, 1.65);
      line(0.69, 0.56, 0.93, 0.72, 1.65);
    }
    if(this.bodyType){
      this.body.set(this.solid);
      let left=W,right=0,top=H,bottom=0;
      for(let i=0;i<this.size;i++)if(this.body[i]){
        const x=i%W,y=(i/W)|0;
        left=Math.min(left,x);right=Math.max(right,x);
        top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      this.bodyBounds={left,right,top,bottom,chord:Math.max(1,right-left+1)};
    }
  }

  // Thin symmetric/arched closed airfoil with user-controlled centreline
  // and thickness. Sections scale with the grid's aspect ratio so the
  // thickness is a fraction of chord length in physical grid cells.
  airfoilProfile(camber=this.camber, thickness=this.thickness) {
    const x0=.23,x1=.89, chordCells=(x1-x0)*this.nx;
    const top=[],bottom=[];
    for(let i=0;i<=24;i++){
      const t=i/24,x=x0+(x1-x0)*t;
      const arch=(camber/100)*chordCells/this.ny*4*t*(1-t);
      const half=.5*(thickness/100)*chordCells/this.ny*Math.pow(Math.max(0,Math.sin(Math.PI*t)),.85);
      const centre=.5-arch;
      top.push([x,centre-half]);bottom.push([x,centre+half]);
    }
    return [...top,...bottom.reverse()];
  }

  rotateProfile(points,angle) {
    const radians=angle*Math.PI/180;
    const c=Math.cos(radians),s=Math.sin(radians);
    // Screen-space Y points downward: positive incidence raises the nose
    // (left-most vertex). Rotation occurs around the physical centre.
    return points.map(([x,y])=>{
      const dx=x-.55,dy=y-.5;
      return [.55+dx*c-dy*s,.5+dx*s+dy*c];
    });
  }

  fillPolygon(points) {
    const pts = points.map(([x,y]) => [x*this.nx, y*this.ny]);
    for(let y=0;y<this.ny;y++)for(let x=0;x<this.nx;x++){
      let inside=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const ax=pts[i][0],ay=pts[i][1],bx=pts[j][0],by=pts[j][1];
        if(((ay>y)!==(by>y)) && x < (bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
      }
      if(inside)this.solid[y*this.nx+x]=1;
    }
  }

  // Riemann initial-value problem: initially isolated high/low pressure gas.
  // No fictitious force or hand-animated travelling front is introduced.
  // Both sides remain at rest until a real solver step opens the diaphragm.
  loadTube(pressureRatio = 8, split = 0.42) {
    this.resetGas();
    const ratio = clamp(Number.isFinite(pressureRatio) ? pressureRatio : 8, 1.1, 25);
    const xCut = Math.round(clamp(split, .15, .85) * this.nx);
    const density = Math.pow(ratio, 1 / GAMMA);
    for (let y = 0; y < this.ny; y++) {
      for (let x = 0; x < xCut; x++) {
        const i = y * this.nx + x;
        if (this.solid[i]) continue;
        // High pressure only in the sealed working region of the tube.
        if (x < this.nx * .055 || y < this.ny * .20 || y > this.ny * .80) continue;
        const k = i * 4;
        this.U[k] = density;
        this.U[k + 1] = 0;
        this.U[k + 2] = 0;
        this.U[k + 3] = ratio / (GAMMA - 1);
      }
    }
    this.V.set(this.U);
    this.maxPressure = ratio;
    return ratio;
  }

  pulse(x, y, strength = 4.5, radius = 3.4) {
    const rr = radius * radius;
    const left = Math.max(1, Math.floor(x - radius * 3));
    const right = Math.min(this.nx - 2, Math.ceil(x + radius * 3));
    const top = Math.max(1, Math.floor(y - radius * 3));
    const bottom = Math.min(this.ny - 2, Math.ceil(y + radius * 3));
    for (let iy = top; iy <= bottom; iy++) {
      for (let ix = left; ix <= right; ix++) {
        const index = iy * this.nx + ix;
        if (this.solid[index]) continue;
        const d2 = (ix - x) ** 2 + (iy - y) ** 2;
        if (d2 > 9 * rr) continue;
        const impulse = strength * Math.exp(-d2 / (2 * rr));
        const k = index * 4;
        this.U[k] += impulse * 0.06;
        this.U[k + 3] += impulse / (GAMMA - 1);
      }
    }
  }

  sample(x, y) {
    const ix = clamp(Math.round(x), 0, this.nx - 1);
    const iy = clamp(Math.round(y), 0, this.ny - 1);
    const i = ix + iy * this.nx, k = i * 4;
    const a = this.U;
    const rho = Math.max(FLOOR, a[k]);
    const u = a[k + 1] / rho, v = a[k + 2] / rho;
    const p = Math.max(FLOOR, (GAMMA - 1) * (a[k + 3] - .5 * rho * (u*u + v*v)));
    return {rho, pressure:p, mach:Math.hypot(u,v)/Math.sqrt(GAMMA * p / rho), u, v, temperature:p/rho, solid:!!this.solid[i]};
  }

  // HLL is a conservative, approximate Riemann solver. The wall case applies
  // the impermeable slip boundary's normal pressure force.
  interfaceFlux(a, li, ri, axis, out, dest) {
    if (li < 0 && ri < 0) {
      out.fill(0, dest, dest + 4);
      return;
    }
    if (li < 0 || ri < 0) {
      const source = li < 0 ? ri : li;
      const k = source * 4, rho = Math.max(FLOOR, a[k]);
      const vx = a[k+1] / rho, vy = a[k+2] / rho;
      const pressure = Math.max(FLOOR, (GAMMA - 1) * (a[k+3] - .5 * rho * (vx*vx+vy*vy)));
      out[dest] = 0;
      out[dest+1] = axis === 0 ? pressure : 0;
      out[dest+2] = axis === 1 ? pressure : 0;
      out[dest+3] = 0;
      return;
    }
    const l = li * 4, r = ri * 4;
    const rl = Math.max(FLOOR, a[l]), rr = Math.max(FLOOR, a[r]);
    const ul = a[l+1]/rl, vl = a[l+2]/rl, ur = a[r+1]/rr, vr = a[r+2]/rr;
    const pl = Math.max(FLOOR,(GAMMA-1)*(a[l+3]-.5*rl*(ul*ul+vl*vl)));
    const pr = Math.max(FLOOR,(GAMMA-1)*(a[r+3]-.5*rr*(ur*ur+vr*vr)));
    const nl = axis === 0 ? ul : vl, nr = axis === 0 ? ur : vr;
    const al = Math.sqrt(GAMMA * pl / rl), ar = Math.sqrt(GAMMA * pr / rr);
    const sl = Math.min(nl-al, nr-ar), sr = Math.max(nl+al, nr+ar);
    const fl0 = rl*nl, fl1 = a[l+1]*nl + (axis === 0 ? pl : 0);
    const fl2 = a[l+2]*nl + (axis === 1 ? pl : 0);
    const fl3 = (a[l+3]+pl)*nl;
    const fr0 = rr*nr, fr1 = a[r+1]*nr + (axis === 0 ? pr : 0);
    const fr2 = a[r+2]*nr + (axis === 1 ? pr : 0);
    const fr3 = (a[r+3]+pr)*nr;
    if (sl >= 0) {
      out[dest]=fl0; out[dest+1]=fl1; out[dest+2]=fl2; out[dest+3]=fl3;
    } else if (sr <= 0) {
      out[dest]=fr0; out[dest+1]=fr1; out[dest+2]=fr2; out[dest+3]=fr3;
    } else {
      const q = 1/(sr-sl), jump = sl*sr;
      out[dest] = (sr*fl0-sl*fr0+jump*(a[r]-a[l]))*q;
      out[dest+1] = (sr*fl1-sl*fr1+jump*(a[r+1]-a[l+1]))*q;
      out[dest+2] = (sr*fl2-sl*fr2+jump*(a[r+2]-a[l+2]))*q;
      out[dest+3] = (sr*fl3-sl*fr3+jump*(a[r+3]-a[l+3]))*q;
    }
  }

  step() {
    const W=this.nx,H=this.ny,a=this.U,b=this.V,wall=this.solid,fx=this.fx,fy=this.fy;
    let maxRate = 2.4;
    for(let i=0;i<this.size;i++){
      if(wall[i])continue;
      const k=i*4,rho=Math.max(FLOOR,a[k]),u=a[k+1]/rho,v=a[k+2]/rho;
      const p=Math.max(FLOOR,(GAMMA-1)*(a[k+3]-.5*rho*(u*u+v*v)));
      const c=Math.sqrt(GAMMA*p/rho);
      maxRate=Math.max(maxRate,Math.abs(u)+Math.abs(v)+2*c);
    }
    const dt=0.35/maxRate;
    if (this.flowActive) this.setFlowInlet();
    for(let y=0;y<H;y++){
      const row=y*W,off=y*(W+1);
      for(let x=0;x<=W;x++){
        const l=x===0 && this.flowActive ? this.size : row+Math.max(0,x-1);
        const r=row+Math.min(W-1,x);
        this.interfaceFlux(a,(l<this.size&&wall[l])?-1:l,wall[r]?-1:r,0,fx,(off+x)*4);
      }
    }
    for(let y=0;y<=H;y++){
      const top=Math.max(0,y-1)*W,bottom=Math.min(H-1,y)*W;
      for(let x=0;x<W;x++){
        const l=top+x,r=bottom+x;
        this.interfaceFlux(a,wall[l]?-1:l,wall[r]?-1:r,1,fy,(y*W+x)*4);
      }
    }
    let maxP=1,maxM=this.flowActive?this.flowMach:0;
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        const i=y*W+x,k=i*4;
        if(wall[i]){b[k]=1;b[k+1]=0;b[k+2]=0;b[k+3]=2.5;continue;}
        const xl=(y*(W+1)+x)*4,xr=xl+4;
        const yt=(y*W+x)*4,yb=yt+W*4;
        for(let j=0;j<4;j++)b[k+j]=a[k+j]-dt*(fx[xr+j]-fx[xl+j]+fy[yb+j]-fy[yt+j]);
        b[k]=Math.max(FLOOR,b[k]);
        const ke=.5*(b[k+1]*b[k+1]+b[k+2]*b[k+2])/b[k];
        b[k+3]=Math.max(b[k+3],ke+FLOOR/(GAMMA-1));
        const p=(GAMMA-1)*(b[k+3]-ke);
        if(p>maxP)maxP=p;
        const mach=Math.hypot(b[k+1],b[k+2])/Math.sqrt(GAMMA*p*b[k]);
        if(mach>maxM)maxM=mach;
      }
    }
    this.U=b;
    this.V=a;
    this.time+=dt;
    this.maxPressure=maxP;
    this.maxMach=maxM;
    return dt;
  }

  // Centred finite differences of u,v on the actual conserved flow field.
  // Skip derivatives crossing a solid mask to avoid fictitious solid velocity
  // discontinuities and keep vorticity as a diagnostic, not an injection.
  vorticity(x,y) {
    const ix=clamp(Math.round(x),1,this.nx-2),iy=clamp(Math.round(y),1,this.ny-2);
    const i=iy*this.nx+ix, W=this.nx;
    if(this.solid[i])return 0;
    const L=i-1,R=i+1,T=i-W,B=i+W,a=this.U;
    const velocity=(index,component)=>{
      const k=index*4;
      return a[k+component]/Math.max(FLOOR,a[k]);
    };
    let dv_dx=0,du_dy=0;
    if(!this.solid[L]&&!this.solid[R])dv_dx=.5*(velocity(R,2)-velocity(L,2));
    else if(!this.solid[R])dv_dx=velocity(R,2)-velocity(i,2);
    else if(!this.solid[L])dv_dx=velocity(i,2)-velocity(L,2);
    if(!this.solid[T]&&!this.solid[B])du_dy=.5*(velocity(B,1)-velocity(T,1));
    else if(!this.solid[B])du_dy=velocity(B,1)-velocity(i,1);
    else if(!this.solid[T])du_dy=velocity(i,1)-velocity(T,1);
    return dv_dx-du_dy;
  }

  wakeVorticity() {
    const x0=this.bodyBounds ? Math.min(this.nx-2,this.bodyBounds.right+3) : Math.floor(this.nx*.58);
    let sum=0,count=0,peak=0;
    for(let y=2;y<this.ny-2;y+=2)for(let x=x0;x<this.nx-2;x+=2){
      const index=y*this.nx+x;if(this.solid[index])continue;
      const w=this.vorticity(x,y);
      sum+=w*w;peak=Math.max(peak,Math.abs(w));count++;
    }
    return {rms:count?Math.sqrt(sum/count):0,peak};
  }

  // Pressure traction integrated over the staircase body mask. Each
  // face of a solid body cell bordering a fluid cell contributes p*n*ds.
  // Body mask excludes user-drawn walls, avoiding fabricated wing loads.
  // Fx positive downstream (pressure drag), Fy positive downward.
  // Lift is -Fy; coefficients are based on freestream dynamic pressure
  // and projected body chord in grid-cell units. These are approximate,
  // grid-sensitive PRESSURE loads: viscous skin-friction is absent.
  aeroForces() {
    if(!this.flowActive || !this.bodyBounds)return null;
    const W=this.nx,H=this.ny,mask=this.body,solid=this.solid;
    const {left,right,chord}=this.bodyBounds;
    const n=right-left+1;
    const upperSum=new Float64Array(n),lowerSum=new Float64Array(n);
    const upperCount=new Uint16Array(n),lowerCount=new Uint16Array(n);
    let fx=0,fy=0,moment=0,faces=0;
    const cx=left+.25*chord,cy=(this.ny-1)*.5;
    const pressureAt=(i)=>{
      const k=i*4,a=this.U,rho=Math.max(FLOOR,a[k]);
      const kinetic=.5*(a[k+1]**2+a[k+2]**2)/rho;
      return Math.max(FLOOR,(GAMMA-1)*(a[k+3]-kinetic));
    };
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;if(!mask[i])continue;
      const xi=x-left;
      if(x>0 && !solid[i-1]){const force=pressureAt(i-1)-1;fx+=force;moment-=(y-cy)*force;faces++;}
      if(x<W-1 && !solid[i+1]){const force=1-pressureAt(i+1);fx+=force;moment-=(y-cy)*force;faces++;}
      if(y>0 && !solid[i-W]){
        const p=pressureAt(i-W),force=p-1;fy+=force;moment+=(x-cx)*force;faces++;
        upperSum[xi]+=p;upperCount[xi]++;
      }
      if(y<H-1 && !solid[i+W]){
        const p=pressureAt(i+W),force=1-p;fy+=force;moment+=(x-cx)*force;faces++;
        lowerSum[xi]+=p;lowerCount[xi]++;
      }
    }
    const q=.5*GAMMA*this.flowMach*this.flowMach; // rho∞=p∞=1
    const upper=Array.from(upperSum,(v,i)=>upperCount[i]?(v/upperCount[i]-1)/q:null);
    const lower=Array.from(lowerSum,(v,i)=>lowerCount[i]?(v/lowerCount[i]-1)/q:null);
    return {
      cd:fx/(q*chord),cl:-fy/(q*chord),cm:-moment/(q*chord*chord),
      fx,fy,q,chord,faces,upper,lower,
      incidence:this.incidence, mach:this.flowMach,
      type:this.bodyType,time:this.time,
      resolution:[W,H],
    };
  }

  scan() {
    let minP=Infinity,maxP=0,totalMass=0;
    for(let i=0;i<this.size;i++){
      if(this.solid[i])continue;
      const s=this.sample(i%this.nx, Math.floor(i/this.nx));
      minP=Math.min(minP,s.pressure);
      maxP=Math.max(maxP,s.pressure);
      totalMass+=s.rho;
    }
    return {minP,maxP,totalMass,time:this.time};
  }
}
