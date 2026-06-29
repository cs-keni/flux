import { FluidSim } from '../sim/FluidSim';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private sim: FluidSim;
  private onInputCb: (() => void) | undefined;

  // Multi-touch: track last position per pointer id
  private pointers = new Map<number, { x: number; y: number }>();

  constructor(
    canvas: HTMLCanvasElement,
    sim: FluidSim,
    onInput?: () => void,
  ) {
    this.canvas = canvas;
    this.sim = sim;
    this.onInputCb = onInput;
    this.attach();
  }

  private attach(): void {
    this.canvas.addEventListener('pointerdown',   this.onDown);
    this.canvas.addEventListener('pointermove',   this.onMove);
    this.canvas.addEventListener('pointerup',     this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    // Prevent native scroll/zoom on touch devices
    this.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown',   this.onDown);
    this.canvas.removeEventListener('pointermove',   this.onMove);
    this.canvas.removeEventListener('pointerup',     this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  // D4: normalize to [0,1]² in CSS coordinates (no DPR needed — getBoundingClientRect
  // returns CSS pixels matching clientX/Y). Y is flipped for WebGL bottom-left origin.
  private normalize(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: 1.0 - (clientY - rect.top) / rect.height,
    };
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const pos = this.normalize(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, pos);
    this.onInputCb?.();
  };

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    const pos = this.normalize(e.clientX, e.clientY);
    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;

    this.pointers.set(e.pointerId, pos);

    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
    this.sim.addSplat({ x: pos.x, y: pos.y, dx, dy });
    this.onInputCb?.();
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };
}
