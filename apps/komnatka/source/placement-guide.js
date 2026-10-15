import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

// A world-space placement ruler: it follows the actual 0.25-unit game grid,
// unlike an overlay fixed to the screen. None of its meshes can intercept picks.
export function createPlacementGuide(scene) {
 const step=.25,half=1.5,lines=[];
 for(let i=-half;i<=half+0.001;i+=step){
  lines.push([{x:i,y:0,z:-half},{x:i,y:0,z:half}]);
  lines.push([{x:-half,y:0,z:i},{x:half,y:0,z:i}]);
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
  {x:-.5,y:0,z:-.5},{x:.5,y:0,z:-.5},{x:.5,y:0,z:.5},{x:-.5,y:0,z:.5},{x:-.5,y:0,z:-.5}
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
