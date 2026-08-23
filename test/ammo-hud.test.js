import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { HUD } from '../ui/hud.js';

const context = () => ({
    fills: [], strokes: [], texts: [],
    measureText(value) { return { width: String(value).length * 8 }; },
    fillRect(x, y, width, height) { this.fills.push({ x, y, width, height, color: this.fillStyle }); },
    strokeRect(x, y, width, height) { this.strokes.push({ x, y, width, height }); },
    fillText(value, x, y) { this.texts.push({ value: String(value), x, y }); }
});

test('Speed meter adds one presentation cube for every Player Speed upgrade', () => {
    const player = new Player(0, 0);
    const hud = new HUD();
    for (const upgrades of [0, 1, 4]) {
        player.speedUpgradeCount = upgrades;
        const ctx = context();
        hud.drawSpeedMeter(ctx, player, 960, 980, 5);
        assert.equal(ctx.fills.length, 5 + upgrades);
    }
});

test('ammo cubes derive filled and spent positions from Player clip state', () => {
    const player = new Player(0, 0);
    player.clipRounds = 8;
    const ctx = context();
    new HUD().drawAmmoMeter(ctx, player.getPrimaryAmmoState(), 100, 50, 76);
    assert.equal(ctx.fills.length, 12);
    assert.equal(ctx.fills.filter(fill => fill.color === '#9a9a9a').length, 8);
    assert.equal(ctx.strokes.length, 4);
});

test('ammo reload countdown clamps at zero and formats authoritative time to two decimals', () => {
    const hud = new HUD();
    const ctx = context();
    hud.drawAmmoMeter(ctx, { capacity: 4, ammo: 0, reloadRemaining: 3.5 }, 100, 50, 76);
    assert.deepEqual(ctx.texts.map(text => text.value), ['3.50']);
    assert.equal(ctx.fills.length, 0);

    const completed = context();
    hud.drawAmmoMeter(completed, { capacity: 4, ammo: 4, reloadRemaining: -0.01 }, 100, 50, 76);
    assert.equal(completed.texts.length, 0);
    assert.equal(completed.fills.length, 4);
});
