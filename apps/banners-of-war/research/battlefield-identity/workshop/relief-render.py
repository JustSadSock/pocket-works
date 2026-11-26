"""Single fixed-camera 3D landscape study, not a runtime renderer."""
import bpy,os,json,math,hashlib,urllib.request
from pathlib import Path
from mathutils import Vector
out=Path(os.environ["BOW_ART_OUTPUT"]);patch=json.loads((out/"relief-patch.json").read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
scene.render.engine="CYCLES";scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform="AgX"
def mesh(name,vs,fs):
    m=bpy.data.meshes.new(name);m.from_pydata(vs,[],fs);m.update();o=bpy.data.objects.new(name,m);scene.collection.objects.link(o);return o
def material(name):
    m=bpy.data.materials.new(name);m.use_nodes=True;return m,m.node_tree.nodes,m.node_tree.links,m.node_tree.nodes.get("Principled BSDF")
def mathop(nodes,links,op,a,b):
    n=nodes.new("ShaderNodeMath");n.operation=op
    for i,v in enumerate((a,b)):
        if isinstance(v,(int,float)):n.inputs[i].default_value=v
        else:links.new(v,n.inputs[i])
    return n.outputs[0]
def tex(nodes,links,name,coord,scale):
    n=nodes.new("ShaderNodeTexImage");n.image=bpy.data.images.load(str(out/(name+".png")),check_existing=True);n.extension="REPEAT"
    v=nodes.new("ShaderNodeVectorMath");v.operation="SCALE";links.new(coord,v.inputs[0]);v.inputs["Scale"].default_value=scale;links.new(v.outputs[0],n.inputs["Vector"]);return n.outputs["Color"]
def blend(nodes,links,a,b,f):
    n=nodes.new("ShaderNodeMixRGB");links.new(a,n.inputs[1]);links.new(b,n.inputs[2]);links.new(f,n.inputs[0]);return n.outputs[0]
def attr(nodes,name):
    n=nodes.new("ShaderNodeAttribute");n.attribute_name=name;return n.outputs["Fac"]
points=patch["points"];cols=patch["cols"];rows=patch["rows"];faces=[]
for y in range(rows-1):
    for x in range(cols-1):
        i=y*cols+x;faces.append((i,i+1,i+cols+1,i+cols))
land=mesh("Authoritative terrain samples",[p[:3] for p in points],faces)
for i,name in enumerate(("canopy","wet","road","shore"),3):
    a=land.data.attributes.new(name,"FLOAT","POINT")
    for v,p in zip(a.data,points):v.value=p[i]
for f in land.data.polygons:f.use_smooth=True
m,n,l,p=material("River terrace / original scanned surfaces");land.data.materials.append(m);coord=n.new("ShaderNodeTexCoord").outputs["Object"]
grass=tex(n,l,"grass",coord,.20);soil=tex(n,l,"sparse",coord,.21);road=tex(n,l,"road",coord,.37);stone=tex(n,l,"stone",coord,.17)
geo=n.new("ShaderNodeNewGeometry");xyz=n.new("ShaderNodeSeparateXYZ");l.new(geo.outputs["Normal"],xyz.inputs[0])
slope=mathop(n,l,"MULTIPLY",mathop(n,l,"SUBTRACT",1,xyz.outputs["Z"]),5)
noise=n.new("ShaderNodeTexNoise");l.new(coord,noise.inputs["Vector"]);noise.inputs["Scale"].default_value=.045;noise.inputs["Detail"].default_value=3
wood=mathop(n,l,"MULTIPLY",attr(n,"canopy"),.85)
base=blend(n,l,grass,soil,mathop(n,l,"MAXIMUM",wood,mathop(n,l,"MULTIPLY",noise.outputs["Fac"],.35)))
base=blend(n,l,base,stone,mathop(n,l,"MINIMUM",.83,slope))
r=mathop(n,l,"SUBTRACT",1,mathop(n,l,"DIVIDE",attr(n,"road"),4.5));base=blend(n,l,base,road,mathop(n,l,"MAXIMUM",0,r))
l.new(base,p.inputs["Base Color"]);p.inputs["Roughness"].default_value=.84
# No mesh displacement: normals from actual geometry and fine scanned relief only.
bump=n.new("ShaderNodeBump");bump.inputs["Strength"].default_value=.24;bump.inputs["Distance"].default_value=.20;l.new(base,bump.inputs["Height"]);l.new(bump.outputs[0],p.inputs["Normal"])
# Actual continuous river ribbon, bounded to the existing 11 m half-width.
vs=[];fs=[]
for i,(x,y,z) in enumerate(patch["water"]):
    vs.extend([(x-11,y,z),(x+11,y,z)])
    if i:fs.append((i*2-2,i*2-1,i*2+1,i*2))
river=mesh("Water surface at physical channel",vs,fs);m,n,l,p=material("Muted green water with reflected sky");river.data.materials.append(m)
p.inputs["Base Color"].default_value=(.055,.115,.10,1);p.inputs["Roughness"].default_value=.24;p.inputs["IOR"].default_value=1.333
noise=n.new("ShaderNodeTexNoise");noise.inputs["Scale"].default_value=1.8;noise.inputs["Detail"].default_value=2
b=n.new("ShaderNodeBump");b.inputs["Strength"].default_value=.15;b.inputs["Distance"].default_value=.10;l.new(noise.outputs["Fac"],b.inputs["Height"]);l.new(b.outputs[0],p.inputs["Normal"])
# Actual pinned, CC0 Forge tree source, not dots or invented geometry.
baseurl="https://raw.githubusercontent.com/anshaneja5/skyline-run/0c41526d8d4130c37c15e219c2c3737fa8cb4ad8/public/assets/models/"
hashes=["80bd662cc51f983986f4e201463dc3a729a6cd4a","0197de65879eb650247c8d56ac52da34489938cb","828786b4bdb5224a8b3672f5e5d6cebe1c65bd93"]
models={};provenance=[]
for kind,expected in enumerate(hashes,1):
    url=baseurl+"tree%d.glb"%kind;raw=urllib.request.urlopen(url,timeout=45).read(2*1024*1024+1)
    if len(raw)>2*1024*1024 or hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=expected:raise ValueError("Tree source mismatch")
    file=out/("tree-source-%d.glb"%kind);file.write_bytes(raw);before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(file));added=[o for o in scene.objects if o not in before]
    ms=[o for o in added if o.type=="MESH"];pts=[o.matrix_world@Vector(v) for o in ms for v in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)));center=(lo+hi)/2
    collection=bpy.data.collections.new("Tree source "+str(kind));collection.instance_offset=(center.x,center.y,lo.z)
    for o in added:
        for c in list(o.users_collection):c.objects.unlink(o)
        collection.objects.link(o)
    for o in ms:
        for m in o.data.materials:
            if not m or not m.use_nodes:continue
            n=m.node_tree.nodes;l=m.node_tree.links;p=next((n for n in n if n.type=="BSDF_PRINCIPLED"),None)
            if p:
                p.inputs["Roughness"].default_value=.83
                for link in list(p.inputs["Metallic"].links):l.remove(link)
                p.inputs["Metallic"].default_value=0
    models[kind]=(collection,hi.z-lo.z)
    provenance.append({"url":url,"gitBlob":expected,"license":"CC0","author":"Quaternius"})
