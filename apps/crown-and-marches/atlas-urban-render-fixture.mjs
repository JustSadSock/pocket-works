// Deterministic tiny test geography, not a campaign or an art reference.
export function urbanRenderFixture(){
 const W=16,H=16,r=4,w=W*r+1,h=H*r+1,n=w*h,N=W*H,land=new Uint8Array(n),bed=new Float32Array(n),flow=new Float32Array(n),down=new Int32Array(n).fill(-1),lakeId=new Int32Array(n),lakeWater=new Uint8Array(n);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;land[i]=+(x/r<12.3);bed[i]=land[i]?.30:.08;if(x===8*r&&y>=6*r&&y<10*r){flow[i]=1600;down[i]=i+w;}}
 const coarse=Uint8Array.from({length:N},(_,i)=>+(i%W+.5<12.3)),s={day:0,map:{land:coarse,resource:new Uint8Array(N),geography:{detail:r,width:w,height:h,land,bed,flow,down,lakeId,lakeWater,lakeLevels:[0]}},road:new Uint8Array(N),bridge:new Uint8Array(N),district:new Uint8Array(N),development:new Float32Array(N),cities:[{id:0,i:5*W+5,name:'Fort fixture',pop:944,capital:true,fort:2,port:0,infra:1,build:[1,1,1,0]},{id:1,i:10*W+11,name:'Port fixture',pop:914,capital:false,fort:0,port:1,infra:1,build:[1,1,0,0]}]};
 for(const i of [8*W+7,8*W+8])s.road[i]=1;s.bridge[8*W+8]=1;
 for(const i of [10*W+2,10*W+3,11*W+2,11*W+3]){s.district[i]=2;s.development[i]=.7;}
 const opts={visible:Array.from({length:N},(_,i)=>i),cities:s.cities,known:()=>true,fresh:()=>true,fog:false,project:(x,y)=>[x,y*.96]};
 return {s,opts,cam:{s:50,ox:0,oy:0},receipt:{key:'synthetic-preflight',lod:0,region:[0,0,W,H]}};
}
