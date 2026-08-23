import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExperimentalAreas,
  createExperimentalDoors,
  createExperimentalWallSpatialIndexes,
  EXPERIMENTAL_HALLWAY_WIDTH,
  EXPERIMENTAL_SECTOR_1_NOOK_DEPTH,
  EXPERIMENTAL_SECTOR_1_NOOK_WIDTH
} from '../world/experimental_rooms.js';
import { EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT, Game, GAME_MODE } from '../game.js';
import { Player } from '../entities/player.js';
import { HUD } from '../ui/hud.js';

test('Adventure topology is Sector 1 with a three-wall left-side nook', () => {
  const areas = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  assert.equal(areas.length, 1);
  const room = areas[0];
  assert.deepEqual([room.roomNumber, room.npcCount, room.npcLevel], [1, 1, 1]);
  assert.deepEqual(room.connectedAreaIds, []);
  assert.deepEqual(room.entrances, []);
  assert.equal(room.walls.length, 7);
  assert.equal(createExperimentalDoors(areas).length, 0);
  assert.deepEqual(room.bounds, { left: 0, top: 0, right: EXPERIMENTAL_ROOM_WIDTH, bottom: EXPERIMENTAL_ROOM_HEIGHT });
});

test('Sector 1 nook is a small 2:1 dead end with an open room-facing mouth', () => {
  const [room] = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const nookWalls = room.walls.filter(wall => wall.id.includes('-interior-left-nook-'));
  const wallBySuffix = suffix => nookWalls.find(wall => wall.id.endsWith(suffix));
  const top = wallBySuffix('-top');
  const bottom = wallBySuffix('-bottom');
  const deadEnd = wallBySuffix('-dead-end');

  assert.equal(EXPERIMENTAL_SECTOR_1_NOOK_WIDTH, EXPERIMENTAL_HALLWAY_WIDTH / 2);
  assert.equal(EXPERIMENTAL_SECTOR_1_NOOK_DEPTH, EXPERIMENTAL_SECTOR_1_NOOK_WIDTH * 2);
  assert.equal(nookWalls.length, 3);
  assert.ok(nookWalls.every(wall => wall.isTwoSided));
  assert.equal(bottom.start.y - top.start.y, EXPERIMENTAL_SECTOR_1_NOOK_WIDTH);
  assert.equal(top.end.x - top.start.x, EXPERIMENTAL_SECTOR_1_NOOK_DEPTH);
  assert.equal(bottom.start.x - bottom.end.x, EXPERIMENTAL_SECTOR_1_NOOK_DEPTH);
  assert.deepEqual(deadEnd.start, { x: room.bounds.left, y: bottom.start.y });
  assert.deepEqual(deadEnd.end, { x: room.bounds.left, y: top.start.y });
  assert.equal(nookWalls.some(wall => wall.start.x === top.end.x && wall.end.x === top.end.x), false);
  assert.deepEqual(room.entrances, []);
  assert.equal(createExperimentalDoors([room]).length, 0);
});

test('Sector 1 nook walls use shared swept collision while its mouth remains passable', () => {
  const areas = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const room = areas[0];
  const centerY = (room.bounds.top + room.bounds.bottom) / 2;
  const mouthX = room.bounds.left + EXPERIMENTAL_SECTOR_1_NOOK_DEPTH;
  const game = {
    experimentalRooms: areas,
    experimentalDoors: [],
    experimentalWallSpatialIndexes: createExperimentalWallSpatialIndexes(areas)
  };
  const move = (previousX, previousY, x, y) => {
    const player = new Player(x, y, 1);
    player.roomId = room.id;
    player.previousX = previousX;
    player.previousY = previousY;
    player.velocityX = x - previousX;
    player.velocityY = y - previousY;
    const collided = Game.prototype.resolveExperimentalSlide.call(game, player);
    return { player, collided };
  };

  assert.equal(move(mouthX + 100, centerY, mouthX - 100, centerY).collided, false);
  assert.equal(move(mouthX - 100, centerY, mouthX + 100, centerY).collided, false);
  assert.equal(move(mouthX - 100, centerY, mouthX - 100, centerY - EXPERIMENTAL_SECTOR_1_NOOK_WIDTH).collided, true);
  assert.equal(move(mouthX - 100, centerY, mouthX - 100, centerY + EXPERIMENTAL_SECTOR_1_NOOK_WIDTH).collided, true);
  const deadEndHit = move(mouthX - 100, centerY, room.bounds.left - 500, centerY);
  assert.equal(deadEndHit.collided, true);
  assert.ok(deadEndHit.player.x > room.bounds.left);
});

test('Adventure minimap projects the nook from authoritative interior walls', () => {
  const [room] = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const owner = { id: 1, x: EXPERIMENTAL_ROOM_WIDTH / 2, y: EXPERIMENTAL_ROOM_HEIGHT / 2, roomId: room.id };
  const segments = [];
  let start = null;
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, strokeRect() {}, beginPath() { start = null; }, stroke() {}, fill() {}, arc() {},
    moveTo(x, y) { start = { x, y }; },
    lineTo(x, y) { segments.push({ start, end: { x, y } }); }
  };

  HUD.prototype.drawMinimap.call({}, ctx, [owner], [], {}, false, {
    usesRooms: true, owner, rooms: [room], hazards: []
  });

  const nookSegments = segments.slice(-3);
  assert.equal(nookSegments.length, 3);
  assert.deepEqual(nookSegments.map(segment => segment.start.x), [1580, 1628, 1580]);
  assert.deepEqual(nookSegments.map(segment => segment.end.x), [1628, 1580, 1580]);
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
