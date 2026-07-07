// Shareable-link state <-> URL hash.
//
// The hash encodes two pieces of viewer state so a link reproduces what the
// sender is looking at:
//   p = palette index   (0 .. PALETTES.length-1)
//   s = auto-pilot name  (a SEQUENCES[].name, e.g. "enso")
//
// e.g.  https://flux.example/#p=3&s=enso
//
// Parsing is defensive: unknown or out-of-range values are dropped, never
// thrown. A hand-edited or stale link degrades to "apply what's valid, ignore
// the rest" rather than breaking the canvas.

import { PALETTES } from '../sim/config';
import { SEQUENCES } from '../autopilot/sequences';

export interface ShareParams {
  palette?: number;   // validated index into PALETTES
  sequence?: string;  // validated (lowercase) SEQUENCES name
}

// Parse a location.hash ("#p=3&s=enso" or "p=3&s=enso") into validated params.
export function parseShareHash(hash: string): ShareParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const result: ShareParams = {};
  if (!raw) return result;

  const params = new URLSearchParams(raw);

  const p = params.get('p');
  if (p !== null && p.trim() !== '') {
    const idx = Number(p);
    if (Number.isInteger(idx) && idx >= 0 && idx < PALETTES.length) {
      result.palette = idx;
    }
  }

  const s = params.get('s');
  if (s !== null) {
    const name = s.toLowerCase();
    if (SEQUENCES.some((seq) => seq.name === name)) {
      result.sequence = name;
    }
  }

  return result;
}

// Build a "#p=3&s=enso" fragment from current state. Sequence is omitted when
// none has played yet (link is just a palette).
export function buildShareHash(palette: number, sequence?: string | null): string {
  const params = new URLSearchParams();
  params.set('p', String(palette));
  if (sequence) params.set('s', sequence);
  return '#' + params.toString();
}

// Index into SEQUENCES for a given name, or -1 if unknown.
export function sequenceIndexByName(name: string): number {
  return SEQUENCES.findIndex((seq) => seq.name === name.toLowerCase());
}
