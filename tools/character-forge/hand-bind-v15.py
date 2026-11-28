"""Independent Blender armature and real evaluated skin on the pinned MakeHuman data.
Character Core stores world-aligned bind axes; Blender uses original bone frames.
No Core code is imported into this verifier.
"""
import os,json,math
from pathlib import Path
import bpy
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
out=Path(os.environ['CHARACTER_EVIDENCE'])
m=json.loads((out/'morph/makehuman-base.json').read_text())
report=json.loads((out/'morph/v15-hand-core.json').read_text())
p=m['parts'][0];joints=m['joints'];selected=report['selected'];faces=report['faces']
cv=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));ci=cv.inverted()
def vec(v):return (cv@Vector((*v,1))).to_3d()
def native(v):return list((ci@Vector((*v,1))).to_3d())
def mat(q,t):
 return Matrix.Translation(Vector(t))@Quaternion((q[3],*q[:3])).to_matrix().to_4x4()
def err(a,b):return max(abs(a[i][j]-b[i][j]) for i in range(4) for j in range(4))
def arr(a):return [[float(x) for x in row] for row in a]
bpy.ops.wm.read_factory_settings(use_empty=True)
arm=bpy.data.armatures.new('Original marker rig');ob=bpy.data.objects.new('Source rig',arm);bpy.context.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob;ob.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for j in joints:
 b=arm.edit_bones.new(j['name']);b.head=vec(j['position']);b.tail=vec(j['sourceTail'])
 if (b.tail-b.head).length<1e-6:b.tail=b.head+Vector((0,0,.001))
 if j['parent']>=0:b.parent=arm.edit_bones[joints[j['parent']]['name']]
 if j.get('sourceFrame'):b.align_roll((cv.to_3x3()@Vector(j['sourceFrame'][2])).normalized())
bpy.ops.object.mode_set(mode='OBJECT')
mesh=bpy.data.meshes.new('Original MakeHuman hand');mesh.from_pydata([vec(p['positions'][i*3:i*3+3]) for i in selected],[],faces);mesh.update()
hand=bpy.data.objects.new('Source skin 8 influences',mesh);bpy.context.collection.objects.link(hand)
groups=[hand.vertex_groups.new(name=j['name']) for j in joints]
for v,i in enumerate(selected):
 for k in range(8):
  w=p['weights8'][i*8+k]
  if w>0:groups[p['joints8'][i*8+k]].add([v],w,'REPLACE')
mod=hand.modifiers.new('Independent Blender LBS','ARMATURE');mod.object=ob;mod.use_deform_preserve_volume=False
bind=[ob.data.bones[j['name']].matrix_local.copy() for j in joints];bindInv=[a.inverted() for a in bind]
frames=[]
# Independent bind audit: rest-frame orientation difference is intentional,
# compare the transformed inverse binds and skin matrices, not raw axis labels.
bindRows=[]
for i,j in enumerate(joints):
 f=j['sourceFrame'];F=Matrix(tuple(zip(*f))).to_4x4();source=Matrix.Translation(Vector(j['position']))@F;actual=ci@bind[i]@cv
 # Actual bone rotation columns are expressed in source coordinate convention;
 # compare source frame after changing world basis only.
 source_actual=ci@bind[i]
 bindRows.append({'joint':j['name'],'centerErrorMm':(Vector(native(bind[i].translation))-Vector(j['position'])).length*1000,'sourceFrameError':err(source_actual,source),'inverseBind':arr(bindInv[i]),'coreInverseBind':arr(Matrix.Translation(-Vector(j['position']))),'bindClosure':err(bind[i]@bindInv[i],Matrix.Identity(4))})
def overlap(v):
 tree=BVHTree.FromPolygons([Vector(x) for x in v],faces,all_triangles=True,epsilon=0)
 return {(a,b) for a,b in tree.overlap(tree) if a<b and not set(faces[a])&set(faces[b])}
baseline=overlap(report['rest'])
for row in report['rows']:
 for j in joints:
  pb=ob.pose.bones[j['name']];pb.rotation_mode='QUATERNION';q=row['sourceLocal'].get(j['name'],[0,0,0,1]);pb.rotation_quaternion=Quaternion((q[3],*q[:3]))
 bpy.context.view_layer.update();ev=hand.evaluated_get(bpy.context.evaluated_depsgraph_get());em=ev.to_mesh();v=[native(x.co) for x in em.vertices];ev.to_mesh_clear()
 diffs=[math.dist(a,b)*1000 for a,b in zip(v,row['vertices'])];matrixRows=[]
 for i,j in enumerate(joints):
  actual=ci@ob.pose.bones[j['name']].matrix@bindInv[i]@cv
  c=row['world'][i];expect=mat(c['q'],c['p'])@Matrix.Translation(-Vector(j['position']))
  matrixRows.append({'joint':j['name'],'skinMatrixError':err(actual,expect),'sourceWorld':arr(ci@ob.pose.bones[j['name']].matrix),'coreWorld':arr(mat(c['q'],c['p']))})
 # actual vertex group weights are verified, not just copied input values.
 werr=0
 for k,i in enumerate(selected):
  expect={p['joints8'][i*8+s]:p['weights8'][i*8+s] for s in range(8) if p['weights8'][i*8+s]>0}
  got={g.group:g.weight for g in mesh.vertices[k].groups};werr=max(werr,*[abs(expect.get(j,0)-got.get(j,0)) for j in set(expect)|set(got)])
 frames.append({'name':row['name'],'maxVertexErrorMm':max(diffs),'meanVertexErrorMm':sum(diffs)/len(diffs),'maxSkinMatrixError':max(x['skinMatrixError'] for x in matrixRows),'maxWeightError':werr,'coreSelfPairs':len(overlap(row['vertices'])-baseline),'blenderSelfPairs':len(overlap(v)-baseline),'matrices':matrixRows,'vertices':v})
result={'source':'Independent Blender LBS from pinned source marker frames, original 8 influences','bind':bindRows,'frames':frames,'agreement':all(x['maxVertexErrorMm']<=.05 and x['maxSkinMatrixError']<=.0001 and x['maxWeightError']<=1e-6 for x in frames),'limitations':'Marker-derived source frames; not the complete MakeHuman application or artist-authored corrective rig. BVH triangle-overlap counts exclude shared-vertex neighbors.'}
(out/'v15-hand-independent.json').write_text(json.dumps(result))
print(json.dumps({'agreement':result['agreement'],'frames':[{k:v for k,v in x.items() if k not in ('vertices','matrices')} for x in frames]}),flush=True)
