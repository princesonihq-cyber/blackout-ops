import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { GrenadeManager } from './grenades.js';
import { clamp, damp, rand } from './utils.js';

const $ = (id) => document.getElementById(id);

/* ============================================================
   Boot
   ============================================================ */

/* ============================================================
   Device capability detection
   ============================================================ */

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const NO_POINTER_LOCK = PARAMS.has('noptr');
const FORCE_TOUCH = PARAMS.has('touch');

function detectGPU() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return name || '';
  } catch (e) {
    return '';
  }
}

function detectTouch() {
  try {
    return FORCE_TOUCH
      || window.matchMedia('(pointer: coarse)').matches
      || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);
  } catch (e) {
    return FORCE_TOUCH || 'ontouchstart' in window;
  }
}

const IS_TOUCH = detectTouch();
const GPU_NAME = detectGPU();
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i.test(GPU_NAME);
const CORES = navigator.hardwareConcurrency || 4;
const MEMORY = navigator.deviceMemory || 4;
const PORTABLE = IS_TOUCH || Math.min(window.innerWidth, window.innerHeight) < 820;

const DPR = window.devicePixelRatio || 1;

const QUALITY_PRESETS = {
  balanced: {
    id: 'balanced', label: 'BALANCED (SMOOTH 60FPS)',
    dpr: 1.0, min: 1.0, antialias: true, shadows: false,
    shadowSize: 512, dust: 0, effectScale: 0.5,
  },
  high: {
    id: 'high', label: 'HIGH QUALITY',
    dpr: Math.min(1.75, Math.max(1, DPR)), min: Math.min(1, DPR), antialias: true, shadows: true,
    shadowSize: 2048, dust: 850, effectScale: 1.0,
  },
  ultra: {
    id: 'ultra', label: 'ULTRA REALISTIC',
    dpr: Math.min(2.0, Math.max(1, DPR)), min: Math.min(1.25, DPR), antialias: true, shadows: true,
    shadowSize: 2048, dust: 1200, effectScale: 1.0,
  },
};

// Aliases for query params
QUALITY_PRESETS.low = QUALITY_PRESETS.balanced;
QUALITY_PRESETS.medium = QUALITY_PRESETS.high;

let savedTier = 'ultra';
try {
  savedTier = localStorage.getItem('bo_tier');
} catch (e) {}

let TIER = savedTier && QUALITY_PRESETS[savedTier] ? savedTier : (IS_TOUCH ? 'high' : 'ultra');

// Manual override for testing and stubborn hardware: ?q=balanced|high|ultra
const TIER_PARAM = (PARAMS.get('q') || '').toLowerCase();
if (QUALITY_PRESETS[TIER_PARAM]) TIER = TIER_PARAM;
// ?fixed locks the render resolution — useful for screenshots and comparisons.
const FIXED_RES = PARAMS.has('fixed');

const STRIP_NORMALS = false; // Always keep crisp normal maps enabled for maximum realism

const PRESET = QUALITY_PRESETS[TIER] || QUALITY_PRESETS.ultra;
document.documentElement.classList.toggle('touch', IS_TOUCH);
document.documentElement.dataset.tier = TIER;

const deployKicker = $('deploy-kicker');
if (deployKicker && IS_TOUCH) deployKicker.textContent = 'TAP TO';
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: PRESET.antialias, powerPreference: 'high-performance',
  precision: 'highp',
});

const quality = {
  ratio: Math.max(1.0, Math.min(DPR, PRESET.dpr)),
  min: 1.0, // Minimum floor is 1.0 native pixel resolution to prevent any blurring!
  max: Math.max(1.0, Math.min(DPR, PRESET.dpr)),
  timer: 0,
  acc: 0,
  frames: 0,
};
renderer.setPixelRatio(quality.ratio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = PRESET.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25; // Rich contrast with deep cinematic blacks and luminous highlights

const MAX_ANISO = Math.min(16, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
// Linear fog ensures zero fog haze within 32 meters of player for razor-sharp, crystal-clear graphics
scene.fog = new THREE.Fog(0x0a121c, 32, 165);

// A tiny procedural sky environment gives metal and glass something to
// reflect. Without it every metal surface reads as flat grey.
(function buildEnvironment() {
  try {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0.0, '#0a1220');
    g.addColorStop(0.42, '#122033');
    g.addColorStop(0.55, '#26303c');
    g.addColorStop(0.62, '#141a22');
    g.addColorStop(1.0, '#05070a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    // Warm lamp band on the horizon.
    const w = ctx.createLinearGradient(0, 56, 0, 80);
    w.addColorStop(0, 'rgba(255,170,80,0)');
    w.addColorStop(0.5, 'rgba(255,170,80,.22)');
    w.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = w;
    ctx.fillRect(0, 56, 256, 24);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(tex);
    scene.environment = rt.texture;
    tex.dispose();
    pmrem.dispose();
  } catch (e) { /* environment is a nicety, not a requirement */ }
})();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
scene.add(camera);

// Tactical weapon flashlight attached to player camera. The origin sits ahead
// of the viewmodel so the barrel is not lit from 20cm away (which blows it out).
const playerFlashlight = new THREE.SpotLight(0xdceeff, 13, 48, Math.PI / 5.6, 0.55, 1.55);
playerFlashlight.position.set(0.16, -0.14, -0.95);
playerFlashlight.target.position.set(0, -0.05, -13);
playerFlashlight.castShadow = true;
playerFlashlight.shadow.mapSize.set(1024, 1024);
playerFlashlight.shadow.bias = -0.0004;
playerFlashlight.shadow.camera.near = 0.2;
playerFlashlight.shadow.camera.far = 48;
camera.add(playerFlashlight);
camera.add(playerFlashlight.target);

// Subtle forward fill around the weapon muzzle
const playerTorchFill = new THREE.PointLight(0xaecde8, 0.8, 6, 2);
playerTorchFill.position.set(0.18, -0.16, -0.12);
camera.add(playerTorchFill);

let flashlightOn = true;
function toggleFlashlight() {
  flashlightOn = !flashlightOn;
  playerFlashlight.visible = flashlightOn;
  playerTorchFill.visible = flashlightOn;
  audio.uiClick();
  ui.toast(flashlightOn ? 'TACTICAL LIGHT // ON' : 'TACTICAL LIGHT // OFF', 1200);
}

const audio = new AudioEngine();
const world = new World(scene, {
  tier: TIER, shadowSize: PRESET.shadowSize, dust: PRESET.dust,
  stripNormals: STRIP_NORMALS, anisotropy: MAX_ANISO,
});
// Dev hook: lets debugging tools inspect the live scene (?debug only).
if (PARAMS.has('debug')) window.__blackout = { THREE, scene, camera, renderer, world };
const effects = new Effects(scene, { tier: TIER, scale: PRESET.effectScale });
const ui = new UI();
const player = new Player(camera, world, audio);
const enemies = new EnemyManager(scene, effects, audio, world);
const grenades = new GrenadeManager(scene, effects, audio, world);
const raycaster = new THREE.Raycaster();

/* ============================================================
   State
   ============================================================ */

const game = {
  mode: 'menu', // menu | playing | paused | over
  score: 0,
  kills: 0,
  heads: 0,
  shots: 0,
  hits: 0,
  wave: 0,
  wavesCleared: 0,
  waveState: 'idle', // idle | active | break
  toSpawn: 0,
  spawnTimer: 0,
  breakTimer: 0,
  aliveCap: 5,
  elapsed: 0,
  grenades: 2,
  uavT: 0,
  streaks: { uav: 0, strike: 0 },
  nextUav: 5,
  nextStrike: 10,
  mkTimes: [],
  meleeCd: 0,
};

const MAX_GRENADES = 3;

const keys = new Set();
let menuAngle = 0.5;
let elapsed = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let fpsTimer = 0;
let gameOverTimer = 0;
let deathCamArmed = false;
let autoRun = false;
let proneStance = false;

// Set when the browser refuses pointer lock (iframe, automation, permissions)
// or when the device is touch-first. The game stays playable without a mouse.
let lookUnlocked = NO_POINTER_LOCK || IS_TOUCH;

/* ============================================================
   Best run (localStorage)
   ============================================================ */

const BEST_KEY = 'bo_best';

function readBestRun() {
  try {
    const best = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
    if (best && Number.isFinite(best.score)) return best;
  } catch (e) { /* ignore */ }
  return null;
}

function refreshBestRun() {
  const el = $('best-stat');
  if (!el) return;
  const best = readBestRun();
  el.textContent = best
    ? `WAVE ${best.wave || 0} · ${best.score.toLocaleString()} PTS`
    : 'WAVE 0 · 0 PTS';
}

function saveBestRun() {
  const best = readBestRun();
  if (best && game.score <= best.score) return false;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({
      wave: game.wavesCleared,
      score: game.score,
    }));
  } catch (e) { /* ignore */ }
  refreshBestRun();
  return true;
}

