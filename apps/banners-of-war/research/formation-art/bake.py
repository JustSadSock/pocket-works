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

from bpy_extras.object_utils import world_to_camera_view
sc.render.resolution_x=sc.render.resolution_y=256
sc.render.resolution_percentage=100
sc.cycles.samples=12
# +X world forward projects down in tactical camera C; source forward is Blender -Y.
# Camera sees the front at heading zero. The source's baked rig and materials are retained.
def pixel(p):
    q=world_to_camera_view(sc,cam,Vector(p))
    return [q.x*sc.render.resolution_x,(1-q.y)*sc.render.resolution_y]
weapon=[o for o in sc.objects if o.type=="MESH" and o.name.startswith(("Ash spear","Forged spear"))]
body=[o for o in sc.objects if o.type=="MESH" and o not in weapon]
def vertices(objects):
    deps=bpy.context.evaluated_depsgraph_get();result=[]
    for o in objects:
        ev=o.evaluated_get(deps);mesh=ev.to_mesh()
        if mesh is None:continue
        try:result.extend(ev.matrix_world@v.co for v in mesh.vertices)
        finally:ev.to_mesh_clear()
    if not result:raise ValueError("Empty evaluated mesh")
    return result
def bounds(objects):
    p=vertices(objects);lo=[min(v[i] for v in p) for i in range(3)];hi=[max(v[i] for v in p) for i in range(3)]
    return [Vector((x,y,z)) for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]]
core=[o for o in body if any(m.type=="ARMATURE" for m in o.modifiers)]
if not core:core=[o for o in body if o.name.startswith("char1")]
if not core:raise ValueError("Missing skinned human body for physical calibration")
sc.frame_set(1);bpy.context.view_layer.update()
core_points=vertices(core);z0=min(v.z for v in core_points);human_height=max(v.z for v in core_points)-z0
if not 1.4<human_height<2.3:raise ValueError(f"Invalid physical body height {human_height}; origin {z0}")
# A single physical anchor for the model, with the actual planted-foot plane.
print("Ground calibration",z0,human_height,flush=True)
# Material segmentation: original albedo contains ivory textile islands, distinct
# from the dark chainmail and skin. Mask only the bright low-chroma textile.
# Preserve original normal, metallic and roughness maps.
def mathnode(nodes,links,op,a,b):
    n=nodes.new("ShaderNodeMath");n.operation=op
    for i,v in enumerate([a,b]):
        if isinstance(v,(float,int)):n.inputs[i].default_value=v
        else:links.new(v,n.inputs[i])
    return n.outputs[0]
def textile_material():
    m=next(o.data.materials[0] for o in core if o.data.materials)
    nodes=m.node_tree.nodes;links=m.node_tree.links;p=next(n for n in nodes if n.type=="BSDF_PRINCIPLED")
    source=p.inputs["Base Color"].links[0].from_socket
    sep=nodes.new("ShaderNodeSeparateColor");links.new(source,sep.inputs[0]);r,g,b=sep.outputs[:3]
    mn=mathnode(nodes,links,"MINIMUM",mathnode(nodes,links,"MINIMUM",r,g),b)
    mx=mathnode(nodes,links,"MAXIMUM",mathnode(nodes,links,"MAXIMUM",r,g),b)
    bright=mathnode(nodes,links,"GREATER_THAN",mn,.39)
    chroma=mathnode(nodes,links,"LESS_THAN",mathnode(nodes,links,"SUBTRACT",mx,mn),.20)
    fac=mathnode(nodes,links,"MULTIPLY",bright,chroma)
    tint=nodes.new("ShaderNodeMixRGB");tint.blend_type="MULTIPLY";tint.inputs[0].default_value=1;links.new(source,tint.inputs[1])
    mix=nodes.new("ShaderNodeMixRGB");links.new(fac,mix.inputs[0]);links.new(source,mix.inputs[1]);links.new(tint.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],p.inputs["Base Color"])
    return tint
