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

  constructor(gl: WebGL2RenderingContext, config: SimConfig, mobile: boolean) {
    this.gl = gl;
    this.config = config;
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

  step(elapsed: number): void {
    if (this.paused) return;
    const gl = this.gl;
    const { resolution, jacobiIterations, diffuseIterations, viscosity, splatRadius, force, dt, frameCapMs } = this.config;

    // Normalize dissipation to be frame-rate-independent: express elapsed as
    // equivalent 60fps frame count so behavior is identical at any fps.
    // 0.999 per 60fps-frame ≈ 5.9% ink loss per second regardless of actual fps.
    const elapsedSec = Math.min(elapsed, frameCapMs) / 1000;
    const dissipation = Math.pow(0.999, elapsedSec * 60);

    gl.bindVertexArray(this.quadVAO);
    gl.viewport(0, 0, resolution, resolution);

    // 1. Splat
    for (const s of this.pendingSplats) {
      this.runSplat(s, s.radius ?? splatRadius, force);
    }
    this.pendingSplats = [];

    // 2. Advect velocity
    this.runAdvect(this.velocity, this.velocity.read, dt, dissipation);

    // 3. Diffuse velocity
    if (viscosity > 0) {
      for (let i = 0; i < diffuseIterations; i++) {
        this.runDiffuse(this.velocity, viscosity, dt);
      }
    }

    // 4. Divergence
    this.runDivergence();

    // 5. Pressure solve (Jacobi)
    this.clearPressure();
    const iters = this.mobile ? Math.floor(jacobiIterations / 2) : jacobiIterations;
    for (let i = 0; i < iters; i++) {
      this.runPressure();
    }

    // 6. Gradient subtract
    this.runGradient();

    // 7. Boundary
    this.runBoundary();

    // 8. Advect dye
    this.runAdvect(this.dye, this.velocity.read, dt, dissipation);

    gl.bindVertexArray(null);
  }

  render(): void {
    const gl = this.gl;
    const palette = PALETTES[this.paletteIndex];

    gl.bindVertexArray(this.quadVAO);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.useProgram(this.renderProgram);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_dye'), 0);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_velocity'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, 'u_inkPrimary'), palette.primary);
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, 'u_inkSecondary'), palette.secondary);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
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
  }

  cyclePalette(): void {
    this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length;
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

  // ── Pass implementations ─────────────────────────────────────────────────

  private blit(target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private runSplat(s: SplatEvent, radius: number, force: number): void {
    const gl = this.gl;
    const prog = this.splatProgram;
    const { resolution } = this.config;
    const aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;

    // Velocity splat
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_target'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_point'), s.x, s.y);
    gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), s.dx * force, s.dy * force, 0.0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_radius'), radius / resolution);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_aspectRatio'), aspectRatio);
    this.blit(this.velocity.write.framebuffer);
    this.velocity.swap();

    // Dye splat
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_point'), s.x, s.y);
    gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), 1.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_radius'), radius / resolution);
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