refreshBestRun();

function updateGfxUI() {
  const p = QUALITY_PRESETS[TIER] || QUALITY_PRESETS.ultra;
  const menuGfx = $('gfx-val');
  if (menuGfx) menuGfx.textContent = p.label;
  const pauseGfx = $('pause-gfx-val');
  if (pauseGfx) pauseGfx.textContent = p.label;
}

function setGraphicsTier(tierKey, silent = false) {
  if (!QUALITY_PRESETS[tierKey]) return;
  TIER = tierKey;
  try { localStorage.setItem('bo_tier', TIER); } catch (e) {}
  const p = QUALITY_PRESETS[TIER];
  quality.max = Math.max(1.0, Math.min(DPR, p.dpr));
  quality.min = Math.max(1.0, p.min);
  quality.ratio = quality.max;
  renderer.setPixelRatio(quality.ratio);
  renderer.shadowMap.enabled = p.shadows;

  // Ultra-smooth performance optimization for low-end systems in Balanced mode:
  if (world && world.dust) world.dust.visible = p.dust > 0;
  if (effects) effects.quality = p.effectScale;

  // Recompile materials to eliminate shadow overhead when shadows are disabled
  scene.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) m.needsUpdate = true;
    }
  });

  document.documentElement.dataset.tier = TIER;
  updateGfxUI();
  if (!silent) ui.toast('GRAPHICS // ' + p.label, 1400);
}

function cycleGraphicsTier() {
  const order = ['ultra', 'high', 'balanced'];
  const idx = order.indexOf(TIER);
  const next = order[(idx + 1) % order.length];
  setGraphicsTier(next);
}

// Crisp resolution adaptation: frame rate fine-tunes between 1.0 and preset max.
// Never drops below 1.0 native resolution, preventing any pixelated or blurry upscaling.
let slowWindows = 0;
function adaptQuality(rawDt) {
  if (FIXED_RES) return;
  quality.timer += rawDt;
  quality.acc += rawDt;
  quality.frames++;
  if (quality.timer < 3.0) return;
  const fps = quality.frames / Math.max(0.001, quality.acc);
  quality.timer = 0;
  quality.acc = 0;
  quality.frames = 0;

  if (fps < 38 && quality.ratio > quality.min) {
    quality.ratio = Math.max(quality.min, quality.ratio - 0.1);
    renderer.setPixelRatio(quality.ratio);
  } else if (fps > 58 && quality.ratio < quality.max) {
    quality.ratio = Math.min(quality.max, quality.ratio + 0.05);
    renderer.setPixelRatio(quality.ratio);
  }

  // Hardware that still cannot hold a playable rate at native resolution drops
  // shadows/effects rather than resolution, so the image stays sharp.
  if (fps < 26 && quality.ratio <= quality.min + 0.001) {
    slowWindows++;
    if (slowWindows >= 2 && TIER !== 'balanced') {
      slowWindows = 0;
      setGraphicsTier('balanced', true);
    }
  } else if (fps > 42) {
    slowWindows = 0;
  }
}

/* ============================================================
   Weapon system wiring
   ============================================================ */

const weapons = new WeaponSystem({
  camera,
  audio,
  effects,
  raycast: raycastShot,
  // Phones hold the gun closer to the eye; scale it down so it stops covering
  // the right half of the screen.
  viewScale: IS_TOUCH ? 0.84 : 1,
  onHit: handleHit,
  onShot: (hit) => {
    game.shots++;
    if (hit) game.hits++;
  },
  onAmmoChange: () => {
    ui.setAmmo(weapons.def.name, weapons.ammo.mag, weapons.ammo.reserve, weapons.def.magSize, weapons.index);
  },
  onReload: (p) => ui.setReload(p),
  onSwitch: (i) => {
    ui.setSlot(i);
    ui.setAmmo(weapons.def.name, weapons.ammo.mag, weapons.ammo.reserve, weapons.def.magSize, i);
  },
});

/* ============================================================
   Hitscan
   ============================================================ */

function raycastShot(origin, dir, maxDist) {
  raycaster.set(origin, dir);
  raycaster.near = 0;
  raycaster.far = maxDist;

  const list = world.solids.concat(enemies.targets);
  const hits = raycaster.intersectObjects(list, false);

  for (const h of hits) {
    const enemy = h.object.userData.enemy;
    if (enemy && (enemy.dead || enemy.removed)) continue;

    let normal = null;
    if (h.face) {
      normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    }
    return {
      point: h.point.clone(),
      normal,
      distance: h.distance,
      enemy: enemy || null,
      isHead: !!(enemy && h.object.userData.head),
    };
  }
  return null;
}

/* ============================================================
   Combat callbacks
   ============================================================ */

function enemyLabel(e) {
  if (e.kind === 'juggernaut') return 'JUGGERNAUT';
  if (e.kind === 'heavy') return 'HEAVY';
  if (e.kind === 'rusher') return 'RUSHER';
  return 'HOSTILE';
}

function trackMultiKill() {
  const now = performance.now() / 1000;
  game.mkTimes = game.mkTimes.filter((t) => now - t < 4.2);
  game.mkTimes.push(now);
  const n = game.mkTimes.length;
  if (n < 2) return;
  const title = n === 2 ? 'DOUBLE KILL'
    : n === 3 ? 'TRIPLE KILL'
    : n === 4 ? 'QUAD KILL'
    : 'MULTI KILL';
  ui.multiKill(title, `${n} ELIMINATIONS`);
}

function registerKill(enemy, opts = {}) {
  game.kills++;
  if (opts.head) game.heads++;

  const base = 100 + (opts.head ? 75 : 0) + game.wave * 10;
  game.score += Math.round(base * (enemy.scoreMult || 1));
  ui.setScore(game.score);
  ui.killfeed(opts.weapon || 'FRAG', !!opts.head, enemyLabel(enemy));
  audio.kill();
  trackMultiKill();

  // Killstreak rewards.
  while (game.kills >= game.nextUav) {
    game.streaks.uav = Math.min(2, game.streaks.uav + 1);
    game.nextUav += 5;
    ui.toast('UAV READY // PRESS 4', 2200);
    audio.streakReady();
  }
  while (game.kills >= game.nextStrike) {
    game.streaks.strike = Math.min(2, game.streaks.strike + 1);
    game.nextStrike += 10;
    ui.toast('AIRSTRIKE READY // PRESS 5', 2200);
    audio.streakReady();
  }

  if (game.kills % 6 === 0) {
    weapons.resupply();
    if (game.grenades < MAX_GRENADES) game.grenades++;
    ui.toast('FIELD RESUPPLY // AMMO + FRAG RESTOCKED', 2000);
  }
}

function handleHit(hit, damage, def, isHead) {
  if (!hit.enemy) return;

  const enemy = hit.enemy;
  const killed = enemy.takeDamage(damage, isHead, hit.point);
  ui.hitmarker(killed);
  ui.damageNumber(hit.point, damage, isHead, killed, camera);
  audio.hitmarker(isHead);

  if (killed) {
    registerKill(enemy, { head: isHead, weapon: def.short });
  }
}

