import assert from 'node:assert/strict';
import {Editor, drawStroke, strokeTouchesPoint, pointOnDamageEdge, firstDamageEntry, simplifyPoints, smudgeStroke, MIN_BRUSH_SIZE, MAX_STROKE_POINTS, MAX_STROKES, MAX_TOTAL_POINTS, MAX_EDITOR_ZOOM} from '../editor.js';
import {floodFillRaster} from '../fill-core.js';

// Reproducible tool interaction matrix. Each check exercises actual editor code.
let passed=0;
const failures=[];
function verify(name,fn){
 try{fn();passed++}
 catch(error){failures.push({name,message:error.stack||String(error)});console.error('FAIL '+name+': '+error.message)}
}
const rectangle={x:40,y:40,w:210,h:180,points:[[40,40],[250,40],[250,220],[40,220]]};
const whole={x:0,y:0,w:600,h:450,points:[[0,0],[600,0],[600,450],[0,450]]};
function fakeEditor(zone=rectangle){
 const root={querySelector(){return null},querySelectorAll(){return []},addEventListener(){}};
 const viewport={clientWidth:600,clientHeight:450,clientLeft:0,clientTop:0,classList:{toggle(){},add(){},remove(){}},addEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:600,height:450}}};
 const canvas={width:600,height:450,style:{},getBoundingClientRect(){return {left:0,top:0,right:600,bottom:450,width:600,height:450}},addEventListener(){},setPointerCapture(){},classList:{add(){},remove(){}}};
 return Object.assign(Object.create(Editor.prototype),{
  zone,root,viewport,canvas,cursor:null,armButton:null,sideButton:null,
  tool:'brush',color:'#284d6e',size:8,inputMode:'direct',hand:'right',
  strokes:[],redoStack:[],working:null,pointers:new Map(),scale:1.9,tx:0,ty:0,
  closed:false,armed:false,armPointer:null,aimPointer:null,aim:null,spaceTool:null,
  edgePaused:false,edgeGestureGroup:null,outsidePoint:null,limitWarned:false,
  render(){},save(){},onChange(){},onSound(){},hidePickerPreview(){},
  updateDrawingTip(){},updatePrecisionHelp(){},hideCursor(){},showCursor(){},
  cursorContact(){}
 });
}
const pointer=(id,x,y,type='mouse',button=0)=>({pointerId:id,clientX:x,clientY:y,pointerType:type,button,target:null,type:'pointerup',preventDefault(){},stopPropagation(){}});
function interactive(zone=whole){
 const editor=fakeEditor(zone);
 const oldWin=globalThis.window,oldDoc=globalThis.document;
 globalThis.window={addEventListener(){}};
 globalThis.document={addEventListener(){},querySelector(){return null},visibilityState:'visible'};
 try{editor.attach()}finally{globalThis.window=oldWin;globalThis.document=oldDoc}
 return editor;
}
function doCommand(e,cmd){
 e.actions({target:{closest(){return {dataset:{cmd}}}}});
}
function floodFixture(w=60,h=42){
 const walls=new Uint8ClampedArray(w*h*4),zone=new Uint8ClampedArray(w*h*4),output=new Uint8ClampedArray(w*h*4);
 for(let i=3;i<zone.length;i+=4)zone[i]=255;
 return {w,h,walls,zone,output,pixel:(x,y)=>(y*w+x)*4};
}
function bucket(f,x,y,color){
 return floodFillRaster({width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point:[x,y],color});
}
function channel(f,x,y,ch=0){return f.output[f.pixel(x,y)+ch]}

