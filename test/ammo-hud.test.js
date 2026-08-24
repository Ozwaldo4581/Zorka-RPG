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

test('gameplay HUD composes selected primary, Utilities, then optional Missile', () => {
    const player = new Player(0, 0);
    player.weaponPurchaseTiers.Antigun = 1;
    player.weaponPurchaseTiers.Laser = 1;
    player.selectPrimaryWeapon('Laser');
    player.purchaseUtility('Phase Shifter');
    player.purchaseUtility('Boost');
    const hud = new HUD();

    const withoutMissile = hud.getBottomHudBoxes(player);
    assert.deepEqual(withoutMissile.map(box => box.weaponId || box.utilityId),
        ['Laser', 'Boost', 'Phase Shifter']);
    assert.deepEqual(withoutMissile.map(box => box.type), ['primary', 'utility', 'utility']);
    assert.equal(hud.getPrimaryWeaponBoxes(player).length, 1);
    assert.equal(withoutMissile.some(box => box.weaponId === 'Ballistic' || box.weaponId === 'Antigun'), false);
    assert.equal(withoutMissile[0].x < withoutMissile[1].x, true);

    const initialWidth = withoutMissile.at(-1).x + withoutMissile.at(-1).width - withoutMissile[0].x;
    player.purchaseUtility('Scrap Magnet');
    const expanded = hud.getBottomHudBoxes(player);
    assert.ok(expanded.at(-1).x + expanded.at(-1).width - expanded[0].x > initialWidth);
    assert.deepEqual(expanded.filter(box => box.type === 'utility').map(box => box.utilityId),
        UTILITY_IDS.filter(id => ['Boost', 'Scrap Magnet', 'Phase Shifter'].includes(id)));

    player.weaponPurchaseTiers.Missile = 1;
    player.syncPurchasedWeaponBonuses();
    const withMissile = hud.getBottomHudBoxes(player);
    assert.equal(withMissile.at(-1).type, 'missile');
    assert.equal(withMissile.at(-1).weaponId, 'Missile');
    assert.equal(withMissile[0].weaponId, player.equippedPrimaryGun);

    const ctx = context();
    hud.drawPowerUpMeter(ctx, player, 960, 980, 6);
    const weaponLabels = ctx.texts.filter(text => ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost', 'Missile'].includes(text.value));
    assert.deepEqual(weaponLabels.map(text => text.value), ['Laser', 'Missile']);
});

test('primary hit geometry contains only the rendered selected-primary bookend', () => {
    const hud = new HUD();
    const player = new Player(0, 0, 1);
    player.weaponPurchaseTiers.Antigun = 1;
    player.selectPrimaryWeapon('Antigun');
    player.purchaseUtility('Boost');
    const boxes = hud.getPrimaryWeaponBoxes(player);
    assert.deepEqual(boxes.map(box => box.weaponId), ['Antigun']);
    assert.equal(hud.getPrimaryWeaponAt(boxes[0].x + 1, boxes[0].y + 1, [player])?.weaponId, 'Antigun');
    const utility = hud.getBottomHudBoxes(player).find(box => box.type === 'utility');
    assert.equal(hud.getPrimaryWeaponAt(utility.x + 1, utility.y + 1, [player]), null);
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
