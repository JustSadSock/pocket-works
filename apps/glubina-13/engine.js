const TAU = Math.PI * 2;

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
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
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function mat4LookAt(eye, target, up) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
}

function mat4Model(position, rotation, scale) {
  const cx = Math.cos(rotation[0]); const sx = Math.sin(rotation[0]);
  const cy = Math.cos(rotation[1]); const sy = Math.sin(rotation[1]);
  const cz = Math.cos(rotation[2]); const sz = Math.sin(rotation[2]);
  const m00 = cy * cz;
  const m01 = sx * sy * cz - cx * sz;
  const m02 = cx * sy * cz + sx * sz;
  const m10 = cy * sz;
  const m11 = sx * sy * sz + cx * cz;
  const m12 = cx * sy * sz - sx * cz;
  const m20 = -sy;
  const m21 = sx * cy;
  const m22 = cx * cy;
  return new Float32Array([
    m00 * scale[0], m01 * scale[0], m02 * scale[0], 0,
    m10 * scale[1], m11 * scale[1], m12 * scale[1], 0,
    m20 * scale[2], m21 * scale[2], m22 * scale[2], 0,
    position[0], position[1], position[2], 1,
  ]);
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  return program;
}

function makeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const a = [positions[ia], positions[ia + 1], positions[ia + 2]];
    const b = [positions[ib], positions[ib + 1], positions[ib + 2]];
    const c = [positions[ic], positions[ic + 1], positions[ic + 2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = cross3(ab, ac);
    for (const offset of [ia, ib, ic]) {
      normals[offset] += normal[0];
      normals[offset + 1] += normal[1];
      normals[offset + 2] += normal[2];
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const normal = normalize3([normals[index], normals[index + 1], normals[index + 2]]);
    normals[index] = normal[0]; normals[index + 1] = normal[1]; normals[index + 2] = normal[2];
  }
  return normals;
}

function makeEdges(indices) {
  const edges = [];
  const seen = new Set();
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    for (let side = 0; side < 3; side += 1) {
      const a = triangle[side];
      const b = triangle[(side + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(a, b);
    }
  }
  return new Uint16Array(edges);
}

function geometry(positions, indices) {
  const p = new Float32Array(positions);
  const i = new Uint16Array(indices);
  return { positions: p, indices: i, normals: makeNormals(p, i), edges: makeEdges(i) };
}

export function boxGeometry() {
  return geometry(
    [-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1],
    [0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 3,2,6,3,6,7, 1,5,6,1,6,2, 0,3,7,0,7,4],
  );
}

export function octaGeometry() {
  return geometry(
    [0,1,0, 1,0,0, 0,0,1, -1,0,0, 0,0,-1, 0,-1,0],
    [0,1,2,0,2,3,0,3,4,0,4,1, 5,2,1,5,3,2,5,4,3,5,1,4],
  );
}

export function capsuleGeometry(segments = 10) {
  const positions = [0, 1.15, 0, 0, -1.15, 0];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * TAU;
    positions.push(Math.cos(angle), 0, Math.sin(angle));
  }
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(0, 2 + index, 2 + next, 1, 2 + next, 2 + index);
  }
  return geometry(positions, indices);
}

export function listenerGeometry(segments = 9) {
  const positions = [0, 1.4, 0, 0, -1.1, 0];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * TAU;
    const radius = index % 2 ? 0.62 : 1.05;
    positions.push(Math.cos(angle) * radius, -0.05, Math.sin(angle) * radius);
  }
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(0, 2 + index, 2 + next, 1, 2 + next, 2 + index);
  }
  return geometry(positions, indices);
}

function createBuffer(gl, target, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

export class Mesh {
  constructor(engine, source) {
    this.engine = engine;
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];
    this.scale = [1, 1, 1];
    this.color = [0.5, 0.62, 0.58];
    this.emissive = 0;
    this.memory = 0;
    this.always = 0;
    this.visibility = 1;
    this.edgeVisibility = 0.52;
    this.buffers = {
      positions: createBuffer(engine.gl, engine.gl.ARRAY_BUFFER, source.positions),
      normals: createBuffer(engine.gl, engine.gl.ARRAY_BUFFER, source.normals),
      indices: createBuffer(engine.gl, engine.gl.ELEMENT_ARRAY_BUFFER, source.indices),
      edges: createBuffer(engine.gl, engine.gl.ELEMENT_ARRAY_BUFFER, source.edges),
    };
    this.count = source.indices.length;
    this.edgeCount = source.edges.length;
  }
}

