// NOT DEAD YET / 1.2 — offline deterministic painted texture atlas.
// RGBA atlas is generated only once; no remote images, DOM canvas or PBR dependencies.
const frac=n=>n-Math.floor(n);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
function hash(x,y,seed){
 let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(seed|0,2246822519);
 n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295
}
const mix=(a,b,t)=>a+(b-a)*t;
function noise(x,y,seed){
 const ix=Math.floor(x),iy=Math.floor(y),fx=frac(x),fy=frac(y);
 const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 return mix(mix(hash(ix,iy,seed),hash(ix+1,iy,seed),sx),mix(hash(ix,iy+1,seed),hash(ix+1,iy+1,seed),sx),sy)
}
const dist=(x,y)=>Math.hypot(x,y);
const circ=(x,y,px,py,r)=>Math.max(0,1-dist(x-px,y-py)/r);
// Material IDs are the renderer's existing 1..11 shading channels.
export const MATERIALS=['plaster','flowered-paper','parquet','ceramic','linoleum','varnished-wood','woven-fabric','porcelain','brushed-metal','aged-mirror','old-ink'];
function material(kind,u,v,x,y,seed){
 const grit=hash(x,y,seed+kind*17)-.5;
 const cloud=noise(u*6,v*6,seed+kind*11)-.5;
 let tone=.78+grit*.16+cloud*.11;
 switch(kind){
  case 0: { // crumbling lime plaster: hairline vertical cracks and patches
   const crack=Math.abs(Math.sin(u*19+noise(u*8,v*3,seed)*8))*.6;
   tone=.83+cloud*.18+grit*.16-(crack<.035?.18:0);
   break
  }
  case 1: { // recognizable but faded flower clusters, not generic digital stripes
   let bloom=0,stem=0;
   for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
    const px=(i+.5)*.34,py=(j+.5)*.34,dx=u-px,dy=v-py;
    for(let p=0;p<5;p++){
     const a=p*Math.PI*2/5,bx=dx-Math.cos(a)*.051,by=dy-Math.sin(a)*.051;
     bloom=Math.max(bloom,circ(bx,by,0,0,.044));
    }
    bloom=Math.max(bloom,circ(dx,dy,0,0,.022)*1.2);
    if(Math.abs(dx+Math.sin((dy+.13)*8)*.011)<.007&&dy>0&&dy<.13)stem=.11;
   }
   tone=.84+cloud*.12+grit*.07-bloom*.22-stem;
   break
  }
  case 2: { // square parquet with staggered plank seams
   // Old herringbone parquet (ёлочка): alternating perpendicular short planks.
   const row=Math.floor(v*10),col=Math.floor(u*10),turned=(row+col)%2===0;
   const plankX=turned?u*10+v*5:v*10-u*5,plankY=turned?v*10:u*10;
   const seam=Math.min(frac(plankX),1-frac(plankX))<.035||Math.min(frac(plankY),1-frac(plankY))<.035;
   const grain=Math.sin((turned?u:v)*170+noise(u*6,v*4,seed)*9)*.042;
   tone=.73+cloud*.10+grain+grit*.09-(seam?.25:0);
   break
  }
  case 3: { // irregular ceramic grout; tiny stippled glaze
   const tu=frac(u*5),tv=frac(v*4),seam=Math.min(tu,1-tu,tv,1-tv)<.032;
   tone=seam?.35:.89+grit*.095+cloud*.04;
   break
  }
  case 4: { // vinyl worn in the kitchen
   const cross=Math.min(frac(u*7),frac(v*7));
   tone=.78+noise(u*16,v*16,seed)*.12+grit*.08-(cross<.025?.16:0);
   break
  }
  case 5: {
   const bands=Math.sin(u*105+noise(u*4,v*2,seed)*14)+Math.sin(u*224+v*5)*.4;
   tone=.70+bands*.055+cloud*.10+grit*.045;
   break
  }
  case 6: { // woven fabric and rubbed seams
   const warp=Math.sin(u*160)*.045,weft=Math.sin(v*149)*.040;
   const edge=Math.min(frac(v*4),1-frac(v*4));
   tone=.68+warp+weft+grit*.12+cloud*.18-(edge<.016?.13:0);
   break
  }
  case 7: tone=.89+cloud*.055+grit*.028;break;
  case 8: tone=.71+Math.sin(v*270)*.018+grit*.10;break;
  case 9: {
   const smudge=noise(u*3+v*.5,v*5,seed)*.26;
   tone=.65+smudge+Math.sin((u+v)*5)*.045+grit*.03;break
  }
  case 10: tone=.83+noise(u*23,v*8,seed)*.12+grit*.12;break;
  default: tone=.8+grit*.1
 }
 return clamp(tone,.15,1);
}
export function makeMaterialAtlas(seed=17,{tileSize=96}={}){
 const tile=Math.max(16,Math.min(256,Math.floor(tileSize))),width=tile*4,height=tile*4,pixels=new Uint8Array(width*height*4);
 for(let index=0;index<16;index++){
  const cx=index%4,cy=Math.floor(index/4);
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
   const u=(x+.5)/tile,v=(y+.5)/tile;
   const light=material(index,u,v,x,y,seed);
   const v8=Math.round(light*255),base=((cy*tile+y)*width+cx*tile+x)*4;
   // Chromatic pigments remain driven by geometry vertex colors.
   pixels[base]=v8;pixels[base+1]=v8;pixels[base+2]=v8;pixels[base+3]=255;
  }
 }
 return {pixels,width,height,tileSize:tile,tiles:16}
}
