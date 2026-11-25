// Read the exported Forge asset, not an imitation of its source functions.
// Blender GLB uses X/Z as horizontal coordinates and Y as height.
const root=new URL('./assets/terrain-lab/',import.meta.url);
export async function loadForgeProfiles(){
 const started=performance.now(),manifest=await fetch(new URL('forge-index.json',root)).then(r=>{if(!r.ok)throw Error('Missing Forge index');return r.json();}),record=manifest.assets.find(x=>x.id==='geological-forms').outputs.model;
 const raw=await fetch(new URL('geological-forms.glb',root)).then(r=>{if(!r.ok)throw Error('Missing Forge GLB');return r.arrayBuffer();});
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');if(sha!==record.sha256)throw Error('Forge resource hash mismatch');
 const d=new DataView(raw);if(d.getUint32(0,true)!==0x46546c67||d.getUint32(4,true)!==2||d.getUint32(8,true)!==raw.byteLength)throw Error('Invalid GLB header');const size=d.getUint32(12,true);if(d.getUint32(16,true)!==0x4e4f534a)throw Error('Invalid GLB JSON chunk');const json=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,size))),bin=20+size+8;if(d.getUint32(20+size+4,true)!==0x004e4942)throw Error('Invalid GLB BIN chunk');
 const N=81,profiles=new Map(),names=['ridge','summit','outcrop','scree','gorge','foothills','rock-shelf','slope'];for(const name of names){const node=json.nodes.find(n=>n.name==='terrain-'+name);if(!node||node.mesh===undefined)throw Error('Missing asset '+name);const grid=new Float32Array(N*N).fill(NaN);
 for(const primitive of json.meshes[node.mesh].primitives){const a=json.accessors[primitive.attributes.POSITION],bv=json.bufferViews[a.bufferView];if(a.componentType!==5126||a.type!=='VEC3'||a.sparse||bv.buffer!==0)throw Error('Unsupported Forge position buffer');const off=bin+(bv.byteOffset||0)+(a.byteOffset||0),stride=bv.byteStride||12;for(let i=0;i<a.count;i++){const k=off+i*stride,x=d.getFloat32(k,true),height=d.getFloat32(k+4,true),y=-d.getFloat32(k+8,true),X=Math.round((x+1)*40),Y=Math.round((y+1)*40);if(X<0||X>=N||Y<0||Y>=N||height<-.0001||height>2||Math.abs(x-(X/40-1))>.0001||Math.abs(y-(Y/40-1))>.0001)throw Error('Unexpected local asset coordinate '+name);grid[Y*N+X]=height;}}
 if(grid.some(v=>!Number.isFinite(v)))throw Error('Incomplete Forge lattice '+name);profiles.set(name,grid);}
 const sample=(name,x,y)=>{if(Math.abs(x)>=1||Math.abs(y)>=1)return 0;const g=profiles.get(name),u=(x+1)*40,v=(y+1)*40,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;return (g[j*N+i]*(1-a)+g[j*N+i+1]*a)*(1-b)+(g[(j+1)*N+i]*(1-a)+g[(j+1)*N+i+1]*a)*b;};
 return {sample,meta:{sha256:sha,bytes:raw.byteLength,forms:profiles.size,loadMs:performance.now()-started,source:record.url}};
}
