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

    async get(endpoint) {
        if (!this.client) {
            throw new Error('CRCON not configured');
        }

        try {
            logger.debug(`CRCON GET: ${endpoint}`);
            const response = await this.client.get(`/api/${endpoint}`);
            return response.data;
        } catch (error) {
            logger.error(`CRCON GET error on ${endpoint}: ${error.message}`);
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
            logger.error(`CRCON POST error on ${endpoint}: ${error.message}`);
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