export class DeepEngine {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL unavailable');
    this.canvas = canvas;
    this.gl = gl;
    this.meshes = [];
    this.player = { x: 0, z: 0 };
    this.camera = { eye: [0, 13, 14], target: [0, 0, -3], shakeX: 0, shakeZ: 0 };
    this.sonarRadius = -1000;
    this.sonarStrength = 0;
    this.background = [0.006, 0.018, 0.021];

    this.program = createProgram(gl, `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = uModel * vec4(aPosition, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(uModel) * aNormal);
        gl_Position = uViewProjection * world;
      }
    `, `
      precision mediump float;
      uniform vec3 uColor;
      uniform vec2 uPlayer;
      uniform float uSonarRadius;
      uniform float uSonarStrength;
      uniform float uMemory;
      uniform float uAlways;
      uniform float uEmissive;
      uniform float uVisibility;
      uniform float uEdgePass;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float planar = distance(vWorld.xz, uPlayer);
        float localLight = 1.0 - smoothstep(5.0, 14.0, planar);
        float band = 1.0 - smoothstep(0.8, 4.2, abs(planar - uSonarRadius));
        float reveal = clamp(0.035 + localLight * 0.7 + band * uSonarStrength + uMemory * 0.48 + uAlways + uEmissive, 0.0, 1.0);
        float directional = max(0.0, dot(normalize(vNormal), normalize(vec3(-0.35, 0.85, 0.4)))) * 0.42 + 0.28;
        float fog = 1.0 - smoothstep(18.0, 72.0, planar);
        vec3 shaded = uColor * mix(directional, 1.0, uEdgePass) * reveal * fog * uVisibility;
        if (uEdgePass > 0.5) shaded *= 1.55;
        gl_FragColor = vec4(shaded, 1.0);
      }
    `);

    const p = this.program;
    this.locations = {
      position: gl.getAttribLocation(p, 'aPosition'),
      normal: gl.getAttribLocation(p, 'aNormal'),
      model: gl.getUniformLocation(p, 'uModel'),
      viewProjection: gl.getUniformLocation(p, 'uViewProjection'),
      color: gl.getUniformLocation(p, 'uColor'),
      player: gl.getUniformLocation(p, 'uPlayer'),
      sonarRadius: gl.getUniformLocation(p, 'uSonarRadius'),
      sonarStrength: gl.getUniformLocation(p, 'uSonarStrength'),
      memory: gl.getUniformLocation(p, 'uMemory'),
      always: gl.getUniformLocation(p, 'uAlways'),
      emissive: gl.getUniformLocation(p, 'uEmissive'),
      visibility: gl.getUniformLocation(p, 'uVisibility'),
      edgePass: gl.getUniformLocation(p, 'uEdgePass'),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  createMesh(source) {
    const mesh = new Mesh(this, source);
    this.meshes.push(mesh);
    return mesh;
  }

  remove(mesh) {
    const index = this.meshes.indexOf(mesh);
    if (index >= 0) this.meshes.splice(index, 1);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render() {
    const { gl, locations } = this;
    this.resize();
    gl.clearColor(...this.background, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const projection = mat4Perspective(Math.PI * 0.37, aspect, 0.1, 130);
    const eye = [this.camera.eye[0] + this.camera.shakeX, this.camera.eye[1], this.camera.eye[2] + this.camera.shakeZ];
    const view = mat4LookAt(eye, this.camera.target, [0, 1, 0]);
    const viewProjection = mat4Multiply(projection, view);
    gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
    gl.uniform2f(locations.player, this.player.x, this.player.z);
    gl.uniform1f(locations.sonarRadius, this.sonarRadius);
    gl.uniform1f(locations.sonarStrength, this.sonarStrength);

    for (const mesh of this.meshes) {
      if (mesh.visibility <= 0) continue;
      gl.uniformMatrix4fv(locations.model, false, mat4Model(mesh.position, mesh.rotation, mesh.scale));
      gl.uniform3fv(locations.color, mesh.color);
      gl.uniform1f(locations.memory, mesh.memory);
      gl.uniform1f(locations.always, mesh.always);
      gl.uniform1f(locations.emissive, mesh.emissive);
      gl.uniform1f(locations.visibility, mesh.visibility);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.positions);
      gl.enableVertexAttribArray(locations.position);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers.normals);
      gl.enableVertexAttribArray(locations.normal);
      gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(locations.edgePass, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.buffers.indices);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      if (mesh.edgeVisibility > 0) {
        gl.disable(gl.CULL_FACE);
        gl.uniform1f(locations.edgePass, mesh.edgeVisibility);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.buffers.edges);
        gl.drawElements(gl.LINES, mesh.edgeCount, gl.UNSIGNED_SHORT, 0);
        gl.enable(gl.CULL_FACE);
      }
    }
  }
}
