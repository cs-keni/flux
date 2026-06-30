export interface SimConfig {
  resolution: number;
  jacobiIterations: number;
  diffuseIterations: number;
  viscosity: number;
  splatRadius: number;
  force: number;
  dt: number;
  frameCapMs: number;
  wetOnWetStrength: number;  // velocity boost at ink intersections (0 = off, ~1.8 = natural bleed)
}

export interface Palette {
  name: string;
  primary: readonly [number, number, number];    // ink color at full concentration (linear RGB)
  secondary: readonly [number, number, number];  // edge bleed hue at thin margins
}

// Six curated ink palettes. Colors are physical ink references; values are sRGB/255.
export const PALETTES: readonly Palette[] = [
  {
    name: 'Sumi',
    primary:   [0.102, 0.071, 0.035], // #1A1209 — near-black, warm undertone
    secondary: [0.280, 0.240, 0.340], // blue-grey bleed at thin edges
  },
  {
    name: 'Indigo',
    primary:   [0.106, 0.165, 0.290], // #1B2A4A — deep blue-violet
    secondary: [0.160, 0.290, 0.470], // lighter cool blue at edges
  },
  {
    name: 'Sepia',
    primary:   [0.239, 0.125, 0.031], // #3D2008 — dark amber-brown
    secondary: [0.430, 0.280, 0.130], // warm amber bleed at edges
  },
  {
    name: 'Vermilion',
    primary:   [0.431, 0.071, 0.031], // #6E1208 — cinnabar red (seal-ink depth)
    secondary: [0.753, 0.204, 0.094], // #C03418 — bright orange-red bleed at edges
  },
  {
    name: 'Pine',
    primary:   [0.118, 0.227, 0.141], // #1E3A24 — deep pine-shadow green
    secondary: [0.239, 0.439, 0.271], // #3D7045 — lighter moss-needle at edges
  },
  {
    name: 'Prussian',
    primary:   [0.055, 0.122, 0.227], // #0E1F3A — near-black Prussian blue (Hokusai)
    secondary: [0.102, 0.282, 0.439], // #1A4870 — steel-blue bleed at edges
  },
] as const;

// ── GPU tier configs ──────────────────────────────────────────────────────────
// LOW  (256) — mobile or legacy integrated GPU
// MID  (512) — desktop default; most laptops with modern integrated GPU
// HIGH (768) — confirmed discrete GPU or Apple Silicon

const BASE: Omit<SimConfig, 'resolution' | 'jacobiIterations'> = {
  diffuseIterations: 5,   // near-zero viscosity converges fast
  viscosity: 0.0001,      // ink is not viscous
  splatRadius: 0.25,
  force: 6000,
  dt: 1 / 60,             // fixed dt, semi-Lagrangian stability
  frameCapMs: 100,        // cap prevents huge backtrace on tab restore
  wetOnWetStrength: 1.8,  // at full ink overlap: velocity is 2.8× (noticeable bleed, not chaotic)
};

const LOW: SimConfig  = { ...BASE, resolution: 256, jacobiIterations: 20 };
const MID: SimConfig  = { ...BASE, resolution: 512, jacobiIterations: 40 };
// HIGH reuses 40 Jacobi iters — slight under-convergence at 768 is invisible in an ink sim
const HIGH: SimConfig = { ...BASE, resolution: 768, jacobiIterations: 40 };

// ── GPU tier detection ────────────────────────────────────────────────────────

// D10: avoid UA parsing; DPR alone is insufficient (Retina Macs trigger it)
export function isMobile(): boolean {
  return navigator.maxTouchPoints > 0 && screen.width < 768;
}

function gpuTier(gl: WebGL2RenderingContext): 'low' | 'mid' | 'high' {
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (maxTex <= 4096) return 'low';  // very old GPU

  // Best signal: actual GPU name via debug extension (available in Chrome/Firefox)
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    const renderer = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string).toLowerCase();
    // Discrete GPU or Apple Silicon: confirm high-end tier
    if (/geforce|quadro|radeon|rtx|gtx|\brx \d|tesla|apple m[0-9]/.test(renderer)) return 'high';
    // Legacy Intel integrated: keep at mid (UHD 6xx / HD 6xx / GMA)
    if (/intel (hd|uhd) [0-9]{3}[^0-9]|intel gma/.test(renderer)) return 'mid';
  }

  // Fallback when debug info is unavailable (Firefox with privacy.resistFingerprinting, etc.)
  // Use device memory (Chrome/Edge) + max texture size as a combined proxy
  const mem: number | undefined = (navigator as any).deviceMemory;
  if (mem !== undefined && mem >= 8 && maxTex >= 16384) return 'high';

  return 'mid';
}

export function getConfig(gl?: WebGL2RenderingContext): SimConfig {
  if (isMobile()) return LOW;
  if (!gl) return MID;  // fallback when called without context (e.g., tests)
  const tier = gpuTier(gl);
  return tier === 'high' ? HIGH : tier === 'low' ? LOW : MID;
}
