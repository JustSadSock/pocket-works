function generateWorld(nextSeed) {
  seed = nextSeed >>> 0 || 1;
  world.fill(0);
  const heights = new Uint8Array(WORLD_X*WORLD_Z);
  for (let z=0; z<WORLD_Z; z++) {
    for (let x=0; x<WORLD_X; x++) {
      const broad = noise2(x*.055,z*.055);
      const medium = noise2(x*.125+19.4,z*.125-11.7);
      const ridges = Math.abs(noise2(x*.035-7.2,z*.035+4.6)-.5)*2;
      let h = Math.floor(7 + broad*8 + medium*3 + ridges*2);
      const edge = Math.min(x,z,WORLD_X-1-x,WORLD_Z-1-z);
      if (edge < 5) h = Math.min(h, 8 + edge);
      h = clamp(h,4,WORLD_Y-8);
      heights[x+z*WORLD_X] = h;
      for (let y=0; y<=h; y++) {
        let id = y < h-3 ? 3 : (y < h ? 2 : 1);
        if (h <= SEA_LEVEL+1 && y >= h-2) id = 4;
        if (y > 2 && y < h-2) {
          const cave = noise3(x*.19,y*.21,z*.19) * .67 + noise3(x*.39+9,y*.31,z*.39-4)*.33;
          if (cave > .78) id = 0;
        }
        setBlockRaw(x,y,z,id);
      }
      for (let y=h+1; y<=SEA_LEVEL; y++) setBlockRaw(x,y,z,5);
    }
  }
  for (let z=3; z<WORLD_Z-3; z++) {
    for (let x=3; x<WORLD_X-3; x++) {
      const h=heights[x+z*WORLD_X];
      if (h <= SEA_LEVEL+1 || getBlock(x,h,z)!==1 || hashInt(x*7,z*11) < .965) continue;
      const trunk = 3 + Math.floor(hashInt(x*13,z*17)*3);
      for (let y=1; y<=trunk && h+y<WORLD_Y-2; y++) setBlockRaw(x,h+y,z,6);
      const cy=h+trunk;
      for (let dy=-2; dy<=2; dy++) for (let dz=-2; dz<=2; dz++) for (let dx=-2; dx<=2; dx++) {
        const dist=Math.abs(dx)+Math.abs(dz)+Math.abs(dy)*.8;
        if (dist > 3.7 || !inWorld(x+dx,cy+dy,z+dz)) continue;
        if (getBlock(x+dx,cy+dy,z+dz)===0 && hash3(x+dx,cy+dy,z+dz)>.12) setBlockRaw(x+dx,cy+dy,z+dz,7);
      }
      setBlockRaw(x,cy+2,z,7);
    }
  }
  generatedSpawn=findSafeSpawn();
  changedBlocks=0;
  worldTime=.31;worldDay=1;
  spawnEntities();
  uploadWorldTexture();
}

