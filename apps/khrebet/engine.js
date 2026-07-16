const TAU = Math.PI * 2;

function vec3Normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function vec3Cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function vec3Dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function mat4Multiply(left, right) {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return output;
}

function mat4Perspective(fieldOfView, aspect, near, far) {
  const scale = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    scale / aspect, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, near * far * 2 * range, 0,
  ]);
}

function mat4LookAt(eye, target, up = [0, 1, 0]) {
  const z = vec3Normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -vec3Dot(x, eye), -vec3Dot(y, eye), -vec3Dot(z, eye), 1,
  ]);
}

function mat4Compose(position, rotation, scale) {
  const [sx, sy, sz] = scale;
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx); const sinX = Math.sin(rx);
  const cy = Math.cos(ry); const sinY = Math.sin(ry);
  const cz = Math.cos(rz); const sinZ = Math.sin(rz);

  const m00 = cy * cz;
  const m01 = sinX * sinY * cz - cx * sinZ;
  const m02 = cx * sinY * cz + sinX * sinZ;
  const m10 = cy * sinZ;
  const m11 = sinX * sinY * sinZ + cx * cz;
  const m12 = cx * sinY * sinZ - sinX * cz;
  const m20 = -sinY;
  const m21 = sinX * cy;
  const m22 = cx * cy;

  return new Float32Array([
    m00 * sx, m01 * sx, m02 * sx, 0,
    m10 * sy, m11 * sy, m12 * sy, 0,
    m20 * sz, m21 * sz, m22 * sz, 0,
    position[0], position[1], position[2], 1,
  ]);
}

function compileShader(gl, type, source) {
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
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Program linking failed';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function bufferData(gl, target, data, usage = gl.STATIC_DRAW) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, usage);
  return buffer;
}

function triangleNormal(positions, offset) {
  const ax = positions[offset]; const ay = positions[offset + 1]; const az = positions[offset + 2];
  const bx = positions[offset + 3]; const by = positions[offset + 4]; const bz = positions[offset + 5];
  const cx = positions[offset + 6]; const cy = positions[offset + 7]; const cz = positions[offset + 8];
  return vec3Normalize([
    (by - ay) * (cz - az) - (bz - az) * (cy - ay),
    (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
  ]);
}

export function flatGeometry(values) {
  const positions = values instanceof Float32Array ? values : new Float32Array(values);
  if (positions.length % 9 !== 0) throw new Error('Flat geometry must contain complete triangles');
  const normals = new Float32Array(positions.length);
  for (let offset = 0; offset < positions.length; offset += 9) {
    const normal = triangleNormal(positions, offset);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      normals.set(normal, offset + vertex * 3);
    }
  }
  return { positions, normals, count: positions.length / 3 };
}

function addQuad(target, a, b, c, d) {
  target.push(...a, ...b, ...c, ...a, ...c, ...d);
}

export function boxGeometry() {
  const p = [];
  const nnn = [-1, -1, -1]; const pnn = [1, -1, -1];
  const ppn = [1, 1, -1]; const npn = [-1, 1, -1];
  const nnp = [-1, -1, 1]; const pnp = [1, -1, 1];
  const ppp = [1, 1, 1]; const npp = [-1, 1, 1];
  addQuad(p, nnp, pnp, ppp, npp);
  addQuad(p, pnn, nnn, npn, ppn);
  addQuad(p, nnn, nnp, npp, npn);
  addQuad(p, pnp, pnn, ppn, ppp);
  addQuad(p, npn, npp, ppp, ppn);
  addQuad(p, nnn, pnn, pnp, nnp);
  return flatGeometry(p);
}

export function octaGeometry() {
  const top = [0, 1, 0]; const bottom = [0, -1, 0];
  const east = [1, 0, 0]; const north = [0, 0, 1];
  const west = [-1, 0, 0]; const south = [0, 0, -1];
  return flatGeometry([
    ...top, ...east, ...north, ...top, ...north, ...west,
    ...top, ...west, ...south, ...top, ...south, ...east,
    ...bottom, ...north, ...east, ...bottom, ...west, ...north,
    ...bottom, ...south, ...west, ...bottom, ...east, ...south,
  ]);
}

