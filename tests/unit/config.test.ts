import { describe, it, expect, afterEach } from 'vitest';
import { getConfig, isMobile, lowerTierFor, TIERS } from '../../src/sim/config';

function stubScreen(width: number): void {
  Object.defineProperty(window.screen, 'width', { value: width, configurable: true, writable: true });
}

function stubTouch(points: number): void {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: points, configurable: true, writable: true });
}

afterEach(() => {
  stubScreen(1440);
  stubTouch(0);
});

describe('isMobile()', () => {
  it('returns false on desktop (no touch, wide screen)', () => {
    stubTouch(0);
    stubScreen(1440);
    expect(isMobile()).toBe(false);
  });

  it('returns false when touch present but screen is wide (Retina Mac)', () => {
    stubTouch(2);
    stubScreen(1440);
    expect(isMobile()).toBe(false);
  });

  it('returns false when screen is narrow but no touch points', () => {
    stubTouch(0);
    stubScreen(375);
    expect(isMobile()).toBe(false);
  });

  it('returns true when touch present AND screen is narrow', () => {
    stubTouch(5);
    stubScreen(375);
    expect(isMobile()).toBe(true);
  });

  it('treats screen.width === 768 as desktop (boundary)', () => {
    stubTouch(1);
    stubScreen(768);
    expect(isMobile()).toBe(false);
  });
});

describe('getConfig()', () => {
  it('returns desktop config by default', () => {
    stubTouch(0);
    stubScreen(1440);
    const cfg = getConfig();
    expect(cfg.resolution).toBe(512);
    expect(cfg.jacobiIterations).toBe(40);
    expect(cfg.dt).toBeCloseTo(1 / 60);
  });

  it('returns mobile config on narrow touch device', () => {
    stubTouch(5);
    stubScreen(375);
    const cfg = getConfig();
    expect(cfg.resolution).toBe(256);
    expect(cfg.jacobiIterations).toBe(20);
  });

  it('mobile config inherits dt and frameCapMs from desktop', () => {
    stubTouch(5);
    stubScreen(375);
    const cfg = getConfig();
    expect(cfg.dt).toBeCloseTo(1 / 60);
    expect(cfg.frameCapMs).toBe(100);
  });
});

describe('lowerTierFor()', () => {
  it('TIERS is ordered high → low by resolution', () => {
    expect(TIERS.map((t) => t.resolution)).toEqual([768, 512, 256]);
  });

  it('steps HIGH → MID → LOW', () => {
    expect(lowerTierFor(768)?.resolution).toBe(512);
    expect(lowerTierFor(512)?.resolution).toBe(256);
  });

  it('returns null at the floor (LOW cannot downgrade)', () => {
    expect(lowerTierFor(256)).toBeNull();
  });

  it('returns null for an unknown resolution', () => {
    expect(lowerTierFor(1024)).toBeNull();
  });

  it('the next tier carries its own matching jacobi count', () => {
    expect(lowerTierFor(512)?.jacobiIterations).toBe(20); // LOW
    expect(lowerTierFor(768)?.jacobiIterations).toBe(40); // MID
  });
});
