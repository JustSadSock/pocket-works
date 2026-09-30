import { AbstractMesh, AnimationGroup, Observer, PBRMaterial, Quaternion, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { CrowState, Controls } from './flight';
const mix = (a:number,b:number,k:number,dt:number)=>a+(b-a)*(1-Math.exp(-k*dt));
/** Authored feather geometry and armature; animation weights are state driven.
 * Head/tail deltas are applied after animation evaluation, never accumulated.
 */
export class CrowRig {
 root:TransformNode; meshes:AbstractMesh[]=[]; ready=false;
 private groups=new Map<string,AnimationGroup>();
 private weights=new Map<string,number>();
 private joints=new Map<string,TransformNode>();
 private elapsed=0; private headYaw=0; private headPitch=0; private tail=0; private bank=0;
 private state?:CrowState; private before?:Observer<Scene>; private after?:Observer<Scene>; private preen=false;
 // Keep the evaluated authored pose separate from procedural deltas. Restoring it
 // before the next evaluation also covers paused/zero-weight animation targets.
 private secondaryBases=new Map<TransformNode,Quaternion>();
 private secondaryDelta=new Quaternion();
 constructor(private scene:Scene){this.root=new TransformNode('living-raven',scene);}
 async load():Promise<void>{
  const result=await SceneLoader.ImportMeshAsync('', './models/', 'crow.glb', this.scene);
  if(!result.skeletons.length || !result.animationGroups.length) throw new Error('Corvus authored armature/animation asset is missing');
  this.meshes=result.meshes;
  for(const mesh of result.meshes){if(!mesh.parent)mesh.parent=this.root; mesh.isPickable=false; mesh.receiveShadows=true;}
  for(const material of this.scene.materials){if(material instanceof PBRMaterial && /feather|Obsidian|Horn/.test(material.name)){material.environmentIntensity=.75;material.directIntensity=1.15;}}
  for(const node of result.transformNodes)this.joints.set(node.name,node);
  for(const skeleton of result.skeletons)for(const bone of skeleton.bones){const node=bone.getTransformNode();if(node)this.joints.set(bone.name,node);}
  for(const group of result.animationGroups){
   const name=group.name.replace(/^.*\|/,''); this.groups.set(name,group);this.weights.set(name,name==='Idle'?1:0);
   group.start(true,1,group.from,group.to);group.setWeightForAllAnimatables(name==='Idle'?1:0);
  }
  this.before=this.scene.onBeforeAnimationsObservable.add(()=>{
   for(const [joint,base] of this.secondaryBases)joint.rotationQuaternion?.copyFrom(base);
   this.secondaryBases.clear();
  });
  this.after=this.scene.onAfterAnimationsObservable.add(()=>this.secondary());
  this.ready=true;
 }
 update(s:CrowState,controls:Controls,dt:number,lookTarget?:Vector3):void{
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  this.state=s;this.elapsed+=dt;this.root.position.set(s.position.x,s.position.y,s.position.z);
  // Babylon's positive X rotation looks down, flight's positive pitch climbs.
  this.root.rotationQuaternion=Quaternion.FromEulerAngles(-s.pitch,s.yaw,s.roll);
  this.bank=mix(this.bank,controls.turn,5,dt);
  if(s.mode==='idle' && this.elapsed%19>14)this.preen=true;else this.preen=false;
  let selected=s.mode==='walk'||s.mode==='run'?'Walk':s.mode==='stunned'?'Hit':s.mode==='brake'||s.mode==='land'?'Brake':s.grounded?(this.preen?'Preen':'Idle'):s.flap>.25?'Flap':'Glide';
  for(const [name,group] of this.groups){
   let target=name===selected?1:0;
   if(!s.grounded && s.mode!=='stunned' && s.mode!=='brake' && s.mode!=='land'){
    const flap=Math.max(0,Math.min(1,(s.flap-.08)/.72)); target=name==='Flap'?flap:name==='Glide'?1-flap:0;
   }
   const w=mix(this.weights.get(name)||0,target,s.mode==='stunned'?14:8,dt);this.weights.set(name,w);group.setWeightForAllAnimatables(w);
   group.speedRatio=name==='Walk'?Math.max(.55,s.speed/.8):name==='Flap'?(.9+s.flap*.25):1;
  }
  let yaw=Math.sin(this.elapsed*.6)*.32,pitch=Math.sin(this.elapsed*.43)*.08;
  if(lookTarget){
   const dx=lookTarget.x-s.position.x,dz=lookTarget.z-s.position.z;
   let local=Math.atan2(dx,dz)-s.yaw;local=Math.atan2(Math.sin(local),Math.cos(local));
   yaw=Math.max(-1,Math.min(1,local));pitch=Math.max(-.5,Math.min(.5,Math.atan2(lookTarget.y-s.position.y,Math.hypot(dx,dz))));
  }else if(!s.grounded){yaw=this.bank*.28;pitch=-s.pitch*.15;}
  this.headYaw=mix(this.headYaw,yaw,s.grounded?11:5,dt);this.headPitch=mix(this.headPitch,pitch,7,dt);
  this.tail=mix(this.tail,controls.brake*.3+controls.pitch*.12,5,dt);
 }
 private secondary():void{
  if(!this.ready||!this.state)return;
  const add=(name:string,x:number,y:number,z:number)=>{
   const joint=this.joints.get(name);if(!joint)return;
   if(!joint.rotationQuaternion)joint.rotationQuaternion=Quaternion.FromEulerAngles(joint.rotation.x,joint.rotation.y,joint.rotation.z);
   let base=this.secondaryBases.get(joint);
   if(!base){base=joint.rotationQuaternion.clone();this.secondaryBases.set(joint,base);}
   Quaternion.FromEulerAnglesToRef(x,y,z,this.secondaryDelta);
   base.multiplyToRef(this.secondaryDelta,joint.rotationQuaternion);
   joint.rotationQuaternion.normalize();
  };
  // Bones have Blender-local rotations baked through the glTF parent conversion.
  add('Head',-this.headPitch,0,-this.headYaw);add('Tail',this.tail,0,this.bank*.13);
  const shimmer=Math.sin(this.elapsed*10)*.009*Math.min(1,this.state.speed/9);
  add('Wrist.L',shimmer,0,-this.bank*.035);add('Wrist.R',-shimmer,0,-this.bank*.035);
 }
 dispose():void{
  if(this.before)this.scene.onBeforeAnimationsObservable.remove(this.before);
  if(this.after)this.scene.onAfterAnimationsObservable.remove(this.after);
  this.secondaryBases.clear();
  for(const g of this.groups.values())g.dispose();this.root.dispose(false,true);this.ready=false;
 }
}
