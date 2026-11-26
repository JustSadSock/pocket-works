// Minimal standards-based GLB research adapter. No changes to Art Forge publishing.
import {animation} from './core.mjs';
import {styles} from './style.mjs';
export function glb(model){
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
 let prim=[],materials=new Map();
 for(let p of model.parts){let metal=/blade|guard|helm|lamella|boss|crest/.test(p.name),key=p.color.join(',')+':'+metal;if(!materials.has(key)){materials.set(key,doc.materials.length);doc.materials.push({name:p.name,pbrMetallicRoughness:{baseColorFactor:[...p.color,1],metallicFactor:metal?(style?.metallic??.45):0,roughnessFactor:style?.roughness??.72}})}
  let extra={};if(p.joints8&&p.weights8){let firstJ=[],firstW=[],secondJ=[],secondW=[];for(let i=0;i<p.joints8.length;i+=8){firstJ.push(...p.joints8.slice(i,i+4));firstW.push(...p.weights8.slice(i,i+4));secondJ.push(...p.joints8.slice(i+4,i+8));secondW.push(...p.weights8.slice(i+4,i+8))}extra={JOINTS_0:accessor(firstJ,'VEC4',5123,34962),WEIGHTS_0:accessor(firstW,'VEC4',5126,34962),JOINTS_1:accessor(secondJ,'VEC4',5123,34962),WEIGHTS_1:accessor(secondW,'VEC4',5126,34962)}}
  prim.push({attributes:{POSITION:accessor(p.positions,'VEC3',5126,34962,true),NORMAL:accessor(p.normals,'VEC3',5126,34962),JOINTS_0:accessor(p.joints,'VEC4',5123,34962),WEIGHTS_0:accessor(p.weights,'VEC4',5126,34962),...extra},indices:accessor(p.indices,'SCALAR',5125,34963),material:materials.get(key),extras:{part:p.name,component:p.component??'body',binding:p.binding}})}
 doc.meshes.push({name:model.spec.recipe,primitives:prim});doc.scenes[0].nodes.push(doc.nodes.length);doc.nodes.push({name:'Character skin',mesh:0,skin:0});
 for(let action of model.spec.actions){const duration=action==='run'?.65:action==='walk'?1.12:action==='fly'?.82:2,steps=24,times=Array.from({length:steps+1},(_,i)=>i/steps*duration),input=accessor(times,'SCALAR',5126,undefined,true),frames=times.map((_,i)=>animation(model,action,i/steps)),samplers=[],channels=[];
 for(let j of model.joints){let values=frames.flatMap(f=>f[j.id]);samplers.push({input,output:accessor(values,'VEC4'),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:j.id,path:'rotation'}})}
 doc.animations.push({name:action,samplers,channels})}
 let pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad}doc.buffers[0].byteLength=offset;
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]),bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
 let result=Buffer.concat([header,jh,json,bh,bin]);if(result.length>model.spec.budget.maxBytes)throw Error('Export byte budget exceeded');return result
}
export function inspectGLB(buf){if(buf.readUInt32LE(0)!==0x46546c67||buf.readUInt32LE(4)!==2||buf.readUInt32LE(8)!==buf.length)throw Error('Invalid GLB');const n=buf.readUInt32LE(12),d=JSON.parse(buf.subarray(20,20+n).toString());return d}
