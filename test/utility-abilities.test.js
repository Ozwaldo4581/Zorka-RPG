import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectile.js';
import { SpaceDebris } from '../entities/hazards.js';
import { Game, GAME_MODE } from '../game.js';

const own = (player, utility) => {
    assert.equal(player.purchaseUtility(utility), true);
    return player;
};

test('Boost triples max speed, restores exact pre-Boost speed, and enforces twelve-second cooldown', () => {
    const player = own(new Player(0, 0), 'Boost');
    player.vx = 123;
    assert.equal(player.activateBoost(), true);
    assert.equal(Math.hypot(player.vx, player.vy), player.getNormalShipSpeedCap() * 3);
    assert.equal(player.activateBoost(), false);
    player.updateUtilityTimers(1);
    assert.ok(Math.abs(Math.hypot(player.vx, player.vy) - 123) < 1e-9);
    player.updateUtilityTimers(11);
    assert.equal(player.activateBoost(), true);
});

test('Emergency Break uses acceleration over time and stops without reversing', () => {
    const player = own(new Player(0, 0), 'Emergency Break');
    player.vx = 1000;
    assert.equal(player.activateEmergencyBrake(), true);
    player.update(0.25, { worldRules: { wrap: false } });
    assert.equal(player.vx, 600);
    player.update(0.5, { worldRules: { wrap: false } });
    assert.deepEqual([player.vx, player.vy, player.emergencyBrakeActive], [0, 0, false]);
    player.vx = 100;
    assert.equal(player.activateEmergencyBrake(), true);
});

test('Scrap Magnet uses a held 360-degree, fifteen-ship-length radius and suppresses primary fire', () => {
    const player = own(new Player(0, 0), 'Scrap Magnet');
    player.scrapMagnetActive = true;
    const oldRange = player.radius * 2 * 10;
    assert.equal(player.getScrapMagnetRange(), oldRange * 1.5);
    const insideOldRange = new SpaceDebris(oldRange - 1, 0);
    const insideExpandedRange = new SpaceDebris(0, -(oldRange * 1.5 - 1));
    const outsideExpandedRange = new SpaceDebris(-(oldRange * 1.5 + 1), 0);
    for (const debris of [insideOldRange, insideExpandedRange, outsideExpandedRange]) Object.assign(debris, { vx: 0, vy: 0 });
    const game = { gameState: GAME_MODE.EXPERIMENTAL, hazards: [insideOldRange, insideExpandedRange, outsideExpandedRange] };
    assert.equal(Game.prototype.applyScrapMagnet.call(game, player, 0.1), 2);
    assert.ok(insideOldRange.vx < 0);
    assert.ok(insideExpandedRange.vy > 0);
    assert.deepEqual([outsideExpandedRange.vx, outsideExpandedRange.vy], [0, 0]);
    player.spawnImmunityTimer = 0;
    assert.equal(player.fire(), null);
});

test('Scrap Magnet held intent releases immediately and render vibration never changes world position', () => {
    const player = own(new Player(12, 34), 'Scrap Magnet');
    const game = { keys: { Digit1: true }, isShopMenuOpen: false, isPauseMenuOpen: false,
        isValidAimLockTarget: () => false };
    Game.prototype.updateHeldUtilityIntents.call(game, player);
    assert.equal(player.scrapMagnetActive, true);
    assert.notDeepEqual(player.getScrapMagnetRenderOffset(10), { x: 0, y: 0 });
    assert.notDeepEqual(player.getScrapMagnetRenderOffset(10), player.getScrapMagnetRenderOffset(20));
    assert.deepEqual([player.x, player.y], [12, 34]);
    game.keys.Digit1 = false;
    Game.prototype.updateHeldUtilityIntents.call(game, player);
    assert.equal(player.scrapMagnetActive, false);
    assert.deepEqual(player.getScrapMagnetRenderOffset(20), { x: 0, y: 0 });
    player.spawnImmunityTimer = 0;
    assert.ok(player.fire()?.length > 0);
});

