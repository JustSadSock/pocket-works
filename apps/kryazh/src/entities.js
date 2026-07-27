import { BIOMES, CREATURE_TYPES, ITEM_BY_ID } from './data.js';
import { addItem } from './inventory.js';
export class EntitySystem {
  constructor(world,seed){this.world=world;this.seed=seed;this.entities=[];this.drops=[];this.spawnTimer=2;this.nextId=1;}
  spawn(type,x,y,z){const d=CREATURE_TYPES[type];if(!d)return;this.entities.push({id:this.nextId++,type,x,y,z,vx:0,vy:0,vz:0,hp:d.hp,maxHp:d.hp,color:d.color,flying:!!d.flying,aquatic:!!d.aquatic,hurt:0,attack:0,wander:Math.random()*6,dead:false,age:0});}
  drop(id,count,x,y,z){if(!ITEM_BY_ID[id])return;this.drops.push({id,count,x,y,z,vy:2,age:0});}
  update(dt,player,time,inventory){
    this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawnTimer=2.5;this.trySpawn(player,time);}
    for(const e of this.entities){if(e.dead)continue;e.age+=dt;e.hurt=Math.max(0,e.hurt-dt*4);e.attack=Math.max(0,e.attack-dt);const d=CREATURE_TYPES[e.type],dx=player.pos.x-e.x,dz=player.pos.z-e.z,dist=Math.hypot(dx,dz);if(dist>54){if(e.age>15)e.dead=true;continue;}let tx=0,tz=0,speed=d.speed;
      const hostile=d.hostile&&(time>.72||time<.23||player.pos.y<15);const aggro=hostile||(!d.passive&&e.hurt>0);if(aggro&&dist<18){tx=dx/(dist||1);tz=dz/(dist||1);if(dist<1.35&&e.attack<=0){player.damage(d.damage||2);e.attack=1.15;}}
      else{e.wander-=dt;if(e.wander<=0){e.wander=2+Math.random()*5;e.angle=Math.random()*Math.PI*2;}tx=Math.cos(e.angle||0)*.4;tz=Math.sin(e.angle||0)*.4;}
      if(d.passive&&e.hurt>0){tx=-dx/(dist||1);tz=-dz/(dist||1);speed*=1.6;}
      e.vx+=(tx*speed-e.vx)*Math.min(1,dt*3);e.vz+=(tz*speed-e.vz)*Math.min(1,dt*3);
      if(e.flying){e.y+=(Math.sin(e.age*2+e.id)*.4)*dt;e.x+=e.vx*dt;e.z+=e.vz*dt;}
      else if(e.aquatic){if(this.world.get(e.x,e.y,e.z)!==7)e.dead=true;else{e.x+=e.vx*dt;e.z+=e.vz*dt;e.y+=Math.sin(e.age)*dt*.2;}}
      else{const ground=this.findGround(e.x,e.z,e.y);if(ground!==null)e.y+=(ground+1-e.y)*Math.min(1,dt*8);const nx=e.x+e.vx*dt,nz=e.z+e.vz*dt;if(!this.solid(nx,e.y+.5,nz)){e.x=nx;e.z=nz;}else{e.angle=(e.angle||0)+1.7;e.vx*=-.4;e.vz*=-.4;}}
    }
    this.entities=this.entities.filter(e=>!e.dead||e.age<2);
    for(const d of this.drops){d.age+=dt;d.vy-=10*dt;d.y+=d.vy*dt;if(this.world.get(d.x,d.y-.1,d.z)){d.y=Math.floor(d.y)+.25;d.vy=0;}const dist=Math.hypot(player.pos.x-d.x,player.pos.y-d.y,player.pos.z-d.z);if(dist<1.3){if(addItem(inventory,d.id,d.count)===0)d.dead=true;}}
    this.drops=this.drops.filter(d=>!d.dead&&d.age<300);
  }
  trySpawn(player,time){if(this.entities.length>28)return;const a=Math.random()*Math.PI*2,r=12+Math.random()*24,x=Math.floor(player.pos.x+Math.cos(a)*r)+.5,z=Math.floor(player.pos.z+Math.sin(a)*r)+.5,b=this.world.biomeAt(x,z),y=this.world.heightAt(x,z)+1;let choices=[];for(const [k,d] of Object.entries(CREATURE_TYPES)){if(d.biome&&!d.biome.includes(b))continue;if(d.night&&!(time>.7||time<.25))continue;if(d.cave&&y>15)continue;if(d.aquatic&&this.world.get(x,y,z)!==7)continue;choices.push(k);}if(!choices.length)return;const type=choices[Math.floor(Math.random()*choices.length)];this.spawn(type,x,type==='wisp'?y+3:y,z);}
  findGround(x,z,around){for(let y=Math.min(47,Math.floor(around)+2);y>=Math.max(0,Math.floor(around)-4);y--)if(this.world.get(x,y,z))return y;return null;}
  solid(x,y,z){return !!this.world.get(x,y,z);}
  attack(origin,dir,damage,knock=2){let best=null,bestT=Infinity;for(const e of this.entities){if(e.dead)continue;const vx=e.x-origin.x,vy=e.y+.7-origin.y,vz=e.z-origin.z,t=vx*dir.x+vy*dir.y+vz*dir.z;if(t<0||t>4.2)continue;const px=origin.x+dir.x*t,py=origin.y+dir.y*t,pz=origin.z+dir.z*t;if(Math.hypot(px-e.x,py-(e.y+.7),pz-e.z)<.8&&t<bestT){best=e;bestT=t;}}if(!best)return false;best.hp-=damage;best.hurt=1;best.vx+=dir.x*knock;best.vz+=dir.z*knock;if(best.hp<=0){best.dead=true;const d=CREATURE_TYPES[best.type];this.drop(d.drop,d.dropCount||1,best.x,best.y+.5,best.z);}return true;}
  serialize(){return this.entities.filter(e=>!e.dead&&Math.abs(e.x)<5000&&Math.abs(e.z)<5000).slice(0,40).map(e=>({type:e.type,x:e.x,y:e.y,z:e.z,hp:e.hp}));}
  apply(list){if(!Array.isArray(list))return;for(const e of list.slice(0,40)){this.spawn(e.type,e.x,e.y,e.z);this.entities.at(-1).hp=e.hp;}}
}
