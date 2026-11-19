export const PALETTES={
  mineral:{label:'Минерал',colors:['#101a1d','#35484d','#5d8281','#a6b4a0','#d2a46e','#f4dfad']},
  ember:{label:'Пламя',colors:['#120f18','#342333','#683c48','#b35d4c','#e69a57','#ffdfa5']},
  tide:{label:'Прилив',colors:['#091b26','#164956','#327f83','#6cb1ac','#a9d5c7','#e4f7dd']},
  ink:{label:'Чернила',colors:['#eceae0','#c8c6bc','#949991','#626c63','#39483e','#152b29']}
};
const decode=hex=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const ranges=Object.fromEntries(Object.entries(PALETTES).map(([key,p])=>[key,p.colors.map(decode)]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function rasterize(world,palette='mineral'){
  const c=ranges[palette]||ranges.mineral,n=world.n,rgba=new Uint8ClampedArray(n*n*4);
  const assign=(i,v)=>{const j=i*4;rgba[j]=v[0];rgba[j+1]=v[1];rgba[j+2]=v[2];rgba[j+3]=255;};
  if(world.mode==='sand'){
    const ceiling=world.params.neighbors;
    for(let i=0;i<n*n;i++){
      const v=world.a[i],k=v===0?0:Math.min(5,Math.round(v/(ceiling-1)*4)+1);
      assign(i,c[k]);
    }
  }else if(world.mode==='ant'){
    const m=world.params.rule.length;
    for(let i=0;i<n*n;i++)assign(i,world.a[i]===0?c[0]:c[Math.min(5,Math.round(world.a[i]/(m-1)*4)+1)]);
    for(const ant of world.ants){
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const x=ant.x+dx,y=ant.y+dy;
        if(x>=0&&x<n&&y>=0&&y<n)assign(y*n+x,dx===0&&dy===0?[255,248,220]:c[5]);
      }
    }
  }else if(world.mode==='studio'){
    const r=world.params,m=r.states;
    for(let i=0;i<n*n;i++){
      const v=world.a[i];
      if(r.family==='spread')assign(i,v===0?c[0]:v===1?c[2]:v===2?c[5]:c[1]);
      else assign(i,v===0&&r.family==='life'?c[0]:c[Math.round(v/(m-1)*5)]);
    }
  }else{
    for(let i=0;i<n*n;i++){
      const t=clamp(world.b[i]*3,0,1)*5,k=Math.min(4,Math.floor(t)),f=t-k;
      const a=c[k],b=c[k+1];
      assign(i,[Math.round(a[0]+(b[0]-a[0])*f),Math.round(a[1]+(b[1]-a[1])*f),Math.round(a[2]+(b[2]-a[2])*f)]);
    }
  }
  return {data:rgba,width:n,height:n};
}
export function paint(canvas,world,palette){
  const {data,width,height}=rasterize(world,palette);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  canvas.getContext('2d',{alpha:false}).putImageData(new ImageData(data,width,height),0,0);
}