export function rockGeometry(sides = 7, seed = 1) {
  const random = (() => {
    let value = seed >>> 0;
    return () => {
      value = Math.imul(value ^ (value >>> 15), 1 | value);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const bottom = [];
  const middle = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = index / sides * TAU;
    const bottomRadius = 0.82 + random() * 0.28;
    const middleRadius = 0.48 + random() * 0.34;
    bottom.push([Math.cos(angle) * bottomRadius, 0, Math.sin(angle) * bottomRadius]);
    middle.push([Math.cos(angle + 0.08) * middleRadius, 0.58 + (random() - 0.5) * 0.08, Math.sin(angle + 0.08) * middleRadius]);
  }
  const top = [(random() - 0.5) * 0.22, 1, (random() - 0.5) * 0.22];
  const triangles = [];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    addQuad(triangles, bottom[index], bottom[next], middle[next], middle[index]);
    triangles.push(...middle[index], ...middle[next], ...top);
    triangles.push(0, 0, 0, ...bottom[next], ...bottom[index]);
  }
  return flatGeometry(triangles);
}

export function wingGeometry() {
  const top = 0.055;
  const bottom = -0.055;
  const outline = [
    [0, 0, 0.48],
    [1.48, 0, -0.12],
    [1.42, 0, -0.38],
    [0.2, 0, -0.3],
    [0, 0, -0.55],
    [-0.2, 0, -0.3],
    [-1.42, 0, -0.38],
    [-1.48, 0, -0.12],
  ];
  const triangles = [];
  for (let index = 1; index < outline.length - 1; index += 1) {
    triangles.push(
      outline[0][0], top, outline[0][2],
      outline[index][0], top, outline[index][2],
      outline[index + 1][0], top, outline[index + 1][2]
    );
    triangles.push(
      outline[0][0], bottom, outline[0][2],
      outline[index + 1][0], bottom, outline[index + 1][2],
      outline[index][0], bottom, outline[index][2]
    );
  }
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    addQuad(triangles,
      [outline[index][0], bottom, outline[index][2]],
      [outline[next][0], bottom, outline[next][2]],
      [outline[next][0], top, outline[next][2]],
      [outline[index][0], top, outline[index][2]]
    );
  }
  return flatGeometry(triangles);
}

export function finGeometry() {
  const left = -0.045;
  const right = 0.045;
  const baseFront = 0.38;
  const baseBack = -0.5;
  const top = [0, 0.72, -0.31];
  const triangles = [];
  triangles.push(
    left, 0, baseFront, left, 0, baseBack, left, top[1], top[2],
    right, 0, baseFront, right, top[1], top[2], right, 0, baseBack
  );
  addQuad(triangles,
    [left, 0, baseFront], [right, 0, baseFront], [right, top[1], top[2]], [left, top[1], top[2]]
  );
  addQuad(triangles,
    [right, 0, baseBack], [left, 0, baseBack], [left, top[1], top[2]], [right, top[1], top[2]]
  );
  addQuad(triangles,
    [left, 0, baseBack], [right, 0, baseBack], [right, 0, baseFront], [left, 0, baseFront]
  );
  return flatGeometry(triangles);
}

export function propellerGeometry() {
  const blades = [];
  const z = 0;
  const addBlade = (x0, y0, x1, y1) => {
    blades.push(
      x0, y0, z, x1, y0, z, x1, y1, z,
      x0, y0, z, x1, y1, z, x0, y1, z,
      x0, y0, z, x1, y1, z, x1, y0, z,
      x0, y0, z, x0, y1, z, x1, y1, z
    );
  };
  addBlade(-0.055, -0.78, 0.055, 0.78);
  addBlade(-0.78, -0.055, 0.78, 0.055);
  return flatGeometry(blades);
}

export function ribbonGeometry() {
  return flatGeometry([
    0, 0, 0, 1, .28, 0, .16, .84, 0,
    0, 0, 0, .16, .84, 0, -.24, .42, 0,
    0, 0, 0, .16, .84, 0, 1, .28, 0,
    0, 0, 0, -.24, .42, 0, .16, .84, 0,
  ]);
}

class Mesh {
  constructor(engine, geometry, options = {}) {
    this.engine = engine;
    this.position = options.position ? [...options.position] : [0, 0, 0];
    this.rotation = options.rotation ? [...options.rotation] : [0, 0, 0];
    this.scale = options.scale ? [...options.scale] : [1, 1, 1];
    this.color = options.color ? [...options.color] : [0.58, 0.59, 0.55];
    this.emissive = options.emissive || 0;
    this.material = options.material || 0;
    this.alpha = options.alpha ?? 1;
    this.visible = options.visible !== false;
    this.doubleSided = Boolean(options.doubleSided);
    this._geometry = null;
    this._positionBuffer = null;
    this._normalBuffer = null;
    this.count = 0;
    this.setGeometry(geometry);
  }

  setGeometry(geometry) {
    const { gl } = this.engine;
    if (this._positionBuffer) gl.deleteBuffer(this._positionBuffer);
    if (this._normalBuffer) gl.deleteBuffer(this._normalBuffer);
    this._geometry = geometry;
    this._positionBuffer = bufferData(gl, gl.ARRAY_BUFFER, geometry.positions);
    this._normalBuffer = bufferData(gl, gl.ARRAY_BUFFER, geometry.normals);
    this.count = geometry.count;
  }

