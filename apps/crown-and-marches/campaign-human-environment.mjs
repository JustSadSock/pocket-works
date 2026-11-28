// Adapter for ordinary campaign geography. No terrain generation or mutation.
// Only current authorized observations are sampled; no inferred hidden coastline.
import {WORLD_SIZES,hash} from './world.mjs';
import {segmentDistance} from './atlas-human-layout.mjs';
export function campaignHumanEnvironment(s,known,fresh,infrastructureFresh=fresh){
 const m=s.map,{w:W,h:H}=WORLD_SIZES[s.worldSize||'standard'],cell=(x,y)=>x<0||y<0||x>=W||y>=H?-1:Math.floor(y)*W+Math.floor(x);
 const eligible=(x,y)=>{const i=cell(x,y);return i>=0&&known(i)&&fresh(i);};
 const permitted=eligible;
 const sampleCache=new Map();const sample=(x,y,key)=>{const ck=key+':'+Math.round(x*10000)+':'+Math.round(y*10000);if(sampleCache.has(ck))return sampleCache.get(ck);const u=x-.5,v=y-.5,X=Math.floor(u),Y=Math.floor(v),a=u-X,b=v-Y,rows=[[X,Y,(1-a)*(1-b)],[X+1,Y,a*(1-b)],[X,Y+1,(1-a)*b],[X+1,Y+1,a*b]];let value=0;for(const [i,j,q] of rows){if(q<1e-9)continue;const p=cell(Math.max(0,Math.min(W-1,i)),Math.max(0,Math.min(H-1,j)));if(!known(p)||!fresh(p))return null;value+=q*m[key][p];}if(sampleCache.size<24000)sampleCache.set(ck,value);return value;};
 const riverSegments=new Map(),roadSegments=new Map();
 const riverLines=i=>{if(riverSegments.has(i))return riverSegments.get(i);const d=m.down[i],row=[];if(known(i)&&fresh(i)&&m.land[i]&&m.river[i]&&d>=0&&known(d)&&fresh(d)){const ax=i%W+.5,ay=Math.floor(i/W)+.5,dx=d%W+.5-ax,dy=Math.floor(d/W)+.5-ay,f=m.land[d]?1:.5,z=(hash(s.seed+'stream'+i)%17-8)/100,bx=ax+dx*f*.5-dy*z,by=ay+dy*f*.5+dx*z,cx=ax+dx*f,cy=ay+dy*f,wide=(m.flow?.[i]||50)>190;let prev=[ax,ay];for(let k=1;k<=8;k++){const t=k/8,u=1-t,p=[u*u*ax+2*u*t*bx+t*t*cx,u*u*ay+2*u*t*by+t*t*cy];row.push([prev,p,wide?.105:.065]);prev=p;}}if(riverSegments.size<512)riverSegments.set(i,row);return row;};
 const roads=i=>{if(roadSegments.has(i))return roadSegments.get(i);const row=[],x=i%W,y=Math.floor(i/W);if(known(i)&&fresh(i)&&infrastructureFresh(i)&&s.road[i])for(const [dx,dy] of [[1,0],[0,1]]){const j=cell(x+dx,y+dy);if(j>=0&&known(j)&&fresh(j)&&infrastructureFresh(j)&&s.road[j])row.push([[x+.5,y+.5],[x+dx+.5,y+dy+.5],.065]);}if(roadSegments.size<512)roadSegments.set(i,row);return row;};
 const distance=(x,y,lines)=>{let d=Infinity;for(let Y=Math.floor(y)-2;Y<=Math.floor(y)+2;Y++)for(let X=Math.floor(x)-2;X<=Math.floor(x)+2;X++){const i=cell(X,Y);if(i<0||!known(i)||!fresh(i))continue;for(const [a,b,r] of lines(i))d=Math.min(d,segmentDistance([x,y],a,b)-r);}return d;};
 const distances=new Map(),nearest=(x,y)=>{const k=Math.round(x*10000)+':'+Math.round(y*10000);let d=distances.get(k);if(d===undefined){d=distance(x,y,riverLines);if(distances.size<24000)distances.set(k,d);}return d;};
 const dry=(x,y,r=0)=>{for(const [dx,dy] of [[0,0],[-r,-r],[-r,r],[r,-r],[r,r]]){const X=x+dx,Y=y+dy,i=cell(X,Y);if(i<0||!eligible(X,Y)||!m.land[i]||(sample(X,Y,'land')??0)<.72)return false;}return nearest(x,y)>r;};
 const water=(x,y)=>{const i=cell(x,y);return i>=0&&eligible(x,y)&&!m.land[i]&&(sample(x,y,'land')??1)<.28;};
 const grade=(x,y)=>{const a=sample(x-.08,y,'height'),b=sample(x+.08,y,'height'),c=sample(x,y-.08,'height'),d=sample(x,y+.08,'height');return [a,b,c,d].some(v=>v==null)?Infinity:Math.hypot(a-b,c-d)/.16;};
 return {width:W,height:H,cell,eligible,permitted,dry,water,grade,river:(x,y,r=0)=>eligible(x,y)&&nearest(x,y)<r,road:(x,y)=>eligible(x,y)&&infrastructureFresh(cell(x,y))&&!!s.road[cell(x,y)],roadClear:(x,y,r)=>distance(x,y,roads)>r,coarse:true};
}
