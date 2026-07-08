// Dev-only overlays: shader error banner + FPS counter (press F to toggle)
// Tree-shaken in production builds via import.meta.env.DEV guard in main.ts

let fpsEl: HTMLElement | null = null;
let fpsVisible = false;
let frameTimes: number[] = [];

export function initDevOverlay(config: { resolution: number; jacobiIterations: number }): void {
  // Catch all unhandled rejections and show them — covers GLSL errors, extension failures, etc.
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    showErrorBanner(msg);
  });

  // FPS overlay
  fpsEl = document.createElement('div');
  fpsEl.style.cssText = `
    position:fixed;top:12px;right:12px;padding:6px 10px;
    background:rgba(26,18,9,0.75);color:#F2EDD7;
    font:12px/1.4 monospace;border-radius:4px;
    pointer-events:none;display:none;z-index:9999;
  `;
  fpsEl.dataset['res'] = String(config.resolution);
  fpsEl.dataset['jacobi'] = String(config.jacobiIterations);
  document.body.appendChild(fpsEl);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') toggleFPS();
  });
}

// Reflect a runtime tier change in the FPS overlay's res/jacobi labels.
export function updateDevConfig(resolution: number, jacobiIterations: number): void {
  if (!fpsEl) return;
  fpsEl.dataset['res'] = String(resolution);
  fpsEl.dataset['jacobi'] = String(jacobiIterations);
}

export function tickFPS(now: number): void {
  if (!fpsVisible || !fpsEl) return;
  frameTimes.push(now);
  frameTimes = frameTimes.filter(t => now - t < 1000);
  const fps = frameTimes.length;
  fpsEl.textContent =
    `${fps} fps  |  ${fpsEl.dataset['res']}×${fpsEl.dataset['res']}  |  jacobi ${fpsEl.dataset['jacobi']}`;
}

function toggleFPS(): void {
  fpsVisible = !fpsVisible;
  if (fpsEl) fpsEl.style.display = fpsVisible ? 'block' : 'none';
}

function showErrorBanner(msg: string): void {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;inset:0;z-index:99999;overflow:auto;
    background:rgba(26,18,9,0.92);color:#F2EDD7;
    font:13px/1.6 monospace;padding:24px 32px;white-space:pre-wrap;
  `;
  el.textContent = `[flux] runtime error\n\n${msg}`;
  document.body.appendChild(el);
}
