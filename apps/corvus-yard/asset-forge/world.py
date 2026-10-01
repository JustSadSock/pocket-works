"""Authored autumn canal courtyard. Metres; Blender Z-up exported to Babylon Y-up."""
import bpy, bmesh, math, random, os, sys
from mathutils import Vector
random.seed(27)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,col,rough=.8,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
brick=mat('warm old Amsterdam brick',(.31,.115,.072)); stone=mat('weathered limestone',(.39,.40,.35)); trim=mat('painted ivory window reveals',(.66,.65,.57)); glass=mat('reflective blue grey glass',(.16,.25,.28),.17,.3);roof=mat('hand laid slate tiles',(.14,.17,.18));wood=mat('dark weathered oak',(.16,.105,.055));iron=mat('black wrought iron',(.10,.115,.10),.43,.7); bark=mat('deep grooved plane tree bark',(.20,.16,.115)); amber=mat('ochre autumn foliage',(.38,.28,.095)); rust=mat('copper autumn foliage',(.31,.13,.055));green=mat('muted olive foliage',(.23,.27,.115));leather=mat('car dark blue paint',(.12,.21,.23),.28,.45)
def pos(x,y,z):return (-x,-z,y) # Babylon glTF LH conversion mirrors X.
def cube(name,p,s,m,bevel=0):
 # Construct geometry directly; operator-based creation resynchronises every
 # existing facade and leaf each time a small window is added.
 sx,sy,sz=s[0]/2,s[2]/2,s[1]/2
 verts=[(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]
 faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 if bevel:
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=2,affect='EDGES');bm.to_mesh(me);bm.free()
 me.materials.append(m);o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.location=pos(*p);return o
