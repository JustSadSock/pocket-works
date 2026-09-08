import { Quaternion, Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';
import { ConstraintArm, vec3 } from './constraint-model.js';

const AXIS_Y=new Vector3(0,1,0), AXIS_Z=new Vector3(0,0,1);
function basis(yaw){return {forward:new Vector3(Math.sin(yaw),0,Math.cos(yaw)),right:new Vector3(Math.cos(yaw),0,-Math.sin(yaw))};}
function quatAxisTo(axis,direction){const dir=direction.normalizeToNew();const dot=clamp(Vector3.Dot(axis,dir),-1,1);if(dot>.999999)return Quaternion.Identity();if(dot<-.999999)return Quaternion.RotationAxis(new Vector3(1,0,0),Math.PI);const cross=Vector3.Cross(axis,dir);if(cross.lengthSquared()<1e-8)return Quaternion.Identity();cross.normalize();return Quaternion.RotationAxis(cross,Math.acos(dot));}
function setSegment(mesh,a,b,axis=AXIS_Y){const delta=b.subtract(a);const length=Math.max(.001,delta.length());mesh.position.copyFrom(a.add(b).scale(.5));mesh.rotationQuaternion=quatAxisTo(axis,delta);if(axis===AXIS_Y)mesh.scaling.set(1,length,1);else mesh.scaling.set(1,1,length);}
function toWorld(local,origin,b){return origin.add(b.right.scale(local.x)).add(new Vector3(0,local.y,0)).add(b.forward.scale(local.z));}
function toLocal(world,b){return vec3(Vector3.Dot(world,b.right),world.y,Vector3.Dot(world,b.forward));}

class PhysicalUpperBody {
  constructor(game){
    this.game=game;this.player=game.player;
    this.weapon=new ConstraintArm({upper:.34,lower:.33,tool:1.04,handed:1});
    this.shield=new ConstraintArm({upper:.33,lower:.32,tool:.055,handed:-1});
    this.prevSwordBase=null;this.prevSwordTip=null;this.prevShieldCenter=null;this.prevShieldNormal=null;
    this.lastGesture={x:0,y:0};this.reset();this.patchImpulses();
  }
  reset(){this.weapon.reset(vec3());this.shield.reset(vec3());this.prevSwordBase=this.prevSwordTip=this.prevShieldCenter=this.prevShieldNormal=null;this.lastGesture={x:0,y:0};}
  patchImpulses(){
    const p=this.player;const oldWeapon=p.applyWeaponImpulse.bind(p);const oldShield=p.applyShieldImpulse.bind(p);
    p.applyWeaponImpulse=(impulse)=>{oldWeapon(impulse);const b=basis(p.upperYaw);const l=toLocal(impulse,b);this.weapon.impulse(vec3(l.x,l.y,l.z),.038);};
    p.applyShieldImpulse=(impulse)=>{oldShield(impulse);const b=basis(p.upperYaw);const l=toLocal(impulse,b);this.shield.impulse(vec3(l.x,l.y,l.z),.032);};
  }
  drive(control,dt){
    const p=this.player;const b=basis(p.upperYaw);const shoulderR=p.bones.shoulderR.getAbsolutePosition();const shoulderL=p.bones.shoulderL.getAbsolutePosition();
    const gy=control.gestureYawRate??control.lookYawRate??0;const gp=control.gesturePitchRate??control.lookPitchRate??0;
    const gestureEnergy=clamp(Math.hypot(gy,gp)/8.8,0,1);
    const deltaX=gy-this.lastGesture.x,deltaY=gp-this.lastGesture.y;this.lastGesture={x:gy,y:gp};
    const snap=clamp(Math.hypot(deltaX,deltaY)/5.5,0,1);
    const drive=vec3(-gy*(.72+.45*snap),gp*(.68+.42*snap),gestureEnergy*(1.4+.8*snap));

    // A quiet drag aims; a fast flick injects momentum. No canned strike phase.
    const weaponPose=this.weapon.step({shoulder:vec3(),guardHand:vec3(.24,-.13,.54),guardTip:vec3(.31,-.015,1.56),drive,brace:.70-gestureEnergy*.20,dt,iterations:8});

    let threat=vec3();let danger=0;
    const enemy=this.game.enemy;
    if(enemy&&!enemy.dead){const trace=enemy.getSwordTrace();const rel=trace.tip.subtract(p.bones.chest.getAbsolutePosition());const dist=rel.length();danger=clamp((trace.speed-1.7)/6,0,1)*clamp((3.0-dist)/1.5,0,1);threat=vec3(-Vector3.Dot(rel,b.right)*danger*2.4,(rel.y-.2)*danger*2.0,danger*1.7);}
    // Shield is heavy and mostly body/threat driven; camera flicks only tug it slightly.
    const shieldDrive=vec3(threat.x-gy*.10,threat.y+gp*.08,threat.z);
    const shieldPose=this.shield.step({shoulder:vec3(),guardHand:vec3(-.22,-.03,.49),guardTip:vec3(-.22,-.03,.545),drive:shieldDrive,brace:.92,dt,iterations:9});

    this.applyWeaponPose(weaponPose,shoulderR,b,dt);
    this.applyShieldPose(shieldPose,shoulderL,b,dt);

    // Body reacts to the *change* in limb momentum, not directly to camera position.
    if(gestureEnergy>.12){p.impactLeanVelocity.addInPlace(b.right.scale(-deltaX*.0017));p.impactLeanVelocity.y+=-deltaY*.0008;p.stability=Math.max(0,p.stability-gestureEnergy*dt*1.8);}
  }
  applyWeaponPose(pose,shoulder,b,dt){
    const w=this.player;const elbow=toWorld(pose.elbow,shoulder,b),hand=toWorld(pose.hand,shoulder,b),tip=toWorld(pose.tip,shoulder,b);
    w.bones.elbowR.setAbsolutePosition(elbow);w.bones.handR.setAbsolutePosition(hand);w.rightHand.position.copyFrom(hand);
    setSegment(w.meshes.upperArmR,shoulder,elbow);setSegment(w.meshes.forearmR,elbow,hand);
    const dir=tip.subtract(hand).normalize();
    const lastBase=this.prevSwordBase?.clone()??hand.clone(),lastTip=this.prevSwordTip?.clone()??tip.clone();
    w.sword.prevBase.copyFrom(lastBase);w.sword.prevTip.copyFrom(lastTip);w.sword.base.copyFrom(hand);w.sword.tip.copyFrom(tip);this.prevSwordBase=hand.clone();this.prevSwordTip=tip.clone();
    w.swordDirection.position.copyFrom(dir);
    w.sword.speed=tip.subtract(lastTip).scale(1/Math.max(dt,1/240)).length();
    const baseSpeed=hand.subtract(lastBase).scale(1/Math.max(dt,1/240));const tipSpeed=tip.subtract(lastTip).scale(1/Math.max(dt,1/240));w.sword.angularSpeed=tipSpeed.subtract(baseSpeed).length()/w.sword.length;
    setSegment(w.meshes.blade,hand.add(dir.scale(.10)),tip,AXIS_Z);const gripEnd=hand.subtract(dir.scale(.18));setSegment(w.meshes.grip,gripEnd,hand,AXIS_Y);w.meshes.guard.position.copyFrom(hand.add(dir.scale(.015)));w.meshes.guard.rotationQuaternion=quatAxisTo(AXIS_Z,dir);
    // Natural wrist roll from the swing plane rather than an animation preset.
    const roll=clamp((pose.tip.x-pose.hand.x)*-.55+(pose.tip.y-pose.hand.y)*.32,-.85,.85);const q=Quaternion.RotationAxis(dir,roll);w.meshes.blade.rotationQuaternion=q.multiply(w.meshes.blade.rotationQuaternion);w.meshes.guard.rotationQuaternion=q.multiply(w.meshes.guard.rotationQuaternion);
  }
  applyShieldPose(pose,shoulder,b,dt){
    const w=this.player;const elbow=toWorld(pose.elbow,shoulder,b),hand=toWorld(pose.hand,shoulder,b),center=toWorld(pose.tip,shoulder,b);
    w.bones.elbowL.setAbsolutePosition(elbow);w.bones.handL.setAbsolutePosition(hand);w.leftHand.position.copyFrom(hand);setSegment(w.meshes.upperArmL,shoulder,elbow);setSegment(w.meshes.forearmL,elbow,hand);
    const forward=center.subtract(hand).normalize();const bodyForward=b.forward;const normal=forward.scale(.35).add(bodyForward.scale(.65)).normalize();
    const lastCenter=this.prevShieldCenter?.clone()??center.clone(),lastNormal=this.prevShieldNormal?.clone()??normal.clone();w.shield.prevCenter.copyFrom(lastCenter);w.shield.prevNormal.copyFrom(lastNormal);w.shield.center.copyFrom(center);w.shield.normal.copyFrom(normal);this.prevShieldCenter=center.clone();this.prevShieldNormal=normal.clone();w.shieldNormal.position.copyFrom(normal);
    const rot=quatAxisTo(AXIS_Y,normal);w.meshes.shield.position.copyFrom(center);w.meshes.shield.rotationQuaternion=rot;w.meshes.shieldRim.position.copyFrom(center.add(normal.scale(.045)));w.meshes.shieldRim.rotationQuaternion=rot;w.meshes.shieldBoss.position.copyFrom(center.add(normal.scale(.075)));
  }
}

export function installConstraintCombat(game){
  const body=new PhysicalUpperBody(game);const originalUpdate=game.update.bind(game);const originalRestart=game.restart?.bind(game);
  const originalHandle=game.handleCombatEvent.bind(game);let hitStop=0;
  game.update=(dt,now)=>{if(hitStop>0){hitStop-=dt;return;}originalUpdate(dt,now);body.drive(game.__lastPlayerControl||{},dt);};
  // Capture exactly the control signal consumed by the stock update without changing the game's external API.
  const originalPlayerUpdate=game.player.update.bind(game.player);
  game.player.update=(dt,control,snap=false)=>{game.__lastPlayerControl=control;originalPlayerUpdate(dt,control,snap);if(snap)body.reset();};
  game.handleCombatEvent=(event)=>{if(event.type==='hit')hitStop=Math.max(hitStop,.032+(event.intensity||0)*.018);else if(event.type==='clash')hitStop=Math.max(hitStop,.018+(event.intensity||0)*.012);else if(event.type==='block')hitStop=Math.max(hitStop,.014+(event.intensity||0)*.010);originalHandle(event);};
  if(originalRestart)game.restart=(...args)=>{body.reset();hitStop=0;return originalRestart(...args);};
  return body;
}
