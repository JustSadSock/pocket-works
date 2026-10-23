import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

// Browser-like pointer sampling with coalesced touch events. The continuous
// stroke stays editable; subpixel jitter should not schedule Canvas2D frames.
const originalWindow=globalThis.window,originalDocument=globalThis.document;
let renders=0;
const noop=()=>{};
const cl={add:noop,remove:noop,toggle:noop,contains:()=>false};
const canvas={
 width:600,height:450,style:{},classList:cl,
 addEventListener:noop,setPointerCapture:noop,
 getBoundingClientRect:()=>({left:0,top:0,right:600,bottom:450,width:600,height:450})
};
const viewport={
 clientWidth:600,clientHeight:450,clientLeft:0,clientTop:0,classList:cl,
 addEventListener:noop,getBoundingClientRect:canvas.getBoundingClientRect
};
const root={
 querySelector:()=>null,querySelectorAll:()=>[],addEventListener:noop
};
const e=Object.assign(Object.create(Editor.prototype),{
 root,canvas,viewport,zone:{x:0,y:0,w:600,h:450},
 color:'#334455',tool:'brush',size:8,
 strokes:[],redoStack:[],working:null,pointers:new Map(),
 inputMode:'direct',hand:'right',activePenPointer:null,
 aimPointer:null,armed:false,armPointer:null,spaceTool:null,
 cursor:null,closed:false,scale:1,tx:0,ty:0,
 edgePaused:false,edgeGestureGroup:null,outsidePoint:null,
 onSound:noop,onChange:noop,render(){renders++},save:noop
});
const event=(type,x,y,coalesced=[])=>({
 type,pointerType:'touch',pointerId:9,button:0,
 clientX:x,clientY:y,target:canvas,preventDefault:noop,
 getCoalescedEvents:()=>coalesced.map(([xx,yy])=>({
  clientX:xx,clientY:yy,pointerType:'touch',pointerId:9
 }))
});
try{
 globalThis.window={addEventListener:noop,visualViewport:null};
 globalThis.document={addEventListener:noop,querySelector:()=>null};
 e.attach();
 e.down(event('pointerdown',100,100));
 assert.equal(renders,1,'pointer down paints a single mark');
 for(let i=0;i<120;i++)e.move(event('pointermove',100+.1,100+.1,[[100+.1,100+.1]]));
 assert.equal(renders,1,'120 stationary/jitter events never schedule a frame');
 assert.equal(e.working.p.length,1,'jitter does not enlarge stroke buffers');
 e.move(event('pointermove',130,125,[[105,105],[110,110],[120,120]]));
 assert.equal(renders,2,'batched new points schedule one frame');
 const accepted=e.working.p.length;
 assert.ok(accepted>=4,'coalesced pointer samples are preserved');
 for(let i=0;i<100;i++)e.move(event('pointermove',130,125));
 assert.equal(renders,2,'duplicates after movement do not trigger a frame');
 assert.equal(e.working.p.length,accepted);
 e.move(event('pointermove',165,155,[[145,137],[155,145]]));
 assert.equal(renders,3,'further movement still draws');
 e.up(event('pointerup',165,155));
 assert.equal(e.strokes.length,1,'one gesture remains one stroke');
 assert.equal(e.working,null);
 assert.equal(renders,4,'pointer release commits the final stroke');
 console.log(JSON.stringify({scenario:'zamazka-coalesced-pointer-dedup',
 unchangedEvents:220,renderPasses:renders,
 points:e.strokes[0].p.length,result:'passed'}));
}finally{
 globalThis.window=originalWindow;
 globalThis.document=originalDocument;
}
