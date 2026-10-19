// Hand-authored pixel characters. Profile imagery is rendered only as pixels,
// never as SVG/HTML supplied by a user. The drawing badges remain small so
// different hats/coats do not gain a gameplay silhouette advantage.
import {DEFAULT_APPEARANCE,cosmeticFeatures} from './avatar-profile.mjs';
import {mage} from './mages.mjs';

export function drawMage(ctx,look=DEFAULT_APPEARANCE,{x=0,y=0,enemy=false,alpha=1,scale=1,time=0,shield=0,flash=0,runes=[],mageId='kindle',casting=0,dashing=0,face=0,moving=0,pose=null}={}){
 if(!ctx)return;
 const p=enemy&&(!look||look.source==='guest')?{...DEFAULT_APPEARANCE,source:'rival',colors:['#b26258','#ecc08f','#7a393f']}:(look||DEFAULT_APPEARANCE);
 const [coat,trim,shade]=p.colors,maskot=p.mascot,features=cosmeticFeatures(runes),character=mage(mageId),isCasting=casting>.06;
 const stride=Math.min(1,Math.max(0,pose?.move??moving));
 const gaitPhase=pose?.step??time*16,walk=Math.sin(gaitPhase)*stride;
 const footSpread=pose?.footSpread||0,weight=pose?.weight||1;
 const castDuration=.56*character.reload;
 const castPhase=casting>0?Math.max(0,1-casting/castDuration):1;
 const castPower=casting>0?Math.max(0,Math.sin((.15+.85*castPhase)*Math.PI)):0;
 const recoil=casting>0?Math.pow(Math.max(0,1-castPhase*5),1.55)*(character.school==='stone'?6.2:character.school==='fire'?4.5:2.8):0;
 const lean=(dashing>0?4:Math.sin(time*11)*.8*stride)+(pose?.lean||0);
 const hitFlinch=pose?.impact||0,guardPose=pose?.guard||0;
 const shake=flash>0&&!pose?.still?Math.sin(time*65)*1.5:0;
 const elementColor=character.school==='storm'?'#bcefe0':character.school==='stone'?'#d5d8aa':'#ffd29a';
 const px=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))};
 const arc=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()};
 ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
 ctx.translate(Math.round(x+shake-Math.cos(face)*recoil),Math.round(y-Math.sin(face)*recoil+(pose?.still?0:Math.sin(time*(dashing>0?19:9)+(enemy?3:0))*(dashing>0?2.5:1.1))));
 const dir=Math.cos(face);ctx.scale((dir<-.12?-1:1)*scale,scale);ctx.translate(lean,0);
 // Tight shadow and feet establish a stable battle hitbox.
 ctx.fillStyle='#101c1eb8';ctx.beginPath();ctx.ellipse(0,12,17,6,0,0,Math.PI*2);ctx.fill();
 // Feet stay planted in the world; the torso compresses separately.
 // The heavy stone schools stomp slowly, while the wire family scissoring
 // has a faster gait. These motions NEVER move the authoritative hitbox.
 const stepSize=2.8/Math.sqrt(weight);
 const leftX=-9-footSpread*.55-Math.sin(gaitPhase)*stepSize*stride;
 const rightX=5+footSpread*.55+Math.sin(gaitPhase)*stepSize*stride;
 const leftY=6+Math.max(0,walk)*1.7, rightY=6+Math.max(0,-walk)*1.7;
 px(leftX-1,leftY+2,9,11,'#132a27');
 px(rightX-1,rightY+2,9,11,'#132a27');
 px(leftX,leftY,7,12,'#32463a');px(rightX,rightY,7,12,'#32463a');
 px(leftX-1,leftY+10,9,5,'#1c2a28');px(rightX-1,rightY+10,9,5,'#1c2a28');
 px(leftX-2,leftY+13,11,3,trim);px(rightX-2,rightY+13,11,3,trim);
 if(stride>.23){
  px(leftX+2,leftY+2,2,4,'#718071');px(rightX+2,rightY+2,2,4,'#718071');
 }

 // Cape material flares under sprint; folds settle while standing still.
 const capeSwing=(dashing>0?9:stride*4)+(pose?.cloth||0);
 // Volumetric stitched cape with two loose tails, an anchored shoulder and
 // a dark underside: cloth bends late compared with body acceleration.
 ctx.fillStyle='#162d28';ctx.beginPath();
 ctx.moveTo(-12,-5);ctx.lineTo(-21-capeSwing*.8,6);
 ctx.lineTo(-25-capeSwing*1.5,20);ctx.lineTo(-14-capeSwing*.5,16);
 ctx.lineTo(-8,5);ctx.closePath();ctx.fill();
 ctx.fillStyle=shade;ctx.beginPath();
 ctx.moveTo(-12,-5);ctx.lineTo(-20-capeSwing*.6,4);
 ctx.lineTo(-23-capeSwing*1.3,16);ctx.lineTo(-14-capeSwing*.45,14);
 ctx.lineTo(-8,0);ctx.closePath();ctx.fill();
 px(-18-capeSwing*.7,11,6,3,trim);
 px(-16-capeSwing*.4,-1,2,14,'#b3ab864f');
 // Torso bends and head lags behind without shifting the feet or shadow.
 ctx.save();
 ctx.translate(0,pose?.bodyBob||0);
 ctx.rotate(Math.max(-.13,Math.min(.13,(lean+hitFlinch*-.9)*.016)));
 // Split layered coat, beveled collar, independent swinging hem and sash.
 px(-12,-5,24,18,'#162923');
 px(-12,-6,24,18,coat);px(-13,4,26,9,shade);
 px(-10,7,20,6,coat);px(-12,-4,5,11,trim);px(8,-4,5,11,trim);
 ctx.fillStyle=shade;ctx.beginPath();
 ctx.moveTo(-12,9);ctx.lineTo(-10,18);ctx.lineTo(-2,16);
 ctx.lineTo(-1,9);ctx.closePath();ctx.fill();
 ctx.fillStyle=coat;ctx.beginPath();
 ctx.moveTo(2,9);ctx.lineTo(2,16);ctx.lineTo(11,18);
 ctx.lineTo(12,8);ctx.closePath();ctx.fill();
 px(-11,10,3,6,'#101f1ba6');px(9,10,2,6,'#14251f9e');
 px(-9,-5,18,2,trim);px(-7,-2,3,9,'#fff4c92b');
 px(-8,5,16,3,trim);px(-1,5,2,4,'#2b4137');
 // Opposing arm counterbalances the striking hand; block folds inward.
 const offHandY=-6+(guardPose>0?-5*guardPose:Math.sin(gaitPhase+Math.PI)*stride*2);
 px(-16,offHandY-1,6,12,shade);
 px(-17,offHandY+7,8,4,trim);
 px(-18,offHandY+10,5,4,'#d5b698');
 // Each class has its own material rather than six recolored fireballs.
 if(character.school==='storm'){px(-11,-2,4,13,'#80ada6');px(7,-2,4,13,'#89c5c0');px(-5,9,10,2,'#b3ddd0')}
 if(character.school==='stone'){px(-15,-2,6,13,'#7c8f81');px(10,-2,6,13,'#7c8f81');px(-13,9,26,3,'#a5af8d')}
 if(character.school==='fire'){px(-11,7,4,5,'#d89561');px(7,7,4,5,'#e9b270')}
 px(-4,2,9,3,trim);px(0,-5,2,13,'#132522a8');
 px(-8,11,7,5,shade);px(4,11,7,5,shade);if(stride>0){px(-10,9+walk,4,3,trim);px(9,9-walk,4,3,trim)}
 if(maskot?.clothes==='vest'||maskot?.clothes==='groom'){
  px(-10,-4,8,11,'#34535a');px(4,-4,7,11,'#34535a');px(-2,-4,5,12,'#eee7c7');
 }
 if(maskot?.clothes==='mantle'||maskot?.clothes==='tabard'||maskot?.clothes==='restorer'){
  px(-13,-3,5,17,shade);px(9,-3,5,17,shade);px(-11,10,22,4,trim);
  if(maskot.clothes==='tabard'){px(-6,1,12,3,'#c44c52');px(-1,-3,3,16,'#c44c52')}
  if(maskot.clothes==='restorer')px(-5,6,10,4,'#d7b46d');
 }
 if(maskot?.clothes==='spacesuit'||maskot?.clothes==='wedding'){
  px(-12,-5,24,12,'#ddd9d0');px(-7,6,15,6,coat);
 }
 // Neck pivots and head follows the shoulders with delayed motion.
 // Keep all MASKOT hat, face and crown artwork within this pivot.
 ctx.save();
 ctx.translate(hitFlinch*1.8, -(pose?.headBob||0));
 ctx.rotate(pose?.headTilt||0);
 // The family silhouette from an official MASKOT remains visible: ears/domes
 // protrude from the wizard hat and do not compete with spells or collision.
 if(maskot?.animal==='cat'){
  px(-10,-27,6,12,trim);px(5,-27,6,12,trim);
  px(-7,-25,2,6,'#ca8d89');px(7,-25,2,6,'#ca8d89');
 }else if(maskot?.animal==='rabbit'){
  px(-7,-43,5,23,trim);px(4,-42,5,22,trim);
  px(-5,-40,2,16,'#d8969a');px(6,-39,2,16,'#d8969a');
 }else if(maskot?.animal==='frog'){
  px(-9,-18,9,9,'#9acb77');px(2,-18,9,9,'#9acb77');
  px(-7,-16,4,4,'#f0f1de');px(4,-16,4,4,'#f0f1de');
 }
 const skinTone=maskot?.animal==='frog'?'#93bb72':maskot?.animal==='rabbit'?'#ebd2ba':maskot?.animal==='cat'?'#d1ac91':'#d6b395';
 px(-7,-16,14,15,skinTone);
 px(-5,-12,3,3,'#273c34');px(3,-12,3,3,'#273c34');px(-4,-5,8,2,maskot?.animal==='frog'?'#547f55':'#ae7c69');
 if(maskot?.face==='glasses'||maskot?.face==='monocle'){
  px(-7,-14,7,6,'#e6dec0');px(-6,-13,5,4,'#32433d');px(1,-14,7,6,trim);px(2,-13,5,4,'#32433d');px(-1,-12,2,2,trim);
 }
 if(maskot?.face==='stars'){px(-9,-10,3,3,'#e8ca69');px(9,-10,3,3,'#e8ca69')}
 // Wizard hat adapts to actual MASKOT hat rather than hiding it.
 if(maskot?.hat==='beret'){
  px(-14,-24,24,10,'#8f729d');px(-10,-30,18,8,'#8f729d');px(1,-33,3,6,trim);
 }else if(maskot?.hat==='bascinet'||maskot?.hat==='helmet'){
  px(-11,-26,22,13,'#8398a3');px(-7,-30,15,6,'#b2c6bf');px(-12,-15,24,4,'#596b70');px(-8,-24,5,3,trim);px(4,-24,5,3,trim);
 }else{
  px(-13,-18,26,5,trim);px(-8,-26,16,11,coat);px(-4,-33,10,9,coat);px(4,-29,5,7,coat);px(-6,-22,15,3,shade);px(-9,-17,19,2,'#efe0aa');
 }
 if(maskot?.hat==='crown'){
  px(-7,-31,15,5,'#d9b464');px(-7,-37,4,8,'#e2c078');px(-1,-40,4,11,'#e2c078');px(6,-37,4,8,'#e2c078');px(-1,-30,3,3,'#bd6060');
 }
 if(maskot?.hat==='flower'){
  px(7,-31,6,5,'#f0dfd8');px(9,-37,5,8,'#f0dfd8');px(5,-33,10,3,'#f2e6da');px(9,-32,3,3,'#e3ad69')
 }
 if(maskot?.hat==='brush'){px(10,-36,3,18,'#bb8c62');px(9,-40,5,6,'#334f62')}
 if(maskot?.hat==='veil'){px(-13,-27,4,33,'#e9d5d9');px(10,-27,4,33,'#e9d5d9')}
 ctx.restore();
 // Readable class silhouettes are equipment, not replacements for the Pocket ID face or hat.
 // Every fighter has a different silhouette even when all six use the same avatar.
 switch(character.id){
 case 'kindle':
  px(-19,-17,6,5,'#b3543e');px(-18,-21,4,7,'#eaa15b');px(-17,-25,2,5,'#f8e0a2');
  px(-17,-7,6,14,'#9d5541');px(-16,7,5,4,'#e0a06e');break;
 case 'cinder':
  px(-19,-20,7,27,'#4a4742');px(-21,-15,3,19,'#7f6660');
  px(-19,-27,6,7,'#6e5a4f');px(-17,-30,3,4,'#c49b78');
  px(9,8,7,6,'#4a3939');break;
 case 'wire':
  px(-18,-12,4,24,'#3e7276');px(-18,-20,3,11,'#b6d4c4');
  px(-22,-23,10,3,'#7cb9b8');px(-20,-28,3,5,'#dcf9d7');
  px(-17,4,5,3,'#b3e9dc');break;
 case 'coil':
  px(-21,-14,8,25,'#a57255');px(-23,-18,11,5,'#d8ac81');
  px(-22,-11,10,4,'#dea57c');px(-22,-3,10,4,'#dea57c');
  px(-22,5,10,4,'#dea57c');px(-17,-24,4,6,'#a7d5cb');break;
 case 'pebble':
  px(-20,-13,10,17,'#697970');px(-18,-16,9,5,'#afbba1');
  px(11,-11,9,14,'#77897a');px(12,-15,8,5,'#b2bfa2');
  px(-15,7,7,8,'#60786a');break;
 case 'slate':
  px(-23,-14,10,29,'#53685d');px(-24,-18,12,5,'#a0af94');
  px(-21,-10,5,16,'#84977e');px(12,-13,9,23,'#657768');
  px(13,-17,8,5,'#b7c3a4');px(12,6,10,4,'#9aa990');break;
 }
 if(p.source==='preset'){
  // The eight standard Pocket ID presets get different badges.
  const motifs={sun:'sun',wave:'wave',ember:'ember',moss:'moss',ink:'ink',plum:'plum',stone:'stone',clay:'clay'};
  switch(motifs[p.preset]){
   case 'sun':px(-3,-29,5,5,'#f9e7a2');break;
   case 'wave':px(-7,-23,5,2,trim);px(2,-20,5,2,trim);break;
   case 'ember':px(-2,-34,3,5,'#f5cd83');break;
   case 'moss':px(-10,-22,3,6,'#b6df95');break;
   case 'ink':px(-4,-28,8,3,'#d1dddd');break;
   case 'plum':px(6,-25,3,4,'#e3aed5');break;
   case 'stone':px(-8,-26,3,8,'#b0bdab');break;
   default:px(3,-25,4,3,trim);
  }
 }
 if(p.source==='drawing'&&p.artCanvas){
  // The owner's ACTUAL drawn image survives as a legible pixel cameo on the
  // coat, not an arbitrary color-only recolor. The full drawing is in HUD.
  ctx.save();ctx.imageSmoothingEnabled=false;px(-8,-1,16,14,'#1b3631');
  ctx.drawImage(p.artCanvas,-6,0,12,12);ctx.restore();
 }else if(!maskot) {
  px(-3,2,6,6,trim);px(-1,4,2,3,shade);
 }
 // Each mage has a signature *object* and casting gesture, not a
 // recolored copy of the same staff. Account-derived coat/face stay unobscured.
 const activeStrike=pose?.attack||0;
 const thrust=isCasting?castPower:0;
 const handSwing=character.id==='cinder'?Math.sin(castPhase*Math.PI)*7
  :character.id==='wire'?activeStrike*9
  :character.id==='coil'?Math.sin(castPhase*12)*thrust*3
  :character.id==='pebble'?-activeStrike*4
  :character.id==='slate'?-activeStrike*7:activeStrike*5;
 const lift=character.school==='stone'?thrust*9:thrust*12;
 const handX=14+thrust*8+handSwing,handY=-5-lift;
 const topY=handY-24-thrust*(character.school==='stone'?4:7),shaft='#9a7958';
 px(7+thrust*4,handY-1,9,6,coat);
 px(handX-2,handY,6,5,trim);
 const beam=(x0,y0,x1,y1,color,width=2)=>{ctx.strokeStyle=color;ctx.lineWidth=width;
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke()};
 switch(character.id){
 case 'kindle':{
  // Split brass wand cradles a permanent blue-white flame.
  beam(handX,handY+9,handX+2,topY-2,shaft,3);
  beam(handX-4,topY+4,handX-4,topY-8,'#dca66e',3);
  beam(handX+7,topY+4,handX+7,topY-8,'#dca66e',3);
  px(handX-2,topY-12,6,9,'#f6a15b');
  px(handX,topY-16,3,7,'#ffe6a1');
  if(isCasting){beam(handX+3,topY-19,handX+6+thrust*5,topY-24,'#fbcb83',2);
   px(handX-8,topY-13,3,4,'#dd7950')}
  break;
 }
 case 'cinder':{
  // Incense censer on a short chain; ash and embers fly on release.
  beam(handX,handY+6,handX+5,topY+4,'#a6a099',2);
  for(let j=0;j<4;j++)px(handX+5+j%2,topY+5+j*5,2,3,'#d2ba92');
  px(handX+1,topY+23,14,10,'#594e46');px(handX+3,topY+21,10,4,'#a57559');
  px(handX+5,topY+25,6,4,'#ef9a65');
  if(isCasting){px(handX+10+thrust*4,topY+10,4,5,'#f4c48e');
   px(handX+1,topY+6-thrust*5,3,3,'#c1b4a0')}
  break;
 }
 case 'wire':{
  // Thin bifurcated conductor; twin needle antennas spark at different angles.
  beam(handX,handY+9,handX+1,topY+7,'#679f9f',3);
  beam(handX+1,topY+7,handX-8-thrust*3,topY-7,'#9bd9d3',3);
  beam(handX+1,topY+7,handX+10+thrust*4,topY-11,'#9bd9d3',3);
  px(handX-11-thrust*3,topY-11,5,5,'#f0f9d7');
  px(handX+8+thrust*4,topY-14,5,5,'#f0f9d7');
  if(isCasting)beam(handX-6,topY-16,handX+8,topY-21,'#f2f8e2',2);
  break;
 }
 case 'coil':{
  // Distinct double copper helix, oscillating separately around its central rod.
  beam(handX,handY+9,handX+1,topY-6,'#c28e64',3);
  for(let j=0;j<4;j++){
   const rise=topY-5+j*8;
   beam(handX-6,rise,handX+7,rise-2,'#e8b689',3);
   px(handX-7,rise-3,4,4,'#96d2ca');
  }
  px(handX-2,topY-13,7,7,'#daf8e1');
  if(isCasting){ctx.strokeStyle='#e3f5e1';ctx.lineWidth=2;ctx.beginPath();
   ctx.arc(handX,topY-4,10+thrust*3,-1.4,1.4);ctx.stroke()}
  break;
 }
 case 'pebble':{
  // Worn chisel-mallet, with a broad and uneven heavy head.
  beam(handX,handY+10,handX+4,topY+2,'#998767',5);
  px(handX-8,topY-13,28,13,'#667d70');
  px(handX-10,topY-17,25,6,'#bac2a0');
  px(handX+12,topY-8,7,7,'#324e43');
  px(handX-6,topY-8,5,4,'#e2ddb4');
  if(isCasting)px(handX+18,topY-15,4,3,'#cdd7a8');
  break;
 }
 case 'slate':{
  // A shield-sized upright stone blade, heavy enough to displace the air.
  beam(handX,handY+9,handX+3,topY+5,'#8c7b66',5);
  ctx.fillStyle='#657a6a';ctx.beginPath();
  ctx.moveTo(handX-9,topY+4);ctx.lineTo(handX-7,topY-20);
  ctx.lineTo(handX+9,topY-27);ctx.lineTo(handX+19,topY-6);
  ctx.lineTo(handX+12,topY+6);ctx.closePath();ctx.fill();
  beam(handX-7,topY-19,handX+9,topY-25,'#c3cbaa',3);
  beam(handX+9,topY-25,handX+13,topY+2,'#364e42',2);
  if(isCasting)beam(handX+8,topY-15,handX-2,topY-4,'#e3dfb0',2);
  break;
 }
 }
 // Broad cast gestures use a forearm and recoil rather than moving the
 // entire fighter sprite; position/hitbox remain owned by core.mjs.
 if(isCasting){
  px(8+thrust*4,-8-thrust*4,6,5,coat);
  px(handX-3,handY-1,4,4,'#ddbc96');
 }
 if(character.trait==='dash_haste'){px(-15,7,4,3,'#9de4c9');px(-19,9,3,3,'#90c2ba')}
 if(character.trait==='guard_extra'){px(-17,-9,7,5,'#c0c5a5')}
 if(character.trait==='hit_push'){px(10,9,7,4,'#95a186')}
 if(character.trait==='burn'){px(-9,-32,3,4,'#efb074')}
 if(character.trait==='guard_slow'){px(-12,-8,4,3,'#9dd3c7')}
 if(character.trait==='miss_cool'){px(-8,-33,5,3,'#cfad87')}
 if(isCasting){px(9,-3,9,4,character.school==='storm'?'#b6e6db':character.school==='stone'?'#b7c4a3':'#ffc588')}
 // A real raised elbow, sweeping shaft and hand-written spark strokes:
 // casting the weapon is more than translating a static staff upwards.
 if(isCasting){
  const reach=9+castPower*8,up=12+castPower*10;
  px(9-reach*.2,-4-up*.1,9,5,coat);px(16-reach*.2,-6-up*.1,5,5,faceColorOrTrim(trim));
  ctx.save();ctx.strokeStyle='#9c7852';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(16,-15);ctx.lineTo(17+reach*.55,-36-up);ctx.stroke();
  ctx.strokeStyle=elementColor;ctx.lineWidth=2;ctx.beginPath();ctx.arc(17+reach*.55,-40-up,4+castPower*3,-.7,2.2);ctx.stroke();
  ctx.fillStyle='#f9f0d6';ctx.fillRect(Math.round(16+reach*.55),Math.round(-41-up),3,3);
  ctx.restore();
 }
 function faceColorOrTrim(value){return value||'#cdb6a0'}
 if(dashing>0){px(-19,5,6,4,'#a3c4ad');px(-23,10,7,2,'#668b7b');
  px(-31,1,12,3,'#c2c6a790');px(-38,7,14,2,'#96a89a80');px(-42,-8,9,2,'#aabfa087')}
 // Build-driven alterations have distinct silhouettes and material cues.
 if(features.stone){px(-17,-5,7,9,'#859383');px(11,-5,7,9,'#859383');px(-16,-6,5,3,'#ced5ac');px(12,-6,5,3,'#ced5ac')}
 if(features.ember){px(-12,-33,3,5,'#f0a267');px(-12,-36,2,3,'#ffe0a0');px(17,-17,4,5,'#f8b86a')}
 if(features.echoes){ctx.globalAlpha*=.72;px(-20,1,5,10,trim);px(-24,4,4,7,coat);ctx.globalAlpha=Math.max(0,Math.min(1,alpha))}
 if(features.healing){px(-8,6,3,7,'#a0d19b');px(6,7,3,6,'#a0d19b')}
 if(features.frost){px(-7,-20,5,2,'#8cc8ca');px(3,-21,5,2,'#8cc8ca')}
 if(features.spark){px(-15,-35,3,3,'#fbdc99');px(14,-32,3,3,'#fbdc99')}
 if(features.haste){px(-12,11,6,2,'#e0c599');px(8,11,7,2,'#e0c599')}
 if(guardPose>.24){
  // This pose braces the off-hand and the coat, even before the shield
  // fades: guard has a clear bodily action instead of only a glowing ring.
  px(-17,-10-guardPose*4,6,7,shade);
  px(-20,-13-guardPose*4,6,4,trim);
  ctx.strokeStyle='#e1dbacaa';ctx.lineWidth=2;ctx.beginPath();
  ctx.arc(-12,-8,10+guardPose*5,-2.3,-.8);ctx.stroke();
 }
 if(hitFlinch>.08){
  px(-12,-5,4+hitFlinch*6,3,'#e3c49e');
  px(9,-13,4,3,'#fff2d0');
 }
 if(shield>0){ctx.strokeStyle='#b6d9b4bb';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();ctx.arc(0,-7,27,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);px(-20,-17,3,6,'#f7e3b0');px(20,0,3,6,'#f7e3b0')}
 if(enemy){px(-11,17,22,3,'#a84b42');px(-8,20,16,2,'#e4a28a')}
 if(flash>0){ctx.globalAlpha=Math.min(.65,flash*3.1);px(-16,-35,32,53,'#fff2bf');ctx.globalAlpha=Math.max(0,Math.min(1,alpha))}
 // Class-specific hem response at the end of an attack.
 if(activeStrike>.05){
  if(character.school==='stone'){
   px(-17,11,9,3,'#b0b69a');px(-23,13,7,2,'#879586');
  }else if(character.school==='storm'){
   px(-21,-4,9,2,'#8cd0c5');px(-27,2,7,2,'#537e80');
  }else{
   px(-18,11,7,3,'#ac6750');px(-21,14,5,2,'#de9869');
  }
 }
 // Very short-lived class wisps around the casting tip, with no persistent glow.
 if(isCasting&&!pose?.still){
  for(let i=0;i<3;i++){const angle=time*9+i*2.09,rx=20+Math.cos(angle)*8,ry=-44+Math.sin(angle)*7;
   px(rx,ry,2+(i%2),2,elementColor)}
 }
 ctx.restore(); // torso pose
 ctx.restore(); // actor root
}
export function drawPortrait(ctx,appearance=DEFAULT_APPEARANCE,size=48){
 ctx.clearRect(0,0,size,size);ctx.imageSmoothingEnabled=false;
 const c=appearance.colors||DEFAULT_APPEARANCE.colors;
 ctx.fillStyle='#1c302b';ctx.fillRect(0,0,size,size);
 ctx.fillStyle=c[0];ctx.fillRect(3,3,size-6,size-6);
 ctx.fillStyle=c[2];ctx.fillRect(6,6,size-12,size-12);
 if(appearance.source==='drawing'&&appearance.artCanvas){
  const pad=Math.max(2,Math.floor(size*.08));
  ctx.drawImage(appearance.artCanvas,pad,pad,size-2*pad,size-2*pad);
 }else{
  const k=size/66;drawMage(ctx,appearance,{x:size/2,y:size*.74,scale:k,time:0});
 }
}
export function drawHero(ctx,appearance=DEFAULT_APPEARANCE,time=0,runes=[],mageId='kindle'){
 ctx.clearRect(0,0,128,156);ctx.imageSmoothingEnabled=false;
 // An earthbound oval instead of another floating decorative stat panel.
 ctx.fillStyle='#30443b';ctx.beginPath();ctx.ellipse(63,133,48,10,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#8a8c6b';ctx.fillRect(22,137,83,3);
 drawMage(ctx,appearance,{x:64,y:108,scale:2.45,time,runes,shield:0,mageId});
}
