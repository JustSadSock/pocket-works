"""Blender 5.2 compatibility entrypoint for the KINEMA character forge.

Blender 5.2 moved legacy Action f-curves behind the layered Action API. The
character authoring code does not depend on changing interpolation after
keyframe insertion, so skip that cosmetic legacy pass and keep the authored
poses/actions intact.
"""

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).with_name('character.py')
spec = importlib.util.spec_from_file_location('kinema_character_source', SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Unable to load KINEMA character source: {SCRIPT}')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.finalize_action = lambda action: None
module.main()
