// "drag to paint." hint text — visible on load, fades out on first interaction,
// fades back in after IDLE_HINT_MS of no activity.

const IDLE_HINT_MS = 8_000;

export class HintOverlay {
  private el: HTMLElement;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private visible: boolean = true;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'hint';
    this.el.textContent = 'drag to paint.';
    this.el.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      font-family:Georgia,'Times New Roman',serif;
      font-size:1.05rem;letter-spacing:0.18em;
      color:rgba(26,18,9,0.32);
      pointer-events:none;user-select:none;
      opacity:1;transition:opacity 1.4s ease;
    `;
    document.body.appendChild(this.el);
  }

  // Call on every user interaction
  onInput(): void {
    this.hide();
    this.scheduleShow();
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.el.style.opacity = '0';
  }

  private show(): void {
    if (this.visible) return;
    this.visible = true;
    this.el.style.opacity = '1';
  }

  private scheduleShow(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.show();
      this.idleTimer = null;
    }, IDLE_HINT_MS);
  }

  // Hide hint while auto-pilot is painting (hint would be distracting)
  hideForAutoPilot(): void {
    if (this.idleTimer !== null) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    this.hide();
  }

  showAfterAutoPilot(): void {
    this.scheduleShow();
  }
}
