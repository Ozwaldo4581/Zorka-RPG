import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectile.js';
import { Game } from '../game.js';
import { ExperimentalProfileStore, EXPERIMENTAL_PROFILE_SLOT_COUNT } from '../persistence/experimental_profiles.js';

const memoryStorage = () => {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('five named save slots normalize, remain isolated, load RPG state, and delete', () => {
    const store = new ExperimentalProfileStore(memoryStorage());
    assert.equal(EXPERIMENTAL_PROFILE_SLOT_COUNT, 5);
    assert.deepEqual(store.getSummaries(), [null, null, null, null, null]);
    store.createProfile(0, 'Nova');
    store.createProfile(1, 'Sol');
    store.createProfile(4, 'Quasar');
    assert.equal(store.getProfile(4).name, 'Quasar');
    assert.throws(() => store.getProfile(5), {
        name: 'RangeError',
        message: 'Adventure save slot must be between 0 and 4.'
    });
    store.updateProfile(0, { level: 3, encounterLevel: 3, scrap: 750, deaths: 2,
        equippedPrimaryGun: 'Laser', weaponPurchaseTiers: { Laser: 1 },
        purchasedUtilities: { Boost: true }, shipUpgrades: { projectile: 2, maxSpeed: 1 } });
    const loaded = store.getProfile(0);
    assert.deepEqual([loaded.name, loaded.level, loaded.encounterLevel, loaded.scrap, loaded.deaths], ['Nova', 3, 3, 750, 2]);
    assert.equal(store.getProfile(1).scrap, 0);
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    player.applyPersistentProgression(loaded);
    assert.deepEqual([player.level, player.scrap, player.deaths, player.equippedPrimaryGun], [3, 750, 2, 'Laser']);
    assert.deepEqual([player.shipUpgrades.projectile, player.shipUpgrades.maxSpeed], [2, 1]);
    store.deleteProfile(0);
    assert.equal(store.getProfile(0), null);
    assert.equal(store.getProfile(4).name, 'Quasar');
});

test('player-owned floating text follows movement and expires', () => {
    const player = new Player(10, 20);
    const game = { vfx: [], gameState: 'SOLO', indexExperimentalEntity() {} };
    const toast = Game.prototype.createFloatingText.call(game, '+10 Scrap', 10, 0, '#fff', null, player);
    player.x = 70; player.y = 90; toast.update(0.25);
    assert.deepEqual([toast.x, toast.y], [70, 70]);
    toast.update(1.1);
    assert.equal(toast.finished, true);
});

test('weapon projectiles carry canonical Laser, Orb, and Ballistic damage', () => {
    const player = new Player(0, 0);
    player.spawnImmunityTimer = 0;
    player.activeGun = 'Laser'; player.weaponStreamCounts.Laser = 1;
    const laser = player.fire()[0];
    player.shotTimer = 0; player.activeGun = 'Orb'; player.weaponStreamCounts = { Laser: 0, Antigun: 0, Double: 0, Orb: 1 };
    const orb = player.fire()[0];
    player.shotTimer = 0; player.activeGun = 'Normal'; player.weaponStreamCounts.Orb = 0;
    const ballistic = player.fire()[0];
    assert.deepEqual([laser.damage, orb.damage, ballistic.damage], [2, 3, 1]);
    assert.equal(new Projectile(0, 0, 0, 0).damage, 1);
});
