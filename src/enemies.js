import * as THREE from 'three';
import { clamp, damp, dampAngle, rand, hasLineOfSight, moveWithCollisions, choose } from './utils.js';

/* ============================================================
   Hostile operators — models, perception, movement, gunfire.
   ============================================================ */

const GEO = {
  torso: new THREE.BoxGeometry(0.5, 0.62, 0.28),
  vest: new THREE.BoxGeometry(0.55, 0.4, 0.33),
  head: new THREE.BoxGeometry(0.24, 0.27, 0.24),
  helmet: new THREE.SphereGeometry(0.175, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
  brim: new THREE.BoxGeometry(0.36, 0.05, 0.34),
  leg: new THREE.BoxGeometry(0.17, 0.74, 0.19),
  arm: new THREE.BoxGeometry(0.14, 0.54, 0.15),
  rifle: new THREE.BoxGeometry(0.07, 0.09, 0.62),
  barrel: new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6),
  visor: new THREE.BoxGeometry(0.19, 0.04, 0.02),
  band: new THREE.BoxGeometry(0.1, 0.035, 0.03),
  pack: new THREE.BoxGeometry(0.34, 0.42, 0.16),
};

let nextId = 1;

/* Enemy archetypes — same rig, different stats, colours and behaviour. */
const KINDS = {
  grunt: {
    hp: 1, speed: 1, dmg: 1, acc: 0, scale: 0.85, melee: false, score: 1,
    suit: 0x39434f, vest: 0x4c5764, visor: 0xff2a18,
  },
  rusher: {
    hp: 0.68, speed: 1.6, dmg: 0.7, acc: -0.18, scale: 0.8, melee: true, score: 1.25,
    suit: 0x4a3a30, vest: 0x5f4735, visor: 0xff7a1a,
  },
  heavy: {
    hp: 2.2, speed: 0.72, dmg: 1.35, acc: 0.02, scale: 1.0, melee: false, score: 1.6,
    suit: 0x2a2f36, vest: 0x3a424b, visor: 0xff2a18,
  },
  juggernaut: {
    hp: 4.5, speed: 0.5, dmg: 2.1, acc: 0.05, scale: 1.32, melee: false, score: 3,
    suit: 0x1d2227, vest: 0x2c333a, visor: 0xffd24a,
  },
};

export class Enemy {
  constructor(scene, effects, audio, opts) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.world = opts.world;
    this.wave = opts.wave;
    this.kind = opts.kind || 'grunt';
    this.id = nextId++;
    this.dead = false;
    this.removed = false;
    this.deathT = 0;

    const K = KINDS[this.kind] || KINDS.grunt;
    this.baseScale = K.scale;
    this.melee = K.melee;
    this.scoreMult = K.score;

    const w = opts.wave;
    this.maxHealth = (100 + Math.max(0, w - 1) * 11) * K.hp;
    this.health = this.maxHealth;
    this.speed = (2.5 + Math.min(w * 0.1, 1.35)) * K.speed;
    this.damage = (6.5 + w * 0.35) * K.dmg;
    this.aimDelay = Math.max(0.3, 0.62 - w * 0.02);
    this.cooldownBase = Math.max(0.8, 1.85 - w * 0.07);
    this.accuracy = clamp(0.55 + w * 0.008 + K.acc, 0.4, 0.7);
    this.matSuitColor = K.suit;
    this.matVestColor = K.vest;
    this.visorColor = K.visor;

