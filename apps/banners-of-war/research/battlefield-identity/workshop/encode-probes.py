"""Native source frame review: normal/half speed, six views, synchronized mosaic.
Never interpolate or manufacture missing frames; retain original diagnostic files."""
import json,os,subprocess,tempfile,hashlib,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(os.environ["BOW_ART_OUTPUT"]);root.mkdir(parents=True,exist_ok=True)
role=os.environ["BOW_WORKSHOP_JOB"]
views=("front","back","side","top","angle45","game")
folder=root/({"sword":"sword/anatomy","archer":"archer/archer-anatomy","retarget":"sword/retarget"}[role])
folder.mkdir(parents=True,exist_ok=True)
auditPath=folder/("archer-audit.json" if role=="archer" else "anatomy-audit.json")
audit=json.loads(auditPath.read_text()) if auditPath.is_file() else {}
font=ImageFont.truetype("DejaVuSans.ttf",26);small=ImageFont.truetype("DejaVuSans.ttf",19)
def flatten(p,size=None):
    with Image.open(p) as src:
        im=src.convert("RGBA");bg=Image.new("RGBA",im.size,(153,160,145,255));bg.alpha_composite(im);im=bg.convert("RGB")
        if size:im.thumbnail(size,Image.Resampling.LANCZOS)
        return im
