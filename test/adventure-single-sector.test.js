import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExperimentalAreas,
  createExperimentalDoors,
  createExperimentalWallSpatialIndexes,
  EXPERIMENTAL_AREA_TYPE,
  EXPERIMENTAL_HALLWAY_WIDTH,
  EXPERIMENTAL_SECTOR_0_DEAD_END_DEPTH,
  EXPERIMENTAL_SECTOR_0_DEAD_END_WIDTH,
  isSector0ShopArea
} from '../world/experimental_rooms.js';
import { EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT, Game, GAME_MODE } from '../game.js';
import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectile.js';
import { HUD } from '../ui/hud.js';

function createTopologyGame() {
  const experimentalRooms = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const game = {
    gameState: GAME_MODE.EXPERIMENTAL,
    experimentalRooms,
    experimentalDoors: createExperimentalDoors(experimentalRooms),
    experimentalAreaIndexes: new Map(experimentalRooms.map(area => [area.id, {
      players: new Set(), asteroids: new Set(), hazards: new Set(), projectiles: new Set(), vfx: new Set()
    }])),
    experimentalWallSpatialIndexes: createExperimentalWallSpatialIndexes(experimentalRooms)
  };
  return game;
}

test('Adventure topology connects Sector 1 to a terminal Sector 0 hallway', () => {
  const game = createTopologyGame();
  const room = game.experimentalRooms.find(area => area.roomNumber === 1);
  const hallway = game.experimentalRooms.find(area => area.roomNumber === 0);
  const [door] = game.experimentalDoors;

  assert.equal(game.experimentalRooms.length, 2);
  assert.equal(hallway.areaType, EXPERIMENTAL_AREA_TYPE.HALLWAY);
  assert.equal(hallway.name, 'Sector 0 Shop');
  assert.equal(game.experimentalRooms.filter(isSector0ShopArea).length, 1);
  assert.equal(isSector0ShopArea(room), false);
  assert.equal(hallway.id, 'experimental-sector-0-dead-end-hallway');
  assert.deepEqual(room.connectedAreaIds, [hallway.id]);
  assert.deepEqual(hallway.connectedAreaIds, [room.id]);
  assert.deepEqual(door.roomIds, [room.id, hallway.id]);
  assert.equal(door.orientation, 'VERTICAL');
  assert.equal(door.boundaryCoordinate, room.bounds.left);
  assert.equal(door.openingWidth, EXPERIMENTAL_SECTOR_0_DEAD_END_WIDTH);
  assert.equal(EXPERIMENTAL_SECTOR_0_DEAD_END_WIDTH, EXPERIMENTAL_HALLWAY_WIDTH / 2);
  assert.equal(EXPERIMENTAL_SECTOR_0_DEAD_END_DEPTH, EXPERIMENTAL_SECTOR_0_DEAD_END_WIDTH * 2);
  assert.equal(hallway.bounds.right, room.bounds.left);
  assert.equal(hallway.bounds.left, room.bounds.left - EXPERIMENTAL_SECTOR_0_DEAD_END_DEPTH);
  assert.equal(hallway.bounds.bottom - hallway.bounds.top, EXPERIMENTAL_SECTOR_0_DEAD_END_WIDTH);
  assert.equal(hallway.walls.length, 3);
  assert.equal(hallway.entrances.length, 1);
});

test('Sector 1 left boundary is split around the hallway opening', () => {
  const game = createTopologyGame();
  const room = game.experimentalRooms.find(area => area.roomNumber === 1);
  const door = game.experimentalDoors[0];
  const leftWalls = room.walls.filter(wall => wall.start.x === room.bounds.left && wall.end.x === room.bounds.left);

  assert.equal(leftWalls.length, 2);
  assert.ok(leftWalls.every(wall => Math.max(wall.start.y, wall.end.y) <= door.openingMin
    || Math.min(wall.start.y, wall.end.y) >= door.openingMax));
  assert.equal(door.openingMax - door.openingMin, EXPERIMENTAL_SECTOR_0_DEAD_END_WIDTH);
});

test('human transitions bidirectionally while the dead end has no destination', () => {
  const game = createTopologyGame();
  const room = game.experimentalRooms.find(area => area.roomNumber === 1);
  const hallway = game.experimentalRooms.find(area => area.roomNumber === 0);
  const door = game.experimentalDoors[0];
  const player = new Player(room.bounds.left, door.openingCenter, 1);
  const crossingClearance = player.radius + door.transitionTolerance + 1;
  player.x = room.bounds.left - crossingClearance;
  player.roomId = room.id;
  game.experimentalAreaIndexes.get(room.id).players.add(player);

  Game.prototype.resolveExperimentalPlayerRoomMembership.call(game, player);
  assert.equal(player.roomId, hallway.id);
  assert.equal(game.experimentalAreaIndexes.get(hallway.id).players.has(player), true);
  player.x = room.bounds.left + crossingClearance;
  Game.prototype.resolveExperimentalPlayerRoomMembership.call(game, player);
  assert.equal(player.roomId, room.id);
  assert.equal(hallway.connectedAreaIds.length, 1);
  assert.equal(game.experimentalDoors.filter(candidate => candidate.roomIds.includes(hallway.id)).length, 1);
});

