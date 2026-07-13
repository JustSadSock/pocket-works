const MAX_ACTIVE_NODES = 4;

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
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    }) || canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });

    if (!this.gl) throw new Error('WebGL недоступен');

    this.cols = 40;
    this.rows = 58;
    this.vertexCount = this.cols * this.rows;
    this.vertices = new Float32Array(this.vertexCount * 4);
    this.indices = this.buildIndices();
    this.cover = { scale: 1, offsetX: 0, offsetY: 0, renderedWidth: 1, renderedHeight: 1 };
    this.lastLayoutKey = '';
    this.lastVideoTime = -1;
    this.videoFrameDirty = true;
    this.videoFrameHandle = 0;

    const gl = this.gl;
    this.program = createProgram(gl, `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      varying vec2 v_uv;
      varying float v_lift;
      uniform float u_aspect;

      uniform vec4 u_node0;
      uniform vec4 u_shape0;
      uniform vec3 u_anchor0;
      uniform float u_enabled0;
      uniform vec4 u_node1;
      uniform vec4 u_shape1;
      uniform vec3 u_anchor1;
      uniform float u_enabled1;
      uniform vec4 u_node2;
      uniform vec4 u_shape2;
      uniform vec3 u_anchor2;
      uniform float u_enabled2;
      uniform vec4 u_node3;
      uniform vec4 u_shape3;
      uniform vec3 u_anchor3;
      uniform float u_enabled3;

      vec2 applyNode(vec2 point, vec4 node, vec4 shape, vec3 anchor, float enabled, inout float lift) {
        if (enabled < 0.5) return point;
        vec2 relative = point - node.xy;
        float rx = max(0.008, shape.x);
        float ry = max(0.008, shape.y);
        vec2 metric = vec2(relative.x * u_aspect / rx, relative.y / ry);
        float distanceFromCenter = length(metric);
        if (distanceFromCenter >= 1.0) return point;

        float core = clamp(shape.z, 0.08, 0.72);
        float transition = clamp((distanceFromCenter - core) / max(0.001, 1.0 - core), 0.0, 1.0);
        float weight = 1.0 - transition * transition * (3.0 - 2.0 * transition);

        vec2 metricDirection = metric / max(0.0001, distanceFromCenter);
        float towardAnchor = clamp((dot(metricDirection, anchor.xy) + 0.12) / 1.12, 0.0, 1.0);
        float hinge = towardAnchor * (1.0 - distanceFromCenter) * anchor.z;
        weight *= 1.0 - hinge;

        vec2 movement = node.zw * weight;
        float stretch = length(node.zw);
        float shell = 4.0 * distanceFromCenter * (1.0 - distanceFromCenter) * weight;
        vec2 screenDirection = vec2(metricDirection.x / max(0.45, u_aspect), metricDirection.y);
        vec2 volume = screenDirection * stretch * shape.w * shell;
        lift = max(lift, weight * clamp(stretch * 8.0, 0.0, 1.0));
        return point + movement + volume;
      }

      void main() {
        vec2 point = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
        float lift = 0.0;
        point = applyNode(point, u_node0, u_shape0, u_anchor0, u_enabled0, lift);
        point = applyNode(point, u_node1, u_shape1, u_anchor1, u_enabled1, lift);
        point = applyNode(point, u_node2, u_shape2, u_anchor2, u_enabled2, lift);
        point = applyNode(point, u_node3, u_shape3, u_anchor3, u_enabled3, lift);
        gl_Position = vec4(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, 0.0, 1.0);
        v_uv = a_uv;
        v_lift = lift;
      }
    `, `
      precision mediump float;
      varying vec2 v_uv;
      varying float v_lift;
      uniform sampler2D u_video;
      uniform float u_live;
      void main() {
        vec3 color = texture2D(u_video, v_uv).rgb;
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luminance), color, 0.90);
        color = pow(color, vec3(0.97));
        color *= vec3(0.995, 1.0, 0.97);
        color *= 1.0 + v_lift * 0.045;
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
    this.aspectLocation = gl.getUniformLocation(this.program, 'u_aspect');
    this.nodeLocations = Array.from({ length: MAX_ACTIVE_NODES }, (_, index) => ({
      node: gl.getUniformLocation(this.program, `u_node${index}`),
      shape: gl.getUniformLocation(this.program, `u_shape${index}`),
      anchor: gl.getUniformLocation(this.program, `u_anchor${index}`),
      enabled: gl.getUniformLocation(this.program, `u_enabled${index}`)
    }));

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([18, 19, 17, 255]));

    this.rebuildLayout();
    this.armVideoFrameCallback();
  }

  armVideoFrameCallback() {
    if (typeof this.video.requestVideoFrameCallback !== 'function') return;
    const onFrame = () => {
      this.videoFrameDirty = true;
      this.videoFrameHandle = this.video.requestVideoFrameCallback(onFrame);
    };
    this.videoFrameHandle = this.video.requestVideoFrameCallback(onFrame);
  }

  buildIndices() {
    const indexCount = (this.cols - 1) * (this.rows - 1) * 6;
    const indices = new Uint16Array(indexCount);
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
    const dpr = Math.min(1.35, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
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
        this.vertices[cursor++] = sx * 2 - 1;
        this.vertices[cursor++] = 1 - sy * 2;
        this.vertices[cursor++] = 1 - sourceX;
        this.vertices[cursor++] = sourceY;
      }
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
  }

  mapLandmarkToScreen(point) {
    const cssWidth = Math.max(1, this.canvas.clientWidth || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || 1);
    return {
      x: (this.cover.offsetX + (1 - point.x) * this.cover.renderedWidth) / cssWidth,
      y: (this.cover.offsetY + point.y * this.cover.renderedHeight) / cssHeight
    };
  }

  screenToVideo(point) {
    const cssWidth = Math.max(1, this.canvas.clientWidth || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || 1);
    return {
      x: 1 - ((point.x * cssWidth - this.cover.offsetX) / this.cover.renderedWidth),
      y: (point.y * cssHeight - this.cover.offsetY) / this.cover.renderedHeight
    };
  }

  activeNodes(nodes) {
    return nodes
      .filter((node) => node.visible && node.confidence >= 0.08 && (
        node.grabbedBy !== null ||
        Math.hypot(node.offset.x, node.offset.y) > 0.00022 ||
        Math.hypot(node.velocity.x, node.velocity.y) > 0.003
      ))
      .sort((a, b) => {
        const scoreA = (a.grabbedBy !== null ? 10 : 0) + Math.hypot(a.offset.x, a.offset.y) * 12;
        const scoreB = (b.grabbedBy !== null ? 10 : 0) + Math.hypot(b.offset.x, b.offset.y) * 12;
        return scoreB - scoreA;
      })
      .slice(0, MAX_ACTIVE_NODES);
  }

  uploadNodeUniforms(nodes, aspect) {
    const gl = this.gl;
    const active = this.activeNodes(nodes);
    for (let index = 0; index < MAX_ACTIVE_NODES; index += 1) {
      const locations = this.nodeLocations[index];
      const node = active[index];
      if (!node) {
        gl.uniform1f(locations.enabled, 0);
        continue;
      }

      const radiusX = node.radiusX || node.radius || 0.08;
      const radiusY = node.radiusY || node.radius || 0.08;
      const anchorX = (node.anchor.x - node.base.x) * aspect / Math.max(0.008, radiusX);
      const anchorY = (node.anchor.y - node.base.y) / Math.max(0.008, radiusY);
      const anchorLength = Math.hypot(anchorX, anchorY) || 1;
      const gain = node.gain || 1;

      gl.uniform4f(locations.node, node.base.x, node.base.y, node.offset.x * gain, node.offset.y * gain);
      gl.uniform4f(locations.shape, radiusX, radiusY, node.core || 0.38, node.bulge || 0.08);
      gl.uniform3f(locations.anchor, anchorX / anchorLength, anchorY / anchorLength, node.anchorHold || 0);
      gl.uniform1f(locations.enabled, 1);
    }
  }

  uploadVideoTexture(live) {
    if (!live || this.video.readyState < 2) return;
    const currentTime = this.video.currentTime;
    const hasVideoCallback = typeof this.video.requestVideoFrameCallback === 'function';
    if (hasVideoCallback && !this.videoFrameDirty) return;
    if (!hasVideoCallback && currentTime === this.lastVideoTime) return;

    try {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      this.videoFrameDirty = false;
      this.lastVideoTime = currentTime;
    } catch {
      // A transient video upload error should not kill the render loop.
    }
  }

  render(nodes, live = true) {
    this.resize();
    this.rebuildLayout();

    const gl = this.gl;
    const aspect = Math.max(0.45, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    gl.useProgram(this.program);
    gl.uniform1f(this.aspectLocation, aspect);
    this.uploadNodeUniforms(nodes, aspect);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.uvLocation);
    gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    this.uploadVideoTexture(live);
    gl.uniform1i(this.videoLocation, 0);
    gl.uniform1f(this.liveLocation, live ? 1 : 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  destroy() {
    if (this.videoFrameHandle && typeof this.video.cancelVideoFrameCallback === 'function') {
      this.video.cancelVideoFrameCallback(this.videoFrameHandle);
    }
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteProgram(this.program);
  }
}
