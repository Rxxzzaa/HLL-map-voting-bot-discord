/**
 * CRCON Service
 * Handles communication with Hell Let Loose CRCON API
 */

const axios = require('axios');
const logger = require('../utils/logger');

class CRCONService {
    constructor(baseUrl, apiToken, serverName = 'Server') {
        this.baseUrl = baseUrl?.replace(/\/$/, ''); // Remove trailing slash
        this.apiToken = apiToken;
        this.serverName = serverName;
        this.client = null;

        if (this.baseUrl && this.apiToken) {
            this.client = axios.create({
                baseURL: this.baseUrl,
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
        }
    }

    isConfigured() {
        return !!(this.baseUrl && this.apiToken);
    }

    formatRequestError(error) {
        if (!error) return 'Unknown error';

        const parts = [];
        const responseData = error.response?.data;

        if (error.response) {
            parts.push(`status=${error.response.status}`);
            if (error.response.statusText) {
                parts.push(`statusText=${error.response.statusText}`);
            }
            if (responseData?.detail) {
                parts.push(`detail=${responseData.detail}`);
            } else if (responseData?.message) {
                parts.push(`apiMessage=${responseData.message}`);
            } else if (typeof responseData === 'string' && responseData.trim()) {
                parts.push(`apiBody=${responseData.trim().slice(0, 300)}`);
            }
        } else if (error.request) {
            parts.push('no_response=true');
        }

        if (error.code) {
            parts.push(`code=${error.code}`);
        }

        if (error.config?.method) {
            parts.push(`method=${String(error.config.method).toUpperCase()}`);
        }

        if (error.config?.url) {
            parts.push(`url=${error.config.url}`);
        }

        if (error.message) {
            parts.push(`message=${error.message}`);
        }

        return parts.join(' | ') || 'Unknown request error';
    }

    async get(endpoint) {
        if (!this.client) {
            throw new Error('CRCON not configured');
        }

        try {
            logger.debug(`CRCON GET: ${endpoint}`);
            const response = await this.client.get(`/api/${endpoint}`);
            return response.data;
        } catch (error) {
            logger.error(`[CRCON ${this.serverName}] GET ${endpoint} failed: ${this.formatRequestError(error)}`);
            throw error;
        }
    }

    async post(endpoint, data = {}) {
        if (!this.client) {
            throw new Error('CRCON not configured');
        }

        try {
            logger.debug(`CRCON POST: ${endpoint}`);
            const response = await this.client.post(`/api/${endpoint}`, data);
            return response.data;
        } catch (error) {
            logger.error(`[CRCON ${this.serverName}] POST ${endpoint} failed: ${this.formatRequestError(error)}`);
            throw error;
        }
    }

    // Map Voting Methods
    async getMaps() {
        return this.get('get_maps');
    }

    async getMapRotation() {
        return this.get('get_map_rotation');
    }

    async getCurrentMap() {
        return this.get('get_map');
    }

    async getGameState() {
        return this.get('get_gamestate');
    }

    async getStatus() {
        return this.get('get_status');
    }

    async getDetailedPlayers() {
        return this.get('get_detailed_players');
    }

    async setNextMap(mapId) {
        return this.post('set_map', { map_name: mapId });
    }

    async addMapToRotation(mapId) {
        return this.post('add_map_to_rotation', { map_name: mapId });
    }

    async removeMapFromRotation(mapId) {
        return this.post('remove_map_from_rotation', { map_name: mapId });
    }

    // Votemap specific methods
    async getVotemapConfig() {
        return this.get('get_votemap_config');
    }

    async getVotemapWhitelist() {
        return this.get('get_votemap_whitelist');
    }

    async setVotemapWhitelist(maps) {
        return this.post('set_votemap_whitelist', { map_names: maps });
    }

    async addToVotemapWhitelist(mapId) {
        return this.post('add_map_to_votemap_whitelist', { map_name: mapId });
    }

    async removeFromVotemapWhitelist(mapId) {
        return this.post('remove_map_from_votemap_whitelist', { map_name: mapId });
    }

    async resetVotemapWhitelist() {
        return this.post('reset_map_votemap_whitelist', {});
    }

    async resetVotemapState() {
        return this.post('reset_votemap_state');
    }

    async getVotemapStatus() {
        return this.get('get_votemap_status');
    }

    async setVotemapEnabled(enabled) {
        return this.post('set_votemap_config', { enabled });
    }

    normalizeBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            if (value === 1) return true;
            if (value === 0) return false;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', '1', 'on', 'enabled', 'yes'].includes(normalized)) return true;
            if (['false', '0', 'off', 'disabled', 'no'].includes(normalized)) return false;
        }
        return null;
    }

    /**
     * AutoMod seeding methods
     * Canonical endpoint names from CRCON API documentation:
     * - get_auto_mod_seeding_config
     * - set_auto_mod_seeding_config
     */
    async getSeedingRulesConfig() {
        return this.get('get_auto_mod_seeding_config');
    }

    async validateSeedingRulesConfig(config, by = 'discord_panel') {
        return this.post('validate_auto_mod_seeding_config', {
            by,
            config
        });
    }

