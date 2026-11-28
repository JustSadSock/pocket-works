"""Actual triangle projection and penetration samples from pinned native A3 and geometry A."""
from pose_tailor import *
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection,LineCollection
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable
Q=np.load(out/'candidate.npy')
def plot(name,v,values,mode='depth'):
 fig,axs=plt.subplots(1,2,figsize=(10,6),layout='constrained');cm=plt.get_cmap('inferno' if mode=='depth' else 'viridis');norm=Normalize(0,40 if mode=='depth' else max(1,float(values.max())))
 for ax,angle in zip(axs,[0,np.pi/2]):
  d=R.from_rotvec([0,angle,0]).apply(v);q=d[outer];idx=np.argsort(q[:,:,2].mean(1));color=cm(norm(values[outer].mean(1)));pc=PolyCollection(q[idx,:,:2],facecolors=color[idx],edgecolors='none' if mode=='depth' else '#44535e',linewidths=.12);ax.add_collection(pc);ax.set_xlim(-.57,.57);ax.set_ylim(.64,1.61);ax.set_aspect('equal');ax.set_axis_off()
 fig.colorbar(ScalarMappable(norm=norm,cmap=cm),ax=axs,label='sampled depth (mm)' if mode=='depth' else 'dominant weight');fig.savefig(out/(name+'.png'),dpi=135);plt.close(fig)
for phase in [0,.26,.29,.77,38/48]:
 r,t,pp,_=transforms('walk',phase);bb=skin(B,bj,bw,r,t)
 for name,v in [('A3',V),('A',Q)]:
  d=skin(v,j,w,r,t);sd,_,inside=sdf(bb,BF,d,True);depth=np.maximum(0,-sd)*inside*1000;plot(name+'-depth-'+str(round(phase*100)),d-(pp[0]-P[0]),depth)
plot('A3-weight-topology',V,np.max(w,axis=1),'weight');plot('A-weight-topology',Q,np.max(w,axis=1),'weight')
