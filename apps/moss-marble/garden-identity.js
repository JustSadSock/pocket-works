// Nine garden identities, positioned on OUTSIDE rim mounts.
// Every ornamental piece is visual-only: no game collider, save-state, seed
// generation, scoring, or pathfinding data is changed.
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const shade=(rgba,f)=>[clamp(rgba[0]*f,0,1),clamp(rgba[1]*f,0,1),clamp(rgba[2]*f,0,1),rgba[3]];
const f3=(x,y,z)=>[x,y,z];
const paletteDefault={
  stone:[.43,.46,.38,1],stoneLight:[.70,.69,.58,1],stoneDark:[.18,.23,.19,1],
  wood:[.42,.30,.17,1],woodLight:[.68,.50,.26,1],leaf:[.24,.43,.25,1],
  flower:[.86,.80,.58,1]
};
export const GARDEN_STYLES=Object.freeze({
  drop:"rain-gauge",cup:"porcelain-tea",fern:"fern-grove",
  dial:"sundial",ripple:"weather-vane",spoon:"sugar-bowl",
  leaf:"shade-arbor",pane:"glass-gallery",lantern:"amber-lantern"
});
const paletteFor=level=>({...paletteDefault,...level?.visual?.materials});
const signedArea=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-b.x*a.y},0)*.5;

