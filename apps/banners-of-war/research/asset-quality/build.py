import os,sys,json,shutil,hashlib,urllib.request,subprocess,time,math
from pathlib import Path
from PIL import Image,ImageFilter,ImageEnhance,ImageOps,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[4]; here=Path(__file__).resolve().parent
work=Path(os.environ["BOW_ART_WORK"]);work.mkdir(parents=True,exist_ok=True)
out=Path(os.environ["BOW_ART_OUTPUT"]);out.mkdir(parents=True,exist_ok=True)
src=work/"asset-forge/source.glb";src.parent.mkdir(parents=True,exist_ok=True)
url="https://vibeassets.io/download/bgvqztpyki"
req=urllib.request.Request(url,headers={"User-Agent":"PocketWorks asset review/1.0"})
with urllib.request.urlopen(req,timeout=90) as r:
    raw=r.read(24*1024*1024+1)
if raw[:4]!=b"glTF" or len(raw)>24*1024*1024:raise RuntimeError("Invalid or oversized CC0 model response")
src.write_bytes(raw)
source_hash=hashlib.sha256(raw).hexdigest()
(out/"source-provenance.json").write_text(json.dumps({"source":url,"page":"https://vibeassets.io/a/bgvqztpyki","license":"CC0 (publisher declaration)","sha256":source_hash,"bytes":len(raw),"historicalScope":"15th-century western European infantry interpretation; not historical approval"},indent=2))
shutil.copyfile(here/"author.py",work/"asset-forge/author.py")
sys.path.insert(0,str(root/"tools/art-forge"))
from forge import build,capabilities
manifest={"version":2,"runtimeRoot":"public","index":"public/forge-index.json","jobs":[{"id":"spearman-reference","adapter":"blender","source":"asset-forge/author.py","inputs":["asset-forge/source.glb"],"dependsOn":[],"seed":17,"parameters":{},"outputs":{"editable":"asset-forge/generated/spearman.blend","model":"public/spearman.glb"},"budget":{"maxBytes":25000000,"maxTriangles":140000,"maxTextureSize":4096},"provenance":{"author":"Vibeassets CC0 contributor; Pocket Works equipment/pose adaptations","license":"CC0 source; original adaptations","origin":url+" sha256:"+source_hash},"validation":{"requireArmature":True,"requireAnimation":True}}]}
start=time.monotonic()
outputs,_=build(work,manifest,capabilities({"blender":os.environ["BLENDER"]}),trusted=True)
bake_start=time.monotonic()
subprocess.run([os.environ["BLENDER"],"--background","--disable-autoexec",str(work/"asset-forge/generated/spearman.blend"),"--python-exit-code","1","--python",str(here/"render.py")],check=True,timeout=1200)
# Painterly C uses actual volume render, preserves alpha and anchor. Palette segmentation and
# brush-scale local contrast replace smooth shading; not a fabricated extra mesh.
def painter(im):
    alpha=im.getchannel("A");rgb=im.convert("RGB");sm=rgb.filter(ImageFilter.MedianFilter(3));q=sm.quantize(colors=48).convert("RGB")
    mixed=Image.blend(q,ImageEnhance.Contrast(sm).enhance(1.22),.35);mixed=ImageEnhance.Color(mixed).enhance(.83)
    mixed.putalpha(alpha);return mixed
for path in list(out.glob("A-*.png"))+[out/"hero-A.png"]:
    name=path.name.replace("A-","C-",1) if path.name.startswith("A-") else "hero-C.png"
    painter(Image.open(path).convert("RGBA")).save(out/name)
# Two directions only, explicit finite reference atlas, A/B/C selectable. A/C motion; B 3 reference poses.
for style in "ABC":
    frames=[1,5,9,13,17,21,25,29,33,37] if style!="B" else [1,21,29]
    cell=96;atlas=Image.new("RGBA",(cell*len(frames),cell*4))
    entries={}
    for side in [0,1]:
        for heading in [0,2]:
            row=side*2+heading//2
            for i,f in enumerate(frames):
                im=Image.open(out/f"{style}-{side}-{heading}-{f}.png").convert("RGBA")
                atlas.paste(im.resize((cell,cell),Image.Resampling.LANCZOS),(i*cell,row*cell))
                entries[f"{side}:{heading}:{f}"]=[i*cell,row*cell,cell,cell]
    atlas.save(out/f"atlas-{style}.png",optimize=True)
    (out/f"atlas-{style}.json").write_text(json.dumps({"cell":cell,"frames":frames,"entries":entries,"ground":[48,48+96*.65*math.cos(math.pi/3)/3.5],"metres":3.5,"style":style}))
font=ImageFont.truetype("DejaVuSans.ttf",17)
sheet=Image.new("RGB",(1200,820),"#c9c4aa");d=ImageDraw.Draw(sheet)
for i,s in enumerate("ABC"):
    x=i*400;d.text((x+18,18),s+" · "+["Material realism","Silhouette","Painterly"][i],font=font,fill="#282b27")
    hero=Image.open(out/f"hero-{s}.png").convert("RGBA");hero.thumbnail((380,380));sheet.paste(hero,(x+10,50),hero)
    im=Image.open(out/f"{s}-0-0-1.png").convert("RGBA")
    for j,px in enumerate([16,32,64]):
        sprite=im.resize((px,px),Image.Resampling.LANCZOS)
        d.text((x+20+j*125,460),str(px)+" px",font=font,fill="#282b27")
        sheet.paste(sprite,(x+20+j*125,490),sprite)
        for row in range(3):
            for col in range(6):
                p=(x+15+col*55,595+row*60);sprite=im.resize((48,48),Image.Resampling.LANCZOS);sheet.paste(sprite,p,sprite)
sheet.save(out/"three-directions.png")
shutil.copyfile(work/"public/forge-index.json",out/"forge-index.json")
shutil.copyfile(work/"public/spearman.glb",out/"spearman.glb")
shutil.copyfile(work/"asset-forge/generated/spearman.blend",out/"spearman.blend")
(out/"build-metrics.json").write_text(json.dumps({"forgeSeconds":bake_start-start,"bakeAndPackSeconds":time.monotonic()-bake_start,"atlasFiles":[{"style":s,"bytes":(out/f"atlas-{s}.png").stat().st_size,"decodedBytes":96*96*4*4*(3 if s=="B" else 10)} for s in "ABC"]},indent=2))
