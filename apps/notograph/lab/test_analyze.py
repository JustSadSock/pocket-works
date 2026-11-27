import unittest
from analyze import normalized_notes
class NotesTest(unittest.TestCase):
    def test_overlap_and_invalid(self):
        events=[(0,1,60,.8,None),(0,1,64,.7,None),(-2,-1,65,.5,None),(0,1,120,.5,None),(0,1,67,float('nan'),None)]
        self.assertEqual([n["pitch"] for n in normalized_notes(events,2)],[60,64])
    def test_clip(self):
        self.assertEqual(normalized_notes([(-.1,3,60,1.2,None)],2)[0],dict(start=0.,end=2,pitch=60,confidence=1.))
if __name__=='__main__': unittest.main()
