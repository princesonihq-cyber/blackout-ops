---
name: BLACKOUT OPS
description: Tactical wave-survival FPS HUD — AAA feel, zero install, all-procedural night ops
colors:
  midnight-black: "#05070b"
  panel-steel: "rgba(8, 12, 18, .72)"
  panel-solid: "rgba(7, 10, 15, .92)"
  dossier-ink: "#e8eef5"
  field-dim: "#8b97a5"
  muzzle-flash-orange: "#ff7a1a"
  ember-hot: "#ffa350"
  signal-amber: "#ffc46b"
  alert-red: "#ff3b30"
  go-green: "#58e08a"
  dossier-paper: "#e8e1cf"
  paper-ink: "#211b12"
  paper-soft: "#6d6350"
  paper-accent: "#8f3f11"
  paper-red: "#b3271d"
  paper-line: "rgba(33, 27, 18, .2)"
  threat-line: "rgba(255, 122, 26, .32)"
  soft-line: "rgba(180, 200, 220, .14)"
typography:
  display:
    fontFamily: "Bahnschrift, DIN Alternate, Arial Narrow, Segoe UI, sans-serif"
    fontSize: "clamp(62px, 8.4vw, 134px)"
    fontWeight: 900
    lineHeight: 0.78
    letterSpacing: "normal"
  headline:
    fontFamily: "Bahnschrift, DIN Alternate, Arial Narrow, Segoe UI, sans-serif"
    fontSize: "58px"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.04em"
  title:
    fontFamily: "Bahnschrift, DIN Alternate, Arial Narrow, Segoe UI, sans-serif"
    fontSize: "25px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.14em"
  hud-value:
    fontFamily: "Consolas, SF Mono, Courier New, monospace"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Consolas, SF Mono, Courier New, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "Consolas, SF Mono, Courier New, monospace"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.2em"
rounded:
  sharp: "0px"
  chip: "3px"
  soft: "4px"
  touch: "11px"
  dot: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.muzzle-flash-orange}"
    textColor: "#0a0c10"
    typography: "{typography.title}"
    rounded: "{rounded.sharp}"
    padding: "14px 30px 13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.ember-hot}"
    textColor: "#0a0c10"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.field-dim}"
    rounded: "{rounded.sharp}"
    padding: "9px 26px"
  chip:
    backgroundColor: "rgba(14, 24, 36, .65)"
    textColor: "rgba(215, 230, 245, .82)"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 10px"
  hud-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.dossier-ink}"
    rounded: "{rounded.sharp}"
    padding: "11px 16px 12px 14px"
  touch-button:
    backgroundColor: "rgba(14, 22, 34, .82)"
    textColor: "rgba(222, 237, 252, .85)"
    rounded: "{rounded.touch}"
    size: "46px"
---

# Design System: BLACKOUT OPS

## Overview

**Creative North Star: "The Field Dossier"**

Every surface reads like a page out of declassified military hardware: stamps,
stencils, chain-of-command eyebrows ("TOP SECRET // TIER-ONE DIRECT ACTION"),
classification badges, and terse radio copy. The UI is paperwork from a war
that is already happening — hard, functional, cinematic-dark. Orange is the
classification color and the only voice of command; everything else is steel
and shadow. The 3D scene is a night yard lit by sodium lamps and moonlight,
and the HUD sits over it like an overlay printed on the operator's optics.

Density is high but honest: micro-labels are deliberately tiny stencil type,
while every value a player acts on (health, ammo, score) is a large mono
numeral. Depth comes from black ambient shadow, never colored halos — colored
light is reserved for state. Corners are cut with clip-path notches, not
rounded; nothing in this system is soft.

**Key Characteristics:**
- Stencil micro-labels (mono, uppercase, tracked wide) against large mono data values
- One command color: Muzzle Flash Orange, used at small fractions of any screen
- Cut-corner notched silhouettes (clip-path) instead of rounded cards
- Black depth shadows; zero-offset glow exists only as functional state feedback
- Condensed DIN-family display type over Consolas mono data
- Two materials only: transparent glass for the live HUD, and paper for the
  menu and modals — the dossier is an object laid over the yard

## Colors

Palette character: a near-black navy yard lit by one hot signal color and its
warm satellite tones; status colors (red, green) are semantic only.

