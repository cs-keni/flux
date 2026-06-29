import { getConfig, isMobile } from './sim/config';
import { initDevOverlay, tickFPS } from './dev/DevOverlay';
import { isHeadless, REPLAY_SEQUENCE, REPLAY_TOTAL_FRAMES } from './sim/headless';
import { SEQUENCES, getAutoPilotSplat, AutoPilotSequence } from './autopilot/sequences';
import { HintOverlay } from './ui/HintOverlay';

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
    preserveDrawingBuffer: true,  // needed for canvas.toDataURL() export
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

function saveCanvas(canvas: HTMLCanvasElement): void {
  const link = document.createElement('a');
  link.download = `flux-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function init(): Promise<void> {
  const gl = createContext(canvas);
  if (!gl) {
    showNoWebGL2();
    return;
  }

  resizeCanvas(canvas);

  const config = getConfig();

  const { FluidSim } = await import('./sim/FluidSim');
  const { InputHandler } = await import('./input/InputHandler');

  const sim = new FluidSim(gl, config, isMobile());
  const hint = new HintOverlay();

  // Auto-pilot state
  let autoPilotActive    = false;
  let autoPilotForced    = false; // A-key toggle ignores idle timer
  let autoPilotSeqIdx    = 0;
  let autoPilotSeq: AutoPilotSequence | null = null;
  let autoPilotStartTime = 0;
  let autoPilotPrevPos: { x: number; y: number } | null = null;

  const IDLE_AUTOPILOT_MS = 30_000;

  function startAutoPilot(): void {
    autoPilotSeq = SEQUENCES[autoPilotSeqIdx % SEQUENCES.length];
    autoPilotSeqIdx++;
    autoPilotStartTime = performance.now();
    autoPilotPrevPos = null;
    autoPilotActive = true;
    hint.hideForAutoPilot();
    sim.reset();
  }

  function stopAutoPilot(): void {
    autoPilotActive = false;
    autoPilotForced = false;
    autoPilotSeq = null;
    autoPilotPrevPos = null;
  }

  // Idle tracking — updated by InputHandler onInput callback
  let lastInputTime = performance.now();

  function onUserInput(): void {
    lastInputTime = performance.now();
    if (autoPilotActive && !autoPilotForced) stopAutoPilot();
    hint.onInput();
  }

  new InputHandler(canvas, sim, onUserInput);

  let pendingResize = false;
  window.addEventListener('resize', () => { pendingResize = true; });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    sim.destroy();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    sim.init();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sim.pause(); else sim.resume();
  });

  if (import.meta.env.DEV) {
    initDevOverlay(config);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === '1') sim.setPalette(0);
    if (e.key === '2') sim.setPalette(1);
    if (e.key === '3') sim.setPalette(2);
    if (e.key === 'p' || e.key === 'P') sim.cyclePalette();
    if (e.key === 'r' || e.key === 'R') {
      stopAutoPilot();
      sim.reset();
      hint.onInput();
    }
    if (e.key === 's' || e.key === 'S') saveCanvas(canvas);
    if (e.key === 'a' || e.key === 'A') {
      if (autoPilotActive) {
        stopAutoPilot();
        hint.showAfterAutoPilot();
      } else {
        autoPilotForced = true;
        startAutoPilot();
      }
    }
  });

  try {
    sim.init();
  } catch (e) {
    document.body.innerHTML = `<pre style="color:red;padding:20px">${e}</pre>`;
    return;
  }

  // ── Headless deterministic replay (Playwright) ───────────────────────────
  // Run synchronously — RAF/setTimeout are throttled to ~4fps in headless
  // Chromium. The GPU stalls (ping-pong FBO sync) make each frame take ~250ms,
  // so 60 frames ≈ 15s total. The test timeout must be ≥ 40s.
  if (isHeadless()) {
    for (let frameCount = 0; frameCount < REPLAY_TOTAL_FRAMES; frameCount++) {
      for (const s of REPLAY_SEQUENCE) {
        if (s.frame === frameCount) sim.addSplat(s);
      }
      sim.step(1000 / 60);
      sim.render();
    }
    document.documentElement.dataset['simReady'] = 'true';
    return;
  }

  // ── Main render loop ─────────────────────────────────────────────────────
  let lastTime = 0;
  function frame(now: number): void {
    if (pendingResize) {
      resizeCanvas(canvas);
      sim.onResize();
      pendingResize = false;
    }

    // Auto-pilot: start when idle long enough
    const idleMs = now - lastInputTime;
    if (!autoPilotActive && idleMs > IDLE_AUTOPILOT_MS) {
      startAutoPilot();
    }

    // Tick auto-pilot splats
    if (autoPilotActive && autoPilotSeq) {
      const seqT = (now - autoPilotStartTime) / 1000;
      const pos = getAutoPilotSplat(autoPilotSeq, seqT);

      if (pos && autoPilotPrevPos) {
        const dx = pos.x - autoPilotPrevPos.x;
        const dy = pos.y - autoPilotPrevPos.y;
        if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) {
          sim.addSplat({ x: pos.x, y: pos.y, dx, dy, radius: 0.12 });
        }
      }
      autoPilotPrevPos = pos;  // null on pen-up so next stroke start doesn't fire a jump splat

      if (seqT >= autoPilotSeq.duration) {
        // Loop to next sequence after a short pause (reset the canvas first)
        stopAutoPilot();
        lastInputTime = now - (IDLE_AUTOPILOT_MS - 3_000); // restart in ~3s
        hint.showAfterAutoPilot();
      }
    }

    const elapsed = Math.min(now - lastTime, 100);
    lastTime = now;
    sim.step(elapsed);
    sim.render((now - lastInputTime) / 1000);
    if (import.meta.env.DEV) tickFPS(now);

    sim.rafId = requestAnimationFrame(frame);
  }

  sim.rafId = requestAnimationFrame(frame);
}

init();
