import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';

export function createPlacementGuide(scene) {
 const step=.25,half=1.5,lines=[];
 for(let i=-half;i<=half+.001;i+=step){
  lines.push([new Vector3(i,0,-half),new Vector3(i,0,half)]);
  lines.push([new Vector3(-half,0,i),new Vector3(half,0,i)]);
 }
 const grid=MeshBuilder.CreateLineSystem('placement-grid',{lines},scene);
 grid.isPickable=false;grid.color=Color3.FromHexString('#a18b71');grid.alpha=.31;
 const footprint=MeshBuilder.CreateGround('placement-footprint',{width:1,height:1},scene);
 footprint.isPickable=false;
 const material=new StandardMaterial('placement-footprint-material',scene);
 material.disableLighting=true;material.backFaceCulling=false;material.alpha=.27;
 material.diffuseColor=Color3.FromHexString('#a9bd9b');
 footprint.material=material;
 const border=MeshBuilder.CreateLines('placement-outline',{points:[
  new Vector3(-.5,0,-.5),new Vector3(.5,0,-.5),new Vector3(.5,0,.5),new Vector3(-.5,0,.5),new Vector3(-.5,0,-.5)
 ]},scene);
 border.isPickable=false;border.alpha=.85;
 function hide(){grid.setEnabled(false);footprint.setEnabled(false);border.setEnabled(false);}
 function show({x,z,y=0,width=1,depth=1,valid=true,wall=false}){
  if(wall){hide();return;}
  const floor=y+.028;
  grid.position.set(x,floor,z);
  grid.color=Color3.FromHexString(valid?'#967e66':'#ba695d');
  grid.setEnabled(true);
  footprint.position.set(x,floor+.004,z);
  footprint.scaling.set(Math.max(.1,width),1,Math.max(.1,depth));
  material.diffuseColor=Color3.FromHexString(valid?'#9fb890':'#ce7068');
  footprint.setEnabled(true);
  border.position.set(x,floor+.012,z);
  border.scaling.set(Math.max(.1,width),1,Math.max(.1,depth));
  border.color=Color3.FromHexString(valid?'#88a67b':'#be574d');
  border.setEnabled(true);
 }
 hide();
 return {show,hide,dispose(){grid.dispose();footprint.dispose();border.dispose();material.dispose();}};
}
