import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';

type Cloud={mesh:Mesh;vx:number;vz:number;seed:number};

const rand=(n:number)=>{const x=Math.sin(n*91.731+17.17)*43758.5453;return x-Math.floor(x);};

export class CloudLayer{
  readonly count=16;
  private readonly clouds:Cloud[]=[];
  private readonly material:StandardMaterial;
  private initialized=false;
  private lastTime=0;

  constructor(private scene:Scene){
    const texture=new DynamicTexture('aetherwingCloudTexture',{width:384,height:192},scene,false);
    texture.hasAlpha=true;
    const ctx=texture.getContext();ctx.clearRect(0,0,384,192);
    const blobs=[
      [72,112,68,.72],[123,88,82,.88],[184,102,92,.94],[247,82,76,.82],[309,109,61,.68],
      [103,127,63,.62],[164,64,61,.68],[224,126,76,.75],[280,127,54,.56]
    ];
    for(const [x,y,r,a] of blobs){
      const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(.48,`rgba(246,248,244,${a*.78})`);g.addColorStop(.78,`rgba(231,238,234,${a*.31})`);g.addColorStop(1,'rgba(226,235,232,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    texture.update(false);
    const mat=new StandardMaterial('aetherwingCloudMat',scene);mat.diffuseTexture=texture;mat.opacityTexture=texture;mat.useAlphaFromDiffuseTexture=true;mat.diffuseColor=new Color3(.94,.97,.96);mat.emissiveColor=new Color3(.40,.43,.42);mat.specularColor=Color3.Black();mat.alpha=.72;mat.backFaceCulling=false;mat.disableDepthWrite=true;this.material=mat;
    for(let i=0;i<this.count;i++){
      const mesh=MeshBuilder.CreatePlane(`cloud_${i}`,{width:1,height:1},scene);mesh.material=mat;mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.renderingGroupId=2;mesh.visibility=.74+rand(i*13)*.22;
      this.clouds.push({mesh,vx:1.8+rand(i*23)*3.2,vz:-.8+rand(i*41)*1.6,seed:rand(i*59+11)});
    }
  }

  update(center:Vector3,time:number){
    const dt=this.lastTime?Math.min(.1,Math.max(0,time-this.lastTime)):0;this.lastTime=time;
    if(!this.initialized){for(let i=0;i<this.clouds.length;i++)this.place(this.clouds[i],i,center);this.initialized=true;}
    for(let i=0;i<this.clouds.length;i++){
      const c=this.clouds[i];c.mesh.position.x+=c.vx*dt;c.mesh.position.z+=c.vz*dt;
      const dx=c.mesh.position.x-center.x,dz=c.mesh.position.z-center.z;if(dx*dx+dz*dz>1450*1450)this.place(c,i,center,true);
      const pulse=.96+Math.sin(time*.065+c.seed*6.28)*.025;c.mesh.scaling.y=c.mesh.scaling.x*.43*pulse;
    }
  }

  private place(c:Cloud,i:number,center:Vector3,wrap=false){
    const a=rand(i*71+3)*Math.PI*2,d=wrap?980+rand(i*97+9)*270:280+rand(i*97+9)*940;
    c.mesh.position.set(center.x+Math.cos(a)*d,285+rand(i*113+7)*235,center.z+Math.sin(a)*d);
    const width=120+rand(i*127+5)*245;c.mesh.scaling.set(width,width*.43,1);
  }
}
