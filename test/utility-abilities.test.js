import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectile.js';
import { SpaceDebris } from '../entities/hazards.js';
import { Game, GAME_MODE } from '../game.js';
import { WORLD_WIDTH } from '../world_config.js';

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

test('Scrap Magnet uses a held 360-degree, thirty-ship-length radius and suppresses primary fire', () => {
    const player = own(new Player(0, 0), 'Scrap Magnet');
    player.scrapMagnetActive = true;
    const originalRange = player.radius * 2 * 10;
    const previousRange = originalRange * 1.5;
    const newRange = previousRange * 2;
    assert.equal(player.getScrapMagnetRange(), originalRange * 3);
    const insidePreviousRange = new SpaceDebris(previousRange - 1, 0);
    const insideNewRange = new SpaceDebris(0, -(newRange - 1));
    const outsideNewRange = new SpaceDebris(-(newRange + 1), 0);
    for (const debris of [insidePreviousRange, insideNewRange, outsideNewRange]) Object.assign(debris, { vx: 0, vy: 0 });
    const game = { gameState: GAME_MODE.EXPERIMENTAL, hazards: [insidePreviousRange, insideNewRange, outsideNewRange] };
    assert.equal(Game.prototype.applyScrapMagnet.call(game, player, 0.1), 2);
    assert.ok(insidePreviousRange.vx < 0);
    assert.ok(insideNewRange.vy > 0);
    assert.deepEqual([outsideNewRange.vx, outsideNewRange.vy], [0, 0]);
    player.spawnImmunityTimer = 0;
    assert.equal(player.fire(), null);
});

test('Scrap Magnet homing is finite, capped, and strengthens monotonically toward pickup', () => {
    const player = new Player(0, 0);
    const range = player.getScrapMagnetRange();
    const strengths = [range, range / 2, range / 5, player.radius + 36, 0]
        .map(distance => player.getScrapMagnetHomingStrength(distance));
    assert.equal(strengths[0], 0.5);
    assert.ok(strengths[1] > strengths[0]);
    assert.ok(strengths[2] > strengths[1]);
    assert.equal(strengths.at(-1), 40);
    assert.ok(strengths.every(Number.isFinite));
    assert.ok(strengths.every((strength, index) => index === 0 || strength >= strengths[index - 1]));
});

test('Scrap Magnet uses the shortest displacement across a wrapped seam', () => {
    const player = own(new Player(1, 100), 'Scrap Magnet');
    player.scrapMagnetActive = true;
    const debris = new SpaceDebris(WORLD_WIDTH - 1, 100);
    Object.assign(debris, { vx: 0, vy: 0 });
    const game = { gameState: GAME_MODE.SOLO, hazards: [debris] };
    assert.equal(Game.prototype.applyScrapMagnet.call(game, player, 1 / 60), 1);
    assert.ok(debris.vx > 0);
    assert.ok(Math.abs(debris.vy) < 1e-9);
});

test('Scrap Magnet redirects tangential Scrap toward normal pickup and stops on release', () => {
    const player = own(new Player(0, 0), 'Scrap Magnet');
    player.scrapMagnetActive = true;
    const debris = new SpaceDebris(300, 0);
    Object.assign(debris, { vx: 0, vy: 500, lifeSpan: 100 });
    const game = { gameState: GAME_MODE.EXPERIMENTAL, hazards: [debris] };
    const initialAlignment = -debris.vx / Math.hypot(debris.vx, debris.vy);
    Game.prototype.applyScrapMagnet.call(game, player, 1 / 60);
    const redirectedAlignment = -debris.vx / Math.hypot(debris.vx, debris.vy);
    assert.ok(redirectedAlignment > initialAlignment);

    for (let frame = 0; frame < 600 && Math.hypot(debris.x, debris.y) > player.radius + debris.radius; frame++) {
        Game.prototype.applyScrapMagnet.call(game, player, 1 / 60);
        debris.update(1 / 60, { wrap: false });
    }
    assert.ok(Math.hypot(debris.x, debris.y) <= player.radius + debris.radius);

    player.scrapMagnetActive = false;
    const velocity = [debris.vx, debris.vy];
    assert.equal(Game.prototype.applyScrapMagnet.call(game, player, 1 / 60), 0);
    assert.deepEqual([debris.vx, debris.vy], velocity);
    assert.equal('scrapMagnetTarget' in debris, false);
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
