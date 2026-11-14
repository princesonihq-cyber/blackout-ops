import * as THREE from 'three';
import { rand, clamp } from './utils.js';

/* ============================================================
   Tracers, impacts, muzzle flashes, decals, spawn pulses.
   ============================================================ */

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,245,1)');
  g.addColorStop(0.18, 'rgba(255,214,140,0.95)');
  g.addColorStop(0.45, 'rgba(255,140,40,0.45)');
  g.addColorStop(1, 'rgba(255,90,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softTexture(inner, outer, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, '0.28)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.quality = opts.scale || 1;
    this.glowTex = glowTexture();
    this.smokeTex = softTexture('rgba(190,200,210,0.7)', 'rgba(190,200,210,0)');
    this.bloodTex = softTexture('rgba(150,12,8,0.9)', 'rgba(90,0,0,0)');

    this.tracerGeo = new THREE.CylinderGeometry(0.013, 0.013, 1, 5, 1, true);
    this.sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffb35c, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.decalGeo = new THREE.CircleGeometry(0.055, 7);
    this.ringGeo = new THREE.RingGeometry(0.35, 0.5, 28);
    this.casingGeo = new THREE.BoxGeometry(0.016, 0.016, 0.042);
    this.casingMat = new THREE.MeshBasicMaterial({ color: 0xc7a15a, fog: false });

    this.tracers = [];
    this.sparks = [];
    this.flashes = [];
    this.decals = [];
    this.rings = [];
    this.smokes = [];
    this.casings = [];

    this.muzzleLight = new THREE.PointLight(0xffbb77, 0, 9, 2);
    this.scene.add(this.muzzleLight);
    this.muzzleLight.position.set(0, 1, 0);

    this.boomLight = new THREE.PointLight(0xffa040, 0, 34, 2);
    this.scene.add(this.boomLight);

    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
  }

  tracer(from, to, color = 0xffd28a) {
    this._tmpA.copy(to).sub(from);
    const len = this._tmpA.length();
    if (len < 0.05) return;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    mesh.position.copy(from).addScaledVector(this._tmpA, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, this._tmpA.clone().normalize());
    mesh.scale.set(1, len, 1);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.tracers.push({ mesh, mat, life: 0.055, max: 0.055 });
    if (this.tracers.length > 80) {
      const old = this.tracers.shift();
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
  }

  muzzleFlash(pos, scale = 1, warm = true) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: warm ? 0xffc27a : 0xff8a55,
      transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.setScalar(0.55 * scale);
    this.scene.add(sprite);
    this.flashes.push({ sprite, mat, life: 0.05, max: 0.05, grow: 0.35 * scale });

    if (warm) {
      this.muzzleLight.position.copy(pos);
      this.muzzleLight.intensity = 38 * scale;
    }
  }

  sparkBurst(point, normal, color = 0xffb35c, count = 6, force = 5) {
    const n = Math.max(2, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const mat = this.sparkMat.clone();
      mat.color.setHex(color);
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(point);
      const vel = normal.clone().multiplyScalar(rand(0.5, 1) * force);
      vel.x += rand(-2.2, 2.2);
      vel.y += rand(-1, 2.6);
      vel.z += rand(-2.2, 2.2);
      const life = rand(0.18, 0.42);
      this.scene.add(mesh);
      this.sparks.push({ mesh, mat, vel, life, max: life });
    }
    if (this.sparks.length > 260) {
      const cap = this.quality < 0.7 ? 120 : 260;
      const old = this.sparks.splice(0, this.sparks.length - cap);
      for (const s of old) { this.scene.remove(s.mesh); s.mat.dispose(); }
    }
  }

  casing(pos, right, up) {
    const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
    mesh.position.copy(pos);
    const vel = new THREE.Vector3(
      right.x * rand(1.8, 3.2) + rand(-0.4, 0.4),
      rand(1.4, 2.6),
      right.z * rand(1.8, 3.2) + rand(-0.4, 0.4)
    );
    vel.x += up.x * 0.4;
    mesh.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    this.scene.add(mesh);
    this.casings.push({
      mesh, vel, life: 2.6, max: 2.6,
      spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
    });
    if (this.casings.length > 40) {
      const old = this.casings.shift();
      this.scene.remove(old.mesh);
    }
  }

  gunSmoke(pos, dir) {
    const mat = new THREE.SpriteMaterial({
      map: this.smokeTex, color: 0xa9b3bd,
      transparent: true, opacity: 0.28, depthWrite: false,
      blending: THREE.NormalBlending, fog: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos).addScaledVector(dir, rand(0.05, 0.25));
    sprite.scale.setScalar(rand(0.16, 0.3));
    this.scene.add(sprite);
    this.smokes.push({
      sprite, mat, life: rand(0.5, 0.9), max: 0.9,
      rise: rand(0.25, 0.7), grow: rand(0.5, 1.1), spin: 0,
    });
    while (this.smokes.length > 46) {
      const old = this.smokes.shift();
      this.scene.remove(old.sprite);
      old.mat.dispose();
    }
  }

  blood(point, dir) {
    this.sparkBurst(point, dir, 0x8e120c, 7, 3.2);
    const mat = new THREE.SpriteMaterial({
      map: this.bloodTex, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.NormalBlending, fog: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(point);
    sprite.scale.setScalar(rand(0.24, 0.4));
    this.scene.add(sprite);
    this.flashes.push({ sprite, mat, life: 0.18, max: 0.18, grow: 0.25 });
  }

  explosion(pos, scale = 1) {
    const flashMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffd28a,
      transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    const flash = new THREE.Sprite(flashMat);
    flash.position.copy(pos);
    flash.position.y += 0.35;
    flash.scale.setScalar(1.6 * scale);
    this.scene.add(flash);
    this.flashes.push({ sprite: flash, mat: flashMat, life: 0.16, max: 0.16, grow: 4.2 * scale });

    this.sparkBurst(pos, new THREE.Vector3(0, 1, 0), 0xffb050, Math.round(16 * scale), 9 * scale);

    for (let i = 0; i < Math.max(2, Math.round(4 * scale * this.quality)); i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.smokeTex, color: 0x6b6f75,
        transparent: true, opacity: 0.5, depthWrite: false,
        blending: THREE.NormalBlending, fog: true,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      s.position.x += rand(-0.8, 0.8) * scale;
      s.position.z += rand(-0.8, 0.8) * scale;
      s.position.y += rand(0.2, 1.2);
      s.scale.setScalar(rand(0.5, 1.1) * scale);
      this.scene.add(s);
      this.smokes.push({
        sprite: s, mat, life: rand(1.2, 2.2), max: 2.2,
        rise: rand(0.6, 1.5), grow: rand(1.4, 2.4), spin: 0,
      });
    }

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffc070, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y = 0.08;
    ring.scale.setScalar(1.6);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, mat: ringMat, life: 0.55, max: 0.55 });

    this.boomLight.position.copy(pos);
    this.boomLight.position.y += 0.8;
    this.boomLight.intensity = 90 * scale;
  }

  impact(point, normal, enemy = false) {
    const n = normal ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    if (enemy) {
      this.blood(point, n);
      return;
    }
    this.sparkBurst(point, n, 0xffb35c, 6, 5);

    const mat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffcf8a,
      transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(point).addScaledVector(n, 0.05);
    sprite.scale.setScalar(0.22);
    this.scene.add(sprite);
    this.flashes.push({ sprite, mat, life: 0.055, max: 0.055, grow: 0.1 });

    if (Math.random() < 0.55) this.gunSmoke(point, n);
    this.decal(point, n);
  }

  decal(point, normal) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x070707, transparent: true, opacity: 0.82,
      depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(this.decalGeo, mat);
    mesh.position.copy(point).addScaledVector(normal, 0.012);
    mesh.quaternion.setFromUnitVectors(FWD, normal.clone().normalize());
    mesh.rotateZ(rand(0, Math.PI * 2));
    this.scene.add(mesh);
    this.decals.push({ mesh, mat, life: 16, max: 16 });
    if (this.decals.length > 80) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
  }

  spawnPulse(pos) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3b2a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.05, pos.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, mat, life: 0.6, max: 0.6 });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mat.opacity = clamp(t.life / t.max, 0, 1) * 0.85;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mat.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mat.dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      s.vel.y -= 10 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const k = clamp(s.life / s.max, 0, 1);
      s.mesh.scale.setScalar(0.4 + k * 0.8);
      s.mat.opacity = k;
      if (s.mesh.position.y < 0.02) { s.mesh.position.y = 0.02; s.vel.y *= -0.32; s.vel.x *= 0.6; s.vel.z *= 0.6; }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        f.mat.dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.life / f.max;
      f.mat.opacity = k * 0.95;
      f.sprite.scale.setScalar(f.sprite.scale.x + f.grow * dt * 3);
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < 2.5) d.mat.opacity = Math.max(0, d.life / 2.5) * 0.82;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mat.dispose();
        this.decals.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mat.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(1 + k * 5);
      r.mat.opacity = (1 - k) * 0.9;
    }

    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.sprite);
        s.mat.dispose();
        this.smokes.splice(i, 1);
        continue;
      }
      const k = s.life / s.max;
      s.sprite.position.y += s.rise * dt;
      s.sprite.scale.setScalar(s.sprite.scale.x + s.grow * dt);
      s.mat.opacity = k * 0.34;
      s.mat.rotation += dt * 0.25;
    }

    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.casings.splice(i, 1);
        continue;
      }
      c.vel.y -= 11 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.mesh.position.y < 0.03) {
        c.mesh.position.y = 0.03;
        c.vel.y *= -0.32;
        c.vel.x *= 0.55;
        c.vel.z *= 0.55;
        c.spin.multiplyScalar(0.5);
      }
    }

    if (this.muzzleLight.intensity > 0) {
      this.muzzleLight.intensity *= Math.exp(-dt * 42);
      if (this.muzzleLight.intensity < 0.5) this.muzzleLight.intensity = 0;
    }
    if (this.boomLight.intensity > 0) {
      this.boomLight.intensity *= Math.exp(-dt * 7);
      if (this.boomLight.intensity < 0.6) this.boomLight.intensity = 0;
    }
  }

  clear() {
    for (const t of this.tracers) { this.scene.remove(t.mesh); t.mat.dispose(); }
    for (const s of this.sparks) { this.scene.remove(s.mesh); s.mat.dispose(); }
    for (const f of this.flashes) { this.scene.remove(f.sprite); f.mat.dispose(); }
    for (const d of this.decals) { this.scene.remove(d.mesh); d.mat.dispose(); }
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mat.dispose(); }
    for (const s of this.smokes) { this.scene.remove(s.sprite); s.mat.dispose(); }
    for (const c of this.casings) this.scene.remove(c.mesh);
    this.tracers = []; this.sparks = []; this.flashes = []; this.decals = []; this.rings = [];
    this.smokes = []; this.casings = [];
    this.muzzleLight.intensity = 0;
    this.boomLight.intensity = 0;
  }
}
