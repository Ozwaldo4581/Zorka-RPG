import { Player, getVibrationRenderOffset } from './player.js';
import { getDirectionalForce, getEmergencyBrakeForce, updateNewtonian } from '../physics.js';

export const SPRAAK_ENTITY_TYPE = 'SPRAAK';
export const SPRAAK_SIZE_MULTIPLIER = 1;
export const SPRAAK_SPAWN_CHANCE = 0.33;
export const SPRAAK_CONTACT_DAMAGE = 3;
export const SPRAAK_ACQUISITION_RANGE = 900;
export const SPRAAK_GIVE_UP_RANGE = 1200;
export const SPRAAK_HOOK_RANGE = 240;
export const SPRAAK_DASH_DURATION = 0.75;
export const SPRAAK_CHARGE_DURATION = 1.25;
export const SPRAAK_PURSUIT_FORCE_MULTIPLIER = 0.8;
export const SPRAAK_DASH_FORCE_MULTIPLIER = 24;
export const SPRAAK_DASH_SPEED_MULTIPLIER = 10;

export const SPRAAK_STATE = Object.freeze({
    ROAM: 'ASTEROID_ROAM', PURSUE: 'PURSUE', HOOK: 'HOOK_ORBIT',
    BRAKE: 'EMERGENCY_BRAKE', CHARGE: 'CHARGE', DASH: 'DASH', RETURN: 'RETURN'
});

export class Spraak extends Player {
    constructor(x, y, level = 1, random = Math.random) {
        super(x, y, 0, '#ffffff');
        this.entityType = SPRAAK_ENTITY_TYPE;
        this.isNPC = true;
        this.isOrdinaryExperimentalNPC = false;
        this.noRespawn = true;
        this.name = 'Spraak';
        this.radius *= SPRAAK_SIZE_MULTIPLIER;
        this.level = Math.max(1, Math.floor(Number(level) || 1));
        this.maxHP = this.level + 1;
        this.currentHP = this.maxHP;
        this.maxShieldCharges = 0;
        this.baselineMaxShieldCharges = 0;
        this.shieldCharges = 0;
        this.hasForcefield = false;
        this.state = SPRAAK_STATE.ROAM;
        this.target = null;
        this.clusterAnchor = null;
        this.stateTimer = 0;
        this.orbitDuration = 0;
        this.dashDirection = { x: 0, y: -1 };
        this.random = random;
    }

    fire() { return null; }
    fireMissile() { return null; }
    updateShieldRecharge() {}
    resolveNPCLevelUps() {}

    isValidTarget(target, ships) {
        return target && target !== this && target.entityType !== SPRAAK_ENTITY_TYPE
            && !target.isDead && !target.isEliminated && ships.includes(target)
            && target.roomId === this.roomId;
    }

