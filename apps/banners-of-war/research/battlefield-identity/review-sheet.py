"""Generate original-frame review sheets. No drawn or invented models, no atlas changes."""
import os,json,math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
out=Path(os.environ["BOW_ART_OUTPUT"])
meta=json.loads((out/"mixed-atlas.json").read_text())
types=["spear","sword","archer","knight","lightHorse"];frames=[1,5,9,13,17,21,25,29,33,37]
pages={};font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",15)
def sprite(key):
    e=meta["entries"][key];p=e["page"]
    if p not in pages:pages[p]=Image.open(out/f"page-{p}.png").convert("RGBA")
    x,y,w,h=e["rect"];im=pages[p].crop((x,y,x+w,y+h));return im,e
def sheet(name,headings,poses,scale):
    # fixed 6.5m x 5m projected camera footprint and fixed ground anchor
    W,H=round(6.5*scale),round(5*scale);top=32;rows=len(headings)*len(poses)
    im=Image.new("RGB",(W*len(types),top+(H+top)*rows),"#a5aa90");d=ImageDraw.Draw(im)
    metrics=[]
    for x,k in enumerate(types):
        d.text((x*W+10,8),k,font=font,fill="#1c241b")
        for row,(h,f) in enumerate((h,f) for h in headings for f in poses):
            a,e=sprite(f"{k}:0:{h}:{f}");s=scale/e["ppm"];anchor=e["anchor"];box=a.getchannel("A").getbbox()
            if not box:raise ValueError("Empty "+k)
            nw,nh=max(1,round(a.width*s)),max(1,round(a.height*s));a=a.resize((nw,nh),Image.Resampling.LANCZOS)
            y=top+row*(H+top);ox=x*W+W//2;oy=y+round(H*.72);px=round(ox-anchor[0]*s);py=round(oy-anchor[1]*s)
            if px<x*W or px+nw>(x+1)*W or py<y or py+nh>y+H:raise ValueError("Review viewport insufficient "+k)
            d.line((x*W+5,oy,(x+1)*W-5,oy),fill="#68745c",width=1)
            im.paste(a,(px,py),a);d.text((x*W+8,y+H+4),f"heading {h*45}°  pose {f}",font=font,fill="#283226")
            metrics.append({"type":k,"heading":h,"pose":f,"sourcePPM":e["ppm"],"projectedAlphaHeightM":(box[3]-box[1])/e["ppm"],"projectedAlphaWidthM":(box[2]-box[0])/e["ppm"],"groundAnchor":anchor,"weaponForwardMetres":e.get("weaponForwardMetres")})
    im.save(out/name);return metrics
rows=sheet("same-scale-miniatures.png",[0,2,4,6],[1],45)
motion=sheet("same-scale-motion.png",[2],frames,38)
(out/"miniature-review-metrics.json").write_text(json.dumps({"units":"projected metres, not anatomical height","sameScale":rows,"motion":motion},indent=2))
