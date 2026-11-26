"""Hand-composed landscape reference A and physically matched adaptation B.
Source geometry: provider scans and botanic models. No random procedural noise."""
import bpy,os,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=Path(os.environ["BOW_ART_OUTPUT"]);mode=os.environ.get("BOW_NATURE_VIEW","A")
patch=json.loads((out/"relief-patch.json").read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene
sc.render.engine="CYCLES";sc.cycles.samples=24;sc.cycles.use_denoising=True
sc.render.resolution_x=1600;sc.render.resolution_y=1000;sc.render.resolution_percentage=100
sc.view_settings.view_transform="AgX"
def mesh(name,vs,fs,mat=None):
    m=bpy.data.meshes.new(name);m.from_pydata(vs,[],fs);m.update();o=bpy.data.objects.new(name,m);sc.collection.objects.link(o)
    if mat:o.data.materials.append(mat)
    for f in m.polygons:f.use_smooth=True
    return o
def mat(name,color,rough=.8):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=(*color,1);p.inputs["Roughness"].default_value=rough;return m
def scanmat(name,filename,period):
    m=mat(name,(.2,.2,.1));n=m.node_tree.nodes;l=m.node_tree.links;p=n.get("Principled BSDF")
    img=n.new("ShaderNodeTexImage");img.image=bpy.data.images.load(str(out/filename),check_existing=True);img.extension="REPEAT"
    tc=n.new("ShaderNodeTexCoord");s=n.new("ShaderNodeVectorMath");s.operation="SCALE";s.inputs["Scale"].default_value=1/period;l.new(tc.outputs["Object"],s.inputs[0]);l.new(s.outputs[0],img.inputs["Vector"]);l.new(img.outputs["Color"],p.inputs["Base Color"])
    return m
files=json.loads((out/"local-scans.json").read_text())
def scan(asset,kind="diff"):return next(r["file"] for r in files if r["asset"]==asset and r["map"]==kind)
materials=[scanmat("Meadow grass","grass.png",6),scanmat("Forest litter",scan("forest_floor"),3),scanmat("Worn cart track",scan("stony_dirt_path"),2),scanmat("Weathered bank","stone.png",4)]
# The reference is a small hand-laid valley. Cross-section controls and
# bend positions are explicit composition decisions, not noise octaves.
controls=[(-45,-8),(-30,-9),(-13,-5),(0,2),(14,8),(29,6),(45,-1)]
def interp(x,pts):
    if x<=pts[0][0]:return pts[0][1]
    for (a,b),(c,d) in zip(pts,pts[1:]):
        if x<=c:
            t=(x-a)/(c-a);t=t*t*(3-2*t);return b+(d-b)*t
    return pts[-1][1]
def river_x(y):return interp(y,controls)
def profile(x,y):
    d=x-river_x(y);u=abs(d)
    z=interp(u,[(0,-1.0),(3.8,-.75),(4.5,0.05),(6.2,.8),(12,1.7),(21,4.5),(34,10),(50,13)])
    if d>0:z*=.62
    return z+max(0,1-((y-24)/32)**2)*max(0,u-12)*.08
if mode=="A":
    pts=[]
    for y in range(-45,46):
        for x in range(-50,51):
            d=abs(x-river_x(y));road=abs(x-(river_x(y)+12+2*math.sin(y/23)))
            canopy=1 if x<river_x(y)-13 or (x>river_x(y)+27 and y>4) else 0
            pts.append([x,y,profile(x,y),canopy,0,road,d-4.5])
    cols=101;rows=91
else:
    pts=patch["points"];cols=patch["cols"];rows=patch["rows"]
faces=[]
for y in range(rows-1):
    for x in range(cols-1):
        k=y*cols+x;faces.extend([(k,k+1,k+cols+1),(k,k+cols+1,k+cols)])
land=mesh("Physical map visual samples" if mode=="B" else "Authored valley cross sections",[p[:3] for p in pts],faces)
for m in materials:land.data.materials.append(m)
for poly in land.data.polygons:
    v=[pts[i] for i in poly.vertices];a=[sum(p[j] for p in v)/len(v) for j in range(7)]
    poly.material_index=3 if abs(a[6])<1.7 else 2 if a[5]<2.0 else 1 if a[3]>.62 else 0
# Clip the exact shoreline. A is level water; B preserves physical visual
# surface and existing topology, rather than changing terrain/proximity.
wv=[];wf=[]
for tri in faces:
    poly=[pts[i] for i in tri];p0=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if a[6]<=0:p0.append(a)
        if (a[6]<=0)!=(b[6]<=0):
            t=a[6]/(a[6]-b[6]);p0.append([x+(y-x)*t for x,y in zip(a,b)])
    if len(p0)<3:continue
    i=len(wv);wv.extend((p[0],p[1],.08 if mode=="A" else p[2]+.012) for p in p0)
    wf.extend((i,i+j,i+j+1) for j in range(1,len(p0)-1))
water=mat("Reflecting shallows",(.055,.13,.11),.15);p=water.node_tree.nodes.get("Principled BSDF");p.inputs["IOR"].default_value=1.333;p.inputs["Transmission Weight"].default_value=.18
river=mesh("Continuous river surface",wv,wf,water)
tree=BVHTree.FromPolygons([Vector(p) for p in wv],wf,all_triangles=True)
test=[(river_x(y),y) for y in range(-44,45)] if mode=="A" else [(r["x"],r["y"]) for r in patch["water"][1:-1]]
missing=[(x,y) for x,y in test if tree.ray_cast(Vector((x,y,1000)),Vector((0,0,-1)),2000)[0] is None]
if missing:raise ValueError("Missing river centerline "+str(missing[:8]))
# Real CC0 botanic models and scanned rock geometry, instanced without
# changing their mesh or texture. Normalize only placement and scale.
models={}
for name in ("pine_tree_01","pine_sapling_medium","shrub_03","rock_moss_set_01","moss_01"):
    f=out/"nature"/name/(name+".gltf")
    before=set(sc.objects);bpy.ops.import_scene.gltf(filepath=str(f));obs=[o for o in sc.objects if o not in before]
    ms=[o for o in obs if o.type=="MESH"];coords=[o.matrix_world@Vector(v) for o in ms for v in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
    c=bpy.data.collections.new(name);c.instance_offset=((lo.x+hi.x)*.5,(lo.y+hi.y)*.5,lo.z)
    for o in obs:
        for old in list(o.users_collection):old.objects.unlink(o)
        c.objects.link(o)
    models[name]=(c,max(.001,hi.z-lo.z))
def instance(name,x,y,z,height,angle):
    c,h=models[name];o=bpy.data.objects.new(name,None);sc.collection.objects.link(o);o.instance_type="COLLECTION";o.instance_collection=c;o.location=(x,y,z);o.scale=(height/h,)*3;o.rotation_euler.z=angle
placements=[]
if mode=="A":
    # Deliberately laid-out grove masses, open meadow, foreground bank detail.
    trees=[(-28,-33,12),(-20,-29,10),(-35,-24,15),(-23,-17,13),(-41,-13,16),(-28,-6,11),(-17,2,10),(-35,4,14),(-24,14,12),(-40,21,15),(-20,29,11),(-31,37,14),(35,22,11),(42,30,14),(37,38,13),(48,15,12)]
    for i,(x,y,h) in enumerate(trees):placements.append(("pine_tree_01",x,y,profile(x,y),h,i*.83))
    for i,(x,y) in enumerate([(-15,-32),(-13,-23),(-14,-12),(-12,0),(-11,14),(-14,29),(29,25),(31,36)]):placements.append(("pine_sapling_medium",x,y,profile(x,y),3.5+i%3,i*.61))
    for i,y in enumerate([-34,-27,-14,-5,6,19,31,39]):
        x=river_x(y)+(-1 if i%2 else 1)*6.2;placements.append(("rock_moss_set_01",x,y,profile(x,y),.6+i%3*.18,i*.9))
        x+=(-1 if i%2 else 1)*1.6;placements.append(("shrub_03",x,y+1,profile(x,y+1),.9,i*.5));placements.append(("moss_01",x,y-1,profile(x,y-1),.18,i*.6))
else:
    # Keep the established physical woodland/road and shoreline masks.
    for i,t in enumerate(patch["trees"]):
        if i%3:continue
        placements.append(("pine_tree_01" if t["height"]>8 else "pine_sapling_medium",t["x"],t["y"],t["z"],t["height"],t["angle"]))
    for i,p in enumerate(pts):
        if i%113 or p[6]<1.6 or p[5]<5:continue
        if p[6]<4:placements.append(("rock_moss_set_01",*p[:3],.8,i*.13))
        elif p[3]>.65 and i%2:placements.append(("shrub_03",*p[:3],1.2,i*.13))
for name,x,y,z,h,a in placements:instance(name,x,y,z,h,a)
world=bpy.data.worlds.new("Sky");world.use_nodes=True;sc.world=world;n=world.node_tree.nodes;l=world.node_tree.links;sky=n.new("ShaderNodeTexSky");sky.sky_type="NISHITA";sky.sun_elevation=math.radians(28);sky.sun_rotation=math.radians(125);l.new(sky.outputs[0],n.get("Background").inputs[0]);n.get("Background").inputs[1].default_value=.32
sun=bpy.data.lights.new("Late afternoon","SUN");sun.energy=2.2;sun.angle=.08;ob=bpy.data.objects.new("Sun",sun);sc.collection.objects.link(ob);ob.rotation_euler=(.6,-.6,-.8)
cam=bpy.data.objects.new("Review camera",bpy.data.cameras.new("Review"));sc.collection.objects.link(cam);sc.camera=cam
if mode=="A":
    target=Vector((0,10,2));cam.location=Vector((29,-39,18));cam.data.type="PERSP";cam.data.lens=34
else:
    target=Vector(patch["camera"]["target"]);cam.location=target+Vector(patch["camera"]["offset"]);cam.data.type="ORTHO";cam.data.ortho_scale=patch["camera"]["scale"]
cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
sc.render.filepath=str(out/("nature-"+mode+".png"))
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/("nature-"+mode+".blend")),compress=True)
bpy.ops.render.render(write_still=True)
(out/("nature-"+mode+".json")).write_text(json.dumps({"mode":mode,"physicalHash":patch["physicalHash"] if mode=="B" else None,"sourceVertices":len(pts),"placements":len(placements),"missingRiverRows":missing,"artisticApproval":False,"sourceLicense":"CC0 Poly Haven","physicalTerrainModified":False},indent=2))
