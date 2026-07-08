import { describe, it, expect, beforeEach } from 'vitest';
import {
  quantize,
  dequantize,
  coverage,
  capEntries,
  resampleField,
  loadGallery,
  GALLERY_KEY,
  MAX_ENTRIES,
  CONCENTRATION_MAX,
  MIN_COVERAGE,
  GalleryEntry,
} from '../../src/gallery/gallery';

function entry(overrides: Partial<GalleryEntry> = {}): GalleryEntry {
  return { png: 'data:image/png;base64,AAAA', size: 256, paletteIndex: 0, timestamp: 1, ...overrides };
}

describe('quantize/dequantize', () => {
  it('maps 0 → 0 and CONCENTRATION_MAX → 255', () => {
    expect(quantize(0)).toBe(0);
    expect(quantize(CONCENTRATION_MAX)).toBe(255);
  });

  it('clamps out-of-range concentrations', () => {
    expect(quantize(-1)).toBe(0);
    expect(quantize(CONCENTRATION_MAX * 2)).toBe(255);
  });

  it('round-trips within one quantization step', () => {
    const step = CONCENTRATION_MAX / 255;
    for (const c of [0.1, 0.5, 1.0, 1.5, 2.7]) {
      expect(Math.abs(dequantize(quantize(c)) - c)).toBeLessThanOrEqual(step);
    }
  });
});

describe('coverage()', () => {
  it('is 0 for an all-zero field', () => {
    expect(coverage(new Float32Array(100))).toBe(0);
  });

  it('is 1 when every pixel is inked', () => {
    expect(coverage(new Float32Array(100).fill(1))).toBe(1);
  });

  it('ignores sub-epsilon noise', () => {
    expect(coverage(new Float32Array(100).fill(0.001))).toBe(0);
  });

  it('reports the inked fraction', () => {
    const f = new Float32Array(100);
    for (let i = 0; i < 25; i++) f[i] = 1;
    expect(coverage(f)).toBeCloseTo(0.25);
  });

  it('a near-blank field falls below MIN_COVERAGE', () => {
    const f = new Float32Array(10000);
    f[0] = 1; // 0.01% inked
    expect(coverage(f)).toBeLessThan(MIN_COVERAGE);
  });
});

describe('capEntries()', () => {
  it('keeps at most MAX_ENTRIES, newest-first order preserved', () => {
    const many = Array.from({ length: 8 }, (_, i) => entry({ timestamp: i }));
    const capped = capEntries(many);
    expect(capped).toHaveLength(MAX_ENTRIES);
    expect(capped[0].timestamp).toBe(0); // input order preserved (caller prepends newest)
  });

  it('leaves short lists untouched', () => {
    const two = [entry({ timestamp: 1 }), entry({ timestamp: 2 })];
    expect(capEntries(two)).toHaveLength(2);
  });
});

describe('resampleField()', () => {
  it('returns the same reference when sizes match', () => {
    const src = new Float32Array([1, 2, 3, 4]);
    expect(resampleField(src, 2, 2)).toBe(src);
  });

  it('preserves a constant field on upscale', () => {
    const src = new Float32Array(4).fill(0.7); // 2x2
    const up = resampleField(src, 2, 4);        // → 4x4
    expect(up).toHaveLength(16);
    for (const v of up) expect(v).toBeCloseTo(0.7);
  });

  it('preserves a constant field on downscale', () => {
    const src = new Float32Array(16).fill(0.3); // 4x4
    const down = resampleField(src, 4, 2);       // → 2x2
    expect(down).toHaveLength(4);
    for (const v of down) expect(v).toBeCloseTo(0.3);
  });
});

describe('loadGallery()', () => {
  beforeEach(() => localStorage.clear());

  it('returns [] when nothing is stored', () => {
    expect(loadGallery()).toEqual([]);
  });

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(GALLERY_KEY, '{not json');
    expect(loadGallery()).toEqual([]);
  });

  it('returns [] when the stored value is not an array', () => {
    localStorage.setItem(GALLERY_KEY, JSON.stringify({ foo: 1 }));
    expect(loadGallery()).toEqual([]);
  });

  it('filters out entries with the wrong shape', () => {
    localStorage.setItem(GALLERY_KEY, JSON.stringify([entry(), { junk: true }, entry()]));
    expect(loadGallery()).toHaveLength(2);
  });

  it('accepts pre-material entries (no material field)', () => {
    // Back-compat: entries saved before watercolor mode have no material key.
    localStorage.setItem(GALLERY_KEY, JSON.stringify([entry()]));
    const loaded = loadGallery();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].material).toBeUndefined(); // caller defaults to 0
  });

  it('preserves a material field when present', () => {
    localStorage.setItem(GALLERY_KEY, JSON.stringify([entry({ material: 1 })]));
    expect(loadGallery()[0].material).toBe(1);
  });

  it('caps a bloated store to MAX_ENTRIES', () => {
    const many = Array.from({ length: 9 }, (_, i) => entry({ timestamp: i }));
    localStorage.setItem(GALLERY_KEY, JSON.stringify(many));
    expect(loadGallery()).toHaveLength(MAX_ENTRIES);
  });
});
