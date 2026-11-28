"""Strict triangle intersection audit, no fixed-capacity truncation.
Excludes shared-vertex pairs and coplanar/touching-only pairs, as in P0 strict audit.
"""
import numpy as np
from numba import njit
@njit(cache=True)
def dot(a,b):return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
@njit(cache=True)
def cross(a,b):return np.array([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]])
@njit(cache=True)
def interval(t,d,axis):
 lo=1e20;hi=-1e20
 for k in range(3):
  j=(k+1)%3
  if abs(d[k])<1e-12:
   x=dot(t[k],axis);lo=min(lo,x);hi=max(hi,x)
  if d[k]*d[j]<0:
   u=d[k]/(d[k]-d[j]);x=dot(t[k]+u*(t[j]-t[k]),axis);lo=min(lo,x);hi=max(hi,x)
 return lo,hi
@njit(cache=True)
def classify(V,F,n,cut):
 t=V[F.flatten()].reshape((-1,3,3));q=len(F);mi=np.empty((q,3));ma=mi.copy();norm=mi.copy();out=np.zeros((3,3),np.int64);pair=[]
 for i in range(q):
  for k in range(3):mi[i,k]=min(t[i,0,k],t[i,1,k],t[i,2,k]);ma[i,k]=max(t[i,0,k],t[i,1,k],t[i,2,k])
  a=cross(t[i,1]-t[i,0],t[i,2]-t[i,0]);norm[i]=a/max(np.sqrt(dot(a,a)),1e-30)
 order=np.argsort(mi[:,0])
 for ii in range(q):
  i=order[ii]
  for jj in range(ii+1,q):
   j=order[jj]
   if mi[j,0]>ma[i,0]:break
   if i>=cut and j>=cut:continue
   if ma[i,1]<mi[j,1] or ma[j,1]<mi[i,1] or ma[i,2]<mi[j,2] or ma[j,2]<mi[i,2]:continue
   share=False
   for a in F[i]:
    for b in F[j]:
     if a==b:share=True
   if share:continue
   x=np.array([dot(t[i,k]-t[j,0],norm[j]) for k in range(3)]);y=np.array([dot(t[j,k]-t[i,0],norm[i]) for k in range(3)])
   if min(x)>=-1e-6 or max(x)<=1e-6 or min(y)>=-1e-6 or max(y)<=1e-6:continue
   axis=cross(norm[i],norm[j]);l=np.sqrt(dot(axis,axis))
   if l<1e-10:continue
   axis/=l;a,b=interval(t[i],x,axis);c,d=interval(t[j],y,axis)
   if min(b,d)<=max(a,c)+1e-10:continue
   ci=0 if max(F[i])<n else 1 if min(F[i])>=n else 2;cj=0 if max(F[j])<n else 1 if min(F[j])>=n else 2;out[min(ci,cj),max(ci,cj)]+=1
   pair.append((min(i,j),max(i,j)))
 return out,pair
