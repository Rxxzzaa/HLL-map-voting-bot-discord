const test = require('node:test');
const assert = require('node:assert/strict');
const {
    isSeederVipToggleButton,
    isMapVoteToggleButton,
    getScheduleWhitelistServerNum
} = require('../src/utils/buttonRouting');

test('seeder vip toggle ids are recognized', () => {
    assert.equal(isSeederVipToggleButton('mapvote_toggle_seed_vip'), true);
    assert.equal(isSeederVipToggleButton('mapvote_toggle_seed_vip_2'), true);
    assert.equal(isSeederVipToggleButton('mapvote_toggle_seeding'), true);
    assert.equal(isSeederVipToggleButton('mapvote_toggle_seeding_s3'), true);
    assert.equal(isSeederVipToggleButton('mapvote_toggle'), false);
});

test('map vote toggle does not include seeder vip ids', () => {
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
