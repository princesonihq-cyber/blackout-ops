import * as THREE from 'three';
import { clamp, damp, coneSpread, rand } from './utils.js';

/* ============================================================
   Weapons, viewmodels, hitscan, recoil, reloads.
   ============================================================ */

const DEFS = [
  {
    id: 'rifle', name: 'M4A1 VANGUARD', short: 'M4A1', kind: 'rifle',
    auto: true, damage: 26, headMult: 2.6, rpm: 720,
    magSize: 30, startReserve: 180, reserveMax: 300,
    spreadHip: 0.016, spreadAds: 0.0028, spreadMove: 0.012, spreadAir: 0.055,
    recoilPitch: 0.013, recoilYaw: 0.0042,
    reloadTime: 2.05, adsFov: 52, range: 140,
    falloffStart: 34, minDamage: 0.62,
    pellets: 1, sound: 'rifle',
    hipPos: [0.255, -0.225, -0.45], adsPos: [0, -0.128, -0.35],
  },
  {
    id: 'shotgun', name: 'SPAS-12 BREACHER', short: 'SPAS-12', kind: 'shotgun',
    auto: false, damage: 15, headMult: 1.8, rpm: 90,
    magSize: 7, startReserve: 42, reserveMax: 70,
    spreadHip: 0.072, spreadAds: 0.055, spreadMove: 0.012, spreadAir: 0.05,
    recoilPitch: 0.03, recoilYaw: 0.012,
    reloadTime: 2.85, adsFov: 62, range: 55,
    falloffStart: 7, minDamage: 0.3,
    pellets: 9, sound: 'shotgun', pump: true,
    hipPos: [0.26, -0.24, -0.5], adsPos: [0, -0.068, -0.42],
  },
  {
    id: 'pistol', name: 'M9 SIDEARM', short: 'M9', kind: 'pistol',
    auto: false, damage: 36, headMult: 2.4, rpm: 380,
    magSize: 15, startReserve: 90, reserveMax: 160,
    spreadHip: 0.013, spreadAds: 0.0024, spreadMove: 0.014, spreadAir: 0.05,
    recoilPitch: 0.011, recoilYaw: 0.004,
    reloadTime: 1.65, adsFov: 60, range: 90,
    falloffStart: 24, minDamage: 0.6,
    pellets: 1, sound: 'pistol',
    hipPos: [0.225, -0.205, -0.4], adsPos: [0, -0.073, -0.34],
  },
];

const MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x424850, metalness: 0.82, roughness: 0.28 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24282e, metalness: 0.65, roughness: 0.45 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x2e333a, metalness: 0.2, roughness: 0.8 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x544a3b, metalness: 0.15, roughness: 0.85 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x121417, metalness: 0.08, roughness: 0.95 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x4e555e, metalness: 0.85, roughness: 0.22 }),
  red: new THREE.MeshStandardMaterial({
    color: 0x400505, emissive: 0xff1808, emissiveIntensity: 3.5, roughness: 0.2,
  }),
  lens: new THREE.MeshStandardMaterial({
    color: 0x77b5d9, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.7,
  }),
  reticle: new THREE.MeshBasicMaterial({
    color: 0xff1e00, fog: false, depthWrite: false,
  }),
  tritium: new THREE.MeshBasicMaterial({
    color: 0x39ff58, fog: false, depthWrite: false,
  }),
  fiberOptic: new THREE.MeshBasicMaterial({
    color: 0xff8811, fog: false, depthWrite: false,
  }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

function cylinder(rt, rb, h, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function buildRifle() {
  const g = new THREE.Group();
  g.add(box(0.07, 0.095, 0.26, MAT.poly, 0, 0.005, 0.33));
  g.add(box(0.078, 0.022, 0.3, MAT.dark, 0, 0.062, 0.02));
  g.add(box(0.09, 0.115, 0.36, MAT.metal, 0, 0.005, 0.04));
  g.add(box(0.085, 0.085, 0.32, MAT.poly, 0, 0.005, -0.28));
  g.add(box(0.055, 0.045, 0.3, MAT.accent, 0, 0.02, -0.29));
  g.add(cylinder(0.015, 0.015, 0.34, MAT.dark, 0, 0.015, -0.58));
  g.add(cylinder(0.025, 0.025, 0.075, MAT.metal, 0, 0.015, -0.76));
  g.add(box(0.062, 0.18, 0.1, MAT.dark, 0, -0.12, -0.03, 0.22, 0, 0));
  g.add(box(0.055, 0.13, 0.075, MAT.poly, 0, -0.1, 0.15, 0.28, 0, 0));
  g.add(box(0.05, 0.028, 0.2, MAT.accent, 0, 0.088, -0.06));

  // Rail slots along the handguard.
  for (let i = 0; i < 6; i++) {
    g.add(box(0.06, 0.012, 0.028, MAT.dark, 0, 0.052, -0.14 - i * 0.062));
  }
  // Ejection port, bolt and charging handle.
  g.add(box(0.012, 0.04, 0.09, MAT.accent, 0.048, 0.048, -0.02));
  g.add(box(0.03, 0.014, 0.045, MAT.dark, 0.062, 0.06, 0.04));
  g.add(box(0.016, 0.05, 0.035, MAT.metal, 0.05, 0.045, 0.02));
  // Magazine ribs.
  for (let i = 0; i < 3; i++) {
    g.add(box(0.066, 0.012, 0.1, MAT.metal, 0, -0.052 - i * 0.045, -0.045, 0.22, 0, 0));
  }
  // Stock pad + sling loop.
  g.add(box(0.072, 0.1, 0.035, MAT.dark, 0, 0.008, 0.47));
  g.add(box(0.012, 0.04, 0.018, MAT.metal, -0.038, -0.03, 0.2));

  // Angled foregrip.
  g.add(box(0.045, 0.1, 0.06, MAT.dark, 0, -0.075, -0.4, -0.3, 0, 0));

  // Tactical Reflex Holographic Sight
  const sightHood = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.054, 0.08), MAT.dark);
  sightHood.position.set(0, 0.128, -0.02);
  g.add(sightHood);
  const sightCutout = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.042, 0.085), MAT.dark);
  sightCutout.position.set(0, 0.128, -0.02);

  const sightGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.038), MAT.lens);
  sightGlass.position.set(0, 0.128, -0.02);
  g.add(sightGlass);

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 8, 8), MAT.reticle);
  dot.position.set(0, 0.128, -0.02);
  g.add(dot);
  const reticleRing = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.0145, 18), MAT.reticle);
  reticleRing.position.set(0, 0.128, -0.021);
  g.add(reticleRing);

  g.add(box(0.045, 0.016, 0.07, MAT.dark, 0, 0.098, -0.02));

  g.add(box(0.012, 0.05, 0.012, MAT.dark, 0, 0.1, -0.5));
  g.add(box(0.02, 0.015, 0.05, MAT.dark, 0, 0.035, 0.21));

  // Gloved hands with finger detail.
  g.add(box(0.08, 0.075, 0.14, MAT.glove, 0.005, -0.075, -0.28, 0.1, 0, 0));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.018, 0.028, 0.05, MAT.glove, 0.03 + i * 0.018, -0.06, -0.3, 0.1, 0, 0));
  }
  g.add(box(0.07, 0.08, 0.11, MAT.glove, 0.01, -0.115, 0.15, 0.3, 0, 0));
  g.add(box(0.018, 0.03, 0.05, MAT.glove, -0.02, -0.085, 0.11, 0.3, 0, 0));

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.015, -0.8);
  g.add(muzzle);
  return { group: g, muzzle };
}

