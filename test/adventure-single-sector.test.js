import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperimentalAreas, createExperimentalDoors } from '../world/experimental_rooms.js';
import { EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT, Game, GAME_MODE } from '../game.js';
import { Player } from '../entities/player.js';

test('Adventure topology is Sector 1 with four complete perimeter walls', () => {
  const areas = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  assert.equal(areas.length, 1);
  const room = areas[0];
  assert.deepEqual([room.roomNumber, room.npcCount, room.npcLevel], [1, 1, 1]);
  assert.deepEqual(room.connectedAreaIds, []);
  assert.deepEqual(room.entrances, []);
  assert.equal(room.walls.length, 4);
  assert.equal(createExperimentalDoors(areas).length, 0);
  assert.deepEqual(room.bounds, { left: 0, top: 0, right: EXPERIMENTAL_ROOM_WIDTH, bottom: EXPERIMENTAL_ROOM_HEIGHT });
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