for tree in patch["trees"]:
    c,h=models[tree["kind"]];o=bpy.data.objects.new("Forest instance",None);scene.collection.objects.link(o);o.instance_type="COLLECTION";o.instance_collection=c;o.location=(tree["x"],tree["y"],tree["z"]);o.rotation_euler.z=tree["angle"];o.scale=(tree["height"]/h,)*3
world=bpy.data.worlds.new("Soft blue sky");world.use_nodes=True;world.node_tree.nodes["Background"].inputs[0].default_value=(.45,.57,.72,1);world.node_tree.nodes["Background"].inputs[1].default_value=.35;scene.world=world
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat("-Z","Y").to_euler()
sun=bpy.data.lights.new("Low late afternoon sun","SUN");sun.energy=2.5;sun.angle=math.radians(8);sun.color=(1,.89,.70)
o=bpy.data.objects.new("Sun",sun);scene.collection.objects.link(o);o.location=(-120,-60,90);look(o,(0,0,0))
cam=bpy.data.objects.new("Fixed relief camera",bpy.data.cameras.new("Relief"));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=patch["camera"]["scale"]
target=Vector(patch["camera"]["target"]);cam.location=target+Vector(patch["camera"]["offset"]);look(cam,target)
scene.render.filepath=str(out/"historic-relief-3d.png");bpy.ops.render.render(write_still=True)
(out/"relief-study.json").write_text(json.dumps({"physicalHash":patch["physicalHash"],"camera":patch["camera"],"vertices":len(points),"trees":len(patch["trees"]),"sourceModels":provenance,"reference":"https://www.woodlandtrust.org.uk/visiting-woods/woods/symonds-yat-west/","noRuntimeIntegration":True},indent=2))
