// OTVES optical material library. All shaders are local, deterministic GLSL ES 3.00.
// Stage II: physically inspired microfacet surfaces and a two-pass screen-space
// refraction approximation. No CDN, textures, or external model dependency.

export const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uVP;
uniform mat4 uLightVP;
out vec3 vPosition;
out vec3 vNormal;
out vec4 vLightSpace;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vPosition = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vLightSpace = uLightVP * world;
  gl_Position = uVP * world;
}`;

const LIGHTING = `
const float PI = 3.141592653589793;
vec3 studio(vec3 direction) {
  vec3 d = normalize(direction);
  float sky = smoothstep(-0.5, 0.95, d.y);
  vec3 ambient = mix(vec3(0.043, 0.068, 0.055), vec3(0.32, 0.40, 0.35), sky);
  float key = pow(max(dot(d, normalize(vec3(-0.58, 0.83, -0.22))), 0.0), 28.0);
  float strip = exp(-pow((d.x + 0.34) * 7.0, 2.0) - pow((d.y - 0.73) * 3.6, 2.0));
  float fill = pow(max(dot(d, normalize(vec3(0.68, 0.46, 0.33))), 0.0), 54.0);
  return ambient + vec3(0.47, 0.55, 0.48) * key
    + vec3(0.22, 0.30, 0.27) * strip
    + vec3(0.17, 0.18, 0.13) * fill;
}
float distributionGGX(float ndh, float rough) {
  float a = max(0.055, rough * rough);
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 0.0001);
}
float geometrySchlick(float nd, float rough) {
  float r = rough + 1.0;
  float k = r * r / 8.0;
  return nd / max(nd * (1.0 - k) + k, 0.0001);
}
vec3 fresnel(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}
vec3 film(vec3 color) {
  // One unified display transfer for opaque and transmitting materials.
  vec3 mapped = max(color, vec3(0.0)) / (vec3(1.0) + max(color, vec3(0.0)) * 0.48);
  return pow(mapped, vec3(1.0 / 2.2));
}
float shadowFactor(vec3 normal) {
  if (!uHasShadows) return 1.0;
  vec3 p = vLightSpace.xyz / max(vLightSpace.w, 0.00001) * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0
    || p.z <= 0.0 || p.z >= 1.0) return 1.0;
  float bias = max(0.0007, 0.0024 * (1.0 - max(dot(normal, uLightDirection), 0.0)));
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float result = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      float d = texture(uShadowMap, p.xy + vec2(float(i), float(j)) * texel).r;
      result += p.z - bias <= d ? 1.0 : 0.0;
    }
  }
  // Glass transmits most direct light; the ball remains strongly grounded.
  return mix(0.71, 1.0, result / 9.0);
}
`;

export const OPAQUE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec4 vLightSpace;
uniform vec3 uEye;
uniform vec3 uLightDirection;
uniform sampler2D uShadowMap;
uniform bool uHasShadows;
uniform int uSurface;
out vec4 outColor;
${LIGHTING}

float grain(vec3 p) {
  return fract(sin(dot(floor(p.xz * 52.0), vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, uEye - vPosition) < 0.0) N = -N;
  vec3 V = normalize(uEye - vPosition);
  vec3 L = normalize(uLightDirection);
  vec3 H = normalize(V + L);
  vec3 base;
  float metal = 0.0;
  float rough = 0.5;
  if (uSurface == 0) {
    // Glazed dark ceramic with subpixel-scale variation, not an overlaid grid.
    float micro = grain(vPosition);
    base = vec3(0.108, 0.154, 0.123) * mix(0.97, 1.03, micro);
    rough = mix(0.31, 0.38, micro);
  } else if (uSurface == 3) {
    float brushed = sin(vPosition.x * 210.0 + vPosition.z * 75.0) * 0.015;
    base = vec3(0.64, 0.43, 0.18) + brushed;
    metal = 0.94;
    rough = 0.24;
  } else if (uSurface == 4) {
    base = vec3(0.020, 0.031, 0.025);
    rough = 0.8;
  } else {
    base = vec3(0.060, 0.091, 0.071);
    metal = 0.42;
    rough = 0.43;
  }
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0001);
  float ndh = max(dot(N, H), 0.0);
  float vdh = max(dot(V, H), 0.0);
  vec3 f0 = mix(vec3(0.04), base, metal);
  vec3 F = fresnel(vdh, f0);
  float G = geometrySchlick(ndv, rough) * geometrySchlick(ndl, rough);
  float D = distributionGGX(ndh, rough);
  vec3 spec = D * G * F / max(4.0 * ndl * ndv, 0.001);
  vec3 diffuse = (1.0 - F) * (1.0 - metal) * base / PI;
  vec3 reflected = reflect(-V, N);
  float shadows = uSurface == 4 ? 1.0 : shadowFactor(N);
  vec3 env = studio(reflected) * fresnel(ndv, f0) * mix(0.85, 1.12, 1.0 - rough);
  vec3 radiance = vec3(2.0, 1.92, 1.72);
  vec3 color = (diffuse + spec) * radiance * ndl * shadows
    + base * (1.0 - metal) * vec3(0.39, 0.44, 0.38)
    + env;
  if (uSurface == 4) color *= 0.64;
  outColor = vec4(film(color), 1.0);
}`;