textile=textile_material()
def livery(side,rear=False):
    textile.inputs[2].default_value=((*((.18,.34,.68) if side==0 else (.72,.14,.075)),1) if not rear else (*((.32,.48,.69) if side==0 else (.69,.32,.15)),1))
    color=(.09,.19,.38) if side==0 else (.48,.095,.042)
    if rear:color=(.19,.32,.46) if side==0 else (.48,.22,.075)
    for i,f in [(0,.65),(1,1.45)]:ramp.color_ramp.elements[i].color=(*(min(1,x*f) for x in color),1)
# Role equipment is actual 3D geometry attached to the existing skinned model.
def mat(name,color,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get("Principled BSDF");p.inputs["Base Color"].default_value=(*color,1);p.inputs["Roughness"].default_value=.63;p.inputs["Metallic"].default_value=metal;return m
banner_mat=mat("Woven banner",(.1,.2,.5));trim=mat("Gold dyed linen",(.72,.51,.16));sword_mat=mat("Officer's worked steel",(.43,.47,.49),.85);pole_mat=mat("Ash standard pole",(.26,.14,.058))
def mesh(name,v,f,material,parent):
    me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);sc.collection.objects.link(o);o.data.materials.append(material);o.parent=parent;return o
def rod(name,a,b,r,material,parent,n=12):
    a,b=Vector(a),Vector(b);z=(b-a).normalized();x=z.cross(Vector((0,1,0)) if abs(z.z)>.9 else Vector((0,0,1))).normalized();y=z.cross(x)
    v=[tuple(p+r*(x*cos(i*2*pi/n)+y*sin(i*2*pi/n))) for p in [a,b] for i in range(n)]
    f=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
    return mesh(name,v,f,material,parent)
sc.frame_set(1);pivot.rotation_euler.z=0;bpy.context.view_layer.update()
hand=next(b for b in rig.pose.bones if b.name.lower().replace("_","").endswith(("righthand","handr")))
p=rig.matrix_world@hand.head
# Coordinates authored at the actual hand; the rigid role equipment rotates with the model.
pole=rod("Standard staff",(p.x,p.y,z0+.15),(p.x,p.y,z0+2.75),.027,pole_mat,pivot)
verts=[];faces=[]
for i in range(13):
    for j in range(9):
        x=i/12;v=j/8;verts.append((p.x+x*.83,p.y+.10*sin(x*8+v*2)+.28*x,z0+2.70-v*.72-.07*x))
for i in range(12):
    for j in range(8):
        k=i*9+j;faces.append((k,k+9,k+10,k+1))
flag=mesh("Sewn flying cloth",verts,faces,banner_mat,pivot);flag.data.materials.append(trim)
for poly in flag.data.polygons:
    i,j=divmod(poly.index,8);poly.material_index=1 if j==0 or j==7 or i in [5,6] else 0;poly.use_smooth=True
mod=flag.modifiers.new("Two sided cloth","SOLIDIFY");mod.thickness=.003
# An officer has an unsheathed sword rather than a second spear.
sword=rod("Sword grip",p,p+Vector((0,-.02,.16)),.022,pole_mat,pivot)
guard=rod("Sword crossguard",p+Vector((-.10,-.02,.16)),p+Vector((.10,-.02,.16)),.02,trim,pivot)
a=p+Vector((0,-.02,.17));b=p+Vector((.09,-.14,.85));axis=(b-a).normalized();l=axis.cross(Vector((0,1,0))).normalized();t=axis.cross(l)
sv=[tuple(a+l*.045),tuple(a+t*.012),tuple(a-l*.045),tuple(a-t*.012),tuple(b)]
blade=mesh("Officer's straight sword",sv,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],sword_mat,pivot)
# Rank marker is a short draped textile mantle, not recoloured metal.
cx,cy=0,0;pts=vertices(core);shoulder=z0+human_height*.75
capeV=[(-.25,.16,shoulder),(.25,.16,shoulder),(.31,.27,shoulder-.42),(0,.34,shoulder-.51),(-.31,.27,shoulder-.42)]
cape=mesh("Officer's short mantle",capeV,[(0,1,2,3,4)],banner_mat,pivot);m=cape.modifiers.new("Cloth thickness","SOLIDIFY");m.thickness=.008
roles={"banner":[pole,flag],"officer":[sword,guard,blade,cape]}
role_objects=sum(roles.values(),[])
for o in role_objects:o.hide_render=True