// 32 independent basin geometries; each requires fill, isolation, recolour and no leakage.
for(let seed=0;seed<32;seed++)verify('bucket: jagged two-region contour seed '+seed,()=>{
 const f=floodFixture(),line=y=>29+Math.round(3*Math.sin((y+seed)/6)),thick=seed%3+1;
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const d=Math.abs(x-line(y)),i=f.pixel(x,y);
  if(d<thick)f.walls[i+3]=255;
  else if(d===thick)f.walls[i+3]=125;
 }
 assert(bucket(f,7,21,[230,25,60])>100);
 assert.equal(channel(f,52,21,3),0,'spill before the second fill');
 assert(bucket(f,52,21,[30,55,210])>100);
 assert.equal(channel(f,7,21),230,'right fill changed left');
 assert(bucket(f,7,21,[25,180,70])>100);
 assert.equal(channel(f,52,21,2),210,'left recolour changed right');
 assert.equal(channel(f,7,21,1),180);
});
for(let gap of [1,2])verify('bucket: seal '+gap+'px pinhole',()=>{
 const f=floodFixture(64,48);
 for(let y=0;y<48;y++)if(y<21||y>=21+gap)f.walls[f.pixel(32,y)+3]=255;
 assert(bucket(f,10,15,[210,40,70])>100);
 assert.equal(channel(f,52,15,3),0);
});
for(let mode=0;mode<8;mode++)verify('bucket: detached micro-island '+mode,()=>{
 const f=floodFixture(20,20);
 for(let i=3;i<f.walls.length;i+=4)f.walls[i]=255;
 const x=4+mode,y=6+mode%4;
 for(const [a,b] of [[x,y],[x+1,y+1]])f.walls[f.pixel(a,b)+3]=0;
 assert.equal(bucket(f,x,y,[80,90,100]),1);
 assert.equal(channel(f,x+1,y+1,3),0);
});
for(const [name,changes] of [
 ['zero width',{width:0}],['negative height',{height:-3}],['NaN hit',{point:[NaN,1]}],
 ['short color',{color:[1,2]}],['absent zone',{zone:null}],['short wall',{walls:new Uint8Array(2)}],
 ['short output',{output:new Uint8Array(2)}],['noninteger width',{width:5.5}]
])verify('bucket: invalid input '+name,()=>{
 const f=floodFixture(12,12),args={width:f.w,height:f.h,walls:f.walls,zone:f.zone,output:f.output,point:[4,4],color:[5,10,15]};
 assert.equal(floodFillRaster({...args,...changes}),0);
});
verify('bucket: completely masked area',()=>{
 const f=floodFixture(18,18);f.zone.fill(0);assert.equal(bucket(f,8,8,[11,22,33]),0);
});
verify('bucket: 600x450 large canvas, two-way separation',()=>{
 const f=floodFixture(600,450);
 for(let y=0;y<450;y++)f.walls[f.pixel(300,y)+3]=255;
 assert(bucket(f,100,225,[199,60,40])>100000);
 assert.equal(channel(f,500,225,3),0);
 assert(bucket(f,500,225,[20,70,220])>100000);
 assert.equal(channel(f,100,225),199);
});

