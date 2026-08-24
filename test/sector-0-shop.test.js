import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Player } from '../entities/player.js';
import { Game, GAME_MODE, SECTOR_0_WEAPON_CATALOG } from '../game.js';
import { createExperimentalAreas, isSector0ShopArea, EXPERIMENTAL_AREA_ROLE } from '../world/experimental_rooms.js';

const areas = createExperimentalAreas(9600, 5400);
const room = areas.find(area => area.roomNumber === 1);
const shop = areas.find(isSector0ShopArea);
const shopGame = player => ({ gameState: GAME_MODE.EXPERIMENTAL, players: [player], experimentalRooms: areas, isShopMenuOpen: true });

test('Shop DOM keeps purchase rows and Back but has no duplicate primary selector', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.equal((html.match(/data-shop-weapon=/g) || []).length, 6);
    assert.match(html, /id="btn-sector-0-shop-back"/);
    assert.doesNotMatch(html, /data-shop-select-weapon|shop-selector|shop-capsule/);
});

test('Sector 0 exposes three semantic terminal areas and only Weapons accepts Shop entry', () => {
    assert.deepEqual(areas.filter(area => area.roomNumber === 0).map(area => [area.role, area.displayText, area.interaction]), [
        [EXPERIMENTAL_AREA_ROLE.WEAPONS_SHOP, 'Purchase Weapons', 'WEAPONS_SHOP'],
        [EXPERIMENTAL_AREA_ROLE.UTILITY_SHOP, 'Purchase Utility', null],
        [EXPERIMENTAL_AREA_ROLE.SHIP_MODIFICATION, 'Modify Ship', null]
    ]);
    const player = new Player(0, 0, 1);
    const game = shopGame(player);
    for (const area of areas) {
        player.roomId = area.id;
        assert.equal(Game.prototype.isHumanInSector0Shop.call(game), area === shop);
    }
    player.roomId = shop.id;
    player.isDead = true;
    assert.equal(Game.prototype.isHumanInSector0Shop.call(game), false);
    player.isDead = false;
    game.gameState = GAME_MODE.SOLO;
    assert.equal(Game.prototype.isHumanInSector0Shop.call(game), false);
    assert.ok(room.connectedAreaIds.includes(shop.id));
});

test('catalog order, fixed prices, and mathematical Missile prices are authoritative', () => {
    assert.deepEqual(SECTOR_0_WEAPON_CATALOG.map(product => product.id),
        ['Antigun', 'Doublegun', 'Missile', 'Laser', 'Orb', 'Ghost']);
    assert.deepEqual(SECTOR_0_WEAPON_CATALOG.filter(product => product.prices).map(product => product.prices), [
        [100, 200, 400], [100, 200, 400], [500, 1500, 3000], [1000, 2500, 4500], [5000, 10000, 15000]
    ]);
    const missile = SECTOR_0_WEAPON_CATALOG.find(product => product.id === 'Missile');
    assert.deepEqual([1, 2, 3, 4, 5, 10].map(missile.priceForTier), [200, 400, 600, 800, 1000, 2000]);
});

test('purchase rows upgrade independently while Shop-only capsule selection is free', () => {
    const player = new Player(0, 0, 1);
    player.roomId = shop.id;
    player.scrap = 2000;
    const game = shopGame(player);
    assert.equal(Game.prototype.handleSector0ShopWeaponIntent.call(game, 'Doublegun'), true);
    assert.equal(Game.prototype.handleSector0ShopWeaponIntent.call(game, 'Doublegun'), true);
    assert.equal(Game.prototype.handleSector0ShopWeaponIntent.call(game, 'Laser'), true);
    assert.equal(player.getWeaponPurchaseTier('Doublegun'), 2);
    assert.equal(player.getWeaponPurchaseTier('Laser'), 1);
    assert.equal(player.equippedPrimaryGun, 'Ballistic');
    assert.equal(Game.prototype.getSector0ShopOffer.call(game, player, 'Doublegun').action, 'purchase');
    const beforeSelect = player.scrap;
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Doublegun'), true);
    assert.equal(player.scrap, beforeSelect);
    assert.equal(player.getWeaponPurchaseTier('Doublegun'), 2);
    assert.equal(Game.prototype.getSector0ShopOffer.call(game, player, 'Doublegun').price, 400);
    assert.equal(Game.prototype.getSector0ShopOffer.call(game, player, 'Laser').price, 1500);
});

