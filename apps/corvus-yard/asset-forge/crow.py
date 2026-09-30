"""CORVUS — deterministic layered-feather raven, 16-bone authored rig.
Original geometry; no external asset or texture dependency. Blender 4.5+.
"""
import bpy, math, random, os, sys, argparse
from mathutils import Vector, Matrix
random.seed(731)
p=argparse.ArgumentParser(); p.add_argument('--output',default=os.environ.get('ASSET_FORGE_OUTPUT','crow.glb')); a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,col,rough=.36,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*col,1); bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
 return m
plumage=mat('Obsidian · violet blue feather sheen',(.018,.023,.033),.48,.10)
featherM=[mat('Flight feather %s'%i,(.014+i*.002,.019+i*.002,.026+i*.003),.40+i*.022,.10) for i in range(5)]
beak=mat('Horn · satin black',(.018,.020,.021),.29,.03); claw=mat('Scutes · charcoal',(.035,.038,.039),.6); eye=mat('Eye · wet obsidian',(.003,.004,.004),.08); iris=mat('Iris · deep umber',(.055,.038,.022),.22); glint=mat('Eye catchlight',(.38,.40,.36),.15)
# Blender forward -Y; glTF forward +Z. Wing origin at shoulder.
bones={
 'Body':((0,0,-.08),(0,0,.13),None),
 'Head':((0,-.22,.12),(0,-.33,.28),'Body'),
 'Tail':((0,.22,-.04),(0,.55,-.10),'Body'),
 'Wing.L':((.12,.015,.06),(.42,.06,.07),'Body'), 'Wing.R':((-.12,.015,.06),(-.42,.06,.07),'Body'),
 'Wrist.L':((.42,.06,.07),(.75,.13,.06),'Wing.L'), 'Wrist.R':((-.42,.06,.07),(-.75,.13,.06),'Wing.R'),
 'Leg.L':((.07,.01,-.17),(.075,.025,-.32),'Body'), 'Leg.R':((-.07,.01,-.17),(-.075,.025,-.32),'Body'),
 'Foot.L':((.075,.025,-.32),(.075,-.09,-.455),'Leg.L'), 'Foot.R':((-.075,.025,-.32),(-.075,-.09,-.455),'Leg.R')}
arm=bpy.data.armatures.new('Corvus skeleton'); rig=bpy.data.objects.new('CorvusRig',arm); bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t,par) in bones.items():
 b=arm.edit_bones.new(n); b.head=h; b.tail=t; b.align_roll(Vector((0,0,1)))
 if par:b.parent=arm.edit_bones[par]
bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
parts=[]
def bind(o,m,b):
 o.data.materials.append(m)
 for f in o.data.polygons:f.use_smooth=True
 g=o.vertex_groups.new(name=b); g.add(list(range(len(o.data.vertices))),1,'REPLACE'); mod=o.modifiers.new('Feather skin','ARMATURE'); mod.object=rig; o.parent=rig; parts.append(o); return o
def ell(name,loc,scale,m,b,seg=20,rings=12):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc); o=bpy.context.object; o.name=name; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); return bind(o,m,b)
def tube(name,p1,p2,r1,r2,m,b,verts=8):
 v=Vector(p2)-Vector(p1); bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=v.length,location=(Vector(p1)+Vector(p2))/2); o=bpy.context.object; o.name=name; o.rotation_euler=v.to_track_quat('Z','Y').to_euler(); return bind(o,m,b)
def feather(name,start,end,width,m,b,curve=.012):
 # Lenticular blade, curved shaft and four cross sections; actual volume.
 s=Vector(start); e=Vector(end); d=e-s; side=Vector((d.y,-d.x,0)).normalized(); vs=[]
 for i in range(7):
  t=i/6; c=s+d*t+Vector((0,0,curve*math.sin(math.pi*t))); w=width*(math.sin(math.pi*(.08+.9*t))**.65)*(1-.65*t)
  for offset,z in [(-w,0),(0,.007*(1-t)),(w,0),(0,-.003)]:vs.append(tuple(c+side*offset+Vector((0,0,z))))
 fs=[]
 for i in range(6):
  for j in range(4):fs.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 fs += [(0,1,2,3),(24,27,26,25)]
 mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],fs); mesh.update(); o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); bind(o,m,b)
 # central shaft has stronger specular and makes plumage visibly layered.
 tube(name+' rachis',start,tuple(s+d*.90+Vector((0,0,.004))),.002,.0007,m,b,5)
