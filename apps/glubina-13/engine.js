const TAU = Math.PI * 2;

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
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
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, near * far * 2 * range, 0,
  ]);
}

function mat4TranslateRotateScale(position, rotation, scale) {
  const [sx, sy, sz] = scale;
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx); const sxn = Math.sin(rx);
  const cy = Math.cos(ry); const syn = Math.sin(ry);
  const cz = Math.cos(rz); const szn = Math.sin(rz);

  const m00 = cy * cz;
  const m01 = sxn * syn * cz + cx * -szn;
  const m02 = cx * syn * cz + -sxn * -szn;
  const m10 = cy * szn;
  const m11 = sxn * syn * szn + cx * cz;
  const m12 = cx * syn * szn + -sxn * cz;
  const m20 = -syn;
  const m21 = sxn * cy;
  const m22 = cx * cy;

  return new Float32Array([
    m00 * sx, m01 * sx, m02 * sx, 0,
    m10 * sy, m11 * sy, m12 * sy, 0,
    m20 * sz, m21 * sz, m22 * sz, 0,
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

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  }
  return program;
}

function createBuffer(gl, target, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

function makeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ia]; const ay = positions[ia + 1]; const az = positions[ia + 2];
    const bx = positions[ib]; const by = positions[ib + 1]; const bz = positions[ib + 2];
    const cx = positions[ic]; const cy = positions[ic + 1]; const cz = positions[ic + 2];
    const abx = bx - ax; const aby = by - ay; const abz = bz - az;
    const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const index of [ia, ib, ic]) {
      normals[index] += nx; normals[index + 1] += ny; normals[index + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return normals;
}

function edgeIndices(indices) {
  const seen = new Set();
  const edges = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
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

export function boxGeometry() {
  const positions = new Float32Array([
    -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
    -1,-1,1, 1,-1,1, 1,1,1, -1,1,1,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3, 4,6,5, 4,7,6,
    0,4,5, 0,5,1, 3,2,6, 3,6,7,
    1,5,6, 1,6,2, 0,3,7, 0,7,4,
  ]);
  return { positions, indices, normals: makeNormals(positions, indices), edges: edgeIndices(indices) };
}

export function octaGeometry() {
  const positions = new Float32Array([
    0,1,0, 1,0,0, 0,0,1, -1,0,0, 0,0,-1, 0,-1,0,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3, 0,3,4, 0,4,1,
    5,2,1, 5,3,2, 5,4,3, 5,1,4,
  ]);
  return { positions, indices, normals: makeNormals(positions, indices), edges: edgeIndices(indices) };
}

export function tetraGeometry() {
  const positions = new Float32Array([
    0,1.25,0, -1,-0.7,0.8, 1,-0.7,0.8, 0,-0.7,-1.2,
  ]);
  const indices = new Uint16Array([0,1,2, 0,2,3, 0,3,1, 1,3,2]);
  return { positions, indices, normals: makeNormals(positions, indices), edges: edgeIndices(indices) };
}

export function tunnelGeometry(sides = 8, length = 1) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * TAU + Math.PI / 8;
    positions.push(Math.cos(angle), Math.sin(angle), 0);
    positions.push(Math.cos(angle), Math.sin(angle), -length);
  }
  for (let i = 0; i < sides; i += 1) {
    const next = (i + 1) % sides;
    const a = i * 2; const b = next * 2; const c = next * 2 + 1; const d = i * 2 + 1;
    indices.push(a,b,c, a,c,d);
  }
  const p = new Float32Array(positions);
  const idx = new Uint16Array(indices);
  return { positions: p, indices: idx, normals: makeNormals(p, idx), edges: edgeIndices(idx) };
}

export class Mesh {
  constructor(engine, geometry) {
    const { gl } = engine;
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0];
    this.scale = [1, 1, 1];
    this.color = [0.7, 0.75, 0.65];
    this.emissive = 0;
    this.visibility = 1;
    this.edgeVisibility = 0.6;
    this.fogBias = 0;
    this.buffers = {
      positions: createBuffer(gl, gl.ARRAY_BUFFER, geometry.positions),
      normals: createBuffer(gl, gl.ARRAY_BUFFER, geometry.normals),
      indices: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.indices),
      edges: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, geometry.edges),
    };
    this.count = geometry.indices.length;
    this.edgeCount = geometry.edges.length;
  }
}

