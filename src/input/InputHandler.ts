import { FluidSim } from '../sim/FluidSim';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private sim: FluidSim;
  private lastX: number = 0;
  private lastY: number = 0;
  private active: boolean = false;

  constructor(canvas: HTMLCanvasElement, sim: FluidSim) {
    this.canvas = canvas;
    this.sim = sim;
    this.attach();
  }

  private attach(): void {
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  }

  detach(): void {
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  // D4: normalize to [0,1]² accounting for DPR; canvas CSS size ≠ pixel size
  private normalize(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: 1.0 - (clientY - rect.top) / rect.height, // flip Y: WebGL origin is bottom-left
    };
  }

  private onDown = (e: PointerEvent): void => {
    this.active = true;
    const { x, y } = this.normalize(e.clientX, e.clientY);
    this.lastX = x;
    this.lastY = y;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.active) return;
    const { x, y } = this.normalize(e.clientX, e.clientY);
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.lastX = x;
    this.lastY = y;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
    this.sim.addSplat({ x, y, dx, dy });
  };

  private onUp = (): void => {
    this.active = false;
  };
}
