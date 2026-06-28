#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

void main() {
  float pL = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).r;
  float pR = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).r;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).r;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).r;

  vec2 vel = texture(u_velocity, v_uv).xy;
  vel -= 0.5 * vec2(pR - pL, pT - pB);
  fragColor = vec4(vel, 0.0, 1.0);
}
