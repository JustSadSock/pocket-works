import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from sequence import export_frames, export_bake

class SequenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.source=self.root/"source.json";self.outputs={"image":self.root/"atlas.png","clip":self.root/"clip.json"}
        for i,color in enumerate(("red","blue")):Image.new("RGBA",(8,8),color).save(self.root/f"{i}.png")
        self.inputs={f"{i}.png":self.root/f"{i}.png" for i in range(2)}
        self.data={"version":1,"id":"Walk","loop":True,"frames":[{"input":"0.png","duration":.1},{"input":"1.png","duration":.2}],"events":[{"name":"contact","time":.1}]}
    def tearDown(self):self.tmp.cleanup()
    def export(self):
        self.source.write_text(json.dumps(self.data));export_frames(self.source,self.inputs,self.outputs)
    def test_real_pixels_duration_and_events(self):
        self.export();clip=json.loads(self.outputs["clip"].read_text());self.assertAlmostEqual(clip["duration"],.3);self.assertEqual(clip["events"],self.data["events"])
        with Image.open(self.outputs["image"]) as atlas:self.assertEqual(atlas.size,(16,8));self.assertEqual(atlas.getpixel((9,1)),(0,0,255,255))
    def test_input_must_be_declared(self):
        self.data["frames"][0]["input"]="../other.png"
        with self.assertRaises(ValueError):self.export()
    def test_bad_duration_or_event_order(self):
        for dt in (0,-1,float("nan"),True):
            self.data["frames"][0]["duration"]=dt
            with self.assertRaises(ValueError):self.export()
        self.data["frames"][0]["duration"] = .1;self.data["events"]=[{"name":"contact","time":.2},{"name":"release","time":.1}]
        with self.assertRaises(ValueError):self.export()
    def test_consistent_canvas_required(self):
        Image.new("RGBA",(9,8)).save(self.inputs["1.png"])
        with self.assertRaises(ValueError):self.export()
    def test_bake_range_is_bounded_before_editor(self):
        for params in ({"start":10,"end":1},{"start":1,"end":1000},{"fps":True},{"step":0},{"width":4096},{"width":2048,"height":2048,"end":30},{"end":1,"step":100000},{"events":[{"name":"hit","time":10}]}):
            with self.assertRaises(ValueError):export_bake(self.root/"missing.blend",self.outputs,params,"missing-blender")
    def test_subframe_loop_rejected_consistently_with_runtime(self):
        self.data["frames"]=[{"input":"0.png","duration":.001}]
        with self.assertRaises(ValueError):self.export()

if __name__=="__main__":unittest.main()
