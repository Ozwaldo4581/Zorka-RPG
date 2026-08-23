import test from 'node:test';
import assert from 'node:assert/strict';
import {
    Player,
    BALLISTIC_SHOT_INTERVAL,
    LASER_SHOT_INTERVAL,
    ORB_SHOT_INTERVAL,
    PREVIOUS_BALLISTIC_SHOT_INTERVAL,
    BASE_PROJECTILE_CAPACITY,
    CLIP_RELOAD_DURATION,
    HUMAN_MOVEMENT_COEFFICIENT,
    NPC_MOVEMENT_COEFFICIENT
} from '../entities/player.js';
import {
    Projectile,
    MISSILE_HOMING_TURN_RATE,
    STANDARD_PROJECTILE_HOMING_FACTOR
} from '../entities/projectile.js';

test('shared aim-relative movement applies human and NPC coefficients', () => {
    const human = new Player(0, 0);
    human.rotation = Math.PI / 2;
    assert.deepEqual(human.getDirectionalThrust(0, -1), { x: human.thrust, y: -human.thrust * Math.cos(Math.PI / 2) });
    assert.equal(HUMAN_MOVEMENT_COEFFICIENT, 1);

    const npc = new Player(0, 0, 2);
    npc.isNPC = true;
    assert.equal(npc.getEffectiveThrust(), npc.thrust * NPC_MOVEMENT_COEFFICIENT);
});

test('Player owns whole-number standard, Laser, and Orb clip capacities', () => {
    const player = new Player(0, 0);
    assert.equal(player.getStandardProjectileCapacity(), BASE_PROJECTILE_CAPACITY);
    assert.equal(player.getClipCapacity(), 12);
    player.activeGun = 'Laser';
    player.weaponStreamCounts.Laser = 1;
    assert.equal(player.getClipCapacity(), 6);
    player.activeGun = 'Orb';
    player.weaponStreamCounts = { Laser: 0, Antigun: 0, Double: 0, Orb: 1 };
    assert.equal(player.getClipCapacity(), 4);
    player.projectileUpgradeCount = 1;
    assert.equal(player.getStandardProjectileCapacity(), 14);
    assert.equal(player.getClipCapacity(), 5, 'nearest-whole rounding preserves the requested one-third scaling');
});

test('explicit weapon families use their requested independent shot intervals', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    assert.equal(player.getWeaponFamily(), 'Ballistic');
    assert.equal(player.fire()[0].isBallistic, true);
    assert.equal(player.shotTimer, PREVIOUS_BALLISTIC_SHOT_INTERVAL / 3);
    assert.equal(player.shotTimer, BALLISTIC_SHOT_INTERVAL);

    player.activeGun = 'Laser';
    player.weaponStreamCounts.Laser = 1;
    player.shotTimer = 0;
    player.fire();
    assert.equal(player.getWeaponFamily(), 'Laser');
    assert.equal(player.shotTimer, LASER_SHOT_INTERVAL);

    player.activeGun = 'Orb';
    player.weaponStreamCounts = { Laser: 0, Antigun: 0, Double: 0, Orb: 1 };
    player.shotTimer = 0;
    player.fire();
    assert.equal(player.getWeaponFamily(), 'Orb');
    assert.equal(player.shotTimer, PREVIOUS_BALLISTIC_SHOT_INTERVAL / 0.6);
    assert.equal(player.shotTimer, ORB_SHOT_INTERVAL);
});

test('partial clips persist and empty clips reload after seven seconds', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    player.fire();
    assert.equal(player.clipRounds, 11);
    player.shotTimer = 0;
    player.fire();
    assert.equal(player.clipRounds, 10, 'input release does not refill a partial clip');
    while (player.clipRounds > 0) {
        player.shotTimer = 0;
        player.fire(true);
    }
    assert.equal(player.clipReloadTimer, CLIP_RELOAD_DURATION);
    assert.equal(player.fire(true), null);
    player.updateWeaponTimers(CLIP_RELOAD_DURATION - 0.01);
    assert.equal(player.clipRounds, 0);
    player.updateWeaponTimers(0.01);
    assert.equal(player.clipRounds, player.getClipCapacity());
});

test('manual missiles require Player-owned ammunition and fixed reload', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    assert.equal(player.fireMissile(), null);
    player.powerUpCapsules = 2;
    assert.equal(player.activatePowerUp(), true);
    assert.equal(player.fireMissile().length, 1);
    assert.equal(player.missileAmmo, 0);
    assert.equal(player.missileReloadTimer, 12);
    assert.equal(player.fireMissile(), null);
    player.updateWeaponTimers(12);
    assert.equal(player.missileAmmo, 1);
});

test('ordinary projectiles use only their live owner lock at 0.3 missile strength', () => {
    const owner = new Player(0, 0);
    const otherOwner = new Player(0, 0, 2);
    const target = new Player(100, 0, 3);
    const projectile = new Projectile(0, 0, 0, -100);
    projectile.owner = owner;
    projectile.isBallistic = true;
    otherOwner.lockedAimTarget = target;
    projectile.update(1, [], [owner, otherOwner, target]);
    assert.equal(projectile.vx, 0, 'another player lock cannot steer the shot');

    owner.lockedAimTarget = target;
    projectile.update(0.1, [], [owner, otherOwner, target]);
    assert.ok(projectile.vx > 0);
    assert.equal(STANDARD_PROJECTILE_HOMING_FACTOR, 0.3);
    assert.equal(MISSILE_HOMING_TURN_RATE, 2.7);
});

test('held primary-fire attempts can discharge a complete clip at the established cadence', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    const capacity = player.getClipCapacity();
    let accepted = 0;
    while (player.clipRounds > 0) {
        if (player.fire()) accepted++;
        player.shotTimer = 0;
    }
    assert.equal(accepted, capacity);
    assert.equal(player.clipRounds, 0);
    assert.equal(player.clipReloadTimer, CLIP_RELOAD_DURATION);
});
