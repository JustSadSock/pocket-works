import argparse, math, random, sys
from pathlib import Path
import bpy
from mathutils import Vector

def parse_args():
    parser=argparse.ArgumentParser(); parser.add_argument('--output',required=True)
    return parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

def clear_scene():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.armatures,bpy.data.actions):
        pass

def B(x,y,z): return (x,-z,y)
def dims(w,h,d): return (w,d,h)

def painted_material(name, base, roughness=.72, metallic=0.0, accent=None, seed=1, emission=None):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    if not bsdf: return mat
    accent=accent or tuple(min(1,c*1.16+0.03) for c in base)
    rng=random.Random(seed); size=64; image=bpy.data.images.new(f'{name}_Paint',width=size,height=size,alpha=True)
    pixels=[]
    for y in range(size):
        for x in range(size):
            wash=0.82+0.13*math.sin(x*.23+y*.11)+0.07*math.sin(x*.71-y*.43)+rng.uniform(-.055,.055)
            fleck=accent if rng.random()<.045 else base
            r=max(0,min(1,fleck[0]*wash)); g=max(0,min(1,fleck[1]*wash)); b=max(0,min(1,fleck[2]*wash)); pixels.extend((r,g,b,1))
    image.pixels= pixels; image.pack()
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image; tex.interpolation='Linear'
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value=roughness; bsdf.inputs['Metallic'].default_value=metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*emission,1); bsdf.inputs['Emission Strength'].default_value=2.2
    return mat

def bevel(obj, amount=.08, segments=2):
    mod=obj.modifiers.new('Authored bevel','BEVEL'); mod.width=amount; mod.segments=segments
    try: bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception: pass
    return obj

def box(name, pos, size, mat, rot_y=0, bevel_amount=.06):
    bpy.ops.mesh.primitive_cube_add(location=B(*pos)); obj=bpy.context.object; obj.name=name; obj.dimensions=dims(*size); obj.rotation_euler[2]=-rot_y
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel_amount: bevel(obj,bevel_amount,2)
    if mat: obj.data.materials.append(mat)
    return obj

def cylinder(name,pos,radius,height,mat,vertices=24,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=height,location=B(*pos)); obj=bpy.context.object; obj.name=name
    obj.rotation_euler=(rot[0],-rot[2],-rot[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel(obj,min(.055,radius*.12),2)
    if mat: obj.data.materials.append(mat)
    return obj

def sphere(name,pos,scale,mat,segments=24,rings=14):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=B(*pos)); obj=bpy.context.object; obj.name=name; obj.scale=dims(*scale); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if mat: obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def torus(name,pos,major,minor,mat,rot=(0,0,0),major_segments=32,minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=major_segments,minor_segments=minor_segments,location=B(*pos)); obj=bpy.context.object; obj.name=name
    obj.rotation_euler=(rot[0],-rot[2],-rot[1]);
    if mat:obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def lathe(name, pos, profile, mat, segments=48):
    verts=[]; faces=[]
    for i in range(segments):
        a=math.tau*i/segments; ca,sa=math.cos(a),math.sin(a)
        for radius,height in profile: verts.append((radius*ca,radius*sa,height))
    rings=len(profile)
    for i in range(segments):
        ni=(i+1)%segments
        for j in range(rings-1):
            a=i*rings+j; b=ni*rings+j; faces.append((a,b,b+1,a+1))
    mesh=bpy.data.meshes.new(name+'Mesh'); mesh.from_pydata(verts,[],faces); mesh.update(); obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); obj.location=B(*pos)
    if mat:mesh.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    return obj

def curve_between(name,a,b,radius,mat):
    a,b=Vector(B(*a)),Vector(B(*b)); direction=b-a; length=direction.length
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=radius,depth=length,location=(a+b)/2); obj=bpy.context.object; obj.name=name
    obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(direction.normalized())
    if mat:obj.data.materials.append(mat)
    return obj

def export_glb(output, animations=False):
    output=Path(output).resolve(); output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=animations,export_skins=animations,export_morph=False,export_animation_mode='ACTIONS' if animations else 'SCENE',export_force_sampling=animations,export_frame_range=False)
    if not output.exists() or output.stat().st_size<8000: raise RuntimeError(f'GLB export unexpectedly small: {output}')
    print(f'BELLFORGE Asset Forge generated {output} ({output.stat().st_size} bytes)')
