// Gallery — persist the last few paintings to localStorage and restore them.
//
// What we store is NOT the rendered image. It's the raw dye ink-concentration
// field (the sim's R channel), packed into the ALPHA channel of a grayscale
// PNG. Ink is sparse, so PNG compresses each painting to tens of KB — five fit
// comfortably in the ~5MB localStorage budget. That one PNG does double duty:
//   • restore data  — decoded back into the dye FBO to resume the simulation
//   • overlay thumbnail — used as a CSS mask filled with the palette color
//
// Row-order contract: the FBO read/upload path (FluidSim) works in GL order
// (row 0 = bottom). PNGs are image order (row 0 = top). encode/decode own the
// single paired Y-flip so FluidSim never has to think about it.

export const GALLERY_KEY = 'flux.gallery.v1';
export const MAX_ENTRIES = 5;

// Ink concentration mapped onto the 0..255 alpha range. The render shader
// saturates opacity around concentration ~1.5, so a ceiling of 4.0 keeps bright
// cores unclipped while the 8-bit step (~0.016) stays visually lossless.
export const CONCENTRATION_MAX = 4.0;

// Below this inked fraction the canvas is effectively blank — don't archive it.
export const MIN_COVERAGE = 0.004; // 0.4% of pixels carrying ink
const INK_EPSILON = 0.02;          // concentration above which a pixel counts as inked

export interface GalleryEntry {
  png: string;         // dataURL; ink concentration lives in the alpha channel
  size: number;        // sim resolution the field was captured at
  paletteIndex: number;
  timestamp: number;
}

// ── Pure helpers (unit-tested; no DOM) ──────────────────────────────────────

export function quantize(concentration: number): number {
  const v = Math.round((concentration / CONCENTRATION_MAX) * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function dequantize(byte: number): number {
  return (byte / 255) * CONCENTRATION_MAX;
}

// Fraction of the field carrying meaningful ink — used to skip blank canvases.
export function coverage(field: Float32Array): number {
  if (field.length === 0) return 0;
  let inked = 0;
  for (let i = 0; i < field.length; i++) {
    if (field[i] > INK_EPSILON) inked++;
  }
  return inked / field.length;
}

// Keep only the newest MAX_ENTRIES (callers prepend newest-first).
export function capEntries(entries: GalleryEntry[]): GalleryEntry[] {
  return entries.slice(0, MAX_ENTRIES);
}

function isValidEntry(e: unknown): e is GalleryEntry {
  return (
    !!e &&
    typeof (e as GalleryEntry).png === 'string' &&
    typeof (e as GalleryEntry).size === 'number' &&
    typeof (e as GalleryEntry).paletteIndex === 'number' &&
    typeof (e as GalleryEntry).timestamp === 'number'
  );
}

// Bilinear resample a square single-channel field. Used only when the saved
// resolution differs from the current sim resolution (e.g. GPU tier changed
// between sessions); the common same-tier path returns the input untouched.
export function resampleField(src: Float32Array, srcSize: number, dstSize: number): Float32Array {
  if (srcSize === dstSize) return src;
  const dst = new Float32Array(dstSize * dstSize);
  const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
  for (let y = 0; y < dstSize; y++) {
    const fy = ((y + 0.5) * srcSize) / dstSize - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(srcSize - 1, y0 + 1);
    const ty = clamp01(fy - y0);
    for (let x = 0; x < dstSize; x++) {
      const fx = ((x + 0.5) * srcSize) / dstSize - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(srcSize - 1, x0 + 1);
      const tx = clamp01(fx - x0);
      const a = src[y0 * srcSize + x0];
      const b = src[y0 * srcSize + x1];
      const c = src[y1 * srcSize + x0];
      const d = src[y1 * srcSize + x1];
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      dst[y * dstSize + x] = top + (bot - top) * ty;
    }
  }
  return dst;
}

// ── Canvas encode / decode (browser only) ───────────────────────────────────

// GL-order concentration field → image-order PNG dataURL (alpha = concentration).
export function encodeField(field: Float32Array, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const glRow = (size - 1 - y) * size; // flip: GL bottom-up → image top-down
    const pngRow = y * size;
    for (let x = 0; x < size; x++) {
      const di = (pngRow + x) * 4;
      img.data[di] = 0;
      img.data[di + 1] = 0;
      img.data[di + 2] = 0;
      img.data[di + 3] = quantize(field[glRow + x]);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// PNG dataURL → GL-order concentration field (inverse of encodeField).
export function decodeEntry(entry: GalleryEntry): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = entry.size;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);
      const px = ctx.getImageData(0, 0, size, size).data; // image top-down
      const field = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        const pngRow = y * size;
        const glRow = (size - 1 - y) * size; // flip back to GL bottom-up
        for (let x = 0; x < size; x++) {
          field[glRow + x] = dequantize(px[(pngRow + x) * 4 + 3]);
        }
      }
      resolve(field);
    };
    img.onerror = () => reject(new Error('gallery: failed to decode entry PNG'));
    img.src = entry.png;
  });
}

// ── localStorage persistence (browser only) ─────────────────────────────────

export function loadGallery(): GalleryEntry[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

// Encode + persist the current painting. Returns false if it was too empty to
// keep or if storage rejected it. On quota errors we drop the oldest entries
// and retry so a big dense painting can't wedge the whole gallery.
export function captureToGallery(field: Float32Array, size: number, paletteIndex: number): boolean {
  if (coverage(field) < MIN_COVERAGE) return false;

  let png: string;
  try {
    png = encodeField(field, size);
  } catch {
    return false;
  }

  const entry: GalleryEntry = { png, size, paletteIndex, timestamp: Date.now() };
  let entries = capEntries([entry, ...loadGallery()]);

  while (entries.length > 0) {
    try {
      localStorage.setItem(GALLERY_KEY, JSON.stringify(entries));
      return true;
    } catch {
      if (entries.length === 1) return false; // even one entry won't fit
      entries = entries.slice(0, entries.length - 1); // drop oldest, retry
    }
  }
  return false;
}
