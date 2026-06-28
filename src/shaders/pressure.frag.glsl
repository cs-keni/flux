#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;

void main() {
  float pL = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).r;
  float pR = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).r;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).r;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).r;
  float div = texture(u_divergence, v_uv).r;

  // Jacobi: p_new = (pL + pR + pB + pT - div) / 4
  fragColor = vec4((pL + pR + pB + pT - div) * 0.25, 0.0, 0.0, 1.0);
}
