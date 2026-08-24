import test from 'node:test';
import assert from 'node:assert/strict';

import { Asteroid } from '../entities/asteroid.js';
import { SpaceDebris, Satellite } from '../entities/hazards.js';
import { Player } from '../entities/player.js';
import {
    Game, GAME_MODE, RPG_DEBRIS_DROP_CHANCE,
    getExperimentalRoomPopulationTargets, getRpgAsteroidClusters
} from '../game.js';

const room = { id: 'sector-1', roomNumber: 1, bounds: { left: 0, top: 0, right: 9600, bottom: 5400 } };

function collisionGame(players, hazards, projectiles = []) {
    const indexes = new Map([[room.id, {
        players: new Set(players), asteroids: new Set(), hazards: new Set(hazards),
        projectiles: new Set(projectiles), vfx: new Set()
    }]]);
    return {
        gameState: GAME_MODE.EXPERIMENTAL, players, hazards, asteroids: [], projectiles,
        experimentalRooms: [room], experimentalDoors: [], experimentalAreaIndexes: indexes,
        asteroidPlayerContacts: new WeakMap(),
        createExplosion() {}, playerDeath(player) { player.isDead = true; },
        removeProjectile(projectile) { projectile.isRemoved = true; },
        compactRemovedProjectiles: Game.prototype.compactRemovedProjectiles
    };
}

function destructionGame() {
    const hazards = [];
    const asteroids = [];
    return {
        gameState: GAME_MODE.EXPERIMENTAL, players: [], hazards, asteroids,
        projectiles: [], vfx: [], experimentalRooms: [room], experimentalDoors: [],
        experimentalAreaIndexes: new Map([[room.id, {
            players: new Set(), asteroids: new Set(), hazards: new Set(), projectiles: new Set(), vfx: new Set()
        }]]),
        getActiveCameras: () => [], playSpatialEvent() {}, createExplosion() {}, awardXP() {},
        spawnSpaceDebris: Game.prototype.spawnSpaceDebris,
        spawnDebrisBurst: Game.prototype.spawnDebrisBurst,
        spawnAsteroid: Game.prototype.spawnAsteroid,
        spawnSatellite() {},
        shouldSpawnExperimentalReplacement: () => false
    };
}

function withRandom(values, callback) {
    const original = Math.random;
    let index = 0;
    Math.random = () => values[Math.min(index++, values.length - 1)];
    try { return callback(); } finally { Math.random = original; }
}

test('Player owns session Scrap and collectible debris is 80% sized', () => {
    const player = new Player(0, 0);
    assert.equal(player.scrap, 0);
    assert.equal(player.addScrap(), 1);
    assert.equal(player.scrap, 1);
    assert.equal(new SpaceDebris(0, 0).radius, 45 * 0.8);
});

test('ordinary debris chooses one 14-32 second lifetime and derives escalating blink phases', () => {
    const minimum = withRandom([0, 0, 0, 0, 0], () => new SpaceDebris(0, 0));
    const maximum = withRandom([1, 0, 0, 0, 0], () => new SpaceDebris(0, 0));
    const midpoint = withRandom([0.5, 0, 0, 0, 0], () => new SpaceDebris(0, 0));
    assert.equal(minimum.lifeSpan, 14);
    assert.equal(maximum.lifeSpan, 32);
    assert.equal(midpoint.lifeSpan, 23);
    midpoint.update(10, { wrap: false });
    assert.equal(midpoint.lifeSpan, 23);

    midpoint.age = midpoint.lifeSpan - 3;
    const base = midpoint.isVisibleForLifetimeWarning();
    midpoint.age = midpoint.lifeSpan - 1.5;
    const double = midpoint.isVisibleForLifetimeWarning();
    midpoint.age = midpoint.lifeSpan - 0.5;
    const triple = midpoint.isVisibleForLifetimeWarning();
    assert.deepEqual([typeof base, typeof double, typeof triple], ['boolean', 'boolean', 'boolean']);
    midpoint.update(0.5, { wrap: false });
    assert.equal(midpoint.isDestroyed, true);
    assert.equal(midpoint.isVisibleForLifetimeWarning(), false);
});

