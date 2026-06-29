#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_target;
uniform sampler2D u_dye;       // current ink field; sampled only in velocity pass
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;
uniform float u_aspectRatio;
uniform float u_wetFactor;     // 0 = dry; >0 = wet-on-wet velocity amplification

void main() {
  vec2 p = v_uv - u_point;
  p.x *= u_aspectRatio;
  float splat = exp(-dot(p, p) / u_radius);
  vec3 base = texture(u_target, v_uv).rgb;

  // Wet-on-wet: amplify velocity injection proportional to pre-existing ink.
  // Physically: a brush landing on wet paper disturbs the ink beneath it more
  // than landing on dry paper — the existing moisture lets ink bleed outward.
  float boost = 1.0;
  if (u_wetFactor > 0.0) {
    float ink = clamp(texture(u_dye, v_uv).r, 0.0, 1.0);
    boost += ink * u_wetFactor;
  }

  fragColor = vec4(base + splat * u_color * boost, 1.0);
}
