// NOT DEAD YET — deterministic connected 3D maze geometry, not a graphics-dependent generator.
// Replaces the old mutable tile overlay, which could cut doors off after regenerating chunks.
export const SIZE=20;
export const FLOOR=1,ROOM=2,THRESHOLD=3;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
export const key=(x,y)=>x+','+y;
function hash(...v){let h=2166136261;for(const n of v){h=Math.imul(h^(n|0),16777619);h^=h>>>13}h^=h>>>16;return h>>>0}
function rng(seed){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
const rand=(r,a,b)=>a+Math.floor(r()*(b-a+1));
function port(seed,cx,cy,axis){return 4+hash(seed,cx,cy,axis)%12}
export function generateChunk(seed,cx,cy,epoch=0){
 const g=new Uint8Array(SIZE*SIZE),r=rng(hash(seed,cx,cy,epoch,0x4e4459));
 const paint=(x,y,val)=>{if(x>=0&&y>=0&&x<SIZE&&y<SIZE)g[y*SIZE+x]=val};
 const hor=(x0,x1,y)=>{for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++){paint(x,y,FLOOR);paint(x,y+1,FLOOR)}};
 const ver=(x,y0,y1)=>{for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++){paint(x,y,FLOOR);paint(x+1,y,FLOOR)}};
 const mid=SIZE>>1,n=port(seed,cx,cy-1,11),s=port(seed,cx,cy,11),w=port(seed,cx-1,cy,29),e=port(seed,cx,cy,29);
 // Permanent cross-chunk backbone. Edge ports depend only on the SHARED boundary.
 ver(n,0,mid);hor(n,mid,mid);ver(s,mid,SIZE-1);hor(mid,s,mid);
 hor(0,mid,w);ver(mid,w,mid);hor(mid,SIZE-1,e);ver(mid,mid,e);
 for(let i=0;i<4;i++){
  const ww=rand(r,4,7),hh=rand(r,4,6),x=rand(r,2,SIZE-ww-3),y=rand(r,2,SIZE-hh-3);
  for(let yy=y;yy<y+hh;yy++)for(let xx=x;xx<x+ww;xx++)paint(xx,yy,ROOM);
  const rx=x+(ww>>1),ry=y+(hh>>1);
  if(i&1){hor(rx,mid,ry);ver(mid,ry,mid)}else{ver(rx,ry,mid);hor(rx,mid,mid)}
  // Side rooms may intersect the spine: that is a valid large chamber.
 }
 for(let y=mid-1;y<=mid+2;y++)for(let x=mid-1;x<=mid+2;x++)paint(x,y,ROOM);
 for(const [x,y] of [[n,0],[n+1,0],[s,SIZE-1],[s+1,SIZE-1],[0,w],[0,w+1],[SIZE-1,e],[SIZE-1,e+1]])paint(x,y,THRESHOLD);
 return {cx,cy,epoch,version:epoch+1,tiles:g};
}
export class World{
 constructor(seed=1,epochs=[]){this.seed=seed>>>0;this.chunks=new Map();this.epochs=new Map(epochs);this.lastNear=new Map();this.rebuilt=new Set();this.changes=0}
 chunk(cx,cy){const k=key(cx,cy);let c=this.chunks.get(k);if(!c){c=generateChunk(this.seed,cx,cy,this.epochs.get(k)||0);this.chunks.set(k,c)}return c}
 cell(gx,gy){const cx=Math.floor(gx/SIZE),cy=Math.floor(gy/SIZE);const ch=this.chunk(cx,cy);return ch.tiles[(gy-cy*SIZE)*SIZE+(gx-cx*SIZE)]}
 pass(gx,gy){return this.cell(gx,gy)!==0}
 canStand(x,y,r=.19){return this.pass(Math.floor(x-r),Math.floor(y-r))&&this.pass(Math.floor(x+r),Math.floor(y-r))&&this.pass(Math.floor(x-r),Math.floor(y+r))&&this.pass(Math.floor(x+r),Math.floor(y+r))}
 tick(px,py,t){
  const pcx=Math.floor(px/SIZE),pcy=Math.floor(py/SIZE);
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)this.chunk(pcx+dx,pcy+dy);
  for(const [k,c] of this.chunks){
   const d=Math.max(Math.abs(c.cx-pcx),Math.abs(c.cy-pcy));
   if(d<=1){this.lastNear.set(k,t);this.rebuilt.delete(k)}
   else if(d<=3&&t-(this.lastNear.get(k)??t)>13&&!this.rebuilt.has(k)){
    // Whole-sector replacement is safe: never alter the player's 3x3 neighborhood,
    // and every replacement retains its four mandatory aligned gateways.
    const next=c.epoch+1;this.epochs.set(k,next);this.chunks.set(k,generateChunk(this.seed,c.cx,c.cy,next));this.rebuilt.add(k);this.changes++;
   }
   if(d>3){this.chunks.delete(k);this.lastNear.delete(k);this.rebuilt.delete(k);this.epochs.set(k,c.epoch+1)}
  }
 }
 serialize(){return [...this.epochs].slice(-100)}
 visible(ax,az,bx,bz){ // exact grid obstruction for enemies, objects and flashlight
  const d=Math.hypot(bx-ax,bz-az);if(d<.01)return true;
  const n=Math.max(1,Math.ceil(d*6));
  for(let i=1;i<n;i++){const t=i/n;if(!this.pass(Math.floor(ax+(bx-ax)*t),Math.floor(az+(bz-az)*t)))return false}
  return true
 }
 findStep(sx,sz,tx,tz,limit=2500){
  const start=[Math.floor(sx),Math.floor(sz)],end=[Math.floor(tx),Math.floor(tz)],target=key(...end);
  if(key(...start)===target)return{x:tx,z:tz};
  const queue=[start],parent=new Map([[key(...start),null]]);
  for(let qi=0;qi<queue.length&&qi<limit;qi++){
   const [x,z]=queue[qi];for(const [dx,dz] of dirs){const nx=x+dx,nz=z+dz,k=key(nx,nz);
    if(parent.has(k)||!this.pass(nx,nz))continue;
    parent.set(k,key(x,z));if(k===target){let cur=k,prev=parent.get(cur);while(prev!==key(...start)&&prev!==null){cur=prev;prev=parent.get(cur)}
     const [rx,rz]=cur.split(',').map(Number);return{x:rx+.5,z:rz+.5}}
    queue.push([nx,nz]);
   }
  }
  return null
 }
}
export function checkConnected(ch){
 const {tiles}=ch,at=(x,y)=>tiles[y*SIZE+x]!==0,first=tiles.findIndex(v=>v!==0);if(first<0)return false;
 const q=[first],seen=new Set(q);for(let qi=0;qi<q.length;qi++){const v=q[qi],x=v%SIZE,y=Math.floor(v/SIZE);for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy,id=ny*SIZE+nx;if(nx>=0&&ny>=0&&nx<SIZE&&ny<SIZE&&at(nx,ny)&&!seen.has(id)){seen.add(id);q.push(id)}}}
 return seen.size===tiles.filter(Boolean).length;
}