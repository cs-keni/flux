#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_dye;

void main() {
  // Phase 1: raw dye blit — validate sim correctness before visual layer
  // Replaced in Phase 2 with ink-on-paper composite pass
  float ink = texture(u_dye, v_uv).r;
  // Map dye concentration to dark ink on warm paper
  vec3 paper = vec3(0.949, 0.929, 0.843);  // #F2EDD7
  vec3 inkColor = vec3(0.102, 0.071, 0.035); // #1A1209 sumi
  fragColor = vec4(mix(paper, inkColor, clamp(ink, 0.0, 1.0)), 1.0);
}
