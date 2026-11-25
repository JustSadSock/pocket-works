import bpy,os,json
from pathlib import Path
out=json.loads(os.environ["ART_FORGE_OUTPUTS"]);params=json.loads(os.environ["ART_FORGE_PARAMETERS"]);inputs=json.loads(os.environ["ART_FORGE_INPUTS"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=inputs["asset-forge/"+params["kind"]+".glb"])
objs=[o for o in bpy.context.scene.objects if o.type=="MESH"]
if not objs:raise ValueError("No tree geometry")
# The source already has web-sized textures; bound geometry without flattening leaf cards.
for o in objs:
    if len(o.data.polygons)>40000:
        bpy.context.view_layer.objects.active=o;mod=o.modifiers.new("Reference LOD","DECIMATE");mod.ratio=40000/len(o.data.polygons);bpy.ops.object.modifier_apply(modifier=mod.name)
for img in bpy.data.images:
    if max(img.size)>512:
        ratio=512/max(img.size);img.scale(max(1,round(img.size[0]*ratio)),max(1,round(img.size[1]*ratio)))
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out["editable"],compress=False)
bpy.ops.export_scene.gltf(filepath=out["model"],export_format="GLB")
