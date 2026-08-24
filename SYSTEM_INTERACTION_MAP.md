# Zorka RPG — System Interaction Map

## Active routes

`main.js` → `new Game()` → splash → main menu → **Adventure** or **Options**. Arcade, Arena, and Local PvP artwork is disabled, unfocusable, and excluded from mouse, keyboard, and gamepad menu activation. Adventure uses the legacy internal `EXPERIMENTAL` identifier.

## Gameplay flow

Input → `Player.update()` applies aim-relative Newtonian movement at human `1.0` or NPC `0.8` coefficient. Held primary intent → `Game.handleFire()` → `Player.fire()` consumes Player-owned clip ammunition at the family shot interval (Ballistic `0.25s`, Laser `0.75s`, Orb `1.25s`). Empty primary clips reload after 7 seconds. **E** → `Game.handleMissileFire()` → `Player.fireMissile()` checks unlock, Player-owned ammunition, independent `0.375s` shot eligibility (2× Laser's current rate), and the fixed 12-second empty-clip reload.

`Player.fire()` → generic `Projectile` → canonical `Game.projectiles` → projectile update and current-area wall resolution → `Game.checkCollisions()` → authoritative damage/reward/death. Ballistic projectiles (Base Gun, Double, Antigun) and distinct Orb projectiles read only `owner.lockedAimTarget` and steer at the shared `MISSILE_HOMING_TURN_RATE × 0.3` when it remains valid; Laser and Missile remain separate families. HUD ammo/reload and expanding Speed cubes are derived every frame from Player-owned state.

## Adventure world

`world/experimental_rooms.js` creates immutable Sector 1 plus one small terminal Sector 0 hallway connected through the room's left-wall opening. The shared entrance changes human area membership in either direction, blocks non-human collision categories, and has no destination beyond the hallway's solid dead end. `Game.setupExperimentalPopulations()` creates one human and one baseline Sector 1 NPC. Confirmed ordinary NPC death removes the dead canonical entity, awards normal outcomes once, and reconciles the living population back to one through the shared NPC spawn helper. `experimentalSessionId` remains the existing stale-callback guard.
