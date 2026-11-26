// Visual-only material fields independent of mesh density.
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),S=t=>{t=C(t);return t*t*(3-2*t)},L=(a,b,t)=>a+(b-a)*t;
function hash(x,y){let n=Math.imul(x+397,374761393)^Math.imul(y-581,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
export function overviewMaterial(p,shore){const {x,y,H,wet,fert,forest,slope,curvature}=p,patch=noise(x*.32,y*.32),grain=noise(x*1.45+11,y*1.45),alpine=S((H-.35)/.23),rock=S((slope-.04)/.48)*(.55+.45*alpine),wood=S((forest-.12)/.65)*(1-rock),beach=(1-S(shore/.033))*(1-rock),snow=S((H-.63)/.16)*(1-rock*.4),soil=C(.52*wet+.25*fert+.23*patch),talus=alpine*(1-rock)*S((slope-.03)/.32),stone=C(.5+curvature*2+(grain-.5)*.55);
 const grass=[L(185,112,soil),L(164,141,soil),L(113,91,soil)],tree=[L(55,81,patch),L(80,111,patch),L(53,67,patch)],scree=[162,148,123],cliff=[L(118,196,stone),L(115,187,stone),L(105,169,stone)],sand=[187,168,126],ice=[221,223,209];
 return grass.map((v,i)=>L(L(L(L(L(v,tree[i],wood*.83),scree[i],talus*.56),cliff[i],Math.max(rock,alpine*.3)),sand[i],beach*.68),ice[i],snow*.85)+(grain-.5)*5);
}
export function fineNormal(g,X,Y,vertical){const r=g.detail,w=g.width,h=g.height,x=C(Math.round(X*r),0,w-1),y=C(Math.round(Y*r),0,h-1),step=Math.max(1,Math.round(r*.5)),at=(x,y)=>{const i=C(y,0,h-1)*w+C(x,0,w-1),bed=g.bed[i];return g.land[i]?vertical(bed):-(Math.max(0,.12-bed)*3.1+.025);},dx=(at(x+step,y)-at(x-step,y))*r/(2*step),dy=(at(x,y+step)-at(x,y-step))*r/(2*step),n=Math.hypot(dx,dy,1);return [-dx/n,-dy/n,1/n];}
