/*
 * FluidSim — orchestrates all 9 GPU passes per frame
 *
 * Per-frame pipeline:
 *   1. SplatPass         inject velocity + dye at pointer position
 *   2. AdvectVelocity    semi-Lagrangian advection of velocity field
 *   3. DiffuseVelocity   implicit diffusion Jacobi (N ≈ 5 at near-zero viscosity)
 *   4. Divergence        compute ∇·u
 *   5. PressureSolve     Jacobi × 40 desktop / 20 mobile
 *   6. GradientSubtract  u -= ∇p  →  divergence-free velocity
 *   7. BoundaryCondition no-slip at canvas edges
 *   8. AdvectDye         dye advects along divergence-free u
 *   9. RenderDye         blit dye texture to display canvas
 *
 * FBO layout:
 *   velocity  RGBA16F ping-pong  [vx, vy, 0, 0]
 *   dye       RGBA16F ping-pong  [r,  0,  0, 0]
 *   divergence R16F              [∇·u]
 *   pressure  R16F  ping-pong   [p]
 */

import { SimConfig, PALETTES } from './config';
import { FBOManager, PingPong, FBO } from './FBOManager';
import { createProgram } from './glUtils';
import type { GpuProfiler } from '../dev/GpuProfiler';

import quadVert from '../shaders/quad.vert.glsl';
import splatFrag from '../shaders/splat.frag.glsl';
import advectFrag from '../shaders/advect.frag.glsl';
import diffuseFrag from '../shaders/diffuse.frag.glsl';
import divergenceFrag from '../shaders/divergence.frag.glsl';
import pressureFrag from '../shaders/pressure.frag.glsl';
import gradientFrag from '../shaders/gradient.frag.glsl';
import boundaryFrag from '../shaders/boundary.frag.glsl';
import renderFrag from '../shaders/render.frag.glsl';

export interface SplatEvent {
  x: number;  // normalized [0, 1]
  y: number;
  dx: number;
  dy: number;
  radius?: number;  // override config.splatRadius (e.g. smaller for auto-pilot)
}

export class FluidSim {
  rafId: number = 0;

  private gl: WebGL2RenderingContext;
  private config: SimConfig;
  private mobile: boolean;
  private fboManager!: FBOManager;
  private quadVAO!: WebGLVertexArrayObject;

  // FBOs
  private velocity!: PingPong;
  private dye!: PingPong;
  private divergence!: FBO;
  private pressure!: PingPong;

  // Programs
  private splatProgram!: WebGLProgram;
  private advectProgram!: WebGLProgram;
  private diffuseProgram!: WebGLProgram;
  private divergenceProgram!: WebGLProgram;
  private pressureProgram!: WebGLProgram;
  private gradientProgram!: WebGLProgram;
  private boundaryProgram!: WebGLProgram;
  private renderProgram!: WebGLProgram;

  // D9: bilinear filtering capability
  private linearFiltering: boolean = false;

  private paused: boolean = false;
  private pendingSplats: SplatEvent[] = [];
  private paletteIndex: number = 0;

  // DEV-only per-pass GPU profiler (Phase 6 T1). Null in production — every
  // call site is `this.profiler?.…`, so it costs one null-check when unattached.
  private profiler: GpuProfiler | null = null;

  // Phase 6b: guards against overlapping async captures (one PBO read at a time).
  private captureInFlight = false;

  // Palette crossfade — current values lerp toward target each step()
  private currentPrimary   = new Float32Array(3);
  private currentSecondary = new Float32Array(3);
  private targetPrimary    = new Float32Array(3);
  private targetSecondary  = new Float32Array(3);

  // Material crossfade — 0 = sumi ink, 1 = watercolor. currentMaterial lerps
  // toward targetMaterial each step() so toggling W crossfades the look.
  private materialIndex = 0;
  private currentMaterial = 0;
  private targetMaterial = 0;

  constructor(gl: WebGL2RenderingContext, config: SimConfig, mobile: boolean) {
    this.gl = gl;
    // Copy: config may be a shared module-level tier template (HIGH/MID/LOW).
    // Runtime downgrade mutates resolution/jacobi, so we must not touch the original.
    this.config = { ...config };
    this.mobile = mobile;
  }

