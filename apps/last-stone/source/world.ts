import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { createVisualKit } from './vendor/visual-kit.js';
import catalog from './catalog.json';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Meshes/instancedMesh';
import { CENTER, SIZE, maxHP, canBuild, type State, type Piece, type Enemy, type Shot, type Kind } from './simulation';

const tone=(v:string)=>Color3.FromHexString(v);
interface Debris { mesh:AbstractMesh; velocity:Vector3; spin:Vector3; age:number }
const worldPos=(x:number,z:number,y=0)=>new Vector3((x-CENTER)*2.25,y,(z-CENTER)*2.25);
export class World {
  engine:Engine; scene:Scene; camera:ArcRotateCamera;
  private masonry=new Map<string,TransformNode>();
  private units=new Map<number,TransformNode>();
  private missiles=new Map<Shot,Mesh>();
  private debris:Debris[]=[];
  private fragmentMeshes:Record<string,Mesh>={};
  private ground:Mesh;
  private ghost:Mesh;
  private cellMarker:Mesh;
  private buildGrid:Mesh[]=[];
  private mats:Record<string,StandardMaterial|PBRMaterial>={};
  private visual=createVisualKit({Color3,Vector3,HemisphericLight,DirectionalLight,PBRMaterial,Scene});
  private previewNode:TransformNode|null=null;
  private previewSig="";
  private validitySig="";
  private cells:Mesh[]=[];
  private validityLayers:Mesh[]=[];
  private readonly reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  private framePressure=0;
  private lastPieceSig='';
  private buildMode:boolean|null=null;
  onTile:(x:number,z:number)=>void=()=>{};
  onHover:(x:number,z:number)=>void=()=>{};
  private down:{x:number;y:number;time:number;id:number;moved:boolean}|null=null;
  private pointers=new Set<number>();
  private tap:{x:number;y:number;time:number}|null=null;
  private readonly parent:HTMLElement;
  constructor(canvas:HTMLCanvasElement,parent:HTMLElement) {
    this.parent=parent;
    this.engine=new Engine(canvas,false,{ preserveDrawingBuffer:false, stencil:false, antialias:false, powerPreference:'high-performance' });
    this.engine.setHardwareScalingLevel(Math.max(1,(window.devicePixelRatio||1)/1.6));
    this.scene=new Scene(this.engine);
    this.scene.skipPointerMovePicking=true;this.scene.skipPointerDownPicking=true;this.scene.skipPointerUpPicking=true;
    this.scene.clearColor=new Color4(.68,.75,.72,1);
    this.scene.fogMode=Scene.FOGMODE_EXP2; this.scene.fogDensity=.012;
    this.scene.fogColor=tone('#aebcb7');
    this.camera=new ArcRotateCamera('survey',-Math.PI*.69,1.03,38,new Vector3(0,0,0),this.scene);
    this.camera.lowerRadiusLimit=25;this.camera.upperRadiusLimit=74;
    this.camera.lowerBetaLimit=.54;this.camera.upperBetaLimit=1.3;
    this.camera.panningSensibility=0;this.camera.wheelDeltaPercentage=.016;
    this.camera.pinchDeltaPercentage=.005;this.camera.angularSensibilityX=1100;this.camera.angularSensibilityY=1100;
    this.camera.attachControl(canvas,true);
    const lighting=this.visual.createForestLighting(this.scene,'morning',{fogDensity:.65});
    const sunlight=lighting.key;
    sunlight.intensity=1.15; sunlight.position=new Vector3(18,32,-19);
    const shadows=new ShadowGenerator(Math.min(innerWidth,innerHeight)<450?512:1024,sunlight);
    shadows.useBlurExponentialShadowMap=true;shadows.blurKernel=6;shadows.getShadowMap()!.refreshRate=0;
    this.scene.metadata={shadows};
    const material=(name:string,color:string,rough=0)=> {
      const m=new StandardMaterial(name,this.scene);
      m.diffuseColor=tone(color);m.specularColor=new Color3(rough,rough,rough);
      this.mats[name]=m;return m;
    };
    material('grass','#596b52');material('dirt','#806f5b');material('stone','#b1a994');
    material('stoneLight','#c9bea6');material('stoneDark','#746e63');material('wood','#66503d');
    material('woodLight','#9e7951');material('iron','#454a46');material('banner','#aa523d');
    material('enemy','#9d4936');material('enemyDark','#453e39');material('friend','#cfb878');
    material('roof','#5f6960');material('water','#7f9690');
    material('ghost','#d6b97e').alpha=.48;material('invalid','#bd553f').alpha=.5;
    material('health','#c99562');this.mats.health.emissiveColor=tone('#865e32');material('healthBack','#293b2e');
    material('damage','#82534a');material('arrow','#292b2b');
    material('grid','#e2d1aa').alpha=.42;this.mats.grid.emissiveColor=tone('#544c3f');
    material('gridStrong','#f0d49d').alpha=.62;this.mats.gridStrong.emissiveColor=tone('#68583e');
    material('cell','#e8c67f').alpha=.22;this.mats.cell.emissiveColor=tone('#795d31');
    this.ground=MeshBuilder.CreateGround('selection-ground',{width:SIZE*2.25,height:SIZE*2.25},this.scene);
    // Keep the interaction plane enabled for debugging, but do not depend on mesh picking:
    // Babylon skips meshes with isVisible=false during picking.
    this.ground.isVisible=true;this.ground.visibility=0;this.ground.isPickable=false;
    this.ghost=MeshBuilder.CreateBox('preview',{width:2.03,height:1.7,depth:2.03},this.scene);
    this.ghost.material=this.mats.ghost;this.ghost.isPickable=false;this.ghost.setEnabled(false);
    this.cellMarker=MeshBuilder.CreateGround('build-cell-marker',{width:2.08,height:2.08},this.scene);
    this.cellMarker.position.y=.045;this.cellMarker.material=this.mats.cell;this.cellMarker.isPickable=false;this.cellMarker.setEnabled(false);
    this.makeTextures();
    this.makeEnvironment();
    this.makeBuildGrid();
    for(const mat of ['stone','wood','stoneLight']){const source=MeshBuilder.CreateBox(`fragment-${mat}`,{size:1},this.scene);source.material=this.mats[mat];source.isVisible=false;source.isPickable=false;this.fragmentMeshes[mat]=source;}

    const coords=(event:PointerEvent)=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
    canvas.addEventListener('pointerdown',event=>{
      this.tap=null;this.pointers.add(event.pointerId);const p=coords(event);
      if(this.pointers.size>1){if(this.down)this.down.moved=true;return;}
      this.down={...p,time:performance.now(),id:event.pointerId,moved:false};
      const cell=this.pick(p.x,p.y);if(cell)this.onHover(...cell);
    });
    canvas.addEventListener('pointermove',event=>{
      const p=coords(event);
      if(this.down&&Math.hypot(p.x-this.down.x,p.y-this.down.y)>8)this.down.moved=true;
      if(!this.down&&event.pointerType==='mouse'){const cell=this.pick(p.x,p.y);if(cell)this.onHover(...cell);}
    });
    canvas.addEventListener('pointerup',event=>{
      this.pointers.delete(event.pointerId);const d=this.down;
      if(!d||d.id!==event.pointerId)return;this.down=null;
      if(d.moved||performance.now()-d.time>800)return;
      const p=coords(event);this.tap={...p,time:performance.now()};
    });
    // Reveal the transaction panel only after the native click. Revealing it on
    // pointerup retargeted the ensuing touch click to its Cancel button.
    canvas.addEventListener('click',event=>{
      const tap=this.tap;this.tap=null;if(!tap||performance.now()-tap.time>600)return;
      event.preventDefault();event.stopPropagation();const cell=this.pick(tap.x,tap.y);if(cell)this.onTile(...cell);
    });
    const render=()=>{
      this.animateDebris(Math.min(.05,this.engine.getDeltaTime()/1000));this.scene.render();
      if(this.engine.getFps()<38)this.framePressure+=Math.min(.1,this.engine.getDeltaTime()/1000);else this.framePressure=Math.max(0,this.framePressure-.1);
      if(this.framePressure>1.5&&this.engine.getHardwareScalingLevel()<3){this.engine.setHardwareScalingLevel(Math.min(3,this.engine.getHardwareScalingLevel()*1.25));this.framePressure=0;}
    };
    this.engine.runRenderLoop(render);
    canvas.addEventListener('pointercancel',event=>{this.pointers.delete(event.pointerId);this.down=null;});
    canvas.addEventListener('lostpointercapture',event=>{this.pointers.delete(event.pointerId);if(this.down?.id===event.pointerId)this.down=null;});
    this.resize();
    window.addEventListener('resize',()=>this.resize());
    document.addEventListener('visibilitychange',()=>document.hidden ? this.engine.stopRenderLoop() :
      this.engine.runRenderLoop(render));
  }
  resize(){this.engine.resize();this.overview();}
  tileScreen(x:number,z:number){const p=Vector3.Project(worldPos(x,z,.05),Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(this.engine.getRenderWidth(),this.engine.getRenderHeight()));const canvas=this.engine.getRenderingCanvas()!;return {x:p.x*canvas.clientWidth/this.engine.getRenderWidth(),y:p.y*canvas.clientHeight/this.engine.getRenderHeight()};}
  private box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:string,parent?:TransformNode){
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
    m.position=worldPos(x,z,y);if(parent)m.parent=parent;m.material=this.mats[mat];m.isPickable=false;
    m.receiveShadows=true;(this.scene.metadata.shadows as ShadowGenerator).addShadowCaster(m);
    return m;
  }
  private makeTextures(){
    for(const entry of catalog.assets.filter(a=>a.kind==='texture')){
      const texture=new DynamicTexture(entry.id,{width:256,height:256},this.scene,false);
      const c=texture.getContext();let seed=entry.seed;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      c.fillStyle=entry.palette[0];c.fillRect(0,0,256,256);
      for(let i=0;i<2600;i++){c.fillStyle=entry.palette[1];c.globalAlpha=.06+random()*.16;c.fillRect(random()*256,random()*256,entry.id==='wood-grain'?20+random()*50:1+random()*5,1+random()*3);}
      c.globalAlpha=1;texture.update();texture.uScale=entry.id==='ground-grain'?6:1;texture.vScale=texture.uScale;
      const name=entry.material,old=this.mats[name];
      const material=this.visual.createSurface(this.scene,name,{color:'#ffffff',roughness:.93});
      material.albedoTexture=texture;this.mats[name]=material;old.dispose();
    }
  }
  private makeBuildGrid(){
    const span=SIZE*2.25;
    for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++){
      const cell=MeshBuilder.CreateGround(`valid-${x}-${z}`,{width:2.08,height:2.08},this.scene);
      cell.position=worldPos(x,z,.028);cell.isPickable=false;cell.material=this.mats.cell;cell.visibility=.18;cell.setEnabled(false);this.cells.push(cell);
    }
    for(let i=0;i<=SIZE;i++){
      const offset=-span*.5+i*2.25;
      const edge=i===0||i===SIZE;
      const horizontal=MeshBuilder.CreateBox('grid-line-z',{width:span,height:.018,depth:edge?.075:.045},this.scene);
      horizontal.position.set(0,.035,offset);horizontal.material=this.mats[edge?'gridStrong':'grid'];horizontal.isPickable=false;
      const vertical=MeshBuilder.CreateBox('grid-line-x',{width:edge?.075:.045,height:.018,depth:span},this.scene);
      vertical.position.set(offset,.036,0);vertical.material=this.mats[edge?'gridStrong':'grid'];vertical.isPickable=false;
      this.buildGrid.push(horizontal,vertical);
    }
    const fine=this.buildGrid.filter(m=>m.material===this.mats.grid),edges=this.buildGrid.filter(m=>m.material===this.mats.gridStrong);
    this.buildGrid=[];for(const group of [fine,edges]){const merged=Mesh.MergeMeshes(group,true,true);if(merged){merged.isPickable=false;this.buildGrid.push(merged);}}
  }
  setBuildMode(enabled:boolean){
    if(this.buildMode===enabled)return;this.buildMode=enabled;
    for(const line of this.buildGrid)line.setEnabled(enabled);
    for(const layer of this.validityLayers)layer.setEnabled(enabled);
    if(!enabled)this.clearPreview();
  }
  private makeEnvironment(){
    const initial=new Set(this.scene.meshes);
    const water=MeshBuilder.CreateGround('river',{width:110,height:110},this.scene);
    water.position.y=-.95;water.material=this.visual.createSurface(this.scene,'river-water',{color:'#547f7d',roughness:.27});water.isPickable=false;
    this.box('cliff',SIZE*2.25+1,1.9,SIZE*2.25+1,CENTER,-1.15,CENTER,'dirt');
    this.box('table',SIZE*2.25+.5,.35,SIZE*2.25+.5,CENTER,-.18,CENTER,'grass');
    // Four broad fixed bridges align with spawn corridors. No soldier stands on water.
    for(let side=0;side<4;side++){
      const alongZ=side%2===0,sign=side<2?-1:1;
      const root=new TransformNode('bridge',this.scene);root.rotation.y=alongZ?0:Math.PI/2;
      for(let i=0;i<17;i++){
        const m=this.box('bridge plank',6.7,.17,.32,CENTER,.02,CENTER+sign*(12.8+i*.33)/2.25,'wood',root);
        m.rotation.y=(i%3-1)*.006;
      }
      for(const x of [-3.28,3.28]){
        this.box('bridge rail',.12,.14,6.05,CENTER+x/2.25,.7,CENTER+sign*15.7/2.25,'woodLight',root);
        for(let i=0;i<5;i++)this.box('bridge post',.15,.85,.15,CENTER+x/2.25,.36,CENTER+sign*(13+i*1.4)/2.25,'wood',root);
      }
      this.box('roadbank',alongZ?7:19,.65,alongZ?19:7,CENTER+(alongZ?0:sign*26/2.25),-.5,CENTER+(alongZ?sign*26/2.25:0),'grass');
    }
    // Registry palette and density drive deterministic vegetation, clear of the four roads.
    const grove=catalog.assets.find(a=>a.id==='alder-grove')!;
    for(let i=0;i<grove.count!;i++){
      const a=i*2.399,r=21+(i%7)*1.6,x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.abs(x)<4||Math.abs(z)<4)continue;
      const bank=MeshBuilder.CreateSphere('riverbank',{diameter:7.5,segments:6},this.scene);bank.position.set(x,-1.65,z);bank.scaling.y=.35;bank.material=this.mats.grass;bank.isPickable=false;
      const trunk=MeshBuilder.CreateCylinder('alder trunk',{height:2.6,diameterTop:.17,diameterBottom:.38,tessellation:6},this.scene);
      trunk.position.set(x,.7,z);trunk.material=this.mats.wood;trunk.isPickable=false;
      const crown=MeshBuilder.CreateSphere('alder canopy',{diameter:3.2,segments:5},this.scene);
      crown.position.set(x,2.9,z);crown.scaling.y=1.35;crown.material=this.mats.grass;crown.isPickable=false;
    }
    // Bare worn ground in the keep and four approach roads.
    for(let i=0;i<4;i++) {
      const side=i%2===0,sign=i<2?-1:1;
      this.box('approach',side?2.2:13,.035,side?13:2.2,
        CENTER+(side?0:sign*8.7/2.25),.025,CENTER+(side?sign*8.7/2.25:0),'dirt');
    }
    for(let i=0;i<68;i++) {
      const a=i*2.399,r=10.9+(i%3)*.2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.abs(x)<3.5||Math.abs(z)<3.5)continue;
      const stone=this.box('outcrop',.3+(i%4)*.13,.18+(i%3)*.13,.35+(i%4)*.1,
        x/2.25+CENTER,.08,z/2.25+CENTER,i%3?'stoneDark':'stone');
      stone.rotation.y=a;
    }
    this.box('keep base',2.45,2.4,2.45,CENTER,1.2,CENTER,'stoneDark');
    this.box('keep shaft',1.85,2.15,1.85,CENTER,3.35,CENTER,'stone');
    this.box('keep crown',2.2,.32,2.2,CENTER,4.55,CENTER,'stoneLight');
    for(const [dx,dz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      this.box('keep crenel',.48,.48,.48,CENTER+dx*.38,4.92,CENTER+dz*.38,'stoneLight');
    }
    const pole=MeshBuilder.CreateCylinder('standard',{height:2.2,diameter:.055},this.scene);
    pole.position=worldPos(CENTER,CENTER,5.7);pole.material=this.mats.iron;
    this.box('standard cloth',.96,.55,.045,CENTER+.22,6.25,CENTER,'banner');
    const plinth=this.box('island lip',25.4,.22,25.4,CENTER,-2.0,CENTER,'stoneDark');
    plinth.receiveShadows=true;
    const groups=new Map<unknown,Mesh[]>();
    for(const mesh of this.scene.meshes){if(initial.has(mesh)||!(mesh instanceof Mesh))continue;const group=groups.get(mesh.material)??[];group.push(mesh);groups.set(mesh.material,group);}
    for(const group of groups.values()){
      for(const m of group)(this.scene.metadata.shadows as ShadowGenerator).removeShadowCaster(m);
      const merged=Mesh.MergeMeshes(group,true,true);if(merged){merged.isPickable=false;merged.receiveShadows=true;(this.scene.metadata.shadows as ShadowGenerator).addShadowCaster(merged);merged.freezeWorldMatrix();}
    }

  }
  private pick(px=this.scene.pointerX,py=this.scene.pointerY):[number,number]|null{
    // Intersect the camera ray with the castle's build plane directly.
    // This remains reliable even when every visible world mesh is non-pickable.
    const ray=this.scene.createPickingRay(px,py,null,this.camera);
    if(Math.abs(ray.direction.y)<1e-5)return null;
    const distance=-ray.origin.y/ray.direction.y;
    if(distance<0)return null;
    const point=ray.origin.add(ray.direction.scale(distance));
    const x=Math.round(point.x/2.25+CENTER),z=Math.round(point.z/2.25+CENTER);
    return x>=0&&z>=0&&x<SIZE&&z<SIZE?[x,z]:null;
  }
  clearPreview(){this.ghost.setEnabled(false);this.cellMarker.setEnabled(false);this.previewNode?.dispose();this.previewNode=null;this.previewSig='';}
  showValidity(s:State,kind:Kind|null){
    const signature=`${kind}:${s.stone}:${s.timber}:${s.iron}:${s.pieces.map(p=>p.x+','+p.z+','+p.kind).join(';')}`;
    if(signature===this.validitySig)return;this.validitySig=signature;
    for(const layer of this.validityLayers)layer.dispose();this.validityLayers=[];
    const valid:Mesh[]=[],invalid:Mesh[]=[];
    for(let i=0;i<this.cells.length;i++){
      const allowed=kind?!canBuild(s,kind,i%SIZE,Math.floor(i/SIZE)):s.pieces.some(p=>p.x===i%SIZE&&p.z===Math.floor(i/SIZE));
      (allowed?valid:invalid).push(this.cells[i]);
    }
    for(const [group,mat,alpha] of [[valid,'cell',.24],[invalid,'invalid',.13]] as const){
      if(!group.length)continue;const merged=Mesh.MergeMeshes([...group],false,true);if(merged){merged.material=this.mats[mat];merged.visibility=alpha;merged.isPickable=false;merged.setEnabled(!!this.buildMode);this.validityLayers.push(merged);}
    }
  }
  preview(x:number,z:number,kind:Kind|null,valid:boolean,rotation=0,state?:State){
    this.cellMarker.setEnabled(true);this.cellMarker.position=worldPos(x,z,.055);this.cellMarker.material=this.mats[valid?'cell':'invalid'];
    const sig=`${x}:${z}:${kind}:${valid}:${rotation}`;if(sig===this.previewSig)return;
    this.previewNode?.dispose();this.previewNode=null;this.previewSig=sig;
    if(!kind)return;
    this.previewNode=this.piece({x,z,kind,hp:95,level:1,rotation},state,true);
    for(const mesh of this.previewNode.getChildMeshes()){mesh.material=this.mats[valid?'ghost':'invalid'];mesh.isPickable=false;(this.scene.metadata.shadows as ShadowGenerator).removeShadowCaster(mesh);}
  }
  orbit(){this.camera.alpha-=Math.PI/2;}
  overview(){this.camera.alpha=-Math.PI*.69;this.camera.beta=1.03;this.camera.radius=this.engine.getRenderWidth()<this.engine.getRenderHeight()?58:38;}
  private piece(p:Piece,state?:State,preview=false):TransformNode {
    const root=new TransformNode(`piece-${p.x}-${p.z}`,this.scene);

    const b=(name:string,w:number,h:number,d:number,y:number,mat:string,xoff=0,zoff=0)=>{
      const m=this.box(name,w,h,d,CENTER+xoff/2.25,y,CENTER+zoff/2.25,mat,root);return m;
    };
    if(p.kind==='wall'||p.kind==='gate'||p.kind==='brace'){
      const gate=p.kind==='gate',brace=p.kind==='brace';
      b('foundation',2.08,.22,2.08,.13,gate?'stoneDark':'stoneDark');
      if(gate){
        for(const x of [-.78,.78]) b('jamb',.47,2.1,.73,1.25,'stone',x);
        b('lintel',2.25,.54,.84,2.39,'stoneLight');
        for(const x of [-.32,.32])if(preview||p.hp/maxHP(p)>.34||x<0)b('timber door',.56,1.72,.24,1.06,'wood',x,.09);
        b('band',1.36,.16,.29,1.62,'iron',0,.24);
      } else if(brace){
        b('buttress',1.05,1.45,1.35,.85,'stone');
        for(const x of [-.42,.42]) {
          const beam=b('diagonal timber',.18,1.9,.18,.95,'woodLight',x,.47);
          beam.rotation.x=.42;
        }
      } else {
        const horizontal=state?.pieces.some(q=>q!==p&&q.z===p.z&&Math.abs(q.x-p.x)===1&&['wall','gate','tower'].includes(q.kind));
        const vertical=state?.pieces.some(q=>q!==p&&q.x===p.x&&Math.abs(q.z-p.z)===1&&['wall','gate','tower'].includes(q.kind));
        const axes:number[]=horizontal&&vertical?[0,1]:[vertical?1:horizontal?0:p.rotation??0];
        const severity=preview?0:Math.floor((1-p.hp/maxHP(p))*3);
        for(const axis of axes){
          for(let row=0;row<4;row++)for(let col=0;col<4;col++){
            if(severity>=2&&row===3&&col===2||severity>=1&&row===3&&col===1)continue;
            const offset=(col-1.5)*.575;
            const m=b('masonry block',axis?.72:.57,.43,axis?.57:.72,.48+row*.45,col%3?'stone':'stoneLight',axis?0:offset,axis?offset:0);
            m.rotation.y=(severity&&col===1?.035:0);
          }
          for(let col=0;col<3;col++)if(!(severity>0&&col===1))b('merlon',axis?.76:.46,.48,axis?.46:.76,2.42,'stoneLight',axis?0:(col-1)*.78,axis?(col-1)*.78:0);
        }

      }
    } else if(p.kind==='tower'){
      b('tower foot',2.05,.3,2.05,.18,'stoneDark');
      const shaft=MeshBuilder.CreateCylinder('tower',{height:3.4,diameter:2.2,tessellation:10},this.scene);
      shaft.parent=root;shaft.position=new Vector3(0,1.95,0);shaft.material=this.mats.stone;shaft.isPickable=false;
      shaft.receiveShadows=true;(this.scene.metadata.shadows as ShadowGenerator).addShadowCaster(shaft);
      b('parapet',2.22,.34,2.22,3.79,'stoneLight');
      for(const [x,z] of [[-.8,-.8],[.8,-.8],[-.8,.8],[.8,.8]])b('merlon',.48,.62,.48,4.23,'stoneLight',x,z);
      for(const [x,z] of [[-.46,-.96],[.46,-.96],[-.46,.96],[.46,.96]])b('arrow slit',.13,.52,.025,2.25,'stoneDark',x,z);
      b('tower flag',.53,.45,.05,4.95,'banner',.44);
    } else {
      b('archer stage',1.5,.16,1.46,.38,'wood');
      for(const x of [-.58,.58])b('archer support',.13,.56,.15,.2,'woodLight',x);
      b('archer body',.27,.65,.24,.81,'friend');
      const head=MeshBuilder.CreateSphere('helmet',{diameter:.33,segments:6},this.scene);
      head.parent=root;head.position=new Vector3(0,1.29,0);head.material=this.mats.iron;head.isPickable=false;
      b('bow',.06,.66,.06,.83,'woodLight',.3);
    }
    if(p.hp/maxHP(p)<.67) {
      b('crack',.12,.68,.055,p.kind==='tower'?2.3:1.2,'damage',.26,.58);
      b('crack cross',.5,.11,.055,p.kind==='tower'?2.0:.93,'damage',.1,.59);
    }
    if(p.level>1)b('reinforcing iron',p.kind==='tower'?1.94:2.15,.12,.84,1.42,'iron');
    this.mergeRoot(root,true);
    root.position=worldPos(p.x,p.z);
    if(p.kind==='gate'||p.kind==='brace')root.rotation.y=(p.rotation??0)*Math.PI/2;
    if(!preview)this.healthBar(root,p.kind==='tower'?5.5:3.15);
    return root;
  }
  private mergeRoot(root:TransformNode,shadow:boolean){
    const groups=new Map<unknown,Mesh[]>();
    for(const m of root.getChildMeshes())if(m instanceof Mesh){const group=groups.get(m.material)??[];group.push(m);groups.set(m.material,group);(this.scene.metadata.shadows as ShadowGenerator).removeShadowCaster(m);}
    for(const group of groups.values()){const merged=Mesh.MergeMeshes(group,true,true);if(merged){merged.parent=root;merged.isPickable=false;merged.receiveShadows=true;if(shadow)(this.scene.metadata.shadows as ShadowGenerator).addShadowCaster(merged);}}
  }
  private healthBar(root:TransformNode,y:number){
    for(const [name,width,height,mat] of [['hp-back',1.75,.13,'healthBack'],['hp-fill',1.65,.08,'health']] as const){
      const bar=MeshBuilder.CreatePlane(name,{width,height},this.scene);bar.parent=root;bar.position.y=y;bar.position.z=name==='hp-fill'?-.01:0;bar.material=this.mats[mat];bar.billboardMode=Mesh.BILLBOARDMODE_ALL;bar.isPickable=false;bar.setEnabled(false);
    }
  }
  private enemy(e:Enemy):TransformNode{
    const root=new TransformNode(`enemy-${e.id}`,this.scene);
    const heavy=e.type==='ram'||e.type==='catapult';
    const body=MeshBuilder.CreateCylinder('soldier',{height:heavy?.66:.8,diameter:heavy?.72:.43,tessellation:7},this.scene);
    body.parent=root;body.position.y=heavy?.62:.63;body.material=this.mats.enemy;body.isPickable=false;
    const head=MeshBuilder.CreateSphere('helm',{diameter:heavy?.42:.34,segments:7},this.scene);
    head.parent=root;head.position.y=heavy?1.14:1.2;head.material=this.mats.enemyDark;head.isPickable=false;
    if(heavy){
      const chassis=MeshBuilder.CreateBox('siege gear',{width:.95,height:.36,depth:1.3},this.scene);
      chassis.parent=root;chassis.position.y=.36;chassis.material=this.mats.wood;chassis.isPickable=false;
      for(const x of [-.55,.55])for(const z of [-.48,.48]){
        const wheel=MeshBuilder.CreateCylinder('gear wheel',{height:.14,diameter:.5,tessellation:8},this.scene);wheel.parent=root;wheel.position.set(x,.25,z);wheel.rotation.z=Math.PI/2;wheel.material=this.mats.iron;wheel.isPickable=false;
      }
      const beam=MeshBuilder.CreateCylinder('ram beam',{height:1.9,diameter:.28,tessellation:8},this.scene);beam.parent=root;beam.position.y=.82;beam.rotation.x=Math.PI/2;beam.material=this.mats.woodLight;beam.isPickable=false;
      if(e.type==='catapult'){beam.rotation.x=-.6;beam.position.y=1.1;}

    } else if(e.type==='ladder') {
      for(const x of [.25,.58]){
        const rail=MeshBuilder.CreateBox('ladder rail',{width:.06,height:2.5,depth:.06},this.scene);rail.parent=root;rail.position.set(x,1.3,-.22);rail.material=this.mats.woodLight;rail.isPickable=false;
      }
      for(let i=0;i<8;i++){
        const rung=MeshBuilder.CreateBox('ladder rung',{width:.39,height:.055,depth:.07},this.scene);rung.parent=root;rung.position.set(.415,.3+i*.28,-.22);rung.material=this.mats.woodLight;rung.isPickable=false;
      }

    }
    this.mergeRoot(root,false);
    this.healthBar(root,e.type==='ladder'?3.1:1.6);
    return root;
  }
  update(s:State,dt:number){
    const sig=s.pieces.map(p=>`${p.x}:${p.z}:${p.kind}:${p.level}:${p.rotation}:${Math.floor((1-p.hp/maxHP(p))*3)}`).join('|');
    if(sig!==this.lastPieceSig){
      const desired=new Set(s.pieces.map(p=>`${p.x},${p.z}`));
      for(const [k,node] of this.masonry)if(!desired.has(k)){node.dispose(false,false);this.masonry.delete(k);}
      for(const p of s.pieces){
        const k=`${p.x},${p.z}`,node=this.masonry.get(k);
        const neighbors=s.pieces.filter(q=>Math.abs(q.x-p.x)+Math.abs(q.z-p.z)===1).map(q=>q.kind+q.x+q.z).join(';');
        const signature=`${p.kind}:${p.level}:${p.rotation}:${Math.floor((1-p.hp/maxHP(p))*3)}:${neighbors}`;
        if(node&&node.metadata?.signature===signature)continue;
        if(node)node.dispose(false,false);
        const newNode=this.piece(p,s);newNode.metadata={signature};this.masonry.set(k,newNode);
      }
      this.lastPieceSig=sig;(this.scene.metadata.shadows as ShadowGenerator).getShadowMap()!.resetRefreshCounter();
    }
    for(const p of s.pieces){const root=this.masonry.get(`${p.x},${p.z}`);if(root)this.updateHealth(root,p.hp/maxHP(p));}
    const desired=new Set(s.enemies.map(e=>e.id));
    for(const [id,node] of this.units)if(!desired.has(id)){node.dispose(false,false);this.units.delete(id);}
    for(const e of s.enemies){
      let node=this.units.get(e.id);if(!node){node=this.enemy(e);this.units.set(e.id,node);}
      const climb=e.climb?2.1*Math.sin(Math.min(1,Math.hypot(e.x-e.climb.fromX,e.z-e.climb.fromZ)/2) * Math.PI):0;
      node.position=worldPos(e.x,e.z,climb+Math.sin(performance.now()*.008+e.id)*.035);
      this.updateHealth(node,e.hp/e.maxHp);
      node.rotation.y=Math.atan2((e.waypoint?.x??e.climb?.x??CENTER)-e.x,(e.waypoint?.z??e.climb?.z??CENTER)-e.z);
    }
    for(const [shot,m] of this.missiles)if(!s.shots.includes(shot)){m.dispose();this.missiles.delete(shot);}
    for(const shot of s.shots){
      let m=this.missiles.get(shot);
      if(!m){
        m=MeshBuilder.CreateSphere('projectile',{diameter:shot.source==='enemy'?.33:.13,segments:6},this.scene);
        m.material=this.mats[shot.source==='enemy'?'stoneDark':'arrow'];m.isPickable=false;
        this.missiles.set(shot,m);
      }
      const t=Math.min(1,shot.age/shot.duration);
      const a=worldPos(shot.x,shot.z,shot.source==='enemy'?1.7:2.5);
      const b=worldPos(shot.tx,shot.tz,shot.source==='enemy'?.8:1.1);
      m.position=Vector3.Lerp(a,b,t);m.position.y+=Math.sin(t*Math.PI)*(shot.source==='enemy'?3.8:1.2);
    }
    for(const event of s.events)if(event.type==='break')this.breakAt(event.x,event.z);
    else if(event.type==='hit'||event.type==='keep'){this.impact(event.x,event.z,event.power||12);const node=this.masonry.get(`${event.x},${event.z}`);if(node){const m=node.getChildMeshes()[0];if(m)this.visual.flashHit(m,{color:'#f3dbc0',duration:.15});}}
    void dt;
  }
  private updateHealth(root:TransformNode,ratio:number){
    for(const mesh of root.getChildMeshes())if(mesh.name.startsWith('hp-')){mesh.setEnabled(ratio<.99);if(mesh.name==='hp-fill'){mesh.scaling.x=Math.max(.01,ratio);mesh.position.x=-(1-ratio)*.825;}}
  }
  private breakAt(x:number,z:number){
    for(let i=0;i<(this.reduced?5:12);i++){
      const m=this.fragmentMeshes[i%4?'stone':'wood'].createInstance('fallen masonry');m.scaling.setAll(.22+(i%3)*.14);
      m.position=worldPos(x+(Math.random()-.5)*.5,z+(Math.random()-.5)*.5,1+Math.random()*1.8);
      m.isPickable=false;
      this.debris.push({mesh:m,velocity:new Vector3((Math.random()-.5)*5,Math.random()*2,(Math.random()-.5)*5),
        spin:new Vector3(Math.random()*5,Math.random()*5,Math.random()*5),age:0});
    }
    this.impact(x,z,34);
  }
  private impact(x:number,z:number,power:number){
    const count=this.reduced?2:Math.min(8,Math.round(power/3.8));
    for(let i=0;i<count;i++){
      const m=this.fragmentMeshes.stoneLight.createInstance('chip');m.scaling.setAll(.08+Math.random()*.13);
      m.position=worldPos(x+(Math.random()-.5)*.5,z+(Math.random()-.5)*.5,.4+Math.random()*1.5);
      m.isPickable=false;
      this.debris.push({mesh:m,velocity:new Vector3((Math.random()-.5)*4,1+Math.random()*2,(Math.random()-.5)*4),
        spin:new Vector3(6,4,7),age:0});
    }
  }
  private animateDebris(dt:number){
    for(const d of [...this.debris]){
      d.age+=dt;d.velocity.y-=13*dt;
      d.mesh.position.addInPlace(d.velocity.scale(dt));
      d.mesh.rotation.addInPlace(d.spin.scale(dt));
      if(d.mesh.position.y<.14){d.mesh.position.y=.14;d.velocity.y=Math.abs(d.velocity.y)*.27;d.velocity.x*=.68;d.velocity.z*=.68;}
      if(d.age>5.5){d.mesh.dispose();this.debris.splice(this.debris.indexOf(d),1);}
    }
    if(this.debris.length>100)for(const d of this.debris.splice(0,this.debris.length-100))d.mesh.dispose();
  }
  dispose(){this.engine.dispose();}
}
