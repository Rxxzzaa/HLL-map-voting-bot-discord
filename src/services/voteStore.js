/**
 * Vote Store
 * Simple JSON-based storage to track active votes per match
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getDataFilePath } = require('../utils/dataPath');

const STORE_PATH = getDataFilePath('votes.json');

class VoteStore {
    constructor() {
        this.votes = this.load();
    }

    load() {
        try {
            const dataDir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            if (fs.existsSync(STORE_PATH)) {
                const data = fs.readFileSync(STORE_PATH, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error('[VoteStore] Error loading votes:', error.message);
        }
        return {};
    }

    save() {
        try {
            const dataDir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(STORE_PATH, JSON.stringify(this.votes, null, 2));
            return true;
        } catch (error) {
            logger.error('[VoteStore] Error saving votes:', error.message);
            return false;
        }
    }

    /**
     * Get vote by game start timestamp
     * @param {number} gameStart - Unix timestamp of match start
     * @param {number} serverNum - Server number
     * @returns {object|null} Vote data or null
     */
    getVote(gameStart, serverNum) {
        const key = `${serverNum}_${gameStart}`;
        return this.votes[key] || null;
    }

    /**
     * Store a vote
     * @param {string} messageId - Discord message ID
     * @param {number} gameStart - Unix timestamp of match start
     * @param {number} serverNum - Server number
     * @param {Array} maps - Maps in the vote
     */
    setVote(messageId, gameStart, serverNum, maps = []) {
        const key = `${serverNum}_${gameStart}`;
        this.votes[key] = {
            messageId,
            gameStart,
            serverNum,
            maps,
            createdAt: Date.now()
        };
        this.save();
        logger.info(`[VoteStore] Stored vote for server ${serverNum}, gameStart ${gameStart}`);
    }

    /**
     * Delete a vote
     * @param {number} gameStart - Unix timestamp of match start
     * @param {number} serverNum - Server number
     */
    deleteVote(gameStart, serverNum) {
        const key = `${serverNum}_${gameStart}`;
        if (this.votes[key]) {
            delete this.votes[key];
            this.save();
            logger.info(`[VoteStore] Deleted vote for server ${serverNum}, gameStart ${gameStart}`);
        }
    }

    /**
     * Clean up old votes (older than 24 hours)
     */
    cleanup() {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        let cleaned = 0;

        for (const key of Object.keys(this.votes)) {
            if (this.votes[key].createdAt < cutoff) {
                delete this.votes[key];
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.save();
            logger.info(`[VoteStore] Cleaned up ${cleaned} old votes`);
        }
    }

    /**
     * Get service state (e.g. voteMapActive)
     * @param {string} key
     * @returns {*} Value or null
     */
    getState(key) {
        return this.votes[`_state_${key}`] ?? null;
    }

    /**
     * Set service state
     * @param {string} key
     * @param {*} value
     */
    setState(key, value) {
        this.votes[`_state_${key}`] = value;
        this.save();
    }
}

module.exports = new VoteStore();
