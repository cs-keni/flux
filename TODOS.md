# TODOS

## Measure gallery / PNG-export readback stall
- **What:** Time the sync `readPixels` hitch on the main thread — gallery capture (R key), `pagehide` capture, and the 2048² PNG export path — on a weak/mid GPU.
- **Why:** Export and gallery use synchronous float `readPixels`. Codex flagged this as possibly the *real* user-visible pain (a visible hitch), independent of frame rate. If the stall is noticeable, it may justify async-readback work on its own, and it reframes what the WebGPU migration is actually for.
- **Pros:** Pure measurement, no migration commitment. Either finds a standalone win or supplies the true justification for WebGPU's async readback (P6.3).
- **Cons:** Adds a measurement session; result may be "not noticeable," in which case it's a no-op.
- **Context:** `FluidSim.readDyeField()` / `restoreDyeField()` / `exportHighRes()` (src/sim/FluidSim.ts), gallery capture-on-R + pagehide (src/gallery/gallery.ts).
- **Depends on / blocked by:** Nothing. Can run alongside the WebGPU spike's T1 profiling pass.
- **Update (2026-07-08, T1):** First data point captured. `readDyeField()` sync `readPixels` at 768² stalls **~5.7ms** on the main thread (WSL2/ANGLE box), and Chromium logs `GPU stall due to ReadPixels`. That is ~⅓ of a 16.6ms frame from a single gallery/pagehide capture. Still to measure: the 2048² PNG export path (larger buffer → likely a much bigger hitch) and the same on a native-GL device. Instrumented via `GpuProfiler.sampleCpu('readback', …)`; read it with `window.__fluxProfile()` in a DEV build.