function compileShader(type, source) {
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
    const error=gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(error || 'Shader compile error');
  }
  return shader;
}
function initRenderer() {
  gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
  if (!gl) return false;
  const vs=compileShader(gl.VERTEX_SHADER,VERTEX_SHADER);
  const fs=compileShader(gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
  program=gl.createProgram();
  gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  uniforms={
    resolution:gl.getUniformLocation(program,'uResolution'), cameraPos:gl.getUniformLocation(program,'uCameraPos'),
    camera:gl.getUniformLocation(program,'uCamera'), time:gl.getUniformLocation(program,'uTime'),
    maxDistance:gl.getUniformLocation(program,'uMaxDistance'), world:gl.getUniformLocation(program,'uWorld'),
    target:gl.getUniformLocation(program,'uTarget'), hasTarget:gl.getUniformLocation(program,'uHasTarget'),
    underwater:gl.getUniformLocation(program,'uUnderwater'),
    sunDir:gl.getUniformLocation(program,'uSunDir'), daylight:gl.getUniformLocation(program,'uDaylight'),
    breakProgress:gl.getUniformLocation(program,'uBreakProgress'), fov:gl.getUniformLocation(program,'uFov')
  };
  worldTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,worldTexture);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8UI,WORLD_X,WORLD_Y,WORLD_Z,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,world);
  gl.uniform1i(uniforms.world,0);
  canvas.addEventListener('webglcontextlost',(event)=>{event.preventDefault(); showToast('3D-контекст потерян');});
  return true;
}
function uploadWorldTexture() {
  if (!gl || !worldTexture) return;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,worldTexture);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8UI,WORLD_X,WORLD_Y,WORLD_Z,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,world);
}
function uploadVoxel(x,y,z) {
  if (!gl || !inWorld(x,y,z)) return;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,worldTexture);
  gl.texSubImage3D(gl.TEXTURE_3D,0,x,y,z,1,1,1,gl.RED_INTEGER,gl.UNSIGNED_BYTE,new Uint8Array([getBlock(x,y,z)]));
}
function resizeCanvas() {
  const quality=renderScale;
  const w=Math.max(2,Math.floor(innerWidth*quality));
  const h=Math.max(2,Math.floor(innerHeight*quality));
  if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; gl?.viewport(0,0,w,h); }
  const entityScale=Math.min(1.35,devicePixelRatio||1);
  const ew=Math.max(2,Math.floor(innerWidth*entityScale));
  const eh=Math.max(2,Math.floor(innerHeight*entityScale));
  if(entityCanvas.width!==ew||entityCanvas.height!==eh){entityCanvas.width=ew;entityCanvas.height=eh;entityCtx.setTransform(entityScale,0,0,entityScale,0,0);}
}
function cameraVectors(yaw=player.yaw,pitch=player.pitch) {
  const cp=Math.cos(pitch), sp=Math.sin(pitch), sy=Math.sin(yaw), cy=Math.cos(yaw);
  const forward=[sy*cp,sp,cy*cp];
  const right=[cy,0,-sy];
  const up=[-sy*sp,cp,-cy*sp];
  return {forward,right,up,matrix:new Float32Array([...right,...up,...forward])};
}
function render(now) {
  resizeCanvas();
  gl.useProgram(program);
  let cx=player.x, cy=player.y+(player.crouching?1.28:EYE_HEIGHT), cz=player.z, yaw=player.yaw, pitch=player.pitch;
  const motion=Math.min(1,Math.hypot(player.vx,player.vz)/4.4)*(player.grounded&&mode==='game'?1:0);
  if(motion>0){const sway=Math.sin(player.walkPhase)*.024*motion;cx+=Math.cos(yaw)*sway;cz-=Math.sin(yaw)*sway;cy+=Math.abs(Math.cos(player.walkPhase))*.034*motion;}
  if (mode==='menu' || mode==='boot') {
    previewAngle += .000045 * Math.min(35,now-lastTime);
    const radius=18;
    cx=WORLD_X/2 + Math.sin(previewAngle)*radius;
    cz=WORLD_Z/2 + Math.cos(previewAngle)*radius;
    cy=21 + Math.sin(previewAngle*.7)*2;
    yaw=previewAngle+Math.PI;
    pitch=-.28;
  }
  const vectors=cameraVectors(yaw,pitch);
  gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
  gl.uniform3f(uniforms.cameraPos,cx,cy,cz);
  gl.uniformMatrix3fv(uniforms.camera,false,vectors.matrix);
  gl.uniform1f(uniforms.time,now*.001);
  gl.uniform1f(uniforms.maxDistance,Number(settings.distance));
  const sunAngle=(worldTime-.25)*Math.PI*2;
  let sx=Math.cos(sunAngle)*.78, sy=Math.sin(sunAngle), sz=.36;
  const sl=Math.hypot(sx,sy,sz); sx/=sl;sy/=sl;sz/=sl;
  const daylight=smoothstep(clamp((sy+.18)/.38,0,1));
  gl.uniform3f(uniforms.sunDir,sx,sy,sz);
  gl.uniform1f(uniforms.daylight,daylight);
  gl.uniform1f(uniforms.breakProgress,mining&&target?clamp(miningProgress,0,1):0);
  const wantedFov=player.sprinting&&mode==='game'?.79:.72;currentFov=lerp(currentFov,wantedFov,.12);
  gl.uniform1f(uniforms.fov,currentFov);
  gl.uniform1i(uniforms.underwater,player.underwater&&mode==='game'?1:0);
  if (target && !entityTarget && mode==='game') {
    gl.uniform3i(uniforms.target,target.x,target.y,target.z); gl.uniform1i(uniforms.hasTarget,1);
  } else gl.uniform1i(uniforms.hasTarget,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  renderLivingWorld(now,{x:cx,y:cy,z:cz,yaw,pitch,vectors,daylight,fov:currentFov});
}

