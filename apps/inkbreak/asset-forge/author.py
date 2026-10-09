"""Deterministic authored courier: tapered cloth volumes and a single skinned mesh.
No external assets. Flat normals deliberately preserve ink-cut facets.
Bone-local construction permits runtime animation without floating limb props.
"""
import math,json,pathlib
P=[];N=[];W=[];J=[];C=[]
colors={'coat':[.78,.20,.14],'ink':[.09,.12,.13],'paper':[.94,.87,.69],'boot':[.16,.20,.20]}
bones=[['root',-1,[0,0,0]],['chest',0,[0,1.0,0]],['head',1,[0,.7,0]],['armL',1,[-.43,.45,0]],['armR',1,[.43,.45,0]],['legL',0,[-.22,.85,0]],['legR',0,[.22,.85,0]],['cape',1,[0,.4,-.22]]]
def tri(a,b,c,col,bone):
 b,c=c,b
 u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];l=math.sqrt(sum(x*x for x in n)) or 1;n=[x/l for x in n]
 for p in [a,b,c]:P.extend(p);N.extend(n);C.extend(col);J.extend([bone,0,0,0]);W.extend([1,0,0,0])
def loft(rings,col,bone,sides=8):
 rows=[]
 for y,rx,rz,x,z in rings:rows.append([[x+rx*math.cos(2*math.pi*i/sides+math.pi/8),y,z+rz*math.sin(2*math.pi*i/sides+math.pi/8)] for i in range(sides)])
 for a,b in zip(rows,rows[1:]):
  for i in range(sides):j=(i+1)%sides;tri(a[i],a[j],b[j],col,bone);tri(a[i],b[j],b[i],col,bone)
 for row,flip in [(rows[0],True),(rows[-1],False)]:
  center=[sum(p[k] for p in row)/sides for k in range(3)]
  for i in range(sides):tri(center,row[(i+1)%sides] if flip else row[i],row[i] if flip else row[(i+1)%sides],col,bone)
loft([(1,.37,.23,0,0),(1.35,.45,.25,0,0),(1.7,.32,.19,0,0)],colors['coat'],1)
loft([(.62,.49,.32,0,-.02),(1,.36,.23,0,0)],colors['coat'],0)
loft([(1.72,.22,.2,0,0),(2.0,.32,.25,0,-.025),(2.2,.23,.18,0,-.04),(2.3,.08,.07,0,-.045)],colors['ink'],2)
# Long ivory nib, prominent silhouette.
loft([(1.86,.19,.11,0,.20),(1.9,.09,.29,0,.31),(1.96,.10,.15,0,.24)],colors['paper'],2,4)
for x,b in [(-.44,3),(.44,4)]:
 loft([(1.03,.12,.12,x,0),(1.42,.16,.16,x,0),(1.58,.12,.12,x,0)],colors['coat'],b)
 loft([(.95,.12,.12,x,.015),(1.1,.13,.13,x,.015)],colors['ink'],b)
for x,b in [(-.22,5),(.22,6)]:
 loft([(.15,.13,.14,x,0),(.85,.16,.15,x,0)],colors['ink'],b)
 loft([(.04,.16,.24,x,.08),(.26,.14,.17,x,.04)],colors['boot'],b)
# Solid cape silhouette: tapered paper cut, weighted to cape bone.
loft([(.62,.58,.06,0,-.37),(1.2,.45,.05,0,-.30),(1.5,.28,.06,0,-.24)],colors['coat'],7,4)
# Ivory eye slashes on the hood.
for x in [-.14,.14]:loft([(2.005,.075,.015,x,.212),(2.035,.065,.012,x,.211)],colors['paper'],2,4)
out={'positions':P,'normals':N,'colors':C,'skinIndices':J,'skinWeights':W,'bones':bones,'provenance':'Original deterministic courier mesh authored for inkbreak; MIT; author.py'}
pathlib.Path(__file__).resolve().parents[1].joinpath('assets/courier.json').write_text(json.dumps(out,separators=(',',':')))
