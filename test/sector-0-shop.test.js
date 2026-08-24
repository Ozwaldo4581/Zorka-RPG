import test from 'node:test';
import assert from 'node:assert/strict';

import { Player } from '../entities/player.js';
import { Game, GAME_MODE, SECTOR_0_SHOP_PRICES } from '../game.js';
import { createExperimentalAreas, isSector0ShopArea } from '../world/experimental_rooms.js';

const areas = createExperimentalAreas(9600, 5400);
const room = areas.find(area => area.roomNumber === 1);
const shop = areas.find(isSector0ShopArea);

function shopGame(player) {
    return { gameState: GAME_MODE.EXPERIMENTAL, players: [player], experimentalRooms: areas, isShopMenuOpen: true };
}

test('Shop eligibility uses authoritative living human area membership', () => {
    const player = new Player(0, 0, 1);
    const game = shopGame(player);
    player.roomId = room.id;
    assert.equal(Game.prototype.isHumanInSector0Shop.call(game), false);
    player.roomId = shop.id;
    assert.equal(Game.prototype.isHumanInSector0Shop.call(game), true);
    player.isDead = true;
    assert.equal(Game.prototype.isHumanInSector0Shop.call(game), false);
    player.isDead = false;
    game.gameState = GAME_MODE.SOLO;
    assert.equal(Game.prototype.isHumanInSector0Shop.call(game), false);
});

test('Shop exposes all fifteen authoritative prices', () => {
    assert.deepEqual(SECTOR_0_SHOP_PRICES, [
        [100, 200, 300, 400, 500],
        [1000, 2000, 3000, 4000, 5000],
        [2000, 4000, 6000, 8000, 10000]
    ]);
});

test('purchase charges exact Scrap, advances only its row, and safely rejects failures', () => {
    const player = new Player(0, 0, 1);
    player.roomId = shop.id;
    player.scrap = 100;
    const game = shopGame(player);
    assert.equal(Game.prototype.purchaseSector0ShopUpgrade.call(game, 1), true);
    assert.equal(player.scrap, 0);
    assert.deepEqual(player.shopUpgradeTiers, [1, 0, 0, 0, 0]);
    player.scrap = 999;
    assert.equal(Game.prototype.purchaseSector0ShopUpgrade.call(game, 1), false);
    assert.equal(player.scrap, 999);
    game.isShopMenuOpen = false;
    assert.equal(Game.prototype.purchaseSector0ShopUpgrade.call(game, 2), false);
});

test('each row caps after Tier 3 without a fourth price or deduction', () => {
    const player = new Player(0, 0, 1);
    player.roomId = shop.id;
    player.scrap = 5000;
    player.shopUpgradeTiers[1] = 2;
    const game = shopGame(player);
    assert.equal(Game.prototype.purchaseSector0ShopUpgrade.call(game, 2), true);
    assert.equal(player.scrap, 1000);
    assert.equal(Game.prototype.getSector0ShopOffer.call(game, player, 2), null);
    assert.equal(Game.prototype.purchaseSector0ShopUpgrade.call(game, 2), false);
    assert.equal(player.scrap, 1000);
});
