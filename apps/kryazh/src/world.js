import { BLOCK_BY_ID, BIOMES, CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from './data.js';
import { fbm2, rand, valueNoise3 } from './noise.js';

export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const worldToChunk = (v) => Math.floor(v / CHUNK_SIZE);
export const localCoord = (v) => ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
const idx = (x,y,z) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);

export class VoxelWorld {
  constructor(seed = 1) { this.seed = seed >>> 0; this.chunks = new Map(); this.mods = new Map(); this.functional = new Map(); this.queue = []; this.generating = new Set(); }
  getChunk(cx, cz, create = false) { const k = chunkKey(cx,cz); let c = this.chunks.get(k); if (!c && create) { c = this.generateChunk(cx,cz); this.chunks.set(k,c); } return c; }
  requestChunk(cx, cz) { const k=chunkKey(cx,cz); if (!this.chunks.has(k) && !this.generating.has(k)) { this.generating.add(k); this.queue.push([cx,cz]); } }
  processQueue(budgetMs = 4) { const start=performance.now(); let made=0; while(this.queue.length && performance.now()-start<budgetMs){ const [cx,cz]=this.queue.shift(); const k=chunkKey(cx,cz); if(!this.chunks.has(k)) this.chunks.set(k,this.generateChunk(cx,cz)); this.generating.delete(k); made++; } return made; }
  unloadFar(x,z,radius){ const cx=worldToChunk(x), cz=worldToChunk(z); for(const [k,c] of this.chunks){ if(Math.abs(c.cx-cx)>radius+2||Math.abs(c.cz-cz)>radius+2) this.chunks.delete(k); } }
  get(x,y,z){ x=Math.floor(x);y=Math.floor(y);z=Math.floor(z); if(y<0)return 17;if(y>=WORLD_HEIGHT)return 0; const k=chunkKey(worldToChunk(x),worldToChunk(z)); const mod=this.mods.get(`${x},${y},${z}`); if(mod!==undefined)return mod; const c=this.chunks.get(k); if(!c)return 0; return c.blocks[idx(localCoord(x),y,localCoord(z))]; }
  set(x,y,z,id,persist=true){ x=Math.floor(x);y=Math.floor(y);z=Math.floor(z); if(y<0||y>=WORLD_HEIGHT)return false; const c=this.getChunk(worldToChunk(x),worldToChunk(z),true); c.blocks[idx(localCoord(x),y,localCoord(z))]=id; c.dirty=true; if(persist)this.mods.set(`${x},${y},${z}`,id); return true; }
  biomeAt(x,z){
    const continental=fbm2(x*.0032,z*.0032,this.seed+80,4);
    const temp=fbm2(x*.004,z*.004,this.seed+91,3);
    const wet=fbm2(x*.004,z*.004,this.seed+113,3);
    const ridge=Math.abs(fbm2(x*.005,z*.005,this.seed+131,4)-.5)*2;
    if(continental<.35)return 7; if(continental<.39)return 8; if(ridge>.72)return 5; if(temp>.72&&wet<.36)return 3; if(temp<.28)return 4; if(wet>.76)return 6; if(wet>.56)return 1; if(temp<.46&&wet>.45)return 2; return 0;
  }
  heightAt(x,z){
    const biome=this.biomeAt(x,z); const broad=fbm2(x*.008,z*.008,this.seed+5,5); const detail=fbm2(x*.025,z*.025,this.seed+7,3);
    let h=17+broad*10+detail*3; if(biome===5)h+=Math.pow(fbm2(x*.012,z*.012,this.seed+9,5),2)*15; if(biome===7)h-=8; if(biome===8)h=SEA_LEVEL-1+detail*1.5; if(biome===6)h=SEA_LEVEL+detail*2; return Math.max(4,Math.min(WORLD_HEIGHT-8,Math.floor(h)));
  }
  generateChunk(cx,cz){
    const blocks=new Uint8Array(CHUNK_SIZE*CHUNK_SIZE*WORLD_HEIGHT); const baseX=cx*CHUNK_SIZE,baseZ=cz*CHUNK_SIZE;
    const heights=new Uint8Array(CHUNK_SIZE*CHUNK_SIZE); const biomes=new Uint8Array(CHUNK_SIZE*CHUNK_SIZE);
    for(let lz=0;lz<CHUNK_SIZE;lz++)for(let lx=0;lx<CHUNK_SIZE;lx++){
      const x=baseX+lx,z=baseZ+lz,b=this.biomeAt(x,z),h=this.heightAt(x,z); heights[lx+lz*CHUNK_SIZE]=h;biomes[lx+lz*CHUNK_SIZE]=b;
      const def=BIOMES[b];
      for(let y=0;y<WORLD_HEIGHT;y++){
        let id=0;
        if(y===0)id=17;
        else if(y<h-4) id=y<8?16:3;
        else if(y<h) id=def.sub;
        else if(y===h) id=def.surface;
        if(y>3&&y<h-2&&valueNoise3(x*.085,y*.09,z*.085,this.seed+300)>.73) id=0;
        if(id===3||id===16){ const r=rand(x,y,z,this.seed+401); if(y<13&&r>.982)id=42; else if(y<22&&r>.975)id=15; else if(y<29&&r>.968)id=14; else if(y<36&&r>.958)id=13; else if(r>.95)id=39; }
        if(y>h&&y<=SEA_LEVEL) id=b===4&&y===h+1?40:7;
        blocks[idx(lx,y,lz)]=id;
      }
    }
    const chunk={cx,cz,blocks,heights,biomes,dirty:true};
    this.decorate(chunk,baseX,baseZ); return chunk;
  }
  decorate(c,baseX,baseZ){
    for(let lz=1;lz<CHUNK_SIZE-1;lz++)for(let lx=1;lx<CHUNK_SIZE-1;lx++){
      const x=baseX+lx,z=baseZ+lz,h=c.heights[lx+lz*CHUNK_SIZE],b=c.biomes[lx+lz*CHUNK_SIZE],r=rand(x,0,z,this.seed+777);
      if((b===1&&r>.91)||(b===2&&r>.93)||(b===0&&r>.985))this.tree(c,lx,h+1,lz,b===2?10:8);
      else if(b!==3&&b!==4&&b!==7&&b!==8&&r>.78)c.blocks[idx(lx,h+1,lz)]=b===6&&r>.94?24:(r>.96?22:23);
    }
  }
  tree(c,x,y,z,log){
    const leaves=log===10?11:9, height=3+Math.floor(rand(c.cx+x,y,c.cz+z,this.seed+999)*3);
    for(let i=0;i<height&&y+i<WORLD_HEIGHT-1;i++)c.blocks[idx(x,y+i,z)]=log;
    for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy) > 4)continue; const xx=x+dx,zz=z+dz,yy=y+height-1+dy;
      if(xx>0&&xx<CHUNK_SIZE&&zz>0&&zz<CHUNK_SIZE&&yy>0&&yy<WORLD_HEIGHT&&c.blocks[idx(xx,yy,zz)]===0)c.blocks[idx(xx,yy,zz)]=leaves;
    }
  }
  tick(random=Math.random){
    for(const c of this.chunks.values())for(let n=0;n<12;n++){
      const x=Math.floor(random()*CHUNK_SIZE),z=Math.floor(random()*CHUNK_SIZE),y=Math.floor(random()*WORLD_HEIGHT),id=c.blocks[idx(x,y,z)];
      if((id===4)&&y>0&&c.blocks[idx(x,y-1,z)]===0){c.blocks[idx(x,y-1,z)]=id;c.blocks[idx(x,y,z)]=0;}
      if(id===43){if(random()<.22)c.blocks[idx(x,y,z)]=0;else if(random()<.18){const dirs=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];const d=dirs[Math.floor(random()*dirs.length)],xx=x+d[0],yy=y+d[1],zz=z+d[2];if(xx>=0&&zz>=0&&xx<CHUNK_SIZE&&zz<CHUNK_SIZE&&yy<WORLD_HEIGHT){const nb=BLOCK_BY_ID[c.blocks[idx(xx,yy,zz)]];if(nb?.flammable)c.blocks[idx(xx,yy,zz)]=43;}}}
      if(id===7&&y>0&&random()<.2){if(c.blocks[idx(x,y-1,z)]===0)c.blocks[idx(x,y-1,z)]=7;else{const dx=random()<.5?-1:1,zz=random()<.5?z:Math.max(0,Math.min(CHUNK_SIZE-1,z+dx)),xx=zz===z?Math.max(0,Math.min(CHUNK_SIZE-1,x+dx)):x;if(c.blocks[idx(xx,y,zz)]===0)c.blocks[idx(xx,y,zz)]=7;}}
      if(id===2&&y<WORLD_HEIGHT-1&&c.blocks[idx(x,y+1,z)]===0&&random()<.06){for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz;if(xx>=0&&zz>=0&&xx<CHUNK_SIZE&&zz<CHUNK_SIZE&&c.blocks[idx(xx,y,zz)]===1){c.blocks[idx(x,y,z)]=1;break;}}}
      if(id===25&&this.nearWater(c,x,y,z))c.blocks[idx(x,y,z)]=26;
      if(id===27&&random()<.025)c.blocks[idx(x,y,z)]=28; else if(id===28&&random()<.018)c.blocks[idx(x,y,z)]=29;
    }
  }
  nearWater(c,x,y,z){ for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,zz=z+dz;if(xx>=0&&zz>=0&&xx<CHUNK_SIZE&&zz<CHUNK_SIZE&&c.blocks[idx(xx,y,zz)]===7)return true;}return false; }
  serialize(){ return { seed:this.seed, mods:[...this.mods.entries()], functional:[...this.functional.entries()] }; }
  apply(data){ this.mods=new Map(Array.isArray(data?.mods)?data.mods:[]); this.functional=new Map(Array.isArray(data?.functional)?data.functional:[]); }
}

