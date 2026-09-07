export const FINGER = {
  WRIST: 0, THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
};

export const FINGERS = [
  { name: 'thumb', tips: [FINGER.THUMB_TIP], mcps: FINGER.THUMB_CMC, pips: [FINGER.THUMB_IP] },
  { name: 'index', tips: [FINGER.INDEX_TIP], mcps: FINGER.INDEX_MCP, pips: [FINGER.INDEX_PIP] },
  { name: 'middle', tips: [FINGER.MIDDLE_TIP], mcps: FINGER.MIDDLE_MCP, pips: [FINGER.MIDDLE_PIP] },
  { name: 'ring', tips: [FINGER.RING_TIP], mcps: FINGER.RING_MCP, pips: [FINGER.RING_PIP] },
  { name: 'pinky', tips: [FINGER.PINKY_TIP], mcps: FINGER.PINKY_MCP, pips: [FINGER.PINKY_PIP] }
];

export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

const d2 = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y), (a.z - b.z || 0) * 0.35);

/** Palm size reference used to normalise every threshold (metres-ish / image units). */
export function handSpan(lm) {
  const wrist = lm[FINGER.WRIST], mid = lm[FINGER.MIDDLE_MCP];
  const pinky = lm[FINGER.PINKY_MCP], index = lm[FINGER.INDEX_MCP];
  const a = Math.hypot(mid.x - wrist.x, mid.y - wrist.y);
  const b = Math.hypot(pinky.x - index.x, pinky.y - index.y);
  return Math.max(0.02, Math.min(a, 1) * 0.55 + b * 0.85);
}

/** Extension test: tip farther from the wrist than the PIP => finger is open. */
export function fingerExtensions(lm, span) {
  const wrist = lm[FINGER.WRIST];
  const out = [];
  for (const f of FINGERS) {
    const tip = lm[f.tips[0]];
    const pip = lm[f.pips[0]];
    const mcp = lm[f.mcps];
    const dt = d2(tip, wrist);
    const dp = d2(pip, wrist);
    const curl = (dt - dp) / span;
    const spread = d2(tip, mcp) / span;
    out.push({ name: f.name, extended: f.name === 'thumb' ? curl > 0.16 : curl > 0.1, curl, spread, tip, pip, mcp });
  }
  return out;
}

export function pinchGap(lm) {
  return d2(lm[FINGER.THUMB_TIP], lm[FINGER.INDEX_TIP]) / handSpan(lm);
}

/** Hysteresis helper so a click doesn't chatter at the threshold. */
export function gate(value, onAt, offAt, was) {
  if (!was && value < onAt) return true;
  if (was && value > offAt) return false;
  return was;
}

/**
 * Full gesture state for one hand.
 * Returns { pinch, pinchAmount, grab, point, open, peace, thumbUp, fingers[], velocity, stability }
 */
export function classify(prev, lm, wlm, settingsVals) {
  const span = handSpan(lm);
  const fingers = fingerExtensions(lm, span);
  const gap = pinchGap(lm);
  const pinchAmount = clamp01(1 - (gap - 0.02) / Math.max(0.05, settingsVals.pinchThreshold * 2));
  const wasPinch = prev?.pinch ?? false;
  const pinch = gate(gap, settingsVals.pinchThreshold, settingsVals.pinchRelease, wasPinch);
  const openCount = fingers.filter((f) => f.extended).length;
  const extended = fingers.filter((f) => f.extended).map((f) => f.name);

  const grab = !pinch && openCount <= 1 && fingers.slice(1).every((f) => f.curl < 0.02);
  const point = fingers[1].extended && !fingers[2].extended && !fingers[3].extended && !fingers[4].extended;
  const open = openCount >= 4;
  const peace = fingers[1].extended && fingers[2].extended && !fingers[3].extended && !fingers[4].extended;
  const thumbUp = fingers[0].extended && openCount === 1 && Math.abs(lm[FINGER.THUMB_TIP].y - lm[FINGER.THUMB_CMC].y) > span * 0.5;
  const okSign = fingers[0].extended && fingers[1].extended && openCount === 2 && !fingers[2].extended;

  // motion estimate for swipe detection / inertia
  const tip = lm[FINGER.INDEX_TIP];
  const vel = prev ? { x: tip.x - prev.tipX, y: tip.y - prev.tipY, t: (performance.now() - prev.t) / 1000 } : { x: 0, y: 0, t: 0.016 };
  const speed = Math.hypot(vel.x, vel.y) / Math.max(0.008, vel.t);

  // palm normal from the landmark plane (used to place the 3D aura)
  const n = normalFrom(lm);

  return {
    pinch, pinchAmount, gap, grab, point, open, peace, thumbUp, okSign, span, fingers, extended,
    tipX: tip.x, tipY: tip.y, tip, velocity: vel, speed, normal: n, t: performance.now(),
    center: centroid(lm), palm: lm[FINGER.MIDDLE_MCP], world: wlm
  };
}

export function centroid(lm) {
  let x = 0, y = 0, z = 0;
  const mcpIdx = [FINGER.WRIST, FINGER.INDEX_MCP, FINGER.MIDDLE_MCP, FINGER.RING_MCP, FINGER.PINKY_MCP];
  for (const i of mcpIdx) { x += lm[i].x; y += lm[i].y; z += lm[i].z || 0; }
  const n = mcpIdx.length;
  return { x: x / n, y: y / n, z: z / n };
}

function normalFrom(lm) {
  const a = [lm[FINGER.INDEX_MCP].x - lm[FINGER.PINKY_MCP].x, lm[FINGER.INDEX_MCP].y - lm[FINGER.PINKY_MCP].y, (lm[FINGER.INDEX_MCP].z || 0) - (lm[FINGER.PINKY_MCP].z || 0)];
  const b = [lm[FINGER.MIDDLE_MCP].x - lm[FINGER.WRIST].x, lm[FINGER.MIDDLE_MCP].y - lm[FINGER.WRIST].y, (lm[FINGER.MIDDLE_MCP].z || 0) - (lm[FINGER.WRIST].z || 0)];
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = Math.hypot(...n) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Convex hull (Andrew monotone chain) on the projected landmark set — this is the
 * silhouette we wrap the glowing contour around.
 */
export function convexHull(points) {
  if (points.length < 4) return points.slice();
  const pts = points.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Catmull-Rom on a closed polyline → smooth organic outline. */
export function smoothClosedLoop(pts, samples = 88) {
  const n = pts.length;
  if (n < 3) return pts;
  const out = [];
  const at = (i) => pts[(i + n) % n];
  const total = n;
  for (let s = 0; s < samples; s++) {
    const f = (s / samples) * total;
    const i = Math.floor(f);
    const t = f - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    out.push([
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t * t + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t * t * t),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t * t + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t * t * t)
    ]);
  }
  return out;
}

/** Push a closed 2D outline outward along its local normal (uniform padding). */
export function offsetLoop(pts, pad, center) {
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const tx = next[0] - prev[0], ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len, ny = -tx / len;
    // ensure the normal points away from the centroid
    const dirx = p[0] - center[0], diry = p[1] - center[1];
    const s = nx * dirx + ny * diry >= 0 ? 1 : -1;
    return [p[0] + nx * pad * s, p[1] + ny * pad * s];
  });
}