function meshDisc(mesh,x,y,z,r,color,mat=0,segments=16,ry=r){
  const a=f3(x,y,z);
  for(let i=0;i<segments;i++){
    const t=i/segments*TAU,u=(i+1)/segments*TAU;
    mesh.triangle(a,f3(x+Math.cos(t)*r,y+Math.sin(t)*ry,z),f3(x+Math.cos(u)*r,y+Math.sin(u)*ry,z),color,mat,[0,0,1]);
  }
}
function meshRing(mesh,x,y,z,inner,outer,color,mat=0,segments=18){
  for(let i=0;i<segments;i++){
    const t=i/segments*TAU,u=(i+1)/segments*TAU;
    mesh.quad(
      f3(x+Math.cos(t)*inner,y+Math.sin(t)*inner,z),
      f3(x+Math.cos(t)*outer,y+Math.sin(t)*outer,z),
      f3(x+Math.cos(u)*outer,y+Math.sin(u)*outer,z),
      f3(x+Math.cos(u)*inner,y+Math.sin(u)*inner,z),color,mat,[0,0,1]
    );
  }
}
function stem(mesh,x,y,z0,z1,r,color,mat=0,segments=12,r1=r){
  for(let i=0;i<segments;i++){
    const t=i/segments*TAU,u=(i+1)/segments*TAU;
    mesh.quad(
      f3(x+Math.cos(t)*r,y+Math.sin(t)*r,z0),f3(x+Math.cos(u)*r,y+Math.sin(u)*r,z0),
      f3(x+Math.cos(u)*r1,y+Math.sin(u)*r1,z1),f3(x+Math.cos(t)*r1,y+Math.sin(t)*r1,z1),color,mat
    );
  }
  meshDisc(mesh,x,y,z1,r1,shade(color,1.10),mat,segments);
}
function prism(mesh,x,y,z,width,depth,height,color,mat=0){
  const a=f3(x-width/2,y-depth/2,z),b=f3(x+width/2,y-depth/2,z),c=f3(x+width/2,y+depth/2,z),d=f3(x-width/2,y+depth/2,z);
  const a1=f3(a[0],a[1],z+height),b1=f3(b[0],b[1],z+height),c1=f3(c[0],c[1],z+height),d1=f3(d[0],d[1],z+height);
  mesh.quad(a,b,b1,a1,shade(color,.83),mat);mesh.quad(b,c,c1,b1,color,mat);
  mesh.quad(c,d,d1,c1,shade(color,.76),mat);mesh.quad(d,a,a1,d1,color,mat);
  mesh.quad(a1,b1,c1,d1,shade(color,1.08),mat,[0,0,1]);
}
function beam(mesh,a,b,width,color,mat=0){
  const [x,y,z]=a,[x1,y1,z1]=b;
  const dx=x1-x,dy=y1-y,len=Math.hypot(dx,dy)||1;
  const nx=-dy/len*width/2,ny=dx/len*width/2;
  const p=f3(x+nx,y+ny,z),q=f3(x-nx,y-ny,z),u=f3(x1+nx,y1+ny,z1),v=f3(x1-nx,y1-ny,z1);
  mesh.quad(p,q,v,u,color,mat);
  mesh.quad(f3(p[0],p[1],p[2]+width*.6),f3(q[0],q[1],q[2]+width*.6),f3(v[0],v[1],v[2]+width*.6),f3(u[0],u[1],u[2]+width*.6),shade(color,1.07),mat);
  mesh.quad(p,u,f3(u[0],u[1],u[2]+width*.6),f3(p[0],p[1],p[2]+width*.6),shade(color,.80),mat);
  mesh.quad(q,f3(q[0],q[1],q[2]+width*.6),f3(v[0],v[1],v[2]+width*.6),v,shade(color,.82),mat);
}
function leaf(mesh,x,y,z,dx,dy,dz,w,color){
  const apex=f3(x+dx,y+dy,z+dz);
  const tip=f3(x+dx*.24,y+dy*.24,z+dz*.52);
  const across=f3(-dy*w,dx*w,0);
  mesh.triangle(f3(x,y,z),f3(tip[0]+across[0],tip[1]+across[1],tip[2]),apex,color,0);
  mesh.triangle(f3(x,y,z),apex,f3(tip[0]-across[0],tip[1]-across[1],tip[2]),shade(color,.78),0);
}
function badge(mesh,x,y,z,mat,c1,c2){
  stem(mesh,x,y,z,z+5,22,c1,mat,18,21);
  meshRing(mesh,x,y,z+5.3,14,20,c2,mat,22);
  meshDisc(mesh,x,y,z+5.35,14,shade(c1,.72),mat,20);
}
function identityObject(mesh,at,motif,palette,index){
  const {x,y,z}=at;
  const leafColor=palette.leaf,flower=palette.flower,metal=[.72,.57,.29,1],metalLight=[.91,.78,.51,1],blue=[.47,.73,.68,1],ceramic=[.82,.82,.72,1];
  const top=z+5;
  if(motif==='drop'){
    // A narrow rain-measuring cylinder with a visible blue waterline.
    stem(mesh,x,y,top,top+39,9,shade(palette.stoneLight,.95),0,18,8);
    meshRing(mesh,x,y,top+40,6.5,10.5,metalLight,4,20);
    meshDisc(mesh,x,y,top+32,6.7,blue,0,18);
    for(let j=0;j<5;j++)beam(mesh,f3(x+8,y-6,top+11+j*5),f3(x+12,y-6,top+11+j*5),1.1,shade(metalLight,.92),4);
    prism(mesh,x,y+11,top+2,12,9,5,shade(palette.stone,.77));
  }else if(motif==='cup'){
    // Ceramic saucer and porcelain bowl, seen as genuinely open.
    meshDisc(mesh,x,y,top+1,18,ceramic,0,24);
    meshRing(mesh,x,y,top+1.5,11,18,shade(ceramic,.80),0,24);
    stem(mesh,x,y,top+2,top+25,11,ceramic,0,20,13);
    meshRing(mesh,x,y,top+26,10,13.6,shade(ceramic,1.11),0,24);
    meshDisc(mesh,x,y,top+23,9,[.26,.40,.32,1],0,20);
    for(let j=0;j<8;j++){const a=-Math.PI*.5+j/7*Math.PI; const xx=x+13+Math.sin(a)*8; const zz=top+14+Math.cos(a)*8; if(j){const prev=-Math.PI*.5+(j-1)/7*Math.PI;beam(mesh,f3(x+13+Math.sin(prev)*8,y,top+14+Math.cos(prev)*8),f3(xx,y,zz),2.5,ceramic);}}
  }else if(motif==='fern'){
    stem(mesh,x,y,top,top+21,3,shade(palette.wood,.85),11,10,2);
    for(let j=0;j<9;j++){
      const a=j/9*TAU,spread=(j%3===0?31:24);
      leaf(mesh,x,y,top+5,Math.cos(a)*spread,Math.sin(a)*spread,18+j%3*6,6.8,j%2?palette.leaf:shade(palette.leaf,1.3));
    }
    stem(mesh,x-5,y+4,top,top+8,5,shade(palette.wood,.85),11,12,4);
    meshDisc(mesh,x-5,y+4,top+8,5.5,flower,0,12);
  }else if(motif==='dial'){
    stem(mesh,x,y,top,top+12,6,shade(palette.stoneDark,1.4),0,14,4);
    meshDisc(mesh,x,y,top+13,18,metal,4,28);
    meshRing(mesh,x,y,top+13.4,14.8,18.5,metalLight,4,28);
    for(let j=0;j<12;j++){
      const a=j/12*TAU;
      meshDisc(mesh,x+Math.cos(a)*14,y+Math.sin(a)*14,top+13.6,1.1,palette.stoneDark,0,7);
    }
    beam(mesh,f3(x-1,y,top+14),f3(x+11,y-7,top+14),2,shade(palette.stoneDark,.9),4);
  }else if(motif==='ripple'){
    // An aged storm gauge with copper weathervane and reed skirts.
    stem(mesh,x,y,top,top+44,2.9,metal,4,10,2.5);
    beam(mesh,f3(x-19,y,top+39),f3(x+21,y,top+39),3,metalLight,4);
    mesh.triangle(f3(x+21,y,top+39),f3(x+9,y-8,top+46),f3(x+9,y+8,top+33),shade(blue,1.02),0);
    for(let j=0;j<5;j++){
      const a=j/5*TAU;const sx=x+Math.cos(a)*10,sy=y+Math.sin(a)*10;
      leaf(mesh,sx,sy,top+1,Math.cos(a)*7,Math.sin(a)*7,25+j%3*5,3.3,shade(palette.leaf,.83));
    }
  }else if(motif==='spoon'){
    // A broad bowl of pale sand and a small spoon resting on its rim.
    stem(mesh,x,y,top,top+15,17,ceramic,0,20,15.5);
    meshRing(mesh,x,y,top+16,11.5,16.5,shade(ceramic,1.06),0,24);
    meshDisc(mesh,x,y,top+13.5,11,[.77,.66,.43,1],0,22);
    beam(mesh,f3(x-13,y+10,top+21),f3(x+17,y+4,top+25),2.8,metalLight,4);
    meshDisc(mesh,x-14,y+10,top+21,6,metal,4,14,3.5);
  }else if(motif==='leaf'){
    // A pair of timbers and cross-laths form a recognisable woodland arbor.
    for(const sx of [-13,13])stem(mesh,x+sx,y,top,top+41,3.4,shade(palette.wood,.84),11,9,3.1);
    beam(mesh,f3(x-16,y,top+42),f3(x+16,y,top+42),5,palette.woodLight,11);
    for(let j=0;j<3;j++){
      const yy=y+(j-1)*7;
      beam(mesh,f3(x-16,yy,top+41),f3(x+16,yy,top+41),2.4,shade(palette.wood,1.05),11);
    }
    for(let j=0;j<6;j++){
      const a=j/6*TAU;
      leaf(mesh,x+Math.cos(a)*13,y,top+12+j%3*11,Math.cos(a)*10,Math.sin(a)*12,7,3.5,palette.leaf);
    }
  }else if(motif==='pane'){
    // A stained botanical glass plate in a limestone gallery frame.
    for(const sx of [-12,12])prism(mesh,x+sx,y,top+1,3.5,5,45,palette.stone,0);
    prism(mesh,x,y,top+42,30,7,4,palette.stoneLight,0);
    prism(mesh,x,y,top+1,29,7,4,shade(palette.stone,.80),0);
    const glass=[.27,.56,.49,.86];
    mesh.quad(f3(x-10,y,top+7),f3(x+10,y,top+7),f3(x+10,y,top+39),f3(x-10,y,top+39),glass,0);
    mesh.triangle(f3(x-8,y-.2,top+36),f3(x+7,y-.2,top+22),f3(x+8,y-.2,top+36),shade(flower,1.10),0);
    beam(mesh,f3(x-11,y-.5,top+24),f3(x+11,y-.5,top+24),2,palette.stoneLight);
  }else if(motif==='lantern'){
    // Faceted amber garden lantern mounted to a dark iron bracket.
    stem(mesh,x,y,top,top+32,2.5,shade(palette.stoneDark,1.3),4,10,2.5);
    prism(mesh,x,y,top+29,17,17,21,shade(palette.stoneDark,1.38),4);
    for(const sx of [-6,6])for(const sy of [-6,6])
      prism(mesh,x+sx,y+sy,top+33,2,2,13,metal,4);
    const amber=[.95,.72,.30,1];
    for(const sx of [-1,1]){
      mesh.quad(f3(x+sx*8,y-6,top+35),f3(x+sx*8,y+6,top+35),f3(x+sx*8,y+6,top+46),f3(x+sx*8,y-6,top+46),amber,0);
    }
    prism(mesh,x,y,top+51,19,19,4,metal,4);
    prism(mesh,x,y,top+56,7,7,5,shade(metal,.81),4);
  }
}
function outsidePolygon(p,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return !inside;
}
function boundaryDistance(p,outline){
  let closest=Infinity;
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],dx=b.x-a.x,dy=b.y-a.y;
    const lenSq=dx*dx+dy*dy;
    const t=clamp(lenSq?((p.x-a.x)*dx+(p.y-a.y)*dy)/lenSq:0,0,1);
    closest=Math.min(closest,Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t));
  }
  return closest;
}
export function gardenSites(level) {
  const outline=level?.outline;
  if(!Array.isArray(outline)||outline.length<6||!GARDEN_STYLES[level?.visual?.motif])return [];
  const winding=signedArea(outline)>=0?1:-1;
  const n=outline.length;
  const anchors=[.10,.36,.61,.86];
  const sites=[];
  for(let i=0;i<anchors.length;i++){
    const desired=Math.min(n-1,Math.floor(anchors[i]*n));
    let found=null;
    // Search nearby edges on tight hairpins: a corner can put a nominal
    // "outside" point inside the opposite arm of the course.
    for(let attempt=0;attempt<n&&!found;attempt++){
      const shift=attempt===0?0:Math.ceil(attempt/2)*(attempt%2?1:-1);
      const idx=(desired+shift+n*2)%n;
      const a=outline[idx],b=outline[(idx+1)%n],dx=b.x-a.x,dy=b.y-a.y;
      const len=Math.hypot(dx,dy)||1;
      const outside={x:dy/len*winding,y:-dx/len*winding};
      const center={x:(a.x+b.x)*.5,y:(a.y+b.y)*.5};
      const candidate={x:center.x+outside.x*48,y:center.y+outside.y*48,
        anchorX:center.x,anchorY:center.y,offset:48,theme:level.visual.motif,index:i};
      if(!outsidePolygon(candidate,outline)||boundaryDistance(candidate,outline)<30)continue;
      if(sites.some(site=>Math.hypot(site.x-candidate.x,site.y-candidate.y)<110))continue;
      found=candidate;
    }
    if(found)sites.push(found);
  }
  return sites;
}

export function appendGardenIdentity(mesh,level,heightAt){
  const sites=gardenSites(level),p=paletteFor(level);
  for(const site of sites){
    const ground=Number(heightAt(site.anchorX,site.anchorY))||0;
    // A rim-mounted foundation is deliberately above the soil and outside
    // the course outline; all ornaments use the same baseline/scale.
    const z=ground+7;
    badge(mesh,site.x,site.y,z,0,p.stone,p.stoneLight);
    identityObject(mesh,{x:site.x,y:site.y,z:z+4},site.theme,p,site.index);
  }
  return sites;
}