    async setSeedingRulesConfig(config, by = 'discord_panel') {
        return this.post('set_auto_mod_seeding_config', {
            by,
            user_config: config
        });
    }

    extractSeedingRulesEnabled(response) {
        const result = response?.result ?? response;
        if (!result || typeof result !== 'object') return null;
        return this.normalizeBoolean(result.enabled);
    }

    async setSeedingRulesEnabled(enabled) {
        const current = await this.getSeedingRulesConfig();
        const currentConfig = current?.result && typeof current.result === 'object'
            ? current.result
            : {};
        const parsedEnabled = this.normalizeBoolean(enabled);
        if (parsedEnabled === null) {
            throw new Error(`Invalid seeding rules enabled value: ${enabled}`);
        }
        const user_config = { ...currentConfig, enabled: parsedEnabled };

        return this.setSeedingRulesConfig(user_config, 'frontline_democracy');
    }

    async toggleSeedingRulesEnabled() {
        const current = await this.getSeedingRulesConfig();
        const currentEnabled = this.extractSeedingRulesEnabled(current);
        if (currentEnabled === null) {
            throw new Error('Could not determine current seeding rules state from CRCON');
        }

        const newEnabled = !currentEnabled;
        await this.setSeedingRulesEnabled(newEnabled);
        return newEnabled;
    }

    /**
     * Seeder VIP reward methods
     * Canonical endpoint names from CRCON API documentation:
     * - get_seed_vip_config
     * - set_seed_vip_config
     */
    async getSeederVipRewardConfig() {
        return this.get('get_seed_vip_config');
    }

    extractSeederVipRewardEnabled(response) {
        const result = response?.result ?? response;
        if (!result || typeof result !== 'object') return null;
        return this.normalizeBoolean(result.enabled);
    }

    async setSeederVipRewardEnabled(enabled) {
        const current = await this.getSeederVipRewardConfig();
        const currentConfig = current?.result && typeof current.result === 'object'
            ? current.result
            : {};
        const parsedEnabled = this.normalizeBoolean(enabled);
        if (parsedEnabled === null) {
            throw new Error(`Invalid Seeder VIP Reward enabled value: ${enabled}`);
        }
        const config = { ...currentConfig, enabled: parsedEnabled };

        return this.post('set_seed_vip_config', {
            by: 'frontline_democracy',
            config
        });
    }

    async toggleSeederVipRewardEnabled() {
        const current = await this.getSeederVipRewardConfig();
        const currentEnabled = this.extractSeederVipRewardEnabled(current);
        if (currentEnabled === null) {
            throw new Error('Could not determine current Seeder VIP Reward state from CRCON');
        }

        const newEnabled = !currentEnabled;
        await this.setSeederVipRewardEnabled(newEnabled);
        return newEnabled;
    }

    // Seed VIP generic methods used by the new seeding panel flow
    async getSeedVipConfig() {
        return this.getSeederVipRewardConfig();
    }

    async validateSeedVipConfig(config, by = 'discord_panel') {
        return this.post('validate_seed_vip_config', {
            by,
            config
        });
    }

    async setSeedVipConfig(config, by = 'discord_panel') {
        return this.post('set_seed_vip_config', {
            by,
            config
        });
    }

    extractSeedVipEnabled(response) {
        return this.extractSeederVipRewardEnabled(response);
    }

    async setSeedVipEnabled(enabled) {
        const current = await this.getSeedVipConfig();
        const currentConfig = current?.result && typeof current.result === 'object'
            ? current.result
            : {};
        const parsedEnabled = this.normalizeBoolean(enabled);
        if (parsedEnabled === null) {
            throw new Error(`Invalid seed VIP enabled value: ${enabled}`);
        }
        const config = { ...currentConfig, enabled: parsedEnabled };

        return this.setSeedVipConfig(config);
    }

    async toggleSeedVipEnabled() {
        const current = await this.getSeedVipConfig();
        const currentEnabled = this.extractSeedVipEnabled(current);
        if (currentEnabled === null) {
            throw new Error('Could not determine current seed VIP state from CRCON');
        }

        const newEnabled = !currentEnabled;
        await this.setSeedVipEnabled(newEnabled);
        return newEnabled;
    }

    // Broadcast message
    async broadcast(message) {
        return this.post('set_broadcast', { message });
    }

    // Map history
    async getMapHistory() {
        return this.get('get_map_history');
    }
}

// Create service instances
const crconService = new CRCONService(
    process.env.CRCON_API_URL,
    process.env.CRCON_API_TOKEN,
    'Server 1'
);

const crconService2 = process.env.CRCON_API_URL_2 ? new CRCONService(
    process.env.CRCON_API_URL_2,
    process.env.CRCON_API_TOKEN_2,
    'Server 2'
) : null;

const crconService3 = process.env.CRCON_API_URL_3 ? new CRCONService(
    process.env.CRCON_API_URL_3,
    process.env.CRCON_API_TOKEN_3,
    'Server 3'
) : null;

const crconService4 = process.env.CRCON_API_URL_4 ? new CRCONService(
    process.env.CRCON_API_URL_4,
    process.env.CRCON_API_TOKEN_4,
    'Server 4'
) : null;

module.exports = {
    CRCONService,
    crconService,
    crconService2,
    crconService3,
    crconService4
};