/* Frag + airstrike blasts share the same falloff damage model. */
grenades.onExplode = (pos, scale, label = 'FRAG') => {
  if (game.mode !== 'playing') return;
  const radius = 6.4 * scale;
  const maxDamage = 210;

  for (const e of [...enemies.enemies]) {
    if (e.dead) continue;
    const d = Math.hypot(e.group.position.x - pos.x, e.group.position.z - pos.z);
    if (d > radius) continue;
    const falloff = 1 - d / radius;
    const killed = e.takeDamage(maxDamage * falloff, false, e.group.position);
    if (killed) registerKill(e, { weapon: label, explosive: true });
  }

  const pd = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  if (pd < radius) {
    const dmg = 62 * (1 - pd / radius);
    const died = player.takeDamage(dmg, pos);
    ui.setHealth(player.health, player.armor);
    ui.damageFlash(0.7 + dmg * 0.01);
    ui.hitDirection(player.lastHitAngle);
    audio.hurt();
    if (died) triggerGameOver();
  }
};

function throwGrenade() {
  if (game.mode !== 'playing') return;
  if (game.grenades <= 0) {
    ui.toast('NO FRAG GRENADES');
    audio.empty();
    return;
  }
  game.grenades--;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  origin.addScaledVector(dir, 0.45);
  origin.y -= 0.06;
  grenades.throwFrom(origin, dir, 1);
  weapons.throwSwing();
  ui.setEquipment(game.grenades, game.streaks.uav > 0, game.streaks.strike > 0);
}

function melee() {
  if (game.mode !== 'playing' || game.meleeCd > 0) return;
  game.meleeCd = 0.55;
  weapons.meleeSwing();
  audio.meleeSwing();

  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  let best = null;
  let bestD = 1e9;
  for (const e of enemies.enemies) {
    if (e.dead) continue;
    const dx = e.group.position.x - player.pos.x;
    const dz = e.group.position.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.9 || d < 0.01) continue;
    const dot = (dx / d) * fwd.x + (dz / d) * fwd.z;
    if (dot < 0.15) continue;
    if (d < bestD) { bestD = d; best = e; }
  }

  if (best) {
    const point = best.group.position.clone();
    point.y = 1.2;
    const killed = best.takeDamage(220, false, point);
    effects.impact(point, new THREE.Vector3(0, 1, 0), true);
    audio.meleeHit();
    ui.hitmarker(killed);
    if (killed) registerKill(best, { weapon: 'KNIFE' });
  }
}

function activateUav() {
  if (game.mode !== 'playing') return;
  if (game.streaks.uav <= 0) {
    ui.toast(`UAV NOT READY // ${Math.max(0, game.nextUav - game.kills)} KILLS TO GO`);
    return;
  }
  game.streaks.uav--;
  game.uavT = 20;
  ui.setUav(true);
  ui.setEquipment(game.grenades, game.streaks.uav > 0, game.streaks.strike > 0);
  ui.toast('UAV ONLINE // 20 SECONDS');
  audio.uav();
}

function callAirstrike() {
  if (game.mode !== 'playing') return;
  if (game.streaks.strike <= 0) {
    ui.toast(`AIRSTRIKE NOT READY // ${Math.max(0, game.nextStrike - game.kills)} KILLS TO GO`);
    return;
  }
  game.streaks.strike--;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  let t = dir.y < -0.06 ? -origin.y / dir.y : 26;
  t = clamp(t, 7, 46);
  const target = origin.clone().addScaledVector(dir, t);
  target.y = 0;
  target.x = clamp(target.x, -38, 38);
  target.z = clamp(target.z, -38, 38);
  grenades.airstrike(target);
  ui.setEquipment(game.grenades, game.streaks.uav > 0, game.streaks.strike > 0);
  ui.toast('AIRSTRIKE INBOUND // DANGER CLOSE');
}

enemies.onPlayerHit = (dmg, from) => {
  if (game.mode !== 'playing') return;
  const died = player.takeDamage(dmg, from);
  ui.setHealth(player.health, player.armor);
  ui.damageFlash(0.6 + dmg * 0.02);
  ui.hitDirection(player.lastHitAngle);
  audio.hurt();
  if (died) triggerGameOver();
};

/* ============================================================
   Waves
   ============================================================ */

function startWave(n) {
  game.wave = n;
  game.waveState = 'active';
  game.toSpawn = 4 + Math.floor(n * 1.8);
  game.aliveCap = Math.min(4 + Math.ceil(n * 0.9), 9);
  game.spawnTimer = 0.7;
  ui.setWave(n);
  ui.setObjective(`CLEAR WAVE ${n}`);
  ui.banner('// INCOMING', `WAVE ${n}`, n === 1 ? 'HOSTILES INBOUND' : 'THEY KEEP COMING');
  audio.waveStart();
}

function pickEnemyKind() {
  const wave = game.wave;
  const r = Math.random();
  const hasJugg = enemies.enemies.some((e) => !e.dead && e.kind === 'juggernaut');
  if (wave >= 5 && !hasJugg && r < Math.min(0.14, 0.05 + wave * 0.008)) return 'juggernaut';
  if (wave >= 3 && r < 0.32) return 'heavy';
  if (wave >= 2 && r < 0.58) return 'rusher';
  return 'grunt';
}

function updateWaves(dt) {
  if (game.waveState === 'active') {
    game.spawnTimer -= dt;
    if (game.toSpawn > 0 && enemies.alive < game.aliveCap && game.spawnTimer <= 0) {
      enemies.spawn(game.wave, player, pickEnemyKind());
      game.toSpawn--;
      game.spawnTimer = rand(0.7, 1.55);
    }
    if (game.toSpawn === 0 && enemies.alive === 0) {
      game.waveState = 'break';
      game.breakTimer = 8;
      game.wavesCleared++;
      game.score += 250;
      ui.setScore(game.score);
      player.addArmor(20);
      weapons.resupply();
      game.grenades = MAX_GRENADES;
      ui.setHealth(player.health, player.armor);
      ui.banner('// SECTOR SECURED', 'WAVE CLEARED', 'NEXT WAVE IN 8');
      ui.setObjective('REGROUP — ARMOR +20');
      ui.toast('ARMOR +20 // AMMO + FRAGS RESTOCKED', 2400);
      ui.setEquipment(game.grenades, game.streaks.uav > 0, game.streaks.strike > 0);
      audio.waveClear();
    }
  } else if (game.waveState === 'break') {
    game.breakTimer -= dt;
    const sec = Math.max(0, Math.ceil(game.breakTimer));
    if (game.breakTimer <= 0) {
      startWave(game.wave + 1);
    } else {
      ui.setObjective(`NEXT WAVE IN ${sec}`);
    }
  }
  ui.setHostiles(game.toSpawn + enemies.alive);
}

/* ============================================================
   Game flow
   ============================================================ */

function startGame() {
  audio.init();
  audio.uiClick();

  game.mode = 'playing';
  game.score = 0;
  game.kills = 0;
  game.heads = 0;
  game.shots = 0;
  game.hits = 0;
  game.wave = 0;
  game.wavesCleared = 0;
  game.waveState = 'idle';
  game.toSpawn = 0;
  game.elapsed = 0;
  gameOverTimer = 0;
  deathCamArmed = false;
  game.grenades = 2;
  game.uavT = 0;
  game.streaks.uav = 0;
  game.streaks.strike = 0;
  game.nextUav = 5;
  game.nextStrike = 10;
  game.mkTimes = [];
  game.meleeCd = 0;

  effects.clear();
  grenades.clear();
  enemies.clear();
  player.reset();
  player.sensitivity = parseFloat(sensEl.value) || 1;

  weapons.reset();
  weapons.setVisible(true);
  weapons.stopFire();
  weapons.setAim(false);

  ui.reset();
  ui.show(true);
  ui.setHealth(player.health, player.armor);
  ui.setScore(0);
  ui.setWave(1);
  ui.setHostiles(0);
  ui.setAmmo(weapons.def.name, weapons.ammo.mag, weapons.ammo.reserve, weapons.def.magSize, weapons.index);
  ui.setEquipment(game.grenades, false, false);
  ui.setUav(false);
  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('boot-error').classList.add('hidden');

  keys.clear();
  autoRun = false;
  proneStance = false;
  touchProne = false;
  clearTouchState();
  showTouch();
  startWave(1);
  lockPointer();
}

