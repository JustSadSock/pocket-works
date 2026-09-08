import argparse, math, sys
from pathlib import Path
import bpy
from mathutils import Vector


def args():
    argv=sys.argv; argv=argv[argv.index('--')+1:] if '--' in argv else []
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); return p.parse_args(argv)


def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
        for block in list(coll):
            if block.users==0: coll.remove(block)


def mat(name,color,rough=.84):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Roughness'].default_value=rough; bsdf.inputs['Metallic'].default_value=0.0
    return m


def apply(o):
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.select_set(False)


def smooth(o,m):
    o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth=True
    return o


def cone(name,loc,r1,r2,depth,m,verts=10):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth,location=loc)
    o=bpy.context.active_object; o.name=name; return smooth(o,m)


def cone_between(name,a,b,r1,r2,m,verts=9):
    a=Vector(a); b=Vector(b); d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=d.length,location=(a+b)*.5)
    o=bpy.context.active_object; o.name=name; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y'); o.rotation_mode='XYZ'; return smooth(o,m)


def ico(name,loc,scale,m,subdiv=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv,radius=1,location=loc)
    o=bpy.context.active_object; o.name=name; o.scale=scale; apply(o); return smooth(o,m)


def join(name,objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]; bpy.ops.object.join(); objs[0].name=name
    for p in objs[0].data.polygons:p.use_smooth=True
    return objs[0]


def make_fir():
    bark=mat('Fir bark',(.155,.075,.035),.96); needles=mat('Fir needles',(.050,.145,.078),.92); tips=mat('Fir fresh needles',(.075,.205,.105),.90)
    objs=[]
    objs.append(cone_between('firTrunk',(0,0,0),(0,0,10.2),.50,.18,bark,11))
    # Natural branch whorls: low branches droop, upper branches shorten and lift.
    for ring,z in enumerate((3.0,4.0,5.0,6.0,6.95,7.85,8.7)):
        progress=ring/6.0; radius=2.95*(1-progress*.62)
        count=5 if ring<5 else 4
        for j in range(count):
            a=j*math.tau/count+ring*.57
            droop=-.58+(progress*.86)
            root=(math.cos(a)*.10,math.sin(a)*.10,z)
            mid=(math.cos(a)*radius*.58,math.sin(a)*radius*.58,z+droop*.52)
            tip=(math.cos(a)*radius,math.sin(a)*radius,z+droop)
            objs.append(cone_between(f'firBranch_{ring}_{j}',root,tip,.105,.018,bark,7))
            objs.append(cone_between(f'firNeedles_{ring}_{j}',mid,tip,.46,.045,needles if (ring+j)%3 else tips,8))
            inner=(math.cos(a+.09)*radius*.22,math.sin(a+.09)*radius*.22,z+.12)
            objs.append(cone_between(f'firInner_{ring}_{j}',inner,mid,.39,.06,needles,8))
    objs.append(cone_between('firTop',(0,0,8.25),(0,0,10.65),.82,.025,tips,10))
    o=join('Fir_A',objs); bev=o.modifiers.new('weathered edges','BEVEL'); bev.width=.018; bev.segments=1; return o


def make_broad():
    bark=mat('Broad bark',(.19,.105,.050),.97); bark2=mat('Young bark',(.255,.185,.105),.94)
    leaf=mat('Broadleaf canopy',(.105,.235,.082),.91); leaf2=mat('Broadleaf sun canopy',(.155,.315,.105),.89)
    objs=[]
    objs.append(cone_between('broadTrunk',(0,0,0),(0,0,7.25),.70,.34,bark,12))
    branch_specs=[
        ((0,0,4.3),(-2.25,.35,7.05),.30),((0,0,4.75),(2.05,-.65,7.35),.29),
        ((0,0,5.15),(-.55,2.05,7.70),.25),((0,0,5.45),(1.0,1.75,8.05),.22),
        ((0,0,5.65),(.15,-1.95,7.85),.23),((-1.15,.18,5.85),(-2.65,-.35,7.45),.18)
    ]
    for i,(a,b,r) in enumerate(branch_specs):
        objs.append(cone_between(f'broadBranch{i}',a,b,r,r*.30,bark2 if i>3 else bark,9))
    crowns=[
        (-2.25,.35,7.35,1.70,1.38,1.55),(2.10,-.65,7.55,1.62,1.34,1.50),
        (-.65,2.00,7.88,1.55,1.46,1.48),(1.08,1.72,8.18,1.48,1.40,1.42),
        (.12,-1.92,8.05,1.52,1.33,1.44),(-1.62,-.90,8.10,1.48,1.36,1.40),
        (1.55,.45,8.55,1.38,1.28,1.35),(-.55,.30,8.82,1.62,1.35,1.50),
        (.25,.05,9.15,1.28,1.18,1.24)
    ]
    for i,(x,y,z,sx,sy,sz) in enumerate(crowns):
        c=ico(f'broadCrown{i}',(x,y,z),(sx,sy,sz),leaf2 if i in (2,3,7,8) else leaf,2)
        c.rotation_euler=(.04*(i%3-1),.13*i,.055*((i+1)%3-1)); objs.append(c)
    return join('Broad_A',objs)


def make_rock():
    rock=mat('Granite',(.255,.270,.245),.99)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=2.1,location=(0,0,1.05))
    o=bpy.context.active_object; o.name='Rock_A'; o.scale=(1.75,1.28,.76); apply(o)
    # Deterministic low-amplitude displacement breaks the primitive silhouette.
    for v in o.data.vertices:
        p=v.co; n=.90+.10*math.sin(p.x*2.7+p.y*4.2+p.z*3.1)+.045*math.sin(p.x*7.3-p.y*5.1)
        p.x*=n; p.y*=n*(.98+.03*math.sin(p.z*4.0)); p.z*=n
    o.data.update(); smooth(o,rock); bev=o.modifiers.new('eroded bevel','BEVEL'); bev.width=.035; bev.segments=1; return o


def main():
    a=args(); out=Path(a.output).resolve(); clear()
    make_fir().location.x=-6; make_broad().location.x=0; make_rock().location.x=6
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True)
    if not out.exists() or out.stat().st_size<50000: raise RuntimeError(f'Biome GLB unexpectedly small: {out}')
    print(f'AETHERWING biome props generated: {out} ({out.stat().st_size} bytes)')

if __name__=='__main__':main()
