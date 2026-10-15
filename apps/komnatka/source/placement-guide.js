import { MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';

// The snap indicator is intentionally small: three quiet lines around the
// snapped cell and a thin true-size silhouette, not a red carpet of grid lines.
export function createPlacementGuide(scene){
 const lines=[];
 for(const offset of [-.25,0,.25]){
  lines.push([new Vector3(offset,0,-.375),new Vector3(offset,0,.375)]);
  lines.push([new Vector3(-.375,0,offset),new Vector3(.375,0,offset)]);
 }
 const grid=MeshBuilder.CreateLineSystem('placement-grid',{lines},scene);
 grid.isPickable=false;
 grid.color=Color3.FromHexString('#c1a995');
 grid.alpha=.17;
 const footprint=MeshBuilder.CreateGround('placement-footprint',{width:1,height:1},scene);
 footprint.isPickable=false;
 const material=new StandardMaterial('placement-footprint-material',scene);
 material.disableLighting=true;material.backFaceCulling=false;material.alpha=.065;
 material.diffuseColor=Color3.FromHexString('#b5c4ae');
 footprint.material=material;
 const border=MeshBuilder.CreateLines('placement-outline',{points:[
  new Vector3(-.5,0,-.5),new Vector3(.5,0,-.5),new Vector3(.5,0,.5),
  new Vector3(-.5,0,.5),new Vector3(-.5,0,-.5)
 ]},scene);
 border.isPickable=false;border.alpha=.64;
 function hide(){grid.setEnabled(false);footprint.setEnabled(false);border.setEnabled(false);}
 function show({x,z,y=0,width=1,depth=1,valid=true,wall=false}){
  if(wall){hide();return;}
  const elevation=y+.034;
  grid.position.set(x,elevation,z);
  grid.alpha=valid?.17:.075;
  grid.setEnabled(true);
  footprint.position.set(x,elevation+.004,z);
  footprint.scaling.set(Math.max(.1,width),1,Math.max(.1,depth));
  material.diffuseColor=Color3.FromHexString(valid?'#b7c8b0':'#d5b6a4');
  material.alpha=valid?.065:.035;
  footprint.setEnabled(true);
  border.position.set(x,elevation+.009,z);
  border.scaling.set(Math.max(.1,width),1,Math.max(.1,depth));
  border.color=Color3.FromHexString(valid?'#91a688':'#b5826b');
  border.alpha=valid?.58:.76;
  border.setEnabled(true);
 }
 hide();
 return {show,hide,dispose(){grid.dispose();footprint.dispose();border.dispose();material.dispose();}};
}
