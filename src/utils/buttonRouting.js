function isMapVoteToggleButton(customId) {
    return (
        (customId === 'mapvote_toggle' || customId.startsWith('mapvote_toggle_')) &&
        !customId.startsWith('mapvote_toggle_seed_vip') &&
        !customId.startsWith('mapvote_toggle_seeding')
    );
}

function getScheduleWhitelistServerNum(customId) {
    if (!customId.startsWith('sched_wl_')) {
        return null;
    }

    const parts = customId.split('_');
    const serverPart = (parts[2] === 'add' || parts[2] === 'remove') ? parts[4] : parts[3];
    const serverNum = parseInt(serverPart, 10);
    return Number.isNaN(serverNum) ? null : serverNum;
}

function getNonSeededWhitelistServerNum(customId) {
    if (!customId.startsWith('nonseed_wl_')) {
        return null;
    }

    const parts = customId.split('_');
    const serverPart = parts[3];
    const serverNum = parseInt(serverPart, 10);
    return Number.isNaN(serverNum) ? null : serverNum;
}

module.exports = {
    isMapVoteToggleButton,
    getScheduleWhitelistServerNum,
    getNonSeededWhitelistServerNum
};