test('hallway side and dead-end walls block players and projectiles through shared rules', () => {
  const game = createTopologyGame();
  const room = game.experimentalRooms.find(area => area.roomNumber === 1);
  const hallway = game.experimentalRooms.find(area => area.roomNumber === 0);
  const centerX = (hallway.bounds.left + hallway.bounds.right) / 2;
  const centerY = (hallway.bounds.top + hallway.bounds.bottom) / 2;
  const player = new Player(centerX, hallway.bounds.top - 100, 1);
  player.roomId = hallway.id;
  player.previousX = centerX;
  player.previousY = centerY;
  assert.equal(Game.prototype.resolveExperimentalSlide.call(game, player), true);

  for (const [fromX, fromY, toX, toY] of [
    [centerX, centerY, hallway.bounds.left - 100, centerY],
    [centerX, centerY, centerX, hallway.bounds.bottom + 100]
  ]) {
    const projectile = new Projectile(toX, toY, 0, 0);
    projectile.roomId = hallway.id;
    projectile.previousX = fromX;
    projectile.previousY = fromY;
    game.removeProjectile = value => { value.isRemoved = true; };
    assert.equal(Game.prototype.resolveExperimentalProjectileWall.call(game, projectile), true);
    assert.equal(projectile.isRemoved, true);
  }

  const entranceShot = new Projectile(hallway.bounds.right - 100, centerY, 0, 0);
  entranceShot.roomId = room.id;
  entranceShot.previousX = room.bounds.left + 100;
  entranceShot.previousY = centerY;
  assert.equal(Game.prototype.resolveExperimentalProjectileWall.call(game, entranceShot), true);

  const missile = new Projectile(hallway.bounds.left - 100, centerY, 0, 0);
  missile.isMissile = true;
  missile.roomId = hallway.id;
  missile.previousX = centerX;
  missile.previousY = centerY;
  let detonated = false;
  game.detonateMissile = () => { detonated = true; };
  assert.equal(Game.prototype.resolveExperimentalProjectileWall.call(game, missile), true);
  assert.equal(detonated, true);
});

test('Adventure minimap shows the entire game world except the Sector 0 Shop', () => {
  const game = createTopologyGame();
  const room = game.experimentalRooms.find(area => area.roomNumber === 1);
  const hallway = game.experimentalRooms.find(area => area.roomNumber === 0);
  const owner = { id: 1, x: room.width / 2, y: room.height / 2, roomId: room.id };
  const segments = [];
  let start = null;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, strokeRect() {}, beginPath() { start = null; }, stroke() {}, fill() {}, arc() {},
    moveTo(x, y) { start = { x, y }; }, lineTo(x, y) { segments.push({ start, end: { x, y } }); }
  };

  HUD.prototype.drawMinimap.call({}, ctx, [owner], [], {}, false, {
    usesRooms: true, owner, rooms: game.experimentalRooms, hazards: []
  });
  const topologySegments = segments.slice(-room.walls.length);
  assert.equal(topologySegments.length, room.walls.length);
  assert.equal(segments.some(segment => segment.start?.x < 1580), false);

  owner.roomId = hallway.id;
  owner.x = (hallway.bounds.left + hallway.bounds.right) / 2;
  owner.y = (hallway.bounds.top + hallway.bounds.bottom) / 2;
  assert.doesNotThrow(() => HUD.prototype.drawMinimap.call({}, ctx, [owner], [], {}, false, {
    usesRooms: true, owner, rooms: game.experimentalRooms, hazards: []
  }));
});

test('Adventure NPC death reconciles the canonical population to one', () => {
  const human = new Player(100, 100, 1);
  const npc = new Player(200, 200, 2); npc.isNPC = true; npc.isOrdinaryExperimentalNPC = true; npc.roomId = 'experimental-room-1';
  const game = {
    gameState: GAME_MODE.EXPERIMENTAL, players: [human, npc], experimentalAreaIndexes: new Map(),
    getExperimentalRoom: () => ({ id: npc.roomId, roomNumber: 1 }),
    spawnOrdinaryExperimentalRoomNPCs(roomId, placed, count) { const replacement = new Player(300, 300, 3); replacement.isNPC = true; replacement.isOrdinaryExperimentalNPC = true; replacement.roomId = roomId; this.players.push(replacement); return [replacement]; }
  };
  game.experimentalAreaIndexes.set(npc.roomId, { players: new Set([npc]) });
  Game.prototype.resolveExperimentalOrdinaryNPCDeath.call(game, npc);
  assert.equal(game.players.filter(player => player.isNPC && !player.isDead).length, 1);
});

test('Adventure minimap uses an undistorted full-world projection', () => {
  const [room] = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const owner = { id: 1, x: 4800, y: 2700, roomId: room.id };
  const nearby = { id: 2, x: owner.x + 960, y: owner.y + 540, roomId: room.id };
  const distant = { id: 3, x: room.bounds.right - 1, y: owner.y, roomId: room.id };
  const arcs = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, strokeRect() {}, save() {}, restore() {}, rect() {}, clip() {},
    beginPath() {}, stroke() {}, fill() {}, moveTo() {}, lineTo() {},
    arc(x, y, radius) { arcs.push({ x, y, radius }); }
  };

  HUD.prototype.drawMinimap.call({}, ctx, [owner, nearby, distant], [], {}, false, {
    usesRooms: true, owner, rooms: [room], hazards: []
  });

  assert.equal(arcs.length, 3, 'every marker in the game world is visible');
  assert.equal((arcs[1].x - arcs[0].x) / 960, (arcs[1].y - arcs[0].y) / 540,
    'one uniform projection scale preserves geometry');
  assert.deepEqual([owner.x, owner.y, nearby.x, nearby.y, distant.x, distant.y],
    [4800, 2700, 5760, 3240, room.bounds.right - 1, 2700]);
});
