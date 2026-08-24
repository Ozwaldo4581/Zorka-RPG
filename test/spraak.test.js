import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GAME_MODE } from '../game.js';
import { Asteroid } from '../entities/asteroid.js';
import { Player } from '../entities/player.js';
import {
    Spraak, SPRAAK_DASH_DURATION, SPRAAK_ENTITY_TYPE, SPRAAK_SIZE_MULTIPLIER,
    SPRAAK_STATE
} from '../entities/spraak.js';

test('Spraak has explicit identity, player-relative size, level HP, no shields, and no guns', () => {
    const player = new Player(0, 0);
    for (const level of [1, 5, 20]) {
        const spraak = new Spraak(0, 0, level);
        assert.equal(spraak.entityType, SPRAAK_ENTITY_TYPE);
        assert.equal(spraak.radius, player.radius * SPRAAK_SIZE_MULTIPLIER);
        assert.equal(spraak.maxHP, 6 + level);
        assert.equal(spraak.currentHP, 6 + level);
        assert.deepEqual([spraak.maxShieldCharges, spraak.shieldCharges], [0, 0]);
        assert.equal(spraak.fire(), null);
        assert.equal(spraak.fireMissile(), null);
    }
});

function spawnGame(randomValue) {
    const game = {
        players: [], asteroids: [], experimentalRooms: [{ id: 'sector-1' }],
        gameState: GAME_MODE.EXPERIMENTAL,
        experimentalEntityAreas: null
    };
    game.spawnSpraak = Game.prototype.spawnSpraak;
    game.rollSpraakSpawn = Game.prototype.rollSpraakSpawn;
    const asteroid = new Asteroid(400, 500, 'large');
    asteroid.roomId = 'sector-1';
    return { game, asteroid, result: Game.prototype.rollSpraakSpawn.call(game, asteroid, () => randomValue) };
}

test('Large Asteroid Spraak rolls are deterministic and anchored safely', () => {
    const passing = spawnGame(0);
    assert.ok(passing.result instanceof Spraak);
    assert.equal(passing.game.players.length, 1);
    assert.ok(Math.hypot(passing.result.x - 400, passing.result.y - 500)
        > passing.asteroid.radius + passing.result.radius);
    assert.equal(spawnGame(0.5).result, null);
    const medium = new Asteroid(0, 0, 'medium');
    assert.equal(Game.prototype.rollSpraakSpawn.call({ players: [] }, medium, () => 0), null);
});

test('Spraak behavior transitions through pursuit, hook, brake, and a 0.2 second dash', () => {
    const spraak = new Spraak(0, 0, 1, () => 0.5);
    spraak.roomId = 'sector-1';
    const target = new Player(500, 0);
    target.roomId = 'sector-1';
    const options = { others: [spraak, target], asteroids: [], worldRules: { wrap: false } };
    spraak.update(0.01, options);
    assert.equal(spraak.state, SPRAAK_STATE.PURSUE);
    target.x = 100;
    spraak.update(0.01, options);
    assert.equal(spraak.state, SPRAAK_STATE.HOOK);
    assert.equal(spraak.orbitDuration, 4);
    const chosenDuration = spraak.orbitDuration;
    spraak.update(1, options);
    assert.equal(spraak.orbitDuration, chosenDuration);
    spraak.update(3, options);
    assert.equal(spraak.state, SPRAAK_STATE.BRAKE);
    target.x = spraak.x + 100;
    target.y = spraak.y;
    spraak.vx = 0;
    spraak.vy = 0;
    spraak.update(0.01, options);
    assert.equal(spraak.state, SPRAAK_STATE.DASH);
    assert.equal(spraak.stateTimer, SPRAAK_DASH_DURATION);
    assert.ok(spraak.dashDirection.x > 0);
});

test('Spraak remains outside ordinary Adventure population classification', () => {
    const spraak = new Spraak(0, 0, 8);
    spraak.roomId = 'sector-1';
    const game = { gameState: GAME_MODE.EXPERIMENTAL };
    assert.equal(Game.prototype.isLivingOrdinaryExperimentalRoomEnemy.call(game, spraak, 'sector-1'), false);
});