    this.aimTimer = 0;
    this.shotCooldown = rand(0.6, 1.6);
    this.losTimer = 0;
    this.los = false;
    this.flash = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.2, 2.8);
    this.walkPhase = rand(0, Math.PI * 2);
    this.moveAmount = 0;
    this.spawnT = 0.35;
    this.stagger = 0;
    this.armSwing = 0;
    this.lastDist = 40;

    this.hitMeshes = [];
    this.flashMats = [];

    this._toPlayer = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._target = new THREE.Vector3();

    this._build();
    this.group.position.copy(opts.position);
    this.group.scale.setScalar(this.baseScale);
    this.group.rotation.y = Math.atan2(
      -opts.position.x, -opts.position.z
    );
    this.group.updateMatrixWorld(true);

    this.onPlayerHit = null;
    this.onDeath = null;
  }

  _build() {
    const g = this.group = new THREE.Group();

    const matSuit = new THREE.MeshStandardMaterial({ color: this.matSuitColor, roughness: 0.9, metalness: 0.08, transparent: true });
    const matVest = new THREE.MeshStandardMaterial({ color: this.matVestColor, roughness: 0.78, metalness: 0.15, transparent: true });
    const matHelmet = new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.55, metalness: 0.4, transparent: true });
    const matGear = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.85, metalness: 0.15, transparent: true });
    const matVisor = new THREE.MeshStandardMaterial({ color: 0x2a0505, emissive: this.visorColor, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.2 });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0x5a2a0c, emissive: 0xff6a18, emissiveIntensity: 0.9, roughness: 0.6 });

    for (const m of [matSuit, matVest, matHelmet, matGear]) {
      m.emissive = new THREE.Color(0xff2a10);
      m.emissiveIntensity = 0;
      this.flashMats.push(m);
    }
    this.extraMats = [matVisor, matAccent];
    this.matSuit = matSuit;
    this.matVest = matVest;

    const add = (geo, mat, x, y, z, rx = 0, isHead = false, parent = g) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData.enemy = this;
      mesh.userData.head = isHead;
      parent.add(mesh);
      this.hitMeshes.push(mesh);
      return mesh;
    };

    // Legs (pivot groups for walk animation)
    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.76, 0);
    g.add(this.legL);
    const legLMesh = add(GEO.leg, matSuit, 0, -0.37, 0, 0, false, this.legL);
    const kneeL = add(GEO.band, matGear, 0, -0.52, 0.09, 0, false, this.legL);
    kneeL.scale.set(1.4, 1, 1.2);
    this.kneeL = kneeL;

    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.76, 0);
    g.add(this.legR);
    add(GEO.leg, matSuit, 0, -0.37, 0, 0, false, this.legR);
    const kneeR = add(GEO.band, matGear, 0, -0.52, 0.09, 0, false, this.legR);
    kneeR.scale.set(1.4, 1, 1.2);

    // Torso and armor
    add(GEO.torso, matSuit, 0, 1.04, 0);
    add(GEO.vest, matVest, 0, 1.06, 0.015);
    add(GEO.band, matAccent, 0.17, 1.24, 0.15);
    add(GEO.band, matGear, 0, 1.0, 0.17);

    // Head + helmet
    add(GEO.head, matGear, 0, 1.55, 0, 0, true);
    add(GEO.helmet, matHelmet, 0, 1.62, -0.01, 0, true);
    add(GEO.brim, matHelmet, 0, 1.66, 0.06, 0, true);
    const visor = add(GEO.visor, matVisor, 0, 1.56, 0.125, 0, true);
    visor.castShadow = false;

    // Backpack
    add(GEO.pack, matGear, 0, 1.06, -0.2);

    // Arms angled forward
    this.armL = new THREE.Group();
    this.armL.position.set(-0.31, 1.28, 0);
    this.armL.rotation.x = -1.02;
    g.add(this.armL);
    add(GEO.arm, matSuit, 0, -0.22, 0, 0, false, this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.31, 1.28, 0);
    this.armR.rotation.x = -1.2;
    g.add(this.armR);
    add(GEO.arm, matSuit, 0, -0.22, 0, 0, false, this.armR);

    // Rifle
    const rifle = new THREE.Mesh(GEO.rifle, matGear);
    rifle.position.set(0.1, 1.1, 0.37);
    rifle.rotation.x = -0.04;
    rifle.userData.enemy = this;
    g.add(rifle);
    this.hitMeshes.push(rifle);
    const barrel = new THREE.Mesh(GEO.barrel, matHelmet);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.1, 1.1, 0.72);
    g.add(barrel);
    if (this.melee) {
      rifle.visible = false;
      barrel.visible = false;
      this.hitMeshes = this.hitMeshes.filter((m) => m !== rifle);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.09), matHelmet);
      blade.position.set(0.12, 0.86, 0.52);
      blade.rotation.x = -0.5;
      blade.castShadow = true;
      g.add(blade);
      this.blade = blade;
    }
    this.rifleMuzzle = new THREE.Object3D();
    this.rifleMuzzle.position.set(0.1, 1.1, 0.8);
    g.add(this.rifleMuzzle);

    // Laser sight (telegraph before firing)
    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xff2a18, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.laser = new THREE.Line(laserGeo, laserMat);
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.scene.add(this.laser);
    this.laserMat = laserMat;

    this.scene.add(g);
  }

  get position() { return this.group.position; }

  takeDamage(dmg, isHead, point) {
    if (this.dead) return false;
    this.health -= dmg;
    this.flash = 1;
    this.stagger = 0.12;
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.dead = true;
    this.deathT = 0;
    this.laser.visible = false;
    this.audio.enemyDeath(this.lastDist);
    this.onDeath?.(this);
  }

  _lostSight() {
    this.los = false;
    this.aimTimer = 0;
    this.laser.visible = false;
  }

  update(dt, player, time, allEnemies) {
    if (this.dead) {
      this._updateDeath(dt);
      return;
    }

    // Spawn pop-in
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      const k = 1 - Math.max(0, this.spawnT) / 0.35;
      this.group.scale.setScalar(this.baseScale * (0.8 + k * 0.2));
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5.5);
      for (const m of this.flashMats) m.emissiveIntensity = this.flash * 2.4;
    }
    if (this.stagger > 0) this.stagger = Math.max(0, this.stagger - dt);

    const pos = this.group.position;
    const dx = player.pos.x - pos.x;
    const dz = player.pos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    this.lastDist = dist;
    this._toPlayer.set(dx, 0, dz);
    if (dist > 0.001) this._toPlayer.divideScalar(dist);

    // ---------- perception ----------
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.12 + Math.random() * 0.12;
      if (!player.dead && dist < 46) {
        this._eye.set(pos.x, 1.6, pos.z);
        const eye = player.pos.clone();
        eye.y += player.currentEye * 0.9;
        this.los = hasLineOfSight(this._eye, eye, this.world.solids);
      } else {
        this.los = false;
      }
    }

    // ---------- aiming / firing ----------
    this.shotCooldown -= dt;
    if (this.melee) {
      // Rushers close the distance and swing instead of shooting.
      this.laser.visible = false;
      this.aimTimer = 0;
      if (this.los && !player.dead && dist < 2.1 && this.shotCooldown <= 0) {
        this.shotCooldown = rand(0.85, 1.3);
        this.audio.meleeHit();
        this.onPlayerHit?.(this.damage, this.group.position);
        this.armSwing = 0.45;
      }
    } else if (this.los && !player.dead && dist < 40) {
      if (this.aimTimer > 0) {
        this.aimTimer -= dt;
        this._updateLaser(player);
        if (this.aimTimer <= 0) {
          this._fire(player, dist);
          this.laser.visible = false;
          this.shotCooldown = rand(0.9, 1.7) * (this.cooldownBase / 1.85);
        }
      } else if (this.shotCooldown <= 0) {
        this.aimTimer = this.aimDelay;
        this._updateLaser(player);
        this.laser.visible = true;
      }
    } else {
      this._lostSight();
    }

    // ---------- movement ----------
    let mx = 0, mz = 0;
    const engage = this.los && dist < 32;
    let speed = this.speed;

    if (dist > 1.4) {
      let forward = 1;
      let strafe = 0;
      if (this.melee) {
        forward = 1;
        strafe = dist < 11 ? this.strafeDir * 0.3 : 0;
        speed *= 1.05;
      } else if (engage) {
        forward = dist > 14 ? 0.85 : dist < 7 ? -0.7 : 0;
        strafe = this.strafeDir * (dist < 28 ? 0.85 : 0.3);
        speed *= 0.72;
      } else {
        speed *= 1.1;
      }
      mx = this._toPlayer.x * forward + (-this._toPlayer.z) * strafe;
      mz = this._toPlayer.z * forward + this._toPlayer.x * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0.001) { mx /= len; mz /= len; }
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(1.1, 2.8);
      if (Math.random() > 0.4) this.strafeDir *= -1;
    }

    // Obstacle avoidance: if the path ahead is blocked, slide sideways.
    if (mx || mz) {
      if (this._blocked(pos.x + mx * 1.1, pos.z + mz * 1.1)) {
        const sx = -mz * this.strafeDir;
        const sz = mx * this.strafeDir;
        mx = sx; mz = sz;
        if (this._blocked(pos.x + mx * 1.1, pos.z + mz * 1.1)) {
          mx = 0; mz = 0;
        }
      }
    }

    const beforeX = pos.x, beforeZ = pos.z;
    moveWithCollisions(pos, mx * speed * dt, mz * speed * dt, 0.42, this.world.colliders);
    const moved = Math.hypot(pos.x - beforeX, pos.z - beforeZ);
    this.moveAmount = damp(this.moveAmount, moved > 0.0005 ? 1 : 0, 10, dt);

    // Separation from other hostiles
    if (allEnemies) {
      for (const other of allEnemies) {
        if (other === this || other.dead) continue;
        const ox = pos.x - other.group.position.x;
        const oz = pos.z - other.group.position.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.001 && od < 0.95) {
          const push = (0.95 - od) * 0.5;
          pos.x += (ox / od) * push;
          pos.z += (oz / od) * push;
        }
      }
    }

    // Face the player while engaged, otherwise face travel direction.
    let targetYaw = this.group.rotation.y;
    if (engage || this.aimTimer > 0) {
      targetYaw = Math.atan2(dx, dz);
    } else if (mx || mz) {
      targetYaw = Math.atan2(mx, mz);
    }
    this.group.rotation.y = dampAngle(this.group.rotation.y, targetYaw, 9, dt);

    // Walk cycle
    this.walkPhase += dt * (7 + speed * 1.1);
    const swing = Math.sin(this.walkPhase) * 0.6 * this.moveAmount;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -1.02 + Math.sin(this.walkPhase + Math.PI) * 0.08 * this.moveAmount;
    this.armR.rotation.x = -1.2 + Math.sin(this.walkPhase) * 0.06 * this.moveAmount;
    if (this.armSwing > 0) {
      this.armSwing = Math.max(0, this.armSwing - dt);
      const sw = Math.sin((1 - this.armSwing / 0.45) * Math.PI) * 1.1;
      this.armR.rotation.x = -1.2 - sw;
    }

    // Idle breathing / laser pulse
    this.group.position.y = Math.sin(time * 2 + this.id) * 0.008;
    if (this.laser.visible) {
      this.laserMat.opacity = 0.35 + Math.sin(time * 22) * 0.2;
    }
    this.group.updateMatrixWorld(true);
  }

  _blocked(x, z) {
    const r = 0.4;
    for (const b of this.world.colliders) {
      if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
    }
    return false;
  }

  _updateLaser(player) {
    this.group.updateMatrixWorld(true);
    this.rifleMuzzle.getWorldPosition(this._muzzle);
    this._target.copy(player.pos);
    this._target.y += player.currentEye * 0.82 + Math.sin(this.id + this.walkPhase) * 0.05;
    const arr = this.laser.geometry.attributes.position.array;
    arr[0] = this._muzzle.x; arr[1] = this._muzzle.y; arr[2] = this._muzzle.z;
    arr[3] = this._target.x; arr[4] = this._target.y; arr[5] = this._target.z;
    this.laser.geometry.attributes.position.needsUpdate = true;
    this.laser.visible = true;
  }

  _fire(player, dist) {
    this.group.updateMatrixWorld(true);
    this.rifleMuzzle.getWorldPosition(this._muzzle);
    const target = player.eye;
    const chance = clamp(
      this.accuracy - dist * 0.0105 - (player.crouching ? 0.06 : 0) - (player.speed2D > 4 ? 0.05 : 0),
      0.08, 0.75
    );
    const hit = Math.random() < chance;

    const end = target.clone();
    if (!hit) {
      end.x += rand(-0.9, 0.9);
      end.y += rand(-0.5, 0.7);
      end.z += rand(-0.9, 0.9);
    }
    this.effects.tracer(this._muzzle, end, 0xff6a3c);
    this.effects.muzzleFlash(this._muzzle, 0.85, false);
    this.audio.enemyShot(dist);

    if (hit) {
      this.onPlayerHit?.(this.damage, this.group.position);
    }
  }

  _updateDeath(dt) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 0.55);
    const ease = 1 - Math.pow(1 - k, 3);
    this.group.rotation.z = ease * (this.strafeDir > 0 ? 1.5 : -1.5);
    this.group.position.y = -ease * 0.25;
    this.group.scale.y = 1 - ease * 0.12;

    if (this.deathT > 6) {
      const fade = Math.max(0, 1 - (this.deathT - 6) / 2.5);
      for (const m of this.flashMats) m.opacity = fade;
      for (const m of this.extraMats) m.opacity = fade;
    }
    if (this.deathT > 9) {
      this.removed = true;
    }
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.laser);
    this.laser.geometry.dispose();
    this.laserMat.dispose();
    for (const m of this.flashMats) m.dispose();
    this.group.traverse((o) => {
      if (o.isMesh && o.material && !this.flashMats.includes(o.material)) {
        // visor / accent materials are per-enemy too
        if (o.material.dispose) o.material.dispose();
      }
    });
    this.hitMeshes.length = 0;
  }
}

