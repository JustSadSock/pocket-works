"""CORVUS — deterministic layered-feather raven, 61-bone authored rig.
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
plumage=mat('Obsidian · violet blue feather sheen',(.014,.018,.024),.43,.08)
# Two feather materials share draw calls across the entire skinned bird.
feather_alt=mat('Flight feather · soft blue black',(.024,.031,.043),.46,.10)
featherM=[plumage,feather_alt,plumage,feather_alt,plumage]
beak=mat('Horn · satin black',(.018,.020,.021),.29,.03); claw=mat('Scutes · charcoal',(.035,.038,.039),.6); eye=mat('Eye · wet obsidian',(.003,.004,.004),.08); iris=mat('Iris · deep umber',(.055,.038,.022),.22); glint=mat('Eye catchlight',(.38,.40,.36),.15)
# Subtle vane texture, no downloaded assets. The shaft and diagonal barbs
# modulate black plumage rather than drawing bright decorative feather outlines.
image=bpy.data.images.new('Corvus feather microstructure',width=256,height=256,alpha=True)
pixels=[]
for y in range(256):
 for x in range(256):
  u=x/255;v=y/255;barb=math.sin(v*180+abs(u-.5)*95)
  shaft=math.exp(-((u-.5)/.018)**2);value=.82+.055*barb+.035*shaft
  pixels.extend((value*.13,value*.16,value*.20,1))
image.pixels=pixels;image.pack()
for material in [plumage,feather_alt]:
 tree=material.node_tree;tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
 tree.links.new(tex.outputs['Color'],tree.nodes.get('Principled BSDF').inputs['Base Color'])
# Blender forward -Y; glTF forward +Z. Wing origin at shoulder.
bones={
 'Body':((0,0,-.08),(0,0,.13),None),
 'Neck':((0,-.17,.09),(0,-.25,.19),'Body'),
 'Head':((0,-.25,.19),(0,-.33,.28),'Neck'),
 'Eyelid.L':((.12,-.334,.243),(.12,-.354,.243),'Head'), 'Eyelid.R':((-.12,-.334,.243),(-.12,-.354,.243),'Head'),
 'Jaw':((0,-.365,.204),(0,-.48,.198),'Head'),
 'Tail':((0,.22,-.04),(0,.55,-.10),'Body'),
 'Wing.L':((.12,.015,.06),(.34,.02,.065),'Body'), 'Wing.R':((-.12,.015,.06),(-.34,.02,.065),'Body'),
 'Forearm.L':((.34,.02,.065),(.51,.12,.05),'Wing.L'), 'Forearm.R':((-.34,.02,.065),(-.51,.12,.05),'Wing.R'),
 'Secondary.L':((.34,.07,.055),(.34,.27,.05),'Forearm.L'), 'Secondary.R':((-.34,.07,.055),(-.34,.27,.05),'Forearm.R'),
 'Wrist.L':((.51,.12,.05),(.83,.13,.05),'Forearm.L'), 'Wrist.R':((-.51,.12,.05),(-.83,.13,.05),'Forearm.R'),
 'Leg.L':((.07,.01,-.17),(.075,.025,-.32),'Body'), 'Leg.R':((-.07,.01,-.17),(-.075,.025,-.32),'Body'),
 'Foot.L':((.075,.025,-.32),(.075,-.09,-.455),'Leg.L'), 'Foot.R':((-.075,.025,-.32),(-.075,-.09,-.455),'Leg.R')}
for side,sgn in [('L',1),('R',-1)]:
 bones['Coverts.'+side]=((sgn*.12,.015,.06),(sgn*.42,.015,.06),'Wing.'+side)
 for i in range(10):
  x=.19+i*.033
  bones['Vane.%s.%02d'%(side,i)]=((sgn*x,.03,.06),(sgn*(x+.025),.29+math.sin(i*.22)*.045,.025),'Secondary.'+side)
 for i in range(10):
  x=.51+i*.023;endx=.61+i*.040;endy=.42-i*.024
  bones['Primary.%s.%02d'%(side,i)]=((sgn*x,.09,.062),(sgn*endx,endy,.025),'Wrist.'+side)
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
 for i in range(9):
  t=i/8; c=s+d*t+Vector((0,0,curve*math.sin(math.pi*t))); w=width*(math.sin(math.pi*(.08+.91*t))**.48)*(1-.35*t)
  for offset,z in [(-w*.90,0),(0,.0015*(1-t)),(w,0),(0,-.0007)]:vs.append(tuple(c+side*offset+Vector((0,0,z))))
 fs=[]
 for i in range(8):
  for j in range(4):fs.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 fs += [(0,1,2,3),(32,35,34,33)]
 mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],fs); mesh.update(); o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); bind(o,m,b)
 # UV follows the shaft; fine vane ridges are baked into one shared atlas.
 uv=mesh.uv_layers.new(name='Feather vanes')
 for poly in mesh.polygons:
  for loop in poly.loop_indices:
   idx=mesh.loops[loop].vertex_index; uv.data[loop].uv=([0,.5,1,.5][idx%4],(idx//4)/8)
 if 'primary' in name.lower() or 'secondary' in name.lower():
  tube(name+' rachis',start,tuple(s+d*.84+Vector((0,0,.002))),.00065,.0002,m,b,5)
ell('Deep keel breast',(0,-.015,-.055),(.122,.255,.184),plumage,'Body',28,18)
ell('Shoulder mantle',(0,.055,.075),(.139,.209,.113),plumage,'Body',24,16)
ell('Neck',(0,-.205,.13),(.081,.106,.123),plumage,'Neck')
ell('Angular raven cranium',(0,-.295,.225),(.095,.111,.088),plumage,'Head',24,16)
# Short crown plumage follows the skull rather than one uninterrupted specular dome.
for row in range(4):
 for col in range(7):
  x=(col-3)*.022; y=-.35+row*.033
  z=.226+.089*math.sqrt(max(.05,1-(x/.108)**2-((y+.295)/.115)**2))
  feather('Crown silk',(x,y,z),(x,y+.039,z-.012),.011,featherM[(col+row)%5],'Head',.003)
# Curved maxilla: elliptical sections taper to a hooked, closed tip.
sections=[(-.358,.235,.049,.029),(-.395,.236,.043,.030),(-.443,.231,.029,.023),(-.49,.22,.013,.018),(-.529,.203,.001,.003)]
verts=[]
for y,z,w,h in sections:
 for i in range(12):
  angle=i*math.tau/12; verts.append((math.cos(angle)*w,y,z+math.sin(angle)*h))
faces=[tuple(range(11,-1,-1))]
for row in range(len(sections)-1):
 for i in range(12):faces.append((row*12+i,row*12+(i+1)%12,(row+1)*12+(i+1)%12,(row+1)*12+i))
faces.append(tuple(range(48,60)))
me=bpy.data.meshes.new('Curved horn maxilla');me.from_pydata(verts,[],faces);o=bpy.data.objects.new('Raven hooked upper bill',me);bpy.context.collection.objects.link(o);bind(o,beak,'Head')
ell('Separate lower mandible',(0,-.426,.194),(.032,.091,.009),beak,'Jaw',20,8)
for s in [-1,1]:
 ell('Eye socket',(s*.087,-.332,.238),(.022,.028,.022),beak,'Head')
 ell('Warm black eye',(s*.103,-.334,.241),(.014,.017,.015),iris,'Head',16,10)
 ell('Corneal dome',(s*.113,-.335,.243),(.008,.012,.012),eye,'Head',16,10)
 ell('Blinking upper eyelid',(s*.122,-.334,.243),(.005,.013,.013),plumage,'Eyelid.'+('L' if s==1 else 'R'),16,10)
 ell('Eye pinpoint',(s*.117,-.34,.247),(.0022,.0025,.0022),glint,'Head',8,6)
 ell('Nostril',(s*.033,-.383,.25),(.006,.013,.004),eye,'Head',12,8)
 # throat hackles and scapular feathers: staggered discrete layered blades
 for i in range(7):
  z=.12-i*.016; feather('Throat hackle',(s*.02,-.27,z),(s*(.035+random.random()*.02),-.29,z-.040),.010,featherM[i%5],'Head')
 for row in range(4):
  for i in range(7):
   y=-.08+row*.064; x=s*(.035+i*.018); z=.185-(x/.16)**2*.047
   feather('Mantle covert',(x,y,z),(x+s*.012,y+.085,z-.018),.021,featherM[(i+row)%5],'Body')
 # Wing airfoil, overlap secondaries, individually separated primaries.
 ell('Wing muscular shoulder',(s*.255,.053,.055),(.095,.060,.030),plumage,'Wing.'+('L' if s==1 else 'R'))
 for i in range(10):
  x=.19+i*.033; feather('Secondary %s %02d'%(s,i),(s*x,.03,.06),(s*(x+.025),.29+math.sin(i*.22)*.045,.025),.030,featherM[i%5],'Vane.%s.%02d'%('L' if s==1 else 'R',i))
 for i in range(10):
  x=.51+i*.023; endx=.61+i*.040; endy=.42-i*.024
  feather('Fingered primary %s %02d'%(s,i),(s*x,.09,.062),(s*endx,endy,.025),.034-i*.0015,featherM[i%5],'Primary.%s.%02d'%('L' if s==1 else 'R',i),.014)
 for row in range(3):
  for i in range(13):
   x=.17+i*.038; y=.02+row*.045
   feather('Upper wing covert',(s*x,y,.09),(s*(x+.04),y+.12,.08),.020,featherM[(row+i)%5],'Coverts.'+('L' if s==1 else 'R'))
 for i in range(5):
  x=s*(i*.023+.012); feather('Wedge tail',(x,.18,-.025),(x*1.55,.63-abs(x)*1.05,-.09),.027,featherM[i%5],'Tail')
 # Anatomical legs: feathered thigh, thin scaly tarsus and three forward + back toes.
 suffix='L' if s==1 else 'R'; ell('Feather trouser',(s*.074,.027,-.23),(.036,.043,.075),plumage,'Leg.'+suffix)
 tube('Tarsus',(s*.075,.02,-.285),(s*.075,-.012,-.43),.012,.009,claw,'Foot.'+suffix)
 for i in range(3):
  start=(s*.075,-.012,-.431); end=(s*.075+(i-1)*.036,-.095-abs(i-1)*.012,-.454)
  tube('Forward toe',start,end,.006,.003,claw,'Foot.'+suffix); tube('Hooked claw',end,(end[0],end[1]-.018,-.456),.004,.0005,beak,'Foot.'+suffix)
 tube('Rear toe',(s*.075,-.008,-.431),(s*.078,.059,-.452),.006,.002,claw,'Foot.'+suffix)
# Contour plumage across breast/flanks breaks the smooth torso highlight.
for row in range(6):
 z=.065-row*.036
 radius=math.sqrt(max(.12,1-((z+.055)/.190)**2))
 for j in range(30):
  theta=2*math.pi*j/30+(row%2)*.12
  x=.125*radius*math.sin(theta); y=-.015-.257*radius*math.cos(theta)
  feather('Breast contour',(x,y,z),(x*.98,y*.98,z-.024),.009,featherM[(j+row)%5],'Body',.0005)
# Combine all geometry into one skinned mesh; preserve bone groups and materials.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); model=bpy.context.object; model.name='Corvus layered feather skin'
# Baked foot contact coordinates keep toes at the actual support during stance.
foot_vertices={}
for side in ['L','R']:
 group=model.vertex_groups.get('Foot.'+side)
 foot_vertices[side]=[model.matrix_world @ v.co for v in model.data.vertices if any(g.group==group.index for g in v.groups)]
# Authored motion in anatomical world axes, converted into each bone's rest
# frame. Unit scales keep feather lengths intact when the wing folds.
def rotate_world(pb,x=0,y=0,z=0):
 rotation=Matrix.Rotation(z,4,'Z') @ Matrix.Rotation(y,4,'Y') @ Matrix.Rotation(x,4,'X')
 rest=pb.bone.matrix_local.to_quaternion();pb.rotation_euler=(rest.inverted() @ rotation.to_quaternion() @ rest).to_euler('XYZ')
def folded_joint(pb,head,side,ruffle=0):
 # Explicit global hinge poses put trailing vanes down the flank. Reconstruct
 # local channels through Blender's pose matrix, preserving a unit skin scale.
 rotation=Matrix.Rotation(side*(1.48+ruffle),4,'Z') @ Matrix.Rotation(-1.42,4,'X')
 pb.matrix=Matrix.Translation(Vector(head)) @ rotation @ pb.bone.matrix_local.to_3x3().to_4x4()
 bpy.context.view_layer.update()
def stack_primary(pb,side,index,secondary=False):
 head=Vector((side*(.147+index*.0008),.145+index*.009,.035-index*.0015))
 tip=Vector((side*(.135+index*.001),.46+index*.016,-.115-index*.003))
 if secondary:
  head=Vector((side*.13,.025+index*.017,.06-index*.003));tip=Vector((side*.143,.28+index*.008,-.15+index*.002))
 axis=(tip-head).normalized();normal=Vector((side,0,0));across=axis.cross(normal).normalized();normal=across.cross(axis).normalized()
 basis=Matrix((across,axis,normal)).transposed().to_4x4()
 pb.matrix=Matrix.Translation(head) @ basis;bpy.context.view_layer.update()
rig.animation_data_create(); fps=30; bpy.context.scene.render.fps=fps
clips=[('Idle',4.8),('Walk',.8),('Run',.55),('Takeoff',.8),('Land',.75),('Flap',.72),('Glide',2.4),('Fold',1.1),('Brake',.8),('Hit',.7),('Preen',3.2),('Peck',1.2),('Ruffle',1.6),('Call',1.8)]
for clip,duration in clips:
 act=bpy.data.actions.new(clip);rig.animation_data.action=act
 for f in range(0,round(duration*fps)+1,2):
  t=f/fps;u=min(1,t/duration);cyc=math.tau*u
  for pb in rig.pose.bones:pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
  for side in ['L','R']:
   blink=max(.001,1-abs(u-(.64 if clip=='Idle' else .82))/.020) if clip in ['Idle','Glide'] else .001
   rig.pose.bones['Eyelid.'+side].scale=(blink,blink,blink)
  for side,sgn in [('L',1),('R',-1)]:
   wing=rig.pose.bones['Wing.'+side];forearm=rig.pose.bones['Forearm.'+side];wrist=rig.pose.bones['Wrist.'+side];secondary=rig.pose.bones['Secondary.'+side]
   if clip in ['Idle','Walk','Run','Fold','Preen','Peck','Call','Ruffle']:
    ruffle=math.sin(cyc*3)*.14*math.sin(math.pi*u) if clip=='Ruffle' else 0
    folded_joint(wing,(sgn*.12,.015,.06),sgn,ruffle)
    folded_joint(forearm,(sgn*.16,.20,.025),sgn)
    folded_joint(wrist,(sgn*.15,.13,.032),sgn)
    vane=Matrix(((0,-sgn*.34,-sgn*.94),(0,.94,-.34),(sgn,0,0))).transposed().to_4x4()
    secondary.matrix=Matrix.Translation(Vector((sgn*.145,.13,.035))) @ vane @ secondary.bone.matrix_local.to_3x3().to_4x4();bpy.context.view_layer.update()
    folded_joint(rig.pose.bones['Coverts.'+side],(sgn*.15,-.02,.07),sgn)
    for i in range(10):
     stack_primary(rig.pose.bones['Primary.%s.%02d'%(side,i)],sgn,i)
     stack_primary(rig.pose.bones['Vane.%s.%02d'%(side,i)],sgn,i,True)
   elif clip in ['Flap','Takeoff']:
    # Downstroke is quick and extended; recovery flexes wrist and elbow.
    phase=cyc+.18;stroke=math.sin(phase)+.18*math.sin(2*phase)
    recovery=max(0,math.cos(phase))
    rotate_world(wing,y=-sgn*stroke*.72,z=sgn*.035)
    rotate_world(forearm,y=-sgn*math.sin(phase-.28)*.16,z=-sgn*recovery*.20)
    rotate_world(wrist,y=-sgn*math.sin(phase-.46)*.31,z=sgn*recovery*.30)
    for i in range(10):rotate_world(rig.pose.bones['Primary.%s.%02d'%(side,i)],x=math.sin(phase-.6-i*.065)*.026)
   elif clip in ['Brake','Land']:
    settle=1-u if clip=='Land' else 1
    rotate_world(wing,y=-sgn*(.48+.10*math.sin(cyc)),z=-sgn*.20)
    rotate_world(forearm,y=-sgn*.20,z=sgn*.10)
    rotate_world(wrist,y=-sgn*.22,z=sgn*.12)
   elif clip=='Hit':rotate_world(wing,y=-sgn*math.sin(cyc)*.3,z=sgn*.2)
   else:
    rotate_world(wing,y=-sgn*(.04+math.sin(cyc)*.014),z=-sgn*.055)
    rotate_world(wrist,y=-sgn*.065)
   leg=rig.pose.bones['Leg.'+side];foot=rig.pose.bones['Foot.'+side]
   if clip in ['Walk','Run']:
    step=math.sin(cyc+(0 if sgn==1 else math.pi))
    rotate_world(leg,x=step*(.34 if clip=='Walk' else .46));rotate_world(foot,x=-step*.23)
   elif clip in ['Flap','Glide']:
    rotate_world(leg,x=-.85);rotate_world(foot,x=.78)
   elif clip=='Takeoff':rotate_world(leg,x=-.85*u);rotate_world(foot,x=.78*u)
   elif clip in ['Land','Brake']:rotate_world(leg,x=.14);rotate_world(foot,x=-.14)
  body=rig.pose.bones['Body'];head=rig.pose.bones['Head'];neck=rig.pose.bones['Neck'];tail=rig.pose.bones['Tail'];jaw=rig.pose.bones['Jaw']
  if clip in ['Flap','Glide','Brake','Takeoff','Land']:
   rotate_world(body,x=.30);rotate_world(neck,x=-.12);rotate_world(head,x=-.15)
   if clip=='Flap':body.location.z=math.sin(cyc-.35)*.007
   rotate_world(tail,x=.08 if clip in ['Land','Brake'] else -.05)
   tail.scale.x=1.28 if clip in ['Land','Brake'] else 1
  if clip=='Idle':
   # Hold-and-saccade gaze: a raven observes, then makes a small quick change.
   gaze=.18*math.tanh(math.sin(cyc-.4)*5)
   rotate_world(head,x=math.sin(cyc*.5)*.025,z=gaze);rotate_world(neck,x=math.sin(cyc)*.009)
   body.location.z=math.sin(cyc*2)*.002
  if clip in ['Walk','Run']:
   body.location.z=abs(math.sin(cyc))*.006
   hold=math.tanh(math.sin(cyc*2)*3)
   rotate_world(neck,x=hold*.045);rotate_world(head,x=-hold*.045)
   neck.location.y=-hold*.009
  if clip=='Preen':
   reach=math.sin(math.pi*u)**2
   rotate_world(neck,x=.12*reach,z=.54*reach);rotate_world(head,x=.40*reach,y=.18*math.sin(cyc*5)*reach,z=.50*reach)
  if clip=='Peck':
   reach=math.sin(math.pi*u)**6;rotate_world(neck,x=.58*reach);rotate_world(head,x=.35*reach);rotate_world(jaw,x=.09*reach)
  if clip=='Call':
   reach=math.sin(math.pi*u)**4;rotate_world(neck,x=-.13*reach);rotate_world(head,x=-.18*reach);rotate_world(jaw,x=.23*reach)
  if clip=='Ruffle':
   shake=math.sin(cyc*7)*math.sin(math.pi*u);rotate_world(body,z=.035*shake);rotate_world(head,z=-.055*shake);rotate_world(tail,z=.04*shake)
  if clip=='Hit':rotate_world(body,x=math.sin(cyc)*.3)
  if clip in ['Walk','Run']:
   bpy.context.view_layer.update()
   for side,phase in [('L',0),('R',math.pi)]:
    foot=rig.pose.bones['Foot.'+side]
    skin=foot.matrix @ foot.bone.matrix_local.inverted()
    lowest=min((skin @ v).z for v in foot_vertices[side])
    support=-.456+max(0,math.sin(cyc+phase))*(.035 if clip=='Walk' else .05)
    parent=foot.parent
    basis=parent.matrix @ parent.bone.matrix_local.inverted() @ foot.bone.matrix_local
    foot.location=basis.inverted().to_3x3() @ Vector((0,0,support-lowest))
  for pb in rig.pose.bones:pb.keyframe_insert('rotation_euler',frame=f); pb.keyframe_insert('location',frame=f); pb.keyframe_insert('scale',frame=f)
 track=rig.animation_data.nla_tracks.new(); track.name=clip; track.strips.new(clip,0,act)
 rig.animation_data.action=None
for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
bpy.context.scene.frame_set(0)
os.makedirs(os.path.dirname(os.path.abspath(a.output)),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_yup=True,export_apply=False)
print('CORVUS exported',a.output)