function buildShotgun() {
  const g = new THREE.Group();
  g.add(box(0.075, 0.11, 0.32, MAT.tan, 0, -0.005, 0.36));
  g.add(box(0.09, 0.125, 0.3, MAT.metal, 0, 0, 0.07));
  g.add(cylinder(0.023, 0.023, 0.52, MAT.dark, 0, 0.032, -0.52));
  g.add(cylinder(0.019, 0.019, 0.4, MAT.metal, 0, -0.032, -0.46));
  g.add(box(0.078, 0.075, 0.24, MAT.poly, 0, -0.032, -0.5));
  g.add(box(0.052, 0.13, 0.075, MAT.poly, 0, -0.11, 0.16, 0.26, 0, 0));
  g.add(box(0.09, 0.03, 0.2, MAT.dark, 0, 0.072, -0.2));
  const bead = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.035, 8), MAT.fiberOptic);
  bead.rotation.x = Math.PI / 2;
  bead.position.set(0, 0.068, -0.72);
  g.add(bead);
  g.add(box(0.016, 0.018, 0.05, MAT.dark, 0, 0.062, 0.08));

  // Heat-shield ribs, magazine tube clamp and sling loop.
  for (let i = 0; i < 5; i++) {
    g.add(box(0.088, 0.012, 0.022, MAT.dark, 0, 0.052, -0.3 - i * 0.075));
  }
  g.add(box(0.05, 0.028, 0.045, MAT.metal, 0, -0.052, -0.3));
  g.add(box(0.012, 0.035, 0.016, MAT.metal, -0.04, -0.02, 0.02));
  // Ejection port + bolt.
  g.add(box(0.012, 0.03, 0.075, MAT.accent, 0.046, 0.03, 0.02));
  g.add(box(0.028, 0.016, 0.05, MAT.dark, 0.06, 0.045, 0.08));
  // Ghost-ring rear sight.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 5, 12), MAT.dark);
  ring.position.set(0, 0.062, 0.12);
  g.add(ring);

  g.add(box(0.082, 0.075, 0.16, MAT.glove, -0.005, -0.07, -0.5, 0.1, 0, 0));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.018, 0.026, 0.048, MAT.glove, 0.03 + i * 0.018, -0.055, -0.52, 0.1, 0, 0));
  }
  g.add(box(0.07, 0.08, 0.11, MAT.glove, 0.01, -0.12, 0.16, 0.3, 0, 0));

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.032, -0.82);
  g.add(muzzle);
  return { group: g, muzzle };
}

function buildPistol() {
  const g = new THREE.Group();
  g.add(box(0.062, 0.075, 0.3, MAT.metal, 0, 0.03, -0.07));
  g.add(box(0.058, 0.05, 0.2, MAT.poly, 0, -0.02, -0.02));
  g.add(box(0.058, 0.15, 0.09, MAT.poly, 0, -0.1, 0.08, 0.18, 0, 0));
  // Combat night sights: rear notch + 2 glowing green tritium dots, front post + 1 tritium dot
  g.add(box(0.05, 0.016, 0.03, MAT.dark, 0, 0.073, 0.03));
  const rearDotL = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6), MAT.tritium);
  rearDotL.position.set(-0.018, 0.078, 0.045);
  g.add(rearDotL);
  const rearDotR = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6), MAT.tritium);
  rearDotR.position.set(0.018, 0.078, 0.045);
  g.add(rearDotR);

  g.add(box(0.01, 0.018, 0.012, MAT.dark, 0, 0.073, -0.2));
  const frontDot = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6), MAT.tritium);
  frontDot.position.set(0, 0.08, -0.194);
  g.add(frontDot);
  g.add(cylinder(0.012, 0.012, 0.05, MAT.dark, 0, 0.03, -0.24));

  // Slide serrations, optic cut and accessory rail.
  for (let i = 0; i < 5; i++) {
    g.add(box(0.064, 0.012, 0.012, MAT.dark, 0, 0.055, 0.06 + i * 0.022));
  }
  g.add(box(0.04, 0.012, 0.09, MAT.accent, 0, 0.071, -0.05));
  g.add(box(0.042, 0.014, 0.14, MAT.dark, 0, -0.012, -0.17));
  g.add(box(0.012, 0.02, 0.012, MAT.dark, 0.028, 0.048, -0.03));
  g.add(box(0.012, 0.02, 0.012, MAT.dark, -0.028, 0.048, -0.03));
  // Hammer and trigger guard.
  g.add(box(0.02, 0.028, 0.018, MAT.dark, 0, 0.055, 0.115));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 5, 12, Math.PI), MAT.dark);
  guard.rotation.z = Math.PI;
  guard.position.set(0, 0.005, 0.02);
  g.add(guard);
  g.add(box(0.012, 0.04, 0.014, MAT.metal, 0, -0.005, 0.02, 0.25, 0, 0));

  g.add(box(0.075, 0.08, 0.11, MAT.glove, 0.005, -0.125, 0.09, 0.25, 0, 0));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.017, 0.026, 0.04, MAT.glove, -0.025 + i * 0.016, -0.062, 0.01, 0.2, 0, 0));
  }
  g.add(box(0.07, 0.07, 0.1, MAT.glove, -0.045, -0.09, 0.02, 0.3, 0.2, 0));

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.27);
  g.add(muzzle);
  return { group: g, muzzle };
}