// Geometric hit testing at native, very thin, portrait and wide aspect.
const shapes=[
 [{t:'brush',s:8,p:[[80,90],[140,90]]},[110,90],true],
 [{t:'brush',s:8,p:[[80,90],[140,90]]},[110,101],false],
 [{t:'erase',s:12,p:[[80,90],[140,90]]},[110,91],true],
 [{t:'pencil',s:4,p:[[80,90],[140,90]]},[110,96],false],
 [{t:'spray',s:10,p:[[80,90],[140,90]]},[110,97],true],
 [{t:'brush',s:.25,p:[[80,90]]},[80,90],true],
 [{t:'brush',s:.25,p:[[80,90]]},[80,92],false],
 [{t:'fill',s:20,p:[[80,90]]},[80,90],false]
];
for(let i=0;i<shapes.length;i++)verify('nib: hit testing '+i,()=>{
 const [stroke,point,expected]=shapes[i];
 assert.equal(strokeTouchesPoint(stroke,point),expected);
});
for(const aspect of [.65,1,1.333,2.2])verify('nib: geometric brush remains pickable at aspect '+aspect,()=>{
 const stroke={t:'brush',s:7,p:[[100,100],[150,100]]};
 assert(strokeTouchesPoint(stroke,[130,100],aspect));
 assert(!strokeTouchesPoint(stroke,[130,120],aspect));
});
verify('nib: invalid points never register',()=>{
 assert.equal(strokeTouchesPoint({t:'brush',s:6,p:[[80,90]]},[NaN,90]),false);
 assert.equal(strokeTouchesPoint({t:'brush',s:6,p:[]},[80,90]),false);
});
for(const [name,stroke,expected] of [
 ['brush',{t:'brush',s:8,c:'#123456',p:[[100,100],[110,110]]},1],
 ['pencil',{t:'pencil',s:8,c:'#123456',p:[[100,100],[110,110]]},1],
 ['spray',{t:'spray',s:8,c:'#123456',p:[[100,100],[110,110]]},0],
 ['eraser',{t:'erase',s:8,c:'#123456',p:[[100,100],[110,110]]},1]
])verify('renderer: tangible '+name+' output',()=>{
 const trace={lines:0,dabs:0,opacity:[],lineWidth:0,scales:[]};
 const ctx={globalAlpha:1,save(){},restore(){},scale(x,y){trace.scales.push([x,y])},
  beginPath(){},arc(){trace.dabs++},fill(){},moveTo(){},lineTo(){},stroke(){trace.lines++;trace.lineWidth=this.lineWidth}};
 drawStroke(ctx,stroke,.7);
 assert.equal(trace.lines,expected);
 assert(trace.dabs>0);
 assert.equal(ctx.globalAlpha,1);
 assert(trace.scales.length);
 if(name==='pencil')assert.equal(trace.lineWidth,3.2);
 if(name==='eraser')assert.equal(ctx.strokeStyle,'#e8ddc6');
});
for(const [name,p,tolerance,expected] of [
 ['inside',[100,100],0,true],['far outside',[15,90],2,false],
 ['adjacent edge',[39,100],2,true],['no snap permitted',[39,100],0,false],
 ['too far outside',[25,100],3,false]
])verify('mask: '+name,()=>{
 assert.equal(Boolean(pointOnDamageEdge(rectangle,p,tolerance)),expected);
});
verify('mask: fast outside-to-inside entry',()=>{
 const p=firstDamageEntry(rectangle,[0,100],[130,100]);assert(p&&p[0]>=40&&p[0]<44);
});
verify('mask: outside-to-outside never enters',()=>{
 assert.equal(firstDamageEntry(rectangle,[0,100],[1,100]),null);
});
for(const length of [6,10,20,48,96])verify('geometry: simplification '+length,()=>{
 const points=Array.from({length:200},(_,i)=>[i,Math.sin(i/11)*10]);
 const result=simplifyPoints(points,length);
 assert.equal(result.length,length);
 assert.deepEqual(result[0],points[0]);
 assert.deepEqual(result.at(-1),points.at(-1));
});

