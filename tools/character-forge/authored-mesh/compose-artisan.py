"""Original Artisan A composition study, not a production resource. Exact rig, no Core edits."""
import sys,json,numpy as np,trimesh
from pathlib import Path
base_path,document_path,geometry_path,output=sys.argv[1:5];base=json.loads(Path(base_path).read_text());doc=json.loads(Path(document_path).read_text());tunic=doc['parts'][0];n=tunic['outerVertexCount'];V=np.load(geometry_path);F=np.array(tunic['indices']).reshape(-1,3);j=np.array(tunic['joints8']).reshape(-1,8);w=np.array(tunic['weights8']).reshape(-1,8);outer=F[np.max(F,axis=1)<n];tri=V[outer];ea=tri[:,1]-tri[:,0];eb=tri[:,2]-tri[:,0];nj=len(base['joints'])
def norms(v,f):return np.array(trimesh.Trimesh(v,f,process=False).vertex_normals).flatten().tolist()
tunic['positions']=V.ravel().tolist();tunic['normals']=norms(V,F);tunic['name']='authored artisan tunic';tunic['color']=[.39,.35,.24];tunic['material']={'kind':'cloth','roughness':.94,'metallic':0};tunic['authoredSpec']['revision']='p0.5-A-local-fit-unqualified'
center=V[:n];y=center[:,1];x=center[:,0];z=center[:,2];fold=.91+.065*np.sin(47*x+6*y)*np.sin(13*y+7*z)+.035*np.sin(113*x+31*z);edge=np.where((y>1.507)|(y<.817),.72,1.);c=np.clip((fold*edge)[:,None]*np.array([1.02,1.01,.92]),0,1);tunic['vertexTint']=np.r_[c,c].ravel().tolist()
def sample(y,theta,offset):
 o=np.array([0.,y,.025]);d=np.array([np.sin(theta),0.,np.cos(theta)]);h=np.cross(d,eb);det=np.einsum('ij,ij->i',ea,h);good=np.abs(det)>1e-10;inv=np.divide(1,det,out=np.zeros_like(det),where=good);s=o-tri[:,0];u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,ea);v=inv*(q@d);dist=inv*np.einsum('ij,ij->i',eb,q);valid=good&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(dist>0)&(dist<.4)
 if not valid.any():raise ValueError('No authored tunic ray intersection')
 idx=np.argmin(np.where(valid,dist,np.inf));ids=outer[idx];bary=np.maximum(0,np.array([1-u[idx]-v[idx],u[idx],v[idx]]));bary/=bary.sum();a=o+dist[idx]*d;dense=np.zeros(nj)
 for k,i in enumerate(ids):np.add.at(dense,j[i],w[i]*bary[k])
 ix=np.argsort(dense,kind='stable')[-8:][::-1];ww=dense[ix];ww/=ww.sum();return a+offset*d,d,ix,ww,ids,bary
def make_panel(name,rows,cols,closed,sampler,color,thick,rough):
 vv=[];dd=[];jj=[];ww=[];bindings=[]
 for r in range(rows):
  for c in range(cols):
   p,d,ix,weight,ids,bary=sampler(r/(rows-1),c/(cols if closed else cols-1));vv.append(p);dd.append(d);jj.append(ix);ww.append(weight);bindings.append({'vertices':ids.tolist(),'bary':bary.tolist()})
 v=np.array(vv);d=np.array(dd);f=[];k=len(v)
 for r in range(rows-1):
  for c in range(cols if closed else cols-1):
   a=r*cols+c;b=r*cols+(c+1)%cols;g=a+cols;h=b+cols
   for t in [[a,b,h],[a,h,g]]:
    q=v[t]
    if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),d[t[0]])<0:t=t[::-1]
    f.append(t)
 f=np.array(f);es=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1);e,counts=np.unique(es,axis=0,return_counts=True);boundary=set(map(tuple,e[counts==1]));rim=[]
 for a,b,c in f:
  for u,z in [(a,b),(b,c),(c,a)]:
   if tuple(sorted((u,z))) in boundary:rim.extend([[z,u,u+k],[z,u+k,z+k]])
 v=np.r_[v,v-thick*d];f=np.r_[f,f[:,::-1]+k,np.array(rim)];J=np.r_[jj,jj];W=np.r_[ww,ww];W4=W[:,:4]/W[:,:4].sum(1)[:,None];p={'name':name,'component':'clothing','layer':4,'region':name,'positions':v.ravel().tolist(),'indices':f.ravel().tolist(),'normals':norms(v,f),'color':color,'material':{'kind':'leather','roughness':rough,'metallic':0},'joints':J[:,:4].ravel().tolist(),'weights':W4.ravel().tolist(),'joints8':J.ravel().tolist(),'weights8':W.ravel().tolist(),'outerVertexCount':k,'thickness':thick,'binding':0,'authoredSpec':{'host':tunic['name'],'outerBindings':bindings,'freePanel':not closed,'fixedOuterVertices':list(range(k)) if closed else list(range((rows-1)*cols,rows*cols))}};return p