# Common camera frustum preflight: include all evaluated body and weapon bounds.
# Increasing the frustum does not change metres per source pixel.
max_extent=0
for heading in range(8):
    pivot.rotation_euler.z=-heading*pi/4
    for frame in [1,5,9,13,17,21,25,29,33,37]:
        sc.frame_set(frame);bpy.context.view_layer.update()
        for v in bounds(body+weapon+role_objects):
            p=world_to_camera_view(sc,cam,v)
            max_extent=max(max_extent,abs(p.x-.5),abs(p.y-.5))
factor=max(1.0,2.24*max_extent)
cam.data.ortho_scale*=factor
resolution=math.ceil(256*factor/32)*32
sc.render.resolution_x=sc.render.resolution_y=resolution
bpy.context.view_layer.update()
records={}
cloth=[m for m in bpy.data.materials if m.use_nodes and any(x in m.name.lower() for x in ("cloth","gambeson","tunic","fabric"))]
base_cloth={m.name:m.diffuse_color[:] for m in cloth}
for side in [0,1]:
    livery(side)
    for heading in range(8):
        pivot.rotation_euler.z=-heading*pi/4
        for frame in [1,5,9,13,17,21,25,29,33,37]:
            sc.frame_set(frame);bpy.context.view_layer.update()
            name=f"{side}-{heading}-{frame}"
            anchor=pixel((0,0,z0))
            points=bounds(weapon);body_pts=bounds(body)
            tips=[pixel(v) for v in points]
            direction=Vector((sin(-heading*pi/4),-cos(-heading*pi/4),0))
            verts=vertices(weapon)
            reach=max((v.dot(direction) for v in verts),default=0)
            sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
            # Isolate the body, including shield but not spear, for actual visible body height.
            mask=f"0-{heading}-{frame}-body.png"
            if side==0:
                for o in weapon:o.hide_render=True
                sc.render.filepath=str(out/mask);bpy.ops.render.render(write_still=True)
                for o in weapon:o.hide_render=False
            records[name]={"anchor":anchor,"pixelsPerMetre":resolution/cam.data.ortho_scale,"weaponBounds":tips,"weaponForwardMetres":reach,"bodyWorldHeight":max(v.z for v in vertices(core))-min(v.z for v in vertices(core)),"bodyMask":mask,"renderSize":resolution}
            if frame in [1,21]:
                # Restricted veteran shield finish; shared mesh, no new troop type.
                livery(side,True)
                sc.render.filepath=str(out/(name+"-v.png"));bpy.ops.render.render(write_still=True)
                records[name+"-v"]={**records[name]}
                livery(side)
        sc.frame_set(1);bpy.context.view_layer.update()
        for role,objects in roles.items():
            for o in weapon:o.hide_render=True
            for o in objects:o.hide_render=False
            banner_mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(*((.08,.20,.50) if side==0 else (.62,.12,.055)),1)
            livery(side)
            name=f"{side}-{heading}-1-{role}"
            sc.render.filepath=str(out/(name+".png"));bpy.ops.render.render(write_still=True)
            records[name]={**records[f"{side}-{heading}-1"],"role":role}
            for o in objects:o.hide_render=True
            for o in weapon:o.hide_render=False
(out/"frames.json").write_text(json.dumps({"frames":records,"groundZ":z0,"humanHeightMetres":human_height,"elevation":60,"orthoScale":cam.data.ortho_scale,"renderSize":resolution,"framingFactor":factor}))
