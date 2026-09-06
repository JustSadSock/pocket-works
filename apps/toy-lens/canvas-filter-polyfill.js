(() => {
  'use strict';

  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto || nativeCanvasFilterWorks()) return;

  const filterState = new WeakMap();
  const nativeDescriptor = Object.getOwnPropertyDescriptor(proto, 'filter');
  const nativeDrawImage = proto.drawImage;
  const renderer = createRenderer();

  try {
    Object.defineProperty(proto, 'filter', {
      configurable: true,
      enumerable: nativeDescriptor?.enumerable ?? true,
      get() {
        if (filterState.has(this)) return filterState.get(this);
        if (nativeDescriptor?.get) {
          try { return nativeDescriptor.get.call(this); } catch (_) {}
        }
        return 'none';
      },
      set(value) {
        const text = String(value || 'none');
        filterState.set(this, text);
        if (nativeDescriptor?.set) {
          try { nativeDescriptor.set.call(this, text); } catch (_) {}
        }
      }
    });
  } catch (_) {
    // Safari versions without a configurable descriptor still allow reading
    // the assigned value from the context object in the drawImage wrapper.
  }

  proto.drawImage = function patchedDrawImage(source, ...args) {
    const filter = filterState.get(this) || safeReadFilter(this);
    if (!renderer || !filter || filter === 'none' || args.length !== 4) {
      return nativeDrawImage.call(this, source, ...args);
    }

    const [, , drawWidth, drawHeight] = args;
    const width = Math.max(2, Math.round(Math.abs(Number(drawWidth) || this.canvas.width || 2)));
    const height = Math.max(2, Math.round(Math.abs(Number(drawHeight) || this.canvas.height || 2)));
    const params = parseFilter(filter);

    if (!params.active) return nativeDrawImage.call(this, source, ...args);

    try {
      const rendered = renderer.render(source, width, height, params);
      const previous = filterState.get(this);
      filterState.set(this, 'none');
      const result = nativeDrawImage.call(this, rendered, ...args);
      filterState.set(this, previous || filter);
      return result;
    } catch (error) {
      console.warn('[Toy Lens] WebGL canvas-filter fallback failed:', error);
      return nativeDrawImage.call(this, source, ...args);
    }
  };

  function nativeCanvasFilterWorks() {
    try {
      const target = document.createElement('canvas');
      target.width = target.height = 9;
      const ctx = target.getContext('2d', { willReadFrequently: true });
      if (!ctx || !('filter' in ctx)) return false;

      const dot = document.createElement('canvas');
      dot.width = dot.height = 1;
      const dotCtx = dot.getContext('2d');
      dotCtx.fillStyle = '#000';
      dotCtx.fillRect(0, 0, 1, 1);

      ctx.clearRect(0, 0, 9, 9);
      ctx.filter = 'blur(2px)';
      ctx.drawImage(dot, 4, 4);
      ctx.filter = 'none';
      const alpha = ctx.getImageData(2, 4, 1, 1).data[3];
      return alpha > 0;
    } catch (_) {
      return false;
    }
  }

  function safeReadFilter(ctx) {
    try {
      const value = ctx.filter;
      return typeof value === 'string' ? value : 'none';
    } catch (_) {
      return 'none';
    }
  }

  function parseFilter(text) {
    const blur = readNumber(text, /blur\(([-\d.]+)px\)/i, 0);
    const saturation = readNumber(text, /saturate\(([-\d.]+)%\)/i, 100) / 100;
    const contrast = readNumber(text, /contrast\(([-\d.]+)%\)/i, 100) / 100;
    const brightness = readNumber(text, /brightness\(([-\d.]+)%\)/i, 100) / 100;
    return {
      blur: Math.max(0, blur),
      saturation: Math.max(0, saturation),
      contrast: Math.max(0, contrast),
      brightness: Math.max(0, brightness),
      active: blur > 0 || Math.abs(saturation - 1) > 0.001 || Math.abs(contrast - 1) > 0.001 || Math.abs(brightness - 1) > 0.001
    };
  }

  function readNumber(text, expression, fallback) {
    const match = expression.exec(text);
    const value = match ? Number(match[1]) : fallback;
    return Number.isFinite(value) ? value : fallback;
  }

  function createRenderer() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    }) || canvas.getContext('experimental-webgl');
    if (!gl) return null;

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
      uniform float u_blur;
      uniform float u_saturation;
      uniform float u_contrast;
      uniform float u_brightness;
      varying vec2 v_texCoord;

      vec3 grade(vec3 color) {
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, u_saturation);
        color = (color - 0.5) * u_contrast + 0.5;
        color *= u_brightness;
        return clamp(color, 0.0, 1.0);
      }

      vec4 tap(vec2 offset) {
        vec4 c = texture2D(u_image, clamp(v_texCoord + offset * u_texel * u_blur, 0.001, 0.999));
        c.rgb = grade(c.rgb);
        return c;
      }

      void main() {
        if (u_blur < 0.01) {
          vec4 c = texture2D(u_image, v_texCoord);
          c.rgb = grade(c.rgb);
          gl_FragColor = c;
          return;
        }

        vec4 color = vec4(0.0);
        color += tap(vec2(0.0, 0.0));
        color += tap(vec2(0.5278, -0.0859));
        color += tap(vec2(-0.0401, 0.5360));
        color += tap(vec2(-0.6704, -0.1799));
        color += tap(vec2(-0.4194, -0.6160));
        color += tap(vec2(0.4404, -0.6394));
        color += tap(vec2(-0.7571, 0.3493));
        color += tap(vec2(0.5746, 0.6859));
        color += tap(vec2(0.8870, 0.0300));
        color += tap(vec2(-0.2022, 0.9184));
        color += tap(vec2(-0.9273, -0.4030));
        color += tap(vec2(0.2626, -0.9623));
        color += tap(vec2(0.9532, 0.3350));
        gl_FragColor = color / 13.0;
      }
    `;

    const program = createProgram(gl, vertexSource, fragmentSource);
    if (!program) return null;

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    const texelLocation = gl.getUniformLocation(program, 'u_texel');
    const blurLocation = gl.getUniformLocation(program, 'u_blur');
    const saturationLocation = gl.getUniformLocation(program, 'u_saturation');
    const contrastLocation = gl.getUniformLocation(program, 'u_contrast');
    const brightnessLocation = gl.getUniformLocation(program, 'u_brightness');

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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    return {
      render(source, width, height, params) {
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

        gl.uniform2f(texelLocation, 1 / width, 1 / height);
        gl.uniform1f(blurLocation, params.blur);
        gl.uniform1f(saturationLocation, params.saturation);
        gl.uniform1f(contrastLocation, params.contrast);
        gl.uniform1f(brightnessLocation, params.brightness);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.finish();
        return canvas;
      }
    };
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[Toy Lens] WebGL link failed:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[Toy Lens] WebGL shader failed:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }
})();
