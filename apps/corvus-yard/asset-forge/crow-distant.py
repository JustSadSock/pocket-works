"""Flock LOD: same anatomy/actions, fewer vertices than the player crow."""
from pathlib import Path
exec(compile((Path(__file__).with_name("crow.py")).read_text(),str(Path(__file__).with_name("crow.py")),"exec"))
