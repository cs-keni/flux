#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform float u_dt;
uniform float u_dissipation;
uniform vec2 u_texelSize;
uniform int u_linearFiltering;  // D9: 1 = extension present, 0 = manual bilinear

// Manual bilinear for devices without OES_texture_float_linear
vec4 bilerp(sampler2D tex, vec2 uv) {
  vec2 px = uv / u_texelSize - 0.5;
  vec2 f = fract(px);
  vec2 i = floor(px);
  vec2 t00 = (i + 0.5) * u_texelSize;
  vec2 t10 = (i + vec2(1.0, 0.0) + 0.5) * u_texelSize;
  vec2 t01 = (i + vec2(0.0, 1.0) + 0.5) * u_texelSize;
  vec2 t11 = (i + vec2(1.0, 1.0) + 0.5) * u_texelSize;
  return mix(
    mix(texture(tex, t00), texture(tex, t10), f.x),
    mix(texture(tex, t01), texture(tex, t11), f.x),
    f.y
  );
}

void main() {
  // Semi-Lagrangian: trace backwards along velocity to find source position
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 prevUV = v_uv - vel * u_dt * u_texelSize;
  prevUV = clamp(prevUV, u_texelSize * 0.5, 1.0 - u_texelSize * 0.5);

  vec4 result;
  if (u_linearFiltering == 1) {
    result = texture(u_source, prevUV);
  } else {
    result = bilerp(u_source, prevUV);
  }

  fragColor = u_dissipation * result;
}
