import * as THREE from 'three';
import { clamp, rand } from './utils.js';

/* ============================================================
   Frag grenades + the airstrike barrage.
   ============================================================ */

const GRAVITY = 22;
const GROUND_Y = 0.09;

export class GrenadeManager {
  constructor(scene, effects, audio, world) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.world = world;

    this.items = [];
    this.strikes = [];
    this.playerPos = new THREE.Vector3();

    this.geo = new THREE.SphereGeometry(0.08, 10, 8);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x37402e, roughness: 0.68, metalness: 0.35,
      emissive: 0xff4a10, emissiveIntensity: 0.0,
    });
    this.mat = this.mat.clone();

    this.onExplode = null;
  }

  throwFrom(pos, dir, power = 1) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const vel = dir.clone().normalize().multiplyScalar(15 * power);
    vel.y += 3.4;
    vel.x += rand(-0.7, 0.7);
    vel.z += rand(-0.7, 0.7);

    this.items.push({
      mesh, vel, fuse: 2.35, spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
      bounces: 0,
    });
    if (this.audio) this.audio.toss();
  }

  /* Six bomb runs walk across a target point, CoD style. */
  airstrike(center) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 3.1;
      const tx = center.x + rand(-1.6, 1.6) + off * 0.55;
      const tz = center.z + rand(-1.6, 1.6) + off;
      this.strikes.push({
        t: 0.55 + i * 0.22,
        pos: new THREE.Vector3(tx, 0, tz),
      });
    }
    if (this.audio) this.audio.airstrike();
  }

  _explode(pos, scale = 1.5, label = 'FRAG') {
    this.effects.explosion(pos, scale);
    if (this.audio) {
      const d = Math.hypot(pos.x - this.playerPos.x, pos.z - this.playerPos.z);
      this.audio.explosion(d, scale * 0.85);
    }
    this.onExplode?.(pos, scale, label);
  }

  update(dt, player) {
    this.playerPos = player.pos;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const g = this.items[i];
      g.fuse -= dt;

      if (g.fuse < 0.6) {
        g.mesh.material.emissiveIntensity = 0.6 + Math.sin(g.fuse * 55) * 0.5;
      }

      g.vel.y -= GRAVITY * dt;
      const p = g.mesh.position;
      p.addScaledVector(g.vel, dt);

      if (p.y < GROUND_Y) {
        p.y = GROUND_Y;
        if (g.vel.y < -1.2 && this.audio) this.audio.bounce(p.distanceTo(player.pos));
        g.vel.y *= -0.42;
        g.vel.x *= 0.62;
        g.vel.z *= 0.62;
        g.spin.multiplyScalar(0.55);
        g.bounces++;
      }

      // Cheap AABB bounce off props.
      for (const b of this.world.colliders) {
        if (p.x > b.min.x - 0.1 && p.x < b.max.x + 0.1 &&
            p.z > b.min.z - 0.1 && p.z < b.max.z + 0.1 &&
            p.y > b.min.y - 0.1 && p.y < b.max.y + 0.1) {
          const dl = Math.abs(p.x - b.min.x), dr = Math.abs(b.max.x - p.x);
          const db = Math.abs(p.z - b.min.z), df = Math.abs(b.max.z - p.z);
          const m = Math.min(dl, dr, db, df);
          if (m === dl) { p.x = b.min.x - 0.1; g.vel.x = -Math.abs(g.vel.x) * 0.45; }
          else if (m === dr) { p.x = b.max.x + 0.1; g.vel.x = Math.abs(g.vel.x) * 0.45; }
          else if (m === db) { p.z = b.min.z - 0.1; g.vel.z = -Math.abs(g.vel.z) * 0.45; }
          else { p.z = b.max.z + 0.1; g.vel.z = Math.abs(g.vel.z) * 0.45; }
          break;
        }
      }

      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      g.mesh.rotation.z += g.spin.z * dt;

      if (g.fuse <= 0) {
        this._explode(p.clone(), 1.5);
        this.scene.remove(g.mesh);
        this.items.splice(i, 1);
      }
    }

    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (s.t <= 0) {
        this._explode(s.pos, 1.9, 'AIRSTRIKE');
        this.strikes.splice(i, 1);
      }
    }
  }

  get active() {
    return this.items.length + this.strikes.length;
  }

  clear() {
    for (const g of this.items) this.scene.remove(g.mesh);
    this.items = [];
    this.strikes = [];
  }
}
