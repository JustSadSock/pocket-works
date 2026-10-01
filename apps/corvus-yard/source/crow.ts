import { AbstractMesh, AnimationGroup, Matrix, Observer, PBRMaterial, Quaternion, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
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
 private elapsed=0; private idleAge=0; private lastMode="idle"; private gestureUntil=0; private gesture="Idle"; private headYaw=0; private headPitch=0; private tail=0; private bank=0;
 private state?:CrowState; private before?:Observer<Scene>; private after?:Observer<Scene>; private preen=false;
 // Keep the evaluated authored pose separate from procedural deltas. Restoring it
 // before the next evaluation also covers paused/zero-weight animation targets.
 private secondaryBases=new Map<TransformNode,Quaternion>();
 private secondaryDelta=new Quaternion();
 private headInverse=Matrix.Identity();
 private headWorldAxis=Vector3.Zero(); private headLocalAxis=Vector3.Zero();
 private callPending=false;
 private selectedClip='Idle';
 constructor(private scene:Scene){this.root=new TransformNode('living-raven',scene);}
 async load():Promise<void>{
  const result=await SceneLoader.ImportMeshAsync('', './models/', 'crow.glb', this.scene);
  if(!result.skeletons.length || !result.animationGroups.length) throw new Error('Corvus authored armature/animation asset is missing');
  this.meshes=result.meshes;
  for(const mesh of result.meshes){if(!mesh.parent)mesh.parent=this.root; mesh.isPickable=false; mesh.receiveShadows=true;}
  for(const material of this.scene.materials){if(material instanceof PBRMaterial && /feather|Obsidian|Horn/.test(material.name)){material.environmentIntensity=.95;material.directIntensity=1.05;}}
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
  this.idleAge=s.mode==='idle'?this.idleAge+dt:0;
  if(s.mode!==this.lastMode&&!s.grounded){this.gesture='Idle';this.gestureUntil=0;}this.lastMode=s.mode;
  const moment=this.idleAge%37;
  this.preen=s.mode==='idle'&&moment>13&&moment<16.2;
  const idle=s.mode==='idle'&&this.elapsed<this.gestureUntil?this.gesture:this.preen?'Preen':moment>25&&moment<26.6?'Ruffle':moment>33&&moment<34.8?'Call':'Idle';
  const selected=s.mode==='run'?'Run':s.mode==='walk'?'Walk':s.mode==='stunned'?'Hit':s.mode==='takeoff'?'Takeoff':s.mode==='land'?'Land':s.mode==='brake'?'Brake':s.grounded?idle:s.flap>.25?'Flap':'Glide';
  if(selected!==this.selectedClip){
   this.selectedClip=selected;if(selected==='Call')this.callPending=true;
   if(['Takeoff','Land','Hit','Preen','Peck','Ruffle','Call'].includes(selected))this.groups.get(selected)?.goToFrame(this.groups.get(selected)!.from);
  }
  for(const [name,group] of this.groups){
   let target=name===selected?1:0;
   if(!s.grounded && s.mode!=='stunned' && s.mode!=='takeoff' && s.mode!=='brake' && s.mode!=='land'){
    const flap=Math.max(0,Math.min(1,(s.flap-.08)/.72)); target=name==='Flap'?flap:name==='Glide'?1-flap:0;
   }
   const w=mix(this.weights.get(name)||0,target,s.mode==='stunned'?14:8,dt);this.weights.set(name,w);group.setWeightForAllAnimatables(w);
   if(w<.001&&target===0&&group.isPlaying)group.pause();
   else if(w>=.001&&!group.isPlaying)group.play(true);
   group.speedRatio=name==='Walk'?Math.max(.55,s.speed/.8):name==='Run'?Math.max(.8,s.speed/1.8):name==='Flap'?(.84+s.flap*.28+Math.min(.18,s.speed*.009)):1;
  }
  const scan=Math.floor(this.elapsed/2.8);
  let yaw=Math.sin(scan*2.399)*.38,pitch=Math.sin(scan*1.71)*.065;
  if(lookTarget){
   const dx=lookTarget.x-s.position.x,dz=lookTarget.z-s.position.z;
   let local=Math.atan2(dx,dz)-s.yaw;local=Math.atan2(Math.sin(local),Math.cos(local));
   yaw=Math.max(-1,Math.min(1,local));pitch=Math.max(-.5,Math.min(.5,Math.atan2(lookTarget.y-s.position.y,Math.hypot(dx,dz))));
  }else if(!s.grounded){yaw=this.bank*.28;pitch=-s.pitch*.15;}
  if(s.grounded&&idle!=='Idle'){yaw*=.15;pitch*=.15;}
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
  const head=this.joints.get('Head');
  if(head){
   // Blender bone axes are tilted relative to the character. Express the look
   // axes in the evaluated joint frame, including glTF's reflected LH root.
   const matrix=head.computeWorldMatrix(true);matrix.invertToRef(this.headInverse);
   this.root.computeWorldMatrix(true);
   if(!head.rotationQuaternion)head.rotationQuaternion=Quaternion.FromEulerAngles(head.rotation.x,head.rotation.y,head.rotation.z);
   let base=this.secondaryBases.get(head);
   if(!base){base=head.rotationQuaternion.clone();this.secondaryBases.set(head,base);}
   head.rotationQuaternion.copyFrom(base);
   const rotate=(axis:Vector3,angle:number)=>{
    Vector3.TransformNormalToRef(axis,this.root.getWorldMatrix(),this.headWorldAxis);
    Vector3.TransformNormalToRef(this.headWorldAxis,this.headInverse,this.headLocalAxis);
    this.headLocalAxis.normalize();
    if(matrix.determinant()<0)this.headLocalAxis.scaleInPlace(-1);
    Quaternion.RotationAxisToRef(this.headLocalAxis,angle,this.secondaryDelta);
    head.rotationQuaternion!.multiplyInPlace(this.secondaryDelta);
   };
   rotate(Vector3.UpReadOnly,this.headYaw);rotate(Vector3.RightReadOnly,-this.headPitch);
   head.rotationQuaternion.normalize();
  }
  // Flight response remains small: head stable, tail corrects the bank and
  // outer feathers yield slightly to turbulent air.
  add('Tail',this.tail+(!this.state.grounded?Math.sin(this.elapsed*4.2)*.013:0),0,this.bank*.09);
  if(this.state.grounded&&this.selectedClip==='Idle')add('Body',Math.sin(this.elapsed*3.1)*.004,0,0);
  const shimmer=Math.sin(this.elapsed*10)*.009*Math.min(1,this.state.speed/9);
  add('Wrist.L',shimmer,0,-this.bank*.035);add('Wrist.R',-shimmer,0,-this.bank*.035);
 }
 get presentation(){return {clip:this.selectedClip,activeClips:[...this.weights].filter(([,w])=>w>.01).map(([name,weight])=>({name,weight})),joints:this.joints.size};}
 consumeCall():boolean{const pending=this.callPending;this.callPending=false;return pending;}
 gestureAction(kind:'Peck'|'Call'):void{this.gesture=kind;this.gestureUntil=this.elapsed+(kind==='Peck'?1.2:1.8);this.groups.get(kind)?.goToFrame(this.groups.get(kind)!.from);}
 dispose():void{
  if(this.before)this.scene.onBeforeAnimationsObservable.remove(this.before);
  if(this.after)this.scene.onAfterAnimationsObservable.remove(this.after);
  this.secondaryBases.clear();
  for(const g of this.groups.values())g.dispose();this.root.dispose(false,true);this.ready=false;
 }
}