test('expired ordinary debris is removed canonically and unindexed without replacement', () => {
    const game = destructionGame();
    const debris = new SpaceDebris(0, 0); debris.roomId = room.id; debris.isDestroyed = true;
    game.hazards.push(debris);
    game.experimentalAreaIndexes.get(room.id).hazards.add(debris);
    assert.equal(Game.prototype.removeExpiredSpaceDebris.call(game, debris), true);
    assert.equal(game.hazards.length, 0);
    assert.equal(game.experimentalAreaIndexes.get(room.id).hazards.has(debris), false);
    assert.equal(Game.prototype.removeExpiredSpaceDebris.call(game, debris), false);
});

test('environmental contacts destroy only qualifying Small asteroids without rewards', () => {
    const game = destructionGame();
    let awards = 0;
    game.awardXP = () => { awards++; };
    game.hitTarget = Game.prototype.hitTarget;
    const destroy = asteroid => {
        game.asteroids.push(asteroid);
        game.experimentalAreaIndexes.get(room.id).asteroids.add(asteroid);
        asteroid.roomId = room.id;
        return Game.prototype.destroySmallAsteroidEnvironmentally.call(game, asteroid);
    };
    const small = new Asteroid(0, 0, 'small');
    assert.equal(destroy(small), true);
    assert.equal(game.asteroids.includes(small), false);
    assert.equal(awards, 0);
    for (const size of ['medium', 'large']) {
        const asteroid = new Asteroid(0, 0, size);
        assert.equal(destroy(asteroid), false);
        assert.equal(asteroid.isDestroyed, false);
    }
});

test('Small asteroid contact pass covers NPC, every asteroid tier, and Satellite', () => {
    const run = ({ asteroids, players = [], hazards = [] }) => {
        const game = destructionGame();
        game.asteroids.push(...asteroids);
        game.players.push(...players);
        game.hazards.push(...hazards);
        game.asteroidPlayerContacts = new WeakMap();
        game.hitTarget = Game.prototype.hitTarget;
        game.destroySmallAsteroidEnvironmentally = Game.prototype.destroySmallAsteroidEnvironmentally;
        game.compactRemovedProjectiles = Game.prototype.compactRemovedProjectiles;
        for (const entity of [...asteroids, ...players, ...hazards]) entity.roomId = room.id;
        Game.prototype.checkCollisions.call(game);
        return game;
    };

    for (const otherSize of ['large', 'medium']) {
        const small = new Asteroid(10, 10, 'small');
        const other = new Asteroid(10, 10, otherSize);
        run({ asteroids: [small, other] });
        assert.equal(small.isDestroyed, true);
        assert.equal(other.isDestroyed, false);
    }

    const first = new Asteroid(10, 10, 'small');
    const second = new Asteroid(10, 10, 'small');
    run({ asteroids: [first, second] });
    assert.deepEqual([first.isDestroyed, second.isDestroyed], [true, true]);

    const npcSmall = new Asteroid(10, 10, 'small');
    const npc = new Player(10, 10, 9); npc.isNPC = true; npc.spawnImmunityTimer = 0;
    run({ asteroids: [npcSmall], players: [npc] });
    assert.equal(npcSmall.isDestroyed, true);
    assert.equal(npc.isDead, false);

    const satelliteSmall = new Asteroid(10, 10, 'small');
    const satellite = new Satellite(10, 10);
    run({ asteroids: [satelliteSmall], hazards: [satellite] });
    assert.equal(satelliteSmall.isDestroyed, true);
    assert.equal(satellite.isDestroyed, false);
});

