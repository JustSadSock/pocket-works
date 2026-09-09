import { Color3, Matrix, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { riverCenter, terrainHeight } from './world';

const hash=(x:number,z:number)=>{let n=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^0x27d4eb2d)|0;n=Math.imul((n^(n>>>13))|0,1274126177);return ((n^(n>>>16))>>>0)/4294967295;};

export class GroundDetailLayer{
  readonly bladeBudget=620;activeCount=0;
  private readonly grass:Mesh;
  private cell='';

  constructor(scene:Scene){
    const mat=new StandardMaterial('lowFlightGrassMat',scene);mat.diffuseColor=new Color3(.17,.30,.095);mat.emissiveColor=new Color3(.006,.010,.003);mat.specularColor=Color3.Black();mat.backFaceCulling=false;
    const a=MeshBuilder.CreatePlane('grassBladeA',{width:.18,height:1.0,sideOrientation:Mesh.DOUBLESIDE},scene);a.position.y=.50;a.material=mat;
    const b=MeshBuilder.CreatePlane('grassBladeB',{width:.15,height:.86,sideOrientation:Mesh.DOUBLESIDE},scene);b.position.y=.43;b.rotation.y=Math.PI*.5;b.material=mat;
    this.grass=Mesh.MergeMeshes([a,b],true,true,undefined,false,true)!;this.grass.name='lowFlightGrass';this.grass.material=mat;this.grass.isPickable=false;this.grass.alwaysSelectAsActiveMesh=false;
  }

  update(position:Vector3,quality:number){
    const cx=Math.floor(position.x/150),cz=Math.floor(position.z/150),key=`${cx}:${cz}:${quality>.72?1:0}`;if(key===this.cell)return;this.cell=key;
    const count=Math.floor(this.bladeBudget*(quality>.72?1:.58)),range=235,data=new Float32Array(count*16);let written=0;
    for(let i=0;i<count;i++){
      const sx=cx*977+i*37,sz=cz*991-i*43,x=position.x+(hash(sx,sz)-.5)*range*2,z=position.z+(hash(sz+17,sx-9)-.5)*range*2;
      if(Math.abs(z-riverCenter(x))<42)continue;
      const y=terrainHeight(x,z),hx=terrainHeight(x+3,z),hz=terrainHeight(x,z+3);if(Math.abs(hx-y)+Math.abs(hz-y)>5.8)continue;
      const s=.55+hash(sx*3+7,sz*5-11)*1.25,yaw=hash(sx*7,sz*11)*Math.PI*2;
      const m=Matrix.Compose(new Vector3(s*(.72+hash(sx,sz+33)*.42),s,s*(.72+hash(sz,sx+41)*.42)),Quaternion.RotationYawPitchRoll(yaw,0,0),new Vector3(x,y+.02,z));m.copyToArray(data,written*16);written++;
    }
    this.activeCount=written;this.grass.thinInstanceSetBuffer('matrix',data.subarray(0,written*16),16,true);this.grass.thinInstanceRefreshBoundingInfo(true);
  }

  dispose(){this.grass.dispose();}
}
