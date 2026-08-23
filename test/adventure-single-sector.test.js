import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperimentalAreas, createExperimentalDoors } from '../world/experimental_rooms.js';
import { EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT, Game, GAME_MODE } from '../game.js';
import { Player } from '../entities/player.js';

const perimeterWalls = room => room.walls.filter(wall => wall.id.includes('-wall-'));
const nookWalls = room => room.walls.filter(wall => wall.id.includes('-interior-left-nook-'));

test('Adventure topology is Sector 1 with four complete perimeter walls', () => {
  const areas = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  assert.equal(areas.length, 1);
  const room = areas[0];
  assert.deepEqual([room.roomNumber, room.npcCount, room.npcLevel], [1, 1, 1]);
  assert.deepEqual(room.connectedAreaIds, []);
  assert.deepEqual(room.entrances, []);
  assert.equal(perimeterWalls(room).length, 4);
  assert.equal(room.walls.some(wall => wall.id.includes('-spawn-ring-')), false);
  assert.equal(room.spawnStructure, undefined);
  assert.equal(createExperimentalDoors(areas).length, 0);
  assert.deepEqual(room.bounds, { left: 0, top: 0, right: EXPERIMENTAL_ROOM_WIDTH, bottom: EXPERIMENTAL_ROOM_HEIGHT });
});

test('Adventure left nook reuses hallway dimensions and terminates at the perimeter', () => {
  const [room] = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  assert.deepEqual(room.leftNook, { direction: 'LEFT', length: 4000, width: 1440, deadEnd: true });
  const walls = nookWalls(room);
  assert.equal(walls.length, 2);
  assert.ok(walls.every(wall => wall.isTwoSided));
  assert.deepEqual(walls.map(wall => wall.start.x), [room.bounds.left, room.bounds.left]);
  assert.deepEqual(walls.map(wall => wall.end.x), [room.bounds.left + 4000, room.bounds.left + 4000]);
  assert.equal(Math.abs(walls[1].start.y - walls[0].start.y), 1440);
  assert.equal(room.connectedAreaIds.length, 0, 'the nook creates no destination area');
  assert.equal(createExperimentalDoors([room]).length, 0, 'the nook creates no transition door');
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