test('capped weapons remain selectable only through the primary selector', () => {
    const player = new Player(0, 0, 1);
    player.weaponPurchaseTiers.Antigun = 3;
    player.weaponPurchaseTiers.Orb = 1;
    player.roomId = shop.id;
    player.equipPurchasedWeapon('Orb');
    const game = shopGame(player);
    assert.equal(Game.prototype.getSector0ShopOffer.call(game, player, 'Antigun').action, 'capped');
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Antigun'), true);
    assert.equal(Game.prototype.getSector0ShopOffer.call(game, player, 'Antigun').action, 'capped');
});

test('failed transactions change neither Scrap, tier, nor selection', () => {
    const player = new Player(0, 0, 1);
    player.roomId = shop.id;
    player.scrap = 99;
    const game = shopGame(player);
    assert.equal(Game.prototype.handleSector0ShopWeaponIntent.call(game, 'Antigun'), false);
    assert.equal(player.scrap, 99);
    assert.equal(player.getWeaponPurchaseTier('Antigun'), 0);
    assert.equal(player.equippedPrimaryGun, 'Ballistic');
    game.isShopMenuOpen = false;
    assert.equal(Game.prototype.handleSector0ShopWeaponIntent.call(game, 'Laser'), false);
});

test('Player primary selection defaults to Ballistic and rejects Missile and unowned guns', () => {
    const player = new Player(0, 0, 1);
    player.roomId = shop.id;
    const game = shopGame(player);
    const initialProgress = structuredClone(player.weaponPurchaseTiers);
    assert.equal(player.equippedPrimaryGun, 'Ballistic');
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Missile'), false);
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Laser'), false);
    player.weaponPurchaseTiers.Laser = 1;
    const missileState = [player.missileAmmo, player.missileReloadTimer, player.missileShotTimer];
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Laser'), true);
    assert.deepEqual([player.missileAmmo, player.missileReloadTimer, player.missileShotTimer], missileState);
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Ballistic'), true);
    game.isShopMenuOpen = false;
    assert.equal(Game.prototype.handleSector0ShopSelectionIntent.call(game, 'Laser'), false);
    assert.deepEqual({ ...player.weaponPurchaseTiers, Laser: 0 }, initialProgress);
});

test('purchased progress survives death cleanup while transient state resets', () => {
    const player = new Player(0, 0, 1);
    for (const id of ['Antigun', 'Doublegun', 'Missile', 'Laser', 'Orb', 'Ghost']) player.weaponPurchaseTiers[id] = 1;
    player.equipPurchasedWeapon('Ghost');
    player.powerUpCapsules = 4;
    player.currentHP = 1;
    player.spawnImmunityTimer = 0;
    const game = Object.assign(Object.create(Game.prototype), { ...shopGame(player), gameState: GAME_MODE.EXPERIMENTAL, cameras: [], projectiles: [], audio: { play() {} }, vfx: [],
        isHardcoreActive: Game.prototype.isHardcoreActive, createExplosion() {}, playSpatialEvent() {},
        getActiveCameras() { return []; }, isCombatSourceLocked() { return false; }, canDamagePlayerTarget() { return true; },
        isSector9BBGDefender() { return false; }, isNPCDamageSource() { return false; },
        experimentalProfiles: { updateProfile() {} } });
    globalThis.window = {};
    Game.prototype.playerDeath.call(game, player, null);
    delete globalThis.window;
    assert.deepEqual(Object.values(player.weaponPurchaseTiers), [1, 1, 1, 1, 1, 1]);
    assert.equal(player.ownsWeapon('Ghost'), true);
    assert.equal(player.powerUpCapsules, 0);
    assert.equal(player.missileAmmo, 0);
});
