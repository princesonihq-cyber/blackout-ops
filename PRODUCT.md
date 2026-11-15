# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two confirmed audiences, in priority order:

1. **Portfolio audience** — recruiters, developers and other devs who land on
   the game via the author's GitHub (princesonihq-cyber/blackout-ops) and judge
   it as a technical + design showcase. First impression and polish carry the
   evaluation.
2. **Friends / community playtesters** — people the author shares the link with
   directly; their feedback drives iteration.

Casual players who find the link and want a quick browser FPS with zero setup
are a secondary but welcome audience.

## Product Purpose

BLACKOUT OPS is a wave-survival tactical FPS that runs entirely in a browser
tab. Three weapons, four enemy archetypes, killstreaks, grenades, and a dark
relay-yard arena. Success means: someone opens one link and gets an experience
that feels close to a AAA shooter without installing anything.

## Positioning

**AAA feel, zero install.** A shooter that looks and plays close to a real
CoD title, yet needs no download, no install, no shipped assets — everything in
the game (textures, models, sounds, the arena) is generated in code at runtime.

## Operating Context

- **Local run:** `start.bat` (or `node server.js`) serves the game at
  `http://localhost:8080`; the tiny Node server exists because ES modules
  refuse to load from `file://`.
- **Live home:** Vercel (`vercel.json` with cleanUrls and immutable caching for
  `/vendor/`). Source lives on GitHub at
  `https://github.com/princesonihq-cyber/blackout-ops` (branch `main`).
- **Play modes:** desktop (WASD + mouse, pointer lock) and phones/tablets
  (touch HUD: floating stick, look-drag, button cluster; deploy asks for
  fullscreen + landscape).
- **Sessions are short:** wave-survival runs, best run saved locally.

## Capabilities and Constraints

- **Fully offline / self-contained:** Three.js r160 is vendored in
  `vendor/three.module.js`; there is no external art, audio, font, or CDN
  dependency. Future work must not add one.
- **Performance floor:** must run acceptably on weak hardware (low-end phones,
  tablets, laptops). Quality tiers `balanced` / `high` / `ultra`
  (localStorage `bo_tier`, `?q=` override) with an automatic fallback that
  drops shadows/effects rather than render resolution — the image never drops
  below native 1.0×.
- **Input surface:** keyboard+mouse and touch must both keep working; the
  touch HUD is user-customizable (Custom HUD editor).
- **Debug harness:** `?debug` enables the `blackout-debug` event system and the
  `window.__blackout` scene hook; `?noptr`, `&autostart`, `&fixed`, `&touch`
  support automation and screenshots.
- **Persistence:** localStorage only (`bo_best`, `bo_tier`, HUD layout). No
  accounts, no backend, no analytics — undecided if ever, not promised.
- **Single-player only.** No multiplayer scope exists.

## Brand Commitments

- The name **BLACKOUT OPS** is binding.
- **Military-stencil voice:** terse uppercase radio-copy ("TOP SECRET //
  TIER-ONE DIRECT ACTION"), mono micro-labels in the HUD, stencil eyebrow
  motifs. This is the incumbent identity the user has confirmed; future work
  preserves it.
- Orange-on-dark-navy signal color system is part of the identity
  (functional state glows are intentional feedback, not decoration).

## Evidence on Hand

- A complete, working game (this repository) — the primary evidence.
- README.md documents controls, presets, enemy archetypes, weapons, project
  layout, and debug helpers.
- **No** testimonials, case studies, press, player metrics, or external
  reviews exist. Future work must not fabricate any of these.
- Gameplay/menu screenshots exist only as local verification artifacts, not
  committed marketing assets.

## Product Principles

1. **One link, zero friction.** No installs, logins, downloads, or asset
   fetches — ever.
2. **Sharp on every device.** Never render blurry; when hardware struggles,
   degrade effects and shadows, not resolution.
3. **Craft is the credential.** For the portfolio audience, polish and
   correctness are the product; broken or janky states are failures.
4. **Feedback is function.** HUD glow, hitmarkers, radar blips communicate
   state honestly; decoration that only glows gets removed.
5. **Procedural self-sufficiency.** New content comes from code, not shipped
   binaries or downloaded assets.

## Accessibility & Inclusion

No formal WCAG target was set. Established working floors that future work
must maintain:

- Functional HUD/menu text stays at a legibility floor (~9.5–10px minimum,
  body copy ≥12.5px) — confirmed in the 2026-11 UI pass.
- Touch buttons must not overlap at supported viewports; verified sizes
  include 667×375, 844×390, 390×844, 1024×768, 1180×820.
- The game is fully playable with either input scheme (desktop or touch).
