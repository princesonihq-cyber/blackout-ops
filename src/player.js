import * as THREE from 'three';
import { clamp, damp, moveWithCollisions, rand } from './utils.js';

/* ============================================================
   First-person operator: movement, collisions, camera, damage.
   ============================================================ */

export class Player {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.sensitivity = 1.0;
    this.maxHealth = 100;
    this.maxArmor = 100;
    this.health = 100;
    this.armor = 50;

    this.radius = 0.36;
    this.standEye = 1.66;
    this.crouchEye = 1.04;
    this.proneEye = 0.44;
    this.currentEye = this.standEye;

    this.crouching = false;
    this.prone = false;
    this.sprinting = false;
    this.sliding = false;
    this.slideT = 0;
    this.slideDur = 0.72;
    this.slideCooldown = 0;
    this.slideDirX = 0;
    this.slideDirZ = 0;
    this.grounded = true;
    this.dead = false;

    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shake = 0;

    this.bobT = 0;
    this.bobAmount = 0;
    this.bobX = 0;
    this.bobY = 0;

    this.stepDist = 0;
    this.sinceDamage = 99;
    this.lastHitAngle = 0;

    this.camera.rotation.order = 'YXZ';

    this.reset();
  }

  reset() {
    this.pos.copy(this.world.playerStart);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.armor = 50;
    this.dead = false;
    this.crouching = false;
    this.prone = false;
    this.sprinting = false;
    this.sliding = false;
    this.slideT = 0;
    this.slideCooldown = 0;
    this.grounded = true;
    this.currentEye = this.standEye;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shake = 0;
    this.bobT = 0;
    this.bobAmount = 0;
    this.sinceDamage = 99;
    this.stepDist = 0;
    this.placeCamera();
  }

  look(dx, dy, adsMultiplier = 1) {
    if (this.dead) return;
    const s = 0.0022 * this.sensitivity * adsMultiplier;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s, -1.45, 1.45);
  }

  addRecoil(pitch, yaw) {
    this.recoilPitch = clamp(this.recoilPitch + pitch, -0.02, 0.16);
    this.recoilYaw += rand(-yaw, yaw);
    this.shake = Math.min(0.22, this.shake + 0.03);
  }

  startSlide() {
    if (this.dead || this.sliding || this.slideCooldown > 0 || !this.grounded) return false;
    const l = Math.hypot(this.vel.x, this.vel.z);
    if (l < 3.4) return false;
    this.slideDirX = this.vel.x / l;
    this.slideDirZ = this.vel.z / l;
    this.slideT = this.slideDur;
    this.slideCooldown = 1.2;
    this.sliding = true;
    return true;
  }

  startDive() {
    if (this.dead || this.sliding || this.slideCooldown > 0 || !this.grounded) return false;
    const l = Math.hypot(this.vel.x, this.vel.z);
    if (l < 3.0) return false;
    this.slideDirX = this.vel.x / l;
    this.slideDirZ = this.vel.z / l;
    this.slideT = this.slideDur * 1.15;
    this.slideCooldown = 1.3;
    this.sliding = true;
    this.prone = true;
    return true;
  }

  update(dt, input) {
    if (this.dead) return;

    this.sinceDamage += dt;
    if (this.sinceDamage > 5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 20 * dt);
    }

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    if (this.slideT > 0) this.slideT = Math.max(0, this.slideT - dt);
    const sliding = this.slideT > 0;
    this.sliding = sliding;

    this.prone = !!input.prone && !sliding;
    this.crouching = (!!input.crouch || this.prone) && !sliding;
    const targetEye = sliding
      ? (this.prone ? this.proneEye * 0.82 : this.crouchEye * 0.76)
      : this.prone ? this.proneEye
      : this.crouching ? this.crouchEye
      : this.standEye;
    this.currentEye = damp(this.currentEye, targetEye, sliding ? 22 : 13, dt);

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    let analog = 1;
    if (input.analog) {
      // Continuous stick input: +x strafes right, +y pushes forward.
      const ax = clamp(input.analogX || 0, -1, 1);
      const ay = clamp(input.analogY || 0, -1, 1);
      analog = Math.min(1, Math.hypot(ax, ay));
      wx = cos * ax - sin * ay;
      wz = -sin * ax - cos * ay;
    } else {
      if (input.forward) { wx -= sin; wz -= cos; }
      if (input.back) { wx += sin; wz += cos; }
      if (input.right) { wx += cos; wz -= sin; }
      if (input.left) { wx -= cos; wz += sin; }
    }
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) { wx /= wl; wz /= wl; }

    const moving = wl > 0.001;
    this.sprinting = !!(input.sprint && input.forward && moving && !this.crouching && !this.prone && !input.aiming && !input.firing && !sliding);

    let speed = this.sprinting ? 7.5 : 4.8;
    if (this.crouching) speed = 2.6;
    if (this.prone) speed = 1.45;
    if (input.aiming) speed = this.prone ? 1.0 : this.crouching ? 2.3 : 3.2;

    if (sliding) {
      const k = this.slideT / this.slideDur;
      const spd = 4.2 + 6.4 * k;
      this.vel.x = this.slideDirX * spd;
      this.vel.z = this.slideDirZ * spd;
    } else {
      const targetX = wx * speed * analog;
      const targetZ = wz * speed * analog;
      const accel = this.grounded ? 14 : 2.4;
      this.vel.x = damp(this.vel.x, targetX, accel, dt);
      this.vel.z = damp(this.vel.z, targetZ, accel, dt);
    }

    if (input.jump && this.grounded) {
      this.vel.y = 5.1;
      this.grounded = false;
      this.audio.jump();
    }

    this.vel.y -= 20 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded && this.vel.y < -4) {
        this.audio.land();
        this.shake = Math.min(0.3, this.shake + 0.06);
      }
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    moveWithCollisions(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius, this.world.colliders);
    this.pos.x = clamp(this.pos.x, -39.4, 39.4);
    this.pos.z = clamp(this.pos.z, -39.4, 39.4);

    // Head bob & footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const targetBob = this.grounded && hSpeed > 0.5
      ? clamp(hSpeed / 7.5, 0, 1) * (this.sprinting ? 1.25 : 1)
      : 0;
    this.bobAmount = damp(this.bobAmount, targetBob, 8, dt);
    this.bobT += dt * (6.2 + hSpeed * 1.35);
    this.bobX = Math.cos(this.bobT) * 0.016 * this.bobAmount;
    this.bobY = Math.sin(this.bobT * 2) * 0.021 * this.bobAmount;

    if (this.grounded && hSpeed > 0.8) {
      this.stepDist += hSpeed * dt;
      const stride = this.sprinting ? 2.9 : 2.15;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.audio.footstep(this.sprinting);
      }
    }

    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    this.shake = damp(this.shake, 0, 7, dt);

    this.placeCamera();
  }

  placeCamera() {
    const sh = this.shake;
    const sx = rand(-1, 1) * sh * 0.06;
    const sy = rand(-1, 1) * sh * 0.06;
    const roll = -this.bobX * 0.45 + rand(-1, 1) * sh * 0.05;

    this.camera.position.set(
      this.pos.x + this.bobX * 0.35 + sx,
      this.pos.y + this.currentEye + this.bobY + sy,
      this.pos.z + sx * 0.4
    );
    this.camera.rotation.set(
      this.pitch + this.recoilPitch,
      this.yaw + this.recoilYaw,
      roll
    );
  }

  takeDamage(amount, fromPos) {
    if (this.dead) return false;

    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.6);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.sinceDamage = 0;
    this.shake = Math.min(0.4, this.shake + 0.1 + dmg * 0.006);

    if (fromPos) {
      const dx = fromPos.x - this.pos.x;
      const dz = fromPos.z - this.pos.z;
      this.lastHitAngle = Math.atan2(dx, -dz) - this.yaw;
    }

    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  addArmor(amount) {
    this.armor = Math.min(this.maxArmor, this.armor + amount);
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.currentEye, this.pos.z);
  }

  get speed2D() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}