function lockPointer() {
  if (lookUnlocked) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => unlockLook());
  } catch (e) {
    unlockLook();
  }
}

function unlockLook() {
  if (lookUnlocked) return;
  lookUnlocked = true;
  hasLockedOnce = false;
  if (game.mode === 'playing') {
    ui.toast('MOUSE LOCK BLOCKED — FREE LOOK ENABLED');
  }
}

function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  weapons.stopFire();
  weapons.setAim(false);
  keys.clear();
  autoRun = false;
  proneStance = false;
  touchProne = false;
  hideTouch();
  $('pause').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  $('pause').classList.add('hidden');
  game.mode = 'playing';
  keys.clear();
  autoRun = false;
  proneStance = false;
  touchProne = false;
  clearTouchState();
  showTouch();
  lockPointer();
}

function triggerGameOver() {
  if (game.mode === 'over') return;
  game.mode = 'over';
  weapons.stopFire();
  weapons.setAim(false);
  weapons.setVisible(false);
  keys.clear();
  autoRun = false;
  proneStance = false;
  touchProne = false;
  hideTouch();
  grenades.clear();
  for (const e of enemies.enemies) e.laser.visible = false;
  audio.death();
  ui.damageFlash(1.1);
  gameOverTimer = 0.9;
  deathCamArmed = true;
  if (document.pointerLockElement) document.exitPointerLock();

  const acc = game.shots > 0 ? Math.round((game.hits / game.shots) * 100) : 0;
  const mm = Math.floor(game.elapsed / 60);
  const ss = Math.floor(game.elapsed % 60).toString().padStart(2, '0');
  ui.fillGameOver({
    waves: game.wavesCleared,
    kills: game.kills,
    heads: game.heads,
    acc,
    score: game.score,
    time: `${mm}:${ss}`,
  });
  saveBestRun();
}

function toMenu() {
  if (game.mode === 'paused' || game.mode === 'over') saveBestRun();
  game.mode = 'menu';
  game.waveState = 'idle';
  weapons.stopFire();
  weapons.setAim(false);
  weapons.setVisible(false);
  enemies.clear();
  effects.clear();
  grenades.clear();
  keys.clear();
  autoRun = false;
  proneStance = false;
  touchProne = false;
  hideTouch();
  ui.show(false);
  $('gameover').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('menu').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

/* ============================================================
   Input
   ============================================================ */

const sensEl = $('sens');
const sensVal = $('sens-val');

try {
  const saved = localStorage.getItem('bo_sens');
  if (saved) sensEl.value = saved;
} catch (e) { /* ignore */ }

function applySensitivity() {
  player.sensitivity = parseFloat(sensEl.value) || 1;
  sensVal.textContent = player.sensitivity.toFixed(2);
  try { localStorage.setItem('bo_sens', sensEl.value); } catch (e) { /* ignore */ }
}
sensEl.addEventListener('input', applySensitivity);
applySensitivity();

$('deploy').addEventListener('click', () => {
  audio.init();
  enterImmersive();
  startGame();
});

/* The dossier is a physical folder laid on the yard: it leans toward the pointer.
   Mouse only, transform-only, and off under reduced motion. */
(() => {
  const menu = $('menu');
  const stack = document.querySelector('.folder-stack');
  if (!menu || !stack) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = 0;
  const setTilt = (x, y) => {
    stack.style.setProperty('--tilt-x', (x * 1.8).toFixed(2) + 'deg');
    stack.style.setProperty('--tilt-y', (y * -1.2).toFixed(2) + 'deg');
  };
  menu.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = menu.getBoundingClientRect();
      setTilt(e.clientX / r.width - 0.5, e.clientY / r.height - 0.5);
    });
  });
  menu.addEventListener('pointerleave', () => setTilt(0, 0));
})();
$('resume').addEventListener('click', resumeGame);
$('pause-restart').addEventListener('click', () => { saveBestRun(); startGame(); });
$('retry').addEventListener('click', () => startGame());
$('to-menu').addEventListener('click', toMenu);

const gfxBtn = $('gfx-toggle');
if (gfxBtn) gfxBtn.addEventListener('click', cycleGraphicsTier);
const pauseGfxBtn = $('pause-gfx-toggle');
if (pauseGfxBtn) pauseGfxBtn.addEventListener('click', cycleGraphicsTier);
updateGfxUI();

// Landing page interactive tabs & audio test
const soundCheckBtn = $('menu-sound-check');
if (soundCheckBtn) {
  soundCheckBtn.addEventListener('click', () => {
    audio.init();
    audio.uiClick();
    ui.toast('TACTICAL AUDIO ONLINE // 3D SYNTH ENGINE');
  });
}

document.querySelectorAll('.c-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.c-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.controls-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`ctrl-pane-${tab}`);
    if (target) target.classList.add('active');
    try { audio.uiClick(); } catch (e) {}
  });
});

document.querySelectorAll('.d-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.dossier;
    document.querySelectorAll('.d-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.dossier-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`dossier-${tab}`);
    if (target) target.classList.add('active');
    try { audio.uiClick(); } catch (e) {}
  });
});

let hasLockedOnce = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    hasLockedOnce = true;
    return;
  }
  if (hasLockedOnce && game.mode === 'playing') pauseGame();
  hasLockedOnce = false;
});

document.addEventListener('pointerlockerror', () => unlockLook());

canvas.addEventListener('click', () => {
  if (game.mode === 'playing' && !lookUnlocked && document.pointerLockElement !== canvas) lockPointer();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousedown', (e) => {
  if (IS_TOUCH) return;
  if (game.mode !== 'playing') return;
  if (!lookUnlocked && document.pointerLockElement !== canvas) {
    lockPointer();
    return;
  }
  if (e.button === 0) weapons.startFire();
  if (e.button === 2) weapons.setAim(true);
});

window.addEventListener('mouseup', (e) => {
  if (IS_TOUCH) return;
  if (e.button === 0) weapons.stopFire();
  if (e.button === 2) weapons.setAim(false);
});

