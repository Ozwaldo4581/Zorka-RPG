import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Player } from '../entities/player.js';
import { Game, GAME_MODE, SECTOR_0_WEAPON_CATALOG, SPACE_BAR_ROUND_PRICE, getNPCCapsuleRewardCount } from '../game.js';
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
    assert.equal((html.match(/shop-row shop-row-three-column/g) || []).length, 7);
    for (const text of ['Boost', 'Emergency Break', 'Scrap Collector', 'Beam Hook', 'Phase Shifter', "4D Jacob's Latter", '1/100 Black Hole', 'Spacebar']) {
        assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    for (const text of ['Increase Shield', 'Increase Shield Recharge Rate', 'Increase Hull Protection',
        'Increase Hull Recovery Rate', 'Increase Fire Rate', 'Increase Reload Speed', 'Increase Acceleration']) {
        assert.match(html, new RegExp(text));
    }
    assert.equal((html.match(/data-stub-shop-back/g) || []).length, 3);
    assert.equal((html.match(/id="btn-buy-round"/g) || []).length, 1);
    assert.match(html, /1,000<\/span><button id="btn-buy-round"[^>]*>Buy A Round/);
});

test('Sector 0 exposes four semantic interaction areas while Weapons keeps purchase eligibility', () => {
    assert.deepEqual(areas.filter(area => area.roomNumber === 0).map(area => [area.role, area.displayText, area.interaction]), [
        [EXPERIMENTAL_AREA_ROLE.WEAPONS_SHOP, 'Purchase Weapons', 'WEAPONS_SHOP'],
        [EXPERIMENTAL_AREA_ROLE.UTILITY_SHOP, 'Purchase Utility', 'UTILITY_SHOP'],
        [EXPERIMENTAL_AREA_ROLE.SHIP_MODIFICATION, 'Modify Ship', 'SHIP_MODIFICATION'],
        [EXPERIMENTAL_AREA_ROLE.SPACE_BAR, 'Buy a Round for the Bar', 'SPACE_BAR']
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

test('Space dispatch derives from area membership and opens The Space Bar menu', () => {
    const player = new Player(0, 0, 1);
    const game = { ...shopGame(player), isShopMenuOpen: false, isPauseMenuOpen: false, activeModal: null, optionsOpenedFromPause: false };
    for (const role of [EXPERIMENTAL_AREA_ROLE.WEAPONS_SHOP, EXPERIMENTAL_AREA_ROLE.UTILITY_SHOP,
        EXPERIMENTAL_AREA_ROLE.SHIP_MODIFICATION, EXPERIMENTAL_AREA_ROLE.SPACE_BAR]) {
        const area = areas.find(candidate => candidate.role === role);
        player.roomId = area.id;
        assert.equal(Game.prototype.getHumanSector0InteractionArea.call(game), area);
    }
    const spaceBar = areas.find(area => area.role === EXPERIMENTAL_AREA_ROLE.SPACE_BAR);
    player.roomId = spaceBar.id;
    globalThis.document = { querySelectorAll: () => [], getElementById: () => null };
    assert.equal(Game.prototype.handleSector0Interaction.call(game), true);
    delete globalThis.document;
    assert.equal(game.isShopMenuOpen, true);
    assert.equal(game.activeSector0Shop, 'SPACE_BAR');
});

test('NPC capsule reward is level minus three and clamps low levels', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 10].map(getNPCCapsuleRewardCount), [0, 0, 0, 1, 2, 7]);
});

test('Buy A Round atomically advances encounter level and keeps its flat price', () => {
    const player = new Player(0, 0, 1);
    const spaceBar = areas.find(area => area.role === EXPERIMENTAL_AREA_ROLE.SPACE_BAR);
    player.roomId = spaceBar.id;
    player.experimentalLastCombatRoomId = room.id;
    player.scrap = 999;
    const encounter = { npcLevel: 1 };
    const game = {
        ...shopGame(player), activeSector0Shop: 'SPACE_BAR',
        experimentalEncounterStates: new Map([[room.id, encounter]]),
        reconcileExperimentalOrdinaryNPCPopulation() { this.reconciled = (this.reconciled || 0) + 1; }
    };
    const reconcile = Game.prototype.reconcileExperimentalOrdinaryNPCPopulation;
    Game.prototype.reconcileExperimentalOrdinaryNPCPopulation = function () { this.reconciled = (this.reconciled || 0) + 1; };
    assert.equal(Game.prototype.handleSpaceBarRoundIntent.call(game), false);
    assert.deepEqual([player.scrap, encounter.npcLevel], [999, 1]);
    player.scrap = 2000;
    assert.equal(Game.prototype.handleSpaceBarRoundIntent.call(game), true);
    assert.deepEqual([player.scrap, encounter.npcLevel, game.reconciled], [1000, 2, 1]);
    assert.equal(Game.prototype.getSpaceBarRoundOffer.call(game, player).price, SPACE_BAR_ROUND_PRICE);
    assert.equal(Game.prototype.handleSpaceBarRoundIntent.call(game), true);
    Game.prototype.reconcileExperimentalOrdinaryNPCPopulation = reconcile;
    assert.deepEqual([player.scrap, encounter.npcLevel, game.reconciled], [0, 3, 2]);
    assert.equal(Game.prototype.getSpaceBarRoundOffer.call(game, player).price, SPACE_BAR_ROUND_PRICE);
});

test('encounter level derives ordinary NPC target and re-levels survivors while excluding Wisps', () => {
    const roomId = room.id;
    const ordinary = Object.assign(new Player(0, 0, 2), {
        isNPC: true, isOrdinaryExperimentalNPC: true, roomId
    });
    ordinary.initializeNPCLevel(1, () => 0);
    const wisp = Object.assign(new Player(0, 0, 3), {
        isNPC: true, isOrdinaryExperimentalNPC: true, isWisp: true, roomId
    });
    const game = {
        gameState: GAME_MODE.EXPERIMENTAL,
        players: [ordinary, wisp],
        experimentalRooms: [room],
        experimentalEncounterStates: new Map([[roomId, { npcLevel: 2 }]]),
        spawnOrdinaryExperimentalRoomNPCs(_roomId, _players, count) { this.spawned = count; }
    };
    assert.equal(Game.prototype.reconcileExperimentalOrdinaryNPCPopulation.call(game, roomId), 1);
    assert.equal(ordinary.level, 2);
    assert.equal(game.spawned, 1);
    assert.equal(wisp.level, 0);
});

test('player-death world rebuild preserves purchased encounter progression but a fresh run starts at level one', () => {
    const roomId = room.id;
    const human = Object.assign(new Player(0, 0, 1), { experimentalWorldResetPending: true });
    const initializeWorldState = Game.prototype.initializeExperimentalWorldState;
    Game.prototype.initializeExperimentalWorldState = function () {
        const baselineNPC = Object.assign(new Player(0, 0, 2), {
            isNPC: true, isOrdinaryExperimentalNPC: true, roomId
        });
        baselineNPC.initializeNPCLevel(1, () => 0);
        const wisp = Object.assign(new Player(0, 0, 3), {
            isNPC: true, isOrdinaryExperimentalNPC: true, isWisp: true, roomId
        });
        this.players = [human, baselineNPC, wisp];
        this.experimentalRooms = [room];
        this.experimentalEncounterStates = new Map([[roomId, { npcLevel: 1 }]]);
    };

    for (const purchasedLevel of [2, 3]) {
        let nextId = 10;
        const game = {
            gameState: GAME_MODE.EXPERIMENTAL,
            players: [human],
            experimentalRooms: [room],
            experimentalEncounterStates: new Map([[roomId, { npcLevel: purchasedLevel }]]),
            spawnOrdinaryExperimentalRoomNPCs(id, placed, count) {
                for (let index = 0; index < count; index++) {
                    const npc = Object.assign(new Player(0, 0, nextId++), {
                        isNPC: true, isOrdinaryExperimentalNPC: true, roomId: id
                    });
                    npc.initializeNPCLevel(this.experimentalEncounterStates.get(id).npcLevel, () => 0);
                    placed.push(npc);
                }
            }
        };
        assert.equal(Game.prototype.resetExperimentalWorldLoop.call(game, human), true);
        const ordinary = game.players.filter(candidate => candidate.isNPC && !candidate.isWisp);
        assert.equal(game.experimentalEncounterStates.get(roomId).npcLevel, purchasedLevel);
        assert.equal(ordinary.length, purchasedLevel);
        assert.ok(ordinary.every(candidate => candidate.level === purchasedLevel));
        assert.equal(game.players.filter(candidate => candidate.isWisp).length, 1);
    }
    Game.prototype.initializeExperimentalWorldState = initializeWorldState;

    const freshGame = { experimentalRooms: areas, experimentalDoors: [] };
    Game.prototype.initializeExperimentalEncounterStates.call(freshGame);
    assert.equal(freshGame.experimentalEncounterStates.get(roomId).npcLevel, 1);
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

test('purchased progress, Missile acquisition, and selected primary survive death cleanup and respawn', () => {
    const player = new Player(0, 0, 1);
    for (const id of ['Antigun', 'Doublegun', 'Missile', 'Laser', 'Orb', 'Ghost']) player.weaponPurchaseTiers[id] = 1;
    player.restorePurchasedWeaponLoadout();
    player.equipPurchasedWeapon('Laser');
    player.powerUpCapsules = 4;
    player.currentHP = 1;
    player.spawnImmunityTimer = 0;
    const purchasedTiers = structuredClone(player.weaponPurchaseTiers);
    const game = Object.assign(Object.create(Game.prototype), { ...shopGame(player), gameState: GAME_MODE.EXPERIMENTAL, cameras: [], projectiles: [], audio: { play() {} }, vfx: [],
        isHardcoreActive: Game.prototype.isHardcoreActive, createExplosion() {}, playSpatialEvent() {},
        getActiveCameras() { return []; }, isCombatSourceLocked() { return false; }, canDamagePlayerTarget() { return true; },
        isSector9BBGDefender() { return false; }, isNPCDamageSource() { return false; },
        experimentalProfiles: { updateProfile() {} } });
    globalThis.window = {};
    Game.prototype.playerDeath.call(game, player, null);
    delete globalThis.window;
    assert.deepEqual(player.weaponPurchaseTiers, purchasedTiers);
    assert.equal(player.ownsWeapon('Ghost'), true);
    assert.equal(player.hasMissile, true);
    assert.equal(player.missileLevel, 1);
    assert.equal(player.equippedPrimaryGun, 'Laser');
    assert.equal(player.powerUpCapsules, 0);
    assert.equal(player.missileAmmo, 0);

    player.resetTransientLifeState();
    assert.deepEqual(player.weaponPurchaseTiers, purchasedTiers);
    assert.equal(player.hasMissile, true);
    assert.equal(player.missileLevel, 1);
    assert.equal(player.equippedPrimaryGun, 'Laser');
    assert.equal(player.activeGun, 'Laser');
    assert.equal(player.weaponStreamCounts.Laser, 1);
    assert.equal(player.missileAmmo, 0);
    assert.equal(player.missileReloadTimer, 0);
    assert.equal(player.missileShotTimer, 0);
});

test('every valid selected primary survives respawn while invalid state normalizes to Ballistic', () => {
    const primaries = ['Ballistic', 'Antigun', 'Doublegun', 'Laser', 'Orb', 'Ghost'];
    for (const weaponId of primaries) {
        const player = new Player(0, 0, 1);
        if (weaponId !== 'Ballistic') player.weaponPurchaseTiers[weaponId] = 1;
        assert.equal(player.selectPrimaryWeapon(weaponId), true);
        player.isDead = true;
        const game = {
            players: [player],
            gameState: GAME_MODE.SOLO,
            audio: { startGameplayMusic() {} }
        };
        Game.prototype.respawnPlayer.call(game, player);
        assert.equal(player.equippedPrimaryGun, weaponId);
    }

    for (const invalidWeapon of ['Missile', 'Laser', 'legacy-value']) {
        const player = new Player(0, 0, 1);
        player.equippedPrimaryGun = invalidWeapon;
        player.resetTransientLifeState();
        assert.equal(player.equippedPrimaryGun, 'Ballistic');
        assert.equal(player.activeGun, 'Normal');
    }
});

test('fresh Player keeps Ballistic default and no purchased Missile acquisition', () => {
    const player = new Player(0, 0, 1);
    assert.equal(player.equippedPrimaryGun, 'Ballistic');
    assert.equal(player.getWeaponPurchaseTier('Missile'), 0);
    assert.equal(player.hasMissile, false);
    player.resetTransientLifeState();
    assert.equal(player.equippedPrimaryGun, 'Ballistic');
    assert.equal(player.hasMissile, false);
});
