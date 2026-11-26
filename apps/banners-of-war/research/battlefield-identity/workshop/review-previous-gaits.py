"""Review the preserved Workshop IV gait evidence; never invent missing frames."""
import json,os,math
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
root=Path("/tmp/previous-gaits")
report={}
for kind,sub in (("author","march"),("cmu","retarget-march")):
    files=[p for p in root.rglob("anatomy-audit.json") if sub in json.loads(p.read_text()).get("samples",{})]
    if len(files)!=1:raise ValueError("Missing unique previous audit "+kind)
    p=files[0];d=json.loads(p.read_text());rows=d["samples"][sub];samples=[]
    for j in range(2):
        diffs=[];prev=None
        for row in rows:
            st=row["stance"][j]
            curr=(st.get("rootRelativeY",0)+st.get("rootTravelY",0),st["support"])
            if prev and curr[1] and prev[1]:diffs.append(abs(curr[0]-prev[0]))
            prev=curr
        samples.append({"maxConsecutiveSupportSlipMetres":max(diffs,default=None),"sumSupportSlipMetres":sum(diffs),"supportSamples":sum(r["stance"][j]["support"] for r in rows),"maxSoleOffset":max((abs(r["stance"][j].get("afterSoleOffset",0)) for r in rows if r["stance"][j]["support"]),default=None)})
    frames={view:sorted(p.parent.glob(sub+"-??-"+view+".png")) for view in ("front","side")}
    report[kind]={"artifact":15109641527 if kind=="author" else 15107240174,"rows":len(rows),"frames":{v:len(f) for v,f in frames.items()},"feet":samples,"gaitOnly":d.get("gaitOnlyDueToEquipmentRejection"),"artisticApproval":False}
    for view,fs in frames.items():
        if not fs:continue
        canvas=Image.new("RGB",(1200,720),"#d8d6cd");draw=ImageDraw.Draw(canvas);draw.text((10,10),kind+" "+view+" — original Workshop IV; available frames "+str(len(fs)),fill="black")
        for i,f in enumerate(fs[::max(1,len(fs)//6)][:6]):
            im=Image.open(f).convert("RGBA");im.thumbnail((390,320));bg=Image.new("RGBA",im.size,"#9ba397");bg.alpha_composite(im);canvas.paste(bg.convert("RGB"),((i%3)*400,(i//3)*340+35))
        canvas.save(out/(kind+"-"+view+".png"))
(out/"previous-gait-review.json").write_text(json.dumps(report,indent=2))
