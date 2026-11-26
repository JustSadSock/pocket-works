"""Render only the static v6 recovery candidate and v4 reference.
No variations, armor, animation atlases or artistic approval by CI."""
import os,json,subprocess,time
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(os.environ["CHARACTER_EVIDENCE"]);start=time.perf_counter()
names=["v6-control-v4","v6-citizen"]
for n in names:subprocess.run(["rsvg-convert",str(out/(n+".svg")),"-o",str(out/(n+".png"))],check=True)
imgs=[Image.open(out/(n+".png")).convert("RGB") for n in names]
board=Image.new("RGB",(1920,1000),"#dedbd0");d=ImageDraw.Draw(board)
for i,(n,im) in enumerate(zip(names,imgs)):
    board.paste(im,(960*i,40));d.text((960*i+20,12),n,fill="#30342d")
board.save(out/"v6-static-comparison.png")
# Same static image; crops are not new camera angles. Preserve the full original.
im=imgs[1];w,h=im.size
for name,rect in {"shoulders":(.24,.17,.76,.48),"waist":(.24,.37,.78,.64),"sleeves":(.15,.22,.85,.59),"boots":(.30,.68,.72,.98)}.items():
    im.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(rect))).save(out/("v6-close-"+name+".png"))
(out/"v6-raster.json").write_text(json.dumps({"rasterAndCompositionMs":(time.perf_counter()-start)*1000,"renderCount":2,"gate":"pending-human-review"},indent=2))

# A/B/C images are original native depth-raster outputs, not re-rendered
# illustrations. Crop the matching camera and compose exact-size swatches.
if (out/"v7-A-front.png").exists():
    size=896
    panel=Image.new("RGB",(size*3,size*4+100),"#dedbd0");draw=ImageDraw.Draw(panel)
    for j,label in enumerate("ABC"):
        draw.text((j*size+20,8),label,fill="#30342d")
        for i,view in enumerate(("front","side","back","three-quarter")):
            im=Image.open(out/("v7-"+label+"-"+view+".png")).convert("RGB")
            panel.paste(im,(j*size,25+i*(size+18)))
            for name,rect in {"neck":(.35,.12,.65,.34),"waist":(.29,.33,.74,.60),"sleeves":(.10,.20,.90,.55),"boots":(.26,.69,.80,.97),"hair":(.35,.03,.65,.24)}.items():
                if view=="three-quarter":
                    im.crop(tuple(round(x*size) for x in rect)).save(out/("v7-"+label+"-close-"+name+".png"))
    panel.save(out/"v7-comparison.png")
    strip=Image.new("RGB",(760,470),"#b0b3a1");d=ImageDraw.Draw(strip);metrics=[]
    for i,label in enumerate("ABC"):
        d.text((12,20+i*150+65),label,fill="#30342d")
        for j,px in enumerate((18,32,64,128)):
            x=(100,190,310,470)[j]
            if i==0:d.text((x,3),str(px)+" px",fill="#30342d")
            im=Image.open(out/("v7-"+label+"-sprite.png")).convert("RGBA").resize((px,px),Image.Resampling.LANCZOS)
            strip.paste(im,(x,20+i*150+(128-px)//2),im)
            im.save(out/("v7-"+label+"-"+str(px)+"px.png"))
            alpha=im.getchannel("A");metrics.append({"candidate":label,"size":px,"alphaBounds":alpha.getbbox(),"opaquePixels":sum(v>127 for v in alpha.getdata())})
    strip.save(out/"v7-actual-size.png")
    (out/"v7-readability.json").write_text(json.dumps(metrics,indent=2))
