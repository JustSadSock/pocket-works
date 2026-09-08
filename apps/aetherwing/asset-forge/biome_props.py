import argparse, math, sys
from pathlib import Path
import bpy
from mathutils import Vector

def args():
    argv=sys.argv;argv=argv[argv.index('--')+1:] if '--' in argv else [];p=argparse.ArgumentParser();p.add_argument('--output',required=True);return p.parse_args(argv)
def clear():bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.8):m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.roughness=rough;return m
def apply(o):bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False)
def smooth(o,m):o.data.materials.append(m);[setattr(p,'use_smooth',True) for p in o.data.polygons];return o
def cone(name,loc,r1,r2,depth,m,verts=10):bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r1,radius2=r2,depth=depth,location=loc);o=bpy.context.active_object;o.name=name;return smooth(o,m)
def uv(name,loc,scale,m):bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc);o=bpy.context.active_object;o.name=name;o.scale=scale;apply(o);return smooth(o,m)
def join(name,objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();objs[0].name=name;return objs[0]
def make_fir():
    bark=mat('Fir bark',(.22,.12,.065));needle=mat('Fir needles',(.10,.28,.16));objs=[cone('firTrunk',(0,0,3.2),.42,.25,6.4,bark,9)]
    for i,(z,r,h) in enumerate([(3.1,2.4,3.2),(4.4,2.0,3.0),(5.7,1.55,2.7),(6.9,1.0,2.3)]):objs.append(cone(f'firTier{i}',(0,0,z),r,.08,h,needle,11))
    o=join('Fir_A',objs);bev=o.modifiers.new('weathered edges','BEVEL');bev.width=.035;bev.segments=2;return o
def make_broad():
    bark=mat('Oak bark',(.27,.15,.075));leaf=mat('Broadleaf canopy',(.19,.39,.18));objs=[cone('oakTrunk',(0,0,3),.55,.34,6,bark,10)]
    for i,(x,y,z,s) in enumerate([(-1.2,.2,6.1,2.2),(1.1,-.3,6.3,2.0),(0,.9,7.1,2.25),(.2,-1.0,7.0,1.8)]):objs.append(uv(f'crown{i}',(x,y,z),(s,s*.8,s*.9),leaf))
    return join('Broad_A',objs)
def make_rock():
    rock=mat('Granite',(.28,.30,.27),.94);bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=2.1,location=(0,0,1.0));o=bpy.context.active_object;o.name='Rock_A';o.scale=(1.7,1.25,.72);apply(o);smooth(o,rock);bev=o.modifiers.new('eroded bevel','BEVEL');bev.width=.08;bev.segments=2;return o
def main():
    a=args();out=Path(a.output).resolve();clear();make_fir().location.x=-5;make_broad().location.x=0;make_rock().location.x=5;out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True);print(f'AETHERWING biome props generated: {out}')
if __name__=='__main__':main()