  destroy() {
    const { gl } = this.engine;
    if (this._positionBuffer) gl.deleteBuffer(this._positionBuffer);
    if (this._normalBuffer) gl.deleteBuffer(this._normalBuffer);
    this._positionBuffer = null;
    this._normalBuffer = null;
  }
}

class ParticleField {
  constructor(engine, capacity = 240) {
    const { gl } = engine;
    this.engine = engine;
    this.capacity = capacity;
    this.count = 0;
    this.color = [0.88, 0.86, 0.78];
    this.alpha = 0.45;
    this.size = 3;
    this.visible = true;
    this.data = new Float32Array(capacity * 3);
    this.buffer = bufferData(gl, gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
  }

  update(points) {
    const { gl } = this.engine;
    const count = Math.min(this.capacity, points.length);
    for (let index = 0; index < count; index += 1) {
      this.data[index * 3] = points[index][0];
      this.data[index * 3 + 1] = points[index][1];
      this.data[index * 3 + 2] = points[index][2];
    }
    this.count = count;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, count * 3));
  }
}

export class RidgeEngine {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL unavailable');

    this.canvas = canvas;
    this.gl = gl;
    this.meshes = [];
    this.camera = {
      position: [0, 12, -10],
      target: [0, 10, 15],
      up: [0, 1, 0],
      fov: Math.PI * 0.38,
    };
    this.fogColor = [0.72, 0.75, 0.72];
    this.fogNear = 54;
    this.fogFar = 165;
    this.sunDirection = vec3Normalize([-0.42, 0.78, -0.34]);
    this.time = 0;
    this.dprLimit = 1.7;

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
      uniform vec3 uFogColor;
      uniform vec3 uSunDirection;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uEmissive;
      uniform float uMaterial;
      uniform float uAlpha;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;

