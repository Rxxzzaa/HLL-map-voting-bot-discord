const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isMapVoteToggleButton,
    getScheduleWhitelistServerNum,
    getNonSeededWhitelistServerNum
} = require('../src/utils/buttonRouting');

test('map vote toggle excludes removed seeder vip ids', () => {
    assert.equal(isMapVoteToggleButton('mapvote_toggle'), true);
    assert.equal(isMapVoteToggleButton('mapvote_toggle_2'), true);
    assert.equal(isMapVoteToggleButton('mapvote_toggle_seed_vip'), false);
    assert.equal(isMapVoteToggleButton('mapvote_toggle_seeding_s4'), false);
});

test('schedule whitelist server extraction works for all button formats', () => {
    assert.equal(getScheduleWhitelistServerNum('sched_wl_useall_2_s123'), 2);
    assert.equal(getScheduleWhitelistServerNum('sched_wl_custom_3_s123'), 3);
    assert.equal(getScheduleWhitelistServerNum('sched_wl_filter_4_s123_all_0'), 4);
    assert.equal(getScheduleWhitelistServerNum('sched_wl_prev_1_s123_0_all'), 1);
    assert.equal(getScheduleWhitelistServerNum('sched_wl_add_all_2_s123_all'), 2);
    assert.equal(getScheduleWhitelistServerNum('sched_wl_remove_all_4_s123_night'), 4);
    assert.equal(getScheduleWhitelistServerNum('mapvote_toggle'), null);
});

test('non-seeded whitelist server extraction works for all button formats', () => {
    assert.equal(getNonSeededWhitelistServerNum('nonseed_wl_fill_2'), 2);
    assert.equal(getNonSeededWhitelistServerNum('nonseed_wl_clear_3'), 3);
    assert.equal(getNonSeededWhitelistServerNum('nonseed_wl_filter_4_all_0'), 4);
    assert.equal(getNonSeededWhitelistServerNum('nonseed_wl_prev_1_0_all'), 1);
    assert.equal(getNonSeededWhitelistServerNum('nonseed_wl_next_5_1_night'), 5);
    assert.equal(getNonSeededWhitelistServerNum('nonseed_wl_toggle_6'), 6);
    assert.equal(getNonSeededWhitelistServerNum('sched_wl_useall_2_s123'), null);
});
