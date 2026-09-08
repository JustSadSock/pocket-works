import { AnimationGroup, Bone, Color3, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene, SceneLoader, Space, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { FlightInput, FlightState } from './core';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const damp=(a:number,b:number,s:number,dt:number)=>a+(b-a)*(1-Math.exp(-s*dt));

export class DragonRig{
  readonly root:TransformNode; readonly visual:TransformNode; meshes:Mesh[]=[]; groups=new Map<string,AnimationGroup>(); bones=new Map<string,Bone>(); ready=false; usedFallback=false;
  private tailLag=0; private neckYaw=0; private wingFlex=0; private lastRoll=0; private recoil=0;
  constructor(private scene:Scene){this.root=new TransformNode('DragonRoot',scene);this.visual=new TransformNode('DragonVisual',scene);this.visual.parent=this.root;}
  async load(onProgress?:(p:number)=>void){
    try{
      const r=await SceneLoader.ImportMeshAsync(null,'./models/','dragon.glb',this.scene,evt=>{if(onProgress&&evt.lengthComputable)onProgress(evt.loaded/Math.max(1,evt.total));});
      this.meshes=r.meshes.filter((m):m is Mesh=>m instanceof Mesh);
      for(const m of r.meshes)if(!m.parent||!r.meshes.includes(m.parent as any))m.parent=this.visual;
      for(const g of r.animationGroups){this.groups.set(g.name.toLowerCase(),g);g.start(true,1);g.setWeightForAllAnimatables(g.name.toLowerCase()==='glide'?1:0);}
      for(const s of r.skeletons)for(const b of s.bones)this.bones.set(b.name,b);
      this.visual.scaling.setAll(1.0);this.visual.rotationQuaternion=Quaternion.RotationYawPitchRoll(Math.PI,0,0);
      this.ready=true;
    }catch(err){console.warn('AETHERWING dragon GLB fallback',err);this.createFallback();this.usedFallback=true;this.ready=true;}
  }
  update(s:FlightState,input:FlightInput,dt:number){
    this.root.position.set(s.position.x,s.position.y,s.position.z);this.root.rotationQuaternion=Quaternion.RotationYawPitchRoll(s.yaw,s.pitch,-s.roll);
    const dive=clamp((-s.pitch-.15)*1.7,0,1),climb=clamp((s.pitch-.08)*1.8,0,1),brake=input.brake,flap=clamp(s.flap*1.15-dive*.28,0,1),glide=clamp(1-Math.max(flap*.82,dive,climb*.55,brake),0,1);
    const weights:{[k:string]:number}={glide,flap,climb,dive,brake};let total=Object.values(weights).reduce((a,b)=>a+b,0)||1;for(const [name,g] of this.groups){const k=name.includes('flap')?'flap':name.includes('climb')?'climb':name.includes('dive')?'dive':name.includes('brake')?'brake':'glide';g.setWeightForAllAnimatables(weights[k]/total);}
    const rollAccel=(s.roll-this.lastRoll)/Math.max(dt,.001);this.lastRoll=s.roll;this.tailLag=damp(this.tailLag,-s.yawRate*.9-rollAccel*.08,3.8,dt);this.neckYaw=damp(this.neckYaw,s.yawRate*.34+input.x*.08,5,dt);this.wingFlex=damp(this.wingFlex,(s.load-1)*.12+brake*.25,4.2,dt);this.recoil=damp(this.recoil,Math.max(0,Math.sin(s.flapPhase))*s.flap*.11,8,dt);
    this.setBone('Tail1',0,this.tailLag*.28,0);this.setBone('Tail2',0,this.tailLag*.42,0);this.setBone('Tail3',0,this.tailLag*.55,0);this.setBone('Tail4',0,this.tailLag*.65,0);
    this.setBone('Neck1',0,-this.neckYaw*.35,0);this.setBone('Neck2',0,-this.neckYaw*.55,0);this.setBone('Head',clamp(-s.pitch*.16,-.12,.13),-this.neckYaw*.32,0);
    this.setBone('WingL3',0,0,-this.wingFlex);this.setBone('WingR3',0,0,this.wingFlex);this.visual.position.y=-this.recoil*.75;
  }
  private setBone(name:string,x:number,y:number,z:number){const b=this.bones.get(name);if(!b)return;try{b.setRotation(new Vector3(x,y,z),Space.LOCAL);}catch{/* animation remains valid if browser implementation rejects runtime bone mutation */}}
  private createFallback(){
    const mat=new PBRMaterial('fallbackDragonMat',this.scene);mat.albedoColor=new Color3(.22,.38,.27);mat.metallic=.04;mat.roughness=.58;
    const body=MeshBuilder.CreateCapsule('FallbackDragonBody',{height:10,radius:1.35,tessellation:18},this.scene);body.rotation.x=Math.PI/2;body.material=mat;body.parent=this.visual;this.meshes.push(body);
    const head=MeshBuilder.CreateIcoSphere('FallbackDragonHead',{radius:1.2,subdivisions:2},this.scene);head.position.z=5.2;head.scaling.set(1,.8,1.35);head.material=mat;head.parent=this.visual;this.meshes.push(head);
    for(const side of [-1,1]){const wing=MeshBuilder.CreateCylinder(`FallbackWing${side}`,{height:7,diameterTop:.22,diameterBottom:.65,tessellation:8},this.scene);wing.rotation.z=Math.PI/2;wing.rotation.y=side*.22;wing.position.set(side*3.4,.25,-.2);wing.scaling.x=1.6;wing.material=mat;wing.parent=this.visual;this.meshes.push(wing);}this.visual.rotationQuaternion=Quaternion.RotationYawPitchRoll(Math.PI,0,0);
  }
}