window.addEventListener('mousemove', (e) => {
  if (IS_TOUCH) return;
  if (game.mode !== 'playing') return;
  if (!lookUnlocked && document.pointerLockElement !== canvas) return;
  const ads = weapons.aimBlend > 0.4 ? 0.62 : 1;
  // Free-look fallback can report huge jumps at the window edge.
  const mx = clamp(e.movementX || 0, -140, 140);
  const my = clamp(e.movementY || 0, -140, 140);
  player.look(mx, my, ads);
  weapons.addLook(mx, my);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'F3') {
    if (game.mode === 'paused') {
      e.preventDefault();
      resumeGame();
    } else if (game.mode === 'playing' && document.pointerLockElement) {
      document.exitPointerLock();
    } else if (game.mode === 'playing') {
      pauseGame();
    }
    return;
  }

  if (game.mode === 'paused' && e.code === 'KeyQ') {
    toMenu();
    return;
  }

  if (game.mode !== 'playing') return;

  const preventKeys = [
    'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'KeyC', 'KeyZ', 'KeyG', 'KeyX', 'KeyV', 'KeyF', 'KeyT', 'KeyH', 'KeyE', 'KeyQ', 'KeyN', 'KeyB',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Tab'
  ];
  if (preventKeys.includes(e.code)) {
    e.preventDefault();
  }

  keys.add(e.code);

  // Auto-run toggle (N key)
  if (e.code === 'KeyN' && !e.repeat) {
    autoRun = !autoRun;
    ui.toast(autoRun ? 'AUTO-RUN // ENGAGED' : 'AUTO-RUN // DISENGAGED', 1000);
  }

  // Reload
  if (e.code === 'KeyR') weapons.reload();

  // Weapon switching: 1, 2, 3 or quick swap with 2
  if (e.code === 'Digit1') weapons.switchTo(0);
  if (e.code === 'Digit2') {
    if (weapons.index === 1) weapons.switchTo(0);
    else weapons.switchTo(1);
  }
  if (e.code === 'Digit3') weapons.switchTo(2);

  if (!e.repeat) {
    // Melee: F or V (supports both!)
    if (e.code === 'KeyV' || e.code === 'KeyF') {
      melee();
    }

    // Flashlight / Tactical light toggle: T or H or E
    if (e.code === 'KeyT' || e.code === 'KeyH' || e.code === 'KeyE') {
      toggleFlashlight();
    }

    // Lethal Equipment: Frag grenade (G or X)
    if (e.code === 'KeyG' || e.code === 'KeyX') {
      throwGrenade();
    }

    // Tactical Equipment / Killstreaks: Q or 4 for UAV, 5 or 6 for Airstrike
    if (e.code === 'KeyQ' || e.code === 'Digit4') {
      activateUav();
    }
    if (e.code === 'Digit5' || e.code === 'Digit6') {
      callAirstrike();
    }

    // Prone / Dive: Z key
    if (e.code === 'KeyZ') {
      if (player.sprinting && player.startDive()) {
        audio.slide();
        proneStance = true;
      } else {
        proneStance = !proneStance;
      }
    }

    // Crouch / Slide: C or Ctrl
    if (e.code === 'KeyC' || e.code === 'ControlLeft') {
      if (proneStance) {
        proneStance = false;
      } else if (player.sprinting && player.startSlide()) {
        audio.slide();
      }
    }

    // Jump: Space
    if (e.code === 'Space') {
      if (proneStance) {
        proneStance = false;
      }
    }

    // Weapon Inspect / Fire Mode: B key
    if (e.code === 'KeyB') {
      audio.uiClick();
      const wName = weapons.currentDef ? weapons.currentDef.name : 'VANGUARD';
      ui.toast('WEAPON INSPECT // ' + wName, 1200);
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

let wheelLock = 0;
window.addEventListener('wheel', (e) => {
  if (game.mode !== 'playing') return;
  e.preventDefault();
  const now = performance.now();
  if (now - wheelLock < 160) return;
  const dir = Math.sign(e.deltaY);
  if (!dir) return;
  wheelLock = now;
  const count = weapons.defs.length;
  weapons.switchTo((weapons.index + dir + count) % count);
}, { passive: false });

window.addEventListener('blur', () => {
  keys.clear();
  clearTouchState();
  weapons.stopFire();
  weapons.setAim(false);
});

/* ============================================================
   Touch controls (phones / tablets)
   ============================================================ */

const touchEl = $('touch');
const stickEl = $('touch-stick');
const stickKnob = stickEl ? stickEl.querySelector('.stick-knob') : null;
const touchMove = { x: 0, y: 0 };
let touchSprint = false;
let touchCrouch = false;
let touchProne = false;
let touchJump = false;
let stickPointer = null;
let lookPointer = null;
let lookX = 0;
let lookY = 0;
const STICK_RADIUS = 46;
const stickOrigin = { x: 0, y: 0 };
let isCustomHudMode = false;
let selectedHudEl = null;
let dragPointerId = null;
const dragOffset = { x: 0, y: 0 };
let customHudLayout = {};

function resetTouchStick() {
  touchMove.x = 0;
  touchMove.y = 0;
  if (stickKnob) stickKnob.style.transform = 'translate(0px, 0px)';
}

function restoreStickHomePosition() {
  if (!stickEl) return;
  const cfg = customHudLayout.stick;
  if (cfg) {
    if (cfg.pctLeft !== undefined && cfg.pctTop !== undefined) {
      stickEl.style.left = `${Math.round(cfg.pctLeft * window.innerWidth)}px`;
      stickEl.style.top = `${Math.round(cfg.pctTop * window.innerHeight)}px`;
    } else if (cfg.left && cfg.top) {
      stickEl.style.left = cfg.left;
      stickEl.style.top = cfg.top;
    }
    stickEl.style.bottom = 'auto';
    stickEl.style.right = 'auto';
  } else {
    stickEl.style.left = '';
    stickEl.style.top = '';
    stickEl.style.bottom = '';
    stickEl.style.right = '';
  }
}

function clearTouchState() {
  resetTouchStick();
  touchSprint = false;
  touchCrouch = false;
  touchProne = false;
  touchJump = false;
  stickPointer = null;
  lookPointer = null;
  if (stickEl) {
    stickEl.classList.remove('active');
    restoreStickHomePosition();
  }
  const crouchBtn = touchEl && touchEl.querySelector('[data-act="crouch"]');
  if (crouchBtn) crouchBtn.classList.remove('on');
  const proneBtn = touchEl && touchEl.querySelector('[data-act="prone"]');
  if (proneBtn) proneBtn.classList.remove('on');
  const sprintBtn = touchEl && touchEl.querySelector('[data-act="sprint"]');
  if (sprintBtn) sprintBtn.classList.remove('on');
}

function showTouch() {
  if (!touchEl) return;
  const hasCustomHud = !!localStorage.getItem('bo_custom_hud');
  if (IS_TOUCH || hasCustomHud || FORCE_TOUCH || document.documentElement.classList.contains('touch')) {
    touchEl.classList.remove('hidden');
  }
  applyCustomHudLayout();
}

function hideTouch() {
  clearTouchState();
  weapons.stopFire();
  weapons.setAim(false);
  if (touchEl) touchEl.classList.add('hidden');
}

function enterImmersive() {
  if (!IS_TOUCH) return;
  const lockLandscape = () => {
    try {
      if (screen.orientation && screen.orientation.lock) {
        const p = screen.orientation.lock('landscape');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) { /* orientation lock not available */ }
  };
  try {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && typeof p.then === 'function') p.then(lockLandscape).catch(lockLandscape);
      else lockLandscape();
    } else {
      lockLandscape();
    }
  } catch (e) { /* fullscreen not available */ }
}

function updateTouchHud() {
  if (!IS_TOUCH || !touchEl) return;
  const uavBtn = touchEl.querySelector('[data-act="uav"]');
  const strikeBtn = touchEl.querySelector('[data-act="strike"]');
  const fragBtn = touchEl.querySelector('[data-act="grenade"]');
  if (uavBtn) {
    uavBtn.classList.toggle('ready', game.streaks.uav > 0);
    const b = uavBtn.querySelector('b');
    if (b) b.textContent = game.streaks.uav;
  }
  if (strikeBtn) {
    strikeBtn.classList.toggle('ready', game.streaks.strike > 0);
    const b = strikeBtn.querySelector('b');
    if (b) b.textContent = game.streaks.strike;
  }
  if (fragBtn) {
    const b = fragBtn.querySelector('b');
    if (b) b.textContent = game.grenades;
  }
  // Keep the scope toggle honest: if aiming is dropped by the game (death,
  // reload cancel, menu) the button must not keep claiming SCOPED.
  const adsBtn = touchEl.querySelector('[data-act="ads"]');
  if (adsBtn) {
    adsBtn.classList.toggle('on', weapons.aiming);
    const lbl = adsBtn.querySelector('.t-lbl');
    if (lbl) lbl.textContent = weapons.aiming ? 'SCOPED' : 'AIM';
  }
}

/* ===================== Custom HUD Layout Management ===================== */

function selectHudElement(el) {
  if (selectedHudEl) selectedHudEl.classList.remove('selected');
  selectedHudEl = el;
  if (!el) {
    const info = $('hud-edit-info');
    if (info) info.textContent = 'TOUCH A BUTTON TO SELECT';
    const scaleVal = $('hud-scale-val');
    if (scaleVal) scaleVal.textContent = '100%';
    return;
  }
  el.classList.add('selected');
  const id = el.dataset.hudId || 'BUTTON';
  const scale = customHudLayout[id]?.scale || 1;
  const info = $('hud-edit-info');
  if (info) info.textContent = `SELECTED: ${id.toUpperCase()}`;
  const scaleVal = $('hud-scale-val');
  if (scaleVal) scaleVal.textContent = `${Math.round(scale * 100)}%`;
  try { audio.uiClick(); } catch (e) {}
}

function scaleSelectedHud(delta) {
  if (!selectedHudEl) return;
  const id = selectedHudEl.dataset.hudId;
  if (!id) return;
  if (!customHudLayout[id]) customHudLayout[id] = {};
  let currentScale = customHudLayout[id].scale || 1;
  currentScale = clamp(+(currentScale + delta).toFixed(2), 0.6, 1.8);
  customHudLayout[id].scale = currentScale;
  selectedHudEl.style.transform = `scale(${currentScale})`;
  const scaleVal = $('hud-scale-val');
  if (scaleVal) scaleVal.textContent = `${Math.round(currentScale * 100)}%`;
  try { audio.uiClick(); } catch (e) {}
}

function openCustomHud() {
  isCustomHudMode = true;
  document.body.classList.add('custom-hud-active');
  const overlay = $('custom-hud-overlay');
  if (overlay) overlay.classList.remove('hidden');
  if (touchEl) touchEl.classList.remove('hidden');
  loadCustomHud();
  applyCustomHudLayout();
  const defaultSelect = document.querySelector('[data-hud-id="fire"]') || document.querySelector('[data-hud-id="stick"]');
  selectHudElement(defaultSelect);
  ui.toast('CUSTOM HUD // DRAG BUTTONS TO REPOSITION');
}

function closeCustomHud() {
  isCustomHudMode = false;
  document.body.classList.remove('custom-hud-active');
  const overlay = $('custom-hud-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (game.mode !== 'playing') {
    if (touchEl && !IS_TOUCH && !localStorage.getItem('bo_custom_hud')) touchEl.classList.add('hidden');
  }
  if (selectedHudEl) selectedHudEl.classList.remove('selected');
  selectedHudEl = null;
  dragPointerId = null;
  draggingHudEl = null;
}

function saveCustomHud() {
  try {
    document.querySelectorAll('[data-hud-id]').forEach((el) => {
      const id = el.dataset.hudId;
      if (!id) return;
      const rect = el.getBoundingClientRect();
      if (!customHudLayout[id]) customHudLayout[id] = {};
      const leftPx = el.style.left ? parseFloat(el.style.left) : rect.left;
      const topPx = el.style.top ? parseFloat(el.style.top) : rect.top;
      customHudLayout[id].left = `${Math.round(leftPx)}px`;
      customHudLayout[id].top = `${Math.round(topPx)}px`;
      customHudLayout[id].pctLeft = +(leftPx / window.innerWidth).toFixed(4);
      customHudLayout[id].pctTop = +(topPx / window.innerHeight).toFixed(4);
    });
    localStorage.setItem('bo_custom_hud', JSON.stringify(customHudLayout));
    ui.toast('HUD LAYOUT SAVED // CONTROLS APPLIED', 1800);
  } catch (e) {
    console.error('Failed to save HUD layout', e);
  }
  closeCustomHud();
  applyCustomHudLayout();
  try { audio.uiClick(); } catch (e) {}
}

function resetCustomHud() {
  try {
    localStorage.removeItem('bo_custom_hud');
    ui.toast('HUD LAYOUT RESET TO DEFAULT', 1500);
  } catch (e) {}
  customHudLayout = {};
  document.querySelectorAll('[data-hud-id]').forEach((el) => {
    el.style.left = '';
    el.style.top = '';
    el.style.bottom = '';
    el.style.right = '';
    el.style.transform = '';
  });
  if (selectedHudEl) selectHudElement(selectedHudEl);
  try { audio.uiClick(); } catch (e) {}
}

function loadCustomHud() {
  try {
    const saved = localStorage.getItem('bo_custom_hud');
    if (saved) {
      customHudLayout = JSON.parse(saved);
      applyCustomHudLayout();
    }
  } catch (e) {}
}

function applyCustomHudLayout() {
  if (!customHudLayout || typeof customHudLayout !== 'object') return;
  for (const [id, cfg] of Object.entries(customHudLayout)) {
    if (!cfg) continue;
    const el = document.querySelector(`[data-hud-id="${id}"]`);
    if (!el) continue;
    if (cfg.pctLeft !== undefined && cfg.pctTop !== undefined) {
      el.style.left = `${Math.round(cfg.pctLeft * window.innerWidth)}px`;
      el.style.top = `${Math.round(cfg.pctTop * window.innerHeight)}px`;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    } else if (cfg.left && cfg.top) {
      el.style.left = cfg.left;
      el.style.top = cfg.top;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
    if (cfg.scale) {
      el.style.transform = `scale(${cfg.scale})`;
    }
  }
}

loadCustomHud();

const menuHudBtn = $('menu-custom-hud');
if (menuHudBtn) menuHudBtn.addEventListener('click', openCustomHud);
const pauseHudBtn = $('pause-custom-hud');
if (pauseHudBtn) pauseHudBtn.addEventListener('click', openCustomHud);

const saveHudBtn = $('hud-save');
if (saveHudBtn) saveHudBtn.addEventListener('click', saveCustomHud);
const resetHudBtn = $('hud-reset');
if (resetHudBtn) resetHudBtn.addEventListener('click', resetCustomHud);
const scaleUpHudBtn = $('hud-scale-up');
if (scaleUpHudBtn) scaleUpHudBtn.addEventListener('click', () => scaleSelectedHud(0.1));
const scaleDownHudBtn = $('hud-scale-down');
if (scaleDownHudBtn) scaleDownHudBtn.addEventListener('click', () => scaleSelectedHud(-0.1));

let draggingHudEl = null;

// Setup dragging for custom HUD elements
document.querySelectorAll('[data-hud-id]').forEach((el) => {
  el.addEventListener('pointerdown', (e) => {
    if (!isCustomHudMode) return;
    e.preventDefault();
    e.stopPropagation();
    selectHudElement(el);
    draggingHudEl = el;
    dragPointerId = e.pointerId;
    const rect = el.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
  });
});

window.addEventListener('pointermove', (e) => {
  if (!isCustomHudMode || !draggingHudEl || dragPointerId !== e.pointerId) return;
  e.preventDefault();
  const el = draggingHudEl;
  const id = el.dataset.hudId;
  const newLeft = clamp(e.clientX - dragOffset.x, 0, window.innerWidth - el.offsetWidth);
  const newTop = clamp(e.clientY - dragOffset.y, 0, window.innerHeight - el.offsetHeight);
  el.style.left = `${newLeft}px`;
  el.style.top = `${newTop}px`;
  el.style.bottom = 'auto';
  el.style.right = 'auto';

  if (!customHudLayout[id]) customHudLayout[id] = {};
  customHudLayout[id].left = `${newLeft}px`;
  customHudLayout[id].top = `${newTop}px`;
  customHudLayout[id].pctLeft = +(newLeft / window.innerWidth).toFixed(4);
  customHudLayout[id].pctTop = +(newTop / window.innerHeight).toFixed(4);
}, { passive: false });

const endCustomDrag = (e) => {
  if (!isCustomHudMode) return;
  if (dragPointerId === e.pointerId) {
    dragPointerId = null;
    draggingHudEl = null;
  }
};
window.addEventListener('pointerup', endCustomDrag);
window.addEventListener('pointercancel', endCustomDrag);

if (touchEl) {
  const lookEl = $('touch-look');
  if (lookEl) {
    lookEl.addEventListener('pointerdown', (e) => {
      if (isCustomHudMode) return;
      if (game.mode !== 'playing') return;
      e.preventDefault();

      // Free Fire / COD Mobile Dynamic Joystick Zone (Left half of screen)
      if (e.clientX < window.innerWidth * 0.48) {
        if (stickPointer === null) {
          stickPointer = e.pointerId;
          stickOrigin.x = e.clientX;
          stickOrigin.y = e.clientY;
          if (stickEl) {
            stickEl.style.left = `${e.clientX - stickEl.offsetWidth / 2}px`;
            stickEl.style.top = `${e.clientY - stickEl.offsetHeight / 2}px`;
            stickEl.style.bottom = 'auto';
            stickEl.style.right = 'auto';
            stickEl.classList.add('active');
          }
          resetTouchStick();
          if (lookEl.setPointerCapture) lookEl.setPointerCapture(e.pointerId);
        }
      } else {
        // Camera Look Zone (Right half of screen)
        if (lookPointer === null) {
          lookPointer = e.pointerId;
          lookX = e.clientX;
          lookY = e.clientY;
          if (lookEl.setPointerCapture) lookEl.setPointerCapture(e.pointerId);
        }
      }
    });

    lookEl.addEventListener('pointermove', (e) => {
      if (isCustomHudMode) return;
      if (e.pointerId === stickPointer) {
        let dx = e.clientX - stickOrigin.x;
        let dy = e.clientY - stickOrigin.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK_RADIUS) {
          dx = (dx / len) * STICK_RADIUS;
          dy = (dy / len) * STICK_RADIUS;
        }
        touchMove.x = dx / STICK_RADIUS;
        touchMove.y = dy / STICK_RADIUS;
        if (stickKnob) stickKnob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        e.preventDefault();
      } else if (e.pointerId === lookPointer) {
        const dx = clamp(e.clientX - lookX, -90, 90);
        const dy = clamp(e.clientY - lookY, -90, 90);
        lookX = e.clientX;
        lookY = e.clientY;
        const ads = weapons.aimBlend > 0.4 ? 0.62 : 1;
        player.look(dx * 1.35, dy * 1.35, ads);
        weapons.addLook(dx, dy);
        e.preventDefault();
      }
    });

    const endPointer = (e) => {
      if (e.pointerId === stickPointer) {
        stickPointer = null;
        resetTouchStick();
        if (stickEl) {
          stickEl.classList.remove('active');
          restoreStickHomePosition();
        }
      }
      if (e.pointerId === lookPointer) {
        lookPointer = null;
      }
    };
    lookEl.addEventListener('pointerup', endPointer);
    lookEl.addEventListener('pointercancel', endPointer);
  }

  const act = (name) => touchEl.querySelector(`[data-act="${name}"]`);

  const bindHold = (name, down, up) => {
    const el = act(name);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      if (isCustomHudMode) return;
      if (game.mode !== 'playing') return;
      e.preventDefault();
      e.stopPropagation();
      // setPointerCapture throws if the pointer is already gone (fast taps,
      // synthetic events); capture is an optimisation, not a requirement.
      try { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      down();
      el.classList.add('on');
    });
    const release = (e) => {
      if (isCustomHudMode) return;
      if (e) { e.preventDefault(); e.stopPropagation(); }
      up();
      el.classList.remove('on');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  };

  const bindTap = (name, fn) => {
    const el = act(name);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      if (isCustomHudMode) return;
      if (game.mode !== 'playing') return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('on');
      fn();
    });
    const off = (e) => {
      if (e) e.stopPropagation();
      el.classList.remove('on');
    };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  };

  bindHold('fire', () => weapons.startFire(), () => weapons.stopFire());
  // Scope is a tap toggle on touch (mobile-shooter convention): the thumb does
  // not have to stay pinned on the button to keep aiming, so it is free to
  // steer and fire. Desktop keeps hold-to-aim on the right mouse button.
  const adsBtn = act('ads');
  if (adsBtn) {
    adsBtn.addEventListener('pointerdown', (e) => {
      if (isCustomHudMode) return;
      if (game.mode !== 'playing') return;
      e.preventDefault();
      e.stopPropagation();
      const on = !weapons.aiming;
      weapons.setAim(on);
      adsBtn.classList.toggle('on', on);
      const lbl = adsBtn.querySelector('.t-lbl');
      if (lbl) lbl.textContent = on ? 'SCOPED' : 'AIM';
      try { if (navigator.vibrate) navigator.vibrate(on ? 12 : 6); } catch (err) { /* ignore */ }
    });
    adsBtn.addEventListener('pointerup', (e) => e.stopPropagation());
    adsBtn.addEventListener('pointercancel', (e) => e.stopPropagation());
  }
  bindHold('sprint', () => { touchSprint = true; }, () => { touchSprint = false; });
  bindHold('jump', () => {
    touchJump = true;
    if (touchProne) {
      touchProne = false;
      const pEl = act('prone'); if (pEl) pEl.classList.remove('on');
    }
  }, () => { touchJump = false; });

  bindTap('reload', () => weapons.reload());
  bindTap('swap', () => weapons.switchTo((weapons.index + 1) % weapons.defs.length));
  bindTap('grenade', () => throwGrenade());
  bindTap('knife', () => melee());
  bindTap('uav', () => activateUav());
  bindTap('strike', () => callAirstrike());
  bindTap('light', () => toggleFlashlight());
  bindTap('pause', () => pauseGame());

  const crouchBtn = act('crouch');
  if (crouchBtn) {
    crouchBtn.addEventListener('pointerdown', (e) => {
      if (isCustomHudMode) return;
      if (game.mode !== 'playing') return;
      e.preventDefault();
      e.stopPropagation();
      if (touchProne) {
        touchProne = false;
        const pEl = act('prone'); if (pEl) pEl.classList.remove('on');
      } else if (player.sprinting && player.grounded) {
        if (player.startSlide()) audio.slide();
      } else {
        touchCrouch = !touchCrouch;
        crouchBtn.classList.toggle('on', touchCrouch);
      }
    });
  }

  const proneBtn = act('prone');
  if (proneBtn) {
    proneBtn.addEventListener('pointerdown', (e) => {
      if (isCustomHudMode) return;
      if (game.mode !== 'playing') return;
      e.preventDefault();
      e.stopPropagation();
      if (player.sprinting && player.grounded) {
        if (player.startDive()) audio.slide();
        touchProne = true;
      } else {
        touchProne = !touchProne;
      }
      if (touchProne) {
        touchCrouch = false;
        const cEl = act('crouch'); if (cEl) cEl.classList.remove('on');
      }
      proneBtn.classList.toggle('on', touchProne);
    });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') pauseGame();
});

