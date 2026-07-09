import { getConfig, isMobile, lowerTierFor, SimConfig } from './sim/config';
import { initDevOverlay, tickFPS, updateDevConfig } from './dev/DevOverlay';
import { PerfMonitor } from './sim/perfMonitor';
import { isHeadless, REPLAY_SEQUENCE, REPLAY_TOTAL_FRAMES } from './sim/headless';
import { SEQUENCES, getAutoPilotSplat, AutoPilotSequence } from './autopilot/sequences';
import { HintOverlay } from './ui/HintOverlay';
import { ShortcutOverlay } from './ui/ShortcutOverlay';
import { parseShareHash, buildShareHash, sequenceIndexByName } from './share/shareLink';
import { GalleryOverlay } from './ui/GalleryOverlay';
import { loadGallery, captureToGallery, decodeEntry, resampleField, GalleryEntry } from './gallery/gallery';

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

function flashToast(text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
    font-family:Georgia,'Times New Roman',serif;font-size:0.78rem;
    letter-spacing:0.14em;color:rgba(26,18,9,0.45);
    pointer-events:none;user-select:none;
    opacity:1;transition:opacity 1.4s ease;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 1500);
    }, 900);
  });
}

async function init(): Promise<void> {
  const gl = createContext(canvas);
  if (!gl) {
    showNoWebGL2();
    return;
  }

  resizeCanvas(canvas);

  const config = getConfig(gl);

  const { FluidSim } = await import('./sim/FluidSim');
  const { InputHandler } = await import('./input/InputHandler');

  const sim = new FluidSim(gl, config, isMobile());
  const hint = new HintOverlay();
  const shortcuts = new ShortcutOverlay();

  // Auto-pilot state
  let autoPilotActive    = false;
  let autoPilotForced    = false; // A-key toggle ignores idle timer
  let autoPilotSeqIdx    = 0;
  let autoPilotSeq: AutoPilotSequence | null = null;
  let autoPilotStartTime = 0;
  let autoPilotPrevPos: { x: number; y: number } | null = null;

  const IDLE_AUTOPILOT_MS = 30_000;

  // Shareable-link state — reflected live into location.hash so the address bar
  // always holds a link that reproduces the current palette + last sequence.
  let currentSequenceName: string | null = null;

  function syncShareUrl(): void {
    const hash = buildShareHash(sim.getPaletteIndex(), currentSequenceName, sim.getMaterialIndex());
    // replaceState (not location.hash =) so we don't spam browser history or
    // trigger a hashchange event on every palette tap.
    history.replaceState(null, '', hash);
  }

  function applyPalette(index: number): void {
    sim.setPalette(index);
    syncShareUrl();
  }

  function cyclePalette(): void {
    sim.cyclePalette();
    syncShareUrl();
  }

  function startAutoPilot(): void {
    autoPilotSeq = SEQUENCES[autoPilotSeqIdx % SEQUENCES.length];
    autoPilotSeqIdx++;
    autoPilotStartTime = performance.now();
    autoPilotPrevPos = null;
    autoPilotActive = true;
    currentSequenceName = autoPilotSeq.name;
    syncShareUrl();
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
    shortcuts.dismiss();
  }

  new InputHandler(canvas, sim, onUserInput);

  // ── Gallery ───────────────────────────────────────────────────────────────
  let galleryOpen = false;
  let galleryEntries: GalleryEntry[] = [];

  async function selectGalleryEntry(i: number): Promise<void> {
    const entry = galleryEntries[i];
    if (!entry) return;
    closeGallery();
    try {
      const field = await decodeEntry(entry);
      const restored = resampleField(field, entry.size, sim.getResolution());
      stopAutoPilot();
      sim.restoreDyeField(restored, sim.getResolution());
      applyPalette(entry.paletteIndex);
      sim.setMaterial(entry.material ?? 0);
      syncShareUrl();
      lastInputTime = performance.now();
      hint.onInput();
    } catch {
      flashToast('could not open that one.');
    }
  }

  const gallery = new GalleryOverlay(
    (i) => { void selectGalleryEntry(i); },
    () => closeGallery(),
  );

  function openGallery(): void {
    galleryEntries = loadGallery();
    if (galleryEntries.length === 0) { flashToast('gallery is empty.'); return; }
    gallery.show(galleryEntries);
    galleryOpen = true;
  }

  function closeGallery(): void {
    if (!galleryOpen) return;
    gallery.hide();
    galleryOpen = false;
  }

  // Snapshot the current canvas into the gallery (blank canvases are skipped
  // inside captureToGallery). Called on user reset and on navigate-away.
  function captureCurrent(): void {
    const { data, size } = sim.readDyeField();
    captureToGallery(data, size, sim.getPaletteIndex(), sim.getMaterialIndex());
  }

  // ── Adaptive resolution ─────────────────────────────────────────────────
  // Drop a GPU tier on sustained jank so weak devices stay smooth. Preserves
  // the painting across the FBO rebuild (resampled to the new resolution).
  const perfMon = new PerfMonitor();

  // Always false in prod; only the DEV-only __fluxSetRes hook sets it, so a
  // resolution probe (e.g. 1024²) isn't auto-reverted by adaptive downgrade
  // mid-measurement. One dead boolean in prod — negligible.
  let suppressAutoDowngrade = false;

  function downgradeTier(lower: SimConfig): void {
    const { data, size } = sim.readDyeField();
    const rescaled = resampleField(data, size, lower.resolution);
    sim.rebuildAt(lower.resolution, lower.jacobiIterations);
    sim.restoreDyeField(rescaled, lower.resolution);
    perfMon.reset();
    if (import.meta.env.DEV) updateDevConfig(lower.resolution, lower.jacobiIterations);
  }

  // DEV-only hook to exercise the rebuild path without inducing real jank.
  if (import.meta.env.DEV) {
    (window as unknown as { __fluxForceDowngrade?: () => number }).__fluxForceDowngrade = () => {
      const lower = lowerTierFor(sim.getResolution());
      if (lower) downgradeTier(lower);
      return sim.getResolution();
    };
  }

  // DEV-only (Phase 6 T1): attach the per-pass GPU profiler and expose hooks.
  // `__fluxProfile()` prints a per-pass GPU breakdown (mean/p50/p95/p99) so we
  // can see where the frame budget actually goes before assuming it's Jacobi.
  // `__fluxProfileReset()` clears the rolling window (call after a scene change).
  if (import.meta.env.DEV) {
    const { GpuProfiler } = await import('./dev/GpuProfiler');
    const profiler = new GpuProfiler(gl);
    sim.attachProfiler(profiler);
    const w = window as unknown as {
      __fluxProfile?: () => unknown;
      __fluxProfileReset?: () => void;
      __fluxSetRes?: (n: number) => number;
    };
    w.__fluxProfile = () => {
      const r = profiler.report();
      const resolution = sim.getResolution();
      if (!r.supported) {
        console.warn(
          '[flux] GPU timer queries unavailable (EXT_disjoint_timer_query_webgl2 ' +
          'disabled — common on WSL2/ANGLE and weak GPUs). Only CPU readback ' +
          'samples below; run T1 profiling on a native GL device.',
        );
      }
      const fmt = (rows: typeof r.gpu) =>
        rows.map((p) => ({
          pass: p.label,
          n: p.n,
          'mean ms': +p.mean.toFixed(3),
          'p50 ms': +p.p50.toFixed(3),
          'p95 ms': +p.p95.toFixed(3),
          'p99 ms': +p.p99.toFixed(3),
        }));
      if (r.gpu.length) {
        console.log(`[flux] GPU per-pass @ ${resolution}² (frame total ≈ ${r.gpuTotalMean.toFixed(2)}ms):`);
        console.table(fmt(r.gpu));
      }
      if (r.cpu.length) {
        console.log(`[flux] CPU wall-clock @ ${resolution}² (sync readback stalls):`);
        console.table(fmt(r.cpu));
      }
      return { resolution, ...r };
    };
    w.__fluxProfileReset = () => profiler.reset();

    // __fluxSetRes(n): override the sim resolution at runtime to map the
    // resolution→frame-time curve (proxy for a heavier GPU load — e.g. probe
    // whether 1024² holds 60fps). Preserves the painting (read → resample →
    // rebuild → restore, same path as a tier downgrade) and resets the profiler
    // window so post-resize samples are clean. Keeps production Jacobi count.
    w.__fluxSetRes = (n: number) => {
      suppressAutoDowngrade = true; // hold the probe res; don't auto-revert
      const { data, size } = sim.readDyeField();
      const rescaled = resampleField(data, size, n);
      sim.rebuildAt(n, config.jacobiIterations);
      sim.restoreDyeField(rescaled, n);
      perfMon.reset();
      profiler.reset();
      updateDevConfig(n, config.jacobiIterations);
      return sim.getResolution();
    };
  }

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

  // Archive the final painting when the user navigates away / closes the tab.
  window.addEventListener('pagehide', () => { captureCurrent(); });

  if (import.meta.env.DEV) {
    initDevOverlay(config);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // When the gallery is open it owns the keyboard: 1–N select, anything else closes.
    if (galleryOpen) {
      const n = e.key.charCodeAt(0) - 49; // '1' → 0
      if (n >= 0 && n < galleryEntries.length) void selectGalleryEntry(n);
      else closeGallery();
      return;
    }
    shortcuts.dismiss();
    if (e.key === '1') applyPalette(0);
    if (e.key === '2') applyPalette(1);
    if (e.key === '3') applyPalette(2);
    if (e.key === '4') applyPalette(3);
    if (e.key === '5') applyPalette(4);
    if (e.key === '6') applyPalette(5);
    if (e.key === 'p' || e.key === 'P') cyclePalette();
    if (e.key === 'r' || e.key === 'R') {
      captureCurrent();  // archive what's on the canvas before clearing it
      stopAutoPilot();
      sim.reset();
      hint.onInput();
    }
    if (e.key === 'g' || e.key === 'G') openGallery();
    if (e.key === 's' || e.key === 'S') {
      try {
        const url = sim.exportHighRes(2048);
        const link = document.createElement('a');
        link.download = `flux-${Date.now()}.png`;
        link.href = url;
        link.click();
        flashToast('saved.');
      } catch {
        // Offscreen WebGL failed — fall back to current display canvas
        const link = document.createElement('a');
        link.download = `flux-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        flashToast('saved.');
      }
    }
    if (e.key === 'a' || e.key === 'A') {
      if (autoPilotActive) {
        stopAutoPilot();
        hint.showAfterAutoPilot();
      } else {
        autoPilotForced = true;
        startAutoPilot();
      }
    }
    if (e.key === 'c' || e.key === 'C') {
      // Copy a shareable link to the current palette + last sequence.
      syncShareUrl();
      navigator.clipboard?.writeText(location.href)
        .then(() => flashToast('link copied.'))
        .catch(() => { /* clipboard blocked (insecure context / permission) — no-op */ });
    }
    if (e.key === 'w' || e.key === 'W') {
      sim.toggleMaterial();
      syncShareUrl();
      flashToast(sim.getMaterialIndex() === 1 ? 'watercolor.' : 'sumi ink.');
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

  // ── Shareable link: apply palette + sequence from the URL hash ───────────
  // A link like #p=3&s=enso pre-selects the palette and starts that sequence
  // immediately (non-forced, so the visitor's first interaction takes over).
  {
    const shared = parseShareHash(location.hash);
    if (shared.palette !== undefined) applyPalette(shared.palette);
    if (shared.material !== undefined) sim.setMaterial(shared.material);
    if (shared.sequence !== undefined) {
      autoPilotSeqIdx = sequenceIndexByName(shared.sequence);
      startAutoPilot();
    } else {
      // No sequence to play — still normalize the hash to current palette.
      syncShareUrl();
    }
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

    const rawDt = now - lastTime;
    const elapsed = Math.min(rawDt, 100);
    lastTime = now;

    // Adaptive resolution: drop a tier on sustained jank (one-way, floors at LOW).
    if (!suppressAutoDowngrade && perfMon.overBudget(rawDt)) {
      const lower = lowerTierFor(sim.getResolution());
      if (lower) downgradeTier(lower);
    }

    sim.step(elapsed);
    sim.render((now - lastInputTime) / 1000);
    if (import.meta.env.DEV) tickFPS(now);

    sim.rafId = requestAnimationFrame(frame);
  }

  sim.rafId = requestAnimationFrame(frame);
}

init();
