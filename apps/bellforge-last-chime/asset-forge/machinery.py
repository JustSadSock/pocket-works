from pathlib import Path
import math, sys
sys.path.insert(0,str(Path(__file__).parent))
import bpy
from forge_common import *

def gear(name,pos,radius,teeth,mat,depth=.28):
    core=cylinder(name,pos,radius*.72,depth,mat,vertices=max(24,teeth*2),rot=(math.pi/2,0,0))
    for i in range(teeth):
        a=math.tau*i/teeth; x=pos[0]+math.cos(a)*radius*.93; y=pos[1]+math.sin(a)*radius*.93
        box(f'{name}_Tooth{i}',(x,y,pos[2]),(radius*.24,radius*.14,depth),mat,rot_y=-a,bevel_amount=.025)
    return core

def resonator(prefix,pos,scale,copper,verd,ceramic):
    x,y,z=pos
    sphere(f'{prefix}_Core',(x,y,z),(0.52*scale,.52*scale,.52*scale),ceramic,24,14)
    for i,r in enumerate((1.05,1.45,1.88)):
        torus(f'MECH_{prefix}Ring{i}',(x,y,z),r*scale,.12*scale,verd if i==1 else copper,rot=(math.pi/2,0,0),major_segments=36,minor_segments=10)
    for a in (0,math.pi/2):
        xx=x+math.cos(a)*2.15*scale; zz=z+math.sin(a)*2.15*scale; cylinder(f'{prefix}_Pillar_{a}',(xx,y,zz),.11*scale,3.7*scale,copper,16)

def main():
    args=parse_args(); clear_scene()
    copper=painted_material('Mechanism_Copper',(0.42,0.24,0.09),.47,.72,seed=50,accent=(.68,.38,.12))
    verd=painted_material('Mechanism_Verdigris',(0.10,0.47,0.42),.58,.45,seed=51,accent=(.22,.7,.58))
    iron=painted_material('Mechanism_Iron',(0.08,0.10,0.11),.46,.8,seed=52,accent=(.18,.2,.2))
    ceramic=painted_material('Ceramic_Glow',(0.35,0.82,0.70),.28,.05,seed=53,accent=(.7,1,.9),emission=(.08,.64,.52))
    wood=painted_material('Lift_Wood',(0.24,0.12,0.055),.82,seed=54,accent=(.42,.21,.08))
    resonator('Market',(0,1.55,-25),.72,copper,verd,ceramic)
    resonator('Tower',(0,2.6,43),.9,copper,verd,ceramic)
    torus('MECH_FoundryValve',(4.05,1.25,14),.72,.12,copper,rot=(0,math.pi/2,0),major_segments=28)
    for a in range(8):
        ang=math.tau*a/8; curve_between(f'ValveSpoke{a}',(4.0,1.25,14),(4.0,1.25+math.cos(ang)*.63,14+math.sin(ang)*.63),.035,iron)
    box('MECH_FoundryDoor',(4.75,1.55,18),(0.32,3.1,3.4),iron,bevel_amount=.08)
    gear('MECH_SlowGear_Foundry',(6.0,3.4,10),1.35,12,copper,.35); gear('MECH_FastGear_Foundry',(6.0,1.6,10),.82,10,verd,.3)
    gear('MECH_SlowGear_RoofL',(-4.4,2.6,29),1.1,10,copper,.25); gear('MECH_FastGear_RoofR',(4.3,3.0,34),.9,9,verd,.23)
    cylinder('MECH_Fan_Roof',(3.8,2.6,27),.28,2.2,iron,16,rot=(math.pi/2,0,0))
    for i in range(5): box(f'FanBlade{i}',(3.8,2.6+math.cos(math.tau*i/5)*.8,27+math.sin(math.tau*i/5)*.8),(.08,.3,1.1),verd,rot_y=-math.tau*i/5,bevel_amount=.03)
    box('MECH_TowerLift',(0,.3,48),(5.5,.35,4.2),wood,bevel_amount=.08); box('LiftRailL',(-2.7,4,48),(.15,8,.15),iron,bevel_amount=.03); box('LiftRailR',(2.7,4,48),(.15,8,.15),iron,bevel_amount=.03)
    for x in (-2.55,2.55): curve_between(f'LiftChain{x}',(x,.6,48),(x,12.5,48),.055,iron)
    profile=[(.42,2.7),(.72,2.5),(1.25,2.15),(1.85,1.45),(2.35,.6),(2.65,0),(2.48,-.35),(1.6,-.55)]
    lathe('MECH_GreatBell',(0,12.0,61),profile,copper,segments=56)
    torus('GreatBellBandTop',(0,13.9,61),1.18,.12,verd,rot=(math.pi/2,0,0),major_segments=40)
    torus('GreatBellBandLip',(0,11.55,61),2.5,.11,verd,rot=(math.pi/2,0,0),major_segments=48)
    curve_between('GreatBellYoke',(-3.7,15.1,61),(3.7,15.1,61),.3,wood)
    curve_between('GreatBellChain',(0,14.4,61),(0,9.2,61),.07,iron); sphere('GreatBellClapper',(0,9.0,61),(.42,.5,.42),iron,20,12)
    gear('MECH_SlowGear_BellL',(-4.2,12.8,61),1.55,14,copper,.38); gear('MECH_SlowGear_BellR',(4.2,12.8,61),1.55,14,verd,.38)
    curve_between('MECH_Pendulum',(0,12.4,51),(0,5.0,51),.14,copper); sphere('PendulumWeight',(0,4.5,51),(1.05,1.3,.6),copper,28,16)
    export_glb(args.output,animations=False)
if __name__=='__main__':main()
