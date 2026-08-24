import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { HUD } from '../ui/hud.js';

const context = () => ({
    fills: [], strokes: [], texts: [],
    save() {}, restore() {},
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

test('capsule HUD uses the six primary names in order and renders only equipped-primary plus acquired Missile ammo', () => {
    const player = new Player(0, 0);
    player.weaponPurchaseTiers.Antigun = 1;
    player.weaponPurchaseTiers.Doublegun = 1;
    player.weaponPurchaseTiers.Laser = 1;
    player.selectPrimaryWeapon('Laser');
    const withoutMissile = context();
    new HUD().drawPowerUpMeter(withoutMissile, player, 960, 980, 5);
    assert.deepEqual(withoutMissile.texts.filter(text => ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost'].includes(text.value)).map(text => text.value),
        ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost']);
    assert.equal(withoutMissile.texts.some(text => text.value === 'Missile'), false);
    assert.equal(withoutMissile.fills.filter(fill => fill.color === '#9a9a9a').length, player.clipRounds);

    player.weaponPurchaseTiers.Missile = 2;
    player.syncPurchasedWeaponBonuses();
    player.missileAmmo = 2;
    const withMissile = context();
    new HUD().drawPowerUpMeter(withMissile, player, 960, 980, 5);
    assert.equal(withMissile.fills.filter(fill => fill.color === '#9a9a9a').length, player.clipRounds + player.missileAmmo);

    player.selectPrimaryWeapon('Ballistic');
    const ballistic = context();
    new HUD().drawPowerUpMeter(ballistic, player, 960, 980, 5);
    assert.equal(ballistic.fills.filter(fill => fill.color === '#9a9a9a').length, player.clipRounds + player.missileAmmo);
});

test('primary capsule hit regions share render order and exclude the separate Missile status', () => {
    const hud = new HUD();
    const player = new Player(0, 0, 1);
    const boxes = hud.getPrimaryWeaponBoxes();
    assert.deepEqual(boxes.map(box => box.weaponId), ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost']);
    for (const box of boxes) {
        assert.equal(hud.getPrimaryWeaponAt(box.x + 1, box.y + 1, [player])?.weaponId, box.weaponId);
    }
    assert.equal(hud.getPrimaryWeaponAt(boxes.at(-1).x + boxes.at(-1).width + 25, 981, [player]), null);
});

test('Select Weapon is anchored above the capsule bar and retains its three-flash, ten-second cycle', () => {
    const hud = new HUD();
    const visibleAt = now => {
        const ctx = context();
        hud.drawShopWeaponInstruction(ctx, true, 960, 980, now);
        return ctx.texts;
    };
    assert.deepEqual(visibleAt(100).map(text => [text.value, text.y]), [['Select Weapon', 938]]);
    assert.equal(visibleAt(600).length, 0);
    assert.equal(visibleAt(1100).length, 1);
    assert.equal(visibleAt(1600).length, 0);
    assert.equal(visibleAt(2100).length, 1);
    assert.equal(visibleAt(2600).length, 0);
    assert.equal(visibleAt(3100).length, 1);
    assert.equal(visibleAt(12900).length, 1);
    hud.drawShopWeaponInstruction(context(), false, 960, 980, 13000);
    assert.equal(hud.shopInstructionStartedAt, null);
    assert.equal(visibleAt(20000).length, 1);
});
