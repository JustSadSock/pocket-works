// Hand-authored pixel characters. Profile imagery is rendered only as pixels,
// never as SVG/HTML supplied by a user. The drawing badges remain small so
// different hats/coats do not gain a gameplay silhouette advantage.
import {DEFAULT_APPEARANCE,cosmeticFeatures} from './avatar-profile.mjs';
import {mage} from './mages.mjs';

export function drawMage(ctx,look=DEFAULT_APPEARANCE,{x=0,y=0,enemy=false,alpha=1,scale=1,time=0,shield=0,flash=0,runes=[],mageId='kindle',casting=0,dashing=0}={}){
 if(!ctx)return;
 const p=enemy&&(!look||look.source==='guest')?{...DEFAULT_APPEARANCE,source:'rival',colors:['#b26258','#ecc08f','#7a393f']}:(look||DEFAULT_APPEARANCE);
 const [coat,trim,shade]=p.colors,maskot=p.mascot,features=cosmeticFeatures(runes),character=mage(mageId),isCasting=casting>.15;
 const px=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))};
 const arc=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()};
 ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
 ctx.translate(Math.round(x),Math.round(y+Math.sin(time*(dashing>0?19:9)+(enemy?3:0))*(dashing>0?2.5:1.1)));ctx.scale((enemy?-1:1)*scale,scale);
 // Tight shadow and feet establish a stable battle hitbox.
 ctx.fillStyle='#101c1eb8';ctx.beginPath();ctx.ellipse(0,12,17,6,0,0,Math.PI*2);ctx.fill();
 px(-9,6,6,12,'#23332d');px(5,6,6,12,'#23332d');px(-9,13,6,3,trim);px(5,13,6,3,trim);
 // A split coat, sleeves, sash, and permanent palette from account avatar.
 px(-12,-5,24,18,coat);px(-13,3,26,10,shade);
 px(-10,7,20,6,coat);px(-12,-4,5,11,trim);px(8,-4,5,11,trim);
 // Each class has its own material rather than six recolored fireballs.
 if(character.school==='storm'){px(-11,-2,4,13,'#80ada6');px(7,-2,4,13,'#89c5c0');px(-5,9,10,2,'#b3ddd0')}
 if(character.school==='stone'){px(-15,-2,6,13,'#7c8f81');px(10,-2,6,13,'#7c8f81');px(-13,9,26,3,'#a5af8d')}
 if(character.school==='fire'){px(-11,7,4,5,'#d89561');px(7,7,4,5,'#e9b270')}
 px(-4,2,9,3,trim);px(0,-5,2,13,'#132522a8');
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
 const face=maskot?.animal==='frog'?'#93bb72':maskot?.animal==='rabbit'?'#ebd2ba':maskot?.animal==='cat'?'#d1ac91':'#d6b395';
 px(-7,-16,14,15,face);
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
 // Personal item stays visible even as the spell build gets out of hand.
 px(11+(isCasting?4:0),-1-(isCasting?8:0),4,10,'#c7ae80');px(14+(isCasting?5:0),-20-(isCasting?9:0),3,27,'#856b4e');
 px(12+(isCasting?5:0),-23-(isCasting?9:0),7,7,character.school==='storm'?'#9bd7d4':character.school==='stone'?'#bdc8a8':features.frost?'#8fc6c9':trim);
 px(14+(isCasting?5:0),-27-(isCasting?9:0),4,5,character.school==='storm'?'#e6ffef':features.frost?'#d4f1e7':'#fff0bb');
 if(character.trait==='dash_haste'){px(-15,7,4,3,'#9de4c9');px(-19,9,3,3,'#90c2ba')}
 if(character.trait==='guard_extra'){px(-17,-9,7,5,'#c0c5a5')}
 if(character.trait==='hit_push'){px(10,9,7,4,'#95a186')}
 if(character.trait==='burn'){px(-9,-32,3,4,'#efb074')}
 if(character.trait==='guard_slow'){px(-12,-8,4,3,'#9dd3c7')}
 if(character.trait==='miss_cool'){px(-8,-33,5,3,'#cfad87')}
 if(isCasting){px(9,-3,9,4,character.school==='storm'?'#b6e6db':character.school==='stone'?'#b7c4a3':'#ffc588')}
 if(dashing>0){px(-19,5,6,4,'#a3c4ad');px(-23,10,7,2,'#668b7b')}
 // Build-driven alterations have distinct silhouettes and material cues.
 if(features.stone){px(-17,-5,7,9,'#859383');px(11,-5,7,9,'#859383');px(-16,-6,5,3,'#ced5ac');px(12,-6,5,3,'#ced5ac')}
 if(features.ember){px(-12,-33,3,5,'#f0a267');px(-12,-36,2,3,'#ffe0a0');px(17,-17,4,5,'#f8b86a')}
 if(features.echoes){ctx.globalAlpha*=.72;px(-20,1,5,10,trim);px(-24,4,4,7,coat);ctx.globalAlpha=Math.max(0,Math.min(1,alpha))}
 if(features.healing){px(-8,6,3,7,'#a0d19b');px(6,7,3,6,'#a0d19b')}
 if(features.frost){px(-7,-20,5,2,'#8cc8ca');px(3,-21,5,2,'#8cc8ca')}
 if(features.spark){px(-15,-35,3,3,'#fbdc99');px(14,-32,3,3,'#fbdc99')}
 if(features.haste){px(-12,11,6,2,'#e0c599');px(8,11,7,2,'#e0c599')}
 if(shield>0){ctx.strokeStyle='#b6d9b4bb';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();ctx.arc(0,-7,27,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);px(-20,-17,3,6,'#f7e3b0');px(20,0,3,6,'#f7e3b0')}
 if(enemy){px(-11,17,22,3,'#a84b42');px(-8,20,16,2,'#e4a28a')}
 if(flash>0){ctx.globalAlpha=.38;px(-16,-35,32,53,'#fff2bf')}
 ctx.restore();
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
