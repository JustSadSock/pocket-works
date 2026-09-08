import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import player as base


def extra_actions(rig):
    jump = base.new_action(rig, 'Jump')
    for frame, a in ((1, 0), (5, .65), (10, 1), (16, .45), (22, 0)):
        base.kl(rig, 'root', frame, z=.15*a)
        base.kr(rig, 'spine', frame, x=-.16*a)
        base.kr(rig, 'upperarm_L', frame, x=-.38*a, z=-.22*a)
        base.kr(rig, 'upperarm_R', frame, x=-.38*a, z=.22*a)
        base.kr(rig, 'thigh_L', frame, x=.35*a)
        base.kr(rig, 'thigh_R', frame, x=.28*a)
        base.kr(rig, 'shin_L', frame, x=-.42*a)
        base.kr(rig, 'shin_R', frame, x=-.38*a)
    base.stash(rig, jump, 22)

    grab = base.new_action(rig, 'Grab')
    for frame, a in ((1, 0), (5, .7), (9, 1), (16, 1), (22, .72)):
        base.kr(rig, 'spine', frame, x=.22*a)
        base.kr(rig, 'upperarm_L', frame, x=-1.35*a, z=-.26*a)
        base.kr(rig, 'upperarm_R', frame, x=-1.35*a, z=.26*a)
        base.kr(rig, 'forearm_L', frame, x=-.68*a)
        base.kr(rig, 'forearm_R', frame, x=-.68*a)
        base.kr(rig, 'thigh_L', frame, x=.20*a)
        base.kr(rig, 'thigh_R', frame, x=-.12*a)
    base.stash(rig, grab, 22)

    land = base.new_action(rig, 'Land')
    for frame, a in ((1, 0), (4, 1), (9, .8), (15, .25), (22, 0)):
        base.kl(rig, 'pelvis', frame, z=-.08*a)
        base.kr(rig, 'spine', frame, x=.24*a)
        base.kr(rig, 'thigh_L', frame, x=-.42*a)
        base.kr(rig, 'thigh_R', frame, x=-.38*a)
        base.kr(rig, 'shin_L', frame, x=.55*a)
        base.kr(rig, 'shin_R', frame, x=.50*a)
        base.kr(rig, 'upperarm_L', frame, x=-.20*a, z=-.18*a)
        base.kr(rig, 'upperarm_R', frame, x=-.20*a, z=.18*a)
    base.stash(rig, land, 22)


def main():
    args = base.parse_args()
    output = Path(args.output).resolve()
    base.clear_scene()
    rig = base.create_rig()
    base.build(rig)
    base.animate(rig)
    extra_actions(rig)
    import bpy
    rig.animation_data.action = next(a for a in bpy.data.actions if a.name == 'Idle')
    base.export_glb(output)
    print(f'COLOSSUS traveler v2 generated {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
