import { Vector3 } from '@babylonjs/core';
import { clamp, lerp } from './core.js';

// Compact one-handed sword guard: hand near lower ribs, point high on the centre line.
// The shield sits off-line at sternum height so the fighter can see and counter-cut.
const GUARD_POSE={x:0.10,y:-0.18,z:0.36};
const GUARD_DIR={x:0.10,y:0.54,z:0.84};
const STRIKES = [
  { name:'right-cut', windup:{pose:{x:.38,y:.10,z:.04},dir:{x:.67,y:.25,z:.70}}, strike:{pose:{x:-.13,y:-.04,z:.57},dir:{x:-.24,y:-.13,z:.96}} },
  { name:'backhand', windup:{pose:{x:-.18,y:.04,z:.16},dir:{x:-.45,y:.31,z:.84}}, strike:{pose:{x:.29,y:-.07,z:.56},dir:{x:.34,y:-.16,z:.93}} },
  { name:'diagonal', windup:{pose:{x:.31,y:.29,z:.02},dir:{x:.43,y:.69,z:.58}}, strike:{pose:{x:-.08,y:-.16,z:.59},dir:{x:-.16,y:-.32,z:.93}} },
  { name:'rising', windup:{pose:{x:.27,y:-.31,z:.10},dir:{x:.36,y:-.57,z:.74}}, strike:{pose:{x:-.10,y:.20,z:.58},dir:{x:-.16,y:.45,z:.88}} },
  { name:'overhead', windup:{pose:{x:.08,y:.43,z:.00},dir:{x:.02,y:.82,z:.57}}, strike:{pose:{x:.01,y:-.17,z:.62},dir:{x:.01,y:-.39,z:.92}} },
  { name:'thrust', windup:{pose:{x:.16,y:-.16,z:.13},dir:{x:.04,y:.28,z:.96}}, strike:{pose:{x:.02,y:-.04,z:.67},dir:{x:0,y:.08,z:1}} }
];
function blendPose(a,b,t){return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)};}

export class DuelAI {
  constructor(){this.reset();}
  reset(){this.state='measure';this.timer=.6+Math.random()*.7;this.attack=null;this.orbit=Math.random()<.5?-1:1;this.feint=false;this.decisionClock=0;this.pressure=.45;this.comboBias=0;this.breath=Math.random()*Math.PI*2;}
  chooseAttack(){this.attack=STRIKES[Math.floor(Math.random()*STRIKES.length)];this.state='windup';this.timer=.42+Math.random()*.24;this.feint=Math.random()<.18;}
  update(dt,self,target){
    const toTarget=target.position.subtract(self.position),horizontal=new Vector3(toTarget.x,0,toTarget.z),distance=Math.max(.001,horizontal.length()),facingYaw=Math.atan2(horizontal.x,horizontal.z),forward=horizontal.scale(1/distance),right=new Vector3(forward.z,0,-forward.x);
    this.breath+=dt*(1.55+this.pressure*.25);
    this.decisionClock-=dt;if(this.decisionClock<=0){this.decisionClock=.34+Math.random()*.30;if(Math.random()<.22)this.orbit*=-1;this.pressure=clamp(this.pressure+(Math.random()-.5)*.28,.22,.82);}
    let worldMove=new Vector3();if(distance>3.15)worldMove.addInPlace(forward.scale(.82));else if(distance<1.72)worldMove.addInPlace(forward.scale(-.90));else{worldMove.addInPlace(right.scale(this.orbit*(.34+this.pressure*.28)));if(distance>2.62)worldMove.addInPlace(forward.scale(.22));if(distance<2.15)worldMove.addInPlace(forward.scale(-.27));}if(worldMove.lengthSquared()>1)worldMove.normalize();
    const localRight=new Vector3(Math.cos(facingYaw),0,-Math.sin(facingYaw)),localForward=new Vector3(Math.sin(facingYaw),0,Math.cos(facingYaw));
    const playerBlade=target.getSwordTrace(),bladeRelative=playerBlade.tip.subtract(self.position),bladeHeight=bladeRelative.y-1.22,side=Vector3.Dot(bladeRelative,localRight),danger=clamp((playerBlade.speed-2.2)/5,0,1)*clamp((3.2-distance)/1.5,0,1);
    const breathing=Math.sin(this.breath)*.008;
    const shieldPose={x:clamp(-.20+side*.075,-.34,-.05),y:clamp(-.12+bladeHeight*.16+danger*.10,-.24,.18)+breathing,z:.39+danger*.08};
    const shieldNormal={x:clamp(.14+side*.09,-.08,.28),y:clamp(-.07+bladeHeight*.08,-.16,.10),z:1};
    this.timer-=dt;if(this.state==='measure'&&this.timer<=0&&distance<3.05&&self.stamina>24)this.chooseAttack();
    let weaponPose={...GUARD_POSE},weaponDir={...GUARD_DIR};
    if(this.state==='measure'){weaponPose.y+=breathing;weaponDir.y+=breathing*.8;}
    if(this.state==='windup'&&this.attack){const duration=.66,t=clamp(1-this.timer/duration,0,1),loaded=t*t*(3-2*t);weaponPose=blendPose(GUARD_POSE,this.attack.windup.pose,loaded);weaponDir=blendPose(GUARD_DIR,this.attack.windup.dir,loaded);if(this.timer<=0){if(this.feint){this.state='recover';this.timer=.42+Math.random()*.18;}else{this.state='strike';this.timer=this.attack.name==='thrust'?.24:.30;self.stamina=Math.max(0,self.stamina-14);if(distance>1.35&&distance<2.5)self.velocity.addInPlace(forward.scale(.42));}}}
    else if(this.state==='strike'&&this.attack){const duration=this.attack.name==='thrust'?.24:.30,t=clamp(1-this.timer/duration,0,1),eased=1-Math.pow(1-t,3);weaponPose=blendPose(this.attack.windup.pose,this.attack.strike.pose,eased);weaponDir=blendPose(this.attack.windup.dir,this.attack.strike.dir,eased);if(this.timer<=0){this.state='recover';this.timer=.48+Math.random()*.28;}}
    else if(this.state==='recover'&&this.attack){const duration=.72,t=clamp(1-this.timer/duration,0,1),settled=t*t*(3-2*t);weaponPose=blendPose(this.attack.strike.pose,GUARD_POSE,settled);weaponDir=blendPose(this.attack.strike.dir,GUARD_DIR,settled);worldMove.addInPlace(forward.scale(-.10));if(this.timer<=0){this.state='measure';this.timer=.38+Math.random()*.88;this.attack=null;}}
    if(danger>.62&&this.state==='measure'){worldMove.addInPlace(forward.scale(-.38));if(worldMove.lengthSquared()>1)worldMove.normalize();}
    const moveX=Vector3.Dot(worldMove,localRight),moveY=Vector3.Dot(worldMove,localForward),moveMagnitude=clamp(worldMove.length(),0,1);
    return{lookYaw:facingYaw,lookPitch:clamp((target.bones.chest.getAbsolutePosition().y-self.bones.head.getAbsolutePosition().y)*.14,-.18,.18),lookYawRate:0,lookPitchRate:0,moveX,moveY,moveMagnitude,moveSpaceYaw:facingYaw,weaponPose,weaponDir,shieldPose,shieldNormal};
  }
}