test('RPG human overlap collects debris once without damage or shield loss', () => {
    const human = new Player(100, 100, 1);
    human.spawnImmunityTimer = 0;
    human.shieldCharges = 2;
    const debris = new SpaceDebris(100, 100);
    debris.roomId = room.id;
    human.roomId = room.id;
    const game = collisionGame([human], [debris]);
    Game.prototype.checkCollisions.call(game);
    Game.prototype.checkCollisions.call(game);
    assert.equal(human.scrap, 10);
    assert.equal(human.currentHP, human.maxHP);
    assert.equal(human.shieldCharges, 2);
    assert.equal(game.hazards.length, 0);
    assert.equal(human.isDead, false);
});

test('RPG NPC overlap neither collects nor removes debris', () => {
    const npc = new Player(100, 100, 2);
    npc.isNPC = true;
    npc.roomId = room.id;
    const debris = new SpaceDebris(100, 100);
    debris.roomId = room.id;
    const game = collisionGame([npc], [debris]);
    Game.prototype.checkCollisions.call(game);
    assert.equal(npc.scrap, 0);
    assert.equal(game.hazards[0], debris);
    assert.equal(npc.isDead, false);
});

test('RPG debris ignores direct combat, AoE, missiles, and aim locks', () => {
    const debris = new SpaceDebris(0, 0);
    debris.roomId = room.id;
    const game = destructionGame();
    game.hazards.push(debris);
    game.experimentalAreaIndexes.get(room.id).hazards.add(debris);
    Game.prototype.hitTarget.call(game, debris, null);
    assert.equal(debris.hits, 0);
    const player = new Player(0, 0); player.roomId = room.id;
    game.players = [player];
    assert.equal(Game.prototype.isValidAimLockTarget.call(game, player, debris), false);
});

test('RPG population suppresses independent debris while retaining explicit spawning', () => {
    assert.equal(getExperimentalRoomPopulationTargets(1, 1, 5, 1).debris, 0);
    const game = destructionGame();
    const debris = Game.prototype.spawnSpaceDebris.call(game, room.id, { x: 10, y: 20, vx: 3, vy: 4 });
    assert.deepEqual([debris.x, debris.y, debris.vx, debris.vy, debris.roomId], [10, 20, 3, 4, room.id]);
});

test('Satellite confirmed destruction uses one 33% roll and produces 1-3 launched debris', () => {
    assert.equal(RPG_DEBRIS_DROP_CHANCE, 0.33);
    for (const [rolls, expected] of [
        [[0.9], 0],
        [[0.1, 0.0, 0.0, 0.0], 1],
        [[0.1, 0.4, 0.0, 0.0, 0.5, 0.5], 2],
        [[0.1, 0.9, 0.0, 0.0, 0.3, 0.3, 0.6, 0.6], 3]
    ]) {
        const game = destructionGame();
        const satellite = new Satellite(250, 350); satellite.roomId = room.id;
        game.hazards.push(satellite);
        game.experimentalAreaIndexes.get(room.id).hazards.add(satellite);
        withRandom(rolls, () => Game.prototype.hitTarget.call(game, satellite, null));
        assert.equal(game.hazards.filter(h => h.isDebris).length, expected);
        for (const debris of game.hazards) {
            assert.deepEqual([debris.x, debris.y], [250, 350]);
            assert.ok(Math.hypot(debris.vx, debris.vy) >= 70);
        }
    }
});

test('Medium asteroid rolls each of exactly three RPG child opportunities independently', () => {
    for (const [rolls, debrisCount] of [
        [[0.9, 0.9, 0.9], 0], [[0.1, 0.9, 0.9], 1], [[0.1, 0.1, 0.1], 3]
    ]) {
        const game = destructionGame();
        const medium = new Asteroid(400, 500, 'medium'); medium.roomId = room.id;
        game.asteroids.push(medium);
        game.experimentalAreaIndexes.get(room.id).asteroids.add(medium);
        withRandom(rolls, () => { medium.hits = medium.maxHits - 1; Game.prototype.hitTarget.call(game, medium, null); });
        const smallCount = game.asteroids.filter(a => a.size === 'small').length;
        assert.equal(smallCount + game.hazards.filter(h => h.isDebris).length, 3);
        assert.equal(game.hazards.filter(h => h.isDebris).length, debrisCount);
        assert.ok(game.asteroids.filter(a => a.size === 'small').every(a => a.orbit === null));
    }
});

