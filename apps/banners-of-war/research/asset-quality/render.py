import bpy, math, os, json
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
sc=bpy.context.scene
sc.render.engine="CYCLES";sc.cycles.device="CPU";sc.cycles.samples=10;sc.cycles.use_denoising=True
sc.render.film_transparent=True;sc.render.image_settings.file_format="PNG";sc.render.image_settings.color_mode="RGBA"
sc.view_settings.view_transform="AgX"
world=bpy.data.worlds.new("Outdoor fill");sc.world=world;world.use_nodes=True;world.node_tree.nodes["Background"].inputs[0].default_value=(.42,.48,.54,1);world.node_tree.nodes["Background"].inputs[1].default_value=.42
def look(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat("-Z","Y").to_euler()
def light(name,pos,energy,size,color):
    d=bpy.data.lights.new(name,"AREA");d.energy=energy;d.shape="DISK";d.size=size;d.color=color;o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);o.location=pos;look(o,(0,0,.9));return o
key=light("Warm sky",(-4,-5,7),650,4,(1,.90,.74))
fill=light("Cool bounce",(4,2,5),180,5,(.70,.82,1))
cam=bpy.data.objects.new("60 degree orthographic",bpy.data.cameras.new("Orthographic"));sc.collection.objects.link(cam);sc.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=3.5
rig=next(o for o in sc.objects if o.type=="ARMATURE")
# Rotate the entire asset about its ground origin, keep camera and lighting fixed.
pivot=bpy.data.objects.new("Ground yaw",None);sc.collection.objects.link(pivot)
for o in list(sc.objects):
    if o not in [pivot,cam,key,fill] and o.parent is None:
        m=o.matrix_world.copy();o.parent=pivot;o.matrix_world=m
target=Vector((0,0,.65));cam.location=target+Vector((0,-5,5*math.tan(pi/3)));look(cam,target)
shield=next(o for o in sc.objects if o.name.startswith("Curved shield"))
paint=shield.data.materials[0];ramp=next(n for n in paint.node_tree.nodes if n.type=="VALTORGB")
def team(side):
    color=(.14,.26,.39) if side==0 else (.42,.13,.075)
    for i,f in [(0,.6),(1,1.3)]:ramp.color_ramp.elements[i].color=(*(x*f for x in color),1)
# A = restrained material rendering. B = actual silhouette changes to gear, not whole anatomy.
# C = subsequent artistic raster processing of A, kept on same anchor.
gear=[o for o in sc.objects if o.name.startswith(("Curved shield","Shield rawhide","Kettle hat","Rolled rim"))]
base={o.name:[v.co.copy() for v in o.data.vertices] for o in gear}
def style(s):
    for o in gear:
        verts=base[o.name]
        center=sum(verts,Vector((0,0,0)))/len(verts)
        for v,p in zip(o.data.vertices,verts):
            q=p-center
            if s=="B":q.x*=1.13;q.z*=1.08
            v.co=center+q
        o.data.update()
    key.data.energy=650 if s=="A" else 900
    fill.data.energy=180 if s=="A" else 115
def render(name,side,heading,frame,s="A",res=192):
    sc.frame_set(frame);team(side);style(s);pivot.rotation_euler.z=heading*pi/2
    sc.render.resolution_x=sc.render.resolution_y=res;sc.render.resolution_percentage=100
    sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
for s in ["A","B"]:
    render("hero-"+s,0,0,1,s,640)
    for side in [0,1]:
        for heading in [0,2]:
            for frame in [1,5,9,13,17,21,25,29,33,37] if s=="A" else [1,21,29]:
                render(f"{s}-{side}-{heading}-{frame}",side,heading,frame,s)
# 16px/32px/64px art uses source crop with common physical origin.
(out/"render-info.json").write_text(json.dumps({"elevation":60,"orthoScale":3.5,"targetZ":.65,"source":"CC0 imported textured rig, adapted equipment","frames":[1,5,9,13,17,21,25,29,33,37],"headings":[0,2]}))
