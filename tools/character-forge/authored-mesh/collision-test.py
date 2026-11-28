import numpy as np
from collision import classify
v=np.array([[0.,0.,0.],[2.,0.,0.],[0.,2.,0.],[.5,.5,-1.],[.5,.5,1.],[.5,1.5,0.]])
f=np.array([[0,1,2],[3,4,5]],dtype=np.int64)
assert list(classify(v,f,6,2)[1])==[(0,1)]
assert list(classify(v,f,3,1)[1])==[(0,1)]
assert list(classify(v,f,6,0)[1])==[]
v[3:,0]+=3
assert list(classify(v,f,6,2)[1])==[]
print('strict collision controls passed')
