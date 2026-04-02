const test = require('node:test');
const assert = require('node:assert/strict');
const { MapVotingService } = require('../src/services/mapVoting');

test('non-seeded rotation still applies on match end when voting is disabled', async () => {
    const service = new MapVotingService(1);
    let nonSeededRotationCalls = 0;
    let seedingMessageCalls = 0;

    service.voteMapActive = false;
    service.minimumPlayers = 50;
    service.deactivatePlayers = 40;
    service.gameActive = true;
    service.applyScheduleSettings = async () => {};
    service.getGameState = async () => {
        service.gameActive = false;
        return false;
    };
    service.crcon = {
        getStatus: async () => ({ result: { current_players: 10 } })
    };
    service.applyNonSeededRotation = async () => {
        nonSeededRotationCalls += 1;
        return true;
    };
    service.clearAllMessages = async () => {};
    service.sendSeedingMsg = async () => {
        seedingMessageCalls += 1;
    };

    await service.doMapVote();

    assert.equal(nonSeededRotationCalls, 1);
    assert.equal(seedingMessageCalls, 0);
});

test('active vote is finalized when seeded state is lost mid-match', async () => {
    const service = new MapVotingService(1);
    let stopVoteCalls = 0;
    let seedingMessageCalls = 0;

    service.voteMapActive = true;
    service.seeded = true;
    service.voteActive = true;
    service.gameActive = true;
    service.minimumPlayers = 50;
    service.deactivatePlayers = 40;
    service.applyScheduleSettings = async () => {};
    service.getGameState = async () => true;
    service.crcon = {
        getStatus: async () => ({ result: { current_players: 10 } })
    };
    service.stopVote = async () => {
        stopVoteCalls += 1;
        service.voteActive = false;
    };
    service.clearAllMessages = async () => {};
    service.sendSeedingMsg = async () => {
        seedingMessageCalls += 1;
    };
    service.applyNonSeededRotation = async () => false;

    await service.doMapVote();

    assert.equal(stopVoteCalls, 1);
    assert.equal(seedingMessageCalls, 1);
    assert.equal(service.voteActive, false);
    assert.equal(service.seeded, false);
});