      float hash(vec3 point) {
        return fract(sin(dot(point, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
      }

      void main() {
        vec3 normal = normalize(vNormal);
        if (!gl_FrontFacing) normal = -normal;
        float sun = max(0.0, dot(normal, normalize(uSunDirection)));
        float back = max(0.0, dot(normal, -normalize(uSunDirection))) * 0.08;
        float light = 0.34 + sun * 0.68 + back;
        float grain = hash(floor(vWorld * vec3(0.21, 0.32, 0.19)));
        float strata = sin(vWorld.y * 1.38 + vWorld.x * 0.07 + grain * 2.0) * 0.5 + 0.5;
        float terrainMask = step(0.5, uMaterial) * (1.0 - step(1.5, uMaterial));
        float rockMask = step(1.5, uMaterial) * (1.0 - step(2.5, uMaterial));
        float markerMask = step(2.5, uMaterial) * (1.0 - step(3.5, uMaterial));
        float clothMask = step(3.5, uMaterial);
        float surface = 1.0 - terrainMask * (0.07 + strata * 0.11) - rockMask * grain * 0.16;
        vec3 shaded = uColor * light * surface;
        shaded = mix(shaded, uColor * (1.0 + uEmissive), markerMask * 0.68 + clothMask * 0.22);
        shaded += uColor * uEmissive * 0.35;

        float distanceToCamera = length(vWorld - uCamera);
        float fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
        fog = clamp(fog + max(0.0, 4.0 - vWorld.y) * 0.012, 0.0, 1.0);
        vec3 finalColor = mix(shaded, uFogColor, fog);
        gl_FragColor = vec4(finalColor, uAlpha * (1.0 - fog * 0.12));
      }
    `);

    this.particleProgram = createProgram(gl, `
      attribute vec3 aPosition;
      uniform mat4 uViewProjection;
      uniform float uPointSize;
      varying float vFade;
      void main() {
        vec4 clip = uViewProjection * vec4(aPosition, 1.0);
        gl_Position = clip;
        float perspective = clamp(42.0 / max(1.0, clip.w), 0.72, 4.2);
        gl_PointSize = uPointSize * perspective;
        vFade = clamp(1.0 - clip.w / 170.0, 0.0, 1.0);
      }
    `, `
      precision mediump float;
      uniform vec3 uColor;
      uniform float uAlpha;
      varying float vFade;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float shape = 1.0 - smoothstep(0.16, 0.5, length(point));
        gl_FragColor = vec4(uColor, shape * uAlpha * vFade);
      }
    `);

    this.locations = {
      position: gl.getAttribLocation(this.program, 'aPosition'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      camera: gl.getUniformLocation(this.program, 'uCamera'),
      fogColor: gl.getUniformLocation(this.program, 'uFogColor'),
      sunDirection: gl.getUniformLocation(this.program, 'uSunDirection'),
      fogNear: gl.getUniformLocation(this.program, 'uFogNear'),
      fogFar: gl.getUniformLocation(this.program, 'uFogFar'),
      emissive: gl.getUniformLocation(this.program, 'uEmissive'),
      material: gl.getUniformLocation(this.program, 'uMaterial'),
      alpha: gl.getUniformLocation(this.program, 'uAlpha'),
      time: gl.getUniformLocation(this.program, 'uTime'),
    };

    this.particleLocations = {
      position: gl.getAttribLocation(this.particleProgram, 'aPosition'),
      viewProjection: gl.getUniformLocation(this.particleProgram, 'uViewProjection'),
      pointSize: gl.getUniformLocation(this.particleProgram, 'uPointSize'),
      color: gl.getUniformLocation(this.particleProgram, 'uColor'),
      alpha: gl.getUniformLocation(this.particleProgram, 'uAlpha'),
    };

    this.particles = new ParticleField(this, 260);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  createMesh(geometry, options = {}) {
    const mesh = new Mesh(this, geometry, options);
    this.meshes.push(mesh);
    return mesh;
  }

  remove(mesh) {
    const index = this.meshes.indexOf(mesh);
    if (index >= 0) this.meshes.splice(index, 1);
    mesh?.destroy();
  }

  clear() {
    for (const mesh of this.meshes) mesh.destroy();
    this.meshes.length = 0;
    this.particles.update([]);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprLimit);
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
    const projection = mat4Perspective(this.camera.fov, aspect, 0.08, 230);
    const view = mat4LookAt(this.camera.position, this.camera.target, this.camera.up || [0, 1, 0]);
    return mat4Multiply(projection, view);
  }

  drawMesh(mesh) {
    const { gl, locations } = this;
    gl.uniformMatrix4fv(locations.model, false, mat4Compose(mesh.position, mesh.rotation, mesh.scale));
    gl.uniform3fv(locations.color, mesh.color);
    gl.uniform1f(locations.emissive, mesh.emissive);
    gl.uniform1f(locations.material, mesh.material);
    gl.uniform1f(locations.alpha, mesh.alpha);
    if (mesh.doubleSided) gl.disable(gl.CULL_FACE);
    else gl.enable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh._positionBuffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh._normalBuffer);
    gl.enableVertexAttribArray(locations.normal);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  render(timeSeconds = 0) {
    const { gl, locations } = this;
    this.resize();
    this.time = timeSeconds;
    const viewProjection = this.viewProjection();
    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(locations.viewProjection, false, viewProjection);
    gl.uniform3fv(locations.camera, this.camera.position);
    gl.uniform3fv(locations.fogColor, this.fogColor);
    gl.uniform3fv(locations.sunDirection, this.sunDirection);
    gl.uniform1f(locations.fogNear, this.fogNear);
    gl.uniform1f(locations.fogFar, this.fogFar);
    gl.uniform1f(locations.time, timeSeconds);

    const solid = [];
    const translucent = [];
    for (const mesh of this.meshes) {
      if (!mesh.visible || mesh.alpha <= 0) continue;
      (mesh.alpha < 0.995 ? translucent : solid).push(mesh);
    }
    gl.depthMask(true);
    for (const mesh of solid) this.drawMesh(mesh);

    translucent.sort((left, right) => {
      const leftDistance = Math.hypot(
        left.position[0] - this.camera.position[0],
        left.position[1] - this.camera.position[1],
        left.position[2] - this.camera.position[2]
      );
      const rightDistance = Math.hypot(
        right.position[0] - this.camera.position[0],
        right.position[1] - this.camera.position[1],
        right.position[2] - this.camera.position[2]
      );
      return rightDistance - leftDistance;
    });
    gl.depthMask(false);
    for (const mesh of translucent) this.drawMesh(mesh);
    gl.depthMask(true);

    if (this.particles.visible && this.particles.count > 0) {
      const field = this.particles;
      const points = this.particleLocations;
      gl.useProgram(this.particleProgram);
      gl.uniformMatrix4fv(points.viewProjection, false, viewProjection);
      gl.uniform1f(points.pointSize, field.size);
      gl.uniform3fv(points.color, field.color);
      gl.uniform1f(points.alpha, field.alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, field.buffer);
      gl.enableVertexAttribArray(points.position);
      gl.vertexAttribPointer(points.position, 3, gl.FLOAT, false, 0, 0);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.POINTS, 0, field.count);
      gl.depthMask(true);
    }
    gl.enable(gl.CULL_FACE);
  }
}
