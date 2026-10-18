// ОСИ v1.5 — four material worlds on the same deterministic puzzle grid.
// Only level.kind/index selects an environment. No collision, server or solver changes.
export const THEMES=Object.freeze([
 Object.freeze({id:'sorting',name:'Сортировка',floor:['#d4ded0','#cadacf','#d3dfd5','#cfddd1'],edge:'#78958953',seam:'#6c9386',frame:['#87a899','#739789','#557d6f','#426458'],lip:'#a6c0aa',front:'#345a4e',interior:'#36564e',shade:'#24433e',light:['#fef5cc38','#f2ebca20'],backdrop:['#e2e6d6','#9fb8ab'],ambient:'warm'}),
 Object.freeze({id:'archive',name:'Холодный архив',floor:['#dce7e8','#d4e3e7','#dce9eb','#c8dee4'],edge:'#62818b51',seam:'#80a0ab',frame:['#93b4be','#7299a6','#567d8c','#436776'],lip:'#c9e2e4',front:'#385b69',interior:'#496d79',shade:'#355769',light:['#ecfaff47','#c9eafa38'],backdrop:['#e5f0ef','#a9c7ce'],ambient:'cold'}),
 Object.freeze({id:'packing',name:'Упаковочный цех',floor:['#ebdcc7','#e5d4bd','#e9dbc9','#dfcbb2'],edge:'#b49b765c',seam:'#ae9575',frame:['#c79f76','#a77b5b','#906a4c','#70523f'],lip:'#e7bf8f',front:'#79553d',interior:'#8a694f',shade:'#5c4736',light:['#ffebbf50','#ffe4ae39'],backdrop:['#efdfc9','#c9ac8f'],ambient:'warm'}),
 Object.freeze({id:'night',name:'Ночная смена',floor:['#a5b4b4','#9dacae','#aab8b6','#98a9a8'],edge:'#54716b59',seam:'#7a9496',frame:['#7e9298','#627982','#4d636e','#3e535d'],lip:'#a8bdbe',front:'#394f5c',interior:'#405860',shade:'#283c49',light:['#ffe4aa5c','#f5cb8f3a'],backdrop:['#bdc8c1','#81999e'],ambient:'night'})
]);
export const THEME_IDS=Object.freeze(THEMES.map(t=>t.id));
export function themeIndexForLevel(level){
 if(!level||!Number.isFinite(level.index))return 0;
 const i=Math.trunc(level.index);
 // Endless mode uses its guaranteed integer >=1, independently of clients' local preferences.
 if(typeof level.name==='string'&&/^Смена \d{2,}$/.test(level.name))return (i%4+4)%4;
 return Math.min(3,Math.max(0,Math.floor(i/3)));
}
export function themeForLevel(level){return THEMES[themeIndexForLevel(level)]}
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
const segment=(c,x,y,xx,yy,color,weight)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.lineWidth=weight;c.strokeStyle=color;c.stroke()};
const dot=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill()};
const round=(c,x,y,w,h,r,color)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill()};
const variations=(seed,x,y)=>((Math.imul((seed>>>0)^Math.imul(x+31,131),8191)^Math.imul(y+17,7919))>>>0);
export function drawFloorTheme(c,x,y,u,theme,seed){
 const X=x*u,Y=y*u,n=variations(seed,x,y);
 if(theme.id==='sorting'){
  // Caution dots and intermittent yellow floor guides, never crossing an entire cell.
  if(n%11===0){
   rect(c,X+u*.05,Y+u*.12,u*.065,u*.73,'#b49a5694');
   rect(c,X+u*.073,Y+u*.2,u*.019,u*.13,'#f7e0a8');
   rect(c,X+u*.073,Y+u*.52,u*.019,u*.13,'#f7e0a8');
  }
  if(n%9===3)rect(c,X+u*.58,Y+u*.77,u*.21,u*.028,'#a9b9a53d');
 }else if(theme.id==='archive'){
  // Refrigeration grilles and frozen micro-cracks. These remain obviously walkable.
  if(n%7===0){
   round(c,X+u*.19,Y+u*.16,u*.53,u*.12,u*.02,'#a5c5cf');
   for(let k=0;k<4;k++)rect(c,X+u*(.23+k*.115),Y+u*.18,u*.046,u*.07,'#648895b5');
  }
  if(n%9===2){
   segment(c,X+u*.74,Y+u*.71,X+u*.82,Y+u*.63,'#ffffff80',u*.013);
   segment(c,X+u*.82,Y+u*.63,X+u*.89,Y+u*.65,'#ffffff80',u*.013);
  }
 }else if(theme.id==='packing'){
  if(n%8===1){
   // Short seams of taped flooring; do not resemble walls.
   rect(c,X+u*.19,Y+u*.35,u*.64,u*.055,'#e7ba78ab');
   segment(c,X+u*.21,Y+u*.40,X+u*.78,Y+u*.40,'#8d674253',u*.012);
  }
  if(n%11===2){
   dot(c,X+u*.25,Y+u*.82,u*.016,'#ab835594');
   dot(c,X+u*.29,Y+u*.8,u*.008,'#ab835585');
  }
 }else{
  // Power cables tucked along one edge, occasional stamped floor number.
  if(n%6===0){
   rect(c,X+u*.12,Y+u*.77,u*.70,u*.035,'#d8b5788c');
   rect(c,X+u*.12,Y+u*.83,u*.70,u*.015,'#506e71');
  }
  if(n%13===1){
   round(c,X+u*.20,Y+u*.16,u*.32,u*.22,u*.035,'#738d8ec5');
   segment(c,X+u*.26,Y+u*.24,X+u*.46,Y+u*.24,'#e4c785aa',u*.027);
  }
 }
}
export function drawFurnitureTheme(c,t,u,theme,seed){
 const X=t.x*u,Y=t.y*u,n=variations(seed,t.x,t.y);
 if(theme.id==='sorting'){
  // Retain recognisable warehouse crates, add coherent sorting labels.
  rect(c,X+u*.32,Y+u*.37,u*.13,u*.085,'#e8f0de');
  rect(c,X+u*.545,Y+u*.43,u*.14,u*.05,'#e8f0de');
  rect(c,X+u*.35,Y+u*.40,u*.07,u*.023,(n%2)?'#4f9e8e':'#d9a35f');
 }else if(theme.id==='archive'){
  // Individually numbered cold-storage drawers, blue opaque insulation and frost edging.
  for(let k=0;k<3;k++){
   const bx=X+u*(.18+k*.216);
   round(c,bx,Y+u*.30,u*.19,u*.36,u*.028,k===1?'#8eb7c3':'#b7d2d8');
   rect(c,bx+u*.018,Y+u*.34,u*.15,u*.058,'#e8f3ee');
   rect(c,bx+u*.063,Y+u*.51,u*.066,u*.028,'#5e8a96');
   rect(c,bx+u*.025,Y+u*.605,u*.14,u*.028,'#dcf6f2');
  }
  segment(c,X+u*.16,Y+u*.30,X+u*.79,Y+u*.30,'#edf7e8bd',u*.025);
 }else if(theme.id==='packing'){
  // Packed cardboard cartons and golden adhesive tape / tape rolls.
  for(let k=0;k<2;k++){
   const bx=X+u*(.18+k*.33),by=Y+u*(k?.34:.29);
   round(c,bx,by,u*.3,u*.31,u*.017,k?'#cb9866':'#e0af77');
   rect(c,bx+u*.127,by,u*.049,u*.31,'#f4d497');
   segment(c,bx+u*.044,by+u*.21,bx+u*.25,by+u*.21,'#9165488c',u*.02);
   rect(c,bx+u*.05,by+u*.047,u*.07,u*.058,'#f5e7c5a0');
  }
  dot(c,X+u*.8,Y+u*.67,u*.075,'#916a4d');
  dot(c,X+u*.8,Y+u*.67,u*.039,'#e4ba83');
 }else{
  // Night pallets: matte steel boxes and a single non-flickering amber service LED.
  for(let k=0;k<3;k++){
   const bx=X+u*(.175+k*.216);
   round(c,bx,Y+u*.31,u*.19,u*.32,u*.02,k===1?'#8d9d96':'#637c80');
   rect(c,bx+u*.025,Y+u*.35,u*.135,u*.05,'#b6c8bc');
   rect(c,bx+u*.03,Y+u*.55,u*.13,u*.03,'#2b4c57');
  }
  rect(c,X+u*.16,Y+u*.675,u*.65,u*.044,'#dbb06e');
  dot(c,X+u*.77,Y+u*.235,u*.046,'#f3d28b');
  dot(c,X+u*.77,Y+u*.235,u*.018,'#fff4ca');
 }
}
export function drawThemeAccents(c,level,u,theme){
 const w=level.width*u,h=level.height*u;
 c.save();
 if(theme.id==='archive'){
  // Cold ceiling glints, drawn at tile margins so they cannot masquerade as ice obstacles.
  c.globalAlpha=.46;
  for(let x=u*.2;x<w;x+=u*2.1)segment(c,x,u*.075,x+u*.26,u*.075,'#e6faf8',Math.max(1,u*.018));
 }else if(theme.id==='packing'){
  // A recurring physical tape-lane embedded in border tile, not a new obstacle.
  c.globalAlpha=.42;
  rect(c,u*.11,h-u*.2,w-u*.22,u*.047,'#edc584');
 }else if(theme.id==='night'){
  // Static task lights at the two corners, warm rather than generic blue neon.
  for(const [x,y] of [[u*.52,u*.38],[w-u*.52,h-u*.38]]){
   const g=c.createRadialGradient(x,y,0,x,y,u*1.4);
   g.addColorStop(0,'#f7d8a13c');g.addColorStop(1,'#f7d8a100');
   rect(c,x-u*1.4,y-u*1.4,u*2.8,u*2.8,g);
   dot(c,x,y,u*.06,'#f3d1a0');
  }
 }else{
  c.globalAlpha=.24;
  rect(c,u*.10,u*.07,w-u*.20,u*.038,'#f9f3c6');
 }
 c.restore();
}