ell('Deep keel breast',(0,-.015,-.055),(.145,.27,.205),plumage,'Body',28,18)
ell('Shoulder mantle',(0,.055,.075),(.164,.215,.13),plumage,'Body',24,16)
ell('Neck',(0,-.205,.13),(.096,.115,.133),plumage,'Head')
ell('Angular raven cranium',(0,-.295,.225),(.103,.108,.095),plumage,'Head',24,16)
# Short crown plumage follows the skull rather than one uninterrupted specular dome.
for row in range(4):
 for col in range(7):
  x=(col-3)*.022; y=-.35+row*.033
  z=.226+.098*math.sqrt(max(.05,1-(x/.108)**2-((y+.295)/.115)**2))
  feather('Crown silk',(x,y,z),(x,y+.055,z-.008),.014,featherM[(col+row)%5],'Head',.003)
# Heavy curved raven bill, upper and lower mandibles with precise seam.
verts=[(-.055,-.362,.258),(.055,-.362,.258),(-.047,-.373,.205),(.047,-.373,.205),(0,-.535,.216),(0,-.485,.252),(0,-.55,.194),(0,-.382,.19)]
faces=[(0,1,5),(1,3,4,5),(0,5,4,2),(2,4,3),(2,3,7),(3,4,6,7),(2,7,6,4)]
me=bpy.data.meshes.new('Hooked mandibles'); me.from_pydata(verts,[],faces); o=bpy.data.objects.new('Long raven bill',me); bpy.context.collection.objects.link(o); bind(o,beak,'Head'); bevel=o.modifiers.new('Horn edge softness','BEVEL'); bevel.width=.006; bevel.segments=2
for s in [-1,1]:
 ell('Eye socket',(s*.087,-.332,.238),(.022,.028,.022),beak,'Head')
 ell('Warm black eye',(s*.103,-.334,.241),(.014,.017,.015),iris,'Head',16,10)
 ell('Corneal dome',(s*.113,-.335,.243),(.008,.012,.012),eye,'Head',16,10)
 ell('Eye pinpoint',(s*.117,-.34,.247),(.0022,.0025,.0022),glint,'Head',8,6)
 ell('Nostril',(s*.033,-.383,.25),(.006,.013,.004),eye,'Head',12,8)
 # throat hackles and scapular feathers: staggered discrete layered blades
 for i in range(9):
  z=.10-i*.021; feather('Throat hackle',(s*.02,-.27,z),(s*(.035+random.random()*.02),-.29,z-.07),.014,featherM[i%5],'Head')
 for row in range(4):
  for i in range(7):
   y=-.08+row*.064; x=s*(.035+i*.018); z=.211-(x/.18)**2*.052
   feather('Mantle covert',(x,y,z),(x+s*.012,y+.11,z-.018),.025,featherM[(i+row)%5],'Body')
 # Wing airfoil, overlap secondaries, individually separated primaries.
 ell('Wing muscular shoulder',(s*.255,.053,.055),(.16,.082,.045),plumage,'Wing.'+('L' if s==1 else 'R'))
 for i in range(10):
  x=.19+i*.027; feather('Secondary %s %02d'%(s,i),(s*x,.03,.06),(s*(x+.025),.29+math.sin(i*.22)*.045,.025),.030,featherM[i%5],'Wing.'+('L' if s==1 else 'R'))
 for i in range(10):
  x=.39+i*.036; endx=.54+i*.035; endy=.31-i*.016
  feather('Fingered primary %s %02d'%(s,i),(s*x,.09,.062),(s*endx,endy,.025),.028-i*.0014,featherM[i%5],'Wrist.'+('L' if s==1 else 'R'),.02)
 for row in range(3):
  for i in range(13):
   x=.17+i*.038; y=.02+row*.045
   feather('Upper wing covert',(s*x,y,.09),(s*(x+.04),y+.12,.08),.020,featherM[(row+i)%5],('Wing.' if x<.43 else 'Wrist.')+('L' if s==1 else 'R'))
 for i in range(5):
  x=s*(i*.023+.012); feather('Wedge tail',(x,.18,-.025),(x*1.55,.59-abs(x)*.7,-.09),.023,featherM[i%5],'Tail')
 # Anatomical legs: feathered thigh, thin scaly tarsus and three forward + back toes.
 suffix='L' if s==1 else 'R'; ell('Feather trouser',(s*.074,.027,-.23),(.036,.043,.075),plumage,'Leg.'+suffix)
 tube('Tarsus',(s*.075,.02,-.285),(s*.075,-.012,-.43),.012,.009,claw,'Foot.'+suffix)
 for i in range(3):
  start=(s*.075,-.012,-.431); end=(s*.075+(i-1)*.036,-.095-abs(i-1)*.012,-.454)
  tube('Forward toe',start,end,.006,.003,claw,'Foot.'+suffix); tube('Hooked claw',end,(end[0],end[1]-.018,-.456),.004,.0005,beak,'Foot.'+suffix)
 tube('Rear toe',(s*.075,-.008,-.431),(s*.078,.059,-.452),.006,.002,claw,'Foot.'+suffix)
