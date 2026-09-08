import { AnimationGroup, Bone, Color3, Material, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene, SceneLoader, Space, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { FlightInput, FlightState } from './core';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const damp=(a:number,b:number,s:number,dt:number)=>a+(b-a)*(1-Math.exp(-s*dt));

export class DragonRig{
  readonly root:TransformNode;readonly visual:TransformNode;meshes:Mesh[]=[];groups=new Map<string,AnimationGroup>();bones=new Map<string,Bone>();ready=false;usedFallback=false;
  private tailLag=0;private neckYaw=0;private wingFlex=0;private lastRoll=0;private recoil=0;private legTuck=.72;
  private divePose=0;private climbPose=0;private brakePose=0;
  constructor(private scene:Scene){this.root=new TransformNode('DragonRoot',scene);this.visual=new TransformNode('DragonVisual',scene);this.visual.parent=this.root;}
  async load(onProgress?:(p:number)=>void){
    try{
      const r=await SceneLoader.ImportMeshAsync(null,'./models/','dragon.glb',this.scene,evt=>{if(onProgress&&evt.lengthComputable)onProgress(evt.loaded/Math.max(1,evt.total));});
      this.meshes=r.meshes.filter((m):m is Mesh=>m instanceof Mesh);
      for(const m of this.meshes){
        if(!m.parent||!r.meshes.includes(m.parent as any))m.parent=this.visual;
        const lower=m.name.toLowerCase();
        if(m.material instanceof PBRMaterial){
          const mat=m.material;mat.metallic=Math.min(mat.metallic??0,.02);mat.roughness=Math.max(mat.roughness??.64,.64);mat.environmentIntensity=.94;
          if(mat.albedoTexture)mat.albedoTexture.level=.17;mat.emissiveColor=new Color3(.010,.014,.008);
          if(lower.includes('wingmembrane')){mat.albedoColor=new Color3(.34,.17,.105);mat.roughness=.80;mat.emissiveColor=new Color3(.018,.007,.004);}
          else if(lower.includes('muzzle')||lower.includes('belly')){mat.albedoColor=new Color3(.50,.40,.22);mat.roughness=.76;mat.emissiveColor=new Color3(.010,.007,.003);}
          else if(lower.includes('horn')||lower.includes('claw')||lower.includes('jaw')){mat.albedoColor=new Color3(.24,.21,.15);mat.roughness=.72;}
          else if(lower.includes('dorsal')||lower.includes('brow')){mat.albedoColor=new Color3(.19,.32,.22);mat.roughness=.74;mat.emissiveColor=new Color3(.007,.012,.007);}
          else if(lower.includes('eye')){mat.albedoColor=new Color3(.90,.42,.06);mat.emissiveColor=new Color3(.42,.10,.012);mat.roughness=.32;}
          else if(lower.includes('body')||lower.includes('chest')||lower.includes('neck')||lower.includes('tail')||lower.includes('wingarm')){mat.albedoColor=new Color3(.53,.67,.45);mat.roughness=.70;mat.emissiveColor=new Color3(.020,.028,.016);}
        }
        if(lower.includes('wingmembrane')&&m.material){const mat=m.material as Material & {twoSidedLighting?:boolean};mat.backFaceCulling=false;mat.alpha=Math.max(.97,mat.alpha);if('twoSidedLighting' in mat)mat.twoSidedLighting=true;}
      }
      for(const g of r.animationGroups){this.groups.set(g.name.toLowerCase(),g);g.start(true,1);g.setWeightForAllAnimatables(g.name.toLowerCase()==='glide'?1:0);}
      for(const s of r.skeletons)for(const b of s.bones)this.bones.set(b.name,b);
      this.visual.scaling.set(1.12,1.12,1.28);this.visual.rotationQuaternion=Quaternion.Identity();this.ready=true;
    }catch(err){console.warn('AETHERWING dragon GLB fallback',err);this.createFallback();this.usedFallback=true;this.ready=true;}
  }
  update(s:FlightState,input:FlightInput,dt:number){
    this.root.position.set(s.position.x,s.position.y,s.position.z);this.root.rotationQuaternion=Quaternion.RotationYawPitchRoll(s.yaw,s.pitch,-s.roll);
    const diveTarget=clamp((-s.pitch-.045)*3.35+clamp((-s.verticalSpeed-1)/16,0,.68),0,1);
    const climbTarget=clamp((s.pitch-.018)*3.15+clamp((s.verticalSpeed-.5)/13,0,.64),0,1);
    const diveRate=diveTarget>this.divePose?4.8:1.15,climbRate=climbTarget>this.climbPose?4.5:1.05,brakeRate=input.brake>this.brakePose?6.5:1.45;
    this.divePose=damp(this.divePose,diveTarget,diveRate,dt);this.climbPose=damp(this.climbPose,climbTarget,climbRate,dt);this.brakePose=damp(this.brakePose,input.brake,brakeRate,dt);
    const dive=this.divePose,climb=this.climbPose,brake=this.brakePose,flap=clamp(s.flap*1.18-dive*.45,0,1),glide=clamp(1-Math.max(flap*.74,dive,climb*.84,brake),0,1);
    const weights:{[k:string]:number}={glide,flap,climb,dive,brake};const total=Object.values(weights).reduce((a,b)=>a+b,0)||1;for(const [name,g] of this.groups){const k=name.includes('flap')?'flap':name.includes('climb')?'climb':name.includes('dive')?'dive':name.includes('brake')?'brake':'glide';g.setWeightForAllAnimatables(weights[k]/total);}

    const rollAccel=(s.roll-this.lastRoll)/Math.max(dt,.001);this.lastRoll=s.roll;this.tailLag=damp(this.tailLag,-s.yawRate*1.02-rollAccel*.095,3.6,dt);this.neckYaw=damp(this.neckYaw,s.yawRate*.38+input.x*.09,5.2,dt);this.wingFlex=damp(this.wingFlex,(s.load-1)*.14+brake*.36,4.4,dt);this.recoil=damp(this.recoil,Math.max(0,Math.sin(s.flapPhase))*s.flap*.12,8,dt);this.legTuck=damp(this.legTuck,clamp(.76+dive*.22+Math.min(1,s.speed/80)*.07-brake*.48,0.24,.98),4.7,dt);
    this.setBone('Tail1',0,this.tailLag*.28,0);this.setBone('Tail2',0,this.tailLag*.43,0);this.setBone('Tail3',0,this.tailLag*.58,0);this.setBone('Tail4',0,this.tailLag*.72,0);
    this.setBone('Neck1',climb*.055-dive*.040,-this.neckYaw*.35,0);this.setBone('Neck2',climb*.085-dive*.070,-this.neckYaw*.56,0);this.setBone('Head',clamp(-s.pitch*.20+climb*.080-dive*.050,-.17,.20),-this.neckYaw*.34,0);

    const flapBeat=Math.max(0,Math.sin(s.flapPhase));
    const amount=brake*.78+climb*(.34+.55*flapBeat)-dive*.25;
    const fold=dive*1.65-brake*.43-climb*.14;
    const twist=brake*.24-dive*.095+climb*.065;
    const pose=Math.max(dive,climb*.88,brake);
    if(pose>.025){
      for(const [sideName,side] of [['L',-1],['R',1]] as const){
        this.setBone(`Wing${sideName}1`,side*(-.10+amount*.62),fold*.22,side*(.04+twist));
        this.setBone(`Wing${sideName}2`,side*(-.06+amount*.42),fold*.34,side*(-.05+twist*.45));
        this.setBone(`Wing${sideName}3`,side*(-.03+amount*.22),fold*.48+this.wingFlex*.10,side*(-.08+twist*.25));
      }
    }else{this.setBone('WingL3',0,0,-this.wingFlex);this.setBone('WingR3',0,0,this.wingFlex);}

    const frontUpper=.52*this.legTuck,frontLower=-.78*this.legTuck,hindUpper=-.42*this.legTuck,hindLower=.72*this.legTuck;
    this.setBone('FrontUpperL',frontUpper,0,.05);this.setBone('FrontUpperR',frontUpper,0,-.05);this.setBone('FrontLowerL',frontLower,0,0);this.setBone('FrontLowerR',frontLower,0,0);this.setBone('HindUpperL',hindUpper,0,.08);this.setBone('HindUpperR',hindUpper,0,-.08);this.setBone('HindLowerL',hindLower,0,0);this.setBone('HindLowerR',hindLower,0,0);
    this.visual.position.y=-this.recoil*.72-brake*.20;
  }
  private setBone(name:string,x:number,y:number,z:number){const b=this.bones.get(name);if(!b)return;try{b.setRotation(new Vector3(x,y,z),Space.LOCAL);}catch{/* authored animation remains valid if a browser rejects runtime bone mutation */}}
  private createFallback(){const mat=new PBRMaterial('fallbackDragonMat',this.scene);mat.albedoColor=new Color3(.30,.48,.32);mat.metallic=.02;mat.roughness=.68;const body=MeshBuilder.CreateCapsule('FallbackDragonBody',{height:10,radius:1.35,tessellation:18},this.scene);body.rotation.x=Math.PI/2;body.material=mat;body.parent=this.visual;this.meshes.push(body);const head=MeshBuilder.CreateIcoSphere('FallbackDragonHead',{radius:1.2,subdivisions:2},this.scene);head.position.z=5.2;head.scaling.set(1,.8,1.35);head.material=mat;head.parent=this.visual;this.meshes.push(head);for(const side of [-1,1]){const wing=MeshBuilder.CreateCylinder(`FallbackWing${side}`,{height:7,diameterTop:.22,diameterBottom:.65,tessellation:8},this.scene);wing.rotation.z=Math.PI/2;wing.rotation.y=side*.22;wing.position.set(side*3.4,.25,-.2);wing.scaling.x=1.6;wing.material=mat;wing.parent=this.visual;this.meshes.push(wing);}this.visual.rotationQuaternion=Quaternion.Identity();}
}
