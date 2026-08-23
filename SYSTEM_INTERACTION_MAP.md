# Zorka RPG — System Interaction Map

## Active routes

`main.js` → `new Game()` → splash → main menu → Arcade configuration / Local PvP configuration / Options.

The Adventure and Arena graphics remain in the menu layout as disabled, unfocusable, noninteractive artwork. Neither has a click, keyboard/gamepad-confirm, restart, or supported runtime route. Local PvP is a distinct retained entry and continues using the shared setup panel.

## Input to gameplay

- Local input supplies aim and movement intent to `Player.update()`.
- `Player.getDirectionalThrust()` applies aim-relative movement and the human (`1.0`) or NPC (`0.8`) coefficient.
- Held primary-fire intent flows through `Game.handleFire()` to `Player.fire()`, which accepts one shot at the established cooldown, consumes one clip round, preserves partial clips, and starts the 7-second reload at zero.
- NPC combat decisions set the same sustained `shouldFire` intent; they do not own a second burst or ammunition implementation.
- **E** flows through `Game.handleMissileFire()` to the Player-owned manual missile cooldown.

## Combat and topology flow

`Player.fire()` → `Projectile` → `Game.projectiles` → `Projectile.update()` → world-boundary resolution → `Game.checkCollisions()` → damage/reward/death outcomes.

Ordinary projectiles read only `projectile.owner.lockedAimTarget`. A valid owner lock enables `MISSILE_HOMING_TURN_RATE × 0.7`; otherwise travel is ballistic. Missiles retain reference strength `1.0` and their existing owner-lock-first fallback behavior.

For Arcade, `Game.getWorldRules()` → `ARCADE_BOUNDED_WORLD` → stateless `physics.js` swept/contact helpers → category response (ship slide, body reflection, projectile removal, missile detonation). Camera, aim lock, homing, collision distance, blast distance, minimap coordinates, and spatial audio use direct geometry. Local PvP selects wrapped geometry through the same world-rule seam.

## State boundaries

| State | Authoritative owner | Consumers |
| --- | --- | --- |
| Position, velocity, aim, movement coefficient | `Player` | `Game`, camera, HUD/audio |
| Clip capacity, rounds, reload, fire cooldown | `Player` | `Game`, HUD |
| Missile unlock/tier/cooldown | `Player` | `Game`, HUD |
| Aim lock | firing `Player` | `Projectile`, HUD |
| Arcade walls/topology | `Game` + immutable world definition | entities, camera, audio, targeting |
| Collections, damage, rewards, waves, respawn | `Game` | HUD/audio/rendering |
| Arena options | `Game` | Arcade and Local PvP spawn/configuration consumers |
