import test from 'node:test';
import assert from 'node:assert/strict';

import { MISSILE_SPEED_MULTIPLIER, Player } from '../entities/player.js';

function selectMissile(player) {
    player.powerUpCapsules = 2;
    return player.activatePowerUp();
}

test('Missile capsules cap at level three and reset their per-player cooldown', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    for (let level = 1; level <= 3; level++) {
        assert.equal(selectMissile(player), true);
        assert.equal(player.missileLevel, level);
    }
    player.powerUpCapsules = 2;
    assert.equal(player.activatePowerUp(), false);
    player.missileCooldown = 2;
    player.resetTransientLifeState();
    assert.deepEqual([player.hasMissile, player.missileLevel, player.missileCooldown], [false, 0, 0]);
});

test('Missile tiers fire manually with 13, 9, and 5 second cooldowns', () => {
    for (const [level, cooldown] of [[1, 13], [2, 9], [3, 5]]) {
        const player = new Player(0, 0);
        player.spawnImmunityTimer = 0;
        for (let i = 0; i < level; i++) assert.equal(selectMissile(player), true);
        assert.equal(player.fireMissile().filter(shot => shot.isMissile).length, 1);
        assert.equal(player.missileCooldown, cooldown);
        assert.equal(player.fireMissile(), null);
        player.updateWeaponTimers(cooldown);
        assert.equal(player.fireMissile().length, 1);
    }
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
