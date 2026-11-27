"""Synthetic rigid + residual reconstruction and real Blender transform-key test."""
import bpy, numpy as np
from mathutils import Vector
from cloth_motion_v19 import decompose_frames,apply_rigid_keys,world_vertices_gltf

def to_gltf(p):return np.column_stack((p[:,0],p[:,2],-p[:,1])).tolist()
base=np.asarray([[-.10,0,-.05],[.10,0,-.05],[-.10,.12,.04],[.10,.12,.04],[-.06,.25,-.02],[.06,.25,-.02],[-.08,.36,.03],[.08,.36,.03],[0,.18,.10]],dtype=np.float64)
def frame(deg,translation,deformation):
    a=np.radians(deg);c,s=np.cos(a),np.sin(a);r=np.asarray([[c,0,s],[0,1,0],[-s,0,c]],dtype=np.float64)
    local=base.copy()
    for i,d in deformation.items():local[i]+=np.asarray(d,dtype=np.float64)
    return local@r.T+np.asarray(translation,dtype=np.float64)
targets=[base.copy(),frame(12,[.03,.01,.02],{4:[.002,-.001,.003]}),frame(27,[.07,-.005,.06],{4:[.004,-.002,.005],8:[-.002,.001,0]})]
frames=[to_gltf(x) for x in targets]
d=decompose_frames(frames,24,active_start=1)
assert d["report"]["maxReconstructionErrorMetres"]<=1e-8
assert d["report"]["maxResidualOffsetMm"]>.1
mesh=bpy.data.meshes.new("v19-synthetic-collider");mesh.from_pydata([tuple(v) for v in base],[],[]);mesh.update()
obj=bpy.data.objects.new("v19-synthetic-collider",mesh);bpy.context.collection.objects.link(obj);obj.shape_key_add(name="Basis")
for i,local_gltf in enumerate(d["localFrames"][1:],start=1):
    p=np.asarray(local_gltf);local=np.column_stack((p[:,0],-p[:,2],p[:,1]))
    key=obj.shape_key_add(name="Residual_%02d"%i)
    for j,v in enumerate(local):key.data[j].co=Vector(v)
    for at in (i,i+1,i+2):
        if at>=1:key.value=float(at==i+1);key.keyframe_insert(data_path="value",frame=at)
apply_rigid_keys(obj,d["transforms"])
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=len(frames);maximum=0.0
for at,expected in enumerate(frames,start=1):
    scene.frame_set(at);actual=np.asarray(world_vertices_gltf(obj));expected=np.asarray(expected)
    maximum=max(maximum,float(np.linalg.norm(actual-expected,axis=1).max()))
assert maximum<=1e-5,"Blender transform + residual keys did not reproduce world geometry"
print({"syntheticFrames":len(frames),"vertices":len(base),"maxMathError":d["report"]["maxReconstructionErrorMetres"],"maxBlenderWorldMismatchMetres":maximum})
