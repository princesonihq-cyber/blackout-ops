import * as THREE from 'three';
import { rand } from './utils.js';

/* ============================================================
   The relay yard — geometry, lighting, atmosphere, colliders.
   ============================================================ */

let TEX_ANISO = 8;

function makeTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = TEX_ANISO;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function speckle(ctx, size, count, alpha, light = false) {
  for (let i = 0; i < count; i++) {
    const v = light ? rand(180, 255) : rand(0, 70);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    const s = rand(1, 3);
    ctx.fillRect(rand(0, size), rand(0, size), s, s);
  }
}

// High-resolution procedural normal map: multi-pass filtered noise converted to tangent-space normals.
// Delivers crisp, tactile surface grain and micro-relief under yard lights and weapon flashlight.
function makeNormalTexture(size = 512, strength = 2.6) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = Math.random();
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(h.length);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xm = (x + size - 1) % size, xp = (x + 1) % size;
        const ym = (y + size - 1) % size, yp = (y + 1) % size;
        out[y * size + x] = (
          h[y * size + x] * 2 +
          h[y * size + xm] + h[y * size + xp] +
          h[ym * size + x] + h[yp * size + x]
        ) / 6;
      }
    }
    h = out;
  }
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x + size - 1) % size, xp = (x + 1) % size;
      const ym = (y + size - 1) % size, yp = (y + 1) % size;
      const dx = (h[y * size + xp] - h[y * size + xm]) * strength;
      const dy = (h[yp * size + x] - h[ym * size + x]) * strength;
      const dz = Math.sqrt(Math.max(0.05, 1 - dx * dx - dy * dy));
      const i = (y * size + x) * 4;
      img.data[i] = (dx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * 0.5 + 0.5) * 255;
      img.data[i + 2] = (dz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = TEX_ANISO;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function normalFor(repeatX, repeatY, strength = 2.6) {
  const tex = makeNormalTexture(512, strength);
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// Grayscale roughness: dark = smooth (wet asphalt), light = dry and rough.
// Gives surfaces realistic irregular specular highlights.
function makeRoughnessTexture(size = 512, repeatX = 3, repeatY = 3) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e2e2e2';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 24; i++) {
    const x = rand(0, size), y = rand(0, size), r = rand(size * 0.08, size * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(120,120,120,0.65)');
    g.addColorStop(0.5, 'rgba(165,165,165,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = TEX_ANISO;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.tier = opts.tier || 'high';
    this.shadowSize = opts.shadowSize || 1024;
    this.dustCount = opts.dust || 700;
    this.stripNormals = !!opts.stripNormals;
    this.anisotropy = opts.anisotropy || 8;
    TEX_ANISO = this.anisotropy;
    this.colliders = [];
    this.solids = [];
    this.spawnPoints = [];
    this.beacons = [];
    this.lamps = [];

    this._buildMaterials();
    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildGroundDetail();
    this._buildWalls();
    this._buildProps();
    this._buildDetailProps();
    this._buildTower();
    this._buildBackdrop();
    this._buildLightShafts();
    this._buildAtmosphere();
    this._buildDust();
    this._buildSpawns();
    if (this.stripNormals) this._stripNormalMaps();
  }

  /* ---------------------- materials ---------------------- */
  _buildMaterials() {
    // Ultra high-definition asphalt with micro-gravel, branching tar cracks, staging bays, and oil slicks
    const groundTex = makeTexture(1024, (ctx, s) => {
      ctx.fillStyle = '#1c222b';
      ctx.fillRect(0, 0, s, s);

      // Micro-aggregate stone flecks
      for (let i = 0; i < 18000; i++) {
        const v = rand(28, 110);
        ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},${rand(0.2, 0.65)})`;
        ctx.fillRect(rand(0, s), rand(0, s), rand(1, 3), rand(1, 3));
      }

      // Concrete pavement grid seams
      ctx.strokeStyle = 'rgba(110,130,150,0.12)';
      ctx.lineWidth = 4;
      for (let i = 0; i <= 8; i++) {
        const pos = i * s / 8;
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(s, pos); ctx.stroke();
      }

      // Deep tar-filled fissure cracks
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(5,7,10,${rand(0.45, 0.85)})`;
        ctx.lineWidth = rand(1.5, 3.5);
        ctx.beginPath();
        let x = rand(0, s), y = rand(0, s);
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += rand(-70, 70); y += rand(-70, 70);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Weathered yellow safety crosshatch markings & staging bay labels
      ctx.save();
      ctx.strokeStyle = 'rgba(230,170,25,0.45)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.rect(s * 0.15, s * 0.15, s * 0.7, s * 0.7);
      ctx.stroke();

      ctx.fillStyle = 'rgba(230,170,25,0.4)';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BAY 04 // LOGISTICS', s * 0.5, s * 0.22);
      ctx.font = 'bold 20px monospace';
      ctx.fillText('AUTHORIZED VEHICLES ONLY', s * 0.5, s * 0.27);
      ctx.restore();

      // Atmospheric oil slicks & wet rubber marks
      for (let i = 0; i < 22; i++) {
        const x = rand(0, s), y = rand(0, s), r = rand(50, 240);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(4,6,9,${rand(0.18, 0.45)})`);
        g.addColorStop(0.7, `rgba(18,24,35,${rand(0.05, 0.15)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, 22, 22);

    // Weathered industrial concrete with formwork seams, tie holes, water drips & military stencils
    const concreteTex = makeTexture(1024, (ctx, s) => {
      ctx.fillStyle = '#82878d';
      ctx.fillRect(0, 0, s, s);

      // Fine aggregate grain
      speckle(ctx, s, 12000, 0.35, false);
      speckle(ctx, s, 7000, 0.3, true);

      // Formwork panel construction seams & circular tie holes
      ctx.strokeStyle = 'rgba(35,38,42,0.55)';
      ctx.lineWidth = 4;
      for (const y of [s * 0.25, s * 0.5, s * 0.75]) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
        for (let x = s * 0.12; x < s; x += s * 0.25) {
          ctx.fillStyle = 'rgba(25,28,32,0.8)';
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(140,145,150,0.4)';
          ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // Vertical water and rust runoff streaks
      for (let i = 0; i < 35; i++) {
        const x = rand(0, s);
        const len = rand(60, 320);
        const g = ctx.createLinearGradient(x, 0, x, len);
        g.addColorStop(0, 'rgba(30,22,15,0.5)');
        g.addColorStop(0.6, 'rgba(60,50,40,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, rand(0, s - len), rand(3, 14), len);
      }

      // Stenciled military warning graphics
      ctx.save();
      ctx.fillStyle = 'rgba(15,18,22,0.72)';
      ctx.font = '900 38px monospace';
      ctx.fillText('RESTRICTED AREA', 40, 95);
      ctx.font = '700 22px monospace';
      ctx.fillText('SECTOR 07-G // USE OF DEADLY FORCE AUTHORIZED', 40, 135);

      // Warning chevron badge
      ctx.fillStyle = '#d48818';
      ctx.fillRect(40, 155, 320, 10);
      ctx.restore();
    }, 2, 2);

    // Corrugated shipping container metal with authentic stencil logos and weathering
    const metalTex = makeTexture(1024, (ctx, s) => {
      ctx.fillStyle = '#8f98a2';
      ctx.fillRect(0, 0, s, s);

      // High-definition corrugated ridges with specular 3D bevel lighting
      const ribW = 48;
      for (let x = 0; x < s; x += ribW) {
        const g = ctx.createLinearGradient(x, 0, x + ribW, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.28)');
        g.addColorStop(0.2, 'rgba(255,255,255,0.12)');
        g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
        g.addColorStop(0.85, 'rgba(0,0,0,0.42)');
        g.addColorStop(1, 'rgba(255,255,255,0.18)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, ribW, s);
      }

      speckle(ctx, s, 6000, 0.28);

      // Heavy industrial frame border and corner casts
      ctx.strokeStyle = 'rgba(20,24,28,0.75)';
      ctx.lineWidth = 14;
      ctx.strokeRect(8, 8, s - 16, s - 16);

      // Authentic logistics stencils & serial identification
      ctx.save();
      ctx.fillStyle = 'rgba(235,240,245,0.85)';
      ctx.font = '900 48px monospace';
      ctx.fillText('TRIDENT LOGISTICS', 45, 140);
      ctx.font = '700 28px monospace';
      ctx.fillText('TRXU 948210-4', 45, 195);
      ctx.font = '600 20px monospace';
      ctx.fillText('MAX GROSS:  32,500 KG / 71,650 LBS', 45, 240);
      ctx.fillText('PAYLOAD:    28,620 KG / 63,090 LBS', 45, 270);

      // Flammable/Dangerous hazard diamond
      const hx = s - 160, hy = 160;
      ctx.translate(hx, hy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#b82a1e';
      ctx.fillRect(-45, -45, 90, 90);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeRect(-40, -40, 80, 80);
      ctx.rotate(-Math.PI / 4);
      ctx.translate(-hx, -hy);
      ctx.restore();

      // Deep rust streaks & paint chipping
      for (let i = 0; i < 32; i++) {
        const rx = rand(0, s), ry = rand(s * 0.45, s);
        ctx.fillStyle = `rgba(${rand(120, 160)},${rand(55, 75)},25,${rand(0.35, 0.75)})`;
        ctx.fillRect(rx, ry, rand(3, 10), rand(30, 260));
      }
    }, 1, 1);

    // Realistic wood crate texture with plank grain, steel corner braces & ordnance markings
    const crateTex = makeTexture(1024, (ctx, s) => {
      ctx.fillStyle = '#9c825a';
      ctx.fillRect(0, 0, s, s);

      // Horizontal wooden planks with shadow joints
      const plankH = s / 8;
      for (let y = 0; y < s; y += plankH) {
        ctx.fillStyle = `rgba(40,28,14,${rand(0.2, 0.42)})`;
        ctx.fillRect(0, y, s, 6);

        // Wood grain whorls and growth rings
        for (let i = 0; i < 40; i++) {
          ctx.strokeStyle = `rgba(60,42,20,${rand(0.08, 0.22)})`;
          ctx.lineWidth = rand(1, 3.5);
          ctx.beginPath();
          const gy = y + rand(4, plankH - 4);
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(s * 0.35, gy + rand(-12, 12), s * 0.7, gy + rand(-12, 12), s, gy + rand(-8, 8));
          ctx.stroke();
        }
      }

      speckle(ctx, s, 4500, 0.25);

      // Heavy black steel corner reinforcement brackets & diagonal braces
      ctx.strokeStyle = 'rgba(25,28,32,0.85)';
      ctx.lineWidth = 24;
      ctx.strokeRect(16, 16, s - 32, s - 32);
      ctx.beginPath();
      ctx.moveTo(35, 35); ctx.lineTo(s - 35, s - 35);
      ctx.moveTo(s - 35, 35); ctx.lineTo(35, s - 35);
      ctx.stroke();

      // Stenciled military ordnance markings
      ctx.save();
      ctx.fillStyle = 'rgba(20,18,15,0.85)';
      ctx.font = '900 46px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ORDNANCE // EXPLOSIVE', s * 0.5, s * 0.46);
      ctx.font = '700 24px monospace';
      ctx.fillText('CLASS 1.1D  ·  LOT 98-C', s * 0.5, s * 0.52);
      ctx.font = '900 52px sans-serif';
      ctx.fillText('↑  ↑', s * 0.5, s * 0.61);
      ctx.font = '700 18px monospace';
      ctx.fillText('HANDLE WITH CARE', s * 0.5, s * 0.67);
      ctx.restore();
    }, 1, 1);

    // Realistic steel drum barrel texture with ribs, hazard diamond & warning markings
    const makeBarrelTex = (colorHex, hazardText) => makeTexture(1024, (ctx, s) => {
      ctx.fillStyle = colorHex;
      ctx.fillRect(0, 0, s, s);

      // Raised strengthening ribs
      for (const ry of [s * 0.28, s * 0.5, s * 0.72]) {
        const g = ctx.createLinearGradient(0, ry - 24, 0, ry + 24);
        g.addColorStop(0, 'rgba(255,255,255,0.25)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.05)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(255,255,255,0.1)');
        ctx.fillStyle = g;
        ctx.fillRect(0, ry - 24, s, 48);
      }

      // Top and bottom rolled rim chimes
      ctx.fillStyle = 'rgba(15,18,22,0.6)';
      ctx.fillRect(0, 0, s, 20);
      ctx.fillRect(0, s - 20, s, 20);

      speckle(ctx, s, 3500, 0.22);

      // Hazmat diamond placard
      ctx.save();
      const cx = s * 0.5, cy = s * 0.38;
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff2211';
      ctx.fillRect(-60, -60, 120, 120);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.strokeRect(-52, -52, 104, 104);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FLAMMABLE', 0, 5);
      ctx.font = '900 36px monospace';
      ctx.fillText('3', 0, 42);
      ctx.restore();

      // Stenciled drum specifications
      ctx.save();
      ctx.fillStyle = 'rgba(240,245,250,0.75)';
      ctx.font = '700 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(hazardText, s * 0.5, s * 0.62);
      ctx.font = '600 18px monospace';
      ctx.fillText('55 US GAL // 208 LITERS', s * 0.5, s * 0.66);
      ctx.restore();

      // Scratched steel rim edge wear
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = 'rgba(210,220,230,0.6)';
        ctx.fillRect(rand(0, s), rand(0, s), rand(2, 6), rand(2, 18));
      }
    }, 1, 1);

    const barrelRedTex = makeBarrelTex('#8a2c20', 'HIGH-OCTANE FUEL');
    const barrelBlueTex = makeBarrelTex('#26445a', 'CHEMICAL REAGENT');

    // High-contrast 512x512 safety hazard stripes
    const hazardStripesTex = makeTexture(512, (ctx, s) => {
      ctx.fillStyle = '#e8a514';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#14161a';
      const w = 48;
      for (let i = -s; i < s * 2; i += w * 2) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + w, 0);
        ctx.lineTo(i + w + s, s);
        ctx.lineTo(i + s, s);
        ctx.closePath();
        ctx.fill();
      }
      // Edge distress
      for (let i = 0; i < 800; i++) {
        ctx.fillStyle = 'rgba(20,20,20,0.2)';
        ctx.fillRect(rand(0, s), rand(0, s), 2, 2);
      }
    }, 4, 1);

    this.materials = {
      ground: new THREE.MeshStandardMaterial({
        map: groundTex, color: 0x9fa9b5, roughness: 1.0, metalness: 0.1,
        roughnessMap: makeRoughnessTexture(512, 3, 3),
        normalMap: normalFor(18, 18, 3.2), normalScale: new THREE.Vector2(0.5, 0.5),
      }),
      concrete: new THREE.MeshStandardMaterial({
        map: concreteTex, color: 0x7f8791, roughness: 0.9, metalness: 0.07,
        normalMap: normalFor(2, 2, 2.8), normalScale: new THREE.Vector2(0.5, 0.5),
      }),
      concreteDark: new THREE.MeshStandardMaterial({
        map: concreteTex, color: 0x5c636e, roughness: 0.92, metalness: 0.07,
        normalMap: normalFor(2, 2, 2.8), normalScale: new THREE.Vector2(0.5, 0.5),
      }),
      containerBlue: new THREE.MeshStandardMaterial({
        map: metalTex, color: 0x5b7f95, roughness: 0.48, metalness: 0.58,
        normalMap: normalFor(1, 1, 2.4), normalScale: new THREE.Vector2(0.45, 0.45),
      }),
      containerRust: new THREE.MeshStandardMaterial({
        map: metalTex, color: 0x9c5c3e, roughness: 0.62, metalness: 0.44,
        normalMap: normalFor(1, 1, 2.4), normalScale: new THREE.Vector2(0.45, 0.45),
      }),
      containerOlive: new THREE.MeshStandardMaterial({
        map: metalTex, color: 0x6e7e65, roughness: 0.56, metalness: 0.48,
        normalMap: normalFor(1, 1, 2.4), normalScale: new THREE.Vector2(0.45, 0.45),
      }),
      crate: new THREE.MeshStandardMaterial({
        map: crateTex, color: 0x9c7f56, roughness: 0.84, metalness: 0.06,
        normalMap: normalFor(1, 1, 2.6), normalScale: new THREE.Vector2(0.45, 0.45),
      }),
      darkMetal: new THREE.MeshStandardMaterial({
        color: 0x22262c, roughness: 0.42, metalness: 0.78,
      }),
      hazard: new THREE.MeshStandardMaterial({
        color: 0xdf9226, emissive: 0x442205, roughness: 0.65, metalness: 0.25,
      }),
      hazardStripes: new THREE.MeshStandardMaterial({
        map: hazardStripesTex,
        color: 0xffffff, roughness: 0.65, metalness: 0.2,
      }),
      barrelRed: new THREE.MeshStandardMaterial({
        map: barrelRedTex, color: 0xa8382c, roughness: 0.48, metalness: 0.55,
        normalMap: normalFor(1, 1, 2.2), normalScale: new THREE.Vector2(0.4, 0.4),
      }),
      barrelBlue: new THREE.MeshStandardMaterial({
        map: barrelBlueTex, color: 0x365874, roughness: 0.48, metalness: 0.58,
        normalMap: normalFor(1, 1, 2.2), normalScale: new THREE.Vector2(0.4, 0.4),
      }),
      beacon: new THREE.MeshStandardMaterial({
        color: 0x661515, emissive: 0xff2818, emissiveIntensity: 2.2,
        roughness: 0.35, metalness: 0.2,
      }),
      lamp: new THREE.MeshStandardMaterial({
        color: 0x402812, emissive: 0xffb060, emissiveIntensity: 3.2,
        roughness: 0.4, metalness: 0.35,
      }),
    };
  }

  /* ---------------------- sky & air ---------------------- */
  _buildSky() {
    const geo = new THREE.SphereGeometry(280, 32, 18);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        cTop: { value: new THREE.Color(0x060c16) },
        cMid: { value: new THREE.Color(0x152639) },
        cBot: { value: new THREE.Color(0x2b3d52) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main(){
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBot;
        void main(){
          float h = normalize(vPos).y;
          vec3 c = mix(cBot, cMid, smoothstep(-0.15, 0.22, h));
          c = mix(c, cTop, smoothstep(0.18, 0.8, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Stars
    const starCount = 600;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = rand(0, Math.PI * 2);
      const h = rand(0.05, 1);
      const r = 250;
      const phi = Math.acos(1 - h * 0.9);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(a);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.9 + 10;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(a);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xbdd6f0, size: 1.15, sizeAttenuation: true,
      transparent: true, opacity: 0.65, fog: false, depthWrite: false,
    });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // Moon glow sprite
    const moonTex = makeTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.12, 'rgba(235,244,255,0.95)');
      g.addColorStop(0.3, 'rgba(150,190,255,0.35)');
      g.addColorStop(0.7, 'rgba(90,130,200,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    moonTex.wrapS = moonTex.wrapT = THREE.ClampToEdgeWrapping;
    const moonMat = new THREE.SpriteMaterial({
      map: moonTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    });
    const moon = new THREE.Sprite(moonMat);
    moon.scale.setScalar(58);
    moon.position.set(-110, 105, -180);
    this.scene.add(moon);
  }

  _makeGlowTexture(r, g, b) {
    const tex = makeTexture(128, (ctx, s) => {
      const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.14, `rgba(${r},${g},${b},0.62)`);
      grad.addColorStop(0.42, `rgba(${r},${g},${b},0.16)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    }, 1, 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  _buildLights() {
    const low = this.tier === 'low';
    const medium = this.tier === 'medium';

    // Moonlit sky bounce. Bright enough to read props and cover, dark enough to
    // keep the yard a night scene instead of flat grey daylight.
    this.scene.add(new THREE.HemisphereLight(0x9fbedd, 0x1d242e, 2.05));

    const moon = new THREE.DirectionalLight(0xc8dcff, 2.9);
    moon.position.set(32, 46, 20);
    moon.castShadow = true;
    const shadowSize = low ? 512 : this.shadowSize;
    moon.shadow.mapSize.set(shadowSize, shadowSize);
    moon.shadow.camera.left = -55;
    moon.shadow.camera.right = 55;
    moon.shadow.camera.top = 55;
    moon.shadow.camera.bottom = -55;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 130;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    this.scene.add(moon);

    // Cheap cool counter-fill opposite the moon. Lifts shadowed faces and gives
    // the moonlight a direction. No shadow map, so it is nearly free.
    const fill = new THREE.DirectionalLight(0x7f9fd2, 0.82);
    fill.position.set(-34, 22, -30);
    this.scene.add(fill);

    const glowTex = this._makeGlowTexture(255, 198, 132);
    this.glowTex = glowTex;

    const addGlow = (x, y, z, scale, opacity = 0.75) => {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffcf9a, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }));
      glow.position.set(x, y, z);
      glow.scale.setScalar(scale);
      this.scene.add(glow);
    };

    // Warm yard lamps on four poles.
    const lampSpots = [[-28, 28], [28, 28], [-28, -28], [28, -28]];
    this.lampSpots = lampSpots;
    lampSpots.forEach(([x, z], i) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.16, 6.8, 8),
        this.materials.darkMetal
      );
      pole.position.set(x, 3.4, z);
      pole.castShadow = true;
      this.scene.add(pole);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.56), this.materials.lamp);
      head.position.set(x, 6.85, z);
      this.scene.add(head);

      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.36), this.materials.lamp);
      lens.position.set(x, 6.74, z);
      this.scene.add(lens);

      addGlow(x, 6.85, z, 6.0);

      // Low tier keeps two real lights near the player start; the other heads
      // stay emissive with fake pools so the yard still reads as lit.
      if (!low || i < 2) {
        const light = new THREE.PointLight(0xffc489, 180, 64, 2);
        light.position.set(x, 6.3, z);
        light.userData.base = 180;
        this.scene.add(light);
        this.lamps.push(light);
      }

      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 3, z), new THREE.Vector3(0.7, 6.8, 0.7)
      );
      this.colliders.push(box);
    });

    // Street lights along the lanes: tall pole, cantilever arm, glowing head
    // and a real pool of light on the asphalt.
    this.streetLights = [];
    const streetSpots = [
      { x: -38, z: 11, rotY: 0, real: !low && !medium },
      { x: 38, z: -11, rotY: Math.PI, real: !low && !medium },
      { x: 11, z: -38, rotY: -Math.PI / 2, real: medium },
      { x: -11, z: 38, rotY: Math.PI / 2, real: false },
    ];
    for (const { x, z, rotY, real } of streetSpots) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.36, 0.4, 10), this.materials.darkMetal
      );
      base.position.y = 0.2;
      g.add(base);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.15, 8.0, 8), this.materials.darkMetal
      );
      pole.position.y = 4.2;
      pole.castShadow = true;
      g.add(pole);

      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6), this.materials.darkMetal
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set(0.95, 8.2, 0);
      g.add(arm);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.2, 0.48), this.materials.darkMetal
      );
      head.position.set(1.9, 8.1, 0);
      head.castShadow = true;
      g.add(head);

      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.06, 0.36), this.materials.lamp
      );
      lens.position.set(1.9, 7.97, 0);
      g.add(lens);

      this.scene.add(g);

      const ca = Math.cos(rotY), sa = Math.sin(rotY);
      const headX = x + 1.9 * ca;
      const headZ = z - 1.9 * sa;
      addGlow(headX, 7.95, headZ, 6.4, 0.8);

      if (real) {
        const light = new THREE.PointLight(0xffc386, 120, 48, 2);
        light.position.set(1.9, 7.7, 0);
        light.userData.base = 120;
        g.add(light);
        this.lamps.push(light);
      }

      this.streetLights.push({ x: headX, z: headZ });

      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 4, z), new THREE.Vector3(0.8, 8.0, 0.8)
      );
      this.colliders.push(box);
    }
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(130, 130, 1, 1);
    const ground = new THREE.Mesh(geo, this.materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.solids.push(ground);
  }

  _buildGroundDetail() {
    // Soft radial alpha used by puddles, oil stains and wet patches.
    const alphaTex = makeTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.82)');
      g.addColorStop(0.82, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 1, 1);
    alphaTex.wrapS = alphaTex.wrapT = THREE.ClampToEdgeWrapping;

    // Puddles: dark and glossy so the street lights draw real highlights.
    const puddleGeo = new THREE.PlaneGeometry(1, 1);
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x0a1420, roughness: 0.07, metalness: 0.92,
      alphaMap: alphaTex, transparent: true, opacity: 0.92,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const puddles = [
      [-8, 14, 5.2, 2.4, 0.3], [10, 2, 6.4, 3.0, -0.5], [20, -20, 4.2, 2.0, 0.9],
      [-22, -10, 5.6, 2.6, 0.2], [4, 32, 4.8, 2.2, 0.6], [-30, 8, 4.0, 1.9, -0.8],
      [28, 30, 3.6, 1.7, 0.4], [-2, -21, 4.4, 2.1, 0.1], [14, 18, 3.2, 1.5, -0.3],
    ];
    for (const [x, z, sx, sz, rot] of (this.tier === 'low' ? puddles.slice(0, 5) : puddles)) {
      const p = new THREE.Mesh(puddleGeo, puddleMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rot;
      p.scale.set(sx, sz, 1);
      p.position.set(x, 0.012, z);
      this.scene.add(p);
    }

    // Dry oil stains / grime.
    const stainMat = new THREE.MeshBasicMaterial({
      color: 0x05070a, alphaMap: alphaTex, transparent: true, opacity: 0.5,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const [x, z, sx, sz] of [
      [6, 20, 3.4, 1.7], [-16, 2, 2.8, 1.4], [24, -8, 3.0, 1.5], [-31, 22, 2.4, 1.2],
    ]) {
      const st = new THREE.Mesh(puddleGeo, stainMat);
      st.rotation.x = -Math.PI / 2;
      st.scale.set(sx, sz, 1);
      st.position.set(x, 0.011, z);
      this.scene.add(st);
    }

    // Faded tyre tracks leading away from the wrecked truck.
    const trackTex = makeTexture(128, (ctx, s) => {
      for (const bx of [0.32, 0.68]) {
        for (let i = 0; i < 55; i++) {
          ctx.fillStyle = `rgba(8,10,12,${rand(0.06, 0.2)})`;
          ctx.fillRect(bx * s + rand(-3, 3), rand(0, s), rand(2, 5), rand(16, 70));
        }
      }
    }, 1, 1);
    trackTex.wrapS = trackTex.wrapT = THREE.ClampToEdgeWrapping;
    const tracks = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 22),
      new THREE.MeshBasicMaterial({
        map: trackTex, transparent: true, opacity: 0.55,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      })
    );
    tracks.rotation.x = -Math.PI / 2;
    tracks.rotation.z = 0.16;
    tracks.position.set(-29, 0.013, 27);
    this.scene.add(tracks);

    // Painted lane dashes and a faded crosswalk (single instanced draw call).
    const paintGeo = new THREE.PlaneGeometry(0.14, 2.4);
    paintGeo.rotateX(-Math.PI / 2);
    const paintMat = new THREE.MeshBasicMaterial({
      color: 0xb6beb8, transparent: true, opacity: 0.13,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    });
    const dashes = [];
    for (const line of [-9, 9]) {
      for (let z = -35; z <= 35; z += 6) dashes.push([line, z, 0, 1]);
    }
    for (const line of [-9, 9]) {
      for (let x = -35; x <= 35; x += 6) dashes.push([x, line, Math.PI / 2, 1]);
    }

    const paint = new THREE.InstancedMesh(paintGeo, paintMat, dashes.length);
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const vec = new THREE.Vector3();
    dashes.forEach((d, i) => {
      euler.set(0, d[2], 0);
      quat.setFromEuler(euler);
      vec.set(d[0], 0.013, d[1]);
      mat4.compose(vec, quat, new THREE.Vector3(d[3], 1, 1));
      paint.setMatrixAt(i, mat4);
    });
    paint.instanceMatrix.needsUpdate = true;
    this.scene.add(paint);
  }

  _buildWalls() {
    const wallMat = this.materials.concreteDark;
    this.addBox(0, -41, 84, 7, 1.2, wallMat);
    this.addBox(0, 41, 84, 7, 1.2, wallMat);
    this.addBox(-41, 0, 1.2, 7, 84, wallMat);
    this.addBox(41, 0, 1.2, 7, 84, wallMat);
    // Buttresses along the walls for silhouette interest.
    for (let i = -3; i <= 3; i++) {
      this.addBox(i * 12, -40.2, 1.1, 5.5, 1.8, wallMat);
      this.addBox(i * 12, 40.2, 1.1, 5.5, 1.8, wallMat);
      this.addBox(-40.2, i * 12, 1.8, 5.5, 1.1, wallMat);
      this.addBox(40.2, i * 12, 1.8, 5.5, 1.1, wallMat);
    }
  }

  _buildProps() {
    const M = this.materials;

    const containers = [
      { x: -13, z: -9, rot: 0, mat: M.containerBlue },
      { x: 11, z: 7, rot: 0, mat: M.containerRust },
      { x: -17, z: 14, rot: Math.PI / 2, mat: M.containerOlive },
      { x: 18, z: -14, rot: Math.PI / 2, mat: M.containerBlue },
      { x: -4, z: -25, rot: 0, mat: M.containerRust },
      { x: 24, z: 21, rot: 0, mat: M.containerOlive },
      { x: -27, z: -22, rot: Math.PI / 2, mat: M.containerBlue },
      { x: 30, z: -3, rot: Math.PI / 2, mat: M.containerRust },
    ];
    for (const c of containers) {
      const box = this.addBox(c.x, c.z, 6.2, 2.7, 2.7, c.mat, { rotY: c.rot });
      // Hazard stripe + beacon on the roof
      const strip = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.05, 0.06), M.hazard);
      strip.position.set(0, 1.36, 1.36);
      box.add(strip);
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), M.beacon);
      beacon.position.set(2.8, 1.42, 1.2);
      box.add(beacon);
      this.beacons.push(beacon);
    }

    // Concrete jersey barriers
    const barriers = [
      [2, -6, 0.45], [-8, 6, -0.35], [27, 9, 0.8], [-25, -7, -0.2],
      [4, 21, 1.2], [-13, -18, 0.2], [15, 1, 1.5], [-2, 33, 0],
      [12, 29, 0.2], [-31, 12, 1.0], [31, -29, 0.5],
    ];
    for (const [x, z, rot] of barriers) {
      const b = this.addBox(x, z, 3.4, 1.15, 0.75, M.concrete, { rotY: rot });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 0.02), M.hazardStripes);
      stripe.position.set(0, 0.28, 0.385);
      b.add(stripe);
    }

    // Crate clusters
    const crateSpots = [
      [5, -14], [-22, 4], [15, 25], [-9, 27], [29, -15], [-6, 19],
      [21, -25], [-32, -14], [8, 12],
    ];
    for (const [x, z] of crateSpots) {
      this.addBox(x, z, 1.45, 1.35, 1.45, M.crate);
      if (Math.random() > 0.4) {
        const ox = rand(-0.15, 0.15) * 1.45;
        this.addBox(x + ox + 1.5, z + rand(-0.2, 0.2), 1.2, 1.1, 1.2, M.crate);
      }
      if (Math.random() > 0.65) {
        this.addBox(x + rand(-0.2, 0.2), z + 0.1, 1.15, 1.0, 1.15, M.crate, { y: 1.35 });
      }
    }

    // Barrels
    const barrelSpots = [
      [-6, -10, M.barrelRed], [17, 16, M.barrelBlue], [-20, -1, M.barrelBlue],
      [7, 31, M.barrelRed], [26, -20, M.barrelRed], [-30, 24, M.barrelBlue],
      [12, -31, M.barrelBlue], [-15, 33, M.barrelRed],
    ];
    for (const [x, z, mat] of barrelSpots) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.08, 14), mat);
      barrel.position.set(x, 0.54, z);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.scene.add(barrel);
      this.solids.push(barrel);
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.54, z), new THREE.Vector3(0.9, 1.08, 0.9)
      );
      this.colliders.push(box);
    }

    // A couple of concrete blocks for vertical interest.
    this.addBox(0, -12, 2.2, 1.8, 2.2, M.concrete);
    this.addBox(-18, 24, 2.4, 2.0, 1.2, M.concrete, { rotY: 0.2 });
    this.addBox(21, 3, 1.4, 2.6, 1.4, M.concrete);
  }

  _buildDetailProps() {
    const M = this.materials;
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0x8d7f60, roughness: 0.96, metalness: 0.02,
    });
    const oliveMat = new THREE.MeshStandardMaterial({
      color: 0x3f4a3a, roughness: 0.78, metalness: 0.18,
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x14171a, roughness: 0.95, metalness: 0.02,
    });
    const rustMat = new THREE.MeshStandardMaterial({
      color: 0x5d4433, roughness: 0.85, metalness: 0.25,
    });

    // --- Sandbag emplacements (capsule bags stacked in a wall) ---
    const bagGeo = new THREE.CapsuleGeometry(0.15, 0.44, 3, 8);
    const sandbagWall = (x, z, rotY, rows = 3, cols = 5) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bag = new THREE.Mesh(bagGeo, sandMat);
          bag.rotation.z = Math.PI / 2;
          bag.rotation.y = rand(-0.1, 0.1);
          bag.position.set(
            (c - (cols - 1) / 2) * 0.72 + (r % 2 ? 0.36 : 0),
            0.16 + r * 0.27,
            rand(-0.04, 0.04)
          );
          bag.castShadow = true;
          bag.receiveShadow = true;
          g.add(bag);
          this.solids.push(bag);
        }
      }
      this.scene.add(g);
      const alongX = Math.abs(Math.cos(rotY)) > 0.5;
      const w = alongX ? cols * 0.72 : 0.9;
      const d = alongX ? 0.9 : cols * 0.72;
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.55, z), new THREE.Vector3(w, 1.1, d)
      ));
    };
    sandbagWall(-21, 34.5, 0);
    sandbagWall(34.5, 24, Math.PI / 2, 2, 4);

    // --- Wrecked transport truck ---
    const truck = new THREE.Group();
    truck.position.set(-33.5, 0, 18);
    truck.rotation.y = 0.12;
    const addTruckPart = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      truck.add(m);
      this.solids.push(m);
      return m;
    };
    addTruckPart(new THREE.BoxGeometry(2.3, 0.5, 5.4), oliveMat, 0, 0.85, 0);
    addTruckPart(new THREE.BoxGeometry(2.2, 1.25, 1.9), oliveMat, 0, 1.55, 1.45);
    addTruckPart(new THREE.BoxGeometry(2.05, 0.7, 1.1), oliveMat, 0, 1.75, -1.9);
    addTruckPart(new THREE.BoxGeometry(2.0, 0.12, 1.55), rubberMat, 0, 2.2, 1.5, 0.12);
    for (const [wx, wz] of [[-1.05, 1.7], [1.05, 1.7], [-1.05, -1.7], [1.05, -1.7]]) {
      addTruckPart(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12), rubberMat, wx, 0.46, wz, 0, 0, Math.PI / 2);
    }
    addTruckPart(new THREE.BoxGeometry(2.1, 0.15, 0.5), rustMat, 0, 0.55, -2.65);
    this.scene.add(truck);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(-33.5, 1.2, 18), new THREE.Vector3(2.8, 2.4, 6.0)
    ));

    // --- Concrete pipes ---
    const pipeGeo = new THREE.CylinderGeometry(0.72, 0.72, 3.2, 16, 1, true);
    for (const [x, z, ry] of [[37.5, 8, 0.1], [37.5, 5.4, 0.2]]) {
      const pipe = new THREE.Mesh(pipeGeo, M.concrete);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = ry;
      pipe.position.set(x, 0.75, z);
      pipe.castShadow = true;
      pipe.receiveShadow = true;
      this.scene.add(pipe);
      this.solids.push(pipe);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.72, z), new THREE.Vector3(1.5, 1.45, 3.3)
      ));
    }

    // --- Cable spools ---
    for (const [x, z] of [[13, -38], [16, -38]]) {
      const spool = new THREE.Group();
      spool.position.set(x, 0, z);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 12), rustMat);
      drum.rotation.z = Math.PI / 2;
      drum.position.y = 0.62;
      drum.castShadow = true;
      spool.add(drum);
      for (const dx of [-0.46, 0.46]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 14), M.darkMetal);
        plate.rotation.z = Math.PI / 2;
        plate.position.set(dx, 0.62, 0);
        plate.castShadow = true;
        spool.add(plate);
      }
      this.scene.add(spool);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.6, z), new THREE.Vector3(1.2, 1.2, 1.9)
      ));
    }

    // --- Warning signs (emissive so they read in the dark) ---
    const signTex = makeTexture(256, (ctx, s) => {
      ctx.fillStyle = '#d9a12b';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#14161a';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, s - 16, s - 16);
      ctx.fillStyle = '#14161a';
      ctx.font = '700 30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('RESTRICTED', s / 2, 72);
      ctx.fillText('SECTOR 7G', s / 2, 112);
      ctx.fillText('LIVE FIRE', s / 2, 152);
      ctx.font = '700 18px Arial';
      ctx.fillText('AUTHORIZED USE ONLY', s / 2, 196);
    }, 1, 1);
    signTex.wrapS = signTex.wrapT = THREE.ClampToEdgeWrapping;
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex, emissive: 0x3a2a08, emissiveIntensity: 0.8,
      roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide,
    });
    for (const [x, z, ry] of [[-39, 34, 0.4], [39, -30, -0.5]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.5, 6), M.darkMetal);
      pole.position.set(x, 1.25, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), signMat);
      sign.position.set(x, 2.35, z);
      sign.rotation.y = ry;
      this.scene.add(sign);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 1.2, z), new THREE.Vector3(0.3, 2.6, 0.3)
      ));
    }

    // --- Wooden pallets ---
    for (const [x, z, ry] of [[6, 30, 0.3], [-15, -30, -0.4]]) {
      const pallet = new THREE.Group();
      pallet.position.set(x, 0, z);
      pallet.rotation.y = ry;
      for (let i = 0; i < 5; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.16), M.crate);
        slat.position.set(0, 0.14 + (i % 2) * 0.02, (i - 2) * 0.24);
        slat.castShadow = true;
        pallet.add(slat);
      }
      this.scene.add(pallet);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.1, z), new THREE.Vector3(1.3, 0.3, 1.3)
      ));
    }

    // --- Electrical switchgear cabinets with indicator LEDs ---
    const cabGeo = new THREE.BoxGeometry(0.72, 1.45, 0.44);
    const ledGreen = new THREE.MeshBasicMaterial({ color: 0x33ff55 });
    const ledRed = new THREE.MeshBasicMaterial({ color: 0xff2211 });
    const ledGeo = new THREE.SphereGeometry(0.024, 6, 6);
    const addCabinet = (x, z, ry = 0) => {
      const g = new THREE.Group();
      g.position.set(x, 0.725, z);
      g.rotation.y = ry;
      const cab = new THREE.Mesh(cabGeo, M.darkMetal);
      cab.castShadow = true;
      cab.receiveShadow = true;
      g.add(cab);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.02), M.hazardStripes);
      stripe.position.set(0, 0.38, 0.23);
      g.add(stripe);
      const lg = new THREE.Mesh(ledGeo, ledGreen);
      lg.position.set(-0.16, 0.54, 0.23);
      g.add(lg);
      const lr = new THREE.Mesh(ledGeo, ledRed);
      lr.position.set(-0.06, 0.54, 0.23);
      g.add(lr);
      this.scene.add(g);
      this.solids.push(cab);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.725, z), new THREE.Vector3(0.85, 1.5, 0.55)
      ));
    };
    addCabinet(-38, -12, Math.PI / 2);
    addCabinet(38, 18, -Math.PI / 2);
    addCabinet(-7, -38, 0);
    addCabinet(18, 38, Math.PI);

    // --- Traffic cones (reflective bands catch the street lights) ---
    const coneOrange = new THREE.MeshStandardMaterial({
      color: 0xd9601f, roughness: 0.7, metalness: 0.05,
    });
    const coneBand = new THREE.MeshStandardMaterial({
      color: 0xe8e4d6, emissive: 0x2a2620, emissiveIntensity: 0.35,
      roughness: 0.55, metalness: 0.05,
    });
    const coneBaseMat = new THREE.MeshStandardMaterial({
      color: 0x22262b, roughness: 0.9, metalness: 0.05,
    });
    const coneSpots = [[-4.5, 9.5], [2.5, 6.5], [9, -4], [21.5, 12], [-19, 20.5], [30.5, -21]];
    for (const [x, z] of coneSpots) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rand(0, Math.PI * 2);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), coneBaseMat);
      base.position.y = 0.025;
      g.add(base);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.19, 0.66, 10), coneOrange);
      cone.position.y = 0.36;
      cone.castShadow = true;
      g.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.145, 0.1, 10), coneBand);
      band.position.y = 0.38;
      g.add(band);
      this.scene.add(g);
    }

    // --- Dumpster against the west wall ---
    const dumpster = new THREE.Group();
    dumpster.position.set(-35.5, 0, -6);
    dumpster.rotation.y = 0.12;
    const dumpMat = new THREE.MeshStandardMaterial({
      color: 0x2f4a3d, roughness: 0.62, metalness: 0.45,
      normalMap: normalFor(1, 1, 1.8), normalScale: new THREE.Vector2(0.3, 0.3),
    });
    const dumpBody = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.35, 1.55), dumpMat);
    dumpBody.position.y = 0.82;
    dumpBody.castShadow = true; dumpBody.receiveShadow = true;
    dumpster.add(dumpBody);
    const dumpLid = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.1, 1.6), dumpMat);
    dumpLid.position.set(0, 1.53, -0.05);
    dumpLid.rotation.x = -0.12;
    dumpLid.castShadow = true;
    dumpster.add(dumpLid);
    for (const [wx, wz] of [[-1.0, 0.55], [1.0, 0.55], [-1.0, -0.55], [1.0, -0.55]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 8), rubberMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.14, wz);
      dumpster.add(wheel);
    }
    this.scene.add(dumpster);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(-35.5, 0.85, -6), new THREE.Vector3(3.0, 1.7, 1.9)
    ));

    // --- Generator trailer near the relay mast ---
    const gen = new THREE.Group();
    gen.position.set(7.6, 0, -31.6);
    gen.rotation.y = -0.1;
    const genMat = new THREE.MeshStandardMaterial({ color: 0x5b6152, roughness: 0.7, metalness: 0.35 });
    const genBody = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.15, 1.15), genMat);
    genBody.position.y = 0.85;
    genBody.castShadow = true; genBody.receiveShadow = true;
    gen.add(genBody);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.82), M.darkMetal);
    grille.position.set(1.16, 0.9, 0);
    gen.add(grille);
    const genBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), M.beacon);
    genBeacon.position.set(0.7, 1.48, 0);
    gen.add(genBeacon);
    this.beacons.push(genBeacon);
    for (const wx of [-0.75, 0.75]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10), rubberMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.28, 0.62);
      gen.add(wheel);
    }
    this.scene.add(gen);
    this.colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(7.6, 0.9, -31.6), new THREE.Vector3(2.6, 1.8, 1.5)
    ));

    // --- Utility cabinets ---
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x6d747c, roughness: 0.55, metalness: 0.55,
      normalMap: normalFor(1, 1, 1.6), normalScale: new THREE.Vector2(0.25, 0.25),
    });
    for (const [x, z, ry] of [[34, 12, -0.2], [-34, 31, 0.35]]) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.7), cabinetMat);
      cab.position.set(x, 0.75, z);
      cab.rotation.y = ry;
      cab.castShadow = true; cab.receiveShadow = true;
      this.scene.add(cab);
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 0.75, z), new THREE.Vector3(1.2, 1.5, 1.0)
      ));
    }
  }

  _buildAtmosphere() {
    // Ground light pools beneath the yard lamps.
    const poolTex = makeTexture(256, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,178,96,0.64)');
      g.addColorStop(0.35, 'rgba(255,150,70,0.3)');
      g.addColorStop(0.72, 'rgba(255,120,40,0.1)');
      g.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 1, 1);
    poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping;
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    const poolGeo = new THREE.PlaneGeometry(19, 19);
    for (const [x, z] of this.lampSpots) {
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.015, z);
      this.scene.add(pool);
    }

    // Wider, stronger pools under the street lights so the lanes read as lit roads.
    const streetPoolTex = makeTexture(256, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,205,150,0.78)');
      g.addColorStop(0.3, 'rgba(255,170,100,0.4)');
      g.addColorStop(0.65, 'rgba(255,140,60,0.14)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 1, 1);
    streetPoolTex.wrapS = streetPoolTex.wrapT = THREE.ClampToEdgeWrapping;
    const streetPoolMat = new THREE.MeshBasicMaterial({
      map: streetPoolTex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    const streetPoolGeo = new THREE.PlaneGeometry(30, 30);
    for (const s of this.streetLights) {
      const pool = new THREE.Mesh(streetPoolGeo, streetPoolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(s.x, 0.016, s.z);
      this.scene.add(pool);
    }

    // Searchlight beams sweeping the sky.
    this.searchlights = [];
    // A vertical gradient (bright at the lamp, gone at the top) plus a rim fade
    // in the shader keeps the cone reading as light haze instead of a hard tube.
    const beamTex = (() => {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 128;
      const bx = c.getContext('2d');
      const g = bx.createLinearGradient(0, 128, 0, 0);
      g.addColorStop(0.0, 'rgba(255,255,255,1)');
      g.addColorStop(0.12, 'rgba(255,255,255,0.62)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.05)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      bx.fillStyle = g;
      bx.fillRect(0, 0, 16, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    })();
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTex, color: 0xbfd6f2, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    // Fade the silhouette so the beam has no hard vertical edge.
    beamMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBeamN;\nvarying vec3 vBeamV;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vBeamN = normalize(normalMatrix * normal);
          vBeamV = normalize(-mvPosition.xyz);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBeamN;\nvarying vec3 vBeamV;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float beamRim = abs(dot(normalize(vBeamN), normalize(vBeamV)));
          gl_FragColor.a *= smoothstep(0.0, 0.72, beamRim);`);
    };
    const beamGeo = new THREE.CylinderGeometry(4.6, 0.14, 36, this.tier === 'low' ? 8 : 14, 1, true);
    for (const [x, z, phase] of [[-37, -37, 0], [37, 35, 2.1]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 7.2, 8), this.materials.darkMetal);
      pole.position.set(x, 3.6, z);
      pole.castShadow = true;
      this.scene.add(pole);

      const group = new THREE.Group();
      group.position.set(x, 7.1, z);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 18;
      beam.frustumCulled = false;
      group.add(beam);
      const source = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xdcecff })
      );
      group.add(source);
      this.scene.add(group);
      this.searchlights.push({ group, phase, baseX: 0.18 });
      this.colliders.push(new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 3.6, z), new THREE.Vector3(0.8, 7.4, 0.8)
      ));
    }

    // Low clouds drifting across the moon.
    const cloudTex = makeTexture(256, (ctx, s) => {
      for (let i = 0; i < 16; i++) {
        const cx = rand(0, s), cy = rand(0, s);
        const r = rand(20, 60);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(120,140,165,0.16)');
        g.addColorStop(1, 'rgba(120,140,165,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }, 1, 1);
    cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;
    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.55,
      color: 0x6f8198, depthWrite: false, fog: false,
    });
    this.clouds = [];
    const cloudCount = this.tier === 'low' ? 3 : 5;
    for (let i = 0; i < cloudCount; i++) {
      const cloud = new THREE.Sprite(cloudMat.clone());
      cloud.position.set(rand(-160, 160), rand(52, 88), rand(-190, -120));
      cloud.scale.set(rand(110, 170), rand(34, 52), 1);
      cloud.material.rotation = rand(-0.2, 0.2);
      cloud.material.opacity = rand(0.18, 0.32);
      cloud.material.color.set(0x9fb2c8);
      this.scene.add(cloud);
      this.clouds.push({ sprite: cloud, speed: rand(0.25, 0.7) });
    }
  }

  /* Distant city silhouettes and light shafts. Both are pure atmosphere:
     no colliders, no gameplay impact, one draw call each. */
  _buildBackdrop() {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 2048, 512);
    let x = 0;
    while (x < 2048) {
      const w = rand(40, 130);
      const h = rand(90, 300);
      const top = 512 - h;
      ctx.fillStyle = `rgb(${rand(10, 18)},${rand(14, 22)},${rand(20, 30)})`;
      ctx.fillRect(x, top, w, h);
      // A few lit windows, sparse and warm.
      const cols = Math.floor(w / 16);
      const rows = Math.floor(h / 20);
      for (let ci = 1; ci < cols; ci++) {
        for (let ri = 1; ri < rows; ri++) {
          if (Math.random() > 0.12) continue;
          const warm = Math.random() > 0.35;
          ctx.fillStyle = warm
            ? `rgba(255,190,110,${rand(0.35, 0.85)})`
            : `rgba(150,205,255,${rand(0.25, 0.6)})`;
          ctx.fillRect(x + ci * 16, top + ri * 20, 5, 7);
        }
      }
      // Rooftop details.
      if (Math.random() > 0.6) {
        ctx.fillStyle = 'rgba(12,16,22,1)';
        ctx.fillRect(x + w * 0.25, top - rand(8, 26), rand(8, 20), 26);
      }
      // Small gap between buildings.
      x += w + rand(2, 16);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.anisotropy = TEX_ANISO;
    const geo = new THREE.CylinderGeometry(135, 135, 46, 48, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.y = 16;
    ring.renderOrder = -1;
    this.scene.add(ring);
    this.skyline = ring;
  }

  _buildLightShafts() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,214,160,0.55)');
    g.addColorStop(0.35, 'rgba(255,198,140,0.2)');
    g.addColorStop(1, 'rgba(255,190,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: 0xffd0a0, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: true,
    });
    const geo = new THREE.ConeGeometry(2.15, 7.5, 18, 1, true);
    for (const s of (this.streetLights || [])) {
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(s.x, 4.1, s.z);
      cone.renderOrder = 2;
      this.scene.add(cone);
    }
  }

  _buildTower() {    // Radio relay mast against the north wall - the yard's landmark.
    const x = 0, z = -36;
    const mat = this.materials.darkMetal;
    const legs = [
      [-1.1, 0, -1.1], [1.1, 0, -1.1], [-1.1, 0, 1.1], [1.1, 0, 1.1],
    ];
    for (const [lx, , lz] of legs) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 11, 6), mat);
      leg.position.set(x + lx * 0.55, 5.5, z + lz * 0.55);
      leg.rotation.z = -lx * 0.014;
      leg.rotation.x = lz * 0.014;
      leg.castShadow = true;
      this.scene.add(leg);
    }
    for (let i = 1; i <= 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75 - i * 0.07, 0.025, 4, 4), mat);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.set(x, i * 2, z);
      this.scene.add(ring);
    }
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.25, 0.35, 16, 1, true), mat);
    dish.position.set(x, 9.4, z + 0.4);
    dish.rotation.x = -0.5;
    this.scene.add(dish);
    const lightMat = this.materials.beacon.clone();
    lightMat.emissiveIntensity = 3;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lightMat);
    light.position.set(x, 11.2, z);
    this.scene.add(light);
    this.beacons.push(light);

    const beaconPoint = new THREE.PointLight(0xff2211, 40, 32, 2);
    beaconPoint.position.set(x, 11.2, z);
    this.scene.add(beaconPoint);
    this.towerLight = beaconPoint;

    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(x, 5.5, z), new THREE.Vector3(3.0, 11, 3.0)
    );
    this.colliders.push(box);
    this.solids.push(dish);
  }

  _buildDust() {
    const count = this.dustCount;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(-55, 55);
      pos[i * 3 + 1] = rand(0.2, 13);
      pos[i * 3 + 2] = rand(-55, 55);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xa9c0d8, size: 0.05, sizeAttenuation: true,
      transparent: true, opacity: 0.2, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  _buildSpawns() {
    this.spawnPoints = [
      new THREE.Vector3(34, 0, 0),
      new THREE.Vector3(-34, 0, 0),
      new THREE.Vector3(0, 0, 34),
      new THREE.Vector3(0, 0, -34),
      new THREE.Vector3(25, 0, 28),
      new THREE.Vector3(-26, 0, 28),
      new THREE.Vector3(25, 0, -28),
      new THREE.Vector3(-26, 0, -28),
      new THREE.Vector3(34, 0, 17),
      new THREE.Vector3(-34, 0, -15),
      new THREE.Vector3(17, 0, 34),
      new THREE.Vector3(-17, 0, -34),
    ];
    this.playerStart = new THREE.Vector3(0, 0, 26);
  }

  /* ---------------------- helpers ---------------------- */
  _stripNormalMaps() {
    const seen = new Set();
    this.scene.traverse((o) => {
      if (!o.isMesh && !o.isSprite) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        if (m.normalMap) {
          m.normalMap.dispose();
          m.normalMap = null;
          m.needsUpdate = true;
        }
      }
    });
  }

  addBox(x, z, w, h, d, material, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, (opts.y || 0) + h / 2, z);
    mesh.rotation.y = opts.rotY || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (opts.collide !== false) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      this.colliders.push(box);
      this.solids.push(mesh);
    }
    return mesh;
  }

  update(dt, time) {
    const pulse = 1.2 + Math.sin(time * 2.4) * 1.4;
    const beaconMat = this.materials.beacon;
    beaconMat.emissiveIntensity = pulse;
    if (this.towerLight) {
      this.towerLight.intensity = 20 + Math.sin(time * 2.4) * 22;
    }
    for (const b of this.beacons) {
      if (b.material && b.material !== beaconMat) {
        b.material.emissiveIntensity = 2.6 + Math.sin(time * 2.4 + 1) * 1.6;
      }
    }
    // Gentle lamp flicker.
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      const base = l.userData.base || 100;
      l.intensity = base * (0.985 + Math.sin(time * 9 + i * 2.1) * 0.018 + Math.sin(time * 23 + i) * 0.009);
    }
    if (this.dust) this.dust.rotation.y += dt * 0.006;

    if (this.searchlights) {
      for (const s of this.searchlights) {
        s.group.rotation.z = Math.sin(time * 0.09 + s.phase) * 0.55;
        s.group.rotation.x = 0.16 + Math.cos(time * 0.07 + s.phase) * 0.28;
      }
    }
    if (this.clouds) {
      for (const c of this.clouds) {
        c.sprite.position.x += dt * c.speed;
        if (c.sprite.position.x > 210) c.sprite.position.x = -210;
      }
    }
  }
}
