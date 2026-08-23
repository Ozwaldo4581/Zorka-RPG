import { WORLD_WIDTH, WORLD_HEIGHT } from '../world_config.js';

export const BOUNDED_WALL_COLLISION_THICKNESS = 32;
export const BOUNDED_WALL_VISUAL_CORE_THICKNESS = 4;
export const BOUNDED_WALL_SEPARATION_EPSILON = 0.5;
export const BOUNDED_WALL_MAX_CORRECTION_PASSES = 4;

const point = (x, y) => Object.freeze({ x, y });

export const ARCADE_BOUNDARY_WALLS = Object.freeze([
    Object.freeze({ id: 'arcade-wall-top', start: point(0, 0), end: point(WORLD_WIDTH, 0) }),
    Object.freeze({ id: 'arcade-wall-right', start: point(WORLD_WIDTH, 0), end: point(WORLD_WIDTH, WORLD_HEIGHT) }),
    Object.freeze({ id: 'arcade-wall-bottom', start: point(WORLD_WIDTH, WORLD_HEIGHT), end: point(0, WORLD_HEIGHT) }),
    Object.freeze({ id: 'arcade-wall-left', start: point(0, WORLD_HEIGHT), end: point(0, 0) })
]);

export const ARCADE_BOUNDED_WORLD = Object.freeze({
    bounds: Object.freeze({ left: 0, top: 0, right: WORLD_WIDTH, bottom: WORLD_HEIGHT }),
    walls: ARCADE_BOUNDARY_WALLS,
    wallCollisionThickness: BOUNDED_WALL_COLLISION_THICKNESS,
    wallVisualCoreThickness: BOUNDED_WALL_VISUAL_CORE_THICKNESS,
    collisionEpsilon: BOUNDED_WALL_SEPARATION_EPSILON,
    maxCorrectionPasses: BOUNDED_WALL_MAX_CORRECTION_PASSES
});
