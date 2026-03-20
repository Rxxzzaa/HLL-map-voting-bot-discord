const logger = require('../utils/logger');

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
    if (!isObject(source)) return target;

    const output = isObject(target) ? target : {};

    for (const [key, value] of Object.entries(source)) {
        if (isObject(value)) {
            output[key] = deepMerge(isObject(output[key]) ? output[key] : {}, value);
        } else {
            output[key] = value;
        }
    }

    return output;
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

class SeedingDraftStore {
    constructor() {
        this.sessions = new Map();
    }

    key(guildId, userId, serverNum) {
        return `${guildId || 'noguild'}:${userId}:${serverNum}`;
    }

    async refreshSession(crconService, guildId, userId, serverNum) {
        const [seedingRaw, seedVipRaw] = await Promise.all([
            crconService.getSeedingRulesConfig(),
            crconService.getSeedVipConfig()
        ]);

        const seedingLive = deepClone(seedingRaw?.result || {});
        const seedVipLive = deepClone(seedVipRaw?.result || {});

        const session = {
            guildId,
            userId,
            serverNum,
            seedingLive,
            seedingDraft: deepClone(seedingLive),
            seedVipLive,
            seedVipDraft: deepClone(seedVipLive),
            updatedAt: Date.now()
        };

        this.sessions.set(this.key(guildId, userId, serverNum), session);
        return session;
    }

    async getOrCreate(crconService, guildId, userId, serverNum) {
        const key = this.key(guildId, userId, serverNum);
        const existing = this.sessions.get(key);
        if (existing) return existing;
        return this.refreshSession(crconService, guildId, userId, serverNum);
    }

    get(guildId, userId, serverNum) {
        return this.sessions.get(this.key(guildId, userId, serverNum)) || null;
    }

    applySeedingPatch(guildId, userId, serverNum, patch) {
        const session = this.get(guildId, userId, serverNum);
        if (!session) throw new Error('No draft session found. Open /seed panel first.');
        session.seedingDraft = deepMerge(deepClone(session.seedingDraft), patch);
        session.updatedAt = Date.now();
        return session;
    }

    applySeedVipPatch(guildId, userId, serverNum, patch) {
        const session = this.get(guildId, userId, serverNum);
        if (!session) throw new Error('No draft session found. Open /seed panel first.');
        session.seedVipDraft = deepMerge(deepClone(session.seedVipDraft), patch);
        session.updatedAt = Date.now();
        return session;
    }

    hasSeedingChanges(session) {
        return stableStringify(session.seedingDraft) !== stableStringify(session.seedingLive);
    }

    hasSeedVipChanges(session) {
        return stableStringify(session.seedVipDraft) !== stableStringify(session.seedVipLive);
    }

    listChangedTopLevelKeys(live, draft) {
        const keys = new Set([...Object.keys(live || {}), ...Object.keys(draft || {})]);
        const changed = [];
        for (const key of keys) {
            if (stableStringify(live?.[key]) !== stableStringify(draft?.[key])) {
                changed.push(key);
            }
        }
        return changed.sort();
    }

    getSummary(session) {
        const seedingChanged = this.listChangedTopLevelKeys(session.seedingLive, session.seedingDraft);
        const seedVipChanged = this.listChangedTopLevelKeys(session.seedVipLive, session.seedVipDraft);

        return {
            seedingChanged,
            seedVipChanged,
            hasSeedingChanges: seedingChanged.length > 0,
            hasSeedVipChanges: seedVipChanged.length > 0
        };
    }

    async validate(crconService, session) {
        const summary = this.getSummary(session);
        const results = {
            seeding: null,
            seedVip: null
        };

        if (summary.hasSeedingChanges) {
            results.seeding = await crconService.validateSeedingRulesConfig(session.seedingDraft);
        }

        if (summary.hasSeedVipChanges) {
            results.seedVip = await crconService.validateSeedVipConfig(session.seedVipDraft);
        }

        return results;
    }

    async apply(crconService, session) {
        const summary = this.getSummary(session);

        if (!summary.hasSeedingChanges && !summary.hasSeedVipChanges) {
            return { changed: false, summary };
        }

        await this.validate(crconService, session);

        if (summary.hasSeedingChanges) {
            await crconService.setSeedingRulesConfig(session.seedingDraft);
        }

        if (summary.hasSeedVipChanges) {
            await crconService.setSeedVipConfig(session.seedVipDraft);
        }

        logger.info(`[SeedingDraftStore] Applied draft for server=${session.serverNum} user=${session.userId}`);
        return { changed: true, summary };
    }

    discard(guildId, userId, serverNum) {
        const session = this.get(guildId, userId, serverNum);
        if (!session) throw new Error('No draft session found. Open /seed panel first.');

        session.seedingDraft = deepClone(session.seedingLive);
        session.seedVipDraft = deepClone(session.seedVipLive);
        session.updatedAt = Date.now();
        return session;
    }
}

module.exports = {
    SeedingDraftStore
};
