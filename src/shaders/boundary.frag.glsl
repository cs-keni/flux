#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

void main() {
  // No-slip: clamp UV one texel inward so boundary pixels sample the interior
  vec2 uv = clamp(v_uv, u_texelSize, 1.0 - u_texelSize);
  vec2 vel = texture(u_velocity, uv).xy;

  // Negate velocity at the four edges to enforce no-slip
  bool onLeft   = v_uv.x < u_texelSize.x;
  bool onRight  = v_uv.x > 1.0 - u_texelSize.x;
  bool onBottom = v_uv.y < u_texelSize.y;
  bool onTop    = v_uv.y > 1.0 - u_texelSize.y;

  if (onLeft || onRight)  vel.x = -vel.x;
  if (onBottom || onTop)  vel.y = -vel.y;

  fragColor = vec4(vel, 0.0, 1.0);
}
