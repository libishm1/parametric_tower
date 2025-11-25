export const palette = [
  0xff9999,
  0xffcc99,
  0xffff99,
  0xccff99,
  0x99ccff
];

// Default stepped plan/profile for each tower tier. Can be edited at runtime.
export const defaultProfile = [
  [29.746287, 17.357673],
  [29.746287, 20.080446],
  [22.735149, 20.080446],
  [22.735149, 22.122525],
  [-21.305693, 22.122525],
  [-21.305693, 20.080446],
  [-28.316830, 20.080446],
  [-28.316830, 17.357673],
  [-31.039602, 17.357673],
  [-31.039602, -17.357673],
  [-28.316830, -17.357673],
  [-28.316830, -20.080446],
  [-21.305693, -20.080446],
  [-21.305693, -22.122525],
  [22.735149, -22.122525],
  [22.735149, -20.080446],
  [29.746287, -20.080446],
  [29.746287, -17.357673],
  [32.469059, -17.357673],
  [32.469059, 17.357673],
  [29.746287, 17.357673],
  [29.746287, 20.080446],
  [22.735149, 20.080446],
  [22.735149, 22.122525],
  [-21.305693, 22.122525],
  [-21.305693, 20.080446],
  [-28.316830, 20.080446],
  [-28.316830, 17.357673],
  [-31.039602, 17.357673]
];

export function cloneProfile(points = defaultProfile) {
  return points.map(p => {
    if (Array.isArray(p)) return { x: p[0], y: p[1] };
    return { x: p.x, y: p.y };
  });
}

export const ranges = {
  scaleX: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  scaleY: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  scaleZ: { min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
  striations: { min: 3, max: 15, step: 1, default: 12 },
  noiseIntensity: { min: 0, max: 30, step: 1, default: 14 },
  baseScale: { min: 0.5, max: 2.0, step: 0.1, default: 1.2 },
  doorHeightOffset: { min: 0.0, max: 1.0, step: 0.05, default: 0.55 },
  columnCount: { min: 2, max: 10, step: 1, default: 8 },
  visibleTiers: { min: 1, max: 15, step: 1, default: 15 },
  wallThickness: { min: 40, max: 200, step: 5, default: 40 },
  wallSpacing: { min: 150, max: 800, step: 10, default: 600 },
  innerWalls: { min: 0, max: 3, step: 1, default: 1 },
  shrineProtrude: { min: 0, max: 0.5, step: 0.01, default: 0.125 },
  shrineColorIndex: { min: 0, max: 4, step: 1, default: 0 },
  lodNear: { min: 300, max: 2000, step: 50, default: 1250 },
  lodFar: { min: 700, max: 3000, step: 50, default: 2500 },
  beadEnabled: { min: 0, max: 1, step: 1, default: 0 },
  beadDistance: { min: 200, max: 2000, step: 50, default: 700 }
};

export const defaultState = Object.fromEntries(
  Object.entries(ranges).map(([key, cfg]) => [key, cfg.default])
);
// Attach default profile so it persists through rebuilds.
defaultState.profilePoints = cloneProfile();

export function clampState(state) {
  const next = { ...defaultState };
  for (const [key, cfg] of Object.entries(ranges)) {
    const value = state[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = Math.min(cfg.max, Math.max(cfg.min, value));
    }
  }
  next.profilePoints = cloneProfile(state.profilePoints ?? defaultProfile);
  return next;
}
