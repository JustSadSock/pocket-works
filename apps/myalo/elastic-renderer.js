function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compile failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Program link failed';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export class ElasticRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    }) || canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });

    if (!this.gl) throw new Error('WebGL недоступен');

    this.cols = 44;
    this.rows = 60;
    this.vertexCount = this.cols * this.rows;
    this.vertices = new Float32Array(this.vertexCount * 4);
    this.basePositions = new Float32Array(this.vertexCount * 2);
    this.indices = this.buildIndices();
    this.cover = { scale: 1, offsetX: 0, offsetY: 0, renderedWidth: 1, renderedHeight: 1 };
    this.lastLayoutKey = '';
    this.lastDpr = 1;

    const gl = this.gl;
    this.program = createProgram(gl, `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      varying vec2 v_uv;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_uv = a_uv;
      }
    `, `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_video;
      uniform float u_live;
      void main() {
        vec3 color = texture2D(u_video, v_uv).rgb;
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luminance), color, 0.88);
        color = pow(color, vec3(0.96));
        color *= vec3(0.99, 1.0, 0.95);
        vec3 idle = vec3(0.08, 0.085, 0.075);
        gl_FragColor = vec4(mix(idle, color, u_live), 1.0);
      }
    `);

    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.uvLocation = gl.getAttribLocation(this.program, 'a_uv');
    this.videoLocation = gl.getUniformLocation(this.program, 'u_video');
    this.liveLocation = gl.getUniformLocation(this.program, 'u_live');

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([18, 19, 17, 255]));

    this.rebuildLayout();
  }

  buildIndices() {
    const indexCount = (this.cols - 1) * (this.rows - 1) * 6;
    const IndexArray = this.vertexCount > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexArray(indexCount);
    let cursor = 0;
    for (let y = 0; y < this.rows - 1; y += 1) {
      for (let x = 0; x < this.cols - 1; x += 1) {
        const a = y * this.cols + x;
        const b = a + 1;
        const c = a + this.cols;
        const d = c + 1;
        indices[cursor++] = a;
        indices[cursor++] = c;
        indices[cursor++] = b;
        indices[cursor++] = b;
        indices[cursor++] = c;
        indices[cursor++] = d;
      }
    }
    return indices;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.lastDpr = dpr;
      this.gl.viewport(0, 0, width, height);
      this.lastLayoutKey = '';
      this.rebuildLayout();
      return true;
    }
    return false;
  }

  rebuildLayout() {
    const cssWidth = Math.max(1, this.canvas.clientWidth || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || 1);
    const videoWidth = Math.max(1, this.video.videoWidth || cssWidth);
    const videoHeight = Math.max(1, this.video.videoHeight || cssHeight);
    const key = `${cssWidth}x${cssHeight}:${videoWidth}x${videoHeight}`;
    if (key === this.lastLayoutKey) return;
    this.lastLayoutKey = key;

    const scale = Math.max(cssWidth / videoWidth, cssHeight / videoHeight);
    const renderedWidth = videoWidth * scale;
    const renderedHeight = videoHeight * scale;
    const offsetX = (cssWidth - renderedWidth) * 0.5;
    const offsetY = (cssHeight - renderedHeight) * 0.5;
    this.cover = { scale, offsetX, offsetY, renderedWidth, renderedHeight };

    let cursor = 0;
    for (let y = 0; y < this.rows; y += 1) {
      const sy = y / (this.rows - 1);
      for (let x = 0; x < this.cols; x += 1) {
        const sx = x / (this.cols - 1);
        const sourceX = (sx * cssWidth - offsetX) / renderedWidth;
        const sourceY = (sy * cssHeight - offsetY) / renderedHeight;
        this.basePositions[cursor * 2] = sx;
        this.basePositions[cursor * 2 + 1] = sy;
        this.vertices[cursor * 4] = sx * 2 - 1;
        this.vertices[cursor * 4 + 1] = 1 - sy * 2;
        this.vertices[cursor * 4 + 2] = 1 - sourceX;
        this.vertices[cursor * 4 + 3] = sourceY;
        cursor += 1;
      }
    }
  }

  mapLandmarkToScreen(point) {
    const cssWidth = Math.max(1, this.canvas.clientWidth || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || 1);
    const x = (this.cover.offsetX + (1 - point.x) * this.cover.renderedWidth) / cssWidth;
    const y = (this.cover.offsetY + point.y * this.cover.renderedHeight) / cssHeight;
    return { x, y };
  }

  screenToVideo(point) {
    const cssWidth = Math.max(1, this.canvas.clientWidth || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || 1);
    return {
      x: 1 - ((point.x * cssWidth - this.cover.offsetX) / this.cover.renderedWidth),
      y: (point.y * cssHeight - this.cover.offsetY) / this.cover.renderedHeight
    };
  }

  updateVertices(nodes) {
    let cursor = 0;
    const aspect = Math.max(0.6, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    for (let i = 0; i < this.vertexCount; i += 1) {
      const sx = this.basePositions[i * 2];
      const sy = this.basePositions[i * 2 + 1];
      let dx = 0;
      let dy = 0;
      let strongest = 0;

      for (const node of nodes) {
        if (!node.visible || node.confidence < 0.08) continue;
        const vx = (sx - node.base.x) * aspect;
        const vy = sy - node.base.y;
        const radius = node.radius;
        const distanceSq = vx * vx + vy * vy;
        if (distanceSq > radius * radius * 5.4) continue;
        const weight = Math.exp(-distanceSq / (2 * radius * radius));
        const shaped = weight * weight * (3 - 2 * weight);
        const influence = shaped * node.gain;
        if (influence > strongest) strongest = influence;
        dx += node.offset.x * influence;
        dy += node.offset.y * influence;
      }

      const clampFactor = strongest > 1.28 ? 1.28 / strongest : 1;
      const px = sx + dx * clampFactor;
      const py = sy + dy * clampFactor;
      this.vertices[cursor] = px * 2 - 1;
      this.vertices[cursor + 1] = 1 - py * 2;
      cursor += 4;
    }
  }

  render(nodes, live = true) {
    this.resize();
    this.rebuildLayout();
    this.updateVertices(nodes);

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.uvLocation);
    gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (live && this.video.readyState >= 2) {
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      } catch {
        // A transient frame upload error should not kill the animation loop.
      }
    }
    gl.uniform1i(this.videoLocation, 0);
    gl.uniform1f(this.liveLocation, live ? 1 : 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    const type = this.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.drawElements(gl.TRIANGLES, this.indices.length, type, 0);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteProgram(this.program);
  }
}
