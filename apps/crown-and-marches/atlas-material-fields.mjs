// Visual-only material fields independent of mesh density.
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),S=t=>{t=C(t);return t*t*(3-2*t)},L=(a,b,t)=>a+(b-a)*t;
function hash(x,y){let n=Math.imul(x+397,374761393)^Math.imul(y-581,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
export function overviewMaterial(p,shore){const {x,y,H,wet,fert,forest,slope,curvature}=p,patch=noise(x*.32,y*.32),grain=noise(x*1.45+11,y*1.45),alpine=S((H-.35)/.23),rock=S((slope-.04)/.48)*(.55+.45*alpine),wood=S((forest-.12)/.65)*(1-rock),beach=(1-S(shore/.033))*(1-rock),snow=S((H-.63)/.16)*(1-rock*.4),soil=C(.52*wet+.25*fert+.23*patch),talus=alpine*(1-rock)*S((slope-.03)/.32),stone=C(.5+curvature*2+(grain-.5)*.55);
 const grass=[L(185,112,soil),L(164,141,soil),L(113,91,soil)],tree=[L(55,81,patch),L(80,111,patch),L(53,67,patch)],scree=[162,148,123],cliff=[L(118,196,stone),L(115,187,stone),L(105,169,stone)],sand=[187,168,126],ice=[221,223,209];
 return grass.map((v,i)=>L(L(L(L(L(v,tree[i],wood*.83),scree[i],talus*.56),cliff[i],Math.max(rock,alpine*.3)),sand[i],beach*.68),ice[i],snow*.85)+(grain-.5)*5);
}
export function fineNormal(g,X,Y,vertical){const r=g.detail,w=g.width,h=g.height,x=C(Math.round(X*r),0,w-1),y=C(Math.round(Y*r),0,h-1),step=Math.max(1,Math.round(r*.5)),at=(x,y)=>{const i=C(y,0,h-1)*w+C(x,0,w-1),bed=g.bed[i];return g.land[i]?vertical(bed):-(Math.max(0,.12-bed)*3.1+.025);},dx=(at(x+step,y)-at(x-step,y))*r/(2*step),dy=(at(x,y+step)-at(x,y-step))*r/(2*step),n=Math.hypot(dx,dy,1);return [-dx/n,-dy/n,1/n];}

// Inward paper grain depends solely on world coordinates, never on a hidden
// height or climate field. The same paper is used under land and water.
export function atlasPaper(x,y){const grain=(noise(x*3.2,y*3.2)-.5)*3,cloud=(noise(x*.17+11,y*.17+9)-.5)*7;return [216+grain+cloud,205+grain+cloud*.9,178+grain+cloud*.65];}
export function identityBiome(base,p,shore){const {x,y,H,wet,fert,forest,slope}=p,patch=noise(x*.23+7,y*.23+3),detail=noise(x*1.1,y*1.1),dry=S((.53-wet)/.35)*(1-S((H-.35)/.25)),lush=S((wet-.42)/.35)*(1-S((H-.43)/.23)),wood=S((forest-.22+(patch-.5)*.28)/.55)*(1-S(slope/.5)),foothill=S((H-.24)/.18)*(1-S((H-.53)/.16))*S((slope-.03)/.3),bank=(1-S(shore/.035))*(1-S(slope/.35)),clearing=S((detail-.35)/.4),warm=[175,152,101],meadow=[109,139,86],canopy=[50+patch*18,83+patch*17,58+patch*10],scree=[163,144,115],margin=wet>.48?[96,126,83]:[184,163,117];return base.map((v,i)=>L(L(L(L(L(v,warm[i],dry*.24),meadow[i],lush*.25),canopy[i],wood*(.25+.30*clearing)),scree[i],foothill*.18),margin[i],bank*.29));}
