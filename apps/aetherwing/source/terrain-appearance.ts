import { Color3, Material, Mesh, PBRMaterial, Scene, ShaderMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';

const terrainVertex=`precision highp float;
attribute vec3 position;attribute vec3 normal;attribute vec4 color;
uniform mat4 world;uniform mat4 worldViewProjection;
varying vec3 vPos;varying vec3 vNormal;varying vec4 vColor;
void main(){vec4 wp=world*vec4(position,1.0);vPos=wp.xyz;vNormal=normalize(mat3(world)*normal);vColor=color;gl_Position=worldViewProjection*vec4(position,1.0);}`;

const terrainFragment=`precision highp float;
varying vec3 vPos;varying vec3 vNormal;varying vec4 vColor;
uniform vec3 cameraPosition;uniform vec3 fogColor;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1.,0.)),c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void main(){
  vec3 n=normalize(vNormal);float slope=1.0-clamp(n.y,0.0,1.0);
  float macro=noise2(vPos.xz*.0105);float mid=noise2(vPos.xz*.037);float fine=noise2(vPos.xz*.115);
  float speck=smoothstep(.82,.96,noise2(vPos.xz*.23+17.0));
  vec3 grass=vColor.rgb*vec3(1.05,1.12,.96)*(.91+macro*.17+mid*.10+fine*.035);
  vec3 soil=vec3(.275,.285,.175)*(1.0+mid*.14);vec3 rock=vec3(.33,.34,.305)*(1.0+fine*.10);
  float exposed=clamp(smoothstep(.24,.62,slope)*.56+speck*.065,0.0,.66);
  vec3 base=mix(grass,soil,smoothstep(.18,.45,slope)*.17);base=mix(base,rock,exposed);
  float ndl=max(dot(n,normalize(vec3(.42,.78,-.28))),0.0);float sky=.60+.40*clamp(n.y,0.0,1.0);
  vec3 lit=base*(.68+.50*ndl)*(.92+.08*sky);
  lit+=vec3(.030,.035,.022)*(1.0-ndl);
  float d=distance(cameraPosition,vPos);float fog=clamp(1.0-exp(-d*d*.000000068),0.0,.75);
  gl_FragColor=vec4(mix(lit,fogColor,fog),1.0);
}`;

export class TerrainAppearance{
  readonly material:ShaderMaterial;
  private readonly seen=new Set<Mesh>();
  private materialObserver:any;
  private meshObserver:any;

  constructor(private scene:Scene){
    this.material=new ShaderMaterial('aetherwingTerrainSurface',scene,{vertexSource:terrainVertex,fragmentSource:terrainFragment},{attributes:['position','normal','color'],uniforms:['world','worldViewProjection','cameraPosition','fogColor'],needAlphaBlending:false});
    this.material.backFaceCulling=false;
    this.material.setColor3('fogColor',new Color3(.69,.79,.78));
    for(const m of scene.meshes)this.captureMesh(m);
    for(const m of scene.materials)this.polishVegetation(m);
    this.meshObserver=scene.onNewMeshAddedObservable.add(m=>this.captureMesh(m));
    this.materialObserver=scene.onNewMaterialAddedObservable.add(m=>this.polishVegetation(m));
  }

  update(camera:Vector3){this.material.setVector3('cameraPosition',camera);}

  private captureMesh(mesh:any){if(!(mesh instanceof Mesh)||this.seen.has(mesh)||!mesh.name.startsWith('terrain_'))return;this.seen.add(mesh);mesh.material=this.material;mesh.receiveShadows=true;}

  private polishVegetation(material:Material){
    const name=material.name.toLowerCase();let tint:Color3|null=null;
    if(name.includes('fresh needles'))tint=new Color3(.060,.185,.090);
    else if(name.includes('fir')&&name.includes('needle'))tint=new Color3(.040,.125,.068);
    else if(name.includes('broadleaf sun'))tint=new Color3(.105,.225,.068);
    else if(name.includes('broadleaf')||name.includes('oak')&&name.includes('leaf'))tint=new Color3(.075,.180,.052);
    else if(name.includes('aspen')&&name.includes('leaf'))tint=new Color3(.115,.205,.060);
    else if(name.includes('understory')||name.includes('shrub'))tint=new Color3(.060,.145,.047);
    else if(name.includes('firdark')&&name.includes('leaf'))tint=new Color3(.038,.118,.064);
    else if(name.includes('firblue')&&name.includes('leaf'))tint=new Color3(.042,.138,.105);
    if(!tint)return;
    if(material instanceof StandardMaterial){material.diffuseColor=tint;material.ambientColor=tint.scale(.10);material.emissiveColor=tint.scale(.004);material.specularColor=Color3.Black();}
    if(material instanceof PBRMaterial){material.albedoColor=tint;material.roughness=Math.max(material.roughness??.88,.88);material.environmentIntensity=.46;material.emissiveColor=tint.scale(.003);}
  }

  dispose(){if(this.meshObserver)this.scene.onNewMeshAddedObservable.remove(this.meshObserver);if(this.materialObserver)this.scene.onNewMaterialAddedObservable.remove(this.materialObserver);this.material.dispose();}
}
