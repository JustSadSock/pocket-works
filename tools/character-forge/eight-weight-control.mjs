// Minimal, independent glTF control: the fifth influence alone moves the triangle.
// The four retained joints are static. All five joint transforms start at identity.
export const controlDisplacement = .05;
export const controlFifthWeight = .4;
export const controlExpectedMm = controlDisplacement * controlFifthWeight * 1000;
export function eightWeightControlGLB(){
 const chunks=[],views=[],accessors=[];let length=0;
 function add(data,componentType,type,count,extra={}){
  const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
  const bytes=Buffer.alloc(data.length*(componentType===5123?2:4));
  data.forEach((x,i)=>componentType===5123?bytes.writeUInt16LE(x,2*i):bytes.writeFloatLE(x,4*i));
  const bufferView=views.length;views.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;
  const id=accessors.length;accessors.push({bufferView,componentType,type,count,...extra});return id;
 }
 const repeated=a=>[...a,...a,...a];
 const attributes={POSITION:add([0,0,0,.1,0,0,0,.1,0],5126,'VEC3',3,{min:[0,0,0],max:[.1,.1,0]}),JOINTS_0:add(repeated([0,1,2,3]),5123,'VEC4',3),WEIGHTS_0:add(repeated([.15,.15,.15,.15]),5126,'VEC4',3),JOINTS_1:add(repeated([4,0,0,0]),5123,'VEC4',3),WEIGHTS_1:add(repeated([controlFifthWeight,0,0,0]),5126,'VEC4',3)};
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1,2,3,4,5]}],nodes:[{mesh:0,skin:0},...Array.from({length:5},(_,i)=>({name:'control-joint-'+i}))],skins:[{joints:[1,2,3,4,5]}],meshes:[{primitives:[{attributes,mode:4,extras:{part:'five-influence-control'}}]}],buffers:[{byteLength:length}],bufferViews:views,accessors};
 const json=Buffer.from(JSON.stringify(doc)),jsonPad=Buffer.alloc((4-json.length%4)%4,0x20),bin=Buffer.concat([...chunks,Buffer.alloc((4-length%4)%4)]);
 const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPad.length+bin.length,8);jh.writeUInt32LE(json.length+jsonPad.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jh,json,jsonPad,bh,bin]);
}
