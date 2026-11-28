// Three.js r180 adapter for glTF JOINTS_1 / WEIGHTS_1.
// The original raw accessors are required: GLTFLoader normalizes WEIGHTS_0
// independently. Standard unmodified glTF consumers remain unsupported.
// No role, rig family, or animation assumptions.
export function installEightInfluenceSkin(T,mesh,raw){
 const count=mesh.geometry.attributes.position.count;
 if(raw.joints0.length!==count*4||raw.joints1.length!==count*4||raw.weights0.length!==count*4||raw.weights1.length!==count*4)throw Error('Invalid eight-influence attribute lengths');
 for(let i=0;i<count;i++){let sum=0;for(let k=0;k<4;k++){const a=raw.weights0[4*i+k],b=raw.weights1[4*i+k];if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)throw Error('Invalid raw weights');sum+=a+b}if(Math.abs(sum-1)>1e-5)throw Error('Raw eight weights do not sum to one')}
 const g=mesh.geometry;g.setAttribute('skinIndex',new T.Uint16BufferAttribute(raw.joints0,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(raw.weights0,4));g.setAttribute('skinIndex2',new T.Uint16BufferAttribute(raw.joints1,4));g.setAttribute('skinWeight2',new T.Float32BufferAttribute(raw.weights1,4));
 const base=new T.Vector3(),v=new T.Vector3(),mat=new T.Matrix4();
 mesh.applyBoneTransform=function(i,target){
  base.copy(target).applyMatrix4(this.bindMatrix);target.set(0,0,0);
  for(const [j,w] of [[g.attributes.skinIndex,g.attributes.skinWeight],[g.attributes.skinIndex2,g.attributes.skinWeight2]])for(let k=0;k<4;k++){const weight=w.getComponent(i,k);if(weight===0)continue;const bone=j.getComponent(i,k);mat.multiplyMatrices(this.skeleton.bones[bone].matrixWorld,this.skeleton.boneInverses[bone]);target.addScaledVector(v.copy(base).applyMatrix4(mat),weight)}
  return target.applyMatrix4(this.bindMatrixInverse);
 };
 // Clone materials because glTF may share one material with an unrelated mesh.
 const patch=material=>{const m=material.clone();patchEightInfluenceMaterial(T,m);return m};
 mesh.material=Array.isArray(mesh.material)?mesh.material.map(patch):patch(mesh.material);return mesh;
}
export function patchEightInfluenceMaterial(T,material){
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);
  const chunks=T.ShaderChunk,base=chunks.skinbase_vertex,skin=chunks.skinning_vertex,normal=chunks.skinnormal_vertex;
  const extraBase=base.replace('#endif',` mat4 boneMatE = getBoneMatrix( skinIndex2.x );
 mat4 boneMatF = getBoneMatrix( skinIndex2.y );
 mat4 boneMatG = getBoneMatrix( skinIndex2.z );
 mat4 boneMatH = getBoneMatrix( skinIndex2.w );
 #endif`);
  const anchor='transformed = ( bindMatrixInverse * skinned ).xyz;';
  const normAnchor='skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;';
  if(!skin.includes(anchor)||!normal.includes(normAnchor)||!base.includes('#endif'))throw Error('Unsupported Three.js skinning chunk contract '+T.REVISION);
  const extraSkin=skin.replace(anchor,`skinned += boneMatE * skinVertex * skinWeight2.x;
 skinned += boneMatF * skinVertex * skinWeight2.y;
 skinned += boneMatG * skinVertex * skinWeight2.z;
 skinned += boneMatH * skinVertex * skinWeight2.w;
 ${anchor}`);
  const extraNormal=normal.replace(normAnchor,`skinMatrix += skinWeight2.x * boneMatE;
 skinMatrix += skinWeight2.y * boneMatF;
 skinMatrix += skinWeight2.z * boneMatG;
 skinMatrix += skinWeight2.w * boneMatH;
 ${normAnchor}`);
  shader.vertexShader='attribute vec4 skinIndex2; attribute vec4 skinWeight2;\n'+shader.vertexShader.replace('#include <skinbase_vertex>',extraBase).replace('#include <skinning_vertex>',extraSkin).replace('#include <skinnormal_vertex>',extraNormal);
 };
 const key=material.customProgramCacheKey.bind(material);material.customProgramCacheKey=()=>key()+'|forge-eight-r180';material.needsUpdate=true;
}
