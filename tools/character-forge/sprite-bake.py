"""One bounded matching sprite: native transparent PNG vs existing Art Forge bake.
No new publisher. Render an authored BLEND in disposable staging owner."""
import os,sys,json,shutil,subprocess,time
from pathlib import Path
from PIL import Image
root=Path.cwd();evidence=Path(os.environ["CHARACTER_EVIDENCE"]);src=evidence/"sprites-citizen";scratch=root/"apps/character-sprite-research-temp"
if scratch.exists():raise ValueError("Staging owner already exists")
try:
    source=scratch/"asset-forge";source.mkdir(parents=True)
    shutil.copyfile(src/"model.glb",source/"candidate.glb")
    metadata=json.loads((src/"metadata.json").read_text());f=metadata["frames"][0]
    script=source/"prepare.py"
    script.write_text("""import bpy,os,json,math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ['SPRITE_INPUT'])
s=bpy.context.scene
rig=next(o for o in s.objects if o.type=='ARMATURE')
action=next(a for a in bpy.data.actions if a.name=='walk')
rig.animation_data_clear();rig.animation_data_create();rig.animation_data.action=action
if len(action.slots)==1:rig.animation_data.action_slot=action.slots[0]
s.frame_set(int(action.frame_range[0]))
f=json.loads(os.environ['SPRITE_FRAME']);a=f['azimuth'];b=f['bounds']
# Core coordinates +Y up +Z forward => Blender +Z up -Y forward.
dir=Vector((math.sin(a),-math.cos(a),.3)).normalized()
right=Vector((0,0,1)).cross(dir).normalized()
up=dir.cross(right)
target=right*((b[0]+b[1])*.5)+up*((b[2]+b[3])*.5)
cam=bpy.data.objects.new('Matched orthographic',bpy.data.cameras.new('Matched'));s.collection.objects.link(cam);s.camera=cam
cam.location=target+dir*8;cam.rotation_euler=(-dir).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=128/f['pixelsPerMetre']
world=bpy.data.worlds.new('Neutral sky');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.38,.38,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;s.world=world
light=bpy.data.objects.new('Key',bpy.data.lights.new('Key','AREA'));s.collection.objects.link(light);light.location=(-3,-4,5);light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=500;light.data.shape='DISK';light.data.size=4
s.view_settings.view_transform='AgX';s.render.film_transparent=True
bpy.ops.wm.save_as_mainfile(filepath=os.environ['SPRITE_BLEND'],compress=False)
""")
    blend=source/"sprite.blend";env=dict(os.environ,SPRITE_INPUT=str(source/"candidate.glb"),SPRITE_BLEND=str(blend),SPRITE_FRAME=json.dumps(f));blender=os.environ["BLENDER"];t=time.perf_counter()
    p=subprocess.run([blender,"--background","--factory-startup","--disable-autoexec","--python-exit-code","1","--python",str(script)],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (evidence/"sprite-prepare.log").write_text(p.stdout)
    if p.returncode:raise ValueError("Sprite preparation failed")
    prep=(time.perf_counter()-t)*1000
    manifest={"version":2,"runtimeRoot":"public","index":"public/forge-index.json","jobs":[{"id":"matched-sprite","adapter":"bake","source":"asset-forge/sprite.blend","inputs":[],"seed":17,"parameters":{"width":128,"height":128,"frame":1,"samples":16},"outputs":{"image":"public/sprite.png"},"budget":{"maxBytes":1000000,"maxWidth":128,"maxHeight":128},"provenance":{"author":"Pocket Works","license":"original","origin":"Character Forge bounded sprite comparison"}}]}
    (source/"manifest.json").write_text(json.dumps(manifest,indent=2));t=time.perf_counter()
    for op in ("build","check"):
        p=subprocess.run([sys.executable,"tools/art-forge/forge.py",op,"--app",scratch.name,"--blender",blender],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(evidence/("sprite-forge-"+op+".log")).write_text(p.stdout)
        if p.returncode:raise ValueError("Sprite Art Forge "+op+" failed")
    ms=(time.perf_counter()-t)*1000
    for name,path in [("sprite-native.png",src/"0-0.png"),("sprite-blender.png",scratch/"public/sprite.png"),("sprite-source.blend",blend)]:shutil.copyfile(path,evidence/name)
    def measure(path):
        im=Image.open(path).convert("RGBA");a=im.getchannel("A");return {"bytes":path.stat().st_size,"alphaBounds":a.getbbox(),"opaquePixels":sum(1 for x in a.getdata() if x>0)}
    result={"native":measure(evidence/"sprite-native.png"),"artForge":measure(evidence/"sprite-blender.png"),"prepareMs":prep,"forgeBuildCheckMs":ms,"nativeSvgGenerationMsAllFrames":metadata["svgGenerationMs"],"nativeAtlasBytes":metadata["atlasBytes"],"limitations":"One matched 128px frame, lighting and raster pipeline differ. No atlas mass production or per-pixel artistic equivalence."}
    (evidence/"sprite-bake-comparison.json").write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:shutil.rmtree(scratch,ignore_errors=True)
