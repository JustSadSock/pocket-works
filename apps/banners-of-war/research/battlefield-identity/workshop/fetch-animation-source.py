"""Pinned CC0 motion archive, no external generator."""
import os,json,hashlib,zipfile,urllib.request,io
from pathlib import Path
url="https://github.com/Kinemiq/free-game-animations/releases/download/v1.0/KinemIQ_Free_Animations_CC0_GLB.zip"
sha="64ca5ab4a92c9da079c5e88ca509391b0a58a24ccf2a1307b16e2f0fc6b23ffc"
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
dest=Path("/tmp/bow-kinemiq");dest.mkdir(exist_ok=True)
with urllib.request.urlopen(url,timeout=60) as r:raw=r.read(3000000)
if hashlib.sha256(raw).hexdigest()!=sha:raise ValueError("Motion library hash mismatch")
records=[]
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    for p in z.infolist():
        if p.is_dir():continue
        name=Path(p.filename)
        if name.is_absolute() or ".." in name.parts or p.file_size>25000000:raise ValueError("Unsafe motion member")
        if name.suffix.lower() not in (".glb",".txt",".md"):continue
        data=z.read(p);target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        records.append({"path":str(name),"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)})
(out/"source-library.json").write_text(json.dumps({"url":url,"sha256":sha,"license":"CC0-1.0","authors":["Quaternius","KinemIQ"],"licenseEvidence":"https://github.com/Kinemiq/free-game-animations/blob/main/README.md","files":records},indent=2))
