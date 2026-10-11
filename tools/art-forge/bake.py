"""Fixed Blender render adapter. Never executes project text blocks/drivers."""
import json
import os
import bpy

params = json.loads(os.environ["ART_FORGE_PARAMETERS"])
outputs = json.loads(os.environ["ART_FORGE_OUTPUTS"])
scene = bpy.context.scene
for image in bpy.data.images:
    if image.source == "FILE" and not image.packed_file:
        raise ValueError("Bake sources must pack textures; external image reads forbidden")
for font in bpy.data.fonts:
    if font.filepath not in {"", "<builtin>"} and not font.packed_file:
        raise ValueError("Bake sources must pack external fonts")
if not scene.camera:
    raise ValueError("Baking needs an authored camera in the BLEND source")
for key in ("width", "height"):
    value = params.get(key, 512)
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 4096:
        raise ValueError("Invalid bake resolution")
    setattr(scene.render, "resolution_x" if key == "width" else "resolution_y", value)
samples = params.get("samples", 32)
frame = params.get("frame", 1)
if not isinstance(samples, int) or not 1 <= samples <= 256 or not isinstance(frame, int) or not 0 <= frame <= 100000:
    raise ValueError("Invalid bake samples/frame")
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = samples
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.frame_set(frame)
scene.render.filepath = outputs["image"]
bpy.ops.render.render(write_still=True)
