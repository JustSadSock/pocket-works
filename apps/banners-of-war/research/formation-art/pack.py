import json,os,math,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
out=Path(os.environ["BOW_ART_OUTPUT"]);source=json.loads((out/"frames.json").read_text());frames=source["frames"]
# Tight alpha bounds include weapon, 2 transparent pixels for sampling. No re-centering.
pages={};entries={};W=1024;H=1024
page=Image.new("RGBA",(W,H));x=y=row=0;idx=0
for name,record in frames.items():
    im=Image.open(out/(name+".png")).convert("RGBA")
    mask=Image.open(out/record.get("bodyMask",name+"-body.png")).convert("RGBA")
    box=im.getchannel("A").getbbox();body=mask.getchannel("A").getbbox()
    if not box or not body:raise ValueError("empty render "+name)
    l,t,r,b=box;l=max(0,l-2);t=max(0,t-2);r=min(im.width,r+2);b=min(im.height,b+2)
    crop=im.crop((l,t,r,b));cw,ch=crop.size
    if x+cw>W:x=0;y+=row;row=0
    if y+ch>H:
        page.save(out/f"page-{idx}.png",optimize=True);pages[str(idx)]={"width":W,"height":H};idx+=1;page=Image.new("RGBA",(W,H));x=y=row=0
    page.paste(crop,(x,y))
    parts=name.split("-")
    entries[":".join(parts)]={"page":idx,"rect":[x,y,cw,ch],"anchor":[record["anchor"][0]-l,record["anchor"][1]-t],"ppm":record["pixelsPerMetre"],"bodyHeight":body[3]-body[1],"bodyWorldHeight":record["bodyWorldHeight"],"alphaBounds":list(box),"weaponBounds":record["weaponBounds"]}
    x+=cw;row=max(row,ch)
page.save(out/f"page-{idx}.png",optimize=True);pages[str(idx)]={"width":W,"height":H}
# Pack page files per army style only (same epoch); source sizes and anchor remain explicit.
meta={"pages":pages,"entries":entries,"headings":8,"frames":[1,5,9,13,17,21,25,29,33,37],"elevation":60,"epoch":"western Europe c.1420–1470; unapproved"}
(out/"formation-atlas.json").write_text(json.dumps(meta))
font=ImageFont.truetype("DejaVuSans.ttf",18)
sheet=Image.new("RGB",(1120,520),"#b8b59a");d=ImageDraw.Draw(sheet)
d.text((24,18),"Actual visible body height (spear excluded from height, retained in sprite)",font=font,fill="#262a25")
for j,px in enumerate([8,16,24,32]):
    d.text((24+j*275,65),f"{px} px",font=font,fill="#262a25")
    for i,heading in enumerate([0,1,2,3,4,5,6,7]):
        name=f"0-{heading}-1";e=entries[f"0:{heading}:1"];im=Image.open(out/(name+".png")).convert("RGBA");box=e["alphaBounds"];scale=px/e["bodyHeight"];im=im.crop(box);im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS);sheet.paste(im,(25+j*275+(i%4)*60,115+(i//4)*75),im)
    for r in range(4):
        for c in range(7):
            name="0-0-1";e=entries["0:0:1"];im=Image.open(out/(name+".png")).convert("RGBA").crop(e["alphaBounds"]);s=px/e["bodyHeight"];im=im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))),Image.Resampling.LANCZOS);sheet.paste(im,(24+j*275+c*32,290+r*45),im)
sheet.save(out/"actual-height.png")
(out/"packing-metrics.json").write_text(json.dumps({"frames":len(entries),"sourcePixels":len(entries)*256**2,"croppedPixels":sum(e["rect"][2]*e["rect"][3] for e in entries.values()),"decodedPageBytes":len(pages)*W*H*4,"pngBytes":sum((out/f"page-{i}.png").stat().st_size for i in range(len(pages)))},indent=2))