def branch(name,a,b,r1,r2,m,vertices=9):
 aa=Vector(pos(*a));bb=Vector(pos(*b));d=bb-aa;rotation=d.to_track_quat('Z','Y');center=(aa+bb)/2;verts=[]
 for radius,z in [(r1,-d.length/2),(r2,d.length/2)]:
  for i in range(vertices):
   angle=i*math.tau/vertices;verts.append(tuple(center+rotation @ Vector((math.cos(angle)*radius,math.sin(angle)*radius,z))))
 faces=[tuple(range(vertices-1,-1,-1)),tuple(range(vertices,vertices*2))]
 for i in range(vertices):faces.append((i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();me.materials.append(m);o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
def mesh(name,verts,faces,m):
 me=bpy.data.meshes.new(name);me.from_pydata([pos(*v) for v in verts],[],[list(reversed(f)) for f in faces]);me.materials.append(m);o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
def leaf_fan(name,center,material,count=90):
 # Individually curled, lobed leaves: openings between them transmit the sky.
 verts=[];faces=[]
 cx,cy,cz=center
 for j in range(count):
  ang=random.random()*math.tau;r=math.sqrt(random.random())*2.55
  x=cx+math.cos(ang)*r;z=cz+math.sin(ang)*r;y=cy+random.uniform(-.65,1.2)*(1-r/3.8)
  length=random.uniform(.21,.40);width=length*.62;yaw=random.random()*math.tau;tilt=random.uniform(-.7,.7)
  outline=[(0,-1),(-.36,-.54),(-1,-.37),(-.58,.0),(-.80,.34),(-.32,.26),(0,1),(.32,.26),(.80,.34),(.58,0),(1,-.37),(.36,-.54)]
  start=len(verts);verts.append((x,y+.02,z))
  for u,v in outline:
   xx=u*width;zz=v*length
   verts.append((x+xx*math.cos(yaw)-zz*math.sin(yaw),y+zz*tilt+abs(u)*.045,z+xx*math.sin(yaw)+zz*math.cos(yaw)))
  for i in range(12):faces.append((start,start+1+i,start+1+(i+1)%12))
 obj=mesh(name,[(x-cx,y-cy,z-cz) for x,y,z in verts],faces,material);obj.location=pos(cx,cy,cz);return obj
def house(x,z,w,d,h):
 cube('canal house brick', (x,h/2,z),(w,h,d),brick,.075)
 # pitched slate roof with projecting eaves
 verts=[(x-w/2-.25,h,z-d/2-.25),(x+w/2+.25,h,z-d/2-.25),(x+w/2+.25,h,z+d/2+.25),(x-w/2-.25,h,z+d/2+.25),(x,h+3.1,z-d/2-.25),(x,h+3.1,z+d/2+.25)]
 mesh('slate roof',verts,[(0,1,4),(3,5,2),(0,4,5,3),(1,2,5,4)],roof)
 mesh('brick gable',[(x-w/2,h,z-d/2),(x+w/2,h,z-d/2),(x,h+3,z-d/2),(x-w/2,h,z+d/2),(x+w/2,h,z+d/2),(x,h+3,z+d/2)],[(0,1,2),(3,5,4)],brick)
 for side in [-1,1]:
  for floor in range(int(h/3)):
   for col in range(max(2,int(w/2.5))):
    px=x-w/2+1.35+col*(w-2.7)/max(1,int(w/2.5)-1); yy=1.65+floor*2.9; zz=z+side*(d/2+.025)
    cube('window pale surround',(px,yy,zz),(1.2,1.65,.12),trim,.035);cube('window deep glass',(px,yy,zz+side*.085),(.97,1.42,.04),glass)
    cube('window mullion',(px,yy,zz+side*.12),(.075,1.42,.035),trim);cube('window crossbar',(px,yy+.18,zz+side*.12),(.98,.07,.035),trim)
  for yy in [h-.2,.25]:cube('stone cornice',(x,yy,z+side*d/2),(w+.15,.22,.28),stone,.02)
 cube('oak street door',(x,.95,z-d/2-.09),(.9,1.9,.12),wood,.04)
 cube('door lintel',(x,1.96,z-d/2-.13),(1.15,.16,.20),stone,.025)
 cube('door threshold',(x,.045,z-d/2-.17),(1.08,.09,.28),stone,.02)
 for side in [-1,1]:
  branch('rain downpipe',(x+w/2-.22,.2,z+side*(d/2+.16)),(x+w/2-.22,h-.1,z+side*(d/2+.16)),.042,.042,iron,7)
 for row in range(1,11):
  u=row/11;yy=h+(1-u)*3.1;xx=x+u*(w/2+.25)
  branch('subtle slate lap',(xx,yy+.012,z-d/2),(xx,yy+.012,z+d/2),.009,.009,roof,5)
  branch('subtle slate lap',(2*x-xx,yy+.012,z-d/2),(2*x-xx,yy+.012,z+d/2),.009,.009,roof,5)
 cube('chimney',(x+w*.27,h+2.4,z+.7),(.8,2,.8),brick,.05);cube('chimney cap',(x+w*.27,h+3.43,z+.7),(1,.14,1),stone,.03)
 # roof tile seams and rain gutter
 for side in [-1,1]:branch('rain gutter',(x-w/2,h,z+side*d/2),(x+w/2,h,z+side*d/2),.075,.075,iron)
 for t in range(1,8):
  zz=z-d/2+t*d/8
  branch('roof tile course',(x-w/2-.18,h+.035,zz),(x,h+3.12,zz),.014,.014,roof,5);branch('roof tile course',(x,h+3.12,zz),(x+w/2+.18,h+.035,zz),.014,.014,roof,5)
for params in [(-28,27,8,9,13),(-19,28,7,9,15),(-10,28,8,9,12),(26,24,10,12,10),(37,27,9,12,13),(-31,-28,11,12,9),(28,-26,13,10,8)]:house(*params)
# tower landmark; stacked offsets and louvred bell stage
cube('bell tower',(3,15,49),(5.6,30,5.6),brick,.12)
for h in [1,12,25,30]:cube('tower limestone belt',(3,h,49),(6,.25,6),stone,.04)
for sx in [-1,1]:
 for z in [48.1,49.7]:cube('bell louvre',(3+sx*2.86,27.4,z),(.12,2.5,.8),wood,.02)
bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=4.7,radius2=0,depth=9,location=pos(3,34.5,49));o=bpy.context.object;o.rotation_euler.z=math.pi/4;o.data.materials.append(roof)
branch('tower finial',(3,39,49),(3,42,49),.075,.035,iron)
# Canal retaining walls and a stone pedestrian bridge
for xx in [-6.2,6.2]:cube('canal masonry bank',(xx,-.4,11),(1.2,1.5,48),stone,.08)
for z in [-12,34]:cube('canal end bank',(0,-.4,z),(12,1.5,1),stone,.06)
cube('arched footbridge deck',(0,.8,9),(15,.65,3),stone,.10)
for z in [7.5,10.5]:
 branch('bridge handrail',(-7.7,2,z),(7.7,2,z),.09,.09,iron)
 for x in range(-7,8):branch('bridge baluster',(x,1,z),(x,2,z),.045,.045,iron)
# starting plane tree, long perch branch across view
TREES=[(-4,-15,11),(15,-5,14),(-18,2,13),(18,15,12),(-17,-18,10),(40,7,15),(-40,12,15),(-26,40,17),(31,41,16),(-43,-10,12)]
for idx,(x,z,h) in enumerate(TREES):
 branch('tree trunk',(x,0,z),(x+.35,h*.73,z+.2),.45,.17,bark,12)
 for root in range(5):
  angle=root*math.tau/5+idx;branch('exposed tree root',(x,.17,z),(x+math.cos(angle)*.85,.035,z+math.sin(angle)*.85),.14,.025,bark,7)
 for strip in range(9):
  angle=strip*math.tau/9;radius=.405
  branch('raised bark ridge',(x+math.cos(angle)*radius,.3,z+math.sin(angle)*radius),(x+.26+math.cos(angle)*.24,h*.55,z+.15+math.sin(angle)*.24),.024,.012,wood,5)
 for k in range(7):
  if idx==0 and k in [0,3]:continue
  ang=k*2.399+idx;rad=2.7+(k%3)*.7; yy=h*.55+k*.55;end=(x+math.cos(ang)*rad,yy+2.3,z+math.sin(ang)*rad)
  branch('tree spreading branch',(x+.2,yy-.8,z),end,.15,.045,bark)
  # Fine twigs support a porous canopy rather than an opaque polygon ball.
  for j in range(5):
   angle=ang+j*1.25;tip=(end[0]+math.cos(angle)*1.7,end[1]+.45+j*.17,end[2]+math.sin(angle)*1.7)
   branch('leaf-bearing twig',end,tip,.022,.005,bark,5)
  leaf_fan('canopy_%02d_%02d'%(idx,k),(end[0],end[1]+.55,end[2]),[amber,rust,green][(idx+k)%3],70)
branch('perch_flexible_home',(-4,7.6,-15),(2,8.2,-15),.17,.06,bark)
# iron park fence, street lamps and authored benches
for z in [-19,20]:
 for a,b in [(-45,-9),(9,45)]:
  for h in [.45,1.3]:branch('park fence rail',(a,h,z),(b,h,z),.035,.035,iron)
  for x in range(a,b,2):branch('fence upright',(x,0,z),(x,1.55,z),.045,.045,iron)
for x,z in [(-9,-8),(10,7),(-10,17),(11,28),(39,-15)]:
 branch('street lamp',(x,0,z),(x,5.9,z),.095,.065,iron);cube('lamp lantern frame',(x,5.8,z),(.44,.7,.44),iron,.04);cube('lamp warm glass',(x,5.8,z),(.37,.56,.37),trim,.025)
for x,z in [(-12,-8),(12,2),(-13,15),(21,-16)]:
 for s in range(4):cube('bench oak seat slat',(x,.62,z+(s-1.5)*.18),(2,.12,.14),wood,.025)
 for h in [1,1.25]:cube('bench back oak slat',(x,h,z+.45),(2,.16,.10),wood,.02)
 for dx in [-.7,.7]:branch('bench iron leg',(x+dx,0,z),(x+dx,.65,z),.055,.055,iron);branch('bench back upright',(x+dx,.5,z+.45),(x+dx,1.4,z+.45),.045,.045,iron)
# wires, dustbins, courtyard roof props, bicycles silhouette
for z in [-29,31]:
 for x in [-42,43]:branch('utility pole',(x,0,z),(x,12,z),.18,.10,wood)
 for k in range(16):
  a=-42+k*85/16;b=-42+(k+1)*85/16;ya=12-math.sin(k/16*math.pi)*1.5;yb=12-math.sin((k+1)/16*math.pi)*1.5;branch('sagging telephone wire',(a,ya,z),(b,yb,z),.016,.016,iron,5)
for x,z in [(-13,-7),(12,4),(35,-20)]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=14,radius=.35,depth=.8,location=pos(x,.4,z));bpy.context.object.data.materials.append(iron)
for x,z in [(39,-24),(-24,-39)]:
 cube('parked car body',(x,.65,z),(1.75,.65,4),leather,.2);cube('car cabin',(x,1.12,z-.2),(1.4,.55,2),glass,.17)
 for dx in [-.85,.85]:
  for dz in [-1.25,1.25]:branch('rubber wheel',(x+dx-.1,.4,z+dz),(x+dx+.1,.4,z+dz),.35,.35,iron,14)
