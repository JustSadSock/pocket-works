"""Original authored tunic: implicit tailored volume -> clean triangulated open shell.
Standalone authoring step. No changes to the Forge skeleton or motion.
"""
import numpy as np, json, sys
from pathlib import Path
from scipy.interpolate import PchipInterpolator
from skimage.measure import marching_cubes
import trimesh, vtk
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy

def make(source):
 J={j['name']:np.array(j['position']) for j in source['joints']}
 H=max(source['parts'][0]['positions'][1::3]); scale=H/1.74813
 step=.009*scale
 x,y,z=np.meshgrid(np.arange(-.68*scale,.69*scale,step),np.arange(.65*scale,1.65*scale,step),np.arange(-.30*scale,.43*scale,step),indexing='ij',sparse=True)
 # Author-defined body panels: flared skirt below fitted waist, generous shoulder.
 levels=np.array([.70,.79,.91,1.06,1.15,1.29,1.40,1.47,1.515,1.56,1.60])*scale
 rx=np.array([.29,.283,.23,.172,.174,.21,.235,.17,.098,.084,.06])*scale
 rz=np.array([.205,.20,.18,.133,.139,.145,.14,.118,.112,.115,.06])*scale
 cz=np.array([.012,.012,.013,.033,.035,.031,.017,.018,.045,.05,.05])*scale
 Y=np.clip(y,levels[0],levels[-1]); Xr=PchipInterpolator(levels,rx)(Y); Zr=PchipInterpolator(levels,rz)(Y); C=PchipInterpolator(levels,cz)(Y)
 angle=np.arctan2((z-C)/Zr,x/Xr)
 # Broad irregular fabric folds and flared gore panels, not old ring topology.
 fold=(.010*np.cos(5*angle+.65)+.006*np.sin(8*angle-.3))*scale*np.clip((1.07*scale-y)/(.25*scale),0,1)
 field=(np.sqrt((x/(Xr+fold))**2+((z-C)/(Zr+fold))**2)-1)*np.minimum(Xr,Zr)
 field=np.maximum(field,np.maximum(levels[0]-y,y-levels[-1]))
 cuts=[]
 for side in ['L','R']:
  sh,el,wr=[J[k+'.'+side] for k in ['upperarm01','lowerarm01','wrist']]
  start=sh+np.array([-np.sign(sh[0])*.085*scale,.015*scale,0]); axis=(wr-el)/np.linalg.norm(wr-el); end=wr+.03*scale*axis
  # Tapered sleeve with a rounded gusset union instead of intersecting sewn tubes.
  arm=None
  for a,b,ra,rb in [(start,sh,.115,.109),(sh,el,.109,.083),(el,end,.083,.057)]:
   ab=b-a;t=np.clip(((x-a[0])*ab[0]+(y-a[1])*ab[1]+(z-a[2])*ab[2])/np.dot(ab,ab),0,1)
   d=np.sqrt((x-a[0]-ab[0]*t)**2+(y-a[1]-ab[1]*t)**2+(z-a[2]-ab[2]*t)**2)-(ra+(rb-ra)*t)*scale
   arm=d if arm is None else np.minimum(arm,d)
  k=.09*scale; h=np.maximum(k-np.abs(field-arm),0)/k;field=np.minimum(field,arm)-h*h*k*.25
  cuts.append((wr-.022*scale*axis,-axis))
 origin=np.array([x.flat[0],y.flat[0],z.flat[0]]);v,f,_,_=marching_cubes(field.astype('float32'),0,spacing=(step,)*3,allow_degenerate=False);v+=origin
 # Quadric reduction and regularization before openings; topology is checked separately.
 points=vtk.vtkPoints();points.SetData(numpy_to_vtk(v,deep=True));cells=vtk.vtkCellArray();cells.ImportLegacyFormat(numpy_to_vtk(np.c_[np.full(len(f),3),f].astype(np.int64).ravel(),deep=True,array_type=vtk.VTK_ID_TYPE));poly=vtk.vtkPolyData();poly.SetPoints(points);poly.SetPolys(cells)
 dec=vtk.vtkQuadricDecimation();dec.SetInputData(poly);dec.SetTargetReduction(max(0,1-3600/len(f)));dec.VolumePreservationOn();dec.Update()
 smooth=vtk.vtkWindowedSincPolyDataFilter();smooth.SetInputConnection(dec.GetOutputPort());smooth.SetNumberOfIterations(20);smooth.SetPassBand(.08);smooth.NormalizeCoordinatesOn();smooth.Update();p=smooth.GetOutput();v=vtk_to_numpy(p.GetPoints().GetData()).copy();f=vtk_to_numpy(p.GetPolys().GetConnectivityArray()).reshape(-1,3).copy();mesh=trimesh.Trimesh(v,f,process=True);mesh.fix_normals()
 for point,normal in [(np.array([0,.795*scale,0]),np.array([0,1,0])),(np.array([0,1.528*scale,0]),np.array([0,-1,0]))]+cuts:
  mesh=mesh.slice_plane(point,normal,cap=False);mesh.remove_unreferenced_vertices()
 mesh.merge_vertices();mesh.fix_normals();v=np.array(mesh.vertices);f=np.array(mesh.faces)
 # Verify outward orientation on open surface (outward sign checked against implicit gradient by volume prior to cuts).
 # Pair each vertex to its lining; stitch only true boundary edges.
 n=len(v);normal=np.array(mesh.vertex_normals)
 from scipy.ndimage import map_coordinates,gaussian_filter
 gradient=np.array([map_coordinates(g,(v-origin).T/step,order=1,mode='nearest') for g in np.gradient(gaussian_filter(field,1.0))]).T
 gradient/=np.maximum(np.linalg.norm(gradient,axis=1)[:,None],1e-12)
 # The implicit gradient supplies coherent inner offsets; use geometric normals at singular points only.
 good=(gradient*normal).sum(1)>.3;normal[good]=gradient[good]
 inner=v-.0025*scale*normal
 edges=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1);e,c=np.unique(edges,axis=0,return_counts=True);boundary={tuple(row) for row in e[c==1]};rim=[]
 for a,b,c in f:
  for i,j in [(a,b),(b,c),(c,a)]:
   if tuple(sorted((i,j))) in boundary:rim.extend([[j,i,i+n],[j,i+n,j+n]])
 return np.r_[v,inner],np.r_[f,f[:,::-1]+n,np.array(rim)],n

