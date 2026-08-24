import test from 'node:test';
import assert from 'node:assert/strict';

import { Player, UTILITY_IDS } from '../entities/player.js';
import { HUD } from '../ui/hud.js';

const context = () => ({
    fills: [], strokes: [], texts: [],
    save() {}, restore() {},
    measureText(value) { return { width: String(value).length * 8 }; },
    fillRect(x, y, width, height) { this.fills.push({ x, y, width, height, color: this.fillStyle }); },
    strokeRect(x, y, width, height) { this.strokes.push({ x, y, width, height, color: this.strokeStyle, lineWidth: this.lineWidth }); },
    fillText(value, x, y) { this.texts.push({ value: String(value), x, y, color: this.fillStyle }); }
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

test('gameplay weapon HUD derives selected-first owned ordering and appends purchased Missile', () => {
    const player = new Player(0, 0);
    player.weaponPurchaseTiers.Antigun = 1;
    player.weaponPurchaseTiers.Doublegun = 1;
    player.weaponPurchaseTiers.Laser = 1;
    player.selectPrimaryWeapon('Laser');
    const withoutMissile = context();
    new HUD().drawPowerUpMeter(withoutMissile, player, 960, 980, 5);
    assert.deepEqual(withoutMissile.texts.filter(text => ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost'].includes(text.value)).map(text => text.value),
        ['Laser', 'Ballistic', 'Antigun', 'Doublegun']);
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
    assert.deepEqual(ballistic.texts.filter(text => ['Ballistic', 'Antigun', 'Doublegun', 'Laser'].includes(text.value)).map(text => text.value),
        ['Ballistic', 'Antigun', 'Doublegun', 'Laser']);
    const labels = ballistic.texts.filter(text => ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Missile'].includes(text.value));
    assert.equal(labels.at(-1).value, 'Missile');
    assert.equal(ballistic.fills.filter(fill => fill.color === '#9a9a9a').length, player.clipRounds + player.missileAmmo);
});

test('primary capsule hit regions share render order and exclude the separate Missile status', () => {
    const hud = new HUD();
    const player = new Player(0, 0, 1);
    player.weaponPurchaseTiers.Antigun = 1;
    player.weaponPurchaseTiers.Laser = 1;
    player.weaponPurchaseTiers.Missile = 1;
    player.selectPrimaryWeapon('Laser');
    const boxes = hud.getPrimaryWeaponBoxes(player);
    assert.deepEqual(boxes.map(box => box.weaponId), ['Laser', 'Ballistic', 'Antigun']);
    for (const box of boxes) {
        assert.equal(hud.getPrimaryWeaponAt(box.x + 1, box.y + 1, [player])?.weaponId, box.weaponId);
    }
    assert.equal(hud.getPrimaryWeaponAt(boxes.at(-1).x + boxes.at(-1).width + 8, 981, [player]), null);
});

test('shop weapon bar is fixed-order, selected-aware, Missile-last, and separately hit-tested', () => {
    const hud = new HUD();
    const player = new Player(0, 0);
    player.weaponPurchaseTiers.Laser = 1;
    player.weaponPurchaseTiers.Missile = 1;
    player.selectPrimaryWeapon('Laser');
    const hidden = context();
    hud.drawShopWeaponBar(hidden, player, false, 960, 850);
    assert.equal(hidden.texts.length, 0);
    const shown = context();
    hud.drawShopWeaponBar(shown, player, true, 960, 850);
    assert.deepEqual(shown.texts.slice(1).map(text => text.value),
        ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost', 'Missile']);
    const boxes = hud.getShopWeaponBoxes(player);
    assert.equal(hud.getShopPrimaryWeaponAt(boxes[3].x + 1, boxes[3].y + 1, [player])?.weaponId, 'Laser');
    assert.equal(hud.getShopPrimaryWeaponAt(boxes.at(-1).x + 1, boxes.at(-1).y + 1, [player]), null);
    assert.equal(shown.strokes.some(stroke => stroke.color === player.color && stroke.lineWidth === 3), true);
});

test('Utility Bar hides unpurchased utilities and expands in canonical order', () => {
    const hud = new HUD();
    const player = new Player(0, 0);
    assert.deepEqual(hud.getUtilityBoxes(player), []);
    player.purchaseUtility('Phase Shifter');
    player.purchaseUtility('Scrap Magnet');
    player.purchaseUtility('Boost');
    assert.deepEqual(hud.getUtilityBoxes(player).map(box => box.utilityId),
        UTILITY_IDS.filter(id => ['Boost', 'Scrap Magnet', 'Phase Shifter'].includes(id)));
});

test('Utility Bar renders ready keys, two-decimal cooldowns, and Player-owned active highlights', () => {
    const hud = new HUD();
    const player = new Player(0, 0);
    UTILITY_IDS.forEach(id => player.purchaseUtility(id));
    Object.assign(player, {
        boostTimer: 0.5, boostCooldownTimer: 11.234,
        emergencyBrakeActive: true, scrapMagnetActive: true,
        beamHookTarget: {}, phaseShifterTimer: 2, phaseShifterCooldownTimer: 3.5,
        blackHoleCooldownTimer: 0.004
    });
    const cooling = context();
    hud.drawUtilityBar(cooling, player, 960, 920);
    assert.deepEqual(cooling.texts.filter(text => text.y === 912).map(text => text.value),
        ['11.23', 'Q', '1', '2', '3.50', '4', '0.00']);
    assert.equal(new Set(cooling.strokes.filter(stroke => stroke.color === player.color && stroke.lineWidth === 3)
        .map(stroke => `${stroke.x}:${stroke.y}`)).size, 5);
    player.boostTimer = player.phaseShifterTimer = 0;
    player.boostCooldownTimer = player.phaseShifterCooldownTimer = player.blackHoleCooldownTimer = 0;
    const ready = context();
    hud.drawUtilityBar(ready, player, 960, 920);
    assert.deepEqual(ready.texts.filter(text => text.y === 912).map(text => text.value),
        ['Space', 'Q', '1', '2', '3', '4', '5']);
});