/* Debug harness — only active with ?debug in the URL.
   Useful for automated smoke tests and for demoing without a mouse. */
function aimAt(enemy, height = 1.15) {
  const eye = player.eye;
  const tx = enemy.group.position.x;
  const ty = height;
  const tz = enemy.group.position.z;
  const dx = tx - eye.x;
  const dz = tz - eye.z;
  player.recoilPitch = 0;
  player.recoilYaw = 0;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.atan2(ty - eye.y, Math.hypot(dx, dz));
  player.placeCamera();
  camera.updateMatrixWorld(true);
}

if (DEBUG) {
  window.addEventListener('blackout-debug', (event) => {
    const d = (event.detail && typeof event.detail === 'object') ? event.detail : {};
    if (d.action === 'enemy-near') {
      let e = enemies.enemies.find((x) => !x.dead);
      if (!e) e = enemies.spawn(Math.max(1, game.wave), player);
      const dist = d.dist || 7;
      e.group.position.set(player.pos.x, 0, player.pos.z - dist);
      e.group.rotation.y = Math.atan2(player.pos.x - e.group.position.x, player.pos.z - e.group.position.z);
      e.shotCooldown = 999;
      e.aimTimer = 0;
      e.laser.visible = false;
      e.health = e.maxHealth;
      e.group.updateMatrixWorld(true);
      aimAt(e);
      ui.setHostiles(game.toSpawn + enemies.alive);
      return;
    }
    if (d.action === 'aim') {
      const e = enemies.enemies.find((x) => !x.dead);
      if (e) aimAt(e);
      return;
    }
    if (d.action === 'shoot') {
      for (let i = 0; i < (d.count || 1); i++) {
        player.recoilPitch = 0;
        weapons.shoot(player);
      }
      return;
    }
    if (d.action === 'switch') {
      weapons.switchTo(d.index || 0);
      return;
    }
    if (d.action === 'ads') {
      weapons.setAim(!!d.on);
      return;
    }
    if (d.action === 'damage') {
      const died = player.takeDamage(d.amount || 20, null);
      ui.setHealth(player.health, player.armor);
      ui.damageFlash(0.8);
      if (died) triggerGameOver();
      return;
    }
    if (d.action === 'spawn-kind') {
      enemies.spawn(Math.max(1, game.wave), player, d.kind || 'grunt');
      ui.setHostiles(game.toSpawn + enemies.alive);
      return;
    }
    if (d.action === 'grenade') { throwGrenade(); return; }
    if (d.action === 'melee') { game.meleeCd = 0; melee(); return; }
    if (d.action === 'slide') { player.slideCooldown = 0; player.startSlide(); return; }
    if (d.action === 'uav') { game.streaks.uav = 1; activateUav(); return; }
    if (d.action === 'airstrike') { game.streaks.strike = 1; callAirstrike(); return; }
    if (d.action === 'give-streaks') {
      game.streaks.uav = Math.max(game.streaks.uav, 2);
      game.streaks.strike = Math.max(game.streaks.strike, 2);
      ui.setEquipment(game.grenades, true, true);
      return;
    }
    if (d.action === 'state') {
      const alive = enemies.enemies.filter((e) => !e.dead);
      const eye = player.eye;
      const data = {
        mode: game.mode, score: game.score, shots: game.shots, hits: game.hits,
        kills: game.kills, grenades: game.grenades, uavT: +game.uavT.toFixed(1),
        streaks: { ...game.streaks }, sliding: player.sliding,
        player: {
          x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2),
          yaw: +player.yaw.toFixed(3), pitch: +player.pitch.toFixed(3),
        },
        cam: {
          x: +camera.position.x.toFixed(2), z: +camera.position.z.toFixed(2),
          ry: +camera.rotation.y.toFixed(3), rx: +camera.rotation.x.toFixed(3),
        },
        enemies: alive.map((e) => ({
          x: +e.group.position.x.toFixed(2), z: +e.group.position.z.toFixed(2),
          d: +Math.hypot(e.group.position.x - eye.x, e.group.position.z - eye.z).toFixed(2),
        })),
      };
      document.body.dataset.debug = JSON.stringify(data);
      return;
    }
    if (d.action === 'kill-all') {
      for (const e of enemies.enemies) {
        if (!e.dead) e.takeDamage(99999, true, e.group.position);
      }
      return;
    }
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(quality.ratio);
  applyCustomHudLayout();
});

