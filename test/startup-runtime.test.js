import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../game.js';

test('active asset loading has no dependency on removed Adventure constants', async () => {
    const loaded = [];
    const game = {
        loadImage: async source => {
            loaded.push(source);
            return source;
        }
    };

    await Game.prototype.loadAssets.call(game);

    assert.equal(game.assets.ship, 'assets/ShipSketch_256x256.png');
    assert.ok(loaded.includes('assets/space_background.webp'));
    assert.equal(loaded.some(source => /bbg|sector/i.test(source)), false);
});

test('startup cleanup does not recreate removed Adventure encounters', () => {
    const game = {
        camera: null,
        players: [],
        asteroids: [],
        hazards: [],
        projectiles: []
    };

    assert.doesNotThrow(() => Game.prototype.clearExperimentalState.call(game));
    assert.equal(game.sector9BBGEncounter, null);
});