# Diagnostic plots from the actual evaluated joints/object trajectories.
# They are separate from artistic frames and explicitly labeled as data.
def trajectories(motion,rows):
    if not rows:return
    tracks={}
    for i,r in enumerate(rows):
        for key,j in r.get("joints",{}).items():tracks.setdefault(key,[]).append(j["worldHead"])
        for key in ("bladeTip","bowGrip","arrowRest","stringNock","arrowTip","jawAnchor","topTip","bottomTip"):
            if key in r:tracks.setdefault(key,[]).append(r[key])
        if "shield" in r:tracks.setdefault("shield center",[]).append(r["shield"]["boardCenter"])
    if not tracks:return
    im=Image.new("RGB",(1920,1080),"#e9e7df");d=ImageDraw.Draw(im)
    d.text((40,30),motion+" — evaluated 3D trajectories, metres (not an artistic rendering)",font=font,fill="#252a29")
    colors=["#8f4439","#245d74","#567044","#8b673e","#613c72","#32655f"]
    selected=[(k,v) for k,v in tracks.items() if any(s in k.lower() for s in ("hand","arm","foot","hips","head","tip","shield","nock","grip","anchor","rest"))]
    if not selected:selected=list(tracks.items())
    for q,(a,b,label) in enumerate(((0,2,"front X/Z"),(1,2,"side Y/Z"),(0,1,"top X/Y"))):
        x=30+q*640;y=100;W=600;H=680;allp=[p for _,v in selected for p in v];mn=[min(p[a] for p in allp),min(p[b] for p in allp)];mx=[max(p[a] for p in allp),max(p[b] for p in allp)]
        scale=min((W-90)/max(.1,mx[0]-mn[0]),(H-90)/max(.1,mx[1]-mn[1]))
        def project(p):return (x+45+(p[a]-mn[0])*scale,y+H-45-(p[b]-mn[1])*scale)
        d.rectangle((x,y,x+W,y+H),outline="#a1a49c");d.text((x+15,y+12),label,font=small,fill="#333b35")
        for k,(name,pts) in enumerate(selected):
            col=colors[k%len(colors)];pp=[project(p) for p in pts]
            if len(pp)>1:d.line(pp,fill=col,width=3)
            for j,(u,v) in enumerate(pp):
                r=4 if j==0 else 2;d.ellipse((u-r,v-r,u+r,v+r),fill=col)
        d.line((x+W-120,y+H-20,x+W-120+scale*.1,y+H-20),fill="#222222",width=3)
        d.text((x+W-120,y+H-42),"0.1 m",font=small,fill="#333b35")
    for k,(name,_) in enumerate(selected[:27]):
        x=40+(k//9)*620;y=810+(k%9)*26;d.rectangle((x,y+4,x+13,y+17),fill=colors[k%len(colors)]);d.text((x+20,y),name[:52],font=small,fill="#333b35")
    im.save(folder/(motion+"-trajectories.png"))
for motion,rows in audit.get("samples",{}).items():
    trajectories(motion,rows)
    contacts=[r.get("stance",[]) for r in rows]
    if not any(contacts):continue
    im=Image.new("RGB",(1920,1080),"#e9e7df");dr=ImageDraw.Draw(im)
    dr.text((40,25),motion+" — measured boot sole height relative to calibrated ground (cm)",font=font,fill="#252a29")
    for j in range(2):
        x0=100;y0=260+j*430;w=1680;scale=35
        dr.text((x0,y0-160),("Right" if j==0 else "Left")+" boot — dark: before / blue: after; shaded: support",font=font,fill="#303931")
        dr.line((x0,y0,x0+w,y0),fill="#333333",width=2)
        for i,c in enumerate(contacts):
            if len(c)<=j or "afterSoleOffset" not in c[j]:continue
            row=c[j];x=x0+i*w/max(1,len(rows)-1)
            if row["support"]:dr.rectangle((x-8,y0-120,x+8,y0+120),fill="#d4dccb")
            for key,color in (("beforeSoleOffset","#9d5548"),("afterSoleOffset","#245d74")):
                v=row[key]*100;y=y0-max(-110,min(110,v*scale));dr.ellipse((x-5,y-5,x+5,y+5),fill=color)
            dr.text((x-10,y0+130),str(i),font=small,fill="#343c36")
    im.save(folder/(motion+"-boot-contact.png"))
# Actual original key poses with labels and no fabricated imagery.
for motion in audit.get("samples",{}):
    groups={}
    for p in sorted(folder.glob("key-"+motion+"-*.png")):
        phase=p.stem.rsplit("-",1)[0];groups.setdefault(phase,[]).append(p)
    if not groups:continue
    for phase,ps in groups.items():
        board=Image.new("RGB",(1920,1080),"#dddcd2");draw=ImageDraw.Draw(board)
        draw.text((20,12),phase,font=font,fill="#28312b")
        for i,v in enumerate(views):
            p=next((x for x in ps if x.stem.endswith("-"+v)),None)
            if p is None:continue
            x=(i%3)*640;y=54+(i//3)*500;img=flatten(p,(620,430));board.paste(img,(x+10,y+40));draw.text((x+15,y+8),v,font=small,fill="#28312b")
        board.save(folder/(phase+"-sheet.png"))
spec={"sword":[(m,p) for m,p in (("march",1.08),("strike",1.5)) if not os.environ.get("BOW_WORKSHOP_MOTION") or os.environ["BOW_WORKSHOP_MOTION"]==m],"retarget":[("retarget-march",audit.get("retarget",{}).get("periodSeconds",1.08))],"archer":[]}
clips=[];deferred=[]
def encode(frames,video,period,mosaic=False):
    with tempfile.TemporaryDirectory() as td:
        d=Path(td)
        for i,p in enumerate(frames):
            if mosaic:
                im=Image.new("RGB",(3840,1440),"#9ca291");dr=ImageDraw.Draw(im)
                for j,(name,file) in enumerate(zip(views,p)):
                    pos=(j%3*1280,j//3*720);im.paste(flatten(file,(1280,720)),pos);dr.rectangle((pos[0]+10,pos[1]+10,pos[0]+165,pos[1]+43),fill="#33382f");dr.text((pos[0]+17,pos[1]+13),name,font=small,fill="white")
            else:im=flatten(p)
            im.save(d/("%04d.png"%i))
        for mode,rate in (("normal",len(frames)/period),("half",len(frames)/(2*period))):
            dest=folder/(video+"-"+mode+".mp4")
            subprocess.run(["ffmpeg","-y","-v","error","-stream_loop","2","-framerate",str(rate),"-i",str(d/"%04d.png"),"-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart","-r","24",str(dest)],check=True)
            clips.append({"file":str(dest.relative_to(root)),"speed":1 if mode=="normal" else .5,"period":period,"sourceFrames":len(frames),"resolution":[3840,1440] if mosaic else [1920,1080],"loops":3})
for motion,period in spec[role]:
    rows=audit.get("samples",{}).get(motion,[])
    if not rows or motion not in audit.get("preflight",{}):
        deferred.append({"motion":motion,"reason":"Incomplete local diagnostics","previewFrames":len(rows)});continue
    n=len(rows);perView=[]
    for view in views:
        frames=[folder/("%s-%02d-%s.png"%(motion,i,view)) for i in range(n)]
        if not all(p.is_file() for p in frames):raise ValueError("Missing native camera frame "+motion+" "+view)
        for p in frames:
            with Image.open(p) as im:
                if im.size!=(1920,1080):raise ValueError("Non-native 1080p frame "+str(p))
        perView.append(frames)
        encode(frames,motion+"-"+view,period)
    encode(list(zip(*perView)),motion+"-synchronized",period,True)
if audit.get("staticEquipment") and not audit["staticEquipment"]["pass"]:deferred.append({"motion":"equipped motion","reason":"Static equipment gate rejected; no native motion cycle generated"})
if role=="archer":deferred.append({"motion":"shot","reason":"Static anchor only; wait for direct artistic approval"})
(root/"clip-index.json").write_text(json.dumps({"clips":clips,"deferred":deferred,"nativeFramesRetained":True,"interpolation":False,"artisticApproval":False,"anatomicalPreflight":audit.get("preflight",audit.get("staticGate",audit.get("staticEquipment")))},indent=2))
