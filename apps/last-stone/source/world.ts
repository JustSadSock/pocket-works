import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { CENTER, SIZE, MAX_HP, type State, type Piece, type Enemy, type Shot, type Kind } from './simulation';

const tone=(v:string)=>Color3.FromHexString(v);
interface Debris { mesh:Mesh; velocity:Vector3; spin:Vector3; age:number }
const worldPos=(x:number,z:number,y=0)=>new Vector3((x-CENTER)*2.25,y,(z-CENTER)*2.25);
export class World {
  engine:Engine; scene:Scene; camera:ArcRotateCamera;
  private masonry=new Map<string,TransformNode>();
  private units=new Map<number,TransformNode>();
  private missiles=new Map<Shot,Mesh>();
  private debris:Debris[]=[];
  private ground:Mesh;
  private ghost:Mesh;
  private cellMarker:Mesh;
  private buildGrid:Mesh[]=[];
  private mats:Record<string,StandardMaterial>={};
  private lastPieceSig='';
  onTile:(x:number,z:number)=>void=()=>{};
  onHover:(x:number,z:number)=>void=()=>{};
  private down:{x:number;y:number;time:number}|null=null;
  private readonly parent:HTMLElement;
  constructor(canvas:HTMLCanvasElement,parent:HTMLElement) {
    this.parent=parent;
    this.engine=new Engine(canvas,true,{ preserveDrawingBuffer:false, stencil:true, antialias:true, powerPreference:'high-performance' });
    this.engine.setHardwareScalingLevel(Math.max(1,(window.devicePixelRatio||1)/1.6));
    this.scene=new Scene(this.engine);
    this.scene.clearColor=new Color4(.68,.75,.72,1);
    this.scene.fogMode=Scene.FOGMODE_EXP2; this.scene.fogDensity=.012;
    this.scene.fogColor=tone('#aebcb7');
    this.camera=new ArcRotateCamera('survey',-Math.PI*.69,1.03,38,new Vector3(0,0,0),this.scene);
    this.camera.lowerRadiusLimit=25;this.camera.upperRadiusLimit=54;
    this.camera.lowerBetaLimit=.54;this.camera.upperBetaLimit=1.3;
    this.camera.panningSensibility=0;this.camera.wheelDeltaPercentage=.016;
    this.camera.pinchDeltaPercentage=.005;this.camera.angularSensibilityX=1100;this.camera.angularSensibilityY=1100;
    this.camera.attachControl(canvas,true);
    new HemisphericLight('sky',new Vector3(.1,1,.15),this.scene).intensity=.84;
    const sunlight=new DirectionalLight('sun',new Vector3(-.55,-1,.45),this.scene);
    sunlight.intensity=1.15; sunlight.position=new Vector3(18,32,-19);
    const shadows=new ShadowGenerator(Math.min(innerWidth,innerHeight)<450?512:1024,sunlight);
    shadows.useBlurExponentialShadowMap=true;shadows.blurKernel=12;
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
    this.makeEnvironment();
    this.makeBuildGrid();
    this.scene.onPointerObservable.add(info=>{
      if(info.type===PointerEventTypes.POINTERDOWN) {
        this.down={x:this.scene.pointerX,y:this.scene.pointerY,time:performance.now()};
        const cell=this.pick();if(cell)this.onHover(...cell);
      }
      if(info.type===PointerEventTypes.POINTERMOVE && this.down===null) {
        const cell=this.pick();if(cell) this.onHover(...cell);
      }
      if(info.type===PointerEventTypes.POINTERUP) {
        const d=this.down;this.down=null;
        if (!d || Math.hypot(d.x-this.scene.pointerX,d.y-this.scene.pointerY)>12 || performance.now()-d.time>650) return;
        const cell=this.pick();if(cell) this.onTile(...cell);
      }
    });
    this.engine.runRenderLoop(()=>{this.animateDebris(this.engine.getDeltaTime()/1000);this.scene.render();});
    window.addEventListener('resize',()=>this.resize());
    document.addEventListener('visibilitychange',()=>document.hidden ? this.engine.stopRenderLoop() :
      this.engine.runRenderLoop(()=>{this.animateDebris(this.engine.getDeltaTime()/1000);this.scene.render();}));
  }
  resize(){this.engine.resize();}
  private box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:string,parent?:TransformNode){
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
    m.position=worldPos(x,z,y);if(parent)m.parent=parent;m.material=this.mats[mat];m.isPickable=false;
    m.receiveShadows=true;(this.scene.metadata.shadows as ShadowGenerator).addShadowCaster(m);
    return m;
  }
  private makeBuildGrid(){
    const span=SIZE*2.25;
    for(let i=0;i<=SIZE;i++){
      const offset=-span*.5+i*2.25;
      const edge=i===0||i===SIZE;
      const horizontal=MeshBuilder.CreateBox('grid-line-z',{width:span,height:.018,depth:edge?.075:.045},this.scene);
      horizontal.position.set(0,.035,offset);horizontal.material=this.mats[edge?'gridStrong':'grid'];horizontal.isPickable=false;
      const vertical=MeshBuilder.CreateBox('grid-line-x',{width:edge?.075:.045,height:.018,depth:span},this.scene);
      vertical.position.set(offset,.036,0);vertical.material=this.mats[edge?'gridStrong':'grid'];vertical.isPickable=false;
      this.buildGrid.push(horizontal,vertical);
    }
  }
  setBuildMode(enabled:boolean){
    for(const line of this.buildGrid)line.setEnabled(enabled);
    if(!enabled){this.ghost.setEnabled(false);this.cellMarker.setEnabled(false);}
  }
  private makeEnvironment(){
    this.box('cliff',31,2,31,CENTER,-1.35,CENTER,'dirt');
    this.box('table',SIZE*2.25+.5,.35,SIZE*2.25+.5,CENTER,-.18,CENTER,'grass');
    // Bare worn ground in the keep and four approach roads.
    for(let i=0;i<4;i++) {
      const side=i%2===0,sign=i<2?-1:1;
      this.box('approach',side?2.2:13,.035,side?13:2.2,
        CENTER+(side?0:sign*8.7/2.25),.025,CENTER+(side?sign*8.7/2.25:0),'dirt');
    }
    for(let i=0;i<68;i++) {
      const a=i*2.399,r=12.8+Math.sqrt(i)*.36,x=Math.cos(a)*r,z=Math.sin(a)*r;
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
    const plinth=this.box('island lip',32,.22,32,CENTER,-2.4,CENTER,'stoneDark');
    plinth.receiveShadows=true;
  }
  private pick():[number,number]|null{
    // Intersect the camera ray with the castle's build plane directly.
    // This remains reliable even when every visible world mesh is non-pickable.
    const ray=this.scene.createPickingRay(this.scene.pointerX,this.scene.pointerY,null,this.camera);
    if(Math.abs(ray.direction.y)<1e-5)return null;
    const distance=-ray.origin.y/ray.direction.y;
    if(distance<0)return null;
    const point=ray.origin.add(ray.direction.scale(distance));
    const x=Math.round(point.x/2.25+CENTER),z=Math.round(point.z/2.25+CENTER);
    return x>=0&&z>=0&&x<SIZE&&z<SIZE?[x,z]:null;
  }
  preview(x:number,z:number,kind:Kind|null,valid:boolean){
    this.cellMarker.setEnabled(true);
    this.cellMarker.position=worldPos(x,z,.045);
    this.cellMarker.material=this.mats[valid?'cell':'invalid'];
    this.ghost.setEnabled(kind!==null);
    if(!kind)return;
    this.ghost.position=worldPos(x,z,kind==='tower'?1.5:.85);
    this.ghost.scaling.set(kind==='tower'?1.04:1,kind==='tower'?1.75:1,kind==='archer'?.5:1);
    this.ghost.material=this.mats[valid?'ghost':'invalid'];
  }
  orbit(){this.camera.alpha-=Math.PI/2;}
  overview(){this.camera.alpha=-Math.PI*.69;this.camera.beta=1.03;this.camera.radius=38;}
  private piece(p:Piece):TransformNode {
    const root=new TransformNode(`piece-${p.x}-${p.z}`,this.scene);
    const b=(name:string,w:number,h:number,d:number,y:number,mat:string,xoff=0,zoff=0)=>{
      const m=this.box(name,w,h,d,p.x+xoff/2.25,y,p.z+zoff/2.25,mat,root);return m;
    };
    if(p.kind==='wall'||p.kind==='gate'||p.kind==='brace'){
      const gate=p.kind==='gate',brace=p.kind==='brace';
      b('foundation',2.08,.22,2.08,.13,gate?'stoneDark':'stoneDark');
      if(gate){
        for(const x of [-.78,.78]) b('jamb',.47,2.1,.73,1.25,'stone',x);
        b('lintel',2,.54,.84,2.39,'stoneLight');
        for(const x of [-.32,.32]) b('timber door',.56,1.72,.24,1.06,'wood',x,.09);
        b('band',1.36,.16,.29,1.62,'iron',0,.24);
      } else if(brace){
        b('buttress',1.05,1.45,1.35,.85,'stone');
        for(const x of [-.42,.42]) {
          const beam=b('diagonal timber',.18,1.9,.18,.95,'woodLight',x,.47);
          beam.rotation.x=.42;
        }
      } else {
        b('stone wall',2.04,1.9,.72,1.16,'stone');
        b('weathered base',2.08,.18,.83,.34,'stoneDark');
        b('wall coping',2.14,.19,.88,2.19,'stoneLight');
        for(const x of [-.75,0,.75])b('crenel',.46,.5,.75,2.54,'stoneLight',x);
        for(const y of [.74,1.28,1.82]) {
          for(const x of [-.59,.2]) b('mortar cut',.5,.028,.03,y,'stoneDark',x,.37);
        }
      }
    } else if(p.kind==='tower'){
      b('tower foot',2.05,.3,2.05,.18,'stoneDark');
      const shaft=MeshBuilder.CreateCylinder('tower',{height:3.4,diameter:1.86,tessellation:8},this.scene);
      shaft.parent=root;shaft.position=worldPos(p.x,p.z,1.95);shaft.material=this.mats.stone;shaft.isPickable=false;
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
      head.parent=root;head.position=worldPos(p.x,p.z,1.29);head.material=this.mats.iron;head.isPickable=false;
      b('bow',.06,.66,.06,.83,'woodLight',.3);
    }
    if(p.hp/MAX_HP[p.kind]<.6) {
      b('crack',.12,.68,.055,p.kind==='tower'?2.3:1.2,'damage',.26,.58);
      b('crack cross',.5,.11,.055,p.kind==='tower'?2.0:.93,'damage',.1,.59);
    }
    return root;
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
    } else if(e.type==='ladder') {
      const ladder=MeshBuilder.CreateBox('ladder',{width:.14,height:1.7,depth:.14},this.scene);
      ladder.parent=root;ladder.position.x=.38;ladder.position.y=.94;ladder.rotation.z=.28;ladder.material=this.mats.woodLight;ladder.isPickable=false;
    }
    return root;
  }
  update(s:State,dt:number){
    const sig=s.pieces.map(p=>`${p.x}:${p.z}:${p.kind}:${p.hp<MAX_HP[p.kind]*.6?1:0}`).join('|');
    if(sig!==this.lastPieceSig){
      const desired=new Set(s.pieces.map(p=>`${p.x},${p.z}`));
      for(const [k,node] of this.masonry)if(!desired.has(k)){node.dispose(false,false);this.masonry.delete(k);}
      for(const p of s.pieces){
        const k=`${p.x},${p.z}`,node=this.masonry.get(k);
        if(node && node.metadata?.damaged===(p.hp/MAX_HP[p.kind]<.6))continue;
        if(node)node.dispose(false,false);
        const newNode=this.piece(p);newNode.metadata={damaged:p.hp/MAX_HP[p.kind]<.6};this.masonry.set(k,newNode);
      }
      this.lastPieceSig=sig;
    }
    const desired=new Set(s.enemies.map(e=>e.id));
    for(const [id,node] of this.units)if(!desired.has(id)){node.dispose(false,false);this.units.delete(id);}
    for(const e of s.enemies){
      let node=this.units.get(e.id);if(!node){node=this.enemy(e);this.units.set(e.id,node);}
      const climb=e.climb?1.9*Math.sin(Math.min(1,Math.hypot(e.x-e.climb.fromX,e.z-e.climb.fromZ)) * Math.PI):0;
      node.position=worldPos(e.x,e.z,climb+Math.sin(performance.now()*.008+e.id)*.035);
      node.scaling.y=.9+Math.min(.1,e.hp/e.maxHp*.1);
      node.rotation.y=Math.atan2(CENTER-e.x,CENTER-e.z);
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
    else if(event.type==='hit'||event.type==='keep')this.impact(event.x,event.z,event.power||12);
    void dt;
  }
  private breakAt(x:number,z:number){
    for(let i=0;i<12;i++){
      const m=MeshBuilder.CreateBox('fallen masonry',{size:.22+(i%3)*.14},this.scene);
      m.position=worldPos(x+(Math.random()-.5)*.5,z+(Math.random()-.5)*.5,1+Math.random()*1.8);
      m.material=this.mats[i%4?'stone':'wood'];m.isPickable=false;
      this.debris.push({mesh:m,velocity:new Vector3((Math.random()-.5)*5,Math.random()*2,(Math.random()-.5)*5),
        spin:new Vector3(Math.random()*5,Math.random()*5,Math.random()*5),age:0});
    }
    this.impact(x,z,34);
  }
  private impact(x:number,z:number,power:number){
    const count=Math.min(12,Math.round(power/2.8));
    for(let i=0;i<count;i++){
      const m=MeshBuilder.CreateBox('chip',{size:.08+Math.random()*.13},this.scene);
      m.position=worldPos(x+(Math.random()-.5)*.5,z+(Math.random()-.5)*.5,.4+Math.random()*1.5);
      m.material=this.mats.stoneLight;m.isPickable=false;
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
      if(d.age>2.7){d.mesh.dispose();this.debris.splice(this.debris.indexOf(d),1);}
    }
    if(this.debris.length>160)for(const d of this.debris.splice(0,this.debris.length-160))d.mesh.dispose();
  }
  dispose(){this.engine.dispose();}
}
