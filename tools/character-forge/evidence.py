"""Convert generated SVG originals into PNG boards and short motion clips, no substitutions."""
import os,subprocess,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(os.environ["CHARACTER_EVIDENCE"])
def png(p):
    q=p.with_suffix(".png")
    subprocess.run(["rsvg-convert",str(p),"-o",str(q)],check=True);return q
names=["swordsman","legionary","citizen","rider","elephant","dog","bird"]
styles=["simplified","miniature","realistic"]
font=ImageFont.truetype("DejaVuSans.ttf",24)
for name in names:
    board=Image.new("RGB",(1536,560),"#dedbd0");d=ImageDraw.Draw(board)
    for j,style in enumerate(styles):
        p=png(root/(name+"-"+style)/"preview.svg")
        im=Image.open(p).convert("RGB");im.thumbnail((512,512));board.paste(im,(j*512,42));d.text((j*512+12,12),style,font=font,fill="#34372f")
    board.save(root/(name+"-profiles.png"))
for p in root.glob("variant-*.svg"):png(p)
for name in ("citizen","rider","elephant"):
    folder=root/(name+"-motion")
    for p in sorted(folder.glob("frame-*.svg")):png(p)
    subprocess.run(["ffmpeg","-y","-v","error","-framerate","14.285714","-i",str(folder/"frame-%02d.png"),"-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(root/(name+"-walk.mp4"))],check=True)
