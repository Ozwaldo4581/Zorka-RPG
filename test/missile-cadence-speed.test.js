import test from 'node:test';
import assert from 'node:assert/strict';

import {
    LASER_SHOT_INTERVAL,
    MAX_MISSILE_CAPACITY,
    MISSILE_RELOAD_DURATION,
    MISSILE_SHOT_INTERVAL,
    MISSILE_SPEED_MULTIPLIER,
    Player
} from '../entities/player.js';

function selectMissile(player) {
    player.powerUpCapsules = 2;
    return player.activatePowerUp();
}

test('Missile capsules add one Player-owned round through the capacity cap', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    for (let capacity = 1; capacity <= MAX_MISSILE_CAPACITY; capacity++) {
        assert.equal(selectMissile(player), true);
        assert.equal(player.getMissileCapacity(), capacity);
        assert.equal(player.missileAmmo, capacity);
    }
    player.powerUpCapsules = 2;
    assert.equal(player.activatePowerUp(), false);
    assert.equal(player.getMissileCapacity(), 12);
    player.resetTransientLifeState();
    assert.deepEqual(
        [player.hasMissile, player.missileLevel, player.missileAmmo, player.missileReloadTimer, player.missileShotTimer],
        [false, 0, 0, 0, 0]
    );
});

test('Missile clip consumes rounds at an independent twice-Laser-rate interval and reloads empty in twelve seconds', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    for (let i = 0; i < 4; i++) assert.equal(selectMissile(player), true);
    assert.equal(MISSILE_SHOT_INTERVAL, LASER_SHOT_INTERVAL / 2);
    for (let ammo = 3; ammo >= 0; ammo--) {
        assert.equal(player.fireMissile().filter(shot => shot.isMissile).length, 1);
        assert.equal(player.missileAmmo, ammo);
        if (ammo > 0) player.updateWeaponTimers(MISSILE_SHOT_INTERVAL);
    }
    assert.equal(player.missileReloadTimer, MISSILE_RELOAD_DURATION);
    assert.equal(player.fireMissile(), null);
    player.updateWeaponTimers(MISSILE_RELOAD_DURATION - 0.01);
    assert.equal(player.missileAmmo, 0);
    player.updateWeaponTimers(0.01);
    assert.equal(player.missileAmmo, 4);
});

test('capacity upgrades during Missile reload preserve the timer and refill the new capacity', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    selectMissile(player);
    player.fireMissile();
    player.updateWeaponTimers(2);
    assert.equal(selectMissile(player), true);
    assert.equal(player.missileReloadTimer, 10);
    assert.equal(player.missileAmmo, 0);
    player.updateWeaponTimers(10);
    assert.equal(player.missileAmmo, 2);
});

test('Missile launch and homing retain the tuned normal ship speed-cap multiplier', () => {
    for (const speedUpgradeCount of [0, 10]) {
        const player = new Player(0, 0);
        player.speedUpgradeCount = speedUpgradeCount;
        const missile = player.createMissile(0, 0, 0);
        const expectedSpeed = player.getNormalShipSpeedCap() * MISSILE_SPEED_MULTIPLIER;
        assert.equal(Math.hypot(missile.vx, missile.vy), expectedSpeed);
        const target = { x: 100, y: 100, isDead: false, isEliminated: false };
        player.lockedAimTarget = target;
        missile.updateMissile(0.1, [], [player, target], [], []);
        assert.ok(Math.abs(Math.hypot(missile.vx, missile.vy) - expectedSpeed) < 1e-9);
    }
});
