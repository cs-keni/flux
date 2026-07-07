import { describe, it, expect } from 'vitest';
import { parseShareHash, buildShareHash, sequenceIndexByName } from '../../src/share/shareLink';
import { PALETTES } from '../../src/sim/config';
import { SEQUENCES } from '../../src/autopilot/sequences';

describe('parseShareHash()', () => {
  it('parses a valid palette + sequence', () => {
    expect(parseShareHash('#p=3&s=enso')).toEqual({ palette: 3, sequence: 'enso' });
  });

  it('tolerates a missing leading #', () => {
    expect(parseShareHash('p=1&s=wave')).toEqual({ palette: 1, sequence: 'wave' });
  });

  it('returns empty for an empty hash', () => {
    expect(parseShareHash('')).toEqual({});
    expect(parseShareHash('#')).toEqual({});
  });

  it('drops an out-of-range palette index', () => {
    expect(parseShareHash(`#p=${PALETTES.length}`)).toEqual({});
    expect(parseShareHash('#p=-1')).toEqual({});
  });

  it('drops a non-integer palette index', () => {
    expect(parseShareHash('#p=2.5')).toEqual({});
    expect(parseShareHash('#p=abc')).toEqual({});
  });

  it('drops an unknown sequence name but keeps a valid palette', () => {
    expect(parseShareHash('#p=2&s=dragon')).toEqual({ palette: 2 });
  });

  it('is case-insensitive on the sequence name', () => {
    expect(parseShareHash('#s=ENSO')).toEqual({ sequence: 'enso' });
  });

  it('accepts the last palette index (boundary)', () => {
    const last = PALETTES.length - 1;
    expect(parseShareHash(`#p=${last}`)).toEqual({ palette: last });
  });
});

describe('buildShareHash()', () => {
  it('encodes palette + sequence', () => {
    expect(buildShareHash(3, 'enso')).toBe('#p=3&s=enso');
  });

  it('omits the sequence when null or undefined', () => {
    expect(buildShareHash(0, null)).toBe('#p=0');
    expect(buildShareHash(0)).toBe('#p=0');
  });

  it('round-trips through parseShareHash', () => {
    const hash = buildShareHash(4, 'mountain');
    expect(parseShareHash(hash)).toEqual({ palette: 4, sequence: 'mountain' });
  });
});

describe('sequenceIndexByName()', () => {
  it('finds a known sequence by name', () => {
    expect(sequenceIndexByName('branch')).toBe(0);
    expect(SEQUENCES[sequenceIndexByName('enso')].name).toBe('enso');
  });

  it('is case-insensitive', () => {
    expect(sequenceIndexByName('WAVE')).toBe(sequenceIndexByName('wave'));
  });

  it('returns -1 for an unknown name', () => {
    expect(sequenceIndexByName('dragon')).toBe(-1);
  });
});