/* ============================================================
   Frame update
   ============================================================ */

function updateMenuCamera(dt) {
  menuAngle += dt * 0.045;
  const r = 33;
  camera.position.set(
    Math.sin(menuAngle) * r,
    10.5 + Math.sin(menuAngle * 0.7) * 1.6,
    Math.cos(menuAngle) * r
  );
  camera.lookAt(0, 2.4, 0);
  camera.rotation.z = 0;
  if (camera.fov !== 70) {
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }
}

function updateDeathCamera(dt) {
  camera.position.y = damp(camera.position.y, 0.5, 2.2, dt);
  camera.rotation.z = damp(camera.rotation.z, 0.95, 1.8, dt);
  camera.rotation.x = damp(camera.rotation.x, -0.18, 1.6, dt);
}

function updateGame(dt) {
  game.elapsed += dt;

  // Stick deflection is a continuous axis; anything past the deadzone counts.
  const stickMag = Math.hypot(touchMove.x, touchMove.y);
  const useStick = stickMag > 0.18;
  const stickY = useStick ? touchMove.y : 0;
  const stickX = useStick ? touchMove.x : 0;

  const input = {
    forward: keys.has('KeyW') || keys.has('ArrowUp') || autoRun || stickY < 0,
    back: keys.has('KeyS') || keys.has('ArrowDown') || stickY > 0,
    left: keys.has('KeyA') || keys.has('ArrowLeft') || stickX < 0,
    right: keys.has('KeyD') || keys.has('ArrowRight') || stickX > 0,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprint || autoRun || (useStick && touchMove.y < -0.72),
    crouch: keys.has('ControlLeft') || keys.has('KeyC') || touchCrouch,
    prone: proneStance || touchProne,
    jump: keys.has('Space') || touchJump,
    analog: useStick,
    analogX: touchMove.x,
    analogY: -touchMove.y,
    aiming: weapons.aiming,
    firing: weapons.triggerDown,
  };

  player.update(dt, input);
  enemies.update(dt, player, elapsed);
  weapons.update(dt, player);
  effects.update(dt);
  grenades.update(dt, player);

  game.meleeCd = Math.max(0, game.meleeCd - dt);
  if (game.uavT > 0) {
    game.uavT -= dt;
    if (game.uavT <= 0) {
      ui.setUav(false);
      ui.toast('UAV OFFLINE');
      ui.setEquipment(game.grenades, game.streaks.uav > 0, game.streaks.strike > 0);
    }
  }

  updateWaves(dt);

  // Dynamic FOV: sprint wide, slide wider, ADS narrow.
  const targetFov = player.sliding ? 88 : player.sprinting ? 82 : weapons.fovTarget;
  camera.fov = damp(camera.fov, targetFov, 11, dt);
  camera.updateProjectionMatrix();

  ui.setHealth(player.health, player.armor);
  ui.setSpread(weapons.currentSpread, weapons.aimBlend > 0.55);
  ui.setEquipment(game.grenades, game.streaks.uav > 0, game.streaks.strike > 0);
  updateTouchHud();
  ui.update(dt, player, enemies, world, camera);

  // Ammo display also refreshes on reload progress.
  if (weapons.reloading) {
    ui.setAmmo(weapons.def.name, weapons.ammo.mag, weapons.ammo.reserve, weapons.def.magSize, weapons.index);
  }
}

