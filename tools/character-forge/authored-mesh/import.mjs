// Generic external authored mesh import. No recipe/style enumeration; exact source rig required.
const finite=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
export function importAuthoredStudy(base,document){
 if(document?.version!==1||!Array.isArray(document.rig)||!Array.isArray(document.parts)||!document.parts.length)throw Error('Invalid authored mesh document');
 const joints=base.joints;if(document.rig.length!==joints.length)throw Error('Rig length mismatch');
 for(let i=0;i<joints.length;i++){const a=document.rig[i],b=joints[i];if(a.id!==i||b.id!==i||a.name!==b.name||a.parent!==b.parent||!['position','local'].every(k=>finite(a[k],3)&&finite(b[k],3)&&a[k].every((v,j)=>Math.abs(v-b[k][j])<=1e-8)))throw Error('Rig mismatch at '+i);}
 const names=new Set();let triangles=0,vertices=0;
 for(const p of document.parts){const n=p.positions?.length/3;if(!p.name||names.has(p.name)||!Number.isInteger(n)||n<=0||!finite(p.positions,n*3)||!finite(p.normals,n*3)||!finite(p.color,3)||!Array.isArray(p.indices)||!p.indices.length||p.indices.length%3||p.indices.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid authored geometry '+p.name);names.add(p.name);
  for(let i=0;i<p.indices.length;i+=3)if(new Set(p.indices.slice(i,i+3)).size!==3)throw Error('Degenerate authored face '+p.name);
  for(const [js,ws,count] of [['joints','weights',4],['joints8','weights8',8]]){if(count===8&&p[js]===undefined&&p[ws]===undefined)continue;if(!finite(p[js],n*count)||!finite(p[ws],n*count))throw Error('Missing skin channel '+p.name);for(let i=0;i<n;i++){let total=0,positive=new Set();for(let k=0;k<count;k++){const j=p[js][i*count+k],w=p[ws][i*count+k];if(!Number.isInteger(j)||j<0||j>=joints.length||w<0||w>1||w>0&&positive.has(j))throw Error('Invalid influence '+p.name);if(w>0)positive.add(j);total+=w;}if(Math.abs(total-1)>1e-5)throw Error('Unnormalized skin '+p.name);}}
  triangles+=p.indices.length/3;vertices+=n;
 }
 if(triangles>35000||joints.length>192)throw Error('P0 study budget exceeded');
 const model=structuredClone(base);model.parts=structuredClone(document.parts);model.components=[];model.sockets=[];model.contacts=[];model.statistics={triangleCount:triangles,vertices,joints:joints.length};model.spec={...model.spec,recipe:'authored-mesh-study',budget:{maxTriangles:35000,maxJoints:192,maxBytes:16000000},authoredMeshStudy:true};model.approval='Unqualified authored mesh study; not accepted';return model;
}
