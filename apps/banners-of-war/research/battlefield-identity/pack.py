import json,os,math
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["BOW_ART_OUTPUT"]);meta=json.loads((out/"formation-atlas.json").read_text())
# Keep accepted spear pages unchanged. Namespaced keys and additional compact pages per troop.
extended=os.environ.get("BOW_MOTION_REV")=="1"
if extended:
    meta["entries"]={};meta["pages"]={};idx=0
else:
    meta["entries"]={"spear:"+k:v for k,v in meta["entries"].items()};idx=max(map(int,meta["pages"]))+1
for kind in (["spear"] if extended else [])+["sword","archer","knight","lightHorse"]:
    frames=json.loads((out/kind/"frames.json").read_text())["frames"];page=Image.new("RGBA",(1024,1024));x=y=row=0
    def flush():
        global idx,page,x,y,row
        used=max(32,math.ceil((y+row)/32)*32);page.crop((0,0,1024,used)).save(out/f"page-{idx}.png",optimize=True);meta["pages"][str(idx)]={"width":1024,"height":used,"type":kind};idx+=1;page=Image.new("RGBA",(1024,1024));x=y=row=0
    for name,e in frames.items():
        im=Image.open(out/kind/(name+".png")).convert("RGBA");box=im.getchannel("A").getbbox()
        if not box or min(box[0],box[1],im.width-box[2],im.height-box[3])<2:raise ValueError("Clipped or empty "+kind+" "+name+" "+str(box))
        factor=.5;im=im.resize((im.width//2,im.height//2),Image.Resampling.LANCZOS);l,t,r,b=im.getchannel("A").getbbox();l=max(0,l-2);t=max(0,t-2);r=min(im.width,r+2);b=min(im.height,b+2);crop=im.crop((l,t,r,b));cw,ch=crop.size
        if x+cw>1024:x=0;y+=row;row=0
        if y+ch>1024:flush()
        page.paste(crop,(x,y))
        meta["entries"][kind+":"+name.replace("-",":")]={"page":idx,"rect":[x,y,cw,ch],"anchor":[e["anchor"][0]*factor-l,e["anchor"][1]*factor-t],"ppm":e["pixelsPerMetre"]*factor,"weaponForwardMetres":e["weaponForwardMetres"]}
        x+=cw;row=max(row,ch)
    flush()
(out/"mixed-atlas.json").write_text(json.dumps(meta))
sheet=Image.new("RGB",(1250,480),"#a3a88d");d=ImageDraw.Draw(sheet)
for i,k in enumerate(["spear","sword","archer","knight","lightHorse"]):
    d.text((i*250+12,12),k,fill="#222")
    for j,h in enumerate([0,2,4]):
        e=meta["entries"][f"{k}:0:{h}:1"];p=Image.open(out/f"page-{e['page']}.png");x,y,w,h=e["rect"];im=p.crop((x,y,x+w,y+h));s=30/e["ppm"];im=im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.Resampling.LANCZOS);sheet.paste(im,(i*250+50,40+j*140),im)
sheet.save(out/"mixed-lineup.png")
(out/"mixed-atlas-metrics.json").write_text(json.dumps({"frames":len(meta["entries"]),"decodedBytes":sum(p["width"]*p["height"]*4 for p in meta["pages"].values()),"pngBytes":sum((out/f"page-{i}.png").stat().st_size for i in meta["pages"])}))
