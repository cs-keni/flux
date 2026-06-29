export interface SimConfig {
  resolution: number;
  jacobiIterations: number;
  diffuseIterations: number;
  viscosity: number;
  splatRadius: number;
  force: number;
  dt: number;
  frameCapMs: number;
}

export interface Palette {
  name: string;
  primary: readonly [number, number, number];    // ink color at full concentration (linear RGB)
  secondary: readonly [number, number, number];  // edge bleed hue at thin margins
}

// Three curated ink palettes (D per SPEC). Colors are physical ink references.
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
] as const;

const DESKTOP: SimConfig = {
  resolution: 512,
  jacobiIterations: 40,   // D12: 20 doesn't converge on 512×512
  diffuseIterations: 5,   // D13: near-zero viscosity converges fast
  viscosity: 0.0001,      // D13: ink is not viscous
  splatRadius: 0.25,
  force: 6000,
  dt: 1 / 60,             // D15: fixed dt, semi-Lagrangian stability
  frameCapMs: 100,        // D15: cap prevents huge backtrace on tab restore
};

const MOBILE: SimConfig = {
  ...DESKTOP,
  resolution: 256,        // D10: 2× fillrate savings on mobile GPU
  jacobiIterations: 20,   // D12: lower res needs fewer iterations to converge
};

// D10: avoid UA parsing; DPR alone is insufficient (Retina Macs trigger it)
export function isMobile(): boolean {
  return navigator.maxTouchPoints > 0 && screen.width < 768;
}

export function getConfig(): SimConfig {
  return isMobile() ? MOBILE : DESKTOP;
}
