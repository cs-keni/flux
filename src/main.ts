import { getConfig, isMobile } from './sim/config';
import { initDevOverlay, tickFPS } from './dev/DevOverlay';
import { isHeadless, REPLAY_SEQUENCE, REPLAY_TOTAL_FRAMES } from './sim/headless';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

function showNoWebGL2(): void {
  document.body.innerHTML = `
    <div style="
      position:fixed;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;background:#F2EDD7;
      font-family:Georgia,serif;color:#1A1209;gap:12px;padding:24px;text-align:center;
    ">
      <p style="font-size:1.1rem;letter-spacing:0.04em;">WebGL 2 is required to run Flux.</p>
      <p style="font-size:0.85rem;opacity:0.6;max-width:320px;line-height:1.6;">
        Try Chrome, Firefox, or Safari 15+. Hardware acceleration must be enabled.
      </p>
    </div>`;
}

function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

async function init(): Promise<void> {
  const gl = createContext(canvas);
  if (!gl) {
    showNoWebGL2();
    return;
  }

  resizeCanvas(canvas);

  const config = getConfig();

  // Lazy-import so these modules can assume gl is valid
  const { FluidSim } = await import('./sim/FluidSim');
  const { InputHandler } = await import('./input/InputHandler');
  const sim = new FluidSim(gl, config, isMobile());
  new InputHandler(canvas, sim);

  let pendingResize = false;                                    // T6
  window.addEventListener('resize', () => { pendingResize = true; });

  // Context loss / restore                                     // T5
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    sim.destroy();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    sim.init();
  });

  // Background GPU burn prevention                            // D7
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sim.pause(); else sim.resume();
  });

  if (import.meta.env.DEV) {
    initDevOverlay(config);
  }

  sim.init();

  if (isHeadless()) {
    // Deterministic replay for Playwright visual regression (D8/D11)
    let frameCount = 0;
    function headlessFrame(): void {
      for (const s of REPLAY_SEQUENCE) {
        if (s.frame === frameCount) sim.addSplat(s);
      }
      sim.step(1000 / 60);
      sim.render();
      frameCount++;
      if (frameCount < REPLAY_TOTAL_FRAMES) {
        requestAnimationFrame(headlessFrame);
      } else {
        document.documentElement.dataset['simReady'] = 'true';
      }
    }
    requestAnimationFrame(headlessFrame);
    return;
  }

  let lastTime = 0;
  function frame(now: number): void {
    if (pendingResize) {                                        // T6
      resizeCanvas(canvas);
      sim.onResize();
      pendingResize = false;
    }

    const elapsed = Math.min(now - lastTime, 100);             // D15: 100ms cap
    lastTime = now;
    sim.step(elapsed);
    sim.render();
    if (import.meta.env.DEV) tickFPS(now);

    sim.rafId = requestAnimationFrame(frame);
  }

  sim.rafId = requestAnimationFrame(frame);
}

init();
