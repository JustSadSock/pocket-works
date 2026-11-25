import bpy,os,json
out=json.loads(os.environ["ART_FORGE_OUTPUTS"]);inputs=json.loads(os.environ["ART_FORGE_INPUTS"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=inputs["asset-forge/horse.glb"])
for img in bpy.data.images:
    if max(img.size)>1024:
        r=1024/max(img.size);img.scale(max(1,round(img.size[0]*r)),max(1,round(img.size[1]*r)))
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out["editable"],compress=False)
bpy.ops.export_scene.gltf(filepath=out["model"],export_format="GLB",export_animations=True)
