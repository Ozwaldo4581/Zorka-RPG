import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperimentalAreas, createExperimentalDoors } from '../world/experimental_rooms.js';
import { EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT, Game, GAME_MODE } from '../game.js';
import { Player } from '../entities/player.js';
import { HUD } from '../ui/hud.js';

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

test('Adventure spawn structure is immutable geometry derived from the initial spawn', () => {
  const [room] = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const structure = room.spawnStructure;
  assert.equal(Object.isFrozen(structure), true);
  assert.equal(Object.isFrozen(structure.rings), true);
  assert.equal(structure.rings.length, 2);
  assert.equal(structure.center, room.initialSpawn);
  assert.ok(structure.rings.every(ring => ring.center === room.initialSpawn && Object.isFrozen(ring)));
  assert.ok(structure.rings[1].radius > structure.rings[0].radius);
  assert.equal(structure.rings[0].gapCenter, Math.PI / 2);
  assert.equal(structure.rings[1].gapCenter, 0);
  assert.equal(room.walls.length, 4, 'decorative rings must not enter collision walls');
});

test('Adventure world and minimap render the same spawn-ring descriptor', () => {
  const [room] = createExperimentalAreas(EXPERIMENTAL_ROOM_WIDTH, EXPERIMENTAL_ROOM_HEIGHT);
  const worldArcs = [];
  const appliedCenters = [];
  const worldContext = {
    save() {}, restore() {}, beginPath() {}, stroke() {},
    arc: (...args) => worldArcs.push(args)
  };
  Game.prototype.drawExperimentalSpawnStructure.call({}, worldContext, {
    apply: (_ctx, x, y) => appliedCenters.push({ x, y })
  }, { currentArea: room });
  assert.deepEqual(appliedCenters, [room.initialSpawn]);
  assert.deepEqual(worldArcs.map(([, , radius, start, end]) => ({ radius, start, end })),
    room.spawnStructure.rings.map(({ radius, startAngle: start, endAngle: end }) => ({ radius, start, end })));

  const minimapArcs = [];
  const minimapContext = {
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc: (...args) => minimapArcs.push(args)
  };
  new HUD().drawMinimap(minimapContext, [], [], null, false, {
    usesRooms: true,
    owner: { roomId: room.id },
    rooms: [room],
    hazards: [],
    worldGeometry: room.spawnStructure
  });
  assert.equal(minimapArcs.length, 2);
  const minimapRadii = minimapArcs.map(([, , radius]) => radius);
  assert.equal(minimapRadii[1] / minimapRadii[0],
    room.spawnStructure.rings[1].radius / room.spawnStructure.rings[0].radius);
  assert.deepEqual(minimapArcs.map(([, , , start, end]) => ({ start, end })),
    room.spawnStructure.rings.map(({ startAngle: start, endAngle: end }) => ({ start, end })));
});

test('spawn-ring renderer is inert without Adventure geometry', () => {
  let arcCount = 0;
  Game.prototype.drawExperimentalSpawnStructure.call({}, {
    arc() { arcCount++; }
  }, { apply() {} }, null);
  assert.equal(arcCount, 0);
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
