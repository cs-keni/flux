#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_dye;
uniform sampler2D u_velocity;  // velocity field for directional feather (Phase 3)
uniform vec3 u_inkPrimary;     // ink color at full concentration
uniform vec3 u_inkSecondary;   // edge bleed hue at thin ink margins
uniform float u_idleTime;      // seconds since last user input (for ink-dry animation)
uniform float u_material;      // 0 = sumi ink, 1 = watercolor (crossfades between)

// ── 2D hash noise ────────────────────────────────────────────────────────────

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f); // cubic smoothstep
  return mix(
    mix(hash21(i),                hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// 5-octave FBM with rotation to break axis alignment
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  // Small rotation breaks grid repetition while staying cheap
  mat2 rot = mat2(0.8660, 0.5, -0.5, 0.8660); // 30°
  for (int i = 0; i < 5; i++) {
    v += a * valueNoise(p);
    p = rot * p * 2.1 + vec2(5.2, 1.3);
    a *= 0.5;
  }
  return v;
}

// Worley (cellular) noise — produces fibrous structure
float worley(vec2 p) {
  vec2 i = floor(p);
  float minDist = 8.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 cell = i + vec2(float(x), float(y));
      vec2 pt = cell + hash22(cell); // jittered point inside cell
      float d = length(pt - p);
      minDist = min(minDist, d);
    }
  }
  return minDist;
}

void main() {
  // ── Paper texture ─────────────────────────────────────────────────────────
  // High-frequency FBM + subtle Worley fiber. Scale chosen so grain reads at
  // 512×512 display but disappears at a glance (you notice it on close look).
  float grain  = fbm(v_uv * 580.0);
  float fiber  = 1.0 - clamp(worley(v_uv * 30.0), 0.0, 1.0);
  float noise  = grain * 0.78 + fiber * 0.22;

  // ±2.8% luminance variation around the base paper color
  vec3 paperBase  = vec3(0.949, 0.929, 0.843); // #F2EDD7
  vec3 paperColor = paperBase + (noise - 0.5) * 0.056;

  // ── Ink concentration → opacity ───────────────────────────────────────────
  float rawInk = texture(u_dye, v_uv).r;
  rawInk = clamp(rawInk, 0.0, 1.5); // RGBA16F can slightly overshoot

  // Phase 3: directional feather — ink edge is softer downstream (in flow direction),
  // sharper upstream. Achieved by mixing in a slightly lighter downstream sample.
  vec2 vel = texture(u_velocity, v_uv).rg;
  float speed = length(vel);
  if (speed > 5.0) {
    vec2 velDir = vel / speed;
    float velStrength = clamp(speed / 280.0, 0.0, 1.0);
    // Sample ink slightly downstream (where ink is heading → lighter concentration)
    float inkDown = texture(u_dye, clamp(v_uv + velDir * 0.003, 0.0, 1.0)).r;
    inkDown = clamp(inkDown, 0.0, 1.5);
    // Blend toward lighter downstream: trailing edge becomes more feathered
    rawInk = mix(rawInk, inkDown, velStrength * 0.28);
  }

  // ── Ink-dry animation ─────────────────────────────────────────────────────
  // After 60s idle the ink visually "settles": edges crisp up and color deepens
  // slightly, as sumi ink does on rice paper. Fully dry at 120s. Reverses
  // immediately when the user draws again (u_idleTime resets to 0).
  float dryFactor = smoothstep(60.0, 120.0, u_idleTime);

  // Dried ink: slightly darker and cooler (settled carbon particles)
  vec3 driedPrimary = u_inkPrimary * 0.88 + vec3(-0.006, -0.003, 0.010);
  vec3 effectivePrimary = mix(u_inkPrimary, driedPrimary, dryFactor);

  // Edges sharpen as moisture evaporates: k rises from 3.0 → 3.8 (sumi).
  // Watercolor stays soft: a lower k gives a wider, more gradual feather so
  // washes read as transparent pigment rather than dense ink.
  float kSumi  = mix(3.0, 3.8, dryFactor);
  float kWater = mix(1.8, 2.4, dryFactor);
  float kFactor = mix(kSumi, kWater, u_material);

  // Exponential feather: slow rise at low concentrations, asymptote near 1.
  // k=3.0: ink=0.1→26% opaque, ink=0.5→78%, ink=1.0→95% — long feather tail.
  float opacity = 1.0 - exp(-rawInk * kFactor);

  // ── Watercolor wet-edge rim ───────────────────────────────────────────────
  // Pigment migrates to the perimeter of a drying wash and pools there, so the
  // rim is DARKER than the wash body — the signature watercolor tell, and the
  // visual opposite of sumi's dense core + feathered edge. A band-pass on
  // concentration isolates that boundary ring.
  float rim = smoothstep(0.03, 0.20, rawInk) * (1.0 - smoothstep(0.20, 0.50, rawInk));
  opacity += u_material * rim * 0.40;

  // Transparent washes: watercolor never fully hides the paper, even at a dense
  // core, so the paper glows through (luminosity is watercolor's whole appeal).
  opacity *= mix(1.0, 0.85, u_material);
  opacity = clamp(opacity, 0.0, 1.0);

  // ── Secondary edge hue ────────────────────────────────────────────────────
  // At thin ink margins, secondary color bleeds in (paper fiber absorption).
  // edgeFactor is 1 where ink is sparse, 0 where ink is dense. Watercolor
  // pigments separate more at the edge, so the secondary bleed is stronger.
  float edgeFactor = 1.0 - smoothstep(0.05, 0.40, rawInk);
  float edgeBlend = mix(0.55, 0.82, u_material);
  vec3 inkColor = mix(effectivePrimary, u_inkSecondary, edgeFactor * edgeBlend);

  // Granulation: watercolor pigment settles into paper valleys, leaving a
  // mottled texture. Modulate ink by the same paper noise, watercolor only.
  inkColor *= 1.0 - u_material * (noise - 0.5) * 0.16;

  // The rim carries the densest, most-saturated pigment — nudge it toward the
  // primary and darken slightly so the pooled ring reads.
  inkColor = mix(inkColor, effectivePrimary * 0.85, u_material * rim * 0.6);

  // ── Composite: ink over paper ─────────────────────────────────────────────
  vec3 color = mix(paperColor, inkColor, opacity);

  // ── Vignette ──────────────────────────────────────────────────────────────
  // Gentle radial darkening toward edges (~28% max at corners).
  float dist     = length(v_uv - 0.5) * 1.85;
  float vignette = 1.0 - smoothstep(0.55, 1.0, dist) * 0.28;
  color *= vignette;

  fragColor = vec4(color, 1.0);
}
