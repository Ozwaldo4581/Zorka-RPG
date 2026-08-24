export const EXPERIMENTAL_PROFILE_STORAGE_KEY = 'zorka.experimentalProfiles.v2';
export const LEGACY_PROFILE_STORAGE_KEY = 'zorka.experimentalProfiles.v1';
export const EXPERIMENTAL_PROFILE_SCHEMA_VERSION = 2;
export const EXPERIMENTAL_PROFILE_SLOT_COUNT = 4;
export const EXPERIMENTAL_PROFILE_NAME_MAX_LENGTH = 20;

const emptySlots = () => Array(EXPERIMENTAL_PROFILE_SLOT_COUNT).fill(null);
const integer = (value, fallback = 0) => Number.isFinite(Number(value))
    ? Math.max(0, Math.floor(Number(value))) : fallback;

export function normalizeExperimentalProfile(profile, slot) {
    if (!profile || typeof profile !== 'object') return null;
    const name = String(profile.name ?? '').trim().slice(0, EXPERIMENTAL_PROFILE_NAME_MAX_LENGTH);
    if (!name) return null;
    const level = integer(profile.level, 0);
    return {
        ...profile,
        version: EXPERIMENTAL_PROFILE_SCHEMA_VERSION,
        slot,
        name,
        level,
        totalXP: integer(profile.totalXP),
        scrap: integer(profile.scrap),
        deaths: integer(profile.deaths),
        encounterLevel: Math.max(1, integer(profile.encounterLevel, 1)),
        weaponPurchaseTiers: { ...(profile.weaponPurchaseTiers || {}) },
        purchasedUtilities: { ...(profile.purchasedUtilities || {}) },
        shipUpgrades: { ...(profile.shipUpgrades || {}) },
        equippedPrimaryGun: String(profile.equippedPrimaryGun || 'Ballistic'),
        projectileUpgradeCount: integer(profile.projectileUpgradeCount),
        speedUpgradeCount: integer(profile.speedUpgradeCount),
        shieldRechargeUpgradeCount: integer(profile.shieldRechargeUpgradeCount),
        newGamePlusCycle: integer(profile.newGamePlusCycle),
        unlockedShortcutIds: Array.isArray(profile.unlockedShortcutIds) ? [...profile.unlockedShortcutIds] : [],
        updatedAt: profile.updatedAt || new Date().toISOString()
    };
}

export class ExperimentalProfileStore {
    constructor(storage = undefined, logger = console) {
        this.logger = logger;
        this.memorySlots = emptySlots();
        try { this.storage = storage === undefined ? globalThis.localStorage : storage; }
        catch { this.storage = null; }
    }
    loadSlots() {
        if (!this.storage) return this.memorySlots.map(value => value && { ...value });
        try {
            const raw = this.storage.getItem(EXPERIMENTAL_PROFILE_STORAGE_KEY)
                ?? this.storage.getItem(LEGACY_PROFILE_STORAGE_KEY);
            if (!raw) return emptySlots();
            const parsed = JSON.parse(raw);
            const source = Array.isArray(parsed) ? parsed : parsed.slots;
            const slots = emptySlots();
            (source || []).slice(0, EXPERIMENTAL_PROFILE_SLOT_COUNT).forEach((profile, slot) => {
                slots[slot] = normalizeExperimentalProfile(profile, slot);
            });
            this.memorySlots = slots;
            return slots.map(value => value && { ...value });
        } catch (error) {
            this.logger?.warn?.(`[Zorka] Profile data could not be read: ${error.message}`);
            return this.memorySlots.map(value => value && { ...value });
        }
    }
    persist(slots) {
        this.memorySlots = emptySlots().map((_, slot) => normalizeExperimentalProfile(slots[slot], slot));
        this.storage?.setItem(EXPERIMENTAL_PROFILE_STORAGE_KEY, JSON.stringify({
            version: EXPERIMENTAL_PROFILE_SCHEMA_VERSION, slots: this.memorySlots
        }));
    }
    assertSlot(slot) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= EXPERIMENTAL_PROFILE_SLOT_COUNT) {
            throw new RangeError('Adventure save slot must be between 0 and 3.');
        }
    }
    createProfile(slot, name) {
        this.assertSlot(slot);
        const slots = this.loadSlots();
        if (slots[slot]) throw new Error('That save slot is already occupied.');
        const profile = normalizeExperimentalProfile({ name, level: 0, totalXP: 0 }, slot);
        if (!profile) throw new Error('Enter a save name.');
        slots[slot] = profile; this.persist(slots); return { ...profile };
    }
    updateProfile(slot, snapshot) {
        this.assertSlot(slot);
        const slots = this.loadSlots();
        if (!slots[slot]) throw new Error('The selected save no longer exists.');
        slots[slot] = normalizeExperimentalProfile({ ...slots[slot], ...snapshot, name: slots[slot].name,
            updatedAt: new Date().toISOString() }, slot);
        this.persist(slots); return { ...slots[slot] };
    }
    deleteProfile(slot) { this.assertSlot(slot); const slots = this.loadSlots(); slots[slot] = null; this.persist(slots); }
    getProfile(slot) { this.assertSlot(slot); return this.loadSlots()[slot]; }
    getSummaries() { return this.loadSlots().map(profile => profile && ({ slot: profile.slot, name: profile.name, level: profile.level })); }
}
