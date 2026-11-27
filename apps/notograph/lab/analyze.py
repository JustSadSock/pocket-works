#!/usr/bin/env python3
"""Local-only companion for Notograph. Real Demucs inference and Basic Pitch note events."""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

def wav_info(path):
    with wave.open(str(path), "rb") as f:
        return f.getnframes() / f.getframerate()

def normalized_notes(events, duration):
    result = []
    for start, end, pitch, amplitude, *_ in events:
        start, end, amplitude = map(float, (start, end, amplitude))
        pitch = int(pitch)
        if not all(map(math.isfinite, (start, end, amplitude))):
            continue
        start, end = max(0., start), min(duration, end)
        if 21 <= pitch <= 108 and start < end:
            result.append(dict(start=round(start, 6), end=round(end, 6),
                               pitch=pitch, confidence=round(max(0., min(1., amplitude)), 5)))
    return sorted((n for n in result if n["start"] < n["end"]), key=lambda n: (n["start"], n["pitch"]))

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("audio", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--model", choices=("htdemucs", "htdemucs_6s"), default="htdemucs")
    p.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    p.add_argument("--mix-only", action="store_true")
    args = p.parse_args()
    source = args.audio.resolve(strict=True)
    output = args.output.resolve()
    if output.exists():
        raise SystemExit("Output directory already exists; choose a new directory.")
    if source.stat().st_size > 60 * 1024 * 1024:
        raise SystemExit("Input exceeds 60 MB.")
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    with tempfile.TemporaryDirectory(prefix="notograph-") as temp:
        root = Path(temp)
        mix = root / "input.wav"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-vn",
                        "-ac", "2", "-ar", "44100", "-t", "180.1", "-c:a", "pcm_s16le", str(mix)], check=True)
        duration = wav_info(mix)
        if not 0 < duration <= 180:
            raise SystemExit("Input must be 0–180 seconds.")
        if args.mix_only:
            stems = {"mix": mix}
        else:
            subprocess.run([sys.executable, "-m", "demucs", "-n", args.model, "-d", args.device,
                            "--shifts", "0", "-o", str(root / "separated"), str(mix)], check=True)
            expected = ["vocals", "bass", "drums", "other"] + (["guitar", "piano"] if args.model.endswith("_6s") else [])
            stems = {s: root / "separated" / args.model / "input" / (s + ".wav") for s in expected}
        stage = root / "complete"
        stage.mkdir()
        records = []
        for stem, file in stems.items():
            if not file.is_file():
                raise RuntimeError("Missing model output: " + stem)
            target = stage / (stem + ".wav")
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(file),
                            "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", str(target)], check=True)
            if abs(wav_info(target) - duration) > .1:
                raise RuntimeError("Stem duration mismatch: " + stem)
            print("Transcribing " + stem, flush=True)
            notes = [] if stem == "drums" else normalized_notes(
                predict(target, model_or_model_path=ICASSP_2022_MODEL_PATH)[2], duration)
            records.append(dict(id=stem, file=target.name, sha256=hashlib.sha256(target.read_bytes()).hexdigest(), notes=notes))
        metadata = dict(schema="notograph-analysis-v1", title=source.stem[:100], duration=duration,
                        model="mix-only" if args.mix_only else args.model,
                        engines={"basic-pitch": importlib.metadata.version("basic-pitch"),
                                 "demucs": None if args.mix_only else importlib.metadata.version("demucs")},
                        stems=records)
        if not any(s["notes"] for s in records):
            raise RuntimeError("No tonal notes detected.")
        (stage / "notograph.json").write_text(json.dumps(metadata, ensure_ascii=False, allow_nan=False, indent=2), encoding="utf-8")
        import shutil
        shutil.copytree(stage, output)
        print("Import notograph.json and optional WAV files from", output)

if __name__ == "__main__":
    main()