### Primary
- **Muzzle Flash Orange** (#ff7a1a): The command voice — DEPLOY button, HUD
  accents, compass needle, crosshair-adjacent marks, the classification color
  of every eyebrow and stencil line. It must stay rare; scarcity is what makes
  it read as signal.
- **Ember Hot** (#ffa350): Hover and pressed states of orange elements; the
  bright end of the primary gradient.

### Secondary
- **Signal Amber** (#ffc46b): Stencil badge text and warm highlights
  (AUTHENTICATED stamp, best-run stat, streak-ready icons). Softer than the
  primary so it reads as stamped ink rather than a second command color.

### Tertiary
- **Alert Red** (#ff3b30): Damage and threat only — low-health bar, hit
  direction, threat pills, the K.I.A. modal rail. Never decorative.
- **Go Green** (#58e08a): Positive status — radar dot, health fill, status
  indicators. Paired against Alert Red as its semantic opposite.

### Neutral
- **Midnight Black** (#05070b): Page background; the yard's darkness.
- **Panel Steel** (rgba(8,12,18,.72)): Translucent HUD glass panels.
- **Panel Solid** (rgba(7,10,15,.92)): opaque surfaces that must fully separate
  from the 3D scene (the pause/K.I.A. backdrops).
- **Dossier Paper** (#e8e1cf): the menu sheet and modals — the system's second
  material, printed two-colour ink on cream stock.
- **Dossier Ink** (#e8eef5): Primary text on dark surfaces.
- **Field Dim** (#8b97a5): Secondary text, ghost buttons, quiet labels.
- **Threat Line** (rgba(255,122,26,.32)): Orange-tinted borders on active/
  command surfaces.
- **Soft Line** (rgba(180,200,220,.14): Hairline borders and quiet dividers.

### Named Rules
**The 5% Orange Rule.** Muzzle Flash Orange covers a small fraction of any
screen — a rail, a needle, a stamp, one button. Its rarity is the point; bulk
orange fills would turn the command color into decoration.

**The State Light Rule.** Zero-offset colored glow (box-shadow / text-shadow at
0 0) is allowed only as state feedback — health fill, streak-ready button,
compass needle, hitmarker, visible-enemy radar blips. Decorative static glows
are banned.

## Typography

**Display Font:** Bahnschrift (with DIN Alternate, Arial Narrow, Segoe UI
fallbacks) — a condensed DIN-style face with a stencil-military voice.
**Body Font:** Consolas (with SF Mono, Courier New fallbacks) — terminal mono
for data values and radio copy.
**Label/Mono Font:** Consolas, same stack as body.

**Character:** An officer's hand on a stencil machine — condensed DIN carries
commands, Consolas carries data. Everything is uppercase by default; the mono
numerals are the largest voice on any HUD surface.

### Hierarchy
- **Display** (900, clamp(62px, 8.4vw, 134px), 0.78): Title only — the BLACKOUT
  / OPS hero stack. Nowhere else.
- **Headline** (800, 58px, 0.9, 0.04em): Modal h2s (PAUSED, K.I.A.).
- **Title** (800, 25px, 0.14em): Button labels (DEPLOY, RESUME). 20px in the
  compact small variant.
- **HUD Value** (700, 40px / -0.03em; health 24px): Ammo counters, health
  number, scoreboard stats — the numbers players act on.
- **Body** (400, 12.5px, 1.75): modal and HUD copy. Mono. Measure ≤ 420px.
  (The menu's readable paragraph is the exception: UI face, 16px, see Printed
  body above.)
- **Label** (700, 9.5–10px, 0.12–0.2em, uppercase): Stencil micro-labels
  (SCORE, ARMOR, VITALS, eyebrows, tags). The 9.5–10px floor is a confirmed
  legibility commitment; below it nothing functional may go.
- **Printed body** (400, 16px, 1.55, Bahnschrift): the one readable paragraph
  on the dossier (`.folder-sub`, modal copy); UI face, not mono, capped at 52ch.
- **Ledger line** (700, 13.5px name / 400 12px description / 700 15px mono
  value): the menu table. Names and descriptions in the UI face, values in
  mono so the data still speaks louder.

### Named Rules
**The Stencil Rule.** Wide tracking (0.12em+) belongs to short uppercase
labels only. Sentences and body copy read at normal tracking (≤ 0.05em) —
wide-tracked paragraphs are a legibility failure, not a mood.

**The Data Speaks Louder Rule.** When a label and its value share a panel, the
value is mono, large, and brighter than the label ever is.

## Layout

The game is a fixed full-bleed viewport — no page scroll, `overflow: hidden`.
The HUD is corner-anchored: objective + radar/minimap top (topbar-left /
top-right), vitals bottom-left, weapon panel bottom-right, scoreboard
top-center. Panels are absolutely placed with safe-area insets for notched
phones.

The menu is a **physical dossier laid on the yard**: `.folder-stack` holds two
ghost pages offset behind one cream sheet (max 900px), pull-tabs cut into its
top edge, and a print strip underneath. The sheet itself is padded on the left
for a punched gutter (`::before` draws the holes and the red margin rule), and
all menu content is printed on it in two columns (`1fr 1fr`, 34px gutter) that
collapse to one column at 760px. The sheet is the page: there is no card inside
a card, no panel grid.

The menu overlay is a neutral radial scrim (`rgba(3,5,9,.34)` centre to `.96`
edges), not a black wall, so the lit yard, the truck and the sodium lamps stay
readable behind the paper — the scene is the photograph this page does not
otherwise have.

Spacing rhythm steps at 4 / 8 / 16 / 24 / 32px. Touch targets: 46px squares
for utility buttons, 60px for ADS, 84px circle for FIRE, arranged in clusters
that must not overlap at any supported viewport (verified at 667×375,
844×390, 390×844, 1024×768, 1180×820).

Breakpoints: 420px, 760px, 1080px, plus `pointer: coarse` and orientation
queries. Under 760px the tabs move out of the sheet (`bottom: 100%`) and wrap
upward over the scrim with a 74px stack top margin, so they never cover the
form header; under 420px the clip and the issue line drop and the stamp shrinks
beside the section head. Short landscape phones (≤ 430px tall) hide the title,
sub, stamp, sheet header, paper clip and options, and compress the ledger to
25px rows so DEPLOY stays above the fold.

## Elevation & Depth

Depth is black and ambient: shadows carry offset and blur (never zero-offset
except functional state glow), rising with importance — HUD glass sits on
subtle depth, modals on the deepest. Colored light never casts shadow;
colored glow marks state (see The State Light Rule). Over the live 3D scene,
depth is also communicated by translucency — panels tint the world behind
them with `backdrop-filter: blur` kept deliberately light (2–4px) so the view
stays readable. The paper sheet is the one opaque, shadow-casting object: it is
laid over the yard, so its depth comes from a single deep cast shadow plus the
ghost pages behind it, never from glass.

### Shadow Vocabulary
- **HUD glass** (`0 4px 18px rgba(0,0,0,.4)` + faint inner tint): resting HUD panels.
- **Card lift** (`0 12px 40px rgba(0,0,0,.55)`): minimap shell, menu cards.
- **Modal deep** (`0 8px 32px rgba(0,0,0,.8)`): pause/game-over modals.
- **Command hover** (`0 10px 30px rgba(255,100,20,.28)`): orange-button hover lift — offset, tinted, still a shadow.
- **State glow** (`0 0 12px <state color>`): functional feedback only.

### Named Rules
**The Night Depth Rule.** Shadows are black with real offset; they describe
physical lift over the night yard. Colored light describes state, never
shadow.

## Shapes

The form language is cut, not curved. Command surfaces (primary buttons,
graphics toggle, minimap shell, banners) use clip-path corner notches — a
top-right or bottom-right 45° cut of 12–16px — echoing stencil plates and
dossier corners. Small elements (chips, badges) use 3–4px radius at most;
touch buttons round to 11px for ergonomics; perfect circles are reserved for
dots and the FIRE button. Borders are 1px hairlines (Soft Line) or 1.5–2px
orange-tinted (Threat Line) when the surface is "live". No radius token
exceeds 4px outside touch ergonomics.

## Components

### Buttons
- **Shape:** sharp corners with a 16px top-right clip-path notch (0px radius)
- **Primary:** Muzzle Flash Orange gradient fill, near-black text, 25px
  tracked label + 9px kicker, padding 14px 30px 13px 22px; hover lifts to
  Ember Hot with an offset tinted shadow and −2px translate
- **Ghost:** transparent on panel, Field Dim text, hairline border, 9px 26px
  padding; hover brightens to white with a soft border
- **Compact small:** 20px label variant for modal actions

### Chips
- **Style:** Panel-steel background, Soft Line border, 3px radius, mono
  9–10px tracked uppercase, Dossier Ink text
- **State:** static by design (capability tags); the stencil badge variant
  (AUTHENTICATED) uses Signal Amber on a 15% orange wash with a 35% orange border

### Cards / Containers
- **Corner Style:** notched clip-path (HUD, minimap, buttons) or 0–4px radius
- **Background:** Panel Steel (HUD, translucent over 3D) or Panel Solid (menu,
  modals — must fully occlude)
- **Shadow Strategy:** per Elevation — black, offset, deepest for modals
- **Border:** 1px Soft Line default; Threat Line orange for command/active
  surfaces; modals carry a 2px orange (or red for K.I.A.) left rail

### Touch Buttons
- **Style:** 11px radius squares (46px utility, 60px ADS, 84px circle FIRE) on
  Panel Steel with Soft Line borders, mono 9px icon labels at 0.04em
- **State:** active/pressed turns orange-tinted with the functional state
  glow; streak-ready buttons carry an amber border and glow as a call to action
- **Scope (ADS):** a tap toggle, not a hold — the thumb must be free to steer
  and fire. While scoped the button keeps a solid amber fill, dark icon and the
  label `SCOPED` (no press-scale, since it is not being held); the state is
  synced from `weapons.aiming` so a game-side drop cannot leave it stuck on.
- **Aim assist:** phone-only, on by default, persisted as `bo_aim_assist`. Soft
  magnetic pull toward the hostile nearest the reticle while scoped or firing;
  needs the reticle inside an ~11° (hip) / ~7.5° (scoped) cone with clear line
  of sight, leads the target's velocity, and is rate-limited. Off during sprint
  and slide. The dossier exposes it as a full-width ruled ON/OFF row so the
  setting reads as a form field, not a floating switch.

### Modals
- **Style:** paper sheet (`.modal`), centered, 2px orange top rail (red for
  K.I.A.), 58px headline, 14px mono body ≤ 420px measure, stacked ghost-button
  actions, mono hint row with kbd chips

### The Dossier Sheet (the menu)
- **Object:** one cream sheet (`--paper #e8e1cf`) with two ghost pages offset
  behind it (`.folder-ghost`, 9px / 18px at ±0.3°), a punched gutter drawn on
  the left (46px, holes every 150px, 1px red margin rule), a paper clip over
  the top edge, and a `TOP SECRET` stamp in double red ink, rotated 7°.
- **Header:** `FORM 09-B · OPERATOR BRIEFING` / `ISSUED 04:12 · SECTOR 04` as a
  typewritten form row with a hairline rule (mono 9.5px, tracked 0.18em).
- **Tabs:** five pull-tabs cut trapezoid (`clip-path`), sitting on the sheet's
  top edge; the active tab is the paper colour so it merges with the sheet;
  hover lifts 4px.
- **Sections:** each pane is a numbered form section — `01 MISSION DIRECTIVE`
  via a CSS counter (`decimal-leading-zero`) in the accent ink, heading at 23px
  UI face. Switching panes slides the sheet content 10px and fades (240ms), the
  rows stamp in with a 40ms cascade.
- **Ledger:** two columns of rows with dot leaders (`2px dotted`), name 13.5px,
  description 12px in the soft ink, value 15px mono right-aligned.
- **Action:** DEPLOY is a printed sticker — flat orange, hard ink offset shadow
  (`4px 4px 0 ink`), −0.6° rotation; hover deepens the offset, press flattens it.
- **Footer:** `ZONE // HOSTILE RELAY` + threat pill inside the sheet; the print
  strip (`GRID SECTOR 04 · RELAY YARD` / `DESTROY AFTER READING`) sits off the
  paper on the scrim.
- **Motion:** the whole stack leans toward the pointer (±1.8° Y, ±1.2° X, rAF
  throttled, transform only, mouse only) and is disabled under
  `prefers-reduced-motion`.

### Signature Component: The Stamped Form Header
- **Style:** the typewritten issue row plus the rotated `TOP SECRET` double-rule
  stamp in red ink — the dossier's voiceprint, the first thing that says this is
  paperwork and not a landing page. It replaces the old classification eyebrow
  and must survive any future redesign of surrounding surfaces.

## Do's and Don'ts

### Do:
- **Do** keep orange rare — rails, needles, stamps, one command button per screen.
- **Do** use cut-corner clip-path notches (12–16px) for command surfaces.
- **Do** render data values in large mono (24–40px) with stencil labels at the
  9.5–10px floor.
- **Do** reserve zero-offset glow for state feedback only.
- **Do** keep shadows black, offset, and increasing with importance.
- **Do** keep the 3D view readable — panel blur at 2–4px, no full-screen
  pattern overlays (scanlines were removed deliberately).
- **Do** keep the menu a real object: paper with a visible edge, punched
  gutter, printed stamp, ledger rules. On paper, mono is for stencil labels
  and data values only; sentences use the UI face at 16px.

### Don't:
- **Don't** add external fonts, images, or audio — everything is procedural
  or system-stack (PRODUCT.md constraint).
- **Don't** round cards with large radii; this system cuts corners, it never
  curls them (max 4px outside touch ergonomics).
- **Don't** add blinking/pulsing dots or decorative animations to static UI.
- **Don't** widen letter-spacing on sentences or body copy (≤ 0.05em there).
- **Don't** drop functional text below 9.5px, or push render resolution below
  native — sharpness is a product commitment.
- **Don't** put text on the gutter or let tabs overlap the form header: the
  paper's margin is structure, not decoration.
- **Don't** introduce a second paper colour, a soft drop shadow on the sticker,
  or a tilt on touch devices — the object must stay one sheet of one stock.
- **Don't** use glossy sci-fi neon (blue/purple "gamer RGB"), gradients as
  surface fills, or gray-on-gray low-contrast panels.
