import { AbstractMesh, AssetContainer, Color3, Mesh, MeshBuilder, PBRMaterial, Scene, SceneLoader, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import type { CrowState, V3 } from './flight';

type Perch = { id:string; position:Vector3; radius:number; kind:string };
type Kind = 'beetle'|'mouse'|'scrap'|'walnut'|'shiny';
type Item = { kind:Kind; root:TransformNode; velocity:Vector3; home:Vector3; alive:boolean; consumed:boolean; cracked:boolean; droppedFrom:number; fear:number; phase:number; radius:number };
type SavedItem = { id:string; position:number[]; velocity:number[]; alive:boolean };
export type EcologyProgress = { foods:number; nuts:number; visited:string[]; consumedIds?:string[]; crackedIds?:string[]; items?:SavedItem[]; carriedId?:string|null };
type Bird = { root:TransformNode; home:Vector3; target:Vector3; velocity:Vector3; phase:number; flying:boolean; timer:number; wings:TransformNode[]; blend:number; imported?:ReturnType<AssetContainer['instantiateModelsToScene']> };
const names:Record<Kind,string> = { beetle:'Жук',mouse:'Полёвка',scrap:'Кусочек хлеба',walnut:'Грецкий орех',shiny:'Блестящая крышка' };
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const vec=(p:V3)=>new Vector3(p.x,p.y,p.z);

/** Food and small wildlife: finite, deterministic placement; ballistic objects; reactive flocks. */
export class Ecology {
  meshes:AbstractMesh[]=[];
  progress:EcologyProgress;
  private items:Item[]=[];
  private birds:Bird[]=[];
  private held:Item|null=null;
  private materials:PBRMaterial[]=[];
  private birdAsset:AssetContainer|null=null;
  private dead=false;
  private age=0;
  constructor(private scene:Scene,private perches:Perch[],savedProgress?:EcologyProgress,private surfaceHeight?:(x:number,z:number,previousY:number)=>number,private resolveCollision?:(position:Vector3,previous:Vector3,radius:number)=>{normal:Vector3;impact:number}|null) {
    const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
    const ids=(value:unknown)=>Array.isArray(value)?[...new Set(value.slice(0,64).filter((id):id is string=>typeof id==='string'&&id.length<=80))]:[];
    this.progress={foods:count(savedProgress?.foods),nuts:count(savedProgress?.nuts),visited:ids(savedProgress?.visited),consumedIds:ids(savedProgress?.consumedIds),crackedIds:ids(savedProgress?.crackedIds),items:[],carriedId:null};
    const mats={
      beetle:this.material('beetle',new Color3(.065,.095,.057),.38),
      mouse:this.material('mouse',new Color3(.24,.19,.14),.96),
      scrap:this.material('bread',new Color3(.66,.46,.23),1),
      walnut:this.material('walnut',new Color3(.29,.18,.08),.94),
      shiny:this.material('lid',new Color3(.38,.46,.48),.26,.82),
      dark:this.material('detail',new Color3(.018,.012,.009),.7),
    };
    const placements:Array<[Kind,number,number]>=[
      ['scrap',.5,-14],['scrap',-1.1,-18],['beetle',2,-13],['beetle',-3,-19],['walnut',1,-15],['walnut',-1,-12],
      ['shiny',4,-16],['mouse',6,-9],['mouse',-8,4],['beetle',-9,13],['scrap',17,3],['walnut',-12,-20],
      ['scrap',-10,6],['scrap',10,-5],['beetle',8,-20],['walnut',18,16],['scrap',-14,24],['shiny',-23,17]
    ];
    placements.forEach(([kind,x,z],i)=> {
      const root=new TransformNode(`food-${kind}-${i}`,scene); const radius=kind==='mouse'?.16:kind==='beetle'?.07:kind==='walnut'?.12:.11;
      root.position.set(x,radius,z);
      const body=this.organicMesh(`food-body-${i}`,kind==='mouse'?.22:radius,kind==='mouse'?.12:radius*.75,kind==='mouse'?.11:radius,mats[kind]);
      body.parent=root;
      if(kind==='scrap'){body.scaling.set(1,.6,.7);body.rotation.set(.12,.5,.2);}
      if(kind==='walnut') {
        const seam=MeshBuilder.CreateTorus(`nut-seam-${i}`,{diameter:radius*1.82,thickness:.009,tessellation:16},scene);seam.parent=root;seam.rotation.z=Math.PI/2;seam.material=mats.dark;this.meshes.push(seam);
      }
      if(kind==='mouse') {
        const head=this.organicMesh(`mouse-head-${i}`,.095,.09,.07,mats.mouse);head.parent=root;head.position.z=.18;
        for(const side of [-1,1]){
          const ear=this.organicMesh(`mouse-ear-${i}-${side}`,.042,.055,.018,mats.mouse);ear.parent=root;ear.position.set(side*.065,.075,.16);
          const eye=this.organicMesh(`mouse-eye-${i}-${side}`,.013,.013,.012,mats.dark);eye.parent=root;eye.position.set(side*.066,.035,.23);
        }
        const tail=MeshBuilder.CreateTube(`mouse-tail-${i}`,{path:[new Vector3(0,-.04,-.16),new Vector3(.06,-.04,-.29),new Vector3(.13,-.05,-.39)],radius:.012,tessellation:5},scene);tail.parent=root;tail.material=mats.mouse;this.meshes.push(tail);
      }
      if(kind==='beetle'){
        for(const side of [-1,1])for(let leg=0;leg<3;leg++){
          const limb=MeshBuilder.CreateLines(`insect-leg-${i}-${side}-${leg}`,{points:[new Vector3(side*.045,-.02,(leg-1)*.035),new Vector3(side*.095,-.04,(leg-1)*.048)]},scene);limb.parent=root;limb.color=new Color3(.07,.06,.025);this.meshes.push(limb);
        }
      }
      if(kind==='shiny'){body.scaling.set(1,.16,1);}
      const consumed=this.progress.consumedIds!.includes(root.name),cracked=kind==='walnut'&&this.progress.crackedIds!.includes(root.name);
      root.setEnabled(!consumed);if(cracked){root.scaling.y=.6;root.scaling.x=1.17;}
      const item:Item={kind,root,velocity:Vector3.Zero(),home:root.position.clone(),alive:kind==='mouse'||kind==='beetle',consumed,cracked,droppedFrom:0,fear:0,phase:i*1.79,radius};
      const saved=Array.isArray(savedProgress?.items)?savedProgress.items.slice(0,64).find(s=>s&&typeof s==='object'&&s.id===root.name):undefined;
      const validVector=(v:unknown,bounds:number):v is number[]=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=bounds);
      if(saved&&validVector(saved.position,90)&&saved.position[1]>=-.5&&validVector(saved.velocity,40)){
        root.position.copyFromFloats(saved.position[0],saved.position[1],saved.position[2]);item.velocity.copyFromFloats(saved.velocity[0],saved.velocity[1],saved.velocity[2]);
        item.alive=item.alive&&saved.alive===true;
      }
      this.items.push(item);
    });
    this.progress.consumedIds=this.progress.consumedIds!.filter(id=>this.items.some(item=>item.root.name===id));
    this.progress.crackedIds=this.progress.crackedIds!.filter(id=>this.items.some(item=>item.kind==='walnut'&&item.root.name===id));
    this.progress.visited=this.progress.visited.filter(id=>perches.some(perch=>perch.id===id));
    this.held=this.items.find(item=>item.root.name===savedProgress?.carriedId&&!item.consumed)||null;
    if(this.held){this.held.alive=false;this.held.velocity.setAll(0);}
    this.persistItems();
    const homes=perches.filter(p=>p.position.y>2&&p.id!=='home').slice(0,9);
    homes.forEach((p,i)=>{const size=.55+(i%3)*.06;const home=p.position.add(new Vector3((i%2)*.12,.456*size,0));const root=new TransformNode(`wildlife-${i}`,scene);root.position.copyFrom(home);root.rotation.y=i*2.1;root.scaling.setAll(size);this.birds.push({root,home,target:home.clone(),velocity:Vector3.Zero(),phase:i*1.72,flying:false,timer:3+i,wings:[],blend:0});});
    // The same authored skeleton as the player, shared geometry/materials across all flock members.
    void SceneLoader.LoadAssetContainerAsync('./models/','crow-distant.glb',scene).then(asset=>{
      if(this.dead){asset.dispose();return;}
      this.birdAsset=asset;
      for(const [i,bird] of this.birds.entries()){
        const instance=asset.instantiateModelsToScene(name=>`wild-${i}-${name}`,false,{doNotInstantiate:true});
        bird.imported=instance;
        instance.animationGroups.forEach(a=>{a.stop();if(/(Idle|Flap)$/i.test(a.name)){a.start(true);a.setWeightForAllAnimatables(/Idle$/i.test(a.name)?1:0);}});
        instance.rootNodes.forEach(n=>{n.parent=bird.root;});
        bird.wings=bird.root.getDescendants().filter(n=>/wing[._](l|r)$|wing.*(left|right)|wingroot/i.test(n.name)) as TransformNode[];
        for(const mesh of bird.root.getChildMeshes()){mesh.isPickable=false;this.meshes.push(mesh);}
      }
    }).catch(()=>{ /* Player asset loading owns the visible error screen. */ });
  }
  private persistItems(){this.progress.carriedId=this.held?.root.name||null;this.progress.items=this.items.map(item=>({id:item.root.name,position:item.root.position.asArray(),velocity:item.velocity.asArray(),alive:item.alive}));}
  get carrying(){return this.held!==null;}
  private material(name:string,color:Color3,roughness:number,metallic=0){const m=new PBRMaterial(`ecology-${name}`,this.scene);m.albedoColor=color;m.roughness=roughness;m.metallic=metallic;this.materials.push(m);return m;}
  private organicMesh(name:string,rx:number,ry:number,rz:number,material:PBRMaterial):Mesh{
    // Irregular rings give food natural asymmetry instead of shiny primitive spheres.
    const positions:number[]=[],indices:number[]=[],normals:number[]=[],rings=7,sides=12;
    for(let r=0;r<=rings;r++)for(let s=0;s<=sides;s++){
      const latitude=r/rings*Math.PI,angle=s/sides*Math.PI*2;
      const wobble=1+.045*Math.sin(s*2.19+r*3.7);
      positions.push(Math.sin(latitude)*Math.cos(angle)*rx*wobble,Math.cos(latitude)*ry,Math.sin(latitude)*Math.sin(angle)*rz*wobble);
      if(r<rings&&s<sides){const a=r*(sides+1)+s,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
    VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;
    const mesh=new Mesh(name,this.scene);data.applyToMesh(mesh);mesh.material=material;mesh.isPickable=false;this.meshes.push(mesh);return mesh;
  }
  update(dt:number,time:number,state:CrowState){
    dt=clamp(dt,0,.05);this.age+=dt;
    for(const item of this.items){
      if(item.consumed)continue;
      if(item===this.held){
        this.placeHeld(item,state);continue;
      }
      const distance=Vector3.Distance(item.root.position,vec(state.position));
      if(item.alive&&item.velocity.y===0){
        const facing=new Vector3(Math.sin(state.yaw),0,Math.cos(state.yaw));
        const toward=item.root.position.subtract(vec(state.position));toward.y=0;
        const attack=Vector3.Dot(facing,toward.normalize())>.25;
        item.fear=Math.max(0,item.fear-dt*.6);
        if(distance<(item.kind==='mouse'?4.8:1.9)&&attack)item.fear=1;
        let dx=Math.sin(time*.36+item.phase),dz=Math.cos(time*.29+item.phase);
        if(item.fear>.1){
          const shelter=item.home.add(new Vector3(item.home.x>=0?3.5:-3.5,0,1.8));
          const escape=item.root.position.subtract(vec(state.position));escape.y=0;
          const cover=shelter.subtract(item.root.position);cover.y=0;
          const move=escape.normalize().scale(distance<2?1:.3).add(cover.normalize().scale(distance<2?.35:1));move.normalize();dx=move.x;dz=move.z;
        }
        else if(Vector3.Distance(item.home,item.root.position)>3){dx=item.home.x-item.root.position.x;dz=item.home.z-item.root.position.z;const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;}
        const speed=item.kind==='mouse'?(item.fear>.1?2.6:.16):.07;
        item.root.position.x+=dx*dt*speed;item.root.position.z+=dz*dt*speed;item.root.rotation.y=Math.atan2(dx,dz);
        item.root.position.y=item.radius+(item.kind==='mouse'?Math.sin(time*(item.fear?22:7)+item.phase)*.015:0);
      }else{
        const moving=item.velocity.lengthSquared()>.0001||item.root.position.y>this.itemFloor(item.root.position)+item.radius+.01;
        if(moving){
          const previous=item.root.position.clone(),previousY=previous.y;
          item.velocity.y-=9.81*dt;item.root.position.addInPlace(item.velocity.scale(dt));
          const downwardImpact=-item.velocity.y;
          const collision=this.resolveCollision?.(item.root.position,previous,item.radius);
          if(collision){
            const toward=Vector3.Dot(item.velocity,collision.normal);
            if(toward<0)item.velocity.subtractInPlace(collision.normal.scale(toward*1.25));
          }
          const floor=this.itemFloor(item.root.position,previousY);item.root.rotation.x+=dt*item.velocity.z*.8;item.root.rotation.z-=dt*item.velocity.x*.8;
          if(item.root.position.y<=floor+item.radius+.003){
            const impact=downwardImpact;item.root.position.y=floor+item.radius;
            if(item.kind==='walnut'&&!item.cracked&&impact>7.8&&this.isHard(item.root.position)){
              item.cracked=true;if(!this.progress.crackedIds!.includes(item.root.name)){this.progress.crackedIds!.push(item.root.name);this.progress.nuts++;}item.root.scaling.y=.6;item.root.scaling.x=1.17;
              this.spawnShell(item.root.position,item.phase);
            }
            item.velocity.y=impact>1.1?impact*.24:0;item.velocity.x*=.65;item.velocity.z*=.65;
            if(item.velocity.lengthSquared()<.035)item.velocity.setAll(0);
          }
        }
      }
    }
    this.persistItems();
    this.birds.forEach((bird,i)=>this.updateBird(bird,i,dt,time,state));
    if(this.progress.foods>=2&&this.progress.nuts>=1){
      for(const perch of this.perches){if(/tower/i.test(perch.id)&&state.grounded&&Vector3.Distance(vec(state.position),perch.position)<2&&!this.progress.visited.includes(perch.id))this.progress.visited.push(perch.id);}
    }
  }
  private itemFloor(position:Vector3,previousY=position.y){
    if(this.surfaceHeight)return this.surfaceHeight(position.x,position.z,previousY);
    const water=Math.abs(position.x)<5.6&&position.z>-11.4&&position.z<33.4;
    let floor=water?-.38:0;
    if(Math.abs(position.x)<7.6&&position.z>7.4&&position.z<10.6)floor=1.13;
    for(const perch of this.perches){if(/roof|tower|spire/i.test(perch.kind)&&Math.hypot(position.x-perch.position.x,position.z-perch.position.z)<perch.radius&&previousY>=perch.position.y-.2)floor=Math.max(floor,perch.position.y);}
    return floor;
  }
  private isHard(position:Vector3){const bank=Math.abs(position.x)>8&&Math.abs(position.x)<13;
    const street=position.z<-20;
    const bridge=Math.abs(position.x)<7.6&&position.z>7.4&&position.z<10.6;
    return bank||street||bridge||this.itemFloor(position)>1;}
  private spawnShell(position:Vector3,phase:number){
    for(let i=0;i<2;i++){
      const shell=this.organicMesh(`shell-${this.age}-${i}`,.075,.045,.08,this.materials[3]);shell.position.copyFrom(position).addInPlace(new Vector3(Math.sin(phase+i*2)*.18,-.04,Math.cos(phase+i*2)*.18));shell.rotation.z=i?-.8:.8;
    }
  }
  private updateBird(bird:Bird,index:number,dt:number,time:number,state:CrowState){
    bird.timer-=dt;
    const nearby=Vector3.Distance(vec(state.position),bird.root.position)<(bird.flying?3.8:5.7);
    if(!bird.flying&&(nearby||bird.timer<0)){
      bird.flying=true;bird.timer=nearby?5.5:3.5;
      const away=bird.root.position.subtract(vec(state.position));away.y=0;away.normalize();
      bird.target=nearby?bird.home.add(away.scale(9)).add(new Vector3(0,3+index%3,0)):bird.home.add(new Vector3(Math.sin(index*2)*8,3,Math.cos(index*2)*8));
    }
    if(bird.flying){
      if(nearby){
        const away=bird.root.position.subtract(vec(state.position));away.y=Math.max(1,away.y);if(away.lengthSquared()<.01)away.set(1,1,0);
        bird.target=bird.root.position.add(away.normalize().scale(7));bird.target.y=clamp(bird.target.y,bird.home.y+1,48);bird.timer=Math.max(bird.timer,2);
      }
      if(bird.timer<0)bird.target=bird.home;
      const delta=bird.target.subtract(bird.root.position),distance=delta.length();
      const speed=bird.timer<0?Math.min(5,distance*2.4):6.2;
      const desired=distance>.01?delta.scale(speed/distance):Vector3.Zero();
      bird.velocity=Vector3.Lerp(bird.velocity,desired,1-Math.exp(-dt*3));bird.root.position.addInPlace(bird.velocity.scale(dt));
      if(bird.velocity.lengthSquared()>.1)bird.root.rotation.y=Math.atan2(bird.velocity.x,bird.velocity.z);
      bird.root.rotation.z=Math.sin(time*1.8+index)*.12;bird.root.rotation.x=-Math.atan2(bird.velocity.y,Math.hypot(bird.velocity.x,bird.velocity.z))*.65;
      if(bird.timer<0&&distance<.18){bird.flying=false;bird.root.position.copyFrom(bird.home);bird.velocity.setAll(0);bird.timer=8+index*1.7;bird.root.rotation.set(0,index*2.1,0);}
    }
    bird.blend+=(Number(bird.flying)-bird.blend)*(1-Math.exp(-dt*7));
    const animateIdle=this.age<2||Vector3.DistanceSquared(vec(state.position),bird.root.position)<625;
    bird.imported?.animationGroups.forEach(group=>{
      const weight=/Flap$/i.test(group.name)?bird.blend:/Idle$/i.test(group.name)?1-bird.blend:0;
      group.setWeightForAllAnimatables(weight);
      const active=weight>.001&&(/Flap$/i.test(group.name)||animateIdle);
      if(!active&&group.isPlaying)group.pause();else if(active&&!group.isPlaying)group.play(true);
    });
  }
  private placeHeld(item:Item,state:CrowState){
    const forward=new Vector3(Math.sin(state.yaw)*Math.cos(state.pitch),Math.sin(state.pitch),Math.cos(state.yaw)*Math.cos(state.pitch));
    item.root.position.copyFrom(vec(state.position)).addInPlace(forward.scale(.44));item.root.position.y+=.04;item.root.rotation.y=state.yaw;
  }
  private candidate(state:CrowState):Item|null{
    let nearest:Item|null=null,best=1.65;
    for(const item of this.items){if(item.consumed||item===this.held)continue;const d=Vector3.Distance(vec(state.position),item.root.position);if(d<best){best=d;nearest=item;}}
    return nearest;
  }
  interact(state:CrowState):string{
    if(this.held)return this.eat(state);
    if(state.speed>5)return 'Сначала затормози рядом с целью';
    const item=this.candidate(state);if(!item)return 'Подлети ближе к еде или предмету';
    this.held=item;item.alive=false;item.velocity.setAll(0);this.placeHeld(item,state);this.persistItems();
    return item.kind==='walnut'&&!item.cracked?'Орех в клюве. Сбрось его на дорожку с высоты':`${names[item.kind]} — в клюве`;
  }
  drop(state:CrowState):string{
    if(!this.held)return 'В клюве ничего нет';
    const item=this.held;this.placeHeld(item,state);this.held=null;item.velocity.copyFrom(vec(state.velocity)).scaleInPlace(.65);item.velocity.y-=.7;item.droppedFrom=state.position.y;this.persistItems();
    return item.kind==='walnut'?'Орех падает. Твёрдая дорожка расколет скорлупу':'Предмет отпущен';
  }
  eat(_state:CrowState):string{
    const item=this.held;if(!item)return 'Сначала возьми еду';
    if(item.kind==='shiny')return 'Крышка блестит, но несъедобна. Можно бросить';
    if(item.kind==='walnut'&&!item.cracked)return 'Твёрдая скорлупа. Сбрось орех на дорожку с высоты 4 м';
    this.held=null;item.consumed=true;item.root.setEnabled(false);if(!this.progress.consumedIds!.includes(item.root.name)){this.progress.consumedIds!.push(item.root.name);this.progress.foods++;}this.persistItems();
    return item.kind==='walnut'?'Орех расколот и съеден':'Еда съедена';
  }
  nearestTarget(state:CrowState):{position:Vector3;label:string}|null{
    if(this.held)return {position:this.held.root.position.clone(),label:this.held.kind==='walnut'&&!this.held.cracked?'Орех: сбрось над дорожкой':'В клюве: '+names[this.held.kind]};
    let nearest:Item|null=null,best=10;
    for(const item of this.items){if(item.consumed)continue;const d=Vector3.Distance(vec(state.position),item.root.position);if(d<best){nearest=item;best=d;}}
    return nearest?{position:nearest.root.position.clone(),label:names[nearest.kind]+(nearest.cracked?' · расколот':'')}:null;
  }
  summary(){return {carrying:this.held?.kind||null,foods:this.progress.foods,nuts:this.progress.nuts,visited:[...this.progress.visited],wildlife:this.birds.length,birdAssetsReady:this.birdAsset!==null,targets:this.items.filter(i=>!i.consumed).map(i=>({kind:i.kind,position:i.root.position.asArray(),cracked:i.cracked}))};}
  dispose(){this.dead=true;this.items.forEach(i=>i.root.dispose());this.birds.forEach(b=>{b.imported?.dispose();b.root.dispose();});this.birdAsset?.dispose();this.meshes.forEach(m=>{if(!m.isDisposed())m.dispose();});this.materials.forEach(m=>m.dispose());}
}