// Real editor strokes and combinations.
for(const tool of ['brush','erase','smudge'])verify('editor: gesture committed as '+tool,()=>{
 const e=fakeEditor();e.tool=tool;
 e.beginStroke([80,80]);e.extendStroke([100,100]);e.finishStroke();
 assert.equal(e.strokes.length,1);
 assert.equal(e.strokes[0].t,tool);
 assert.equal(e.strokes[0].p.length,2);
});
for(const count of [96,140,360])verify('editor: uninterrupted '+count+'-point gesture',()=>{
 const e=fakeEditor(whole);e.beginStroke([20,80]);
 for(let i=1;i<=count;i++)e.extendStroke([20+i,80+(i%5)]);
 e.finishStroke();
 assert(e.strokes.length>=Math.ceil(count/MAX_STROKE_POINTS));
 assert(e.strokes.every(s=>s.p.length<=MAX_STROKE_POINTS));
 assert.equal(e.strokes.reduce((sum,s)=>sum+s.p.length,0),e.countPoints());
 assert.equal(new Set(e.strokes.map(s=>s.g)).size,1);
});
verify('editor: outside start then reentry creates a single ink gesture',()=>{
 const e=fakeEditor();
 e.beginStroke([5,70]);assert.equal(e.strokes.length,0);
 e.beginStroke([80,70]);e.extendStroke([100,70]);e.finishStroke();
 assert.equal(e.strokes.length,1);assert(e.strokes[0].p.every(p=>p[0]>=40));
});
verify('editor: entirely outside gesture is invisible',()=>{
 const e=fakeEditor();e.beginStroke([10,10]);e.finishStroke();assert.equal(e.strokes.length,0);
});
verify('editor: leave and reenter keeps one undo group',()=>{
 const e=fakeEditor();
 e.beginStroke([80,80]);e.extendStroke([100,80]);e.extendStroke([350,80]);e.beginStroke([120,90]);e.finishStroke();
 assert.equal(e.strokes.length,2);
 assert.equal(e.strokes[0].g,e.strokes[1].g);
});
verify('editor: changing tools commits active stroke',()=>{
 const e=fakeEditor();e.beginStroke([100,100]);e.extendStroke([110,110]);
 e.setTool('erase');assert.equal(e.strokes.length,1);assert.equal(e.working,null);assert.equal(e.tool,'erase');
});
verify('editor: invalid tools do not replace selection',()=>{
 const e=fakeEditor();e.setTool('nonexistent');assert.equal(e.tool,'brush');
});
verify('editor: undo grouped gesture, redo restores exact points',()=>{
 const e=interactive();
 e.beginStroke([80,80]);for(let i=1;i<125;i++)e.extendStroke([80+i,80+i%4]);e.finishStroke();
 const before=e.getSnapshot();
 doCommand(e,'undo');assert.equal(e.strokes.length,0);
 doCommand(e,'redo');assert.deepEqual(e.getSnapshot(),before);
});
verify('editor: new painting after undo clears redo',()=>{
 const e=interactive();e.beginStroke([70,70]);e.finishStroke();doCommand(e,'undo');
 e.beginStroke([90,90]);e.finishStroke();
 assert.equal(e.redoStack.length,0);
});
verify('editor: brush size quantizes to quarter pixel',()=>{
 const e=fakeEditor();e.setBrushSize(.33);assert.equal(e.size,.25);
 e.setBrushSize(48.6);assert.equal(e.size,48);
 e.setBrushSize(-20);assert.equal(e.size,MIN_BRUSH_SIZE);
});
verify('editor: 8x zoom and minimum bound',()=>{
 const e=fakeEditor();e.zoom(100);assert.equal(e.scale,MAX_EDITOR_ZOOM);
 e.zoom(.00001);assert.equal(e.scale,1);
});
verify('editor: pointer mapping at right and bottom edges',()=>{
 const e=fakeEditor();assert.deepEqual(e.point({clientX:600,clientY:450}),[600,450]);
 assert.deepEqual(e.point({clientX:-10,clientY:-10}),[0,0]);
});
for(const mode of ['brush','fill','picker'])verify('precision: nib offsets '+mode,()=>{
 const e=fakeEditor();e.inputMode='precision';e.hand='right';e.tool=mode;
 const tip=e.tip({clientX:140,clientY:150,pointerType:'touch'});
 assert.equal(tip.clientX,mode==='brush'?122:140);
 assert.equal(tip.clientY,mode==='brush'?100:150);
});
verify('precision: left-hand nib mirrors offset',()=>{
 const e=fakeEditor();e.inputMode='precision';e.hand='left';
 assert.equal(e.tip({clientX:140,clientY:150,pointerType:'touch'}).clientX,158);
});
verify('precision: mouse never receives touch offset',()=>{
 const e=fakeEditor();e.inputMode='precision';
 assert.equal(e.tip({clientX:140,clientY:150,pointerType:'mouse'}).clientX,140);
});
verify('mouse: down-drag-up paints',()=>{
 const e=interactive();e.down(pointer(1,90,90));e.move(pointer(1,120,120));e.up(pointer(1,120,120));
 assert.equal(e.strokes.length,1);assert(e.strokes[0].p.length>=2);
});
verify('mouse: middle button pans without stroke',()=>{
 const e=interactive();e.down(pointer(1,90,90,'mouse',1));e.move(pointer(1,130,115,'mouse',-1));e.up(pointer(1,130,115));
 assert.equal(e.strokes.length,0);assert.notEqual(e.tx,0);
});
verify('mouse: right button adjusts size without paint',()=>{
 const e=interactive();e.down(pointer(1,90,90,'mouse',2));e.move(pointer(1,150,90,'mouse',-1));e.up(pointer(1,150,90));
 assert.equal(e.strokes.length,0);assert(e.size>8);assert.equal(e.sizeDrag,null);
});
verify('stylus: pen down-drag-up paints',()=>{
 const e=interactive();e.down(pointer(2,90,90,'pen'));e.move(pointer(2,110,100,'pen'));e.up(pointer(2,110,100,'pen'));
 assert.equal(e.strokes.length,1);
});
verify('hand tool: drag moves view only',()=>{
 const e=interactive();e.setTool('hand');e.down(pointer(1,100,100));e.move(pointer(1,140,115));e.up(pointer(1,140,115));
 assert.equal(e.strokes.length,0);assert.equal(e.tx,40);
});
verify('bucket tool: one tap saves exactly one operation',()=>{
 const e=interactive();e.setTool('fill');e.down(pointer(1,100,100));e.up(pointer(1,100,100));
 assert.equal(e.strokes.length,1);assert.equal(e.strokes[0].t,'fill');assert.equal(e.strokes[0].p.length,1);
});
verify('bucket tool: outside tap does not create operation',()=>{
 const e=interactive(rectangle);e.setTool('fill');e.down(pointer(1,10,10));e.up(pointer(1,10,10));
 assert.equal(e.strokes.length,0);
});
verify('touch precision: touch without arm button never paints',()=>{
 const e=interactive();e.setMode('precision',false);
 e.down(pointer(5,110,150,'touch'));e.move(pointer(5,140,170,'touch'));e.up(pointer(5,140,170,'touch'));
 assert.equal(e.strokes.length,0);
});
verify('touch precision: arm hold paints; release stops drawing',()=>{
 const e=interactive();e.setMode('precision',false);
 e.down(pointer(5,140,150,'touch'));e.armDown(pointer(9,12,20,'touch'));
 e.move(pointer(5,160,158,'touch'));e.armUp(pointer(9,12,20,'touch'));
 const count=e.strokes.length;
 assert(count>=1);assert.equal(e.armed,false);
 e.move(pointer(5,180,160,'touch'));e.up(pointer(5,180,160,'touch'));
 assert.equal(e.strokes.length,count);assert.equal(e.working,null);
});
verify('touch precision: blur clears held arm state',()=>{
 const e=interactive();e.setMode('precision',false);
 e.armDown(pointer(9,10,10,'touch'));e.keyboardBlur();
 assert.equal(e.armed,false);assert.equal(e.armPointer,null);
});
verify('touch gesture: pinch cancels live ink rather than connecting fingers',()=>{
 const e=interactive();e.down(pointer(1,100,100,'touch'));e.move(pointer(1,115,115,'touch'));
 e.down(pointer(2,160,160,'touch'));assert.equal(e.working,null);
 e.move(pointer(2,190,190,'touch'));assert(e.scale>=1&&e.scale<=8);
 e.up(pointer(2,190,190,'touch'));e.up(pointer(1,115,115,'touch'));
 assert.equal(e.pointers.size,0);assert.equal(e.pinch,null);
});
verify('touch: lost capture resets gesture state',()=>{
 const e=interactive();e.down(pointer(1,90,90,'touch'));
 e.lostCapture(pointer(1,90,90,'touch'));assert.equal(e.pointers.size,0);assert.equal(e.working,null);
});
verify('keyboard: individual B/E/S/H shortcuts change tools',()=>{
 const e=interactive();
 for(const [key,tool] of [['KeyB','brush'],['KeyE','erase'],['KeyS','smudge'],['KeyH','hand']]){
  e.keyboardDown({code:key,ctrlKey:false,altKey:false,metaKey:false,preventDefault(){},target:{matches(){return false}}});
  assert.equal(e.tool,tool);
 }
});
verify('keyboard: Space temporarily picks then restores tool',()=>{
 const e=interactive();e.setTool('erase');
 e.keyboardDown({code:'Space',ctrlKey:false,altKey:false,metaKey:false,preventDefault(){},target:{matches(){return false}}});
 assert.equal(e.tool,'picker');e.keyboardUp({code:'Space',preventDefault(){}});
 assert.equal(e.tool,'erase');
});
verify('keyboard: blur releases live touch pointers',()=>{
 const e=interactive();e.down(pointer(1,100,100,'touch'));e.keyboardBlur();
 assert.equal(e.pointers.size,0);assert.equal(e.working,null);
});
verify('snapshot: current uncommitted stroke is copied deeply',()=>{
 const e=fakeEditor();e.beginStroke([80,90]);const backup=e.getSnapshot();
 assert.equal(backup.length,1);backup[0].p[0][0]=5;assert.equal(e.working.p[0][0],80);
});
verify('editor budget: hundreds of strokes remain under hard caps',()=>{
 const e=fakeEditor(whole);
 for(let i=0;i<410;i++){e.beginStroke([80+i%30,80+i%30]);e.finishStroke()}
 assert(e.strokes.length<=MAX_STROKES);
 assert(e.countPoints()<=MAX_TOTAL_POINTS);
});

