"""Phase-rotate a sparse periodic impulse layer, preserving samples and original master."""
import pathlib,sys,json,wave,hashlib,subprocess
import numpy as np
SHA='0721f86c93932ece122b31ea01005cc40d71d8e7bdeba4433c3530b1b92682bc'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def measure(path,rate):
 a=np.frombuffer(subprocess.check_output(['sox','-R',str(path),'-t','raw','-e','floating-point','-b','32','-L','-r',str(rate),'-']),'<f4').reshape(-1,2)
 jump=abs(a[0]-a[-1]);limit=abs(np.diff(a,axis=0)).mean(axis=0)*12+.001
 return dict(rate=rate,jump=jump.tolist(),limit=limit.tolist(),passes=bool(np.all(jump<limit)))
def main(root,out):
 root=pathlib.Path(root);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);p=root/'layers/drips.wav';assert sha(p)==SHA
 with wave.open(str(p),'rb') as w:params=w.getparams();assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(48000,2,2);x=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2)
 idx=np.flatnonzero(np.any(x!=0,axis=1));edges=np.r_[-1,idx,len(x)];i=int(np.argmax(np.diff(edges)));start,end=int(edges[i]+1),int(edges[i+1]);assert end-start>=4800;cut=(start+end)//2;y=np.roll(x,-cut,axis=0);assert np.array_equal(np.roll(y,cut,axis=0),x)
 fixed=out/'drips-runtime.wav'
 with wave.open(str(fixed),'wb') as w:w.setparams(params);w.writeframes(y.astype('<i2').tobytes())
 before=[measure(p,r) for r in (48000,44100)];after=[measure(fixed,r) for r in (48000,44100)];assert all(a['passes'] for a in after)
 report=dict(originalSha256=SHA,runtimeSha256=sha(fixed),rotationFrames=cut,quietFrames=end-start,before=before,after=after,exactInverse=True)
 (out/'loop-repair.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
if __name__=='__main__':main(*sys.argv[1:])