const BUILDERS = { rifle: buildRifle, shotgun: buildShotgun, pistol: buildPistol };

export class WeaponSystem {
  constructor(opts) {
    this.camera = opts.camera;
    this.audio = opts.audio;
    this.effects = opts.effects;
    this.raycast = opts.raycast;
    this.viewScale = opts.viewScale || 1;
    this.onHit = opts.onHit || (() => {});
    this.onAmmoChange = opts.onAmmoChange || (() => {});
    this.onReload = opts.onReload || (() => {});
    this.onSwitch = opts.onSwitch || (() => {});
    this.onShot = opts.onShot || (() => {});

    this.defs = DEFS;
    this.states = DEFS.map((d) => ({ mag: d.magSize, reserve: d.startReserve }));
    this.models = DEFS.map((d) => BUILDERS[d.id]());

    this.index = 0;
    this.aiming = false;
    this.triggerDown = false;
    this.semiReady = false;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.switchT = 0;
    this.switchDur = 0.4;
    this.fireCooldown = 0;
    this.pumpTimer = 0;
    this.kick = 0;
    this.aimBlend = 0;
    this.time = 0;
    this.currentSpread = 0.02;
    this.emptyTick = false;
    this.meleeTimer = 0;
    this.throwTimer = 0;

    this.swayX = 0;
    this.swayY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.visible = true;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.models.forEach((m, i) => {
      m.group.visible = i === 0;
      m.group.renderOrder = 10;
      m.group.scale.setScalar(this.viewScale);
      m.group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
      this.camera.add(m.group);
    });

    // Soft fill light so the viewmodel reads in the dark yard. Kept low so the
    // materials keep their contrast instead of blowing out to pale grey.
    this.viewLight = new THREE.PointLight(0xffe4c8, 3.6, 3.2, 2);
    this.viewLight.position.set(0.3, 0.22, 0.3);
    this.camera.add(this.viewLight);

    this.setVisible(true);
  }

  get def() { return this.defs[this.index]; }
  get ammo() { return this.states[this.index]; }
  get model() { return this.models[this.index]; }

  setVisible(v) {
    this.visible = !!v;
    for (const m of this.models) m.group.visible = !!v && m === this.model;
  }

  setAim(v) {
    this.aiming = v;
  }

  meleeSwing() {
    this.meleeTimer = 0.34;
  }

  throwSwing() {
    this.throwTimer = 0.3;
  }

  addLook(dx, dy) {
    this.lookX += dx;
    this.lookY += dy;
  }

  startFire() {
    this.triggerDown = true;
    this.semiReady = true;
    this.emptyTick = false;
  }

  stopFire() {
    this.triggerDown = false;
    this.semiReady = false;
  }

  switchTo(i) {
    if (i === this.index || i < 0 || i >= this.defs.length) return;
    this.reloading = false;
    this.onReload(null);
    this.models[this.index].group.visible = false;
    this.index = i;
    this.models[i].group.visible = true;
    this.switchT = this.switchDur;
    this.aiming = false;
    this.triggerDown = false;
    this.fireCooldown = 0.2;
    this.audio.switchWeapon();
    this.onSwitch(i);
    this.onAmmoChange();
  }

