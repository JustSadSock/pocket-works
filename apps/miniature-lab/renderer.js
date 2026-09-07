(() => {
  'use strict';

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  }) || canvas.getContext('experimental-webgl');

  if (!gl) {
    window.MiniatureRenderer = { available: false, render: () => null };
    return;
  }

  const vertexSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform sampler2D u_image;
    uniform vec2 u_texel;
    uniform float u_aspect;
    uniform float u_mode;
    uniform float u_blurPx;
    uniform float u_focus;
    uniform float u_feather;
    uniform float u_angle;
    uniform float u_position;
    uniform vec2 u_objectCenter;
    uniform float u_objectScale;
    uniform float u_saturation;
    uniform float u_contrast;
    uniform float u_brightness;
    uniform float u_vignette;
    uniform float u_pop;

    varying vec2 v_texCoord;

    float sceneDepth(vec2 uvTop) {
      float a = radians(u_angle);
      vec2 normal = vec2(-sin(a), cos(a));
      vec2 p = (uvTop - 0.5) * vec2(u_aspect, 1.0);
      float maxProjection = 0.5 * (abs(normal.x) * u_aspect + abs(normal.y));
      float center = u_position * maxProjection;
      float distanceFromBand = abs(dot(p, normal) - center);
      float halfSharp = maxProjection * u_focus;
      float feather = max(0.008, maxProjection * u_feather);
      float depth = smoothstep(halfSharp, halfSharp + feather * 1.85, distanceFromBand);
      return pow(clamp(depth, 0.0, 1.0), 0.78);
    }

    float objectDepth(vec2 uvTop) {
      vec2 p = (uvTop - u_objectCenter) * vec2(u_aspect, 1.0);
      float baseRadius = clamp(u_focus * 1.7, 0.11, 0.62) * u_objectScale;
      float rx = max(0.04, baseRadius * 1.22);
      float ry = max(0.04, baseRadius * 0.84);
      float ellipseDistance = length(vec2(p.x / rx, p.y / ry));
      float transition = max(0.08, u_feather * 2.25);
      float depth = smoothstep(1.0, 1.0 + transition, ellipseDistance);
      return pow(clamp(depth, 0.0, 1.0), 0.8);
    }

    vec3 grade(vec3 color, float depth) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, u_saturation);
      color = (color - 0.5) * u_contrast + 0.5;
      color *= u_brightness;

      float focusWeight = 1.0 - depth;
      float localSat = 1.0 + u_pop * 0.13 * focusWeight;
      float localContrast = 1.0 + u_pop * 0.16 * focusWeight;
      luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, localSat);
      color = (color - 0.5) * localContrast + 0.5;
      return clamp(color, 0.0, 1.0);
    }

    vec4 sampleAt(vec2 offset, float radius) {
      vec2 uv = clamp(v_texCoord + offset * u_texel * radius, 0.001, 0.999);
      return texture2D(u_image, uv);
    }

    void main() {
      vec2 uvTop = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
      float depth = u_mode < 0.5 ? sceneDepth(uvTop) : objectDepth(uvTop);
      float radius = u_blurPx * depth;

      vec4 color;
      if (radius < 0.35) {
        color = texture2D(u_image, v_texCoord);
      } else {
        color = texture2D(u_image, v_texCoord) * 1.45;
        color += sampleAt(vec2(0.5278, -0.0859), radius);
        color += sampleAt(vec2(-0.0401, 0.5360), radius);
        color += sampleAt(vec2(-0.6704, -0.1799), radius);
        color += sampleAt(vec2(-0.4194, -0.6160), radius);
        color += sampleAt(vec2(0.4404, -0.6394), radius);
        color += sampleAt(vec2(-0.7571, 0.3493), radius);
        color += sampleAt(vec2(0.5746, 0.6859), radius);
        color += sampleAt(vec2(0.8870, 0.0300), radius);
        color += sampleAt(vec2(-0.2022, 0.9184), radius);
        color += sampleAt(vec2(-0.9273, -0.4030), radius);
        color += sampleAt(vec2(0.2626, -0.9623), radius);
        color += sampleAt(vec2(0.9532, 0.3350), radius);
        color /= 13.45;
      }

      color.rgb = grade(color.rgb, depth);

      float edge = length((uvTop - 0.5) * vec2(u_aspect, 1.0));
      float vignette = smoothstep(0.38, 0.82, edge) * u_vignette;
      color.rgb *= 1.0 - vignette;

      gl_FragColor = vec4(color.rgb, 1.0);
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  if (!program) {
    window.MiniatureRenderer = { available: false, render: () => null };
    return;
  }

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  const uniforms = Object.fromEntries([
    'u_image','u_texel','u_aspect','u_mode','u_blurPx','u_focus','u_feather','u_angle','u_position',
    'u_objectCenter','u_objectScale','u_saturation','u_contrast','u_brightness','u_vignette','u_pop'
  ].map((name) => [name, gl.getUniformLocation(program, name)]));

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1
  ]), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0,  1, 0,  0, 1,
    0, 1,  1, 0,  1, 1
  ]), gl.STATIC_DRAW);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  function render(source, width, height, settings, mode) {
    try {
      if (!source || !width || !height) return null;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1i(uniforms.u_image, 0);
      gl.uniform2f(uniforms.u_texel, 1 / width, 1 / height);
      gl.uniform1f(uniforms.u_aspect, width / height);
      gl.uniform1f(uniforms.u_mode, mode === 'object' ? 1 : 0);
      gl.uniform1f(uniforms.u_blurPx, Math.max(0, Number(settings.blur) || 0) * Math.min(width, height) / 900);
      gl.uniform1f(uniforms.u_focus, clamp((Number(settings.focus) || 18) / 100, 0.02, 0.75));
      gl.uniform1f(uniforms.u_feather, clamp((Number(settings.feather) || 18) / 100, 0.02, 0.75));
      gl.uniform1f(uniforms.u_angle, Number(settings.angle) || 0);
      gl.uniform1f(uniforms.u_position, clamp(Number(settings.position) || 0, -0.98, 0.98));
      gl.uniform2f(uniforms.u_objectCenter, clamp(Number(settings.objectX) || 0.5, 0, 1), clamp(Number(settings.objectY) || 0.5, 0, 1));
      gl.uniform1f(uniforms.u_objectScale, clamp(Number(settings.objectScale) || 1, 0.55, 1.8));
      gl.uniform1f(uniforms.u_saturation, clamp((Number(settings.saturation) || 100) / 100, 0, 2.5));
      gl.uniform1f(uniforms.u_contrast, clamp((Number(settings.contrast) || 100) / 100, 0.4, 2.2));
      gl.uniform1f(uniforms.u_brightness, clamp((Number(settings.brightness) || 100) / 100, 0.5, 1.8));
      gl.uniform1f(uniforms.u_vignette, clamp((Number(settings.vignette) || 0) / 100 * 0.82, 0, 0.5));
      gl.uniform1f(uniforms.u_pop, clamp((Number(settings.pop) || 0) / 100, 0, 1));

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.flush();
      return canvas;
    } catch (error) {
      console.warn('[Miniature Lab] renderer failed:', error);
      return null;
    }
  }

  function createProgram(context, vertex, fragment) {
    const vs = compileShader(context, context.VERTEX_SHADER, vertex);
    const fs = compileShader(context, context.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return null;
    const p = context.createProgram();
    context.attachShader(p, vs);
    context.attachShader(p, fs);
    context.linkProgram(p);
    if (!context.getProgramParameter(p, context.LINK_STATUS)) {
      console.warn('[Miniature Lab] shader link failed:', context.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function compileShader(context, type, source) {
    const shader = context.createShader(type);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      console.warn('[Miniature Lab] shader compile failed:', context.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.MiniatureRenderer = {
    available: true,
    render
  };
})();