belt=make_panel('authored waist belt',3,48,True,lambda a,u:sample(1.045+.026*a,2*np.pi*u,.006),[.17,.092,.041],.0025,.85)
def apron_sample(a,u):
 e=abs(2*u-1);hem=.825+.045*e**3+.012*np.sin(2*np.pi*u);y=hem+(1.052-hem)*a;theta=(2*u-1)*(1.02-.22*a)+.05*np.sin(np.pi*u)*(1-a);offset=.012+.011*(1-a)+(.008*np.cos(5*np.pi*u+.5)+.003*np.sin(9*np.pi*u))*(1-a);return sample(y,theta,offset)
apron=make_panel('authored leather work apron',15,25,False,apron_sample,[.29,.16,.065],.003,.91);apron['authoredSpec']['fixedHost']='authored waist belt';av=np.array(apron['positions']).reshape(-1,3);shade=.92+.08*np.sin(av[:,0]*61+av[:,1]*8)+.025*np.sin(av[:,1]*135);apron['vertexTint']=np.repeat(np.clip(shade[:,None],.8,1.),3,axis=1).ravel().tolist()
def rigid(p,newpos,anchor):
 p=json.loads(json.dumps(p));v=np.array(p['positions']).reshape(-1,3);v+=newpos-v.mean(0);p['positions']=v.ravel().tolist();N=len(v);bone=int(anchor[2][0]);p['joints']=np.tile([bone,0,0,0],(N,1)).ravel().tolist();p['weights']=np.tile([1,0,0,0],(N,1)).ravel().tolist();p['joints8']=np.tile([bone,0,0,0,0,0,0,0],(N,1)).ravel().tolist();p['weights8']=np.tile([1,0,0,0,0,0,0,0],(N,1)).ravel().tolist();p.pop('attachmentBindings',None);p['authoredSpec']={'host':'authored waist belt','rigidStudy':True,'source':'repositioned P0.3 component','supportBone':bone};return p
old={p['name']:p for p in base['parts']};support=sample(1.058,1.16,.024);pouch=rigid(old['belt pouch'],support[0]+np.array([.014,-.066,.012]),support);loop=rigid(old['pouch belt loop'],support[0]+np.array([0,-.012,0]),support);front=sample(1.058,0,.012);buckle=rigid(old['apron belt buckle'],front[0],front);buckle['attachmentSpec']={'type':'rigid-hardware','host':'authored waist belt'};pouch['attachmentSpec']={'type':'fitted-interface','host':loop['name']};loop['attachmentSpec']={'type':'fitted-interface','host':'authored waist belt'}
remove={'tunic','tunic neck binding','waist belt','leather work apron','linen cuff L','linen cuff R','belt pouch','pouch belt loop','apron belt buckle'};parts=[p for p in base['parts'] if p['name'] not in remove]+[tunic,belt,apron,pouch,loop,buckle]
for p in parts:
 if p['name'].startswith('boot '):p['material']={'kind':'leather','roughness':.92,'metallic':0};p['color']=[.155,.096,.052] if 'welt' not in p['name'] else [.23,.145,.07]
 if p['name'] in ['scalp cropped','beard']:p['color']=[.145,.097,.057];p['material']={'kind':'hair','roughness':.87,'metallic':0}
result={'version':1,'rig':doc['rig'],'parts':parts};Path(output).write_text(json.dumps(result,separators=(',',':'),allow_nan=False));print('triangles',sum(len(p['indices'])//3 for p in parts),'parts',len(parts),'joints',len(doc['rig']))