// Standalone real-raster smudge invariants: deterministic and strictly local.
function smudgeFixture(){
 const w=600,h=450,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,red=x<300;data[i]=red?220:25;data[i+1]=red?40:65;data[i+2]=red?30:210;data[i+3]=255;
 }
 const ctx={canvas:{width:w,height:h},
  getImageData(x,y,width,height){
   const pixels=new Uint8ClampedArray(width*height*4);
   for(let row=0;row<height;row++)pixels.set(data.subarray(((y+row)*w+x)*4,((y+row)*w+x+width)*4),row*width*4);
   return {width,height,data:pixels};
  },
  putImageData(image,x,y){
   for(let row=0;row<image.height;row++)data.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),((y+row)*w+x)*4);
  }
 };
 return {w,h,data,ctx,at:(x,y)=>(y*w+x)*4};
}
verify('smudge: warm paint pulled into blue pigment',()=>{
 const f=smudgeFixture(),k=f.at(304,225),before=f.data[k];
 smudgeStroke(f.ctx,{t:'smudge',s:22,p:[[294,225],[298,225],[302,225],[306,225],[311,225]]});
 assert(f.data[k]>before);
});
verify('smudge: distant pixel is never altered',()=>{
 const f=smudgeFixture(),k=f.at(500,225),before=Array.from(f.data.slice(k,k+4));
 smudgeStroke(f.ctx,{t:'smudge',s:22,p:[[294,225],[298,225],[302,225],[306,225],[311,225]]});
 assert.deepEqual(Array.from(f.data.slice(k,k+4)),before);
});
verify('smudge: incremental stroke matches one-shot replay',()=>{
 const f=smudgeFixture(),g=smudgeFixture(),points=[[294,225],[298,225],[302,225],[306,225],[311,225]];
 smudgeStroke(f.ctx,{t:'smudge',s:22,p:points});
 smudgeStroke(g.ctx,{t:'smudge',s:22,p:points.slice(0,2)});
 smudgeStroke(g.ctx,{t:'smudge',s:22,p:points.slice(0,4)},2);
 smudgeStroke(g.ctx,{t:'smudge',s:22,p:points},4);
 assert.deepEqual(f.data,g.data);
});

console.log('ZAMAZKA tool matrix: '+passed+' passed, '+failures.length+' failed, '+(passed+failures.length)+' independent scenarios');
if(failures.length)throw new AggregateError(failures.map(item=>new Error(item.name+': '+item.message)),'ZAMAZKA tool-matrix failures');