let last = performance.now() / 1000;

function animate(nowMs) {
  requestAnimationFrame(animate);
  const now = nowMs / 1000;
  const rawDt = Math.min(0.5, Math.max(0, now - last));
  const dt = Math.min(rawDt, 0.05);
  last = now;
  elapsed += dt;

  adaptQuality(rawDt);

  world.update(dt, elapsed);

  if (game.mode === 'menu') {
    updateMenuCamera(dt);
  } else if (game.mode === 'playing') {
    updateGame(dt);
  } else if (game.mode === 'over') {
    effects.update(dt);
    if (deathCamArmed) updateDeathCamera(dt);
    if (gameOverTimer > 0) {
      gameOverTimer -= dt;
      if (gameOverTimer <= 0) {
        ui.show(false);
        $('gameover').classList.remove('hidden');
        deathCamArmed = false;
      }
    }
  } else if (game.mode === 'paused') {
    effects.update(dt);
  }

  renderer.render(scene, camera);

  // FPS readout (cheap, updated twice a second)
  fpsAcc += rawDt;
  fpsFrames++;
  fpsTimer += rawDt;
  if (fpsTimer > 0.5) {
    ui.setFps(fpsFrames / Math.max(0.0001, fpsAcc));
    fpsAcc = 0;
    fpsFrames = 0;
    fpsTimer = 0;
  }
}

/* Initial camera framing behind the menu. */
updateMenuCamera(0);
weapons.setVisible(false);
requestAnimationFrame(animate);

// Test/dev shortcut: skip the menu.
if (PARAMS.has('autostart')) {
  try { startGame(); } catch (e) { console.warn(e); }
}

window.addEventListener('error', (e) => {
  // Only surface the boot failure overlay if the game never came up.
  if (window.__BLACKOUT_LOADED__) return;
  const el = $('boot-error');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = 'SYSTEM FAULT // ' + (e.message || 'unknown error');
});

// Handy for debugging in the console.
window.__BLACKOUT__ = { game, player, weapons, enemies, world, scene, camera, effects };
window.__BLACKOUT_LOADED__ = true;

// The inline watchdog may have painted a "still loading" message just before
// the module finished. Clear it now that the game is actually up.
const bootErrorEl = $('boot-error');
if (bootErrorEl) bootErrorEl.classList.add('hidden');