# Recessed canal joints, moss at the water line and pavement courses.
moss=mat('canal moss at waterline',(.16,.205,.10),.97)
for side in [-1,1]:
 for j in range(44):
  cube('retaining stone joint',(side*5.585,-.04,-10+j),(.012,.025,.68),iron)
  if j%3!=0:cube('damp moss seam',(side*5.58,-.21,-10+j),(.018,.085,.48),moss,.005)
for x,z in [(-12,-8),(12,2),(-13,15),(21,-16)]:
 for j in range(7):cube('bench paving slab',(x-1.2+j*.4,.012,z-.4),(.37,.025,1.6),stone,.01)
# Quiet roofs at the boundary keep a flying bird inside a recognisable district.
for idx in range(11):
 x=-66+idx*12;z=68+(idx%3)*3;h=8+(idx%4)*2.5
 cube('distant courtyard facade',(x,h*.5,z),(10,h,9),[brick,stone][idx%2])
 for floor in range(int(h/3)):
  for col in range(4):
   px=x-3.4+col*2.25;yy=1.6+floor*2.9
   cube('distant window reveal',(px,yy,z-4.54),(1.0,1.4,.08),trim)
   cube('distant recessed window',(px,yy,z-4.60),(.80,1.20,.03),glass)
 cube('distant chimney',(x+2.8,h+1.4,z),(1.0,2.6,.9),brick)

 mesh('distant pitched roof',[(x-5,h,z-5),(x+5,h,z-5),(x,h+2.3,z-5),(x-5,h,z+5),(x+5,h,z+5),(x,h+2.3,z+5)],[(0,2,5,3),(1,4,5,2),(0,1,2),(3,5,4)],roof)
# Merge opaque static geometry by material; canopy stays separate for wind sway.
for material in list(bpy.data.materials):
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.name.startswith('canopy') and not o.name.startswith('perch_flexible') and o.data.materials and o.data.materials[0]==material]
 if objects:
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name='world_'+material.name.replace(' ','_')
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=not o.name.startswith('world_warm')
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [];out=args[args.index('--output')+1] if '--output' in args else os.environ.get('ASSET_FORGE_OUTPUT','/tmp/world.glb');os.makedirs(os.path.dirname(out),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_yup=True,export_apply=True)