test('Large asteroid optional orbit is dt-based and leaves smaller tiers Newtonian', () => {
    const clockwise = new Asteroid(0, 0, 'large');
    const counter = new Asteroid(0, 0, 'large');
    clockwise.configureOrbit({ clusterId: 'a', centerX: 100, centerY: 200, radiusX: 40, radiusY: 20, phase: 0, angularSpeed: 1 });
    counter.configureOrbit({ clusterId: 'a', centerX: 100, centerY: 200, radiusX: 40, radiusY: 20, phase: 0, angularSpeed: -1 });
    clockwise.update(0.5, { wrap: false }); counter.update(0.5, { wrap: false });
    assert.equal(clockwise.x, counter.x);
    assert.ok(clockwise.y > 200 && counter.y < 200);
    assert.deepEqual([clockwise.orbit.centerX, clockwise.orbit.centerY], [100, 200]);
    const small = new Asteroid(0, 0, 'small'); small.vx = 10; small.vy = 5;
    small.update(2, { wrap: false });
    assert.deepEqual([small.x, small.y, small.orbit], [20, 10, null]);
});

test('two broad RPG clusters derive their centers and extents from room dimensions', () => {
    const clusters = getRpgAsteroidClusters(room.bounds);
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters.map(c => [c.id, c.centerX, c.centerY]), [
        ['bottom-left', 2400, 4050], ['top-right', 7200, 1350]
    ]);
    assert.deepEqual(clusters[0].radiusX, [960, 2112]);
    assert.deepEqual(clusters[0].radiusY, [540, 1188]);
});

test('RPG large replacement keeps the existing delay and rejoins its original cluster', () => {
    const game = destructionGame();
    Object.assign(game, {
        experimentalSessionId: 7,
        experimentalRoomPopulations: new Map([[room.id, { desired: { asteroids: 1, debris: 0, satellites: 0 } }]]),
        getRpgAsteroidClusters: Game.prototype.getRpgAsteroidClusters,
        createRpgOrbitConfig: Game.prototype.createRpgOrbitConfig,
        spawnRpgLargeAsteroid: Game.prototype.spawnRpgLargeAsteroid,
        shouldSpawnExperimentalReplacement: () => true
    });
    const orbit = {
        clusterId: 'top-right', centerX: 7200, centerY: 1350,
        radiusX: 1200, radiusY: 700, phase: 1, angularSpeed: -0.02
    };
    const large = new Asteroid(0, 0, 'large');
    large.configureOrbit(orbit); large.roomId = room.id; large.hits = large.maxHits - 1;
    game.asteroids.push(large);
    game.experimentalAreaIndexes.get(room.id).asteroids.add(large);
    const originalTimeout = globalThis.setTimeout;
    let scheduled;
    globalThis.setTimeout = (callback, milliseconds) => { scheduled = { callback, milliseconds }; return 1; };
    try {
        withRandom(Array(20).fill(0.5), () => Game.prototype.hitTarget.call(game, large, null));
        assert.equal(scheduled.milliseconds, (12 + 0.5 * 32) * 1000);
        assert.equal(game.asteroids.filter(a => a.size === 'medium').length, 3);
        assert.ok(game.asteroids.filter(a => a.size === 'medium').every(a => a.orbit === null));
        withRandom(Array(20).fill(0.5), scheduled.callback);
        const replacement = game.asteroids.find(a => a.size === 'large');
        assert.equal(replacement.orbit.clusterId, 'top-right');
        assert.deepEqual([replacement.orbit.centerX, replacement.orbit.centerY], [7200, 1350]);
    } finally {
        globalThis.setTimeout = originalTimeout;
    }
});
