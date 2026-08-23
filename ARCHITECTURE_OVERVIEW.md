# Zorka RPG — Architecture Overview

## Product foundation

Zorka RPG is a local-first Newtonian arena shooter built with plain ES modules and Vite. The playable runtime consists of **Arcade Mode** and **Local PvP Arena**, plus their configuration and Arena Options screens. Adventure supplied the migration baseline for this fork but is not a runtime mode.

Both playable modes consume one shared gameplay foundation. They retain the standard 17280 × 9720 wrapped arena and the existing asteroid, satellite, and debris population configuration. Arcade adds one-life wave progression; Local PvP adds local controller composition. Neither mode owns a private movement, weapon, damage, or progression implementation.

## Ownership

- `Game` (`game.js`) owns screen flow, canonical match collections, input dispatch, projectile insertion, collisions, rewards, damage/death/respawn, Arcade waves, and Arena Options.
- `Player` (`entities/player.js`) owns movement/control state, owner aim lock, HP/shields/progression, capsule weapons, clip ammunition/reload, and manual missile cooldown.
- `Projectile` (`entities/projectile.js`) owns flight, lifespan, travel limits, missile fallback targeting, and live owner-lock homing.
- `physics.js` contains stateless Newtonian, wrapping, and collision math.
- HUD, audio, menus, and cameras consume authoritative state and dispatch intent; they do not own gameplay truth.

## Shared RPG contracts

Movement is aim-relative for keyboard/mouse and controller players. Human thrust uses coefficient `1.0`; NPC thrust uses `0.8`; Speed progression composes with the coefficient.

Every Player owns a clip. Standard capacity is 12 and each Projectile level adds 2. Laser capacity is `round(n × 0.5)` and Orb capacity is `round(n × 0.33333)` so the required base capacities are exactly 6 and 4. Partial clips persist. Empty clips reload in 7 seconds.

Missiles launch only from explicit player intent. Keyboard/mouse Player 1 uses **E**. Missile tiers 1, 2, and 3 have independent per-player cooldowns of 13, 9, and 5 seconds. No controller missile button is assigned because the existing face buttons already own capsule and level-up intents.

Ordinary standard shots are ballistic without a valid owner lock. While their owner's live lock is valid, they steer at 0.3 of the missile turn rate. They never use another player's lock and do not acquire missile fallback targets.

## Frame flow

1. Read local input and dispatch Player intent.
2. Update Players and NPC intent through shared entity rules.
3. Update hazards and projectiles.
4. Resolve collision, damage, rewards, deaths, waves, and respawns in `Game`.
5. Render the wrapped world, entities, HUD, menus, and audio presentation.
