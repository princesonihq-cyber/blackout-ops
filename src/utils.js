import * as THREE from 'three';

/* ============================================================
   Small math / physics helpers
   ============================================================ */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Shortest signed angle from a to b. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(a, b, lambda, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

/** Axis-separated 2D collision against a list of THREE.Box3. Mutates `pos`. */
export function moveWithCollisions(pos, dx, dz, radius, colliders) {
  pos.x += dx;
  if (hitsAny(pos, radius, colliders)) pos.x -= dx;
  pos.z += dz;
  if (hitsAny(pos, radius, colliders)) pos.z -= dz;
}

function hitsAny(pos, r, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (pos.x + r > b.min.x && pos.x - r < b.max.x &&
        pos.z + r > b.min.z && pos.z - r < b.max.z) {
      return true;
    }
  }
  return false;
}

const _rc = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** True when nothing in `solids` blocks the segment from -> to. */
export function hasLineOfSight(from, to, solids) {
  _from.copy(from);
  _dir.copy(to).sub(from);
  const dist = _dir.length();
  if (dist < 0.001) return true;
  _dir.divideScalar(dist);
  _rc.set(_from, _dir);
  _rc.near = 0.05;
  _rc.far = dist - 0.15;
  const hits = _rc.intersectObjects(solids, false);
  return hits.length === 0;
}

/** Random point inside a cone of `radius` radians around `dir`. */
export function coneSpread(dir, right, up, radius) {
  // Uniform-ish disc sample for a believable shot pattern.
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  const out = dir.clone();
  out.addScaledVector(right, Math.cos(a) * r);
  out.addScaledVector(up, Math.sin(a) * r);
  return out.normalize();
}
