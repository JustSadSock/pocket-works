const MAX_ACTIVE_NODES = 2;

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

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_screen;
  varying vec2 v_screen;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_screen = a_screen;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  varying vec2 v_screen;
  uniform sampler2D u_video;
  uniform float u_live;
  uniform float u_aspect;
  uniform vec2 u_uvOrigin;
  uniform vec2 u_uvScale;

  uniform vec4 u_pose0;
  uniform vec4 u_shape0;
  uniform vec4 u_anchor0;
  uniform vec4 u_material0;
  uniform vec4 u_pose1;
  uniform vec4 u_shape1;
  uniform vec4 u_anchor1;
  uniform vec4 u_material1;

  vec2 toAspect(vec2 point) {
    return vec2(point.x * u_aspect, point.y);
  }

  vec2 fromAspect(vec2 point) {
    return vec2(point.x / max(0.35, u_aspect), point.y);
  }

  vec2 screenToUv(vec2 point) {
    return u_uvOrigin + clamp(point, vec2(0.0), vec2(1.0)) * u_uvScale;
  }

  vec3 sampleScreen(vec2 point) {
    return texture2D(u_video, screenToUv(point)).rgb;
  }

  float ellipseDistance(vec2 pointA, vec2 centerA, vec2 radii) {
    return length((pointA - centerA) / max(radii, vec2(0.003)));
  }

  float softEllipse(vec2 pointA, vec2 centerA, vec2 radii, float inner, float outer) {
    return 1.0 - smoothstep(inner, outer, ellipseDistance(pointA, centerA, radii));
  }

  float oval(vec2 point, vec2 center, vec2 radii) {
    vec2 q = (point - center) / radii;
    return 1.0 - smoothstep(0.72, 1.0, dot(q, q));
  }

  vec3 composeFeature(
    vec3 inputColor,
    vec2 screen,
    vec4 pose,
    vec4 shape,
    vec4 anchor,
    vec4 material
  ) {
    if (anchor.w < 0.5) return inputColor;

    vec2 center = pose.xy;
    vec2 delta = pose.zw;
    vec2 radii = max(shape.xy, vec2(0.012));
    float core = clamp(shape.z, 0.24, 0.72);
    float kind = shape.w;
    float tubeFactor = material.x;
    float objectScale = max(0.82, material.y);
    float depth = material.z;
    float healStrength = material.w;

    vec2 pointA = toAspect(screen);
    vec2 centerA = toAspect(center);
    vec2 deltaA = vec2(delta.x * u_aspect, delta.y);
    vec2 destinationA = centerA + deltaA;
    float stretch = length(deltaA);
    float motion = smoothstep(0.003, 0.020, stretch);
    if (motion < 0.002) return inputColor;

    float baseRadius = max(0.012, min(radii.x, radii.y));
    vec2 anchorA = toAspect(anchor.xy);
    vec2 anchorVector = anchorA - centerA;
    float anchorLength = length(anchorVector);
    vec2 fallbackDirection = normalize(vec2(-deltaA.x, -deltaA.y - 0.001));
    vec2 anchorDirection = anchorLength > 0.001 ? anchorVector / anchorLength : fallbackDirection;
    float rootReach = min(anchorLength, baseRadius * mix(0.28, 1.18, clamp(anchor.z, 0.0, 1.0)));
    vec2 rootA = centerA + anchorDirection * rootReach;

    float bound = max(radii.x, radii.y) * 1.65 + stretch;
    vec2 minimum = min(min(centerA, destinationA), rootA) - vec2(bound);
    vec2 maximum = max(max(centerA, destinationA), rootA) + vec2(bound);
    if (pointA.x < minimum.x || pointA.y < minimum.y || pointA.x > maximum.x || pointA.y > maximum.y) {
      return inputColor;
    }

    vec3 color = inputColor;

    vec2 sourceMetric = (pointA - centerA) / radii;
    float sourceDistance = length(sourceMetric);
    float holeMask = (1.0 - smoothstep(core * 0.72, 1.03, sourceDistance)) * motion;
    if (holeMask > 0.001) {
      vec2 radial = sourceMetric + anchorDirection * 0.34;
      radial = radial / max(0.001, length(radial));
      vec2 ringA = centerA + vec2(radial.x * radii.x, radial.y * radii.y) * 1.08;
      ringA += anchorDirection * baseRadius * 0.18;
      vec3 healed = sampleScreen(fromAspect(ringA));
      color = mix(color, healed, holeMask * healStrength * 0.94);
    }

    vec2 shadowDirection = normalize(deltaA + vec2(baseRadius * 0.28, baseRadius * 0.42));
    vec2 shadowCenterA = destinationA + shadowDirection * baseRadius * (0.16 + depth * 0.08);
    float shadowMask = softEllipse(pointA, shadowCenterA, radii * 1.16, 0.70, 1.05) * motion;
    float destinationDistance = ellipseDistance(pointA, destinationA, radii);
    shadowMask *= smoothstep(0.72, 0.98, destinationDistance);
    color *= 1.0 - shadowMask * (0.13 + depth * 0.10);

    vec2 segment = destinationA - rootA;
    float segmentLengthSq = max(0.000001, dot(segment, segment));
    float rawT = dot(pointA - rootA, segment) / segmentLengthSq;
    float t = clamp(rawT, 0.0, 1.0);
    vec2 direction = segment / sqrt(segmentLengthSq);
    vec2 perpendicular = vec2(-direction.y, direction.x);
    vec2 closest = rootA + segment * t;
    float tubeWidth = baseRadius * tubeFactor * mix(0.48, 0.92, smoothstep(0.0, 1.0, t));
    float signedSide = dot(pointA - closest, perpendicular);
    float side = signedSide / max(0.002, tubeWidth);
    float tubeMask = 1.0 - smoothstep(0.76, 1.0, abs(side));
    tubeMask *= smoothstep(-0.06, 0.08, rawT) * (1.0 - smoothstep(0.92, 1.08, rawT));
    tubeMask *= motion;

    if (tubeMask > 0.001) {
      vec2 sourceAxisA = mix(rootA, centerA, smoothstep(0.02, 0.98, t));
      vec2 sourceA = sourceAxisA + perpendicular * side * baseRadius * tubeFactor * 0.68;
      vec3 tubeColor = sampleScreen(fromAspect(sourceA));
      float cylinderLight = 0.78 + 0.20 * sqrt(max(0.0, 1.0 - min(1.0, side * side)));
      cylinderLight += -side * 0.055;
      cylinderLight *= 0.93 + 0.08 * sin(t * 3.14159265);

      if (kind > 1.5 && kind < 2.5) {
        float innerLip = exp(-abs(side) * 6.0) * smoothstep(0.12, 0.78, t);
        vec3 lipInterior = vec3(tubeColor.r * 0.86 + 0.10, tubeColor.g * 0.50, tubeColor.b * 0.50);
        tubeColor = mix(tubeColor, lipInterior, innerLip * 0.58);
      } else if (kind > 2.5 && kind < 3.5) {
        float lidSeam = exp(-abs(side) * 9.0) * smoothstep(0.20, 0.72, t);
        tubeColor *= 1.0 - lidSeam * 0.20;
      } else if (kind > 3.5 && kind < 4.5) {
        cylinderLight *= 0.90 + 0.10 * sin((t + side * 0.16) * 9.0);
      } else if (kind > 4.5) {
        tubeColor *= 0.88;
      }

      tubeColor *= cylinderLight;
      color = mix(color, tubeColor, tubeMask * 0.96);
    }

    vec2 localA = pointA - destinationA;
    vec2 objectQ = localA / radii;
    float objectDistance = length(objectQ);
    float objectMask = 1.0 - smoothstep(max(core, 0.68), 1.03, objectDistance);
    objectMask *= motion;

    if (objectMask > 0.001) {
      vec2 sourceLocalA = localA / objectScale;
      vec2 sourcePointA = centerA + sourceLocalA;
      vec3 objectColor = sampleScreen(fromAspect(sourcePointA));

      float z = sqrt(max(0.0, 1.0 - min(1.0, dot(objectQ, objectQ))));
      vec3 normal = normalize(vec3(objectQ.x * 0.72, objectQ.y * 0.72, z + 0.16));
      vec3 lightDirection = normalize(vec3(-0.48, -0.62, 1.15));
      float light = 0.80 + max(0.0, dot(normal, lightDirection)) * (0.18 + depth * 0.13);
      float rim = smoothstep(0.62, 0.96, objectDistance) * max(0.0, dot(normal.xy, -lightDirection.xy));
      light += rim * depth * 0.12;

      if (kind > 0.5 && kind < 1.5) {
        float nostrilA = oval(objectQ, vec2(-0.30, 0.30), vec2(0.20, 0.13));
        float nostrilB = oval(objectQ, vec2(0.30, 0.30), vec2(0.20, 0.13));
        float nostrils = max(nostrilA, nostrilB) * smoothstep(0.035, 0.10, stretch);
        objectColor *= 1.0 - nostrils * 0.22;
      } else if (kind > 1.5 && kind < 2.5) {
        float lipLine = exp(-abs(objectQ.y) * 18.0) * (1.0 - smoothstep(0.60, 0.94, abs(objectQ.x)));
        objectColor = mix(objectColor, vec3(objectColor.r * 0.74 + 0.12, objectColor.g * 0.48, objectColor.b * 0.48), lipLine * 0.42);
      } else if (kind > 2.5 && kind < 3.5) {
        float eyeGloss = pow(max(0.0, 1.0 - length(objectQ - vec2(-0.22, -0.24))), 7.0);
        objectColor += vec3(eyeGloss * 0.10);
      } else if (kind > 3.5 && kind < 4.5) {
        float fold = sin((objectQ.y + objectQ.x * 0.28) * 10.0) * 0.035;
        objectColor *= 0.98 + fold;
      } else if (kind > 4.5) {
        objectColor *= 0.90 + z * 0.10;
      }

      objectColor *= light;
      color = mix(color, objectColor, objectMask);
    }

    return color;
  }

  void main() {
    vec3 color = sampleScreen(v_screen);
    color = composeFeature(color, v_screen, u_pose0, u_shape0, u_anchor0, u_material0);
    color = composeFeature(color, v_screen, u_pose1, u_shape1, u_anchor1, u_material1);

    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, 0.91);
    color = pow(max(color, vec3(0.0)), vec3(0.97));
    color *= vec3(0.995, 1.0, 0.97);
    vec3 idle = vec3(0.08, 0.085, 0.075);
    gl_FragColor = vec4(mix(idle, color, u_live), 1.0);
  }
