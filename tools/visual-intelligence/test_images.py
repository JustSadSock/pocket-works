import tempfile, unittest
from pathlib import Path
from PIL import Image, ImageDraw
from images import fingerprint, compare
class Comparisons(unittest.TestCase):
    def test_same_layout_different_palette_and_moved_subject(self):
        with tempfile.TemporaryDirectory() as tmp:
            files=[]
            for name,color,x in [('a','red',5),('b','blue',5),('c','red',55)]:
                im=Image.new('RGB',(100,100),'white');ImageDraw.Draw(im).rectangle((x,20,x+30,80),fill=color)
                f=Path(tmp)/(name+'.png');im.save(f);files.append(f)
            a,b,c=map(fingerprint,files)
            self.assertEqual(compare(a,a)['layoutDifference'],0)
            self.assertGreater(compare(a,b)['paletteDifference'],0)
            self.assertGreater(compare(a,c)['edgeDifference'],compare(a,b)['edgeDifference'])
            self.assertFalse(compare(a,c)['aspectMismatch'])
if __name__=='__main__': unittest.main()
