"""Rendered-image diagnostics. No aesthetic score or automatic publication gate."""
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFilter, ImageStat

def fingerprint(filename):
    with Image.open(filename) as raw:
        rgb = ImageOps.exif_transpose(raw).convert('RGB')
        gray = rgb.convert('L').resize((16, 16), Image.Resampling.BOX)
        values = list(gray.getdata())
        mean = sum(values)/256
        hist = rgb.resize((64,64)).histogram()
        # Per-channel coarse distributions; palette and layout remain separate.
        hist = [sum(hist[c*256+i:c*256+i+32])/4096 for c in range(3) for i in range(0,256,32)]
        edge = gray.filter(ImageFilter.FIND_EDGES)
        return {'sha256': hashlib.sha256(Path(filename).read_bytes()).hexdigest(),
                'size': list(rgb.size), 'luma': [round(v/255,4) for v in values],
                'hash': [int(v>=mean) for v in values], 'palette': hist,
                'contrast': round(ImageStat.Stat(gray).stddev[0],3),
                'edges': [round(v/255,4) for v in edge.getdata()]}

def compare(a,b):
    return {'layoutDifference': round(sum(abs(x-y) for x,y in zip(a['luma'],b['luma']))/256,4),
            'edgeDifference': round(sum(abs(x-y) for x,y in zip(a['edges'],b['edges']))/256,4),
            'paletteDifference': round(sum(abs(x-y) for x,y in zip(a['palette'],b['palette']))/6,4),
            'hashDifference': sum(x!=y for x,y in zip(a['hash'],b['hash'])),
            'aspectMismatch': abs(a['size'][0]/a['size'][1]-b['size'][0]/b['size'][1])>.08}

def main():
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); p.add_argument('images',nargs='+'); args=p.parse_args()
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    records=[{'file': f, **fingerprint(f)} for f in args.images]
    pairs=[{'a':a['file'],'b':b['file'],**compare(a,b)} for i,a in enumerate(records) for b in records[i+1:]]
    report={'note':'Diagnostic distances only. Comparable viewport/state required. Inspect frames; similarities do not prove duplication or artistic quality.', 'images':records,'comparisons':pairs}
    (out/'comparison.json').write_text(json.dumps(report,indent=2))
    width=280; height=380; cols=min(4,len(records))
    sheet=Image.new('RGB',(width*cols,height*math.ceil(len(records)/cols)), '#e5e5e5'); draw=ImageDraw.Draw(sheet)
    for i,r in enumerate(records):
        x=(i%cols)*width; y=(i//cols)*height
        with Image.open(r['file']) as raw:
            thumb=ImageOps.contain(ImageOps.exif_transpose(raw).convert('RGB'),(260,330))
            sheet.paste(thumb,(x+(width-thumb.width)//2,y+10))
        draw.text((x+10,y+345),Path(r['file']).name[:34],fill='black')
    sheet.save(out/'contact-sheet.png')
    print(json.dumps({'images':len(records),'comparisons':len(pairs),'output':str(out)}))
if __name__=='__main__': main()