`;

export class ElasticRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    const contextOptions = {
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    };
    this.gl = canvas.getContext('webgl', contextOptions) || canvas.getContext('experimental-webgl', contextOptions);

    if (!this.gl) throw new Error('WebGL недоступен');

    this.cover = { scale: 1, offsetX: 0, offsetY: 0, renderedWidth: 1, renderedHeight: 1 };
    this.uvOrigin = { x: 1, y: 0 };
    this.uvScale = { x: -1, y: 1 };
    this.lastLayoutKey = '';
    this.lastVideoTime = -1;
    this.videoFrameDirty = true;
    this.videoFrameHandle = 0;

    const gl = this.gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.screenLocation = gl.getAttribLocation(this.program, 'a_screen');
    this.videoLocation = gl.getUniformLocation(this.program, 'u_video');
    this.liveLocation = gl.getUniformLocation(this.program, 'u_live');
    this.aspectLocation = gl.getUniformLocation(this.program, 'u_aspect');
    this.uvOriginLocation = gl.getUniformLocation(this.program, 'u_uvOrigin');
    this.uvScaleLocation = gl.getUniformLocation(this.program, 'u_uvScale');
    this.nodeLocations = Array.from({ length: MAX_ACTIVE_NODES }, (_, index) => ({
      pose: gl.getUniformLocation(this.program, `u_pose${index}`),
      shape: gl.getUniformLocation(this.program, `u_shape${index}`),
      anchor: gl.getUniformLocation(this.program, `u_anchor${index}`),
      material: gl.getUniformLocation(this.program, `u_material${index}`)
    }));

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,  1, 0, 0,
       1,  1, 1, 0,
      -1, -1, 0, 1,
       1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 2, 1, 1, 2, 3]), gl.STATIC_DRAW);

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

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(1.2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.lastLayoutKey = '';
    this.rebuildLayout();
    return true;
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
    this.uvOrigin.x = 1 + offsetX / renderedWidth;
    this.uvOrigin.y = -offsetY / renderedHeight;
    this.uvScale.x = -cssWidth / renderedWidth;
    this.uvScale.y = cssHeight / renderedHeight;
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
        Math.hypot(node.offset.x, node.offset.y) > 0.00028 ||
        Math.hypot(node.velocity.x, node.velocity.y) > 0.003
      ))
      .sort((a, b) => {
        const scoreA = (a.grabbedBy !== null ? 20 : 0) + Math.hypot(a.offset.x, a.offset.y) * 20;
        const scoreB = (b.grabbedBy !== null ? 20 : 0) + Math.hypot(b.offset.x, b.offset.y) * 20;
        return scoreA - scoreB;
      })
      .slice(-MAX_ACTIVE_NODES);
  }

  uploadNodeUniforms(nodes) {
    const gl = this.gl;
    const active = this.activeNodes(nodes);
    for (let index = 0; index < MAX_ACTIVE_NODES; index += 1) {
      const locations = this.nodeLocations[index];
      const node = active[index];
      if (!node) {
        gl.uniform4f(locations.anchor, 0, 0, 0, 0);
        continue;
      }

      const gain = node.gain || 1;
      gl.uniform4f(locations.pose, node.base.x, node.base.y, node.offset.x * gain, node.offset.y * gain);
      gl.uniform4f(locations.shape, node.radiusX || node.radius || 0.08, node.radiusY || node.radius || 0.08, node.core || 0.48, node.renderKind || 0);
      gl.uniform4f(locations.anchor, node.anchor?.x ?? node.base.x, node.anchor?.y ?? node.base.y, node.anchorHold || 0.35, 1);
      gl.uniform4f(locations.material, node.tube || 0.65, node.objectScale || 1, node.depth || 0.7, node.heal || 0.9);
    }
  }

  uploadVideoTexture(live) {
    if (!live || this.video.readyState < 2) return;
    const currentTime = this.video.currentTime;
    const callbackDriven = typeof this.video.requestVideoFrameCallback === 'function';
    if (callbackDriven && !this.videoFrameDirty) return;
    if (!callbackDriven && currentTime === this.lastVideoTime) return;

    try {
      const gl = this.gl;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      this.lastVideoTime = currentTime;
      this.videoFrameDirty = false;
    } catch {
      // A transient iOS video upload failure is safe to skip for one frame.
    }
  }

  render(nodes, live = true) {
    this.resize();
    this.rebuildLayout();

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.screenLocation);
    gl.vertexAttribPointer(this.screenLocation, 2, gl.FLOAT, false, 16, 8);

    gl.uniform1f(this.aspectLocation, Math.max(0.35, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)));
    gl.uniform2f(this.uvOriginLocation, this.uvOrigin.x, this.uvOrigin.y);
    gl.uniform2f(this.uvScaleLocation, this.uvScale.x, this.uvScale.y);
    this.uploadNodeUniforms(nodes);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    this.uploadVideoTexture(live);
    gl.uniform1i(this.videoLocation, 0);
    gl.uniform1f(this.liveLocation, live ? 1 : 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
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
