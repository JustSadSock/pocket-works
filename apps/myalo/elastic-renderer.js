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

  const float PI = 3.14159265359;

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

  vec2 safeNormalize(vec2 value, vec2 fallbackValue) {
    float lengthValue = length(value);
    return lengthValue > 0.00001 ? value / lengthValue : fallbackValue;
  }

  float ellipseMask(vec2 point, vec2 center, vec2 axis, vec2 radii, float inner, float outer) {
    vec2 perpendicular = vec2(-axis.y, axis.x);
    vec2 relative = point - center;
    vec2 local = vec2(dot(relative, perpendicular), dot(relative, axis));
    float distanceValue = length(local / max(radii, vec2(0.003)));
    return 1.0 - smoothstep(inner, outer, distanceValue);
  }

  vec4 segmentInfo(vec2 point, vec2 startPoint, vec2 endPoint) {
    vec2 segment = endPoint - startPoint;
    float lengthSquared = max(0.000001, dot(segment, segment));
    float t = clamp(dot(point - startPoint, segment) / lengthSquared, 0.0, 1.0);
    vec2 closest = startPoint + segment * t;
    return vec4(closest, t, length(point - closest));
  }

  vec3 pullSoft(
    vec3 inputColor,
    vec2 pointA,
    vec2 centerA,
    vec2 deltaA,
    vec2 restAxis,
    vec2 radii,
    float core,
    float depth,
    float softness,
    float motion
  ) {
    vec2 perpendicular = vec2(-restAxis.y, restAxis.x);
    vec2 relative = pointA - centerA;
    vec2 local = vec2(dot(relative, perpendicular), dot(relative, restAxis));
    vec2 q = local / max(radii, vec2(0.004));
    float distanceValue = length(q);
    float baseWeight = 1.0 - smoothstep(core * 0.58, 1.16, distanceValue);

    vec2 dragAxis = safeNormalize(deltaA, restAxis);
    float forward = dot(relative, dragAxis);
    float forwardBoost = smoothstep(-min(radii.x, radii.y) * 0.35, max(radii.x, radii.y) * 1.25, forward);
    float weight = baseWeight * mix(0.72, 1.0, forwardBoost) * motion;

    vec2 sourceA = pointA - deltaA * weight * mix(0.70, 0.92, softness);
    vec3 color = mix(inputColor, sampleScreen(fromAspect(sourceA)), weight);

    vec2 destinationA = centerA + deltaA;
    vec2 tipAxis = safeNormalize(restAxis + dragAxis * 0.34, restAxis);
    float tipMask = ellipseMask(pointA, destinationA, tipAxis, radii * vec2(1.02, 0.94), 0.70, 1.03) * motion;
    vec2 tipPerpendicular = vec2(-tipAxis.y, tipAxis.x);
    vec2 tipRelative = pointA - destinationA;
    vec2 tipLocal = vec2(dot(tipRelative, tipPerpendicular), dot(tipRelative, tipAxis));
    vec2 sourcePointA = centerA + perpendicular * tipLocal.x + restAxis * tipLocal.y;
    vec3 tipColor = sampleScreen(fromAspect(sourcePointA));

    float radial = clamp(1.0 - length(tipLocal / max(radii, vec2(0.004))), 0.0, 1.0);
    float sideLight = dot(safeNormalize(tipRelative, perpendicular), vec2(-0.55, -0.84));
    float light = 0.96 + radial * depth * 0.09 + sideLight * depth * 0.035;
    tipColor *= light;
    color = mix(color, tipColor, tipMask * 0.88);

    float rimMask = ellipseMask(pointA, destinationA + dragAxis * min(radii.x, radii.y) * 0.16, tipAxis, radii * 1.08, 0.82, 1.10);
    color *= 1.0 - rimMask * tipMask * depth * 0.045;
    return color;
  }

  vec3 pullFeature(
    vec3 inputColor,
    vec2 pointA,
    vec2 centerA,
    vec2 deltaA,
    vec2 anchorA,
    vec2 radii,
    float core,
    float kind,
    float anchorHold,
    float rootWidth,
    float capScale,
    float depth,
    float softness,
    float motion
  ) {
    float baseRadius = max(0.012, min(radii.x, radii.y));
    vec2 fallbackAxis = safeNormalize(deltaA, vec2(0.0, 1.0));
    vec2 restAxis = safeNormalize(centerA - anchorA, -fallbackAxis);
    vec2 restPerpendicular = vec2(-restAxis.y, restAxis.x);
    float anchorDistance = length(centerA - anchorA);
    float rootReach = min(anchorDistance, max(radii.y * 0.66, baseRadius * mix(0.55, 1.42, anchorHold)));
    vec2 rootA = centerA - restAxis * rootReach;
    vec2 destinationA = centerA + deltaA;
    vec2 dragAxis = safeNormalize(deltaA, restAxis);

    vec2 bendA = centerA + deltaA * 0.27 + restAxis * baseRadius * 0.08;
    vec4 firstSegment = segmentInfo(pointA, rootA, bendA);
    vec4 secondSegment = segmentInfo(pointA, bendA, destinationA);
    bool useFirst = firstSegment.w < secondSegment.w;
    vec2 closest = useFirst ? firstSegment.xy : secondSegment.xy;
    float pathT = useFirst ? firstSegment.z * 0.46 : 0.46 + secondSegment.z * 0.54;
    vec2 tangent = useFirst
      ? safeNormalize(bendA - rootA, restAxis)
      : safeNormalize(destinationA - bendA, dragAxis);
    vec2 perpendicular = vec2(-tangent.y, tangent.x);
    float signedSide = dot(pointA - closest, perpendicular);

    float kindWidth = 1.0;
    if (kind > 1.5 && kind < 2.5) kindWidth = 0.68;
    else if (kind > 2.5 && kind < 3.5) kindWidth = 0.72;
    else if (kind > 4.5) kindWidth = 0.52;

    float widthProfile = mix(max(0.22, rootWidth), 0.96, smoothstep(0.0, 1.0, pathT));
    widthProfile *= 1.0 + sin(pathT * PI) * mix(0.05, 0.16, softness);
    float bodyWidth = baseRadius * widthProfile * kindWidth;
    float side = signedSide / max(0.002, bodyWidth);
    float bodyMask = 1.0 - smoothstep(0.76, 1.03, abs(side));
    bodyMask *= smoothstep(-0.03, 0.05, pathT) * (1.0 - smoothstep(0.97, 1.03, pathT));
    bodyMask *= motion;

    float bound = max(radii.x, radii.y) * 1.65 + length(deltaA);
    vec2 minimum = min(min(rootA, centerA), destinationA) - vec2(bound);
    vec2 maximum = max(max(rootA, centerA), destinationA) + vec2(bound);
    if (pointA.x < minimum.x || pointA.y < minimum.y || pointA.x > maximum.x || pointA.y > maximum.y) {
      return inputColor;
    }

    vec3 color = inputColor;

    vec2 oldRelative = pointA - centerA;
    vec2 oldLocal = vec2(dot(oldRelative, restPerpendicular), dot(oldRelative, restAxis));
    float oldDistance = length(oldLocal / max(radii, vec2(0.004)));
    float collapseMask = (1.0 - smoothstep(core * 0.72, 1.08, oldDistance)) * motion;
    vec2 collapseSourceA = pointA - deltaA * collapseMask * mix(0.48, 0.68, softness);
    collapseSourceA -= restAxis * length(deltaA) * collapseMask * 0.045;
    color = mix(color, sampleScreen(fromAspect(collapseSourceA)), collapseMask * 0.86);

    if (bodyMask > 0.001) {
      float sourceT = pow(clamp(pathT, 0.0, 1.0), mix(0.48, 0.68, softness));
      vec2 sourceAxisPoint = mix(rootA, centerA, sourceT);
      float sourceWidth = baseRadius * mix(max(0.20, rootWidth * 0.82), 0.98, sourceT) * kindWidth;
      vec2 sourcePointA = sourceAxisPoint + restPerpendicular * side * sourceWidth;
      vec3 bodyColor = sampleScreen(fromAspect(sourcePointA));

      float cylindrical = sqrt(max(0.0, 1.0 - min(1.0, side * side)));
      float light = 0.91 + cylindrical * depth * 0.10 - side * depth * 0.035;
      light *= 0.98 + sin(pathT * PI) * depth * 0.035;

      if (kind > 0.5 && kind < 1.5) {
        float underside = smoothstep(0.10, 0.92, side) * smoothstep(0.12, 0.82, pathT);
        bodyColor *= 1.0 - underside * depth * 0.15;
      } else if (kind > 1.5 && kind < 2.5) {
        float crease = exp(-abs(side) * 7.0) * smoothstep(0.14, 0.84, pathT);
        bodyColor = mix(bodyColor, vec3(bodyColor.r * 0.78 + 0.10, bodyColor.g * 0.54, bodyColor.b * 0.54), crease * 0.42);
      } else if (kind > 2.5 && kind < 3.5) {
        float lidShade = exp(-abs(side) * 8.0) * smoothstep(0.10, 0.72, pathT);
        bodyColor *= 1.0 - lidShade * 0.12;
      } else if (kind > 3.5 && kind < 4.5) {
        light *= 0.96 + sin((pathT + side * 0.11) * 8.0) * 0.035;
      } else if (kind > 4.5) {
        bodyColor *= 0.94;
      }

      bodyColor *= light;
      color = mix(color, bodyColor, bodyMask * 0.96);
    }

    vec2 tipAxis = safeNormalize(destinationA - bendA, dragAxis);
    vec2 tipPerpendicular = vec2(-tipAxis.y, tipAxis.x);
    vec2 tipRelative = pointA - destinationA;
    vec2 tipLocal = vec2(dot(tipRelative, tipPerpendicular), dot(tipRelative, tipAxis));
    vec2 tipRadii = radii * capScale;
    vec2 capQ = tipLocal / max(tipRadii, vec2(0.004));

    if (kind > 0.5 && kind < 1.5) {
      capQ.x /= 1.0 + clamp(capQ.y, -0.5, 0.8) * 0.16;
      capQ.y *= 0.94;
    } else if (kind > 1.5 && kind < 2.5) {
      capQ.y *= 1.22;
    } else if (kind > 2.5 && kind < 3.5) {
      capQ.y *= 1.12;
    } else if (kind > 3.5 && kind < 4.5) {
      capQ.x *= 1.08;
    } else if (kind > 4.5) {
      capQ.y *= 1.62;
    }

    float capDistance = length(capQ);
    float capMask = (1.0 - smoothstep(max(core, 0.60), 1.03, capDistance)) * motion;

    if (capMask > 0.001) {
      vec2 sourceLocal = vec2(capQ.x * radii.x, capQ.y * radii.y);
      vec2 sourcePointA = centerA + restPerpendicular * sourceLocal.x + restAxis * sourceLocal.y;
      vec3 capColor = sampleScreen(fromAspect(sourcePointA));

      float z = sqrt(max(0.0, 1.0 - min(1.0, dot(capQ, capQ))));
      vec3 normal = normalize(vec3(capQ.x * 0.66, capQ.y * 0.66, z + 0.22));
      vec3 lightDirection = normalize(vec3(-0.48, -0.72, 1.22));
      float light = 0.90 + max(0.0, dot(normal, lightDirection)) * depth * 0.16;
      light += smoothstep(0.64, 0.98, capDistance) * depth * 0.025;

      if (kind > 0.5 && kind < 1.5) {
        float nostrilLeft = 1.0 - smoothstep(0.52, 0.78, length((capQ - vec2(-0.31, 0.30)) / vec2(0.22, 0.15)));
        float nostrilRight = 1.0 - smoothstep(0.52, 0.78, length((capQ - vec2(0.31, 0.30)) / vec2(0.22, 0.15)));
        capColor *= 1.0 - max(nostrilLeft, nostrilRight) * depth * 0.20;
      } else if (kind > 1.5 && kind < 2.5) {
        float lipLine = exp(-abs(capQ.y) * 16.0) * (1.0 - smoothstep(0.58, 0.94, abs(capQ.x)));
        capColor = mix(capColor, vec3(capColor.r * 0.74 + 0.12, capColor.g * 0.50, capColor.b * 0.50), lipLine * 0.40);
      } else if (kind > 2.5 && kind < 3.5) {
        float gloss = pow(max(0.0, 1.0 - length(capQ - vec2(-0.24, -0.24))), 8.0);
        capColor += vec3(gloss * 0.075);
      } else if (kind > 3.5 && kind < 4.5) {
        capColor *= 0.98 + sin((capQ.y + capQ.x * 0.24) * 9.0) * 0.025;
      } else if (kind > 4.5) {
        capColor *= 0.93 + z * 0.07;
      }

      capColor *= light;
      color = mix(color, capColor, capMask);
    }

    float shadowMask = ellipseMask(
      pointA,
      destinationA + dragAxis * baseRadius * 0.10 + vec2(baseRadius * 0.08, baseRadius * 0.12),
      tipAxis,
      tipRadii * 1.08,
      0.78,
      1.10
    );
    shadowMask *= smoothstep(0.72, 1.02, capDistance) * motion;
    color *= 1.0 - shadowMask * depth * 0.065;

    return color;
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

    vec2 centerA = toAspect(pose.xy);
    vec2 deltaA = vec2(pose.z * u_aspect, pose.w);
    float stretch = length(deltaA);
    float motion = smoothstep(0.004, 0.018, stretch);
    if (motion < 0.002) return inputColor;

    vec2 anchorA = toAspect(anchor.xy);
    vec2 radii = vec2(max(0.012, shape.x * u_aspect), max(0.012, shape.y));
    float core = clamp(shape.z, 0.24, 0.72);
    float kind = shape.w;
    float rootWidth = material.x;
    float capScale = material.y;
    float depth = material.z;
    float softness = material.w;
    vec2 pointA = toAspect(screen);
    vec2 fallbackAxis = safeNormalize(deltaA, vec2(0.0, 1.0));
    vec2 restAxis = safeNormalize(centerA - anchorA, -fallbackAxis);

    if (kind < 0.5) {
      return pullSoft(inputColor, pointA, centerA, deltaA, restAxis, radii, core, depth, softness, motion);
    }

    return pullFeature(
      inputColor,
      pointA,
      centerA,
      deltaA,
      anchorA,
      radii,
      core,
      kind,
      anchor.z,
      rootWidth,
      capScale,
      depth,
      softness,
      motion
    );
  }

  void main() {
    vec3 color = sampleScreen(v_screen);
    color = composeFeature(color, v_screen, u_pose0, u_shape0, u_anchor0, u_material0);
    color = composeFeature(color, v_screen, u_pose1, u_shape1, u_anchor1, u_material1);

    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, 0.92);
    color = pow(max(color, vec3(0.0)), vec3(0.975));
    color *= vec3(0.997, 1.0, 0.975);
    vec3 idle = vec3(0.08, 0.085, 0.075);
    gl_FragColor = vec4(mix(idle, color, u_live), 1.0);
  }
`;

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
    const dpr = Math.min(1.15, window.devicePixelRatio || 1);
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
      gl.uniform4f(
        locations.shape,
        node.radiusX || node.radius || 0.08,
        node.radiusY || node.radius || 0.08,
        node.core || 0.48,
        node.renderKind || 0
      );
      gl.uniform4f(
        locations.anchor,
        node.anchor?.x ?? node.base.x,
        node.anchor?.y ?? node.base.y,
        node.anchorHold || 0.35,
        1
      );
      gl.uniform4f(
        locations.material,
        node.rootWidth || 0.58,
        node.capScale || 1,
        node.depth || 0.7,
        node.softness || 0.82
      );
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
