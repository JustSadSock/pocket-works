// Purpose-specific furniture. Hand-built silhouettes reuse the existing
// rounded/woodworking primitives and never add placeholder 3D tiles.
export function buildExtraFurniture(scene,item,root,M,cloth,timber,{box,orb,cylinder,MeshBuilder}){
 const t=item.type;
 const w=(item.size||[1,1])[0];
 const surface=cloth;
 if(['diningtable','teatable'].includes(t)){
  const top=t==='teatable'?.66:.80,width=t==='teatable'?1.30:2.15,depth=t==='teatable'?1.17:1.35;
  box(scene,'solid-dining-top',root,timber,width,.14,depth,0,top-.07,0,.07);
  for(const x of [-width/2+.17,width/2-.17])for(const z of [-depth/2+.17,depth/2-.17])
   cylinder(scene,'turned-table-leg',root,M.wood,x,(top-.14)/2,z,.13,top-.14,.17);
  box(scene,'wooden-table-apron',root,M.wood,width-.24,.10,depth-.18,0,top-.19,0,.02);
  return true;
 }
 if(['kitchenunit','sink','stove','fridge','toybox','vanity','chest'].includes(t)){
  const widths={kitchenunit:1.72,sink:1.21,stove:.91,fridge:.98,toybox:1.10,vanity:1.30,chest:1.24};
  const depths={kitchenunit:.75,sink:.76,stove:.8,fridge:.85,toybox:.72,vanity:.79,chest:.73};
  const heights={kitchenunit:.96,sink:.94,stove:.90,fridge:2.36,toybox:.69,vanity:.83,chest:.68};
  const width=widths[t],depth=depths[t],height=heights[t];
  box(scene,'cabinet-wooden-volume',root,timber,width,height-.1,depth,0,(height-.1)/2+.04,0,.08);
  if(t==='fridge'){
   box(scene,'refrigerator-upper-door',root,surface,width-.09,.69,.044,0,1.94,depth/2+.025,.035);
   box(scene,'refrigerator-lower-door',root,surface,width-.09,1.30,.044,0,.88,depth/2+.025,.04);
   for(const y of [1.78,.99])box(scene,'refrigerator-handle',root,M.metal,.042,.29,.068,width/2-.14,y,depth/2+.083,.018);
  }else{
   box(scene,'solid-joinery-top',root,t==='stove'?M.darkWood:timber,width+.035,.08,depth+.035,0,height-.03,0,.03);
   if(t==='sink'){
    box(scene,'stainless-basin-rim',root,M.metal,.75,.018,.49,0,height+.026,0,.065);
    box(scene,'dark-sink-inset',root,M.darkWood,.58,.009,.33,0,height+.04,0,.04);
    cylinder(scene,'standing-water-tap',root,M.metal,0,height+.23,-.27,.048,.37);
    box(scene,'faucet-spout',root,M.metal,.26,.045,.046,.11,height+.39,-.27,.022);
   }else if(t==='stove'){
    for(const x of [-.20,.20])for(const z of [-.20,.20])
     cylinder(scene,'individual-hob',root,M.metal,x,height+.019,z,.20,.02);
    box(scene,'oven-glass-window',root,M.darkWood,width-.17,.34,.028,0,.51,depth/2+.038,.04);
    box(scene,'oven-curved-handle',root,M.metal,.49,.06,.08,0,.77,depth/2+.093,.02);
   }else if(t==='vanity'){
    box(scene,'vanity-oval-wood-mirror',root,M.wood,.73,1.03,.10,0,height+.57,-depth/2+.055,.17);
    box(scene,'vanity-shiny-glass',root,M.glass,.58,.85,.018,0,height+.58,-depth/2+.121,.13);
    box(scene,'vanity-drawer',root,surface,.76,.18,.045,0,.56,depth/2+.032,.02);
   }else if(['toybox','chest'].includes(t)){
    box(scene,'hinged-painted-lid',root,surface,width+.025,.14,depth+.025,0,height+.01,0,.07);
    box(scene,'brass-chest-lock',root,M.metal,.14,.15,.045,0,height*.50,depth/2+.035,.028);
    for(const x of [-width/2+.13,width/2-.13])
     box(scene,'oak-corner-reinforcement',root,M.wood,.045,height*.67,.042,x,height*.49,depth/2+.042,.02);
   }else{
    for(const x of [-width*.245,width*.245]){
     box(scene,'shaker-front-door',root,surface,width*.43,height-.24,.035,x,height*.48,depth/2+.03,.045);
     orb(scene,'brass-cabinet-pull',root,M.metal,x*.35,height*.52,depth/2+.075,.052,.052,.035);
    }
   }
  }
  return true;
 }
 if(['diningchair','officechair'].includes(t)){
  const office=t==='officechair',width=office?.85:.72,depth=office?.85:.78,h=office?.65:.55;
  box(scene,'thick-chair-seat',root,surface,width-.06,.15,depth-.08,0,h,0,.075);
  box(scene,'chair-curved-back',root,surface,width-.12,.76,.15,0,h+.45,-depth/2+.07,.065);
  for(const x of [-width/2+.15,width/2-.15])for(const z of [-depth/2+.13,depth/2-.13])
   cylinder(scene,'chair-foot',root,M.wood,x,h/2,z,.09,h,.19);
  if(office)for(const x of [-width/2+.025,width/2-.025])
   box(scene,'oak-arm-support',root,timber,.075,.05,.56,x,h+.25,0,.024);
  return true;
 }
 if(t==='crib'){
  box(scene,'cradle-mattress',root,M.cream,1.10,.15,1.65,0,.47,0,.09);
  for(const z of [-.84,.84]){
   box(scene,'crib-solid-end',root,timber,1.25,.69,.10,0,.66,z,.049);
   for(const x of [-.48,.48])cylinder(scene,'turned-crib-post',root,M.wood,x,.37,z,.075,.73);
  }
  for(const x of [-.59,.59]){
   box(scene,'upper-crib-rail',root,timber,.075,.10,1.60,x,.80,0,.02);
   for(let z=-.57;z<=.60;z+=.23)cylinder(scene,'crib-vertical-spindle',root,M.wood,x,.54,z,.04,.54);
  }
  box(scene,'baby-quilt',root,surface,1.03,.07,.84,0,.59,.33,.04);
  return true;
 }
 if(t==='cutlery'){
  cylinder(scene,'ceramic-dinner-plate',root,M.cream,0,.033,0,.34,.055);
  cylinder(scene,'enamel-center',root,surface,0,.065,0,.21,.008);
  for(const x of [-.24,.24])box(scene,'silver-cutlery',root,M.metal,.028,.017,.28,x,.058,0,.012);
  return true;
 }
 if(t==='deskorganizer'){
  box(scene,'oak-pencil-tray',root,timber,.38,.13,.32,0,.08,0,.026);
  for(const x of [-.12,.0,.12])cylinder(scene,'colored-pencil',root,M.wood,x,.28,-.055,.026,.36);
  box(scene,'paper-notebook',root,M.paper,.22,.028,.12,.01,.15,.12,.012);
  return true;
 }
 if(t==='starwall'){
  // Five shallow triangular petals form a soft stitched five-point wall star.
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5;
   const ray=box(scene,'star-felt-petal',root,surface,.18,.38,.065,Math.sin(a)*.13,Math.cos(a)*.13,.035,.07);
   ray.rotation.z=-a;
  }
  orb(scene,'embroidered-star-center',root,M.cream,0,0,.075,.16,.16,.068);
  return true;
 }
 if(t==='curtains'){
  box(scene,'curtain-rail',root,M.wood,1.77,.068,.09,0,.66,0,.022);
  for(const x of [-.43,.43]){
   box(scene,'linen-drape',root,surface,.67,1.31,.12,x,-.07,.03,.04);
   for(const dx of [-.22,0,.22])box(scene,'linen-curtain-pleat',root,surface,.045,1.27,.034,x+dx,-.07,.119,.012);
  }
  return true;
 }
 return false;
}