export class DeepEngine {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL unavailable');
    this.canvas = canvas;
    this.gl = gl;
    this.meshes = [];
    this.camera = { x: 0, y: 0, roll: 0, pitch: 0, yaw: 0 };
    this.sonarRadius = -1000;
    this.sonarStrength = 0;
    this.baseVisibility = 0.025;
    this.time = 0;
    this.background = [0.008, 0.018, 0.014];

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
      uniform vec3 uCamera;
      uniform float uSonarRadius;
      uniform float uSonarStrength;
      uniform float uBaseVisibility;
      uniform float uVisibility;
      uniform float uEmissive;
      uniform float uFogBias;
      uniform float uTime;
      uniform float uEdgePass;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float distanceToCamera = length(vWorld - uCamera);
        float band = 1.0 - smoothstep(1.2, 4.8, abs(distanceToCamera - uSonarRadius));
        float afterglow = exp(-distanceToCamera * 0.028) * uSonarStrength * 0.22;
        float light = max(0.0, dot(normalize(vNormal), normalize(vec3(-0.45, 0.75, 0.55)))) * 0.36 + 0.18;
        float reveal = clamp(uBaseVisibility + band * uSonarStrength + afterglow + uEmissive, 0.0, 1.0);
        float fog = 1.0 - smoothstep(9.0 + uFogBias, 76.0 + uFogBias, distanceToCamera);
        float pulseGrain = 0.94 + 0.06 * sin(vWorld.z * 2.8 + uTime * 4.0);
        vec3 shaded = uColor * mix(light, 1.0, uEdgePass) * reveal * fog * pulseGrain * uVisibility;
        if (uEdgePass > 0.5) shaded *= 1.7;
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
      camera: gl.getUniformLocation(p, 'uCamera'),
      sonarRadius: gl.getUniformLocation(p, 'uSonarRadius'),
      sonarStrength: gl.getUniformLocation(p, 'uSonarStrength'),
      baseVisibility: gl.getUniformLocation(p, 'uBaseVisibility'),
      visibility: gl.getUniformLocation(p, 'uVisibility'),
      emissive: gl.getUniformLocation(p, 'uEmissive'),
      fogBias: gl.getUniformLocation(p, 'uFogBias'),
      time: gl.getUniformLocation(p, 'uTime'),
      edgePass: gl.getUniformLocation(p, 'uEdgePass'),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  createMesh(geometry) {
    const mesh = new Mesh(this, geometry);
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

  viewProjection() {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const projection = mat4Perspective(Math.PI * 0.43, aspect, 0.08, 150);
    const c = this.camera;
    const cosR = Math.cos(-c.roll); const sinR = Math.sin(-c.roll);
    const cosY = Math.cos(-c.yaw); const sinY = Math.sin(-c.yaw);
    const cosP = Math.cos(-c.pitch); const sinP = Math.sin(-c.pitch);
    const rotation = new Float32Array([
      cosY * cosR + sinY * sinP * sinR, cosP * sinR, -sinY * cosR + cosY * sinP * sinR, 0,
      -cosY * sinR + sinY * sinP * cosR, cosP * cosR, sinY * sinR + cosY * sinP * cosR, 0,
      sinY * cosP, -sinP, cosY * cosP, 0,
      0, 0, 0, 1,
    ]);
    const translation = mat4Identity();
    translation[12] = -c.x;
    translation[13] = -c.y;
    return mat4Multiply(projection, mat4Multiply(rotation, translation));
  }

  render(timeSeconds = 0) {
    const { gl, locations } = this;
    this.resize();
    this.time = timeSeconds;
    gl.clearColor(this.background[0], this.background[1], this.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const viewProjection = this.viewProjection();
    gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
    gl.uniform3f(locations.camera, this.camera.x, this.camera.y, 0);
    gl.uniform1f(locations.sonarRadius, this.sonarRadius);
    gl.uniform1f(locations.sonarStrength, this.sonarStrength);
    gl.uniform1f(locations.baseVisibility, this.baseVisibility);
    gl.uniform1f(locations.time, timeSeconds);

    for (const mesh of this.meshes) {
      if (mesh.visibility <= 0) continue;
      const model = mat4TranslateRotateScale(mesh.position, mesh.rotation, mesh.scale);
      gl.uniformMatrix4fv(locations.model, false, model);
      gl.uniform3fv(locations.color, mesh.color);
      gl.uniform1f(locations.visibility, mesh.visibility);
      gl.uniform1f(locations.emissive, mesh.emissive);
      gl.uniform1f(locations.fogBias, mesh.fogBias);
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
        gl.uniform1f(locations.edgePass, mesh.edgeVisibility);
        gl.disable(gl.CULL_FACE);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.buffers.edges);
        gl.drawElements(gl.LINES, mesh.edgeCount, gl.UNSIGNED_SHORT, 0);
        gl.enable(gl.CULL_FACE);
      }
    }
  }
}
