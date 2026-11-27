"""Research-only rigid transform + local residual decomposition for Character Forge v0.19."""
import numpy as np
from mathutils import Matrix, Quaternion, Vector

def _to_blender(points):
    p=np.asarray(points,dtype=np.float64).reshape((-1,3))
    return np.column_stack((p[:,0],-p[:,2],p[:,1]))

def _to_gltf(points):
    p=np.asarray(points,dtype=np.float64).reshape((-1,3))
    return np.column_stack((p[:,0],p[:,2],-p[:,1])).tolist()

def _fit_rigid(base,target):
    a=base.mean(axis=0);b=target.mean(axis=0)
    u,_,vt=np.linalg.svd((base-a).T@(target-b))
    correction=np.eye(3);correction[2,2]=1.0 if np.linalg.det(u@vt)>=0 else -1.0
    rotation=u@correction@vt
    translation=b-a@rotation
    return rotation,translation,base@rotation+translation

def decompose_frames(frames,fps,active_start=0):
    if len(frames)<2 or fps<=0:raise ValueError("Need at least two frames and positive FPS")
    base=_to_blender(frames[0]);transforms=[];local_frames=[];rigid_world=[];residual_world=[];per_frame=[]
    max_reconstruction=0.0;max_orthogonal=0.0;previous_q=None
    for index,source in enumerate(frames):
        target=_to_blender(source)
        rotation,translation,predicted=_fit_rigid(base,target)
        local=(target-translation)@rotation.T
        residual=local-base
        reconstructed=(base+residual)@rotation+translation
        error=np.linalg.norm(reconstructed-target,axis=1)
        max_reconstruction=max(max_reconstruction,float(error.max()))
        max_orthogonal=max(max_orthogonal,float(np.max(np.abs(rotation.T@rotation-np.eye(3)))))
        q=Matrix(rotation.T.tolist()).to_quaternion()
        qv=np.asarray([q.w,q.x,q.y,q.z],dtype=np.float64)
        if previous_q is not None and float(np.dot(previous_q,qv))<0:qv=-qv
        previous_q=qv
        transforms.append({"translation":translation.tolist(),"rotation":qv.tolist()})
        local_frames.append(_to_gltf(base+residual))
        rigid_world.append(predicted);residual_world.append(target-predicted)
        angle_cos=max(-1.0,min(1.0,(float(np.trace(rotation))-1.0)*0.5))
        lengths=np.linalg.norm(residual,axis=1)
        per_frame.append({"frame":index+1,"translationMetres":float(np.linalg.norm(translation)),
            "rotationDegrees":float(np.degrees(np.arccos(angle_cos))),
            "residualRmsMm":float(np.sqrt(np.mean(lengths**2))*1000.0),
            "residualMaxMm":float(lengths.max()*1000.0),
            "reconstructionMaxMicrometres":float(error.max()*1e6)})
    rigid_speeds=[];residual_speeds=[];surface_speeds=[]
    for i in range(1,len(frames)):
        rd=(rigid_world[i]-rigid_world[i-1])*fps
        ed=(residual_world[i]-residual_world[i-1])*fps
        sd=(_to_blender(frames[i])-_to_blender(frames[i-1]))*fps
        if np.max(np.abs(rd+ed-sd))>1e-8:raise RuntimeError("Rigid + residual velocity decomposition is not additive")
        rigid_speeds.append(np.linalg.norm(rd,axis=1));residual_speeds.append(np.linalg.norm(ed,axis=1));surface_speeds.append(np.linalg.norm(sd,axis=1))
    def summary(values,indices):
        chosen=[values[i-1] for i in indices if 1<=i<len(values)+1]
        if not chosen:return {"meanVertexSpeed":0.0,"p95VertexSpeed":0.0,"maxVertexSpeed":0.0,"meanPerFrameMaximum":0.0,"maxPerFrameMaximum":0.0}
        matrix=np.asarray(chosen,dtype=np.float64);mx=matrix.max(axis=1)
        return {"meanVertexSpeed":float(matrix.mean()),"p95VertexSpeed":float(np.percentile(matrix,95)),
            "maxVertexSpeed":float(matrix.max()),"meanPerFrameMaximum":float(mx.mean()),"maxPerFrameMaximum":float(mx.max())}
    all_intervals=list(range(1,len(frames)))
    active_start=max(0,min(int(active_start),len(frames)-1))
    active=[i for i in all_intervals if i>=active_start]
    residual_offsets=[np.linalg.norm(_to_blender(local_frames[i])-base,axis=1) for i in range(len(frames))]
    report={"version":"v0.19","method":"proper-rotation Kabsch fit; 92-point outer collision surface; rigid world displacement + world residual displacement",
        "vertices":int(len(base)),"frames":int(len(frames)),"fps":float(fps),"activeStartFrameIndex":active_start,"activeIntervals":len(active),
        "maxReconstructionErrorMetres":max_reconstruction,"maxOrthogonalError":max_orthogonal,
        "meanResidualOffsetMm":float(np.mean([x.mean() for x in residual_offsets])*1000.0),
        "maxResidualOffsetMm":float(max(x.max() for x in residual_offsets)*1000.0),
        "allIntervals":{"surface":summary(surface_speeds,all_intervals),"rigid":summary(rigid_speeds,all_intervals),"residual":summary(residual_speeds,all_intervals)},
        "activeIntervalsOnly":{"surface":summary(surface_speeds,active),"rigid":summary(rigid_speeds,active),"residual":summary(residual_speeds,active)},
        "perFrame":per_frame}
    return {"localFrames":local_frames,"transforms":transforms,"report":report}

def apply_rigid_keys(obj,transforms):
    obj.rotation_mode="QUATERNION";obj.scale=(1.0,1.0,1.0)
    for frame,t in enumerate(transforms,start=1):
        obj.location=Vector(t["translation"]);obj.rotation_quaternion=Quaternion(t["rotation"])
        obj.keyframe_insert(data_path="location",frame=frame)
        obj.keyframe_insert(data_path="rotation_quaternion",frame=frame)
    animation=obj.animation_data
    if animation and animation.action:
        action=animation.action
        if hasattr(action,"fcurves"):curves=action.fcurves
        else:
            from bpy_extras.anim_utils import action_get_channelbag_for_slot
            curves=action_get_channelbag_for_slot(action,animation.action_slot).fcurves
        for curve in curves:
            for key in curve.keyframe_points:key.interpolation="LINEAR"

def world_vertices_gltf(obj):
    import bpy
    depsgraph=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh()
    try:
        matrix=evaluated.matrix_world;result=[]
        for vertex in mesh.vertices:
            p=matrix@vertex.co;result.append([p.x,p.z,-p.y])
        return result
    finally:evaluated.to_mesh_clear()
