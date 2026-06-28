#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_x;        // current field (velocity)
uniform float u_alpha;        // (dx*dx) / (viscosity * dt)
uniform float u_rBeta;        // 1 / (4 + alpha)
uniform vec2 u_texelSize;

void main() {
  vec4 xL = texture(u_x, v_uv - vec2(u_texelSize.x, 0.0));
  vec4 xR = texture(u_x, v_uv + vec2(u_texelSize.x, 0.0));
  vec4 xB = texture(u_x, v_uv - vec2(0.0, u_texelSize.y));
  vec4 xT = texture(u_x, v_uv + vec2(0.0, u_texelSize.y));
  vec4 xC = texture(u_x, v_uv);

  // Jacobi iteration: x_new = (xL + xR + xB + xT + alpha * b) * rBeta
  // For diffusion, b = xC (current field is the RHS)
  fragColor = (xL + xR + xB + xT + u_alpha * xC) * u_rBeta;
}
