// A real strategic edge is either continuous dry road or a road with
// a bridge over an actual fine river. Never span sea, lakes or unknown land.
import {sampleLine} from './atlas-human-layout.mjs';
export function roadLink(a,b,env,bridge){const n=Math.max(16,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*24)),samples=[];for(let i=0;i<=n;i++){const t=i/n,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(!env.permitted(...p)||env.water(...p))return null;samples.push({p,wet:env.river(...p,.004)});}
 const wet=samples.map((s,i)=>s.wet?i:-1).filter(i=>i>=0);if(wet.length&&!bridge)return null;const spans=[];let start=-1;for(let i=0;i<samples.length;i++){if(samples[i].wet&&start<0)start=i;if(!samples[i].wet&&start>=0){spans.push([Math.max(0,start-1),i]);start=-1;}}if(start>=0)spans.push([Math.max(0,start-1),n]);const onBridge=i=>spans.some(([a,b])=>i>a&&i<=b);return {samples,spans,segments:samples.slice(1).map((s,i)=>({a:samples[i].p,b:s.p,bridge:onBridge(i+1)})),continuous:true};}