test('Beam Hook preserves radial distance, follows target translation, and releases invalid targets', () => {
    const player = own(new Player(100, 0), 'Beam Hook');
    const target = new Player(0, 0, 2);
    player.lockedAimTarget = target;
    const game = { gameState: GAME_MODE.SOLO, players: [player, target], asteroids: [], hazards: [], projectiles: [] };
    player.beamHookTarget = target;
    player.beamHookDistance = 100;
    player.beamHookTargetX = 0;
    player.beamHookTargetY = 0;
    target.x = 25;
    assert.equal(Game.prototype.applyBeamHookConstraint.call(game, player), true);
    assert.ok(Math.abs(Math.hypot(player.x - target.x, player.y - target.y) - 100) < 1e-9);
    target.isDead = true;
    assert.equal(Game.prototype.applyBeamHookConstraint.call(game, player), false);
    assert.equal(player.beamHookTarget, null);
});

test('Phase Shifter is intangible and untargetable for six seconds with a 24-second cooldown', () => {
    const player = own(new Player(0, 0), 'Phase Shifter');
    assert.equal(player.activatePhaseShifter(), true);
    assert.deepEqual([player.isTargetable(), player.isIntangible(), player.isDamageImmune()], [false, true, true]);
    player.updateUtilityTimers(6);
    assert.deepEqual([player.isTargetable(), player.isIntangible()], [true, false]);
    assert.equal(player.activatePhaseShifter(), false);
    player.updateUtilityTimers(18);
    assert.equal(player.activatePhaseShifter(), true);
});

test("4d Jacob's Ladder relocates with respawn protection but preserves velocity and progression", () => {
    const player = own(new Player(10, 20), "4d Jacob's Ladder");
    Object.assign(player, { vx: 7, vy: 8, scrap: 99, spawnImmunityTimer: 0 });
    const game = { gameState: GAME_MODE.SOLO, players: [player], asteroids: [], hazards: [],
        isPauseMenuOpen: false, isShopMenuOpen: false, activeModal: null, optionsOpenedFromPause: false,
        isInGameplayState: () => true };
    assert.equal(Game.prototype.handleUtilityKeyDown.call(game, 'Digit4'), true);
    assert.deepEqual([player.vx, player.vy, player.scrap], [7, 8, 99]);
    assert.ok(player.spawnImmunityTimer > 0);
    assert.notDeepEqual([player.x, player.y], [10, 20]);
});

test('Black Hole creates one straight Event Horizon projectile, crosses walls, exits visible bounds, and cools down', () => {
    const player = own(new Player(0, 0), '1/100 Black Hole');
    player.rotation = Math.PI / 2;
    const camera = { x: 0, y: 0, zoom: 1 };
    const game = { gameState: GAME_MODE.SOLO, projectiles: [], getPlayerOneCamera: () => camera };
    assert.equal(Game.prototype.fireUtilityBlackHole.call(game, player), true);
    assert.equal(game.projectiles.length, 1);
    const projectile = game.projectiles[0];
    assert.ok(projectile instanceof Projectile);
    assert.equal(projectile.isUtilityEventHorizon, true);
    assert.equal(Game.prototype.resolveExperimentalProjectileWall.call({ experimentalRooms: [] }, projectile), false);
    projectile.update(1, [], [], [], [], { wrap: false });
    assert.ok(projectile.lifeSpan < 0);
    assert.equal(Game.prototype.fireUtilityBlackHole.call(game, player), false);
    player.updateUtilityTimers(36);
    assert.equal(Game.prototype.fireUtilityBlackHole.call(game, player), true);
});

test('death cleanup resets temporary utility effects but preserves ownership and cooldowns', () => {
    const player = own(new Player(0, 0), 'Boost');
    player.purchaseUtility('Phase Shifter');
    player.activateBoost();
    player.activatePhaseShifter();
    const cooldowns = [player.boostCooldownTimer, player.phaseShifterCooldownTimer];
    player.resetTransientLifeState();
    assert.deepEqual([player.boostTimer, player.phaseShifterTimer, player.emergencyBrakeActive], [0, 0, false]);
    assert.deepEqual([player.boostCooldownTimer, player.phaseShifterCooldownTimer], cooldowns);
    assert.deepEqual([player.ownsUtility('Boost'), player.ownsUtility('Phase Shifter')], [true, true]);
});
