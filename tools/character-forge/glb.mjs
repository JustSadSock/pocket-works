// Minimal standards-based GLB research adapter. No changes to Art Forge publishing.
import {animation,rootOffset} from './core.mjs';
import {styles} from './style.mjs';
import {png} from './material-study.mjs';
export function glb(model,{detailMaps=null}={}){
 const style=styles[model.spec.style];
 const doc={asset:{version:'2.0',generator:'Pocket Works Character Forge research'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],skins:[],animations:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[],extras:{spec:model.spec,components:model.components,sockets:model.sockets,contacts:model.contacts,approval:model.approval}};
 let chunks=[],offset=0;
 function accessor(data,type,componentType=5126,target,minmax=false){
  const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},size=sizes[type],typed=componentType===5126?new Float32Array(data):componentType===5123?new Uint16Array(data):new Uint32Array(data);
  const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength),padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding}
  const vi=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);offset+=bytes.length;
  let a={bufferView:vi,componentType,count:data.length/size,type};if(minmax){a.min=Array(size).fill(Infinity);a.max=Array(size).fill(-Infinity);for(let i=0;i<data.length;i++){let k=i%size;a.min[k]=Math.min(a.min[k],data[i]);a.max[k]=Math.max(a.max[k],data[i])}}
  doc.accessors.push(a);return doc.accessors.length-1
 }
 for(let j of model.joints){doc.nodes.push({name:j.name,translation:j.local,extras:{role:j.role,axis:j.axis,limitDegrees:j.limitDegrees,sourceFrame:j.sourceFrame}});if(j.parent<0)doc.scenes[0].nodes.push(j.id);else (doc.nodes[j.parent].children??=[]).push(j.id)}
 const inv=model.joints.flatMap(j=>[1,0,0,0,0,1,0,0,0,0,1,0,-j.position[0],-j.position[1],-j.position[2],1]);
 doc.skins.push({joints:model.joints.map(j=>j.id),inverseBindMatrices:accessor(inv,'MAT4'),skeleton:model.joints.find(j=>j.parent<0).id});
 const textureCache=new Map();
 function texture(kind,channel){
   const key=kind+':'+channel;if(textureCache.has(key))return textureCache.get(key);
   const map=detailMaps[kind],bytes=png(map.size,map.size,map[channel]),pad=(4-offset%4)%4;
   if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}
   const bufferView=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;
   doc.images??=[];doc.textures??=[];doc.samplers??=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
   const source=doc.images.length;doc.images.push({name:key,bufferView,mimeType:'image/png'});const index=doc.textures.length;doc.textures.push({source,sampler:0});textureCache.set(key,index);return index;
 }
 let prim=[],materials=new Map(),uvAudit={primitiveCount:0,vertexCount:0,missing:0,invalid:0,generated:0};
 for(let p of model.parts){let slots=p.weights8?8:4,js=p.joints8??p.joints,ws=p.weights8??p.weights;for(let i=0;i<ws.length;i+=slots){let positive=new Set(),total=0;for(let k=0;k<slots;k++){let w=ws[i+k],j=js[i+k];if(!Number.isFinite(w)||w<0||!Number.isInteger(j)||j<0||j>=model.joints.length)throw Error('Invalid skin influence '+p.name);if(w>0){if(positive.has(j))throw Error('Duplicate positive skin joint '+p.name+' vertex '+i/slots);positive.add(j);total+=w}}if(Math.abs(total-1)>1e-5)throw Error('Invalid total skin weight '+p.name)}let metal=/blade|guard|helm|lamella|boss|crest/.test(p.name),key=p.color.join(',')+':'+metal+':'+JSON.stringify(p.material??null);if(!materials.has(key)){materials.set(key,doc.materials.length);const mat={name:p.name,pbrMetallicRoughness:{baseColorFactor:[...p.color,1],metallicFactor:p.material?.metallic??(metal?(style?.metallic??.45):0),roughnessFactor:p.material?.roughness??style?.roughness??.72}};if(detailMaps?.[p.material?.kind]){const kind=p.material.kind;Object.assign(mat.pbrMetallicRoughness,{baseColorTexture:{index:texture(kind,'color')},metallicRoughnessTexture:{index:texture(kind,'roughness')},metallicFactor:1,roughnessFactor:1});mat.normalTexture={index:texture(kind,'normal'),scale:.65}}doc.materials.push(mat)}
  let extra={};if(p.vertexTint){if(p.vertexTint.length!==p.positions.length)throw Error('Invalid vertex tint');extra.COLOR_0=accessor(p.vertexTint,'VEC3',5126,34962)}{const uv=Array.isArray(p.texcoords)&&p.texcoords.length?p.texcoords.slice():[];if(!uv.length){for(let i=0;i<p.positions.length;i+=3)uv.push(p.positions[i]*5+p.positions[i+2]*2.7,p.positions[i+1]*5);uvAudit.generated++}if(uv.length!==p.positions.length/3*2||uv.some(v=>!Number.isFinite(v))){uvAudit.invalid++;throw Error('Invalid UV channel '+p.name)}if(!uv.length){uvAudit.missing++;throw Error('Missing UV channel '+p.name)}uvAudit.primitiveCount++;uvAudit.vertexCount+=p.positions.length/3;extra.TEXCOORD_0=accessor(uv,'VEC2',5126,34962)}if(p.joints8&&p.weights8){let firstJ=[],firstW=[],secondJ=[],secondW=[];for(let i=0;i<p.joints8.length;i+=8){firstJ.push(...p.joints8.slice(i,i+4));firstW.push(...p.weights8.slice(i,i+4));secondJ.push(...p.joints8.slice(i+4,i+8));secondW.push(...p.weights8.slice(i+4,i+8))}extra={...extra,JOINTS_0:accessor(firstJ,'VEC4',5123,34962),WEIGHTS_0:accessor(firstW,'VEC4',5126,34962),JOINTS_1:accessor(secondJ,'VEC4',5123,34962),WEIGHTS_1:accessor(secondW,'VEC4',5126,34962)}}
  prim.push({attributes:{POSITION:accessor(p.positions,'VEC3',5126,34962,true),NORMAL:accessor(p.normals,'VEC3',5126,34962),JOINTS_0:accessor(p.joints,'VEC4',5123,34962),WEIGHTS_0:accessor(p.weights,'VEC4',5126,34962),...extra},indices:accessor(p.indices,'SCALAR',5125,34963),material:materials.get(key),extras:{part:p.name,component:p.component??'body',binding:p.binding}})}
 doc.meshes.push({name:model.spec.recipe,primitives:prim});doc.scenes[0].nodes.push(doc.nodes.length);doc.nodes.push({name:'Character skin',mesh:0,skin:0});
 for(let action of model.spec.actions){const duration=action==='run'?.65:action==='walk'?(model.spec.walkDuration??1.12):action==='fly'?.82:2,steps=action==='walk'&&model.sampledWalk?model.sampledWalk.rotations.length-1:24,times=Array.from({length:steps+1},(_,i)=>i/steps*duration),input=accessor(times,'SCALAR',5126,undefined,true),frames=times.map((_,i)=>animation(model,action,i/steps)),samplers=[],channels=[];
 for(let j of model.joints){let prior=null,values=frames.flatMap(f=>{let q=f[j.id];if(prior&&q.reduce((s,x,i)=>s+x*prior[i],0)<0)q=q.map(x=>-x);prior=q;return q});samplers.push({input,output:accessor(values,'VEC4'),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:j.id,path:'rotation'}})}
 if((action==='walk'&&model.sampledWalk)||['v3','v4','v9'].includes(model.spec.motionRevision)){let root=model.joints.find(j=>j.parent<0),values=times.flatMap((_,i)=>root.local.map((x,k)=>x+rootOffset(model,action,i/steps)[k]));samplers.push({input,output:accessor(values,'VEC3'),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:root.id,path:'translation'}})}
 doc.animations.push({name:action,samplers,channels})}
 doc.extras.uvAudit=uvAudit;
 let pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}doc.buffers[0].byteLength=offset;
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]),bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
 let result=Buffer.concat([header,jh,json,bh,bin]);if(result.length>model.spec.budget.maxBytes)throw Error('Export byte budget exceeded');return result
}
export function inspectGLB(buf){if(buf.readUInt32LE(0)!==0x46546c67||buf.readUInt32LE(4)!==2||buf.readUInt32LE(8)!==buf.length)throw Error('Invalid GLB');const n=buf.readUInt32LE(12),d=JSON.parse(buf.subarray(20,20+n).toString());return d}