def author_weights(source, v, n):
    J={j['name']:j for j in source['joints']}; A=v[:n]; fields=[]; ids=[]
    for name,end,r in [('root','spine03',.16),('spine03','spine02',.12),('spine02','spine01',.12),('spine01','neck01',.12),('neck01','head',.09),('upperarm01.L','lowerarm01.L',.09),('lowerarm01.L','wrist.L',.09),('upperarm01.R','lowerarm01.R',.09),('lowerarm01.R','wrist.R',.09),('upperleg01.L','lowerleg01.L',.13),('upperleg01.R','lowerleg01.R',.13)]:
        a,b=np.array(J[name]['position']),np.array(J[end]['position']);ab=b-a;t=np.clip((A-a)@ab/np.dot(ab,ab),0,1);d=np.linalg.norm(A-a-t[:,None]*ab,axis=1);fields.append(np.exp(-.5*(d/r)**2));ids.append(J[name]['id'])
    w=np.array(fields).T;ix=np.argsort(w,axis=1,kind='stable')[:,-8:][:,::-1]; w=np.take_along_axis(w,ix,axis=1);w/=w.sum(1)[:,None];ix=np.array(ids)[ix];return np.r_[ix,ix],np.r_[w,w]

def build(source):
    v,f,n=make(source);j,w=author_weights(source,v,n);mesh=trimesh.Trimesh(v,f,process=False);ns=np.array(mesh.vertex_normals);w4=w[:,:4]/w[:,:4].sum(1)[:,None]
    return {'name':'authored artisan tunic','component':'clothing','layer':1,'region':'torso/arms/thigh','color':[.36,.32,.235],'material':{'kind':'cloth','roughness':.94,'metallic':0},'positions':v.flatten().tolist(),'indices':f.flatten().tolist(),'normals':ns.flatten().tolist(),'joints':j[:,:4].flatten().tolist(),'weights':w4.flatten().tolist(),'joints8':j.flatten().tolist(),'weights8':w.flatten().tolist(),'outerVertexCount':n,'thickness':.0025,'binding':0,'authoredSpec':{'revision':'p0.4-implicit-a3','units':'metres','bodyReferenceHeight':1.74813,'method':'smooth union, quadric decimation, implicit gradient lining','weightField':'author-defined distance to bone segments, normalized top eight','openings':['neck','hem','left cuff','right cuff'],'approval':'experimental; no admission','historicalReference':'Northern European working tunic, c. 1330–1380, inspired by Bocksten clothing; not a reconstruction','sourceUrls':['https://www.museumhalland.se/en/the-bocksten-man/the-bocksten-mans-outfit/','https://doi.org/10.59500/ADXG6035']}}

def main():
    source=json.loads(Path(sys.argv[1]).read_text());p=build(source);rig=[{k:j[k] for k in ['id','name','parent','position','local']} for j in source['joints']];Path(sys.argv[2]).write_text(json.dumps({'version':1,'rig':rig,'parts':[p]},separators=(',',':'),allow_nan=False));print('vertices',len(p['positions'])//3,'triangles',len(p['indices'])//3)
if __name__=='__main__':main()
