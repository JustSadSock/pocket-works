"""Validate CI checkout identity and exact tracked benchmark inputs before running."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path.cwd().resolve();expected=os.environ["BOW_EXPECTED_REVISION"];out=Path(os.environ["BOW_PROVENANCE_DEST"])
def git(*args):return subprocess.check_output(["git","-c","safe.directory="+str(root),"-C",str(root),*args])
actual=git("rev-parse","HEAD").decode().strip()
if actual!=expected:raise ValueError("CI revision mismatch: "+actual+" vs "+expected)
files=[p.decode() for p in git("ls-files","-z","apps/banners-of-war").split(b"\0") if p and not p.endswith(b".png") and not b"/workshop/" in p]
records={}
for name in files:
    p=root/name
    if not p.is_file():raise ValueError("Missing tracked file "+name)
    raw=p.read_bytes();canonical=git("show",expected+":"+name)
    if raw!=canonical:raise ValueError("Dirty tracked benchmark file "+name)
    records[name]=hashlib.sha256(raw).hexdigest()
(out/"source-provenance.json").write_text(json.dumps({"ciExpectedRevision":expected,"checkoutRevision":actual,"tree":git("rev-parse","HEAD^{tree}").decode().strip(),"files":records,"verifiedAgainstGitObjects":True},indent=2))