# Contour plumage across breast/flanks breaks the smooth torso highlight.
for row in range(6):
 z=.07-row*.045
 radius=math.sqrt(max(.12,1-((z+.055)/.215)**2))
 for j in range(30):
  theta=2*math.pi*j/30+(row%2)*.12
  x=.148*radius*math.sin(theta); y=-.015-.272*radius*math.cos(theta)
  feather('Breast contour',(x,y,z),(x*.94,y*.92,z-.073),.025,featherM[(j+row)%5],'Body',.004)
# Combine all geometry into one skinned mesh; preserve bone groups and materials.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); model=bpy.context.object; model.name='Corvus layered feather skin'
# Authored clips, all bones keyed, NLA tracks guarantee separate GLTF clips.
rig.animation_data_create(); fps=30; bpy.context.scene.render.fps=fps
for clip,duration in [('Idle',2.4),('Walk',.8),('Flap',.6),('Glide',1.8),('Fold',1.1),('Brake',.8),('Hit',.7),('Preen',2.4)]:
 act=bpy.data.actions.new(clip); rig.animation_data.action=act
 for f in range(0,int(duration*fps)+1,3):
  t=f/fps; cyc=2*math.pi*t/duration
  for pb in rig.pose.bones:pb.rotation_mode='XYZ'; pb.rotation_euler=(0,0,0); pb.location=(0,0,0)
  for side,sgn in [('L',1),('R',-1)]:
   wing=rig.pose.bones['Wing.'+side]; wrist=rig.pose.bones['Wrist.'+side]
   if clip in ['Idle','Walk','Fold','Preen']:
    fold=Matrix(((0,0,-sgn),(sgn,0,0),(0,-1,0))).to_quaternion(); rest=wing.bone.matrix_local.to_quaternion(); wing.rotation_euler=(rest.inverted() @ fold @ rest).to_euler('XYZ'); wrist.rotation_euler=(0,0,0)
   elif clip=='Flap':wing.rotation_euler=(math.sin(cyc)*.64,0,sgn*.04); wrist.rotation_euler=(math.sin(cyc-.4)*.27,0,0)
   elif clip=='Brake':wing.rotation_euler=(.72,0,sgn*-.18); wrist.rotation_euler=(.3,0,0)
   elif clip=='Hit':wing.rotation_euler=(math.sin(cyc)*.25,sgn*.4,sgn*math.sin(cyc)*.4)
   else:wing.rotation_euler=(.02+math.sin(cyc)*.012,0,sgn*-.10)
   leg=rig.pose.bones['Leg.'+side]; foot=rig.pose.bones['Foot.'+side]
   if clip=='Walk':leg.rotation_euler.x=math.sin(cyc+(0 if sgn==1 else math.pi))*.38; foot.rotation_euler.x=-leg.rotation_euler.x*.55
   elif clip in ['Flap','Glide']:leg.rotation_euler.x=-.8; foot.rotation_euler.x=.8
  if clip in ['Flap','Glide','Brake']:rig.pose.bones['Body'].rotation_euler.x=.42;rig.pose.bones['Head'].rotation_euler.x=-.1
  if clip=='Idle':rig.pose.bones['Head'].rotation_euler=(math.sin(cyc)*.06,0,math.sin(cyc)*.19)
  if clip=='Walk':rig.pose.bones['Body'].location.z=abs(math.sin(cyc))*.015; rig.pose.bones['Head'].rotation_euler.x=math.sin(cyc*2)*.08
  if clip=='Preen':rig.pose.bones['Head'].rotation_euler=(.3*math.sin(cyc),.65*math.sin(cyc),.8*math.sin(cyc)); rig.pose.bones['Wing.L'].rotation_euler.y=.7
  if clip=='Hit':rig.pose.bones['Body'].rotation_euler.x=math.sin(cyc)*.3
  rig.pose.bones['Tail'].rotation_euler.x=math.sin(cyc)*.03
  for pb in rig.pose.bones:pb.keyframe_insert('rotation_euler',frame=f); pb.keyframe_insert('location',frame=f)
 track=rig.animation_data.nla_tracks.new(); track.name=clip; track.strips.new(clip,0,act)
 rig.animation_data.action=None
for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
bpy.context.scene.frame_set(0)
os.makedirs(os.path.dirname(os.path.abspath(a.output)),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_yup=True,export_apply=False)
print('CORVUS exported',a.output)
