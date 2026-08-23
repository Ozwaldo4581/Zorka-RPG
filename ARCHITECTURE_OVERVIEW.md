# Zorka RPG — Architecture Overview

## Product foundation

Zorka RPG is a local-first Newtonian shooter built with plain ES modules and Vite. The supported gameplay routes are **Arcade Mode** and **Local PvP Arena**, plus configuration and Options. Adventure and solo Arena are not runtime modes. Their existing main-menu artwork remains presentation-only and noninteractive.

Local PvP retains the 17280 × 9720 wrapped topology. Arcade uses the same dimensions as a bounded world with exactly four immutable outer walls. Both modes consume the same Player, Projectile, collision, damage, reward, population-option, and input contracts.

## Ownership

- `Game` owns screen flow, world-rule selection, canonical match collections, input/fire coordination, collision outcomes, rewards, Arcade waves, and Arena Options.
- `Player` owns movement/control state, aim lock, HP/shields/progression, capsule weapons, clip ammunition/reload, and manual missile cooldown.
- `Projectile` owns flight, lifespan, travel limits, missile fallback targeting, and live owner-lock homing.
- `world/bounded_arena.js` owns immutable Arcade boundary geometry and its former-Adventure wall tuning values.
- `physics.js` owns stateless Newtonian, wrapping, swept-wall, penetration correction, slide, and reflection math.
- Camera, HUD, audio, and menus consume world/gameplay truth and dispatch intent; they do not own it.

## Shared RPG contracts

Human movement coefficient is `1.0`; NPC movement coefficient is `0.8`. A standard clip begins at 12, Projectile upgrades add 2, Laser derives at 50%, Orb derives at 33.333% with nearest-whole normalization, and empty reload takes 7 seconds.

Held primary-fire intent attempts one legal shot whenever the established weapon cooldown permits. It continues until intent is released or the clip empties; there is no three-round burst grouping. Partial clips remain partial. NPCs use the same fire eligibility, cooldown, ammunition, and reload contract.

Ordinary shots are ballistic without their owner's valid live lock. With that lock they steer at `0.7` of the missile reference turn rate. Missiles remain at reference strength `1.0`, prefer their owner's lock, and retain missile-owned fallback acquisition.

## Arcade topology

`Game.getWorldRules()` selects `wrap: false`, bounded direct geometry, global spawning, and `ARCADE_BOUNDED_WORLD` for Arcade. The four walls use the historical 32-pixel collision thickness, 0.5-pixel separation epsilon, and four correction passes. Ships correct penetration and slide; asteroids and hazards reflect; swept projectile contact removes ordinary shots and detonates missiles once. Camera, targeting, homing, collision broad phases, blast distance, and spatial audio consume the same non-wrapped rule.

Local PvP continues to select wrapped physics, camera, collision, targeting, and audio geometry.
