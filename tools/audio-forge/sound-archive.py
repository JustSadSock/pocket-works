"""Offline, write-once SHA-256 audio objects; no network provisioning."""
import hashlib,json,pathlib,sys,os,tempfile,zipfile
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def safe(name):
 p=pathlib.PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts and p.parts;return p
def put(root,data):
 h=hashlib.sha256(data).hexdigest();p=root/'objects'/h[:2]/h;p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert digest(p)==h;return h
 fd,tmp=tempfile.mkstemp(dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  try:os.link(tmp,p)
  except FileExistsError:assert digest(p)==h
 finally:os.unlink(tmp)
 assert digest(p)==h;return h
def ingest(root,archive):
 root=pathlib.Path(root);root.mkdir(parents=True,exist_ok=True);files={}
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   if name.endswith('/'):continue
   safe(name);assert name not in files;files[name]=put(root,z.read(name))
 data=(json.dumps(dict(version=1,files=files),sort_keys=True,separators=(',',':'))+'\n').encode();h=put(root,data);return h,files
def restore(root,manifest,dest):
 root=pathlib.Path(root);dest=pathlib.Path(dest);p=root/'objects'/manifest[:2]/manifest;assert digest(p)==manifest;d=json.loads(p.read_bytes());assert d['version']==1;dest.mkdir(parents=True,exist_ok=True)
 for name,h in d['files'].items():
  safe(name);assert len(h)==64 and all(c in '0123456789abcdef' for c in h);obj=root/'objects'/h[:2]/h;assert digest(obj)==h;f=dest/name;f.parent.mkdir(parents=True,exist_ok=True)
  if f.exists():assert digest(f)==h
  else:
   with f.open('xb') as w:w.write(obj.read_bytes())
  assert digest(f)==h
 return len(d['files'])
if __name__=='__main__':
 root,archive,dest=sys.argv[1:];h,files=ingest(root,archive);assert ingest(root,archive)[0]==h;print(json.dumps(dict(manifestSha256=h,files=restore(root,h,dest),objects=len(set(files.values())),sourceArchiveSha256=digest(pathlib.Path(archive)))))
