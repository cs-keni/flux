// Keyboard shortcut cheat-sheet — shown once on load, dismissed on first
// interaction or after AUTO_DISMISS_MS. Never shown again in the session.
// Hidden entirely on touch-primary devices (no keyboard to discover).

const SHOW_DELAY_MS    = 2_000;   // wait for canvas to settle before appearing
const AUTO_DISMISS_MS  = 8_000;   // auto-fade if user never interacts

const ROWS: [string, string][] = [
  ['1–6',        'palette'],
  ['P',          'cycle palette'],
  ['R',          'reset canvas'],
  ['S',          'save PNG'],
  ['A',          'auto-pilot'],
];

export class ShortcutOverlay {
  private el: HTMLElement;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissed = false;

  constructor() {
    // No keyboard on touch-primary mobile devices — don't show at all
    if (navigator.maxTouchPoints > 0 && screen.width < 768) {
      this.el = document.createElement('div'); // inert placeholder
      return;
    }

    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:fixed;bottom:28px;right:24px;
      display:grid;grid-template-columns:56px 1fr;gap:5px 12px;align-items:baseline;
      font-family:Georgia,'Times New Roman',serif;
      font-size:0.76rem;letter-spacing:0.07em;
      color:rgba(26,18,9,0.50);
      pointer-events:none;user-select:none;
      opacity:0;transition:opacity 1.2s ease;
    `;

    for (const [key, desc] of ROWS) {
      const keyEl = document.createElement('span');
      keyEl.textContent = key;
      keyEl.style.cssText = 'text-align:right;opacity:0.9;';

      const descEl = document.createElement('span');
      descEl.textContent = desc;

      this.el.appendChild(keyEl);
      this.el.appendChild(descEl);
    }

    document.body.appendChild(this.el);

    this.showTimer = setTimeout(() => {
      if (!this.dismissed) this.reveal();
    }, SHOW_DELAY_MS);
  }

  // Call on any user interaction (key, touch, mouse)
  dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    if (this.showTimer !== null) { clearTimeout(this.showTimer); this.showTimer = null; }
    if (this.dismissTimer !== null) { clearTimeout(this.dismissTimer); this.dismissTimer = null; }
    this.el.style.opacity = '0';
    // Remove from DOM after the CSS transition finishes
    setTimeout(() => this.el.remove(), 1500);
  }

  private reveal(): void {
    this.el.style.opacity = '1';
    this.dismissTimer = setTimeout(() => this.dismiss(), AUTO_DISMISS_MS);
  }
}