export class EnemyManager {
  constructor(scene, effects, audio, world) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.world = world;
    this.enemies = [];
    this.targets = [];
    this.onKill = null;
    this.onPlayerHit = null;
  }

  get alive() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  spawn(wave, player, kind = 'grunt') {
    const candidates = [...this.world.spawnPoints];
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 4; i++) {
      const p = choose(candidates);
      const d = p.distanceTo(player.pos);
      const score = d + rand(0, 10) + (d < 18 ? -40 : 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    const pos = best.clone();
    pos.x += rand(-2.2, 2.2);
    pos.z += rand(-2.2, 2.2);
    // Keep spawn clear of props.
    for (const b of this.world.colliders) {
      if (pos.x > b.min.x - 0.6 && pos.x < b.max.x + 0.6 &&
          pos.z > b.min.z - 0.6 && pos.z < b.max.z + 0.6) {
        pos.copy(best);
        break;
      }
    }
    pos.y = 0;

    const e = new Enemy(this.scene, this.effects, this.audio, { wave, position: pos, world: this.world, kind });
    e.onPlayerHit = (dmg, from) => this.onPlayerHit?.(dmg, from);
    e.onDeath = (enemy) => this.onKill?.(enemy);
    e.group.rotation.y = Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z);
    this.enemies.push(e);
    this.targets.push(...e.hitMeshes);
    this.effects.spawnPulse(pos);
    return e;
  }

  update(dt, player, time) {
    for (const e of this.enemies) {
      e.update(dt, player, time, this.enemies);
      if (e.removed) {
        for (const m of e.hitMeshes) m.userData.enemy = null;
        this.targets = this.targets.filter((m) => m.userData.enemy && !m.userData.enemy.removed);
        e.dispose();
      }
    }
    this.enemies = this.enemies.filter((e) => !e.removed);
  }

  clear() {
    for (const e of this.enemies) {
      e.dispose();
      for (const m of e.hitMeshes) m.userData.enemy = null;
    }
    this.enemies = [];
    this.targets = [];
  }
}
