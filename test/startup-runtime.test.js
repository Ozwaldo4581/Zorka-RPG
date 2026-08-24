import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Game } from '../game.js';

const gameSource = readFileSync(new URL('../game.js', import.meta.url), 'utf8');

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

test('Adventure profile controls remain wired to Game-owned menu actions', () => {
    const listenerSource = (elementId, eventName) => {
        const start = gameSource.indexOf(
            `document.getElementById('${elementId}').addEventListener('${eventName}'`
        );
        assert.notEqual(start, -1, `${elementId} should register a ${eventName} listener`);
        const end = gameSource.indexOf('\n        });', start);
        assert.notEqual(end, -1, `${elementId} listener should be complete`);
        return gameSource.slice(start, end);
    };
    const bindingExpectations = [
        ['btn-experimental-start', 'showExperimentalProfileSelection'],
        ['btn-experimental-profile-play', 'playSelectedExperimentalProfile'],
        ['btn-experimental-profile-create', 'createSelectedExperimentalProfile'],
        ['btn-profile-delete-confirm', 'deleteSelectedExperimentalProfile']
    ];

    for (const [elementId, method] of bindingExpectations) {
        assert.match(listenerSource(elementId, 'click'), new RegExp(`this\\.${method}\\(`));
    }
    const enterListener = listenerSource('experimental-profile-name', 'keydown');
    assert.match(enterListener, /event\.key !== 'Enter'/);
    assert.match(enterListener, /event\.preventDefault\(\)/);
    assert.match(enterListener, /this\.createSelectedExperimentalProfile\(\)/);

    const backListener = listenerSource('btn-experimental-profile-back', 'click');
    assert.match(backListener, /getElementById\('main-menu'\)\.classList\.remove\('hidden'\)/);
    assert.match(backListener, /this\.menuIndex = 0/);
    assert.match(backListener, /this\.lastActiveMenuId = 'main-menu'/);
});
