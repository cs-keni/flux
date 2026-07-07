// Gallery overlay — summoned with the G key. Shows up to 5 saved paintings as
// palette-tinted ink thumbnails on paper. Select with 1–5 or a click; any other
// key, or a click on the backdrop, dismisses. Kept off-DOM while closed so it
// never intercepts canvas input.
//
// Thumbnails are the stored PNG used as a CSS mask (its alpha channel is the ink
// shape) filled with the entry's palette primary color — no separate render.

import { PALETTES } from '../sim/config';
import type { GalleryEntry } from '../gallery/gallery';

const PAPER = '#F2EDD7';

function paletteCss(index: number): string {
  const p = PALETTES[index] ?? PALETTES[0];
  const [r, g, b] = p.primary;
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export class GalleryOverlay {
  private root: HTMLElement | null = null;
  private onSelect: (index: number) => void;
  private onDismiss: () => void;

  constructor(onSelect: (index: number) => void, onDismiss: () => void) {
    this.onSelect = onSelect;
    this.onDismiss = onDismiss;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(entries: GalleryEntry[]): void {
    if (this.root) this.teardown();

    const root = document.createElement('div');
    root.style.cssText = `
      position:fixed;inset:0;z-index:10;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
      background:rgba(242,237,215,0.82);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
      opacity:0;transition:opacity 0.28s ease;
    `;
    // Backdrop click (outside any card) dismisses.
    root.addEventListener('click', (e) => {
      if (e.target === root) this.onDismiss();
    });

    const title = document.createElement('div');
    title.textContent = 'your last works';
    title.style.cssText = `
      font-family:Georgia,'Times New Roman',serif;font-size:0.9rem;
      letter-spacing:0.18em;color:rgba(26,18,9,0.55);text-transform:lowercase;
    `;
    root.appendChild(title);

    const rowEl = document.createElement('div');
    rowEl.style.cssText = `display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:92vw;`;

    entries.forEach((entry, i) => {
      rowEl.appendChild(this.buildCard(entry, i));
    });
    root.appendChild(rowEl);

    const hintEl = document.createElement('div');
    hintEl.textContent = `press 1–${entries.length} · any key to close`;
    hintEl.style.cssText = `
      font-family:Georgia,'Times New Roman',serif;font-size:0.72rem;
      letter-spacing:0.12em;color:rgba(26,18,9,0.4);
    `;
    root.appendChild(hintEl);

    document.body.appendChild(root);
    this.root = root;

    // Fade the backdrop in, then let each card's transition-delay stagger them.
    requestAnimationFrame(() => {
      root.style.opacity = '1';
      const cards = rowEl.children;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i] as HTMLElement;
        c.style.opacity = '1';
        c.style.transform = 'translateY(0) scale(1)';
      }
    });
  }

  private buildCard(entry: GalleryEntry, i: number): HTMLElement {
    const card = document.createElement('div');
    const side = 'min(30vh, 30vw, 260px)';
    card.style.cssText = `
      position:relative;width:${side};height:${side};
      background:${PAPER};border-radius:3px;
      box-shadow:0 6px 24px rgba(26,18,9,0.18);
      cursor:pointer;overflow:hidden;
      opacity:0;transform:translateY(14px) scale(0.97);
      transition:opacity 0.42s ease ${i * 0.06}s,
                 transform 0.42s cubic-bezier(0.22,1,0.36,1) ${i * 0.06}s,
                 box-shadow 0.2s ease;
    `;
    card.addEventListener('mouseenter', () => {
      card.style.boxShadow = '0 12px 34px rgba(26,18,9,0.28)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.boxShadow = '0 6px 24px rgba(26,18,9,0.18)';
    });
    card.addEventListener('click', () => this.onSelect(i));

    const ink = document.createElement('div');
    ink.style.cssText = `
      position:absolute;inset:0;background:${paletteCss(entry.paletteIndex)};
      -webkit-mask-image:url(${entry.png});mask-image:url(${entry.png});
      -webkit-mask-size:100% 100%;mask-size:100% 100%;
      -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
    `;
    card.appendChild(ink);

    const badge = document.createElement('div');
    badge.textContent = String(i + 1);
    badge.style.cssText = `
      position:absolute;top:8px;left:10px;
      font-family:Georgia,'Times New Roman',serif;font-size:0.82rem;
      letter-spacing:0.06em;color:rgba(26,18,9,0.5);
    `;
    card.appendChild(badge);

    return card;
  }

  hide(): void {
    if (!this.root) return;
    const root = this.root;
    this.root = null;
    root.style.opacity = '0';
    setTimeout(() => root.remove(), 320);
  }

  private teardown(): void {
    this.root?.remove();
    this.root = null;
  }
}
