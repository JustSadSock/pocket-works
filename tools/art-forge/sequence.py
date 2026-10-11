"""Bounded editable PNG sequences and real animated BLEND → atlas/clip."""
import json
import math
import os
from pathlib import Path
import re
import tempfile
from PIL import Image
from forge import command, json_write, positive


def metadata(durations, identity, events, loop):
    if not isinstance(identity, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}", identity) or not isinstance(loop, bool):
        raise ValueError("Invalid animation id/loop")
    duration = sum(durations)
    if not math.isfinite(duration) or not .001 <= duration <= 600 or (loop and duration < 1/24):
        raise ValueError("Invalid animation duration")
    previous = -1
    if not isinstance(events, list) or len(events) > 256:
        raise ValueError("Invalid events")
    for event in events:
        at = event.get("time")
        if not isinstance(at, (int, float)) or isinstance(at, bool) or not math.isfinite(at) or not 0 <= at <= duration or at < previous or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}", event.get("name", "")):
            raise ValueError("Invalid ordered contact event")
        previous = at
    return duration


def pack(paths, durations, outputs, identity, events, loop):
    duration = metadata(durations, identity, events, loop)
    size = None
    for path in paths:
        with Image.open(path) as im:
            if im.format != "PNG" or max(im.size) > 2048:
                raise ValueError("Frames must be bounded PNG")
            size = size or im.size
            if im.size != size:
                raise ValueError("Frames need consistent canvas/pivot")
    columns = min(len(paths), max(1, 4096 // size[0]))
    rows = math.ceil(len(paths) / columns)
    if rows * size[1] > 4096:
        raise ValueError("Animation atlas exceeds 4096px")
    atlas = Image.new("RGBA", (columns * size[0], rows * size[1]))
    records = []
    for i, (path, dt) in enumerate(zip(paths, durations)):
        x, y = i % columns * size[0], i // columns * size[1]
        with Image.open(path) as im:
            atlas.paste(im.convert("RGBA"), (x, y))
        records.append({"rect": [x, y, *size], "duration": dt})
    atlas.save(outputs["image"])
    image_url = Path(os.path.relpath(outputs["image"], outputs["clip"].parent)).as_posix()
    json_write(outputs["clip"], {"version": 1, "id": identity, "duration": duration, "loop": loop,
                                "events": events, "image": image_url,
                                "tracks": [{"id": "pose", "type": "frames", "frames": records}]})


def export_frames(source, inputs, outputs):
    data = json.loads(source.read_text())
    if set(data) - {"version", "id", "loop", "frames", "events"} or data.get("version") != 1:
        raise ValueError("Invalid frame sequence source")
    frames = data.get("frames")
    if not isinstance(frames, list) or not 1 <= len(frames) <= 128:
        raise ValueError("Expected 1–128 frames")
    durations, paths = [], []
    for frame in frames:
        dt = frame.get("duration")
        if frame.get("input") not in inputs or not isinstance(dt, (float, int)) or isinstance(dt, bool) or not math.isfinite(dt) or not .001 <= dt <= 600:
            raise ValueError("Frames require declared inputs and positive durations")
        paths.append(inputs[frame["input"]]);durations.append(dt)
    pack(paths, durations, outputs, data.get("id"), data.get("events", []), data.get("loop", False))


def export_bake(source, outputs, params, executable):
    start, end, step, fps = (params.get(k, d) for k, d in (("start", 1), ("end", 24), ("step", 1), ("fps", 24)))
    for key, value in (("start", start), ("end", end), ("step", step), ("fps", fps)):
        positive(value, 240 if key == "fps" else 100000, key)
    frames = list(range(start, end + 1, step))
    if not 1 <= len(frames) <= 128:
        raise ValueError("Bake sequence needs 1–128 frames")
    width = positive(params.get("width", 512), 2048, "bake width")
    height = positive(params.get("height", 512), 2048, "bake height")
    positive(params.get("samples", 32), 256, "bake samples")
    columns = min(len(frames), 4096 // width)
    if math.ceil(len(frames) / columns) * height > 4096:
        raise ValueError("Bake atlas exceeds 4096px")
    metadata([step / fps] * len(frames), params.get("id", "Baked"), params.get("events", []), params.get("loop", False))
    with tempfile.TemporaryDirectory(prefix="animation-bake-", dir=outputs["image"].parent) as directory:
        env = dict(os.environ, ART_FORGE_PARAMETERS=json.dumps(params), ANIMATION_FRAMES=json.dumps(frames), ANIMATION_DIRECTORY=directory)
        command([executable, "--background", "--disable-autoexec", source, "--python-exit-code", "1",
                 "--python", Path(__file__).with_name("bake_sequence.py")], env, 600)
        paths = [Path(directory) / f"{frame:06d}.png" for frame in frames]
        pack(paths, [step / fps] * len(frames), outputs, params.get("id", "Baked"), params.get("events", []), params.get("loop", False))
