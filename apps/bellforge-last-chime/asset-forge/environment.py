from pathlib import Path
import math, sys
sys.path.insert(0, str(Path(__file__).parent))
from forge_common import *

def main():
    args=parse_args(); clear_scene()
    stone=painted_material('Stone_Sandstone',(0.39,0.31,0.24),.92,seed=2,accent=(.52,.39,.27))
    slate=painted_material('Stone_Slate',(0.14,.18,.19),.88,seed=3,accent=(.24,.29,.28))
    terra=painted_material('Plaster_Terracotta',(.67,.31,.18),.9,seed=4,accent=(.84,.47,.26))
    ochre=painted_material('Plaster_Ochre',(.74,.48,.21),.9,seed=5,accent=(.9,.63,.32))
    copper=painted_material('Copper_Aged',(.35,.22,.11),.54,.64,seed=6,accent=(.55,.34,.16))
    verd=painted_material('Copper_Verdigris',(.11,.43,.39),.68,.35,seed=7,accent=(.2,.62,.54))
    wood=painted_material('Wood_Dark',(.22,.11,.055),.86,seed=8,accent=(.38,.19,.08))
    saffron=painted_material('Cloth_Saffron',(.78,.43,.10),.98,seed=9,accent=(.96,.66,.18))
    crimson=painted_material('Cloth_Crimson',(.48,.10,.08),.98,seed=10,accent=(.73,.20,.14))
    iron=painted_material('Iron_Blueblack',(.075,.095,.10),.55,.7,seed=11,accent=(.16,.19,.18))
    glass=painted_material('Window_Glass',(.08,.18,.20),.22,.05,seed=12,accent=(.18,.33,.33),emission=(.03,.07,.06))
    ceramic=painted_material('Ceramic_Resonant',(.45,.82,.71),.33,.05,seed=13,accent=(.7,1,.9),emission=(.12,.72,.58))
    green=painted_material('Plant_Sage',(.16,.31,.19),.96,seed=14,accent=(.3,.5,.26))
    col=painted_material('CollisionProxy',(.1,.1,.1),1,seed=30)

    # A continuous authored street with dedicated invisible collision volumes.
    for i,z in enumerate(range(-62,49,8)):
        box(f'RoadStone_{i}',(0,-.18,z),(10.8,.36,8.15),stone,bevel_amount=.09)
        if i%3==0:
            for x in (-3.4,0,3.4): box(f'RoadInlay_{i}_{x}',(x,.025,z),(1.8,.03,.16),verd,bevel_amount=.015)
    box('COL_MainRoad',(0,-.33,-7),(10.4,.66,112),col,bevel_amount=0)
    box('COL_WestBoundary',(-5.55,1,-7),(.35,3,112),col,bevel_amount=0)
    box('COL_EastBoundary',(5.55,1,-7),(.35,3,112),col,bevel_amount=0)

    # Dense canyon buildings. Proportions, roofs, balconies, awnings and window rhythm vary block by block.
    palette=[terra,ochre,stone,slate]
    zs=[-56,-47,-38,-29,-18,-8,3,14,25,34,43]
    for i,z in enumerate(zs):
        for side in (-1,1):
            x=side*(8+(i%3)*.45); w=5+(i%2)*.8; d=7.2+(i%4)*.45; h=5.2+(i%5)*1.15; mat=palette[(i+(side>0)*2)%4]
            box(f'House_{i}_{side}_Body',(x,h/2,z),(w,h,d),mat,rot_y=.025*side*(i%3-1),bevel_amount=.16)
            box(f'House_{i}_{side}_Roof',(x,h+.32,z),(w+.35,.38,d+.35),slate,bevel_amount=.09)
            box(f'COL_House_{i}_{side}',(x,h/2,z),(w+.15,h,d+.15),col,bevel_amount=0)
            street=x-side*(w/2+.035)
            for level in range(1,max(2,int(h//2.2))):
                for off in (-1.3,1.15):
                    box(f'Window_{i}_{side}_{level}_{off}',(street,1.25+level*1.6,z+off),(.06,.82,.68),glass,bevel_amount=.03)
                    box(f'WindowFrame_{i}_{side}_{level}_{off}',(street-side*.03,1.25+level*1.6,z+off),(.10,1.02,.88),wood,bevel_amount=.03)
            if i%2==0:
                by=2.4+(i%3)*.35; box(f'Balcony_{i}_{side}',(street-side*.55,by,z),(1.1,.16,3.4),wood,bevel_amount=.05)
                for k in range(-3,4): cylinder(f'Baluster_{i}_{side}_{k}',(street-side*1.03,by+.55,z+k*.45),.035,1.1,iron,12)
            if i%3==0: box(f'FX_Flag_Awning_{i}_{side}',(street-side*.72,1.9,z),(1.45,.08,3.0),saffron if side<0 else crimson,bevel_amount=.02)
            cylinder(f'Chimney_{i}_{side}',(x+side*1.2,h+1,z+d*.15),.28,2.1,copper,20)
            curve_between(f'Pipe_{i}_{side}',(street,3.1,z-d*.25),(street-side*.6,1.1,z-d*.25),.095,verd)

    # Market plaza: cloth, masonry, pottery and a monumental framed view.
    box('MarketArch_L',(-3.9,2.3,-24),(2.1,4.6,1.2),stone,bevel_amount=.18); box('MarketArch_R',(3.9,2.3,-24),(2.1,4.6,1.2),stone,bevel_amount=.18)
    box('MarketArch_Top',(0,4.35,-24),(9.6,1.05,1.25),ochre,bevel_amount=.18)
    box('MarketCanopy',(-2.5,2.5,-31),(3.6,.12,5.4),saffron,bevel_amount=.02); box('MarketCanopy2',(2.4,2.25,-30),(3.1,.12,4.1),crimson,bevel_amount=.02)
    for x,z in [(-3,-33),(3,-34),(-3,-28),(3,-27)]:
        box(f'MarketTable_{x}_{z}',(x,.72,z),(2.1,.14,.9),wood,bevel_amount=.05)
        for k in range(4): sphere(f'MarketPot_{x}_{z}_{k}',(x-.7+k*.45,.92,z),(.18,.18,.18),ochre,16,8)

    # Foundry mass and service route.
    box('FoundryMain',(7.8,4.4,13),(5.8,8.8,15),terra,bevel_amount=.18); box('COL_Foundry',(7.8,4.4,13),(5.95,8.9,15.1),col,bevel_amount=0)
    for z in (9,13,17): cylinder(f'FoundryStack_{z}',(8.7,10,z),.5,6.5,slate,24)
    for y in (1.6,3.2,4.8): curve_between(f'FoundryPipe_{y}',(5,y,8),(5,y,19),.12,copper)
    box('FoundryFurnaceMouth',(4.82,1.45,14),(.16,2.3,3.3),iron,bevel_amount=.06); box('FoundryFurnaceGlow',(4.72,1.45,14),(.08,1.55,2.5),ceramic,bevel_amount=.02)
    for i,z in enumerate(range(24,38,3)): box(f'ServiceDeck_{i}',(0,.25+(i%2)*.18,z),(7.8,.18,2.85),wood,rot_y=(i%2-.5)*.05,bevel_amount=.05)
    for z in (25,31,37):
        box(f'ServiceRailL_{z}',(-3.8,1.05,z),(.1,1.6,2.6),iron,bevel_amount=.02); box(f'ServiceRailR_{z}',(3.8,1.05,z),(.1,1.6,2.6),iron,bevel_amount=.02)

    # Bell tower and upper chamber provide the vertical wow moment.
    box('BellTowerBase',(0,8.5,47),(14,17,18),slate,bevel_amount=.22)
    box('COL_TowerWest',(-5.8,4.5,47),(1,9,18),col,bevel_amount=0); box('COL_TowerEast',(5.8,4.5,47),(1,9,18),col,bevel_amount=0)
    box('TowerEntryFloor',(0,.02,44),(10.4,.2,9),stone,bevel_amount=.04); box('COL_TowerEntryFloor',(0,-.12,44),(10,.28,9),col,bevel_amount=0)
    for y in (3,6,9,12,15): torus(f'TowerCopperBand_{y}',(0,y,47),6.55,.13,verd,rot=(math.pi/2,0,0),major_segments=40)
    for x in (-4.5,4.5):
        for z in (41,47,53): box(f'TowerWindow_{x}_{z}',(x,7,z),(.08,2.8,2.1),glass,bevel_amount=.08)
    box('UpperBellDeck',(0,7.35,59),(10.5,.35,15),wood,bevel_amount=.08); box('COL_UpperBellDeck',(0,7.12,59),(10.2,.45,15),col,bevel_amount=0)
    box('COL_UpperWest',(-5.2,9,59),(.35,4,15),col,bevel_amount=0); box('COL_UpperEast',(5.2,9,59),(.35,4,15),col,bevel_amount=0)
    for z in (55,59,63):
        box(f'UpperRib_{z}',(0,12,z),(13,.45,.5),copper,bevel_amount=.1)
        curve_between(f'UpperChainL_{z}',(-4.5,12,z),(-4.5,8,z),.06,iron); curve_between(f'UpperChainR_{z}',(4.5,12,z),(4.5,8,z),.06,iron)

    # Small evidence that the city existed before the player.
    for i,(x,z) in enumerate([(-3.8,-18),(3.9,-9),(-4,1),(4,25),(-4,35)]):
        box(f'Bench_{i}',(x,.55,z),(2.2,.16,.65),wood,bevel_amount=.05); box(f'BenchBack_{i}',(x,1,z+.28),(2.2,.75,.1),wood,bevel_amount=.04)
    for i,(x,z) in enumerate([(-4,-40),(4,-20),(-4,-2),(4,8),(-4,29),(4,39)]):
        cylinder(f'LampPost_{i}',(x,1.5,z),.07,3,iron,12); sphere(f'LampGlass_{i}',(x,3,z),(.24,.34,.24),glass,16,8)
    for i,(x,z) in enumerate([(-4.2,-44),(4.1,-16),(-4.2,5),(4.1,30)]):
        cylinder(f'Planter_{i}',(x,.35,z),.5,.7,stone,18)
        for k in range(5): sphere(f'Plant_{i}_{k}',(x+(k-2)*.12,.9+(k%2)*.18,z+(k%3-1)*.12),(.18,.5,.16),green,12,6)
    export_glb(args.output,animations=False)

if __name__=='__main__': main()
