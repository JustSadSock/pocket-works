import { Color3, InstancedMesh, LinesMesh, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { terrainHeight } from './world';

const hash=(n:number)=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);};

type Grazer={mesh:InstancedMesh;seed:number};

export class FaunaSystem{
  readonly birdCount=14;readonly grazerCount=7;private birds:LinesMesh;private grazers:Grazer[]=[];private grazerTemplate:Mesh;private lastBirdUpdate=0;private lastGrazerUpdate=0;
  constructor(private scene:Scene){
    const lines=Array.from({length:this.birdCount},()=>[new Vector3(-1,0,0),Vector3.Zero(),new Vector3(1,0,0)]);
    this.birds=MeshBuilder.CreateLineSystem('distant_bird_flocks',{lines,updatable:true},scene);this.birds.color=new Color3(.10,.16,.14);this.birds.visibility=.78;this.birds.isPickable=false;
    const fur=new StandardMaterial('grazerFur',scene);fur.diffuseColor=new Color3(.28,.22,.14);fur.specularColor=Color3.Black();
    const body=MeshBuilder.CreateCapsule('grazerBody',{height:3.6,radius:.72,tessellation:8},scene);body.rotation.z=Math.PI/2;body.material=fur;
    const head=MeshBuilder.CreateIcoSphere('grazerHead',{radius:.55,subdivisions:1},scene);head.position.set(1.9,.3,0);head.material=fur;
    const parts:Mesh[]=[body,head];for(const x of [-1.15,1.0])for(const z of [-.42,.42]){const leg=MeshBuilder.CreateCylinder(`grazerLeg_${x}_${z}`,{height:1.55,diameter:.18,tessellation:6},scene);leg.position.set(x,-1,z);leg.material=fur;parts.push(leg);}this.grazerTemplate=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;this.grazerTemplate.name='grazerTemplate';this.grazerTemplate.position.y=-3000;this.grazerTemplate.isPickable=false;
    for(let i=0;i<this.grazerCount;i++){const mesh=this.grazerTemplate.createInstance(`grazer_${i}`);mesh.position.y=-3000;mesh.isPickable=false;this.grazers.push({mesh,seed:hash(i*71+9)});}
  }
  get activeCount(){return this.birdCount+this.grazers.length;}
  update(position:Vector3,velocity:Vector3,time:number){
    if(time-this.lastBirdUpdate>.055){this.lastBirdUpdate=time;const speed=Math.max(1,velocity.length());const f=velocity.scale(1/speed);let right=Vector3.Cross(Vector3.Up(),f);if(right.lengthSquared()<.01)right=Vector3.Right();else right.normalize();const lines:Vector3[][]=[];for(let i=0;i<this.birdCount;i++){const s=hash(i*53+17),s2=hash(i*97+31),s3=hash(i*137+47);const flap=Math.sin(time*(4.2+s*2.1)+i*1.7)*(.55+s*.25);const ahead=95+s*330;const side=(s2-.5)*360;const lift=18+s3*115+Math.sin(time*.25+i)*16;const center=position.add(f.scale(ahead)).add(right.scale(side)).add(new Vector3(0,lift,0));const wing=1.2+s*1.8;lines.push([center.add(new Vector3(-wing,flap,0)),center,center.add(new Vector3(wing,flap,0))]);}MeshBuilder.CreateLineSystem(this.birds.name,{lines,instance:this.birds});}
    if(time-this.lastGrazerUpdate>.32){this.lastGrazerUpdate=time;for(let i=0;i<this.grazers.length;i++){const g=this.grazers[i];const angle=g.seed*Math.PI*2+time*(.018+(i%3)*.004);const radius=90+hash(i*43+5)*285;const x=position.x+Math.cos(angle)*radius,z=position.z+Math.sin(angle)*radius;const y=terrainHeight(x,z)+1.1;g.mesh.position.set(x,y,z);g.mesh.rotation.y=-angle+Math.PI*.5;const scale=.72+hash(i*109+3)*.42;g.mesh.scaling.setAll(scale);}}
  }
  dispose(){this.birds.dispose();for(const g of this.grazers)g.mesh.dispose();this.grazerTemplate.dispose();}
}
