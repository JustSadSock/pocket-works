import { BLOCK_BY_ID, ITEM_BY_ID } from './data.js';
export class Player {
  constructor(){this.pos={x:.5,y:28,z:.5};this.vel={x:0,y:0,z:0};this.yaw=0;this.pitch=0;this.onGround=false;this.crouch=false;this.sprint=false;this.flying=false;this.health=20;this.hunger=20;this.oxygen=20;this.mode='survival';this.spawn={x:.5,y:28,z:.5};this.dead=false;this.damageFlash=0;this.swing=0;this.attackCooldown=0;}
  eye(){return {x:this.pos.x,y:this.pos.y+(this.crouch?1.28:1.55),z:this.pos.z};}
  dir(){const cp=Math.cos(this.pitch);return{x:-Math.sin(this.yaw)*cp,y:Math.sin(this.pitch),z:-Math.cos(this.yaw)*cp};}
  armorValue(equipment){return Object.values(equipment||{}).reduce((n,s)=>n+(ITEM_BY_ID[s?.id]?.armor||0),0);}
  damage(amount,equipment={}){if(this.mode==='creative'||this.dead)return;const reduced=Math.max(.5,amount*(1-Math.min(.72,this.armorValue(equipment)*.055)));this.health-=reduced;this.damageFlash=1;if(this.health<=0){this.health=0;this.dead=true;}}
  update(dt, input, world, settings){
    if(this.dead)return; this.damageFlash=Math.max(0,this.damageFlash-dt*3);this.swing=Math.max(0,this.swing-dt*5);this.attackCooldown=Math.max(0,this.attackCooldown-dt);
    const inWater=this.inBlock(world,7); const onLadder=this.inSpecial(world,'climbable'); const accel=this.onGround?22:7; const speed=this.crouch?1.5:(this.sprint?5.6:3.8); const sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);
    const mx=input.moveX||0,mz=input.moveY||0;let wx=cy*mx+sy*mz,wz=sy*mx-cy*mz;const len=Math.hypot(wx,wz)||1;wx/=len;wz/=len;
    const targetX=wx*speed,targetZ=wz*speed;const factor=Math.min(1,accel*dt);this.vel.x+=(targetX-this.vel.x)*factor;this.vel.z+=(targetZ-this.vel.z)*factor;
    if(Math.abs(mx)+Math.abs(mz)<.05&&this.onGround){this.vel.x*=Math.max(0,1-dt*12);this.vel.z*=Math.max(0,1-dt*12);}
    if(this.flying){const fy=input.flyY||(input.jump?1:0);this.vel.y+=(fy*5-this.vel.y)*Math.min(1,dt*8);}
    else if(onLadder){this.vel.y=((input.moveY>0||input.jump)?3:(input.crouch?-2:0));}
    else if(inWater){this.vel.y-=3*dt;this.vel.y*=Math.pow(.2,dt);if(input.jump)this.vel.y=Math.max(this.vel.y,3.2);}
    else {this.vel.y-=18*dt;if(input.jump&&this.onGround){this.vel.y=this.sprint?6.8:6.25;this.onGround=false;}}
    const maxStep=.18;let remaining=dt;while(remaining>0){const step=Math.min(maxStep/Math.max(1,Math.hypot(this.vel.x,this.vel.y,this.vel.z)),remaining);this.moveAxis('x',this.vel.x*step,world);this.moveAxis('z',this.vel.z*step,world);this.onGround=false;this.moveAxis('y',this.vel.y*step,world);remaining-=step;}
    if(this.pos.y<-6)this.damage(100);
    if(inWater){this.oxygen=Math.max(0,this.oxygen-dt);if(this.oxygen<=0)this.damage(dt*2);}else this.oxygen=Math.min(20,this.oxygen+dt*5);
    if(settings.autoJump&&this.onGround&&Math.hypot(mx,mz)>.35){const ax=this.pos.x+wx*.48,az=this.pos.z+wz*.48,fy=Math.floor(this.pos.y+.1);if(BLOCK_BY_ID[world.get(ax,fy,az)]?.solid&&!BLOCK_BY_ID[world.get(ax,fy+1,az)]?.solid)this.vel.y=6.25;}
    if(this.mode==='survival'){this.hunger=Math.max(0,this.hunger-dt*(this.sprint?.012:.004));if(this.hunger>17&&this.health<20)this.health=Math.min(20,this.health+dt*.15);if(this.hunger<=0)this.damage(dt*.5);}
    input.jump=false;
  }
  moveAxis(axis,delta,world){if(!delta)return;this.pos[axis]+=delta;if(this.collides(world)){if(axis!=='y'&&this.onGround){this.pos.y+=.52;if(!this.collides(world))return;this.pos.y-=.52;}this.pos[axis]-=delta;if(axis==='y'&&delta<0)this.onGround=true;this.vel[axis]=0;}}
  collides(world){const r=.3,h=this.crouch?1.5:1.8;for(let x=Math.floor(this.pos.x-r);x<=Math.floor(this.pos.x+r);x++)for(let y=Math.floor(this.pos.y);y<=Math.floor(this.pos.y+h);y++)for(let z=Math.floor(this.pos.z-r);z<=Math.floor(this.pos.z+r);z++){const b=BLOCK_BY_ID[world.get(x,y,z)];if(!b?.solid)continue;let top=y+1,minX=x,maxX=x+1,minZ=z,maxZ=z+1;if(b.slab||b.stairs)top=y+.5;if(b.fence){minX=x+.28;maxX=x+.72;minZ=z+.28;maxZ=z+.72;top=y+1.4;}if(b.thin){minX=x+.42;maxX=x+.58;}if(this.pos.x+r>minX&&this.pos.x-r<maxX&&this.pos.z+r>minZ&&this.pos.z-r<maxZ&&this.pos.y+h>y&&this.pos.y<top)return true;}return false;}
  inBlock(world,id){const e=this.eye();return world.get(e.x,e.y,e.z)===id||world.get(this.pos.x,this.pos.y+.2,this.pos.z)===id;}
  inSpecial(world,key){const e=this.eye();return !!BLOCK_BY_ID[world.get(e.x,e.y,e.z)]?.[key]||!!BLOCK_BY_ID[world.get(this.pos.x,this.pos.y+.7,this.pos.z)]?.[key];}
  serialize(){return{pos:this.pos,vel:{x:0,y:0,z:0},yaw:this.yaw,pitch:this.pitch,health:this.health,hunger:this.hunger,oxygen:this.oxygen,mode:this.mode,spawn:this.spawn,flying:this.flying};}
  apply(d){if(!d)return;for(const k of ['yaw','pitch','health','hunger','oxygen'])if(Number.isFinite(d[k]))this[k]=d[k];if(d.pos)this.pos={...this.pos,...d.pos};if(d.spawn)this.spawn={...this.spawn,...d.spawn};if(d.mode)this.mode=d.mode;this.flying=!!d.flying;}
}
