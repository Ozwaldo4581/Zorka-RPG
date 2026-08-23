# Zorka RPG — Architecture Overview

## Product foundation

Zorka RPG is a local-first Newtonian shooter built with plain ES modules and Vite. **Adventure Mode is the sole supported gameplay route; Options is the sole supported configuration route.** The menu artwork for Arcade, Arena, and Local PvP remains visible but disabled and unreachable.

Adventure retains the legacy internal `EXPERIMENTAL` discriminator and method names to avoid an unrelated broad rename. Its immutable topology is owned by `world/experimental_rooms.js` and contains only Sector 1 at its established 9600 × 5400 dimensions. Sector 1 has no connections, entrances, doors, hallways, or other sectors; its four complete perimeter walls use the established collision and rendering parameters. The generic space background remains, while the former desk image stack is neither loaded nor rendered.

## Ownership

- `Game` owns Adventure session state, canonical collections, spawning, one-NPC population reconciliation, collision outcomes, rewards, damage/death, and screen flow.
- `Player` owns aim-relative Newtonian movement, lock state, progression, clip ammunition/reload, and manual missile cooldown.
- `Projectile` owns flight and owner-lock homing.
- `world/experimental_rooms.js` owns immutable Sector 1 geometry only.
- `physics.js` remains stateless and owns wall contact, slide, reflection, and swept collision math.
- Camera, HUD, audio, and menus consume gameplay truth and dispatch intent.

## RPG contracts

Human movement coefficient is `1.0`; NPC movement coefficient is `0.8`. Standard clip capacity begins at 12 and Projectile upgrades add 2. Laser capacity is nearest-whole 50% and Orb capacity is nearest-whole 33.333% of standard capacity. Partial clips persist and empty clips reload in 7 seconds.

Missiles require explicit **E** input after capsule unlock and use Player-owned tier cooldowns of 13, 9, and 5 seconds. Ordinary projectiles remain ballistic without their owner's valid lock and steer at `0.3` of missile turn strength with that lock. Missiles retain reference strength `1.0` and their owner-lock-first fallback behavior.
