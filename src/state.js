export const palette = [
  0xff9999,
  0xffcc99,
  0xffff99,
  0xccff99,
  0x99ccff
];

export const ranges = {
  scaleX: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  scaleY: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  scaleZ: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  striations: { min: 3, max: 15, step: 1, default: 7 },
  noiseIntensity: { min: 0, max: 30, step: 1, default: 10 },
  baseScale: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  doorHeightOffset: { min: 0.0, max: 1.0, step: 0.05, default: 0.7 },
  columnCount: { min: 2, max: 10, step: 1, default: 4 },
  visibleTiers: { min: 1, max: 15, step: 1, default: 15 },
  wallThickness: { min: 40, max: 200, step: 5, default: 80 },
  wallSpacing: { min: 150, max: 800, step: 10, default: 600 },
  innerWalls: { min: 0, max: 3, step: 1, default: 1 }
};

export const defaultState = Object.fromEntries(
  Object.entries(ranges).map(([key, cfg]) => [key, cfg.default])
);

export function clampState(state) {
  const next = { ...defaultState };
  for (const [key, cfg] of Object.entries(ranges)) {
    const value = state[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = Math.min(cfg.max, Math.max(cfg.min, value));
    }
  }
  return next;
}
