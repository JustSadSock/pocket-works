const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const v = (x=0,y=0,z=0) => ({x,y,z});
const add = (a,b) => v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub = (a,b) => v(a.x-b.x,a.y-b.y,a.z-b.z);
const scale = (a,s) => v(a.x*s,a.y*s,a.z*s);
const len = (a) => Math.hypot(a.x,a.y,a.z);
const norm = (a) => { const l=len(a)||1; return scale(a,1/l); };
const mix = (a,b,t) => v(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);

function particle(position, invMass=1) {
  return { p:{...position}, prev:{...position}, invMass };
}

function integrate(p, dt, damping=0.965) {
  if (p.invMass === 0) return;
  const vel = scale(sub(p.p,p.prev), damping);
  p.prev = {...p.p};
  p.p = add(p.p, vel);
}

function distanceConstraint(a,b,length,stiffness=1) {
  const delta=sub(b.p,a.p); const d=len(delta); if(d<1e-7) return;
  const error=(d-length)/d; const wa=a.invMass, wb=b.invMass, w=wa+wb; if(w<=0)return;
  const corr=scale(delta,error*stiffness);
  if(wa>0) a.p=add(a.p,scale(corr,wa/w));
  if(wb>0) b.p=sub(b.p,scale(corr,wb/w));
}

function bendConstraint(root,mid,end,minAngle,maxAngle,stiffness=0.72) {
  const a=norm(sub(root.p,mid.p)); const b=norm(sub(end.p,mid.p));
  const dot=clamp(a.x*b.x+a.y*b.y+a.z*b.z,-1,1); const angle=Math.acos(dot);
  if(angle>=minAngle&&angle<=maxAngle)return;
  const target=clamp(angle,minAngle,maxAngle); const amount=(target-angle)*stiffness;
  const axis={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};
  const al=len(axis); if(al<1e-6)return; const n=scale(axis,1/al);
  const r=sub(end.p,mid.p); const c=Math.cos(amount), s=Math.sin(amount);
  const cross={x:n.y*r.z-n.z*r.y,y:n.z*r.x-n.x*r.z,z:n.x*r.y-n.y*r.x};
  const ndot=n.x*r.x+n.y*r.y+n.z*r.z;
  const rotated=add(add(scale(r,c),scale(cross,s)),scale(n,ndot*(1-c)));
  end.p=mix(end.p,add(mid.p,rotated),0.78);
}

export class ConstraintArm {
  constructor({ upper=0.34, lower=0.33, tool=1.04, handed=1 }={}) {
    this.upper=upper; this.lower=lower; this.tool=tool; this.handed=handed;
    this.shoulder=particle(v(),0); this.elbow=particle(v(0.18*handed,-0.16,0.27));
    this.hand=particle(v(0.24*handed,-0.13,0.55)); this.tip=particle(v(0.30*handed,-0.03,1.55));
    this.drive=v(); this.lastDrive=v(); this.energy=0;
  }
  reset(shoulder=v()) {
    this.shoulder.p={...shoulder}; this.shoulder.prev={...shoulder};
    this.elbow.p=add(shoulder,v(0.18*this.handed,-0.16,0.27)); this.elbow.prev={...this.elbow.p};
    this.hand.p=add(shoulder,v(0.24*this.handed,-0.13,0.55)); this.hand.prev={...this.hand.p};
    this.tip.p=add(this.hand.p,v(0.08*this.handed,0.10,1.02)); this.tip.prev={...this.tip.p};
  }
  impulse(vec, amount=1) {
    this.hand.prev=sub(this.hand.prev,scale(vec,amount));
    this.tip.prev=sub(this.tip.prev,scale(vec,amount*1.22));
  }
  step({ shoulder, guardHand, guardTip, drive=v(), brace=0.55, dt=1/60, iterations=7 }) {
    this.shoulder.p={...shoulder}; this.shoulder.prev={...shoulder};
    integrate(this.elbow,dt,0.972); integrate(this.hand,dt,0.966); integrate(this.tip,dt,0.974);
    const driveDelta=sub(drive,this.lastDrive); this.lastDrive={...drive};
    const energy=clamp(len(drive)*0.12+len(driveDelta)*0.24,0,1); this.energy=energy;
    const slow=1-energy;
    this.hand.p=add(this.hand.p,scale(sub(guardHand,this.hand.p),(0.055+slow*0.14)*brace));
    this.tip.p=add(this.tip.p,scale(sub(guardTip,this.tip.p),(0.025+slow*0.075)*brace));
    this.hand.p=add(this.hand.p,scale(drive,0.016+energy*0.018));
    this.tip.p=add(this.tip.p,scale(drive,0.022+energy*0.030));
    this.tip.p.z += energy*0.014;
    for(let i=0;i<iterations;i++) {
      distanceConstraint(this.shoulder,this.elbow,this.upper,1);
      distanceConstraint(this.elbow,this.hand,this.lower,1);
      distanceConstraint(this.hand,this.tip,this.tool,1);
      bendConstraint(this.shoulder,this.elbow,this.hand,0.28,2.55,0.74);
      // keep the hand from crossing behind the shoulder or too close to the torso
      const rel=sub(this.hand.p,this.shoulder.p);
      if(rel.z < 0.04) this.hand.p.z += (0.04-rel.z)*0.72;
      const radial=Math.hypot(rel.x,rel.y);
      if(radial < 0.11) this.hand.p.x += this.handed*(0.11-radial)*0.65;
    }
    return this.pose();
  }
  pose() {
    return {
      shoulder:{...this.shoulder.p}, elbow:{...this.elbow.p}, hand:{...this.hand.p}, tip:{...this.tip.p},
      upperLength:len(sub(this.elbow.p,this.shoulder.p)), lowerLength:len(sub(this.hand.p,this.elbow.p)), toolLength:len(sub(this.tip.p,this.hand.p)), energy:this.energy
    };
  }
}

export function vec3(x=0,y=0,z=0){return v(x,y,z);} 
