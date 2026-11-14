/* ============================================================
   HUD, compass, radar, killfeed, damage numbers, screens.
   ============================================================ */

import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.root = $('hud');
    this.healthNum = $('health-num');
    this.healthFill = $('health-fill');
    this.healthBar = document.querySelector('.health-bar');
    this.armorPips = $('armor-pips').children;
    this.weaponName = $('weapon-name');
    this.ammoMag = $('ammo-mag');
    this.ammoReserve = $('ammo-reserve');
    this.ammoRow = document.querySelector('.ammo-row');
    this.reloadTrack = document.querySelector('.reload-track');
    this.reloadFill = $('reload-fill');
    this.slots = [...document.querySelectorAll('.slot')];
    this.waveNum = $('wave-num');
    this.hostileNum = $('hostile-num');
    this.scoreNum = $('score-num');
    this.killfeedEl = $('killfeed');
    this.crosshair = $('crosshair');
    this.hitmarkerEl = $('hitmarker');
    this.damageVignette = $('damage-vignette');
    this.lowHealth = $('low-health');
    this.dmgNumbers = $('dmg-numbers');
    this.bannerEl = $('wave-banner');
    this.bannerMain = $('banner-main');
    this.bannerSub = $('banner-sub');
    this.bannerKicker = document.querySelector('#wave-banner .banner-kicker');
    this.toastEl = $('toast');
    this.fpsEl = $('fps');
    this.objective = $('objective-text');
    this.compass = $('compass').getContext('2d');
    this.minimap = $('minimap').getContext('2d');
    this.grenadeCount = $('grenade-count');
    this.uavStat = $('uav-stat');
    this.strikeStat = $('strike-stat');
    this.multiKillEl = $('multikill');
    this.hitDirEl = $('hit-dir');
    this.mmLabel = document.querySelector('.mm-label');
    this.uavMarkers = $('uav-markers');
    this._markerPool = [];
    this._proj = new THREE.Vector3();

    this.uavOn = false;
    this._grenades = -1;
    this._uavReady = null;
    this._strikeReady = null;
    this._hitTimer = 0;
    this.mkTimer = 0;

    this._health = -1;
    this._armor = -1;
    this._mag = -1;
    this._reserve = -1;
    this._weapon = '';
    this._wave = -1;
    this._hostiles = -1;
    this._score = -1;
    this._slot = -1;
    this.flash = 0;
    this.toastTimer = 0;

    this.mpW = 180;
    this.mpScale = 3.1;
    this._v = null;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    this.root.classList.toggle('active', on);
  }

  setHealth(h, armor) {
    const hh = Math.max(0, Math.round(h));
    if (hh !== this._health) {
      this._health = hh;
      this.healthNum.textContent = hh;
      this.healthFill.style.width = Math.max(0, Math.min(100, h)) + '%';
      this.healthBar.classList.toggle('low', hh < 36);
    }
    const pips = Math.ceil(Math.max(0, armor) / 20);
    if (pips !== this._armor) {
      this._armor = pips;
      for (let i = 0; i < this.armorPips.length; i++) {
        this.armorPips[i].classList.toggle('on', i < pips);
      }
    }
    this.lowHealth.classList.toggle('on', hh < 32);
  }

  setAmmo(name, mag, reserve, magSize, index) {
    if (name !== this._weapon) {
      this._weapon = name;
      this.weaponName.textContent = name;
    }
    if (mag !== this._mag) {
      this._mag = mag;
      this.ammoMag.textContent = mag;
    }
    if (reserve !== this._reserve) {
      this._reserve = reserve;
      this.ammoReserve.textContent = reserve;
    }
    this.ammoRow.classList.toggle('low', mag <= Math.max(2, Math.ceil(magSize * 0.22)));
    this.setSlot(index);
  }

  setSlot(i) {
    if (i === this._slot) return;
    this._slot = i;
    this.slots.forEach((el, n) => el.classList.toggle('active', n === i));
  }

  setReload(progress) {
    if (progress === null) {
      this.reloadTrack.classList.remove('active');
      this.reloadFill.style.width = '0%';
    } else {
      this.reloadTrack.classList.add('active');
      this.reloadFill.style.width = Math.round(progress * 100) + '%';
    }
  }

  setWave(n) {
    if (n !== this._wave) {
      this._wave = n;
      this.waveNum.textContent = n;
    }
  }

  setHostiles(n) {
    if (n !== this._hostiles) {
      this._hostiles = n;
      this.hostileNum.textContent = n;
    }
  }

  setScore(n) {
    if (n !== this._score) {
      this._score = n;
      this.scoreNum.textContent = n;
    }
  }

  setObjective(text) {
    if (this.objective.textContent !== text) this.objective.textContent = text;
  }

  setEquipment(grenades, uavReady, strikeReady) {
    if (grenades !== this._grenades) {
      this._grenades = grenades;
      this.grenadeCount.textContent = grenades;
      this.grenadeCount.parentElement.classList.toggle('empty', grenades <= 0);
    }
    if (uavReady !== this._uavReady) {
      this._uavReady = uavReady;
      this.uavStat.classList.toggle('ready', uavReady);
      this.uavStat.classList.toggle('active', this.uavOn);
    }
    if (strikeReady !== this._strikeReady) {
      this._strikeReady = strikeReady;
      this.strikeStat.classList.toggle('ready', strikeReady);
    }
  }

  setUav(on) {
    this.uavOn = !!on;
    if (this.mmLabel) this.mmLabel.textContent = on ? 'UAV // LIVE' : 'SECTOR 7G';
    if (this.uavStat) this.uavStat.classList.toggle('active', !!on);
  }

  multiKill(title, sub) {
    const el = this.multiKillEl;
    if (!el) return;
    el.querySelector('.mk-title').textContent = title;
    el.querySelector('.mk-sub').textContent = sub || '';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.mkTimer = 1.7;
  }

  hitDirection(angle) {
    const el = this.hitDirEl;
    if (!el) return;
    el.style.setProperty('--hit-angle', (angle * 180 / Math.PI).toFixed(1) + 'deg');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this._hitTimer = 0.9;
  }

  setSpread(spread, aiming) {
    const gap = Math.round(8 + spread * 460);
    this.crosshair.style.setProperty('--gap', gap + 'px');
    this.crosshair.classList.toggle('ads', aiming);
  }

  hitmarker(kill = false) {
    const el = this.hitmarkerEl;
    el.classList.remove('show', 'kill');
    void el.offsetWidth;
    if (kill) el.classList.add('kill');
    el.classList.add('show');
  }

  killfeed(weapon, headshot, name = 'HOSTILE') {
    const el = document.createElement('div');
    el.className = 'kf';
    el.innerHTML = `<span>YOU</span><span class="kf-wep">${weapon}</span>` +
      (headshot ? '<span class="kf-hs">HEADSHOT</span>' : '') +
      `<span>${name}</span>`;
    this.killfeedEl.appendChild(el);
    while (this.killfeedEl.childElementCount > 4) this.killfeedEl.firstElementChild.remove();
    setTimeout(() => el.classList.add('fade'), 3200);
    setTimeout(() => el.remove(), 3900);
  }

  damageNumber(worldPos, amount, isHead, isKill, camera) {
    if (!this._v) this._v = worldPos.clone();
    else this._v.copy(worldPos);
    this._v.project(camera);
    if (this._v.z > 1) return;

    const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'dmgnum' + (isHead ? ' head' : '') + (isKill ? ' kill' : '');
    el.textContent = Math.round(amount);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this.dmgNumbers.appendChild(el);

    while (this.dmgNumbers.childElementCount > 28) this.dmgNumbers.firstElementChild.remove();
    setTimeout(() => el.remove(), 1000);
  }

  damageFlash(intensity = 1) {
    this.flash = Math.min(1.4, this.flash + intensity);
  }

  banner(kicker, main, sub) {
    this.bannerKicker.textContent = kicker;
    this.bannerMain.textContent = main;
    this.bannerSub.textContent = sub || '';
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  toast(text, ms = 1800) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  setFps(v) {
    this.fpsEl.textContent = 'FPS ' + Math.round(v);
  }

  update(dt, player, enemies, world, camera) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.6);
      this.damageVignette.style.opacity = (this.flash * 0.9).toFixed(2);
    }
    if (this._hitTimer > 0) {
      this._hitTimer -= dt;
      if (this._hitTimer <= 0) this.hitDirEl.classList.remove('show');
    }
    if (this.mkTimer > 0) {
      this.mkTimer -= dt;
      if (this.mkTimer <= 0) this.multiKillEl.classList.remove('show');
    }
    this.drawCompass(player.yaw);
    this.drawMinimap(player, enemies, world);
    this.drawUavMarkers(player, enemies, camera);
  }

  drawUavMarkers(player, enemies, camera) {
    if (!this.uavMarkers || !camera) return;
    const live = this.uavOn ? enemies.enemies.filter((e) => !e.dead) : [];
    let used = 0;

    for (const e of live) {
      const dx = e.group.position.x - player.pos.x;
      const dz = e.group.position.z - player.pos.z;
      if (Math.hypot(dx, dz) > 32) continue;

      this._proj.set(e.group.position.x, e.group.position.y + 1.75, e.group.position.z)
        .project(camera);
      if (this._proj.z > 1 || Math.abs(this._proj.x) > 1.2 || Math.abs(this._proj.y) > 1.2) continue;

      let el = this._markerPool[used];
      if (!el) {
        el = document.createElement('div');
        el.className = 'uav-marker';
        el.innerHTML = '<i></i>';
        this.uavMarkers.appendChild(el);
        this._markerPool.push(el);
      }
      el.style.display = 'block';
      el.style.left = ((this._proj.x * 0.5 + 0.5) * window.innerWidth) + 'px';
      el.style.top = ((-this._proj.y * 0.5 + 0.5) * window.innerHeight) + 'px';
      el.classList.toggle('jugg', e.kind === 'juggernaut');
      el.classList.toggle('rusher', e.kind === 'rusher');
      used++;
    }
    for (let i = used; i < this._markerPool.length; i++) {
      this._markerPool[i].style.display = 'none';
    }
  }

  drawCompass(yaw) {
    const ctx = this.compass;
    const W = 440, H = 36;
    ctx.clearRect(0, 0, W, H);
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    const ppd = 3.55;
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

    ctx.textAlign = 'center';
    for (let d = 0; d < 360; d += 5) {
      let diff = ((d - heading + 540) % 360) - 180;
      if (Math.abs(diff) > 62) continue;
      const x = W / 2 + diff * ppd;
      if (labels[d] !== undefined) {
        ctx.fillStyle = d === 0 ? '#ff7a1a' : 'rgba(220,232,244,.85)';
        ctx.font = '700 12px Bahnschrift, Arial Narrow, sans-serif';
        ctx.fillText(labels[d], x, 19);
        ctx.fillStyle = 'rgba(255,122,26,.55)';
        ctx.fillRect(x - 0.5, 25, 1, 6);
      } else if (d % 15 === 0) {
        ctx.fillStyle = 'rgba(180,200,220,.35)';
        ctx.fillRect(x - 0.5, 26, 1, 4);
      }
    }
    ctx.strokeStyle = 'rgba(180,200,220,.10)';
    ctx.beginPath();
    ctx.moveTo(0, 34.5);
    ctx.lineTo(W, 34.5);
    ctx.stroke();
  }

  drawMinimap(player, enemies, world) {
    const ctx = this.minimap;
    const S = this.mpW;
    const c = S / 2;
    const sc = this.mpScale;
    const px = player.pos.x;
    const pz = player.pos.z;

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(5,9,14,.72)';
    ctx.fillRect(0, 0, S, S);

    // grid
    ctx.strokeStyle = 'rgba(120,150,180,.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= S; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }

    // walls / props
    ctx.fillStyle = 'rgba(122,148,176,.18)';
    for (const b of world.colliders) {
      const x = c + (b.min.x - px) * sc;
      const y = c + (b.min.z - pz) * sc;
      const w = (b.max.x - b.min.x) * sc;
      const h = (b.max.z - b.min.z) * sc;
      if (x > S || y > S || x + w < 0 || y + h < 0) continue;
      ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
    }

    // contact radius ring
    const range = this.uavOn ? 30 : 17;
    ctx.strokeStyle = this.uavOn ? 'rgba(120,220,255,.28)' : 'rgba(255,122,26,.14)';
    ctx.beginPath();
    ctx.arc(c, c, range * sc, 0, Math.PI * 2);
    ctx.stroke();

    // hostiles
    for (const e of enemies.enemies) {
      if (e.dead) continue;
      const dx = e.group.position.x - px;
      const dz = e.group.position.z - pz;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      const x = c + dx * sc;
      const y = c + dz * sc;
      const seen = e.los || this.uavOn;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = e.kind === 'juggernaut' ? '#ffd24a'
        : e.kind === 'rusher' ? '#ff7a1a'
        : seen ? '#ff4a30' : 'rgba(255,74,48,.45)';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = seen ? 8 : 0;
      const sz = e.kind === 'juggernaut' ? 4 : 2.6;
      ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    // player chevron
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffb45c';
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // north marker
    ctx.fillStyle = 'rgba(255,122,26,.7)';
    ctx.font = '700 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 11);
  }

  fillGameOver(stats) {
    $('go-waves').textContent = stats.waves;
    $('go-kills').textContent = stats.kills;
    $('go-heads').textContent = stats.heads;
    $('go-acc').textContent = stats.acc + '%';
    $('go-score').textContent = stats.score;
    $('go-time').textContent = stats.time;
  }

  reset() {
    this._health = -1;
    this._armor = -1;
    this._mag = -1;
    this._reserve = -1;
    this._weapon = '';
    this._wave = -1;
    this._hostiles = -1;
    this._score = -1;
    this._slot = -1;
    this.flash = 0;
    this.damageVignette.style.opacity = 0;
    this.killfeedEl.innerHTML = '';
    this.dmgNumbers.innerHTML = '';
    this.reloadTrack.classList.remove('active');
    this.hitmarkerEl.classList.remove('show', 'kill');
    this.lowHealth.classList.remove('on');
    this.bannerEl.classList.remove('show');
    this.toastEl.classList.remove('show');
    this.multiKillEl?.classList.remove('show');
    this.hitDirEl?.classList.remove('show');
    for (const m of this._markerPool) m.style.display = 'none';
    this.setUav(false);
  }
}
