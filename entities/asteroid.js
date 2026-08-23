import { updateNewtonian } from '../physics.js';

export class Asteroid {
    constructor(x, y, size = 'large') {
        this.x = x;
        this.y = y;
        this.size = size;
        this.hits = 0;

        const baseSpeed = 50 + Math.random() * 100;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * baseSpeed;
        this.vy = Math.sin(angle) * baseSpeed;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 2;

        if (size === 'large') {
            this.radius = 80;
            this.maxHits = 3;
        } else if (size === 'medium') {
            this.radius = 45;
            this.maxHits = 2;
        } else {
            this.radius = 20;
            this.maxHits = 1;
        }
        this.isDestroyed = false; // Flag to prevent double-destruction in one frame
        this.orbit = null;
    }

    configureOrbit({ clusterId, centerX, centerY, radiusX, radiusY, phase, angularSpeed }) {
        if (this.size !== 'large') return false;
        this.orbit = { clusterId, centerX, centerY, radiusX, radiusY, phase, angularSpeed };
        this.x = centerX + Math.cos(phase) * radiusX;
        this.y = centerY + Math.sin(phase) * radiusY;
        return true;
    }

    update(dt, worldRules = null) {
        if (this.size === 'large' && this.orbit) {
            this.orbit.phase += this.orbit.angularSpeed * dt;
            this.x = this.orbit.centerX + Math.cos(this.orbit.phase) * this.orbit.radiusX;
            this.y = this.orbit.centerY + Math.sin(this.orbit.phase) * this.orbit.radiusY;
        } else {
            updateNewtonian(this, dt, undefined, worldRules);
        }
        this.rotation += this.rotSpeed * dt;
    }

    draw(ctx, assets, camera) {
        ctx.save();
        camera.apply(ctx, this.x, this.y);
        ctx.rotate(this.rotation);
        const drawSize = this.radius * 2.2;
        ctx.drawImage(assets.asteroid, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.restore();
    }
}
