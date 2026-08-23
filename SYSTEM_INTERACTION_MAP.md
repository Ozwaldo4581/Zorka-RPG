# Zorka RPG — System Interaction Map

## Active routes

`main.js` → `new Game()` → splash → main menu → Arcade configuration / Local PvP configuration / Options → standard wrapped gameplay.

The preserved Adventure menu graphic is presentation-only and is deliberately excluded from mouse, keyboard, and gamepad interaction. Adventure is not an active route; it was the migration source used to establish the shared RPG contracts.

## Input to gameplay

- Keyboard/mouse or an assigned controller supplies an aim vector and local movement vector to `Player.update()`.
- `Player.getDirectionalThrust()` rotates movement into that player's aim frame and applies Speed progression plus the human (`1.0`) or NPC (`0.8`) coefficient.
- Held primary-fire intent is coordinated by `Game.handleFire()`. `Player.fire()` checks and consumes its authoritative clip, retains partial ammunition, and starts a 7-second reload only at zero.
- **E** dispatches manual missile intent through `Game.handleMissileFire()` to `Player.fireMissile()`. Player owns unlock and cooldown truth; Game only inserts accepted projectiles.
- Existing controller face buttons remain capsule/upgrade intents. There is no newly invented controller missile binding.

## Combat flow

`Player.fire()` → `Projectile` instances → `Game` canonical projectile collection → `Projectile.update()` → `Game.checkCollisions()` → authoritative damage/reward/death handling.

Ordinary projectiles read only `projectile.owner.lockedAimTarget` live. A valid target enables a turn rate of `MISSILE_HOMING_TURN_RATE × 0.3`; otherwise flight remains ballistic. Missiles retain their owner-lock preference and missile-owned fallback behavior.

## State boundaries

| State | Authoritative owner | Consumers |
| --- | --- | --- |
| Position, velocity, aim, movement coefficient | `Player` | `Game`, camera, HUD/audio |
| Clip capacity, rounds, reload | `Player` | `Game`, HUD |
| Missile unlock/tier/cooldown | `Player` | `Game`, HUD |
| Aim lock | firing `Player` | `Projectile`, HUD |
| Projectile flight flags/target fallback | `Projectile` | `Game`, renderer |
| Collections, damage, rewards, waves, respawn | `Game` | HUD/audio/rendering |
| Arena options | `Game` | spawn/configuration consumers |
