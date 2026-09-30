import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { CrowState, V3 } from './flight';
import type { World } from './world';
/** A small bounded pool: grounding shadow and displaced dust, never global screen effects. */
export class FlightEffects {
 private shadow:Mesh;
 private particles:Array<{mesh:Mesh;velocity:Vector3;age:number}>=[];
 constructor(scene:Scene){
  const texture=new DynamicTexture('soft contact silhouette',{width:64,height:64},scene,false);
  const c=texture.getContext();const gradient=c.createRadialGradient(32,32,3,32,32,31);gradient.addColorStop(0,'rgba(0,0,0,.5)');gradient.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=gradient;c.fillRect(0,0,64,64);texture.update();texture.hasAlpha=true;
  const mat=new StandardMaterial('crow contact shadow',scene);mat.diffuseTexture=texture;mat.useAlphaFromDiffuseTexture=true;mat.disableLighting=true;mat.emissiveColor=Color3.Black();mat.specularColor=Color3.Black();mat.alpha=.45;
  this.shadow=MeshBuilder.CreateGround('crow ground contact',{width:1.1,height:1.6},scene);this.shadow.material=mat;this.shadow.isPickable=false;this.shadow.receiveShadows=false;
  const dust=new StandardMaterial('lifted dry earth',scene);dust.diffuseTexture=texture;dust.useAlphaFromDiffuseTexture=true;dust.diffuseColor=new Color3(.57,.47,.30);dust.emissiveColor=new Color3(.20,.16,.09);dust.specularColor=Color3.Black();dust.backFaceCulling=false;
  for(let i=0;i<10;i++){const mesh=MeshBuilder.CreatePlane('short lived disturbance',{size:.18},scene);mesh.material=dust;mesh.isPickable=false;mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.setEnabled(false);this.particles.push({mesh,velocity:Vector3.Zero(),age:1});}
 }
 contact(p:V3,height:number){if(height>2||height<0)return;for(let i=0;i<this.particles.length;i++){const particle=this.particles[i],a=i*2.399;particle.mesh.position.set(p.x+Math.sin(a)*.15,height+.05,p.z+Math.cos(a)*.15);particle.velocity.set(Math.sin(a)*.35,.25+i%3*.09,Math.cos(a)*.35);particle.age=0;particle.mesh.visibility=.5;particle.mesh.setEnabled(true);}}
 update(state:CrowState,dt:number,world:World){
  const p=state.position;const floor=world.landingHeight(p.x,p.z,p.y,-1)??world.groundHeight(p.x,p.z),altitude=Math.max(0,p.y-floor-.46);
  this.shadow.setEnabled(altitude<12&&floor>=0);this.shadow.position.set(p.x,floor+.013,p.z);this.shadow.rotation.y=state.yaw;this.shadow.visibility=.75*Math.exp(-altitude*.3);this.shadow.scaling.setAll(1+Math.min(altitude,8)*.08);
  for(const particle of this.particles){if(particle.age>=.8)continue;particle.age+=dt;particle.mesh.position.addInPlace(particle.velocity.scale(dt));particle.velocity.y-=dt*.3;particle.mesh.visibility=Math.max(0,.45*(1-particle.age/.8));particle.mesh.scaling.setAll(1+particle.age*1.4);if(particle.age>=.8)particle.mesh.setEnabled(false);}
 }
}
