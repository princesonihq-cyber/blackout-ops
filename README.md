# BLACKOUT OPS

A wave-survival tactical FPS that runs in your browser. Three weapons, four
hostile archetypes, killstreaks, grenades and a dark relay yard — with nothing
but your aim.

Built with Three.js — no external art or audio. Weapons, enemies, the arena,
textures, normal maps, and every sound are generated in code.

## Run it

1. Double-click **`start.bat`**.
2. Your browser opens at `http://localhost:8080`.

The tiny Node server is required because the game uses ES modules, which
browsers refuse to load straight from `file://`. Close the console window (or
press `Ctrl+C`) to stop it.

If the browser doesn't open automatically, go to <http://localhost:8080>.

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look | Mouse |
| Fire | Left mouse |
| Aim down sights | Right mouse |
| Sprint | `Shift` |
| Slide | `Ctrl` while sprinting |
| Crouch | `Ctrl` or `C` |
| Jump | `Space` |
| Reload | `R` |
| Switch weapon | `1` `2` `3` or mouse wheel |
| Flashlight | `F` |
| Frag grenade | `G` |
| Knife melee | `V` |
| UAV killstreak | `4` |
| Airstrike killstreak | `5` |
| Pause | `Esc` |
| Quit to menu (paused) | `Q` |

### Touch controls

The game detects phones and tablets on its own and swaps in an on-screen
layout: a left thumbstick for movement, drag anywhere on the right to look, and
buttons for fire, aim, reload, jump, crouch, sprint, swap, frag, knife, UAV and
airstrike. Deploying asks for fullscreen and landscape. Crouch is a toggle;
tapping it while sprinting slides instead.

## Graphics Quality Presets

You can toggle the graphics preset directly from the main menu and pause screen with the **GRAPHICS QUALITY** button:

| Tier | Profile | Resolution | Shadows | Details |
| --- | --- | --- | --- | --- |
| ultra | Desktop / High-End | up to 2.0x (Hi-DPI) | 2048px PCF Soft | Ultra textures, normal maps, dust, flashlight, tower beacon |
| high | Laptops / Tablets | up to 1.75x | 2048px PCF Soft | High textures, normal maps, full effects |
| balanced | Low power devices | 1.0x native | 1024px PCF Soft | Smooth performance without blur |

Resolution never drops below native 1.0x, ensuring graphics stay razor-sharp and clear without bilinear blur. Append `?q=balanced`, `?q=high` or `?q=ultra` to force a preset via URL.

## How to play

- Hold the relay yard against escalating waves. Clear a wave to earn armor, an
  ammo resupply and a full frag restock; the next wave starts after a regroup.
- Headshots deal heavy bonus damage and score extra points.
- Health regenerates after five seconds out of contact. Armor absorbs damage
  first.
- Enemies paint you with a red laser before firing — break line of sight or
  move.
- Killstreaks: 5 kills earns a UAV (extends radar range and reveals every
  hostile for 20 seconds), 10 kills earns a six-pass airstrike. Press `4` / `5`
  to use them.
- Every 6 kills triggers a field resupply: ammo and a frag grenade.
- Multi-kills (2+ kills within ~4 seconds) flash a medal on screen.
- Your best run is saved locally and shown on the main menu.

## Enemy archetypes

| Enemy | Behaviour |
| --- | --- |
| Grunt | Standard rifleman, holds mid range and strafes |
| Rusher | Fast, lightly armoured, closes in and swings a blade |
| Heavy | Slow, heavily armoured, hits harder |
| Juggernaut | Appears from wave 5, huge health, devastating fire |

## Weapons

| Slot | Weapon | Role |
| --- | --- | --- |
| 1 | M4A1 Vanguard | Automatic rifle, all-rounder |
| 2 | SPAS-12 Breacher | Pump shotgun, brutal up close |
| 3 | M9 Sidearm | Semi-auto backup, fast reload |

## Project layout

```
index.html          menu, HUD, screens
styles.css          HUD and menu styling
server.js           static file server (port 8080)
start.bat           launches server + browser
src/main.js         game loop, input, waves, scoring, killstreaks
src/player.js       movement, collisions, camera, slide, health
src/weapons.js      weapon definitions, viewmodels, firing, melee
src/enemies.js      enemy models, variants and AI
src/grenades.js     frag physics, explosions, airstrike barrage
src/world.js        arena, lighting, normal maps, props, atmosphere
src/effects.js      tracers, impacts, blood, smoke, casings, explosions
src/ui.js           HUD, radar, compass, killfeed, medals
src/audio.js        synthesised sound
src/utils.js        math and collision helpers
vendor/three.module.js  Three.js r160, vendored for offline play
```

## Debug helpers

Append `?debug` to the URL to enable the `blackout-debug` event harness and the
`window.__blackout` scene hook. Add `&noptr` to skip pointer lock (useful for
automation) and `&autostart` to skip the menu. Combine with
`&q=balanced|high|ultra` to pin the quality tier, `&touch` to force the touch HUD
on a desktop browser, and `&fixed` to lock the render resolution (no adaptive
scaling) when comparing screenshots.