  init(): void {
    const gl = this.gl;

    // Required for rendering into RGBA16F / R16F FBOs in WebGL 2
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('EXT_color_buffer_float not available — RGBA16F FBOs cannot be rendered into on this device/browser.');
    }

    // D9: check for linear filtering on half-float textures
    this.linearFiltering = !!gl.getExtension('OES_texture_float_linear');

    // Settle palette transition to starting palette (handles context restore correctly)
    const initPal = PALETTES[this.paletteIndex];
    this.currentPrimary.set(initPal.primary);
    this.currentSecondary.set(initPal.secondary);
    this.targetPrimary.set(initPal.primary);
    this.targetSecondary.set(initPal.secondary);

    // Settle material transition (handles context restore correctly)
    this.currentMaterial = this.materialIndex;
    this.targetMaterial = this.materialIndex;

    this.fboManager = new FBOManager(gl);
    this.buildFBOs();
    this.buildPrograms();
    this.buildQuadVAO();
  }

  private buildFBOs(): void {
    const { resolution } = this.config;
    const mgr = this.fboManager;

    this.velocity = mgr.createPingPong(resolution, resolution, mgr.createRGBA16F);
    this.dye = mgr.createPingPong(resolution, resolution, mgr.createRGBA16F);
    this.divergence = mgr.createR16F(resolution, resolution);
    this.pressure = mgr.createPingPong(resolution, resolution, mgr.createR16F);
  }

  private buildPrograms(): void {
    const gl = this.gl;
    this.splatProgram = createProgram(gl, quadVert, splatFrag);
    this.advectProgram = createProgram(gl, quadVert, advectFrag);
    this.diffuseProgram = createProgram(gl, quadVert, diffuseFrag);
    this.divergenceProgram = createProgram(gl, quadVert, divergenceFrag);
    this.pressureProgram = createProgram(gl, quadVert, pressureFrag);
    this.gradientProgram = createProgram(gl, quadVert, gradientFrag);
    this.boundaryProgram = createProgram(gl, quadVert, boundaryFrag);
    this.renderProgram = createProgram(gl, quadVert, renderFrag);
  }

  private buildQuadVAO(): void {
    const gl = this.gl;
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    this.quadVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVAO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  addSplat(event: SplatEvent): void {
    this.pendingSplats.push(event);
  }

  // DEV-only (Phase 6 T1): attach a per-pass GPU timer. No-op in prod builds
  // because main.ts only calls this under import.meta.env.DEV.
  attachProfiler(profiler: GpuProfiler): void {
    this.profiler = profiler;
  }

  step(elapsed: number): void {
    if (this.paused) return;
    const gl = this.gl;
    const p = this.profiler;
    p?.frameStart();
    const { resolution, jacobiIterations, diffuseIterations, viscosity, splatRadius, force, dt, frameCapMs } = this.config;

    // Normalize dissipation to be frame-rate-independent: express elapsed as
    // equivalent 60fps frame count so behavior is identical at any fps.
    // 0.999 per 60fps-frame ≈ 5.9% ink loss per second regardless of actual fps.
    const elapsedSec = Math.min(elapsed, frameCapMs) / 1000;
    const dissipation = Math.pow(0.999, elapsedSec * 60);

    // Palette crossfade: exponential approach, ~95% complete in 0.5s
    const palAlpha = 1.0 - Math.exp(-6.0 * elapsedSec);
    for (let i = 0; i < 3; i++) {
      this.currentPrimary[i]   += (this.targetPrimary[i]   - this.currentPrimary[i])   * palAlpha;
      this.currentSecondary[i] += (this.targetSecondary[i] - this.currentSecondary[i]) * palAlpha;
    }

    // Material crossfade: slightly faster (~95% in 0.4s) so the medium shift feels crisp
    const matAlpha = 1.0 - Math.exp(-8.0 * elapsedSec);
    this.currentMaterial += (this.targetMaterial - this.currentMaterial) * matAlpha;

    gl.bindVertexArray(this.quadVAO);
    gl.viewport(0, 0, resolution, resolution);

    // 1. Splat
    p?.begin('splat');
    for (const s of this.pendingSplats) {
      this.runSplat(s, s.radius ?? splatRadius, force);
    }
    this.pendingSplats = [];
    p?.end();

    // 2. Advect velocity
    p?.begin('advect-vel');
    this.runAdvect(this.velocity, this.velocity.read, dt, dissipation);
    p?.end();

    // 3. Diffuse velocity
    p?.begin('diffuse');
    if (viscosity > 0) {
      for (let i = 0; i < diffuseIterations; i++) {
        this.runDiffuse(this.velocity, viscosity, dt);
      }
    }
    p?.end();

    // 4. Divergence
    p?.begin('divergence');
    this.runDivergence();
    p?.end();

    // 5. Pressure solve (Jacobi) — the pass everyone assumes dominates. Timed as
    // one bucket across all iterations; that total is the number T1 tests.
    p?.begin('pressure');
    this.clearPressure();
    const iters = this.mobile ? Math.floor(jacobiIterations / 2) : jacobiIterations;
    for (let i = 0; i < iters; i++) {
      this.runPressure();
    }
    p?.end();

    // 6. Gradient subtract
    p?.begin('gradient');
    this.runGradient();
    p?.end();

    // 7. Boundary
    p?.begin('boundary');
    this.runBoundary();
    p?.end();

    // 8. Advect dye
    p?.begin('advect-dye');
    this.runAdvect(this.dye, this.velocity.read, dt, dissipation);
    p?.end();

    gl.bindVertexArray(null);
  }

  render(idleSeconds: number = 0): void {
    const gl = this.gl;
    const p = this.profiler;

    gl.bindVertexArray(this.quadVAO);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    p?.begin('render');
    gl.useProgram(this.renderProgram);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_dye'), 0);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_velocity'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, 'u_inkPrimary'), this.currentPrimary);
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, 'u_inkSecondary'), this.currentSecondary);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_idleTime'), idleSeconds);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_material'), this.currentMaterial);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    p?.end();

    gl.bindVertexArray(null);
    // render() closes the frame: step() opened it with frameStart().
    p?.frameEnd();
  }

  reset(): void {
    const gl = this.gl;
    const clear = (fb: WebGLFramebuffer) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };
    clear(this.velocity.read.framebuffer);
    clear(this.velocity.write.framebuffer);
    clear(this.dye.read.framebuffer);
    clear(this.dye.write.framebuffer);
    clear(this.divergence.framebuffer);
    clear(this.pressure.read.framebuffer);
    clear(this.pressure.write.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setPalette(index: number): void {
    this.paletteIndex = ((index % PALETTES.length) + PALETTES.length) % PALETTES.length;
    const p = PALETTES[this.paletteIndex];
    this.targetPrimary.set(p.primary);
    this.targetSecondary.set(p.secondary);
  }

  cyclePalette(): void {
    this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length;
    const p = PALETTES[this.paletteIndex];
    this.targetPrimary.set(p.primary);
    this.targetSecondary.set(p.secondary);
  }

  getPaletteIndex(): number {
    return this.paletteIndex;
  }

  // Material: 0 = sumi ink, 1 = watercolor. setMaterial redirects the target;
  // currentMaterial keeps chasing it in step(), so toggling is crossfade-safe.
  setMaterial(index: number): void {
    this.materialIndex = index === 1 ? 1 : 0;
    this.targetMaterial = this.materialIndex;
  }

  toggleMaterial(): void {
    this.setMaterial(this.materialIndex === 0 ? 1 : 0);
  }

  getMaterialIndex(): number {
    return this.materialIndex;
  }

  getResolution(): number {
    return this.config.resolution;
  }

  // Rebuild all sim FBOs at a new resolution + Jacobi count (GPU tier downgrade).
  // Programs and the quad VAO are resolution-independent and left intact. The
  // caller owns preserving the dye field around this call (readDyeField before,
  // restoreDyeField after) — rebuilding starts from cleared buffers.
  rebuildAt(resolution: number, jacobiIterations: number): void {
    this.fboManager.destroyAll();
    this.config.resolution = resolution;
    this.config.jacobiIterations = jacobiIterations;
    this.buildFBOs();
  }

  // ── Gallery: read / restore the ink-concentration (dye) field ─────────────
  // Only the R channel carries ink concentration (see splat/advect passes).
  // Both methods work in GL readPixels order (row 0 = bottom); the gallery
  // module owns the flip to image order when it serializes to a PNG.

  // Read the current dye field at sim resolution. Returns the R channel only.
  readDyeField(): { data: Float32Array; size: number } {
    const gl = this.gl;
    const { resolution } = this.config;
    const rgba = new Float32Array(resolution * resolution * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.read.framebuffer);
    // Phase 6 T1 / TODOS.md: measure the sync readback stall. readPixels blocks
    // until the GPU drains, so wall-clock here is the user-visible cost that an
    // async mapAsync path (WebGPU) would hide. This is the candidate real payoff.
    const t0 = this.profiler ? performance.now() : 0;
    gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.FLOAT, rgba);
    this.profiler?.sampleCpu('readback', performance.now() - t0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const data = new Float32Array(resolution * resolution);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
    return { data, size: resolution };
  }

  // Phase 6b: async dye readback via PBO + fence — no CPU stall on the calling
  // frame. Sync readPixels blocks until the GPU drains (the R-key / export
  // hitch, ~5.7ms @768² and worse at higher res). Here we issue the read into a
  // PIXEL_PACK_BUFFER, drop a fenceSync, and resolve the CPU copy on a later
  // tick via getBufferSubData once the fence signals.
  //
  // Capture-then-clear correctness: callers (R key) enqueue this read, then call
  // reset() synchronously right after. GL executes in submission order, so the
  // readPixels-into-PBO runs BEFORE reset()'s clears — the PBO holds pre-clear
  // pixels no matter how many frames later the CPU maps it. No scratch copy is
  // needed because reset() only clears the dye FBO; it never deletes the texture.
  async readDyeFieldAsync(): Promise<{ data: Float32Array; size: number }> {
    const gl = this.gl;
    const { resolution } = this.config;

    // One capture at a time. A second R press while a read is pending falls back
    // to the sync path (rare — R also resets, so mashing just re-clears).
    if (this.captureInFlight) return this.readDyeField();
    this.captureInFlight = true;

    const byteLength = resolution * resolution * 4 * 4; // RGBA × float32
    const pbo = gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.read.framebuffer);
    // With a PIXEL_PACK_BUFFER bound, the final arg is a byte offset into that
    // buffer, not a CPU array — this returns immediately instead of stalling.
    gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.FLOAT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush(); // push the fence into the GPU queue so it can eventually signal

    await this.awaitSync(sync);

    const rgba = new Float32Array(resolution * resolution * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rgba);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    gl.deleteSync(sync);
    gl.deleteBuffer(pbo);
    this.captureInFlight = false;

    const data = new Float32Array(resolution * resolution);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
    return { data, size: resolution };
  }

  // Poll a fence off the main thread: clientWaitSync(sync, 0, 0) does a
  // non-blocking check, re-polled each frame until signaled. Resolves (rather
  // than looping forever) on WAIT_FAILED or after a ~3s cap so a lost fence
  // can't wedge captures — worst case the readback yields whatever's in the PBO.
  private awaitSync(sync: WebGLSync): Promise<void> {
    const gl = this.gl;
    return new Promise((resolve) => {
      let tries = 0;
      const poll = () => {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (
          status === gl.ALREADY_SIGNALED ||
          status === gl.CONDITION_SATISFIED ||
          status === gl.WAIT_FAILED ||
          ++tries > 180
        ) {
          resolve();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  // Restore an ink-concentration field into the dye FBO. `field` must already
  // be at sim resolution (caller resamples). Velocity/pressure are cleared so
  // the painting resumes calm and paintable rather than mid-motion.
  restoreDyeField(field: Float32Array, size: number): void {
    const gl = this.gl;
    const { resolution } = this.config;
    if (size !== resolution || field.length !== resolution * resolution) return;

    // Pack R = concentration, GBA = 0. Upload FLOAT data into the RGBA16F
    // dye texture (WebGL 2 converts to half-float on store).
    const rgba = new Float32Array(resolution * resolution * 4);
    for (let i = 0; i < resolution * resolution; i++) rgba[i * 4] = field[i];

    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, rgba);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const clear = (fb: WebGLFramebuffer) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };
    clear(this.velocity.read.framebuffer);
    clear(this.velocity.write.framebuffer);
    clear(this.dye.write.framebuffer);
    clear(this.pressure.read.framebuffer);
    clear(this.pressure.write.framebuffer);
    clear(this.divergence.framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  onResize(): void {
    // FBO resolution stays fixed (D4); canvas CSS handles display scaling
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.fboManager?.destroyAll();
  }

  // Export the current frame as a high-resolution PNG.
  // Re-renders the full render shader (paper texture + ink) at `size`×`size` on
  // an offscreen canvas — paper grain is computed at native 2048×2048 detail
  // rather than being scaled up from the display canvas. Falls back to scaling
  // the display canvas via 2D context if offscreen WebGL2 is unavailable.
  exportHighRes(size: number = 2048): string {
    const gl = this.gl;
    const { resolution } = this.config;
    const palette = PALETTES[this.paletteIndex];

    // Read current dye and velocity FBO data from the main GL context
    const pixelCount = resolution * resolution * 4;
    const dyeData = new Float32Array(pixelCount);
    const velData = new Float32Array(pixelCount);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.read.framebuffer);
    gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.FLOAT, dyeData);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.read.framebuffer);
    gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.FLOAT, velData);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = size;
    offCanvas.height = size;
    const off = offCanvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });

    if (!off) {
      // Fallback: scale the display canvas via 2D blit
      const ctx = offCanvas.getContext('2d')!;
      ctx.fillStyle = '#F2EDD7';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(gl.canvas as HTMLCanvasElement, 0, 0, size, size);
      return offCanvas.toDataURL('image/png');
    }

    // Enable linear filtering on float textures when available
    off.getExtension('OES_texture_float_linear');

    const uploadTex = (data: Float32Array): WebGLTexture => {
      const tex = off.createTexture()!;
      off.bindTexture(off.TEXTURE_2D, tex);
      // RGBA32F: no extension needed to upload/sample, only to render-to
      off.texImage2D(off.TEXTURE_2D, 0, off.RGBA32F, resolution, resolution, 0, off.RGBA, off.FLOAT, data);
      off.texParameteri(off.TEXTURE_2D, off.TEXTURE_MIN_FILTER, off.LINEAR);
      off.texParameteri(off.TEXTURE_2D, off.TEXTURE_MAG_FILTER, off.LINEAR);
      off.texParameteri(off.TEXTURE_2D, off.TEXTURE_WRAP_S, off.CLAMP_TO_EDGE);
      off.texParameteri(off.TEXTURE_2D, off.TEXTURE_WRAP_T, off.CLAMP_TO_EDGE);
      return tex;
    };

    const dyeTex = uploadTex(dyeData);
    const velTex = uploadTex(velData);

    // Compile render program (quadVert + renderFrag already imported by this module)
    const prog = createProgram(off, quadVert, renderFrag);

    // Fullscreen quad VAO
    const buf = off.createBuffer()!;
    off.bindBuffer(off.ARRAY_BUFFER, buf);
    off.bufferData(off.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), off.STATIC_DRAW);
    const vao = off.createVertexArray()!;
    off.bindVertexArray(vao);
    off.enableVertexAttribArray(0);
    off.vertexAttribPointer(0, 2, off.FLOAT, false, 0, 0);

    // Render at high resolution — paper grain recomputed at full 2048×2048 detail
    off.viewport(0, 0, size, size);
    off.bindFramebuffer(off.FRAMEBUFFER, null);
    off.useProgram(prog);
    off.uniform1i(off.getUniformLocation(prog, 'u_dye'), 0);
    off.uniform1i(off.getUniformLocation(prog, 'u_velocity'), 1);
    off.activeTexture(off.TEXTURE0);
    off.bindTexture(off.TEXTURE_2D, dyeTex);
    off.activeTexture(off.TEXTURE1);
    off.bindTexture(off.TEXTURE_2D, velTex);
    off.uniform3fv(off.getUniformLocation(prog, 'u_inkPrimary'), palette.primary);
    off.uniform3fv(off.getUniformLocation(prog, 'u_inkSecondary'), palette.secondary);
    off.uniform1f(off.getUniformLocation(prog, 'u_idleTime'), 0.0); // export always looks fresh
    off.uniform1f(off.getUniformLocation(prog, 'u_material'), this.targetMaterial); // settled material
    off.drawArrays(off.TRIANGLE_STRIP, 0, 4);

    return offCanvas.toDataURL('image/png');
  }

  // ── Pass implementations ─────────────────────────────────────────────────

  private blit(target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private runSplat(s: SplatEvent, radius: number, force: number): void {
    const gl = this.gl;
    const prog = this.splatProgram;
    const { resolution, wetOnWetStrength } = this.config;
    const aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_target'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_dye'), 1);

    // Always bind dye texture on unit 1 so the sampler is valid in both passes.
    // It is only actually read when u_wetFactor > 0 (velocity pass).
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);

    // Velocity splat — wet-on-wet boost applied here
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_point'), s.x, s.y);
    gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), s.dx * force, s.dy * force, 0.0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_radius'), radius / resolution);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_aspectRatio'), aspectRatio);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_wetFactor'), wetOnWetStrength);
    this.blit(this.velocity.write.framebuffer);
    this.velocity.swap();

    // Dye splat — no wet-on-wet; spreading is handled by the amplified velocity field
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), 1.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_wetFactor'), 0.0);
    this.blit(this.dye.write.framebuffer);
    this.dye.swap();
  }

  private runAdvect(target: PingPong, velocityTex: FBO, dt: number, dissipation: number): void {
    const gl = this.gl;
    const prog = this.advectProgram;
    const { resolution } = this.config;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_velocity'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_source'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocityTex.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_dissipation'), dissipation);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texelSize'), 1.0 / resolution, 1.0 / resolution);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_linearFiltering'), this.linearFiltering ? 1 : 0);
    this.blit(target.write.framebuffer);
    target.swap();
  }

  private runDiffuse(target: PingPong, viscosity: number, dt: number): void {
    const gl = this.gl;
    const prog = this.diffuseProgram;
    const { resolution } = this.config;
    const alpha = (1.0 / resolution) * (1.0 / resolution) / (viscosity * dt);

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_x'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'), alpha);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_rBeta'), 1.0 / (4.0 + alpha));
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texelSize'), 1.0 / resolution, 1.0 / resolution);
    this.blit(target.write.framebuffer);
    target.swap();
  }

  private runDivergence(): void {
    const gl = this.gl;
    const prog = this.divergenceProgram;
    const { resolution } = this.config;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_velocity'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texelSize'), 1.0 / resolution, 1.0 / resolution);
    this.blit(this.divergence.framebuffer);
  }

  private clearPressure(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.read.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private runPressure(): void {
    const gl = this.gl;
    const prog = this.pressureProgram;
    const { resolution } = this.config;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_pressure'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_divergence'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergence.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texelSize'), 1.0 / resolution, 1.0 / resolution);
    this.blit(this.pressure.write.framebuffer);
    this.pressure.swap();
  }

  private runGradient(): void {
    const gl = this.gl;
    const prog = this.gradientProgram;
    const { resolution } = this.config;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_pressure'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_velocity'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texelSize'), 1.0 / resolution, 1.0 / resolution);
    this.blit(this.velocity.write.framebuffer);
    this.velocity.swap();
  }

  private runBoundary(): void {
    const gl = this.gl;
    const prog = this.boundaryProgram;
    const { resolution } = this.config;

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_velocity'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texelSize'), 1.0 / resolution, 1.0 / resolution);
    this.blit(this.velocity.write.framebuffer);
    this.velocity.swap();
  }
}
