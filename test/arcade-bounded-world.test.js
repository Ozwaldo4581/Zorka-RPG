import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GAME_MODE, WORLD_WIDTH, WORLD_HEIGHT } from '../game.js';
import { Player } from '../entities/player.js';
import { Asteroid } from '../entities/asteroid.js';
import { Projectile } from '../entities/projectile.js';
import { ARCADE_BOUNDARY_WALLS, ARCADE_BOUNDED_WORLD } from '../world/bounded_arena.js';

test('Arcade selects exactly four immutable world-edge walls and direct geometry', () => {
    const game = { gameState: GAME_MODE.ARCADE };
    const rules = Game.prototype.getWorldRules.call(game);
    assert.equal(rules.wrap, false);
    assert.equal(rules.bounded, true);
    assert.equal(rules.usesRooms, false);
    assert.equal(ARCADE_BOUNDARY_WALLS.length, 4);
    assert.deepEqual(ARCADE_BOUNDED_WORLD.bounds, { left: 0, top: 0, right: WORLD_WIDTH, bottom: WORLD_HEIGHT });
    assert.equal(Object.isFrozen(ARCADE_BOUNDARY_WALLS), true);
});

test('bounded ship contact corrects penetration and preserves tangential slide', () => {
    const player = new Player(8, 200);
    player.previousX = 80;
    player.previousY = 180;
    player.vx = -500;
    player.vy = 75;
    Game.prototype.resolveBoundedSlide.call({}, player);
    assert.ok(player.x > player.radius);
    assert.ok(player.vx >= 0);
    assert.equal(player.vy, 75);
});

test('bounded bodies reflect and swept projectiles terminate or detonate once', () => {
    const asteroid = new Asteroid(WORLD_WIDTH - 5, 300, 'large');
    asteroid.previousX = WORLD_WIDTH - 100;
    asteroid.previousY = 300;
    asteroid.vx = 500;
    asteroid.vy = 0;
    Game.prototype.resolveBoundedBodies.call({}, [asteroid], []);
    assert.ok(asteroid.x < WORLD_WIDTH - asteroid.radius);
    assert.ok(asteroid.vx <= 0);

    const ordinary = new Projectile(WORLD_WIDTH + 20, 400, 1000, 0);
    ordinary.previousX = WORLD_WIDTH - 100;
    ordinary.previousY = 400;
    const game = { removeProjectile(projectile) { projectile.isRemoved = true; } };
    assert.equal(Game.prototype.resolveBoundedProjectileWall.call(game, ordinary), true);
    assert.equal(ordinary.isRemoved, true);

    const missile = new Projectile(WORLD_WIDTH + 20, 500, 1000, 0);
    missile.previousX = WORLD_WIDTH - 100;
    missile.previousY = 500;
    missile.isMissile = true;
    let detonations = 0;
    const missileGame = {
        detonateMissile(projectile) { detonations++; projectile.hasDetonated = true; },
        removeProjectile(projectile) { projectile.isRemoved = true; }
    };
    assert.equal(Game.prototype.resolveBoundedProjectileWall.call(missileGame, missile), true);
    assert.equal(detonations, 1);
    assert.equal(missile.isRemoved, true);
});
