import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { Game, GAME_MODE } from '../game.js';

test('Specters choose one 45-75 second lifetime and reuse debris warning phases', () => {
    const minimum = new Player(0, 0, 2);
    const maximum = new Player(0, 0, 3);
    assert.equal(minimum.configureSpecterLifetime(() => 0), 45);
    assert.equal(maximum.configureSpecterLifetime(() => 1), 75);
    assert.equal(minimum.configureSpecterLifetime(() => 1), 45, 'creation lifetime is not rerolled');
    for (const remaining of [3, 1.5, 0.5]) {
        minimum.specterAge = minimum.specterLifeSpan - remaining;
        assert.equal(typeof minimum.isSpecterVisible(), 'boolean');
    }
    assert.equal(minimum.advanceSpecterLifetime(3), true);
    assert.equal(minimum.isSpecterVisible(), false);
});

test('Specters do not satisfy ordinary NPC population and expire without reward or replacement', () => {
    const roomId = 'experimental-room-1';
    const ordinary = Array.from({ length: 4 }, (_, index) => Object.assign(new Player(0, 0, index + 2), {
        isNPC: true, isOrdinaryExperimentalNPC: true, roomId
    }));
    const specters = Array.from({ length: 3 }, (_, index) => {
        const specter = Object.assign(new Player(0, 0, index + 10), {
            isNPC: true, isOrdinaryExperimentalNPC: true, isExperimentalFleeingNPC: true, roomId
        });
        specter.configureSpecterLifetime(() => 0);
        return specter;
    });
    const game = {
        gameState: GAME_MODE.EXPERIMENTAL, players: [...ordinary, ...specters],
        experimentalRooms: [{ id: roomId }],
        experimentalEncounterStates: new Map([[roomId, { npcLevel: 5 }]]),
        experimentalAreaIndexes: new Map([[roomId, { players: new Set([...ordinary, ...specters]) }]]),
        spawnOrdinaryExperimentalRoomNPCs(id, placed, count) { this.spawned = count; },
        clearAimLocksForTarget() {}
    };
    const spawn = Game.prototype.spawnOrdinaryExperimentalRoomNPCs;
    Game.prototype.spawnOrdinaryExperimentalRoomNPCs = function (id, placed, count) { this.spawned = count; };
    assert.equal(Game.prototype.reconcileExperimentalOrdinaryNPCPopulation.call(game, roomId), 1);
    Game.prototype.spawnOrdinaryExperimentalRoomNPCs = spawn;
    assert.equal(game.spawned, 1);
    specters[0].specterAge = specters[0].specterLifeSpan;
    assert.equal(Game.prototype.removeExpiredSpecters.call(game), 1);
    assert.equal(game.players.includes(specters[0]), false);
    assert.equal(game.experimentalAreaIndexes.get(roomId).players.has(specters[0]), false);
    assert.equal(game.spawned, 1, 'timeout does not reconcile or reward');
});

test('each human respawn Specter replaces the previous one and remains outside ordinary population', () => {
    const roomId = 'experimental-room-1';
    const room = { id: roomId, roomNumber: 1 };
    const human = Object.assign(new Player(100, 200, 1), { roomId, level: 5 });
    const ordinary = Object.assign(new Player(0, 0, 2), {
        isNPC: true, isOrdinaryExperimentalNPC: true, roomId
    });
    const game = {
        gameState: GAME_MODE.EXPERIMENTAL,
        players: [human, ordinary], experimentalRooms: [room], botAggressionLevel: 0,
        experimentalAreaIndexes: new Map([[roomId, { players: new Set([human, ordinary]) }]]),
        getExperimentalRoom: Game.prototype.getExperimentalRoom,
        configurePlayerShields(player) { player.configureShields(3, 6); }
    };

    assert.equal(Game.prototype.spawnExperimentalPlayerSpecter.call(game, human).length, 1);
    const first = game.players.find(player => player.isExperimentalSpawnSpecter);
    assert.ok(first?.isSpecter);
    assert.equal(first.maxShieldCharges, 0);
    assert.equal(Game.prototype.isLivingOrdinaryExperimentalRoomEnemy.call(game, first, roomId), false);

    assert.equal(Game.prototype.spawnExperimentalPlayerSpecter.call(game, human).length, 1);
    const active = game.players.filter(player => player.isExperimentalSpawnSpecter);
    assert.equal(active.length, 1);
    assert.notEqual(active[0], first);
});

test('confirmed Specter kills grant no XP and drop floor ten percent of kill-time human Scrap', () => {
    globalThis.window = globalThis.window || {};
    for (const [spawnScrap, killScrap, expectedDebris] of [
        [100, 220, 22],
        [220, 225, 22],
        [100, 9, 0]
    ]) {
        const roomId = 'experimental-room-1';
        const human = Object.assign(new Player(0, 0, 1), { scrap: spawnScrap, roomId });
        const specter = Object.assign(new Player(30, 40, 2), {
            isNPC: true, isOrdinaryExperimentalNPC: true, isExperimentalFleeingNPC: true,
            isExperimentalSpawnSpecter: true, roomId, currentHP: 0, spawnImmunityTimer: 0
        });
        specter.configureSpecterLifetime(() => 0);
        human.scrap = killScrap;
        const xpBefore = human.totalXP;
        const drops = [];
        const game = {
            gameState: GAME_MODE.EXPERIMENTAL, players: [human, specter], hardcoreMode: false,
            experimentalRooms: [{ id: roomId, roomNumber: 1 }],
            experimentalAreaIndexes: new Map([[roomId, { players: new Set([human, specter]) }]]),
            audio: { play() {}, playSpatial() {} }, getActiveCameras: () => [],
            clearAimLocksForTarget() {}, resetTouchInput() {}, createExplosion() {},
            playSpatialEvent() {}, awardXP: Game.prototype.awardXP,
            spawnSpaceDebris(id, options) { drops.push({ id, ...options }); },
            getPrimaryMusicPlayer() { return human; }, resetCombatMusicState() {}
        };

        Game.prototype.confirmPlayerDeath.call(game, specter, human, []);
        assert.equal(human.totalXP, xpBefore);
        assert.equal(drops.length, expectedDebris);
        assert.ok(drops.every(drop => drop.x === 30 && drop.y === 40 && drop.id === roomId));
    }
});