export const GLASS_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec4 vLightSpace;
uniform vec3 uEye;
uniform vec3 uLightDirection;
uniform sampler2D uShadowMap;
uniform bool uHasShadows;
uniform sampler2D uSceneColor;
uniform vec2 uViewport;
uniform bool uUseRefraction;
uniform int uGlassType; // 1 = glass ribs, 2 = rolled solid glass marble
out vec4 outColor;
${LIGHTING}

void main() {
  vec3 V = normalize(uEye - vPosition);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = max(dot(N, V), 0.0);
  float F0 = pow((1.49 - 1.0) / (1.49 + 1.0), 2.0);
  float fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  vec3 reflection = studio(reflect(-V, N));
  vec3 transmitted;
  if (uUseRefraction) {
    vec3 bend = refract(-V, N, 1.0 / 1.49);
    float thickness = uGlassType == 2 ? 0.014 : 0.006;
    vec2 offset = vec2(bend.x + V.x, -bend.z - V.z) * thickness;
    // Clamp away from sampling unrendered pixels outside the opaque scene.
    vec2 uv = clamp(gl_FragCoord.xy / uViewport + offset, vec2(0.002), vec2(0.998));
    transmitted = texture(uSceneColor, uv).rgb;
    // Gamma-encoded screen color: only mild absorption, no double tone mapping.
    transmitted *= uGlassType == 2 ? vec3(0.92, 0.982, 0.946)
                                   : vec3(0.89, 0.954, 0.915);
  } else {
    // Low-profile mode uses the real framebuffer via alpha blending.
    transmitted = vec3(0.11, 0.20, 0.165);
  }

  vec3 L = normalize(uLightDirection);
  vec3 H = normalize(L + V);
  float spec = distributionGGX(max(dot(N,H),0.0),
               uGlassType == 2 ? 0.072 : 0.16);
  float studioRim = max(reflection.r, max(reflection.g, reflection.b));
  float direct = spec * max(dot(N,L),0.0);
  if (uGlassType == 2) {
    // The solid marble behaves like optically dense glass, not translucent plastic.
    vec3 color = mix(transmitted, reflection * 1.35, clamp(fres * 1.5, 0.0, 0.88));
    color += vec3(0.19, 0.27, 0.22) * clamp(direct * 0.21, 0.0, 0.8);
    color += vec3(0.05, 0.11, 0.08) * pow(1.0 - ndv, 2.0);
    // Opaque composite: sphere has an actual depth silhouette and refraction.
    outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  } else {
    float edge = pow(1.0 - ndv, 2.1);
    float faceVisibility = clamp(0.14 + edge * 0.52 +
      max(dot(N, L),0.0) * 0.09, 0.15, 0.72);
    vec3 reflectionColor = film(reflection * 0.57
      + vec3(0.39,0.49,0.42) * clamp(direct * 0.08,0.0,1.0));
    vec3 tint = uUseRefraction
      ? transmitted
      : vec3(0.45, 0.69, 0.58);
    vec3 glass = mix(tint, reflectionColor, clamp(fres * 1.95 + 0.08, 0.0, 0.91));
    glass += vec3(0.025, 0.044, 0.031) * studioRim * edge;
    outColor = vec4(clamp(glass, 0.0, 1.0), faceVisibility);
  }
}`;

export const DEPTH_VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * uModel * vec4(aPosition,1.0); }
`;

export const DEPTH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
void main() {}
`;

export const BLIT_VERTEX_SOURCE = `#version 300 es
precision highp float;
const vec2 points[3] = vec2[](
  vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0)
);
out vec2 vUv;
void main() {
  gl_Position = vec4(points[gl_VertexID],0.0,1.0);
  vUv = gl_Position.xy * 0.5 + 0.5;
}`;

export const BLIT_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 outColor;
void main() { outColor = texture(uTexture, vUv); }
`;

// No side effects: select quality based on actual canvas load and GPU caps,
// not browser brand. May be lowered further when sustained frames exceed budget.
export function chooseOpticalProfile({ width, height, dpr = 1, maxTextureSize = 4096,
    deviceMemory = 8, hardwareConcurrency = 8, reducedMotion = false }) {
  const pixels = width * height * Math.min(2, dpr) ** 2;
  const low = maxTextureSize < 2048 || deviceMemory < 3 ||
    (hardwareConcurrency <= 2 && pixels > 900000);
  const high = !low && deviceMemory >= 4 && maxTextureSize >= 4096 &&
    pixels <= 2800000 && hardwareConcurrency >= 5;
  return {
    level: low ? 'low' : high ? 'high' : 'balanced',
    refraction: high,
    shadows: !low,
    // Render resolution is independent of game-world physics coordinates.
    pixelRatio: Math.min(dpr, low ? 1.1 : high ? 1.8 : 1.5),
    shadowSize: low ? 0 : high ? 1024 : 512,
    // Motion accessibility affects animated extras, not simulated physics.
    staticHighlights: reducedMotion
  };
}
