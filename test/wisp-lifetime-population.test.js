import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { Game, GAME_MODE } from '../game.js';

test('Specter Wisps choose one 45-75 second lifetime and reuse debris warning phases', () => {
    const minimum = new Player(0, 0, 2);
    const maximum = new Player(0, 0, 3);
    assert.equal(minimum.configureWispLifetime(() => 0), 45);
    assert.equal(maximum.configureWispLifetime(() => 1), 75);
    assert.equal(minimum.configureWispLifetime(() => 1), 45, 'creation lifetime is not rerolled');
    for (const remaining of [3, 1.5, 0.5]) {
        minimum.wispAge = minimum.wispLifeSpan - remaining;
        assert.equal(typeof minimum.isWispVisible(), 'boolean');
    }
    assert.equal(minimum.advanceWispLifetime(3), true);
    assert.equal(minimum.isWispVisible(), false);
});

test('Wisps do not satisfy ordinary NPC population and expire without reward or replacement', () => {
    const roomId = 'experimental-room-1';
    const ordinary = Array.from({ length: 4 }, (_, index) => Object.assign(new Player(0, 0, index + 2), {
        isNPC: true, isOrdinaryExperimentalNPC: true, roomId
    }));
    const wisps = Array.from({ length: 3 }, (_, index) => {
        const wisp = Object.assign(new Player(0, 0, index + 10), {
            isNPC: true, isOrdinaryExperimentalNPC: true, isExperimentalFleeingNPC: true, roomId
        });
        wisp.configureWispLifetime(() => 0);
        return wisp;
    });
    const game = {
        gameState: GAME_MODE.EXPERIMENTAL, players: [...ordinary, ...wisps],
        experimentalRooms: [{ id: roomId }],
        experimentalEncounterStates: new Map([[roomId, { npcCount: 5 }]]),
        experimentalAreaIndexes: new Map([[roomId, { players: new Set([...ordinary, ...wisps]) }]]),
        spawnOrdinaryExperimentalRoomNPCs(id, placed, count) { this.spawned = count; },
        clearAimLocksForTarget() {}
    };
    const spawn = Game.prototype.spawnOrdinaryExperimentalRoomNPCs;
    Game.prototype.spawnOrdinaryExperimentalRoomNPCs = function (id, placed, count) { this.spawned = count; };
    assert.equal(Game.prototype.reconcileExperimentalOrdinaryNPCPopulation.call(game, roomId), 1);
    Game.prototype.spawnOrdinaryExperimentalRoomNPCs = spawn;
    assert.equal(game.spawned, 1);
    wisps[0].wispAge = wisps[0].wispLifeSpan;
    assert.equal(Game.prototype.removeExpiredWisps.call(game), 1);
    assert.equal(game.players.includes(wisps[0]), false);
    assert.equal(game.experimentalAreaIndexes.get(roomId).players.has(wisps[0]), false);
    assert.equal(game.spawned, 1, 'timeout does not reconcile or reward');
});
