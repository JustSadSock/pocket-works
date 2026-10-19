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
    this.U = new Float32Array(this.size * 4);
    this.V = new Float32Array(this.size * 4);
    this.fx = new Float32Array((nx + 1) * ny * 4);
    this.fy = new Float32Array(nx * (ny + 1) * 4);
    this.time = 0;
    this.maxPressure = 1;
    this.resetGas();
  }

  resetGas() {
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

  geometry(preset) {
    this.solid.fill(0);
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
    } else if (preset === 'channel') {
      line(0.2, 0.26, 0.48, 0.26, 1.65);
      line(0.2, 0.74, 0.48, 0.74, 1.65);
      line(0.48, 0.26, 0.69, 0.44, 1.65);
      line(0.48, 0.74, 0.69, 0.56, 1.65);
      line(0.69, 0.44, 0.93, 0.28, 1.65);
      line(0.69, 0.56, 0.93, 0.72, 1.65);
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
    return {rho, pressure:p, mach:Math.hypot(u,v)/Math.sqrt(GAMMA * p / rho), solid:!!this.solid[i]};
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
    for(let y=0;y<H;y++){
      const row=y*W,off=y*(W+1);
      for(let x=0;x<=W;x++){
        const l=row+Math.max(0,x-1),r=row+Math.min(W-1,x);
        this.interfaceFlux(a,wall[l]?-1:l,wall[r]?-1:r,0,fx,(off+x)*4);
      }
    }
    for(let y=0;y<=H;y++){
      const top=Math.max(0,y-1)*W,bottom=Math.min(H-1,y)*W;
      for(let x=0;x<W;x++){
        const l=top+x,r=bottom+x;
        this.interfaceFlux(a,wall[l]?-1:l,wall[r]?-1:r,1,fy,(y*W+x)*4);
      }
    }
    let maxP=1;
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
      }
    }
    this.U=b;
    this.V=a;
    this.time+=dt;
    this.maxPressure=maxP;
    return dt;
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
