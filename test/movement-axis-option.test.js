import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Game, MOVEMENT_AXIS_MODE } from '../game.js';
import { Player } from '../entities/player.js';

const updateKeyboard = (player, {
    keys = {},
    mouse = { x: 960, y: 540, m2Held: false },
    mode = MOVEMENT_AXIS_MODE.RELATIVE,
    targetIsValid = () => true
} = {}) => {
    player.controlMode = 'KEYBOARD';
    player.update(0.1, {
        keys,
        mouse,
        movementAxisMode: mode,
        isAimTargetValid: targetIsValid
    });
};

test('movement-axis preference defaults to Relative and accepts only supported values', () => {
    const source = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
    assert.match(source, /this\.movementAxisMode = MOVEMENT_AXIS_MODE\.RELATIVE/);

    const game = { movementAxisMode: MOVEMENT_AXIS_MODE.RELATIVE };
    assert.equal(Game.prototype.setMovementAxisMode.call(game, MOVEMENT_AXIS_MODE.ABSOLUTE), true);
    assert.equal(game.movementAxisMode, MOVEMENT_AXIS_MODE.ABSOLUTE);
    assert.equal(Game.prototype.setMovementAxisMode.call(game, MOVEMENT_AXIS_MODE.RELATIVE), true);
    assert.equal(game.movementAxisMode, MOVEMENT_AXIS_MODE.RELATIVE);
    assert.equal(Game.prototype.setMovementAxisMode.call(game, 'SIDEWAYS'), false);
    assert.equal(game.movementAxisMode, MOVEMENT_AXIS_MODE.RELATIVE);
});

test('movement-axis Options controls expose one selected authoritative default', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /movement-axis-btn selected[^>]+data-movement-axis="RELATIVE"[^>]+aria-pressed="true"/);
    assert.match(html, /movement-axis-btn" data-movement-axis="ABSOLUTE"[^>]+aria-pressed="false"/);
});

test('unlocked Absolute keyboard movement uses world axes independent of mouse aim', () => {
    const cases = [
        [{ KeyW: true }, [0, -160]],
        [{ KeyS: true }, [0, 160]],
        [{ KeyA: true }, [-160, 0]],
        [{ KeyD: true }, [160, 0]],
        [{ KeyW: true, KeyS: true }, [0, 0]],
        [{ KeyA: true, KeyD: true }, [0, 0]],
        [{ KeyW: true, KeyD: true }, [160, -160]]
    ];
    for (const [keys, expected] of cases) {
        for (const mouse of [{ x: 1500, y: 540 }, { x: 420, y: 540 }]) {
            const player = new Player(0, 0);
            updateKeyboard(player, { keys, mouse, mode: MOVEMENT_AXIS_MODE.ABSOLUTE });
            assert.ok(Math.abs(player.vx - expected[0]) < 1e-10, JSON.stringify({ keys, mouse, vx: player.vx }));
            assert.ok(Math.abs(player.vy - expected[1]) < 1e-10, JSON.stringify({ keys, mouse, vy: player.vy }));
        }
    }
});

test('Relative and locked Absolute keyboard movement share the existing aim-relative path', () => {
    const keysToCheck = [
        { KeyW: true }, { KeyS: true }, { KeyA: true }, { KeyD: true },
        { KeyW: true, KeyD: true }, { KeyS: true, KeyA: true }
    ];
    for (const keys of keysToCheck) {
        const relative = new Player(0, 0);
        const lockedAbsolute = new Player(0, 0);
        relative.rotation = lockedAbsolute.rotation = Math.PI / 3;
        const target = { x: 100, y: 25, radius: 10 };
        lockedAbsolute.beginAimLock(target);

        updateKeyboard(relative, { keys, mode: MOVEMENT_AXIS_MODE.RELATIVE });
        updateKeyboard(lockedAbsolute, {
            keys,
            mode: MOVEMENT_AXIS_MODE.ABSOLUTE,
            mouse: { x: 960, y: 540, m2Held: true }
        });
        assert.ok(Math.abs(relative.vx - lockedAbsolute.vx) < 1e-10, JSON.stringify(keys));
        assert.ok(Math.abs(relative.vy - lockedAbsolute.vy) < 1e-10, JSON.stringify(keys));
    }
});

test('Absolute movement follows current lock validity without changing existing velocity', () => {
    const player = new Player(0, 0);
    player.rotation = Math.PI / 2;
    const target = { x: 100, y: 0, radius: 10 };
    player.beginAimLock(target);
    updateKeyboard(player, {
        keys: { KeyW: true },
        mode: MOVEMENT_AXIS_MODE.ABSOLUTE,
        mouse: { x: 960, y: 540, m2Held: true }
    });
    assert.ok(player.vx > 0);
    const lockedVelocity = { x: player.vx, y: player.vy };

    updateKeyboard(player, {
        keys: { KeyW: true },
        mode: MOVEMENT_AXIS_MODE.ABSOLUTE,
        targetIsValid: () => false
    });
    assert.equal(player.aimLockActive, false);
    assert.equal(player.vx, lockedVelocity.x);
    assert.ok(player.vy < lockedVelocity.y);
});