  reload() {
    if (this.reloading || this.switchT > 0) return;
    const a = this.ammo;
    if (a.mag >= this.def.magSize || a.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadDur = this.def.reloadTime;
    this.audio.reloadStart();
    this.onReload(0);
  }

  finishReload() {
    const a = this.ammo;
    const need = this.def.magSize - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take;
    a.reserve -= take;
    this.reloading = false;
    this.audio.reloadEnd();
    this.onReload(null);
    this.onAmmoChange();
  }

  resupply() {
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i];
      const room = this.defs[i].reserveMax - s.reserve;
      s.reserve += Math.min(room, Math.ceil(this.defs[i].reserveMax * 0.45));
    }
    this.onAmmoChange();
  }

  computeSpread(player) {
    const d = this.def;
    let s = d.spreadHip + (d.spreadAds - d.spreadHip) * this.aimBlend;
    const move = clamp(player.speed2D / 7.5, 0, 1);
    s += d.spreadMove * move * (1 - this.aimBlend * 0.45);
    if (!player.grounded) s += d.spreadAir;
    if (player.crouching) s *= 0.72;
    return s;
  }

  shoot(player) {
    const d = this.def;
    const a = this.ammo;
    if (a.mag <= 0) return;

    a.mag--;
    this.fireCooldown = 60 / d.rpm;
    this.emptyTick = false;
    this.onAmmoChange();

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(this._forward);
    this.camera.getWorldPosition(this._origin);
    this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();

    const spread = this.computeSpread(player);
    this.currentSpread = spread;

    const muzzleWorld = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    const flashScale = d.kind === 'shotgun' ? 1.5 : d.kind === 'pistol' ? 0.8 : 1.0;

    for (let p = 0; p < d.pellets; p++) {
      const dir = coneSpread(this._forward, this._right, this._up, spread);
      const hit = this.raycast(this._origin, dir, d.range);
      const end = hit ? hit.point : this._tmp.copy(this._origin).addScaledVector(dir, d.range).clone();

      if (p % 2 === 0) this.effects.tracer(muzzleWorld, end, d.kind === 'shotgun' ? 0xffc07a : 0xffd9a0);

      if (hit) {
        const falloff = hit.distance <= d.falloffStart
          ? 1
          : clamp(1 - (hit.distance - d.falloffStart) / (d.range - d.falloffStart), d.minDamage, 1);
        const mult = hit.isHead ? d.headMult : 1;
        const dmg = d.damage * falloff * mult;
        this.onHit(hit, dmg, d, !!hit.isHead);
        this.effects.impact(hit.point, hit.normal, !!hit.enemy);
      }
      this.onShot(!!hit, !!hit?.isHead);
    }

    this.effects.muzzleFlash(
      this._muzzle.copy(muzzleWorld).addScaledVector(this._forward, 0.03),
      flashScale
    );
    this.audio.shot(d.sound, 0.85);
    this.effects.gunSmoke(muzzleWorld, this._forward);

    // Ejected brass flies out of the right-hand port.
    const eject = this._tmp.copy(this._origin)
      .addScaledVector(this._right, 0.2)
      .addScaledVector(this._up, -0.05)
      .addScaledVector(this._forward, 0.42);
    this.effects.casing(eject, this._right, this._up);

    const adsK = this.aimBlend > 0.5 ? 0.68 : 1;
    player.addRecoil(d.recoilPitch * adsK, d.recoilYaw * adsK);
    this.kick = Math.min(1.4, this.kick + (d.kind === 'shotgun' ? 1.5 : 0.85));

    if (d.pump) {
      this.pumpTimer = 0.24;
    }
  }

  update(dt, player) {
    this.time += dt;
    const d = this.def;
    const a = this.ammo;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    this.throwTimer = Math.max(0, this.throwTimer - dt);
    this.aimBlend = damp(this.aimBlend, this.aiming ? 1 : 0, 13, dt);
    this.kick = damp(this.kick, 0, 15, dt);

    if (this.pumpTimer > 0) {
      this.pumpTimer -= dt;
      if (this.pumpTimer <= 0 && this.def.pump) this.audio.pump();
    }

    if (this.reloading) {
      this.reloadT += dt;
      const prog = clamp(this.reloadT / this.reloadDur, 0, 1);
      this.onReload(prog);
      if (prog >= 1) this.finishReload();
    }

    if (this.triggerDown && !this.reloading && this.switchT <= 0 && !player.sprinting) {
      if (a.mag <= 0) {
        if (!this.emptyTick) {
          this.emptyTick = true;
          this.audio.empty();
        }
        if (this.fireCooldown <= 0) this.reload();
      } else if (this.fireCooldown <= 0 && (d.auto || this.semiReady)) {
        this.shoot(player);
        this.semiReady = false;
      }
    }

    // ---------- viewmodel animation ----------
    const m = this.model;
    m.group.visible = this.visible;
    const hip = new THREE.Vector3(d.hipPos[0], d.hipPos[1], d.hipPos[2]);
    const ads = new THREE.Vector3(d.adsPos[0], d.adsPos[1], d.adsPos[2]);
    const pos = hip.lerp(ads, this.aimBlend);

    this.swayX = damp(this.swayX, clamp(-this.lookX * 0.0011, -0.035, 0.035), 9, dt);
    this.swayY = damp(this.swayY, clamp(-this.lookY * 0.0011, -0.03, 0.03), 9, dt);
    this.lookX = damp(this.lookX, 0, 14, dt);
    this.lookY = damp(this.lookY, 0, 14, dt);

    const bobScale = 1 - this.aimBlend * 0.72;
    pos.x += this.swayX + Math.sin(this.time * 1.2) * 0.0035 * bobScale;
    pos.y += this.swayY + Math.cos(this.time * 0.95) * 0.0028 * bobScale + player.bobY * 0.3 * bobScale;
    pos.z += this.kick * 0.022;

    let rx = this.kick * 0.14;
    let ry = 0.025 * (1 - this.aimBlend) + this.swayX * 0.7;
    let rz = this.swayX * 0.5;

    if (this.reloading) {
      const s = Math.sin(clamp(this.reloadT / this.reloadDur, 0, 1) * Math.PI);
      pos.y -= s * 0.16;
      pos.z += s * 0.02;
      rx += s * 0.85;
      rz += s * 0.3;
    }
    if (this.switchT > 0) {
      const k = this.switchT / this.switchDur;
      pos.y -= k * 0.38;
      rx += k * 0.6;
    }
    if (player.sprinting) {
      const s = clamp(player.speed2D / 7.5, 0, 1);
      pos.x += 0.035 * s;
      pos.y -= 0.02 * s;
      ry += 0.22 * s;
      rx -= 0.1 * s;
    }
    if (player.sliding) {
      pos.y -= 0.12;
      rx -= 0.32;
      rz += 0.2;
    }
    if (this.meleeTimer > 0) {
      const k = 1 - this.meleeTimer / 0.34;
      const s = Math.sin(k * Math.PI);
      pos.x -= s * 0.22;
      pos.z -= s * 0.36;
      pos.y -= s * 0.06;
      rx += s * 0.45;
      ry -= s * 0.75;
      rz += s * 0.95;
    }
    if (this.throwTimer > 0) {
      const k = 1 - this.throwTimer / 0.3;
      const s = Math.sin(k * Math.PI);
      pos.y += s * 0.09;
      pos.z -= s * 0.14;
      rx -= s * 0.5;
      ry += s * 0.2;
    }

    m.group.position.copy(pos);
    m.group.rotation.set(rx, ry, rz);

    // Spread for the dynamic crosshair.
    this.currentSpread = this.computeSpread(player);
  }

  reset() {
    this.index = 0;
    this.states = this.defs.map((d) => ({ mag: d.magSize, reserve: d.startReserve }));
    this.aiming = false;
    this.triggerDown = false;
    this.semiReady = false;
    this.reloading = false;
    this.reloadT = 0;
    this.switchT = 0;
    this.fireCooldown = 0;
    this.kick = 0;
    this.meleeTimer = 0;
    this.throwTimer = 0;
    this.aimBlend = 0;
    this.emptyTick = false;
    this.models.forEach((m, i) => { m.group.visible = i === 0; });
    this.onReload(null);
    this.onSwitch(0);
    this.onAmmoChange();
  }

  get fovTarget() {
    return this.aimBlend > 0.01 ? THREE.MathUtils.lerp(75, this.def.adsFov, this.aimBlend) : 75;
  }
}
