export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function hypot(x, y) {
  return Math.hypot(x, y);
}

export function normalize(x, y) {
  const m = Math.hypot(x, y);
  if (m < 1e-6) return { x: 0, y: 0, m: 0 };
  return { x: x / m, y: y / m, m };
}

export function angleOf(x, y) {
  return Math.atan2(y, x);
}

export function wrapAngle(a) {
  while (a < -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

export function damp(current, target, lambda, dt) {
  // Exponential smoothing: stable across FPS.
  const t = 1 - Math.exp(-lambda * dt);
  return lerp(current, target, t);
}

export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

export function approach(v, target, delta) {
  if (v < target) return Math.min(target, v + delta);
  return Math.max(target, v - delta);
}

export function formatScore(n) {
  return Math.floor(n).toString();
}

export function nowMs() {
  return performance.now();
}

