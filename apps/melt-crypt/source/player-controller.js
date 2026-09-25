import { Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';

export class CapsuleController {
  constructor(camera, getColliders) {
    this.camera=camera;
    this.getColliders=getColliders;
    this.position=new Vector3(0,0,0);
    this.radius=0.34;
    this.height=1.72;
    this.eyeHeight=1.58;
    this.stepHeight=0.34;
    this.velocity=new Vector3();
    this.grounded=true;
  }

  teleport(x,z,y=0){
    this.position.set(x,y,z);
    this.syncCamera();
  }

  syncCamera(bob=0){
    this.camera.position.set(this.position.x,this.position.y+this.eyeHeight+bob,this.position.z);
  }

  overlapsAt(x,z,footY=this.position.y){
    const headY=footY+this.height;
    for(const box of this.getColliders?.()||[]){
      if(headY<=box.minY||footY>=box.maxY) continue;
      const nx=clamp(x,box.minX,box.maxX);
      const nz=clamp(z,box.minZ,box.maxZ);
      const dx=x-nx,dz=z-nz;
      if(dx*dx+dz*dz<this.radius*this.radius) return box;
    }
    return null;
  }

  moveSingle(dx,dz){
    if(!dx&&!dz)return;
    const oldX=this.position.x,oldZ=this.position.z,oldY=this.position.y;
    const targetX=oldX+dx,targetZ=oldZ+dz;

    const tryStep=(x,z)=>{
      const hit=this.overlapsAt(x,z,oldY);
      if(!hit)return{ok:true,y:oldY};
      if(hit.maxY<=oldY+this.stepHeight+0.02){
        const steppedY=hit.maxY+0.015;
        if(!this.overlapsAt(x,z,steppedY))return{ok:true,y:steppedY};
      }
      return{ok:false,y:oldY};
    };

    let test=tryStep(targetX,targetZ);
    if(test.ok){
      this.position.set(targetX,test.y,targetZ);
      return;
    }

    test=tryStep(targetX,oldZ);
    if(test.ok){this.position.x=targetX;this.position.y=test.y;}
    test=tryStep(this.position.x,targetZ);
    if(test.ok){this.position.z=targetZ;this.position.y=Math.max(this.position.y,test.y);}

    if(this.position.y>0&&!this.overlapsAt(this.position.x,this.position.z,Math.max(0,this.position.y-this.stepHeight))){
      this.position.y=Math.max(0,this.position.y-this.stepHeight);
    }
  }

  movePlanar(dx,dz){
    const distance=Math.hypot(dx,dz);
    if(distance<=0)return;
    const maxStep=Math.max(0.08,this.radius*0.58);
    const steps=Math.max(1,Math.ceil(distance/maxStep));
    for(let i=0;i<steps;i+=1)this.moveSingle(dx/steps,dz/steps);
  }

  nudge(direction,amount){
    const d=direction.clone();
    d.y=0;
    if(d.lengthSquared()>0.0001)d.normalize();
    this.movePlanar(d.x*amount,d.z*amount);
  }
}
