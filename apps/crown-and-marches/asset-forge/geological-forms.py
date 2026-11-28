"""Original geological shape studies for Crown & Marches. No external art."""
import bpy
import math
import json
import os
from mathutils import Vector
from math import exp, sqrt, sin, cos

outputs = json.loads(os.environ["ART_FORGE_OUTPUTS"])
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat

mats = [
    material("Alpine turf", (.22, .30, .12), .95),
    material("Weathered dolomite", (.48, .43, .35), .88),
    material("Fresh limestone", (.67, .64, .55), .80),
    material("Scree and talus", (.38, .34, .26), .96),
    material("Wet valley earth", (.17, .23, .12), .96),
    material("Shadowed rock cleavage", (.24, .24, .22), .94),
    material("Subalpine grass", (.35, .37, .18), .94),
]

def gauss(x, y, a, b, sx, sy):
    return exp(-((x-a)/sx)**2-((y-b)/sy)**2)

def ridge(x,y,a,b,width,length,angle):
    u=(x-a)*cos(angle)+(y-b)*sin(angle)
    v=-(x-a)*sin(angle)+(y-b)*cos(angle)
    return max(0., 1-abs(v)/width)**1.4 * exp(-(u/length)**4)

def profile(kind,x,y):
    # Each landform has its own authored cross-section and longitudinal
    # structure, not a recolored generic rock. Heights are dimensionless.
    if kind == "ridge":
        z=.80*ridge(x,y,-.09,.0,.53,.91,.35)+.29*gauss(x,y,-.40,-.12,.28,.33)+.33*gauss(x,y,.34,.13,.30,.29)
        z-=.16*gauss(x,y,.02,.28,.14,.44)
    elif kind == "summit":
        z=1.17*max(0,1-sqrt(((x+.12)/.88)**2+((y-.06)/.80)**2))**.68
        z+=.19*ridge(x,y,.18,.0,.21,.65,-.38)
        z-=.15*ridge(x,y,.02,-.16,.10,.60,.72)
    elif kind == "outcrop":
        z=.48*gauss(x,y,-.28,.10,.69,.62)+.42*ridge(x,y,-.05,.05,.38,.64,.1)
        # Bedding surfaces make the rock face distinct from the scree toe.
        z+=.05*max(0,sin((x*.72+y*.27)*27))*gauss(x,y,.0,.0,.55,.5)
    elif kind == "scree":
        z=.65*gauss(x,y,.0,.43,.54,.46)+.32*gauss(x,y,.0,-.20,.68,.62)
        z-=.14*gauss(x,y,.0,-.15,.10,.66)
    elif kind == "gorge":
        curve=.18*sin(y*2.8)
        z=.78*gauss(x,y,-.55,.08,.55,.80)+.74*gauss(x,y,.54,-.02,.53,.80)
        z-=.43*exp(-((x-curve)/.17)**2)*exp(-(y/.83)**4)
    elif kind == "foothills":
        z=.35*gauss(x,y,-.43,.20,.55,.60)+.46*gauss(x,y,.27,.31,.57,.54)+.24*gauss(x,y,.19,-.40,.65,.45)
        z-=.10*gauss(x,y,-.10,-.12,.20,.77)
    elif kind == "rock-shelf":
        z=.33*gauss(x,y,-.25,.0,.74,.58)+.18*gauss(x,y,.36,.1,.47,.57)
        z+=.13*max(0,1-abs(y+.2*x-.08)/.20)*exp(-(x/.75)**4)
    else:
        z=.82*gauss(x,y,-.23,.40,.69,.49)+.24*gauss(x,y,.29,-.19,.65,.64)
        z-=.12*ridge(x,y,.03,-.14,.14,.68,1.15)
    # Boundary reaches the supporting landscape continuously. No plinth.
    mask=max(0,1-x*x)**.9*max(0,1-y*y)**.9
    return max(0,z)*mask

names=["ridge","summit","outcrop","scree","gorge","foothills","rock-shelf","slope"]
objects=[]
N=81
for k,kind in enumerate(names):
    coords=[]
    for j in range(N):
        y=-1+2*j/(N-1)
        for i in range(N):
            x=-1+2*i/(N-1)
            coords.append((x,y,profile(kind,x,y)))
    faces=[]
    for j in range(N-1):
        for i in range(N-1):
            a=j*N+i
            faces.extend([(a,a+1,a+N+1),(a,a+N+1,a+N)])
    mesh=bpy.data.meshes.new("Geology-"+kind)
    mesh.from_pydata(coords, [], faces)
    mesh.update()
    obj=bpy.data.objects.new("terrain-"+kind,mesh)
    bpy.context.collection.objects.link(obj)
    obj.location=((k%4-1.5)*2.65,(.5-k//4)*2.9,0)
    for mat in mats:
        mesh.materials.append(mat)
    for f in mesh.polygons:
        z=f.center.z
        slope=1-abs(f.normal.z)
        if kind=="scree" and z<.45: m=3
        elif kind=="gorge" and z<.1: m=4
        elif slope>.42: m=5 if f.normal.x>.2 else 2
        elif slope>.19 or z>.49: m=1 if z<.62 else 2
        elif z>.24: m=6
        else: m=0
        f.material_index=m
        f.use_smooth=True
    objects.append(obj)

scene=bpy.context.scene
scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.26,.30,.34,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value=.52
for name,location,energy,size in [("Northwest sun",(-6,-8,10),2200,5),("Sky fill",(5,4,7),550,7)]:
    light=bpy.data.lights.new(name,"AREA")
    light.energy=energy
    light.shape="DISK"
    light.size=size
    obj=bpy.data.objects.new(name,light)
    scene.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat("-Z","Y").to_euler()
camera=bpy.data.cameras.new("Atlas orthographic")
cam=bpy.data.objects.new("Atlas orthographic",camera)
scene.collection.objects.link(cam)
cam.location=(0,-10,12)
cam.rotation_euler=(Vector((0,0,.2))-cam.location).to_track_quat("-Z","Y").to_euler()
camera.type="ORTHO"
camera.ortho_scale=11.4
scene.camera=cam
scene.render.image_settings.file_format="PNG"
scene.render.film_transparent=True
scene.render.resolution_x=1600
scene.render.resolution_y=900
scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=outputs["editable"],compress=False)
bpy.ops.object.select_all(action="DESELECT")
for obj in objects: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=outputs["model"],export_format="GLB",use_selection=True,export_cameras=False,export_lights=False,export_apply=True)
