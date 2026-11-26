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
