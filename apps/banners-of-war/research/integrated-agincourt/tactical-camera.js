import {E} from '../../engine.js';
import {renderHeight} from '../battlefield-identity/terrain-tiles.js';
// Identical 60-degree plane used by battle-art.js and terrain-tiles.js. Only
// screen coordinates change; metres, authoritative units and terrain never do.
const S=Math.sin(Math.PI/3),T=.5;
const cache=new WeakMap();
export function extent(s){
 const F=E.forState(s),t=s.terrain;if(cache.has(t))return cache.get(t);
 let min=Infinity,max=-Infinity;
 // Historical elevations are bilinear samples; their extrema are grid vertices.
 for(const h of t.height||[]){min=Math.min(min,h);max=Math.max(max,h)}
 if(!Number.isFinite(min))min=max=0;
 const top=-max*T-5,e={w:F.H,h:F.W*S-min*T+5-top,top};cache.set(t,e);return e;
}
export function project(s,p,o,k){
 const F=E.forState(s);return {x:o.x+(F.H-p.y)*k,y:o.y+(p.x*S-renderHeight(F,s.terrain,p.x,p.y)*T)*k};
}
export function unproject(s,p,o,k){
 const F=E.forState(s),y=F.H-(p.x-o.x)/k,v=(p.y-o.y)/k;
 // Monotonic for the existing historical field: x*sin60 - h(x,y)/2.
 // Outside the map the same clamped-height projection is extrapolated.
 let lo=Math.min(-F.W,v/S-F.W),hi=Math.max(F.W*2,v/S+F.W);
 for(let i=0;i<42;i++){let x=(lo+hi)/2,z=x*S-renderHeight(F,s.terrain,x,y)*T;if(z<v)lo=x;else hi=x}
 return {x:(lo+hi)/2,y};
}
export function overlay({ctx:g,s,visible,painted,projected:P,selected,orders,draft,colors,k,dpr,phase,playing,observer,sighting,canSee}){
 const F=E.forState(s);g.save();g.setTransform(dpr,0,0,dpr,0,0);
 function path(points,close=false){g.beginPath();for(let i=0;i<points.length;i++){let q=P(points[i]);if(i)g.lineTo(q.x,q.y);else g.moveTo(q.x,q.y)}if(close)g.closePath()}
 function segment(a,b){let n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/12));return Array.from({length:n+1},(_,i)=>({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n}))}
 function line(points,close=false){let p=[];for(let i=0;i<points.length-1;i++)p.push(...segment(points[i],points[i+1]).slice(0,-1));if(points.length)p.push(points.at(-1));if(close&&points.length)p.push(...segment(points.at(-1),points[0]).slice(1));path(p,close)}
 const rectangle=(x,y,w,h,a=0)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([u,v])=>({x:x+u*Math.cos(a)-v*Math.sin(a),y:y+u*Math.sin(a)+v*Math.cos(a)}));
 const circle=(x,y,r)=>Array.from({length:64},(_,i)=>({x:x+r*Math.cos(i*Math.PI/32),y:y+r*Math.sin(i*Math.PI/32)}));
 for(const q of s.terrain.stakes||[]){line(rectangle(q.x,q.y,q.w,q.h),true);g.fillStyle='#68523d88';g.fill();g.strokeStyle='#e0c49b';g.lineWidth=1;g.stroke();for(let y=q.y-q.h/2;y<=q.y+q.h/2;y+=4){let p=P({x:q.x,y});g.strokeStyle='#503e2b';g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x-1.5*k,p.y-1.5*k);g.stroke()}}
 for(const q of s.objective?.zones||[]){line(circle(q.x,q.y,q.r),true);g.strokeStyle='#ead8a7';g.lineWidth=1.5;g.setLineDash([7,5]);g.stroke();g.setLineDash([]);let p=P(q);g.font='11px system-ui';g.textAlign='center';g.fillStyle='#ead8a7';g.fillText(q.name,p.x,p.y-12)}
 if(s.fog&&!observer){for(let q of Object.values(s.known?.[0]||{})){if(s.vision?.[0]?.includes(q.id))continue;let p=P(q);g.fillStyle='#645c4e';g.font='bold 12px system-ui';g.fillText('?',p.x,p.y)}}
 for(let u of visible){
  const p=P(u),dims=F.dims(u),isSelected=selected.has(u.id),col=colors[u.side];
  if(!painted.has(u.id)){
   for(let b of F.bodies(u)){line(rectangle(b.x,b.y,b.geometry.d,b.geometry.w,b.a),true);g.fillStyle=col+'c4';g.fill();g.strokeStyle='#eadfc3';g.lineWidth=1;g.stroke()}
   g.fillStyle='#f2e6c9';g.font='bold 10px system-ui';g.textAlign='center';g.fillText(u.type==='crossbow'?'АРБ · '+Math.round(u.n):u.type+' · '+Math.round(u.n),p.x,p.y+13);
  }
  if(isSelected){line(rectangle(u.x,u.y,dims.d,dims.w,u.a),true);g.strokeStyle='#f7e8ad';g.lineWidth=2;g.stroke();let range=F.spec(u).range;if(range){line(circle(u.x,u.y,range),true);g.strokeStyle=col+'aa';g.lineWidth=1;g.stroke()}}
  if(phase==='plan'&&u.side===0){let order=orders[u.id]||u.order,points=[u,...(order?.path||[])];if(order?.target!==undefined){let q=sighting(s,order.target);if(q)points.push(q)}if(points.length>1){line(points);g.strokeStyle=col;g.lineWidth=1.6;g.setLineDash([5,3]);g.stroke();g.setLineDash([])}let end=points.at(-1);if(points.length>1){line(rectangle(end.x,end.y,dims.d,dims.w,order.a??u.a),true);g.strokeStyle=col;g.setLineDash([3,3]);g.stroke();g.setLineDash([])}for(let next of orders[u.id]?.stages||u.program||[]){let targets=next.path||[];if(!targets.length&&next.target!==undefined){let q=sighting(s,next.target);if(q)targets=[q]}if(targets.length){line([end,...targets]);g.strokeStyle=col+'aa';g.setLineDash([2,4]);g.stroke();g.setLineDash([]);end=targets.at(-1)}}}
  // The flag is a screen-space command affordance anchored to the projected regiment.
  const off=Math.max(12,Math.min(36,dims.w*k*.36));g.strokeStyle='#29382e';g.lineWidth=1;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x,p.y-off-7);g.stroke();g.fillStyle=col;g.fillRect(p.x,p.y-off-7,15,11);g.font='bold 9px system-ui';g.fillStyle='#f3e7ca';g.textAlign='left';g.fillText(u.type==='guard'?'G':String(u.id%100+1),p.x+1,p.y-off+1);
  if(isSelected){g.font='11px system-ui';g.textAlign='center';g.fillStyle='#efe7cc';g.fillText(Math.round(u.n)+' · '+Math.round(u.morale)+'%',p.x,p.y+Math.max(17,k*dims.w*.32))}
 }
 for(let q of s.shots||[]){let u=visible.find(v=>v.id===q.id);if(!u||(!observer&&s.fog&&!canSee(s,u)))continue;let t=Math.max(0,Math.min(1,(s.time-q.time)/1.7)),p=P({x:q.x+(q.tx-q.x)*t,y:q.y+(q.ty-q.y)*t});g.strokeStyle='#decfa6';g.beginPath();g.moveTo(p.x,p.y-Math.sin(t*Math.PI)*14*k);g.lineTo(p.x-2,p.y-Math.sin(t*Math.PI)*14*k+1);g.stroke()}
 if(draft?.length){line(draft);g.strokeStyle='#efe8be';g.lineWidth=2;g.stroke()}g.restore();
}
