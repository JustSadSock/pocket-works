"""Verified provider assets for a reference scene, not synthesized vegetation."""
import os,json,hashlib,urllib.request
from pathlib import Path
out=Path(os.environ["BOW_ART_OUTPUT"]);root=out/"nature";root.mkdir(parents=True,exist_ok=True)
records=[]
def get(url,limit):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"PocketWorks Art Forge research"}),timeout=90) as r:raw=r.read(limit+1)
    if len(raw)>limit:raise ValueError("Size budget "+url)
    return raw
def download(entry,path):
    raw=get(entry["url"],150*1024*1024)
    if not entry.get("md5") or hashlib.md5(raw).hexdigest()!=entry["md5"]:raise ValueError("Provider digest mismatch "+entry["url"])
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
    records.append({"file":str(path.relative_to(root)),"url":entry["url"],"sha256":hashlib.sha256(raw).hexdigest(),"license":"CC0"})
def deps(value,prefix=""):
    if isinstance(value,dict):
        if "url" in value and "md5" in value:
            yield prefix,value
        else:
            for k,v in value.items():yield from deps(v,k if not prefix else prefix+"/"+k)
for asset in ("pine_tree_01","pine_sapling_medium","shrub_03","rock_moss_set_01","moss_01"):
    meta=json.loads(get("https://api.polyhaven.com/files/"+asset,4000000))
    (root/(asset+"-schema.json")).write_text(json.dumps(meta,indent=2))
    # Provider glTF file includes a relative bin and textures. Use the exact
    # included file names, rejecting traversal, and verify all provider hashes.
    candidates=[(k,v) for k,v in deps(meta) if v["url"].split("?")[0].endswith(".gltf")]
    if not candidates:raise ValueError("No glTF source "+asset+" "+str(list(meta)))
    candidates.sort(key=lambda x:(0 if "1k" in x[0].lower() else 1 if "2k" in x[0].lower() else 2,x[1].get("size",0)))
    key,entry=candidates[0];base=root/asset;target=base/(asset+".gltf");download(entry,target)
    doc=json.loads(target.read_text());uris=[v["uri"] for v in doc.get("buffers",[])+doc.get("images",[]) if "uri" in v and not v["uri"].startswith("data:")]
    from urllib.parse import unquote,urljoin,urlsplit
    included=entry.get("include",{});all_deps=list(deps(included))+list(deps(meta))
    for uri in uris:
        name=unquote(uri);rel=Path(name)
        if rel.is_absolute() or ".." in rel.parts or urlsplit(uri).scheme:raise ValueError("Unsafe glTF dependency")
        exact=urljoin(entry["url"],uri)
        found=[v for k,v in all_deps if v["url"]==exact or k==name or k.endswith("/"+name)]
        if not found:raise ValueError("Unverified dependency "+asset+" "+uri)
        download(found[0],base/rel)
    (root/"provenance.json").write_text(json.dumps(records,indent=2))
