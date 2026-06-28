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
