// PEREKOS / the quarry: mineral planes rather than uniform pixel wallpaper.
// Deterministic hand-laid textures. No random-frame noise or simulated hazards.
const h=n=>{let v=n>>>0;v^=v<<13;v^=v>>>17;v^=v<<5;return(v>>>0)/4294967296};
const rect=(c,x,y,w,z,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(z))};
const path=(c,points,color,width=1)=>{
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();
 for(let i=0;i<points.length;i++)i?c.lineTo(...points[i]):c.moveTo(...points[i]);
 c.stroke();
};
const pits=[
 [[40,174],[48,169],[59,174],[66,171]],
 [[326,212],[339,219],[343,232],[354,237]],
 [[51,419],[58,422],[62,436],[74,441]],
 [[307,479],[317,468],[330,470],[340,456]],
 [[126,82],[135,92],[129,105]],
 [[277,555],[287,544],[297,548]]
];
export function carveStoneFloor(c){
 if(!c)return;
 c.save();
 // Soft directional rooflight catches the raised faces; grout remains deep.
 const light=c.createLinearGradient(22,28,366,590);
 light.addColorStop(0,'#c4b99319');light.addColorStop(.42,'#e0d3a106');
 light.addColorStop(1,'#061a201c');
 c.fillStyle=light;c.fillRect(29,30,342,560);
 // Mineral stratification follows individual slate cuts, never arbitrary dots.
 for(let i=0;i<240;i++){
  const x=34+h(i*137+50)*331,y=37+h(i*349+27)*548;
  const edge=Math.min(x-34,365-x,y-37,585-y);
  const center=Math.hypot((x-200)*.8,(y-310)*.72);
  if(edge>62&&center<135&&h(i*13)<.86)continue;
  const len=3+Math.floor(h(i*23+9)*10),a=h(i*33+57);
  const color=a>.65?'#bac49a24':a>.35?'#11251b28':'#ac99752c';
  rect(c,x,y,len,1,color);
  if(a>.81)rect(c,x+len*.3,y+2,len*.6,1,'#132d2237');
 }
 // Deposits of eroded clay accumulate under projecting masonry.
 for(let i=0;i<96;i++){
  const x=32+h(i*151+80)*335,y=37+h(i*277+49)*548;
  const edge=Math.min(x-32,367-x,y-37,585-y);
  if(edge>48)continue;
  rect(c,x,y,2+h(i*31)*4,1+h(i*7)*2,
   h(i*89)>.5?'#a3976f5b':'#172e2592');
 }
 // Hand-cut limestone faults: anchored near the court perimeter, not a
 // false strike telegraph beneath moving characters.
 for(const [i,points] of pits.entries()){
  const scale=(i%2?1.08:.93),p=points.map(([x,y])=>[x,y]);
  path(c,p,'#1d332cba',3);
  path(c,p.map(([x,y])=>[x+scale,y-1]),'#a1a47d7d',1);
  const tip=p[p.length-1];
  path(c,[tip,[tip[0]+(i%2?4:-3),tip[1]+7]],'#213b319c',1);
 }
 // Blackened low drains contain still water and small reflected skylight.
 for(const [x,y,r] of [[42,100,12],[356,511,13],[44,517,8],[349,145,8]]){
  c.fillStyle='#1b3532ab';c.beginPath();c.ellipse(x,y,r,r*.45,0,0,Math.PI*2);c.fill();
  path(c,[[x-r*.6,y-1],[x-r*.12,y-2]],'#b2c3a04a',1);
  path(c,[[x+2,y+2],[x+r*.8,y+1]],'#475f5366',1);
 }
 c.restore();
}
export function carveButtressFace(c,w,index=0){
 if(!c||!w)return;
 const {x,y,w:width,h:height}=w;
 c.save();
 // Stone has three real planes: lit cap, dark right side and an eroded face.
 rect(c,x+5,y+14,width-11,height-18,'#30473b6e');
 rect(c,x+width-9,y+12,8,height-7,'#122b24c6');
 rect(c,x+8,y+12,2,height-11,'#9ca7865a');
 for(let row=0;row<3;row++){
  const yy=y+16+row*(height-18)/3;
  const off=row%2?10:3;
  path(c,[[x+4,yy],[x+width-9,yy-2]],'#162e26a6',2);
  rect(c,x+8+off,yy+2,2,Math.max(3,(height-19)/3-5),'#22382f9e');
  rect(c,x+width*.66-off*.25,yy+3,2,Math.max(3,(height-19)/3-8),'#1c342b98');
  rect(c,x+15+off,yy+4,8+row*2,1,'#c6c69a50');
 }
 // Narrow geological strata cross the vertical face, chipped at corners.
 for(let i=0;i<9;i++){
  const xx=x+9+h(i*11+index*73)*(width-20);
  const yy=y+15+h(i*29+index*151)*(height-21);
  rect(c,xx,yy,3+h(i*67)*8,1,h(i*9)>.5?'#a2af886b':'#142e2592');
 }
 rect(c,x-4,y-5,width+8,2,'#e0d2a687');
 rect(c,x-4,y+9,width+8,3,'#21372e94');
 for(let i=0;i<9;i++){
  const xx=x-1+i*width/8,yy=y-5+h(i*59+index*17)*3;
  if(h(i*127+index*17)>.47){
   rect(c,xx,yy,4+h(i*7)*5,2,'#343f348c');
   rect(c,xx+1,yy+3,2,2,'#d3c2987c');
  }
 }
 // Chipped shadowed corner and fallen block fragments define scale.
 rect(c,x+width-11,y+height-4,11,4,'#142922');
 for(let i=0;i<9;i++){
  const xx=x+(i%5)*6-7,yy=y+height+3+Math.floor(i/5)*4;
  rect(c,xx,yy,2+i%3,2,h(i+index*9)>.5?'#72846b96':'#334c3caa');
 }
 c.restore();
}
export function courtMaterialSignature(){
 return {faults:pits.length,grainMarks:240,sedimentMarks:96,profile:'slate/copper/limestone',deterministic:true};
}
