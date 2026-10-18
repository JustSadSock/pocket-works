// ОСИ / v1.5 — four material warehouse environments, cached per scene.
// Visuals never change collision cells, solver input, robot positions or PocketNet data.
import {themeForLevel,drawFloorTheme,drawFurnitureTheme,drawThemeAccents} from './themes.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function tileHash(seed,x,y,salt=0){
 let n=(Number(seed)||0)>>>0;
 n^=Math.imul(x+23,0x9e3779b1);n^=Math.imul(y+53,0x85ebca77);n^=Math.imul(salt+17,0xc2b2ae3d);
 n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;n=Math.imul(n,0x846ca68b);n^=n>>>16;
 return n>>>0;
}
export function sceneFingerprint(level,width,height,ratio){
 if(!level||!Array.isArray(level.map))return '';
 return [level.seed||0,themeForLevel(level).id,level.width,level.height,level.map.join('/'),
  (level.goals||[]).map(p=>p.x+','+p.y).join('|'),width,height,ratio].join(':');
}
export function isWall(level,x,y){return y>=0&&y<level.height&&x>=0&&x<level.width&&level.map[y]?.[x]==='#'}
export function scenePlan(level){
 const floor=[],walls=[],shadows=[],goals=[];
 for(let y=0;y<level.height;y++)for(let x=0;x<level.width;x++){
  const tile={x,y,variant:tileHash(level.seed,x,y)%7};
  if(isWall(level,x,y)){
   walls.push(tile);
   // Shadows fall only onto nearby WALKABLE cells. Geometry stays strictly in a cell.
   if(!isWall(level,x+1,y)&&x+1<level.width)shadows.push({x:x+1,y,edge:'left'});
   if(!isWall(level,x,y+1)&&y+1<level.height)shadows.push({x,y:y+1,edge:'top'});
  }else floor.push(tile);
 }
 for(let i=0;i<(level.goals||[]).length;i++){
  const p=level.goals[i];
  if(p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&!isWall(level,p.x,p.y))goals.push({x:p.x,y:p.y,robot:i});
 }
 return {floor,walls,shadows,goals};
}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h)}
function path(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}
function plate(c,x,y,w,h,r,fill,edge,width=1){path(c,x,y,w,h,r);c.fillStyle=fill;c.fill();if(edge){c.lineWidth=width;c.strokeStyle=edge;c.stroke()}}
function line(c,x1,y1,x2,y2,col,width){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=col;c.lineWidth=width;c.stroke()}
function stud(c,x,y,r,color='#d7d5bb'){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill()}
function light(c,x,y,r,start,end){
 const v=c.createRadialGradient(x,y,0,x,y,r);v.addColorStop(0,start);v.addColorStop(1,end);
 c.fillStyle=v;c.fillRect(x-r,y-r,r*2,r*2);
}
function floorTile(c,t,u,seed,theme){
 const {x,y}=t,X=x*u,Y=y*u,n=tileHash(seed,x,y,3);
 // Warm ceramic-concrete tiles with staggered subtle pigment and articulated seams.
 rect(c,X,Y,u,u,theme.floor[n&3]);
 rect(c,X,Y,u,u*.038,'#ffffff37');rect(c,X,Y,u*.035,u,'#f7fff04d');
 rect(c,X+u*.965,Y,u*.034,u,theme.edge);
 rect(c,X,Y+u*.966,u,u*.034,theme.edge);
 if(n%9===0){
  line(c,X+u*.18,Y+u*.68,X+u*.35,Y+u*.68,'#56736c38',u*.019);
  line(c,X+u*.18,Y+u*.73,X+u*.33,Y+u*.73,'#56736c2b',u*.017);
 }
 if(n%11===1){ // scattered fine dust, deterministic and extremely sparse
  stud(c,X+u*.79,Y+u*.22,u*.018,'#97a99cbb');
  stud(c,X+u*.83,Y+u*.25,u*.01,'#8ba297a2');
 }
 if(n%13===4){ // a tiny old tire rub, NOT an obstacle
  line(c,X+u*.24,Y+u*.81,X+u*.60,Y+u*.78,'#55796a2f',u*.03);
  line(c,X+u*.27,Y+u*.86,X+u*.56,Y+u*.83,'#55796a19',u*.024);
 }
}
function wallTile(c,t,u,seed,theme){
 const {x,y}=t,X=x*u,Y=y*u,kind=t.variant;
 const inset=u*.062;
 // Shelf shadow stays under the footprint; adjoining soft shadows are drawn separately.
 plate(c,X+u*.12,Y+u*.16,u*.79,u*.77,u*.075,theme.interior,theme.shade,u*.022);
 rect(c,X+u*.15,Y+u*.85,u*.72,u*.12,theme.shade);
 const wallGradient=c.createLinearGradient(X,Y,X+u*.2,Y+u);
 wallGradient.addColorStop(0,theme.frame[0]);wallGradient.addColorStop(.22,theme.frame[1]);
 wallGradient.addColorStop(.73,theme.frame[2]);wallGradient.addColorStop(1,theme.frame[3]);
 plate(c,X+inset,Y+u*.05,u*.86,u*.78,u*.064,wallGradient,theme.shade,u*.035);
 // upper lip and material bevel — height cues without occluding walkable neighbors
 rect(c,X+u*.095,Y+u*.075,u*.80,u*.115,theme.lip);
 rect(c,X+u*.095,Y+u*.18,u*.80,u*.04,theme.frame[2]);
 rect(c,X+u*.095,Y+u*.77,u*.80,u*.07,theme.front);
 rect(c,X+u*.1,Y+u*.23,u*.065,u*.51,theme.frame[3]);
 rect(c,X+u*.824,Y+u*.23,u*.06,u*.51,theme.front);
 if(theme.id==='sorting'&&kind<=2){ // original sorting racks and timber grain
  for(let i=0;i<2;i++){
   const bx=X+u*(.19+i*.325),by=Y+u*.3,bw=u*.29;
   plate(c,bx+u*.018,by+u*.045,bw,u*.375,u*.018,'#926f4f','#4f5946',u*.014);
   plate(c,bx,by,bw,u*.35,u*.018,i?'#c5a37a':'#d2b189','#856c51',u*.023);
   rect(c,bx+u*.042,by+u*.04,bw-u*.084,u*.034,'#e8cf9f81');
   line(c,bx+u*.055,by+u*.105,bx+bw-u*.06,by+u*.255,'#8c755c97',u*.017);
   line(c,bx+u*.054,by+u*.259,bx+bw-u*.065,by+u*.104,'#8c755c75',u*.015);
  }
 }else if(theme.id==='sorting'&&kind<=4){ // sorting station parcels
  for(let i=0;i<3;i++){
   const bx=X+u*(.17+i*.225),by=Y+u*(.3+(i%2)*.035);
   plate(c,bx,by,u*.202,u*.32,u*.022,i===1?'#d7bd8f':'#b5bfa7','#597568',u*.012);
   rect(c,bx+u*.085,by,u*.035,u*.32,'#f0e1b176');
   rect(c,bx+u*.026,by+u*.06,u*.12,u*.048,'#667e708b');
  }
 }else if(theme.id==='sorting'){ // sorting station exposed brackets
  rect(c,X+u*.19,Y+u*.295,u*.62,u*.095,'#b9c7b7');
  rect(c,X+u*.19,Y+u*.48,u*.62,u*.075,'#c0c7ac');
  rect(c,X+u*.25,Y+u*.335,u*.12,u*.14,'#7b987e');
  rect(c,X+u*.42,Y+u*.335,u*.12,u*.14,'#d1b281');
  rect(c,X+u*.60,Y+u*.335,u*.13,u*.14,'#96a79a');
  rect(c,X+u*.21,Y+u*.59,u*.58,u*.045,theme.shade);
 }
 drawFurnitureTheme(c,t,u,theme,seed);
 // Front fasteners / scuffed edge always on shelf, never on traversal space
 for(const i of [.17,.80])stud(c,X+u*i,Y+u*.80,u*.02,'#d5dcc7');
 line(c,X+u*.2,Y+u*.725,X+u*.30,Y+u*.725,'#d1e0c453',u*.013);
}
function drawShadow(c,s,u,theme){
 const x=s.x*u,y=s.y*u;
 if(s.edge==='left'){
  const g=c.createLinearGradient(x,y,x+u*.35,y);
  g.addColorStop(0,theme.shade+'59');g.addColorStop(1,theme.shade+'00');
  rect(c,x,y,u*.36,u,g);
 }else{
  const g=c.createLinearGradient(x,y,x,y+u*.36);
  g.addColorStop(0,'#284b474c');g.addColorStop(1,'#284b4700');
  rect(c,x,y,u,u*.36,g);
 }
}
function dock(c,p,u){
 const X=p.x*u,Y=p.y*u,m=p.robot===0;
 const rim=m?'#1d746c':'#b75e44',core=m?'#b6ded0':'#f5cfb3',trench=m?'#286a61':'#a74e3b';
 // Clamp feet + socket occupy a tile, while leaving all nearby floor readable.
 plate(c,X+u*.07,Y+u*.14,u*.86,u*.77,u*.075,'#6e89805a');
 plate(c,X+u*.08,Y+u*.075,u*.84,u*.81,u*.088,'#344b48','#304b45',u*.027);
 const grad=c.createLinearGradient(X,Y,X,Y+u);
 grad.addColorStop(0,'#f6f4db');grad.addColorStop(.52,core);grad.addColorStop(1,m?'#78b7a5':'#e6a781');
 plate(c,X+u*.14,Y+u*.115,u*.72,u*.68,u*.07,grad,trench,u*.045);
 plate(c,X+u*.23,Y+u*.205,u*.54,u*.48,u*.045,m?'#d0ebe0':'#f9dac4',rim,u*.039);
 // Physical corner clamps
 for(const cx of [.14,.86])for(const cy of [.16,.79]){
  stud(c,X+u*cx,Y+u*cy,u*.028,'#f3edc9');stud(c,X+u*cx,Y+u*cy,u*.012,'#5d7770');
 }
 // Hatch grid and axis symbol stay obvious even when robot stands on the pad
 c.strokeStyle=rim;c.lineWidth=Math.max(.9,u*.024);
 line(c,X+u*.32,Y+u*.33,X+u*.68,Y+u*.33,rim,u*.02);
 line(c,X+u*.32,Y+u*.60,X+u*.68,Y+u*.60,rim,u*.02);
 c.textAlign='center';c.textBaseline='middle';c.font='900 '+(u*.28)+'px system-ui, sans-serif';
 c.fillStyle=trench;c.fillText(m?'Y':'X',X+u*.5,Y+u*.48);
 // Deliberate high-contrast colored rim, NOT an arbitrary glow
 c.strokeStyle=rim;c.lineWidth=Math.max(1.2,u*.042);
 c.strokeRect(X+u*.22,Y+u*.19,u*.56,u*.50);
}
export function drawDiorama(c,level,u,ratio=1){
 if(!level?.map||!Number.isFinite(u)||u<=0)return null;
 const w=level.width*u,h=level.height*u,theme=themeForLevel(level);
 c.save();c.setTransform(ratio,0,0,ratio,0,0);
 const backdrop=c.createLinearGradient(0,0,w,h);
 backdrop.addColorStop(0,theme.backdrop[0]);backdrop.addColorStop(1,theme.backdrop[1]);
 rect(c,0,0,w,h,backdrop);
 const plan=scenePlan(level);
 for(const t of plan.floor){floorTile(c,t,u,level.seed,theme);drawFloorTheme(c,t.x,t.y,u,theme,level.seed)}
 for(const s of plan.shadows)drawShadow(c,s,u,theme);
 // Soft fixed overhead bulbs. Lights are purely optical, deterministic and sparse.
 // Applied BEFORE shelves and target docks to avoid obscuring essential silhouettes.
 c.save();c.globalCompositeOperation='screen';
 light(c,w*.12,h*.08,u*2.3,theme.light[0],theme.light[0].slice(0,7)+'00');
 light(c,w*.86,h*.74,u*2.1,theme.light[1],theme.light[1].slice(0,7)+'00');
 c.restore();
 for(const t of plan.walls)wallTile(c,t,u,level.seed,theme);
 drawThemeAccents(c,level,u,theme);
 for(const p of plan.goals)dock(c,p,u);
 // A thin mechanically framed perimeter; does not consume board cells.
 c.strokeStyle='#2b4b43';c.lineWidth=Math.max(2,u*.044);c.strokeRect(0,0,w,h);
 c.strokeStyle='#ffffff5c';c.lineWidth=Math.max(1,u*.017);c.strokeRect(u*.038,u*.038,w-u*.076,h-u*.076);
 c.restore();return plan;
}