    selectTarget(ships, range) {
        let nearest = null;
        let nearestDistance = range;
        for (const ship of ships) {
            if (!this.isValidTarget(ship, ships)) continue;
            const distance = Math.hypot(ship.x - this.x, ship.y - this.y);
            if (distance < nearestDistance) {
                nearest = ship;
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    enterHook(random = this.random) {
        this.state = SPRAAK_STATE.HOOK;
        this.orbitDuration = 2 + random() * 4;
        this.stateTimer = this.orbitDuration;
        this.beamHookTarget = this.target;
        this.beamHookDistance = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    }

    clearTarget(nextState = SPRAAK_STATE.RETURN) {
        this.target = null;
        this.beamHookTarget = null;
        this.beamHookDistance = 0;
        this.state = nextState;
    }

    getChargeRenderOffset(now = Date.now()) {
        return this.state === SPRAAK_STATE.CHARGE
            ? getVibrationRenderOffset(now)
            : { x: 0, y: 0 };
    }

    update(dt, { others = [], asteroids = [], worldRules = null } = {}) {
        if (this.isDead || this.isEliminated) return;
        this.updateDamagePulses(dt);
        this.updateHPRecharge(dt);
        if (this.spawnImmunityTimer > 0) this.spawnImmunityTimer = Math.max(0, this.spawnImmunityTimer - dt);

        if (this.target && (!this.isValidTarget(this.target, others)
            || Math.hypot(this.target.x - this.x, this.target.y - this.y) > SPRAAK_GIVE_UP_RANGE)) {
            this.clearTarget();
        }
        if (!this.target && this.state !== SPRAAK_STATE.RETURN) {
            this.target = this.selectTarget(others, SPRAAK_ACQUISITION_RANGE);
            if (this.target) this.state = SPRAAK_STATE.PURSUE;
        }

        let fx = 0;
        let fy = 0;
        const steer = (x, y, strength = SPRAAK_PURSUIT_FORCE_MULTIPLIER) => {
            const dx = x - this.x;
            const dy = y - this.y;
            this.rotation = Math.atan2(dy, dx) + Math.PI / 2;
            const force = getDirectionalForce(this, { x, y }, this.getEffectiveThrust() * strength);
            fx = force.x;
            fy = force.y;
        };

        if (this.state === SPRAAK_STATE.PURSUE && this.target) {
            const distance = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            if (distance <= SPRAAK_HOOK_RANGE) this.enterHook();
            else steer(this.target.x, this.target.y);
        } else if (this.state === SPRAAK_STATE.HOOK && this.target) {
            this.stateTimer = Math.max(0, this.stateTimer - dt);
            const angle = Math.atan2(this.y - this.target.y, this.x - this.target.x) + Math.PI / 2;
            const desiredRadius = Math.max(100, this.beamHookDistance);
            steer(this.target.x + Math.cos(angle) * desiredRadius,
                this.target.y + Math.sin(angle) * desiredRadius, 0.65);
            if (this.stateTimer === 0) {
                this.beamHookTarget = null;
                this.state = SPRAAK_STATE.BRAKE;
                this.stateTimer = 0.45;
            }
        } else if (this.state === SPRAAK_STATE.BRAKE) {
            this.stateTimer = Math.max(0, this.stateTimer - dt);
            const brake = getEmergencyBrakeForce(this, this.getEffectiveThrust(), dt);
            if (brake.stopped || this.stateTimer === 0) {
                this.vx = 0;
                this.vy = 0;
                this.state = SPRAAK_STATE.CHARGE;
                this.stateTimer = SPRAAK_CHARGE_DURATION;
            } else {
                fx = brake.x;
                fy = brake.y;
            }
        } else if (this.state === SPRAAK_STATE.CHARGE && this.target) {
            this.vx = 0;
            this.vy = 0;
            this.stateTimer = Math.max(0, this.stateTimer - dt);
            if (this.stateTimer === 0) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const distance = Math.hypot(dx, dy) || 1;
                this.dashDirection = { x: dx / distance, y: dy / distance };
                this.rotation = Math.atan2(this.dashDirection.y, this.dashDirection.x) + Math.PI / 2;
                this.state = SPRAAK_STATE.DASH;
                this.stateTimer = SPRAAK_DASH_DURATION;
            }
        } else if (this.state === SPRAAK_STATE.DASH) {
            this.stateTimer = Math.max(0, this.stateTimer - dt);
            fx = this.dashDirection.x * this.getEffectiveThrust() * SPRAAK_DASH_FORCE_MULTIPLIER;
            fy = this.dashDirection.y * this.getEffectiveThrust() * SPRAAK_DASH_FORCE_MULTIPLIER;
            this.rotation = Math.atan2(this.dashDirection.y, this.dashDirection.x) + Math.PI / 2;
            if (this.stateTimer === 0) this.state = this.target ? SPRAAK_STATE.PURSUE : SPRAAK_STATE.RETURN;
        } else {
            const anchor = asteroids.filter(asteroid => !asteroid.isDestroyed && asteroid.roomId === this.roomId)
                .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
            if (anchor) this.clusterAnchor = anchor;
            if (this.clusterAnchor && !this.clusterAnchor.isDestroyed) {
                const angle = Math.atan2(this.y - this.clusterAnchor.y, this.x - this.clusterAnchor.x) + 0.45;
                steer(this.clusterAnchor.x + Math.cos(angle) * (this.clusterAnchor.radius + 130),
                    this.clusterAnchor.y + Math.sin(angle) * (this.clusterAnchor.radius + 130), 0.45);
            }
            this.target = this.selectTarget(others, SPRAAK_ACQUISITION_RANGE);
            this.state = this.target ? SPRAAK_STATE.PURSUE : SPRAAK_STATE.ROAM;
        }
        this.isThrusting = fx !== 0 || fy !== 0;
        updateNewtonian(this, dt, { x: fx, y: fy }, worldRules);
        const cap = this.state === SPRAAK_STATE.DASH
            ? this.getNormalShipSpeedCap() * SPRAAK_DASH_SPEED_MULTIPLIER
            : this.getNormalShipSpeedCap();
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > cap) {
            this.vx = this.vx / speed * cap;
            this.vy = this.vy / speed * cap;
        }
    }

    draw(ctx, assets, camera) {
        if (this.isDead || this.isEliminated) return;
        ctx.save();
        camera.apply(ctx, this.x, this.y);
        this.drawShipHealthBar(ctx, { showShields: false });
        const chargeOffset = this.getChargeRenderOffset();
        ctx.translate(chargeOffset.x, chargeOffset.y);
        ctx.rotate(this.rotation);
        const size = this.radius * 3.6;
        if (assets.spraak) ctx.drawImage(assets.spraak, -size / 2, -size / 2, size, size);
        ctx.restore();
    }
}