export function raycast(world, origin, dir, maxDist=6, includeLiquid=false){
  let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z);
  const sx=dir.x>=0?1:-1,sy=dir.y>=0?1:-1,sz=dir.z>=0?1:-1;
  const dx=Math.abs(1/(dir.x||1e-9)),dy=Math.abs(1/(dir.y||1e-9)),dz=Math.abs(1/(dir.z||1e-9));
  let tx=((dir.x>=0?x+1-origin.x:origin.x-x)*dx),ty=((dir.y>=0?y+1-origin.y:origin.y-y)*dy),tz=((dir.z>=0?z+1-origin.z:origin.z-z)*dz),dist=0,face={x:0,y:0,z:0};
  for(let i=0;i<128&&dist<=maxDist;i++){
    const id=world.get(x,y,z),b=BLOCK_BY_ID[id]; if(id&&b&&(includeLiquid||!b.liquid))return {x,y,z,id,dist,face};
    if(tx<ty&&tx<tz){x+=sx;dist=tx;tx+=dx;face={x:-sx,y:0,z:0};}
    else if(ty<tz){y+=sy;dist=ty;ty+=dy;face={x:0,y:-sy,z:0};}
    else{z+=sz;dist=tz;tz+=dz;face={x:0,y:0,z:-sz};}
  } return null;
}
