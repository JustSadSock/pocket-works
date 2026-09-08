import { AnimationGroup, Bone, Color3, Material, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene, SceneLoader, Space, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { FlightInput, FlightState } from './core';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const damp=(a:number,b:number,s:number,dt:number)=>a+(b-a)*(1-Math.exp(-s*dt));

export class DragonRig{
  readonly root:TransformNode;readonly visual:TransformNode;meshes:Mesh[]=[];groups=new Map<string,AnimationGroup>();bones=new Map<string,Bone>();ready=false;usedFallback=false;
  private tailLag=0;private neckYaw=0;private wingFlex=0;private lastRoll=0;private recoil=0;private legTuck=.72;
  private divePose=0;private climbPose=0;private brakePose=0;private flapBeat=0;private flightPitch=0;
  constructor(private scene:Scene){
    this.root=new TransformNode('DragonRoot',scene);this.visual=new TransformNode('DragonVisual',scene);this.visual.parent=this.root;
    // Scene.render() evaluates AnimationGroups after the gameplay update. Apply
    // aerodynamic secondary motion afterwards so Blender clips remain the base
    // pose and procedural wing/tail/neck motion is truly additive instead of
    // being overwritten by the animation engine later in the same frame.
    scene.onBeforeRenderObservable.add(()=>this.applyProceduralPose());
  }
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
    const diveTarget=clamp((-s.pitch-.045)*3.15+clamp((-s.verticalSpeed-1.5)/16,0,.70),0,1);
    const climbTarget=clamp((s.pitch-.018)*3.0+clamp((s.verticalSpeed-.5)/13,0,.64),0,1);
    // Fast attack + slower release makes the posture linger after the control
    // gesture, which visually communicates inertia rather than clip switching.
    this.divePose=damp(this.divePose,diveTarget,diveTarget>this.divePose?5.4:2.15,dt);
    this.climbPose=damp(this.climbPose,climbTarget,climbTarget>this.climbPose?4.8:1.95,dt);
    this.brakePose=damp(this.brakePose,input.brake,input.brake>this.brakePose?7.2:2.65,dt);
    const dive=this.divePose,climb=this.climbPose,brake=this.brakePose,flap=clamp(s.flap*1.16-dive*.42,0,1),glide=clamp(1-Math.max(flap*.78,dive*.96,climb*.76,brake),0,1);
    const weights:{[k:string]:number}={glide,flap,climb,dive,brake};const total=Object.values(weights).reduce((a,b)=>a+b,0)||1;
    for(const [name,g] of this.groups){const k=name.includes('flap')?'flap':name.includes('climb')?'climb':name.includes('dive')?'dive':name.includes('brake')?'brake':'glide';g.setWeightForAllAnimatables(weights[k]/total);}

    const rollAccel=(s.roll-this.lastRoll)/Math.max(dt,.001);this.lastRoll=s.roll;
    this.tailLag=damp(this.tailLag,-s.yawRate*1.04-rollAccel*.105,3.55,dt);
    this.neckYaw=damp(this.neckYaw,s.yawRate*.40+input.x*.10,5.0,dt);
    this.wingFlex=damp(this.wingFlex,(s.load-1)*.15+brake*.38,4.25,dt);
    this.recoil=damp(this.recoil,Math.max(0,Math.sin(s.flapPhase))*s.flap*.13,8,dt);
    this.legTuck=damp(this.legTuck,clamp(.76+dive*.21+Math.min(1,s.speed/80)*.07-brake*.50,0.24,.98),4.7,dt);
    this.flapBeat=Math.max(0,Math.sin(s.flapPhase));this.flightPitch=s.pitch;
    this.visual.position.y=-this.recoil*.72-brake*.17;
  }
  private applyProceduralPose(){
    if(!this.ready||this.usedFallback)return;
    const dive=this.divePose,climb=this.climbPose,brake=this.brakePose;
    // Tail and neck are delayed stabilizers. These deltas are applied after the
    // authored clip, preserving small Blender motion underneath them.
    this.addBone('Tail1',0,this.tailLag*.22,0);this.addBone('Tail2',0,this.tailLag*.34,0);this.addBone('Tail3',0,this.tailLag*.47,0);this.addBone('Tail4',0,this.tailLag*.60,0);
    this.addBone('Neck1',climb*.032-dive*.022,-this.neckYaw*.28,0);this.addBone('Neck2',climb*.052-dive*.038,-this.neckYaw*.43,0);
    this.addBone('Head',clamp(-this.flightPitch*.12+climb*.050-dive*.030,-.11,.13),-this.neckYaw*.26,0);

    // State silhouette: a dive sweeps the wing backwards and progressively folds
    // distal sections; braking does the inverse and cups the membrane into the
    // airflow; climb adds an asymmetric power-stroke on top of the authored flap.
    const power=climb*(.10+.34*this.flapBeat);
    const spread=brake*.46+power;
    const sweep=dive*.72-brake*.15-climb*.045;
    const cup=brake*.25+climb*.045-dive*.05;
    for(const [sideName,side] of [['L',-1],['R',1]] as const){
      this.addBone(`Wing${sideName}1`,side*(spread*.36-dive*.16),sweep*.18,side*(cup*.58));
      this.addBone(`Wing${sideName}2`,side*(spread*.28-dive*.22),sweep*.42,side*(cup*.34-dive*.035));
      this.addBone(`Wing${sideName}3`,side*(spread*.16-dive*.30),sweep*.68,side*(cup*.18-dive*.075)+side*this.wingFlex*.12);
    }

    const frontUpper=.14*this.legTuck,frontLower=-.18*this.legTuck,hindUpper=-.12*this.legTuck,hindLower=.16*this.legTuck;
    this.addBone('FrontUpperL',frontUpper,0,.02);this.addBone('FrontUpperR',frontUpper,0,-.02);this.addBone('FrontLowerL',frontLower,0,0);this.addBone('FrontLowerR',frontLower,0,0);
    this.addBone('HindUpperL',hindUpper,0,.025);this.addBone('HindUpperR',hindUpper,0,-.025);this.addBone('HindLowerL',hindLower,0,0);this.addBone('HindLowerR',hindLower,0,0);
  }
  private addBone(name:string,x:number,y:number,z:number){
    const b=this.bones.get(name);if(!b)return;
    try{const r=b.getRotation(Space.LOCAL);b.setRotation(new Vector3(r.x+x,r.y+y,r.z+z),Space.LOCAL);}catch{/* authored animation remains valid if a browser rejects runtime bone mutation */}
  }
  private createFallback(){const mat=new PBRMaterial('fallbackDragonMat',this.scene);mat.albedoColor=new Color3(.30,.48,.32);mat.metallic=.02;mat.roughness=.68;const body=MeshBuilder.CreateCapsule('FallbackDragonBody',{height:10,radius:1.35,tessellation:18},this.scene);body.rotation.x=Math.PI/2;body.material=mat;body.parent=this.visual;this.meshes.push(body);const head=MeshBuilder.CreateIcoSphere('FallbackDragonHead',{radius:1.2,subdivisions:2},this.scene);head.position.z=5.2;head.scaling.set(1,.8,1.35);head.material=mat;head.parent=this.visual;this.meshes.push(head);for(const side of [-1,1]){const wing=MeshBuilder.CreateCylinder(`FallbackWing${side}`,{height:7,diameterTop:.22,diameterBottom:.65,tessellation:8},this.scene);wing.rotation.z=Math.PI/2;wing.rotation.y=side*.22;wing.position.set(side*3.4,.25,-.2);wing.scaling.x=1.6;wing.material=mat;wing.parent=this.visual;this.meshes.push(wing);}this.visual.rotationQuaternion=Quaternion.Identity();}
}
