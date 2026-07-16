const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform mat4 uModel;
  uniform mat4 uViewProjection;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec4 world = uModel * vec4(aPosition, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(uModel) * aNormal);
    gl_Position = uViewProjection * world;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform vec4 uColor;
  uniform vec3 uCamera;
  uniform vec3 uFogColor;
  uniform float uEmissive;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDirection = normalize(vec3(-0.42, 0.82, 0.35));
    vec3 viewDirection = normalize(uCamera - vWorld);
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float back = max(dot(normal, -lightDirection), 0.0) * 0.13;
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.4);
    float shade = 0.27 + diffuse * 0.7 + back + rim * (0.16 + uEmissive * 0.4);
    vec3 lit = uColor.rgb * max(shade, uEmissive);
    lit += uColor.rgb * uEmissive * 0.35;
    float distanceToCamera = distance(vWorld, uCamera);
    float fog = smoothstep(17.0, 31.0, distanceToCamera);
    gl_FragColor = vec4(mix(lit, uFogColor, fog), uColor.a);
  }
`;

const SKY = [0.48, 0.61, 0.7];
const IVORY = [0.91, 0.9, 0.84, 1];
const PAPER = [0.96, 0.94, 0.88, 1];
const SHADOW = [0.10, 0.14, 0.15, 1];
const SIGNAL = [0.9, 0.16, 0.08, 1];
const BLUE_GREY = [0.35, 0.49, 0.57, 1];
const TAU = Math.PI * 2;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown shader link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function uploadMesh(gl, geometry) {
  const interleaved = new Float32Array((geometry.positions.length / 3) * 6);
  for (let index = 0; index < geometry.positions.length / 3; index += 1) {
    interleaved[index * 6] = geometry.positions[index * 3];
    interleaved[index * 6 + 1] = geometry.positions[index * 3 + 1];
    interleaved[index * 6 + 2] = geometry.positions[index * 3 + 2];
    interleaved[index * 6 + 3] = geometry.normals[index * 3];
    interleaved[index * 6 + 4] = geometry.normals[index * 3 + 1];
    interleaved[index * 6 + 5] = geometry.normals[index * 3 + 2];
  }
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW);
  return { vertexBuffer, indexBuffer, count: geometry.indices.length };
}

function cubeGeometry() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    [[1,0,0], [[1,-1,-1],[1,-1,1],[1,1,1],[1,1,-1]]],
    [[-1,0,0], [[-1,-1,1],[-1,-1,-1],[-1,1,-1],[-1,1,1]]],
    [[0,1,0], [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]],
    [[0,-1,0], [[-1,-1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1]]],
    [[0,0,1], [[1,-1,1],[-1,-1,1],[-1,1,1],[1,1,1]]],
    [[0,0,-1], [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]]
  ];
  for (const [normal, vertices] of faces) {
    const base = positions.length / 3;
    for (const vertex of vertices) {
      positions.push(...vertex);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function sphereGeometry(latitudeBands = 12, longitudeBands = 18) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let latitude = 0; latitude <= latitudeBands; latitude += 1) {
    const v = latitude / latitudeBands;
    const phi = v * Math.PI;
    for (let longitude = 0; longitude <= longitudeBands; longitude += 1) {
      const u = longitude / longitudeBands;
      const theta = u * TAU;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      positions.push(x, y, z);
      normals.push(x, y, z);
    }
  }
  for (let latitude = 0; latitude < latitudeBands; latitude += 1) {
    for (let longitude = 0; longitude < longitudeBands; longitude += 1) {
      const first = latitude * (longitudeBands + 1) + longitude;
      const second = first + longitudeBands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return { positions, normals, indices };
}

function torusGeometry(tube = .026, radialSegments = 36, tubeSegments = 6) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const u = radial / radialSegments * TAU;
    for (let side = 0; side <= tubeSegments; side += 1) {
      const v = side / tubeSegments * TAU;
      const cosV = Math.cos(v);
      const x = (1 + tube * cosV) * Math.cos(u);
      const y = tube * Math.sin(v);
      const z = (1 + tube * cosV) * Math.sin(u);
      positions.push(x, y, z);
      normals.push(cosV * Math.cos(u), Math.sin(v), cosV * Math.sin(u));
    }
  }
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let side = 0; side < tubeSegments; side += 1) {
      const a = radial * (tubeSegments + 1) + side;
      const b = (radial + 1) * (tubeSegments + 1) + side;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function tetraGeometry() {
  const raw = [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]];
  const faces = [[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const face of faces) {
    const a = raw[face[0]];
    const b = raw[face[1]];
    const c = raw[face[2]];
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const normal = normalize3([
      ab[1]*ac[2]-ab[2]*ac[1],
      ab[2]*ac[0]-ab[0]*ac[2],
      ab[0]*ac[1]-ab[1]*ac[0]
    ]);
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c);
    normals.push(...normal, ...normal, ...normal);
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, indices };
}

function normalize3(value) {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0]/length, value[1]/length, value[2]/length];
}

function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,-1,
    0,0,2*far*near*nf,0
  ]);
}

function mat4LookAt(eye, center, up) {
  const z = normalize3([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]);
  const x = normalize3([
    up[1]*z[2]-up[2]*z[1],
    up[2]*z[0]-up[0]*z[2],
    up[0]*z[1]-up[1]*z[0]
  ]);
  const y = [
    z[1]*x[2]-z[2]*x[1],
    z[2]*x[0]-z[0]*x[2],
    z[0]*x[1]-z[1]*x[0]
  ];
  return new Float32Array([
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1
  ]);
}

function mat4Invert(matrix) {
  const m = matrix;
  const out = new Float32Array(16);
  const b00 = m[0]*m[5]-m[1]*m[4];
  const b01 = m[0]*m[6]-m[2]*m[4];
  const b02 = m[0]*m[7]-m[3]*m[4];
  const b03 = m[1]*m[6]-m[2]*m[5];
  const b04 = m[1]*m[7]-m[3]*m[5];
  const b05 = m[2]*m[7]-m[3]*m[6];
  const b06 = m[8]*m[13]-m[9]*m[12];
  const b07 = m[8]*m[14]-m[10]*m[12];
  const b08 = m[8]*m[15]-m[11]*m[12];
  const b09 = m[9]*m[14]-m[10]*m[13];
  const b10 = m[9]*m[15]-m[11]*m[13];
  const b11 = m[10]*m[15]-m[11]*m[14];
  let determinant = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if (!determinant) return mat4Identity();
  determinant = 1 / determinant;
  out[0]=(m[5]*b11-m[6]*b10+m[7]*b09)*determinant;
  out[1]=(m[2]*b10-m[1]*b11-m[3]*b09)*determinant;
  out[2]=(m[13]*b05-m[14]*b04+m[15]*b03)*determinant;
  out[3]=(m[10]*b04-m[9]*b05-m[11]*b03)*determinant;
  out[4]=(m[6]*b08-m[4]*b11-m[7]*b07)*determinant;
  out[5]=(m[0]*b11-m[2]*b08+m[3]*b07)*determinant;
  out[6]=(m[14]*b02-m[12]*b05-m[15]*b01)*determinant;
  out[7]=(m[8]*b05-m[10]*b02+m[11]*b01)*determinant;
  out[8]=(m[4]*b10-m[5]*b08+m[7]*b06)*determinant;
  out[9]=(m[1]*b08-m[0]*b10-m[3]*b06)*determinant;
  out[10]=(m[12]*b04-m[13]*b02+m[15]*b00)*determinant;
  out[11]=(m[9]*b02-m[8]*b04-m[11]*b00)*determinant;
  out[12]=(m[5]*b07-m[4]*b09-m[6]*b06)*determinant;
  out[13]=(m[0]*b09-m[1]*b07+m[2]*b06)*determinant;
  out[14]=(m[13]*b01-m[12]*b03-m[14]*b00)*determinant;
  out[15]=(m[8]*b03-m[9]*b01+m[10]*b00)*determinant;
  return out;
}

function transformVec4(matrix, value) {
  return [
    matrix[0]*value[0]+matrix[4]*value[1]+matrix[8]*value[2]+matrix[12]*value[3],
    matrix[1]*value[0]+matrix[5]*value[1]+matrix[9]*value[2]+matrix[13]*value[3],
    matrix[2]*value[0]+matrix[6]*value[1]+matrix[10]*value[2]+matrix[14]*value[3],
    matrix[3]*value[0]+matrix[7]*value[1]+matrix[11]*value[2]+matrix[15]*value[3]
  ];
}

function translation(x, y, z) {
  const result = mat4Identity();
  result[12] = x; result[13] = y; result[14] = z;
  return result;
}

function scaling(x, y, z) {
  const result = mat4Identity();
  result[0] = x; result[5] = y; result[10] = z;
  return result;
}

function rotationX(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}

function rotationY(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}

function rotationZ(angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
}

function compose(position, scale, rotation = [0,0,0]) {
  let model = translation(position[0], position[1], position[2]);
  if (rotation[1]) model = mat4Multiply(model, rotationY(rotation[1]));
  if (rotation[0]) model = mat4Multiply(model, rotationX(rotation[0]));
  if (rotation[2]) model = mat4Multiply(model, rotationZ(rotation[2]));
  return mat4Multiply(model, scaling(scale[0], scale[1], scale[2]));
}

export class MessaEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
    if (!this.gl) throw new Error('WebGL is unavailable');
    const gl = this.gl;
    this.program = createProgram(gl);
    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      camera: gl.getUniformLocation(this.program, 'uCamera'),
      fogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      emissive: gl.getUniformLocation(this.program, 'uEmissive')
    };
    this.meshes = {
      cube: uploadMesh(gl, cubeGeometry()),
      sphere: uploadMesh(gl, sphereGeometry()),
      sphereLow: uploadMesh(gl, sphereGeometry(7, 10)),
      torus: uploadMesh(gl, torusGeometry(.018, 40, 5)),
      torusThick: uploadMesh(gl, torusGeometry(.055, 32, 7)),
      tetra: uploadMesh(gl, tetraGeometry())
    };
    this.dprLimit = 1.45;
    this.width = 1;
    this.height = 1;
    this.camera = [12, 9, 13];
    this.viewProjection = mat4Identity();
    this.inverseViewProjection = mat4Identity();
    this.clouds = this.createClouds();
    this.frameAverage = 16;
    this.slowFrames = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.resize();
  }

  createClouds() {
    const clouds = [];
    for (let index = 0; index < 22; index += 1) {
      const angle = index * 2.399;
      const radius = 5 + (index % 7) * 2.9;
      clouds.push({
        x: Math.cos(angle) * radius,
        y: -4.3 - (index % 3) * .38,
        z: Math.sin(angle) * radius,
        sx: 2.5 + (index % 4) * 1.15,
        sy: .65 + (index % 3) * .25,
        sz: 1.8 + ((index + 2) % 5) * .72,
        phase: index * .71
      });
    }
    return clouds;
  }

  setReducedMotion(value) { this.reducedMotion = Boolean(value); }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprLimit);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.gl.viewport(0, 0, width, height);
  }

  noteFrame(deltaMilliseconds) {
    this.frameAverage += (deltaMilliseconds - this.frameAverage) * .025;
    if (this.frameAverage > 25) this.slowFrames += 1;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90 && this.dprLimit > .86) {
      this.dprLimit = Math.max(.86, this.dprLimit - .18);
      this.slowFrames = 0;
      this.resize();
    }
  }

  screenToPlane(clientX, clientY, planeY = .35) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
    const near4 = transformVec4(this.inverseViewProjection, [nx, ny, -1, 1]);
    const far4 = transformVec4(this.inverseViewProjection, [nx, ny, 1, 1]);
    const near = [near4[0]/near4[3], near4[1]/near4[3], near4[2]/near4[3]];
    const far = [far4[0]/far4[3], far4[1]/far4[3], far4[2]/far4[3]];
    const direction = [far[0]-near[0], far[1]-near[1], far[2]-near[2]];
    if (Math.abs(direction[1]) < .0001) return { x: 0, z: 0 };
    const amount = (planeY - near[1]) / direction[1];
    return { x: near[0] + direction[0] * amount, z: near[2] + direction[2] * amount };
  }

  render(scene) {
    const gl = this.gl;
    const time = scene.time || 0;
    const cameraOrbit = this.reducedMotion ? .42 : .42 + Math.sin(time * .045) * .075;
    const cameraRadius = scene.awakening ? 17.5 : 16.7;
    const focusX = (scene.player?.x || 0) * .035;
    const focusZ = (scene.player?.z || 0) * .035;
    this.camera = [Math.cos(cameraOrbit) * cameraRadius, 9.8, Math.sin(cameraOrbit) * cameraRadius];
    const projection = mat4Perspective(.83, this.canvas.width / Math.max(1, this.canvas.height), .1, 70);
    const view = mat4LookAt(this.camera, [focusX, 0, focusZ], [0,1,0]);
    this.viewProjection = mat4Multiply(projection, view);
    this.inverseViewProjection = mat4Invert(this.viewProjection);

    gl.clearColor(SKY[0], SKY[1], SKY[2], 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.viewProjection, false, this.viewProjection);
    gl.uniform3fv(this.locations.camera, this.camera);
    gl.uniform3fv(this.locations.fogColor, SKY);

    this.drawClouds(time);
    this.drawMachine(scene);
    this.drawObstacles(scene);
    this.drawTarget(scene);
    this.drawTrail(scene);
    this.drawPlayer(scene);
    this.drawWell(scene);
    this.drawParticles(scene);
  }

  drawClouds(time) {
    for (const cloud of this.clouds) {
      const drift = this.reducedMotion ? 0 : Math.sin(time * .045 + cloud.phase) * .25;
      this.draw(this.meshes.sphereLow, [cloud.x + drift, cloud.y, cloud.z], [cloud.sx, cloud.sy, cloud.sz], [0, cloud.phase, 0], [0.89,0.92,0.9,.72], .08);
    }
  }

  drawMachine(scene) {
    const time = scene.time || 0;
    this.drawTransparent(() => {
      this.draw(this.meshes.sphereLow, [0,.18,0], [3.15,3.15,3.15], [0,0,0], [0.92,0.9,0.82,.055], .35);
      this.draw(this.meshes.torusThick, [0,.12,0], [2.95,2.95,2.95], [0,time*.08,0], [0.84,0.25,0.14,.42], .9);
      this.draw(this.meshes.torus, [0,.1,0], [3.55,3.55,3.55], [0,0,0], [0.95,0.92,0.82,.52], .65);
    });
    this.draw(this.meshes.sphere, [0,.18,0], [2.4,2.4,2.4], [0,-time*.025,0], SHADOW, .05);

    this.drawTransparent(() => {
      for (const radius of [4.15, 7.15, 10.45, 13.15]) {
        this.draw(this.meshes.torus, [0,0,0], [radius,radius,radius], [0,0,0], [0.94,0.92,0.85,radius === 13.15 ? .19 : .38], .25);
      }
      this.draw(this.meshes.torus, [0,0,0], [14.7,14.7,14.7], [Math.PI/2,0,.35], [0.94,0.92,0.85,.14], .32);
      this.draw(this.meshes.torus, [0,0,0], [16.2,16.2,16.2], [Math.PI/2,0,-.48], [0.94,0.92,0.85,.1], .25);
    });

    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * TAU + time * (index % 2 ? -.006 : .004);
      const radius = 13.05;
      const height = 1.2 + (index % 4) * .48;
      this.draw(this.meshes.cube, [Math.cos(angle)*radius, height-.9, Math.sin(angle)*radius], [.16,height,.5], [0,-angle,.04*Math.sin(angle*3)], [0.82,0.83,0.78,.92], .03);
    }
  }

  drawObstacles(scene) {
    if (!scene.obstacles) return;
    for (const item of scene.obstacles) {
      const { obstacle, position } = item;
      const height = obstacle.height;
      const scaleX = obstacle.family === 'needle' ? obstacle.size * .46 : obstacle.size;
      const scaleZ = obstacle.family === 'choir' ? obstacle.size * 1.55 : obstacle.size * .72;
      const color = obstacle.family === 'choir' ? PAPER : IVORY;
      this.draw(this.meshes.cube, [position.x, height - .25, position.z], [scaleX,height,scaleZ], [obstacle.lean,-position.angle + .35,obstacle.lean*.35], color, .02);
      if (obstacle.family === 'choir') {
        this.draw(this.meshes.cube, [position.x, height*2-.4, position.z], [scaleX*.72,.11,scaleZ*1.55], [0,-position.angle+.35,0], SHADOW, .08);
      } else if (obstacle.family === 'needle') {
        this.draw(this.meshes.tetra, [position.x, height*2+.12, position.z], [scaleX*1.3,.62,scaleZ*1.15], [0,scene.time*.4+obstacle.phase,0], color, .04);
      }
    }
  }

  drawTarget(scene) {
    const target = scene.target;
    if (!target) return;
    const pulse = 1 + Math.sin(scene.time * 4.2) * .08;
    this.drawTransparent(() => {
      this.draw(this.meshes.torusThick, [target.x,.48,target.z], [.62*pulse,.62*pulse,.62*pulse], [Math.PI/2,scene.time*.5,0], [0.95,0.93,0.84,.62], 1.1);
      this.draw(this.meshes.torus, [target.x,.48,target.z], [.9,.9,.9], [0,0,scene.time*.8], [0.95,0.93,0.84,.38], .75);
    });
    this.draw(this.meshes.tetra, [target.x,.48,target.z], [.3,.42,.3], [scene.time*.7,scene.time*1.1,scene.time*.33], SIGNAL, 1.45);
  }

  drawTrail(scene) {
    const trail = scene.trail || [];
    const limit = Math.min(trail.length, this.dprLimit < 1 ? 22 : 34);
    this.drawTransparent(() => {
      for (let index = 0; index < limit; index += 1) {
        const sample = trail[trail.length - 1 - index * Math.max(1, Math.floor(trail.length / Math.max(1, limit)))];
        if (!sample) continue;
        const progress = 1 - index / Math.max(1, limit);
        const scale = .035 + progress * .09;
        const color = scene.rewinding ? [0.92,0.94,0.93,.15+progress*.6] : [0.91,0.18,0.09,.08+progress*.68];
        this.draw(this.meshes.sphereLow, [sample.x,.43,sample.z], [scale,scale,scale], [0,0,0], color, 1.25);
      }
    });
  }

  drawPlayer(scene) {
    if (!scene.player) return;
    const { x, z } = scene.player;
    const pulse = 1 + Math.sin(scene.time * 8) * .045;
    this.drawTransparent(() => {
      this.draw(this.meshes.sphereLow, [x,.44,z], [.44*pulse,.44*pulse,.44*pulse], [0,0,0], [0.92,0.18,0.09,.16], 1.25);
    });
    this.draw(this.meshes.sphere, [x,.44,z], [.19,.19,.19], [0,scene.time*2,0], SIGNAL, 1.35);
    this.draw(this.meshes.tetra, [x,.44,z], [.27,.09,.12], [0,-Math.atan2(scene.player.vz, scene.player.vx),0], [0.97,0.78,0.65,1], .8);
  }

  drawWell(scene) {
    const well = scene.well;
    if (!well?.active) return;
    const pulse = .9 + Math.sin(scene.time * 6) * .1;
    this.drawTransparent(() => {
      for (let index = 0; index < 3; index += 1) {
        const scale = (.55 + index * .35) * pulse;
        this.draw(this.meshes.torus, [well.x,.28,well.z], [scale,scale,scale], [0,scene.time*(.7+index*.18),index*.55], [0.95,0.93,0.86,.44-index*.08], .72);
      }
    });
    this.draw(this.meshes.sphereLow, [well.x,.28,well.z], [.24,.24,.24], [0,0,0], [0.02,0.025,0.027,1], .03);
  }

  drawParticles(scene) {
    const particles = scene.particles || [];
    this.drawTransparent(() => {
      for (const particle of particles.slice(0, 42)) {
        const scale = Math.max(.015, particle.scale * particle.life);
        const color = particle.color || [0.94,0.92,0.85,Math.min(1, particle.life)];
        this.draw(particle.kind === 'shard' ? this.meshes.cube : this.meshes.sphereLow, [particle.x,particle.y,particle.z], [scale,scale,scale], [particle.spin,particle.spin*.7,particle.spin*.3], color, particle.emissive ?? .7);
      }
    });
  }

  drawTransparent(callback) {
    const gl = this.gl;
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    callback();
    gl.depthMask(true);
  }

  draw(mesh, position, scale, rotation, color, emissive = 0) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.locations.normal);
    gl.vertexAttribPointer(this.locations.normal, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.uniformMatrix4fv(this.locations.model, false, compose(position, scale, rotation));
    gl.uniform4fv(this.locations.color, color);
    gl.uniform1f(this.locations.emissive, emissive);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}
