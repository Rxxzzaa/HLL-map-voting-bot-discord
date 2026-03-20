const assert = require('node:assert/strict');

const { commands } = require('../src/commands/register');
const { SeedingDraftStore } = require('../src/services/seedingDraftStore');
const { SeedingPanelService } = require('../src/services/seedingPanel');

function makeMockCrcon() {
  let seeding = {
    enabled: true,
    dry_run: false,
    number_of_warnings: 1,
    number_of_punishments: 2,
    warning_interval_seconds: 20,
    punish_interval_seconds: 59,
    kick_grace_period_seconds: 60,
    announcement_message: 'announce',
    warning_message: 'warn',
    punish_message: 'punish',
    kick_message: 'kick',
    dont_do_anything_below_this_number_of_players: 0,
    disallowed_roles: { max_players: 49, roles: { sniper: 'reco' } },
    disallowed_weapons: { max_players: 49, weapons: { 'BOMBING RUN': 'bombing' } },
    enforce_cap_fight: { max_players: 49, max_caps: 3 }
  };

  let seedVip = {
    enabled: true,
    dry_run: false,
    poll_time_seeding: 30,
    poll_time_seeded: 300,
    player_announce_thresholds: [10, 20, 35, 45, 50, 60],
    requirements: {
      max_allies: 25,
      max_axis: 25,
      online_when_seeded: true,
      buffer: { minutes: 20 },
      minimum_play_time: { minutes: 25 }
    },
    player_messages: {
      seeding_in_progress_message: 'in progress',
      seeding_complete_message: 'live',
      player_count_message: '{a}-{b}',
      reward_player_message: 'reward',
      reward_player_message_no_vip: 'no vip'
    },
    reward: { timeframe: { days: 3, hours: 2 } },
    hooks: [{ url: 'https://discord.com/api/webhooks/1/abc' }]
  };

  return {
    getStatus: async () => ({ result: { current_players: 42, max_players: 100, map: { pretty_name: 'Foy Warfare' } } }),
    getSeedingRulesConfig: async () => ({ result: seeding }),
    getSeedVipConfig: async () => ({ result: seedVip }),
    validateSeedingRulesConfig: async (cfg) => {
      assert.equal(typeof cfg.enabled, 'boolean');
      return { result: true };
    },
    validateSeedVipConfig: async (cfg) => {
      assert.equal(Array.isArray(cfg.player_announce_thresholds), true);
      return { result: true };
    },
    setSeedingRulesConfig: async (cfg) => {
      seeding = JSON.parse(JSON.stringify(cfg));
      return { result: true };
    },
    setSeedVipConfig: async (cfg) => {
      seedVip = JSON.parse(JSON.stringify(cfg));
      return { result: true };
    }
  };
}

async function run() {
  console.log('E2E Smoke: start');

  const seedCommand = commands.find(c => c.name === 'seed');
  assert.ok(seedCommand, 'seed slash command registered');
  console.log('PASS: /seed command is registered');

  const crcon = makeMockCrcon();
  const store = new SeedingDraftStore();
  const panelService = new SeedingPanelService();

  const session = await store.getOrCreate(crcon, 'guild1', 'user1', 1);
  const summary0 = store.getSummary(session);
  assert.equal(summary0.hasSeedingChanges, false);
  assert.equal(summary0.hasSeedVipChanges, false);
  console.log('PASS: draft session bootstraps from live config');

  store.applySeedingPatch('guild1', 'user1', 1, { number_of_warnings: 2, warning_message: 'new warn' });
  store.applySeedVipPatch('guild1', 'user1', 1, { poll_time_seeding: 45, player_messages: { seeding_complete_message: 'new live' } });

  const sessionPatched = store.get('guild1', 'user1', 1);
  const summary1 = store.getSummary(sessionPatched);
  assert.equal(summary1.hasSeedingChanges, true);
  assert.equal(summary1.hasSeedVipChanges, true);
  console.log('PASS: draft patching marks changes for both config types');

  await store.validate(crcon, sessionPatched);
  console.log('PASS: validate flow succeeds for patched draft');

  const applyResult = await store.apply(crcon, sessionPatched);
  assert.equal(applyResult.changed, true);
  console.log('PASS: apply flow writes both configs');

  const refreshed = await store.refreshSession(crcon, 'guild1', 'user1', 1);
  assert.equal(refreshed.seedingLive.number_of_warnings, 2);
  assert.equal(refreshed.seedVipLive.poll_time_seeding, 45);
  console.log('PASS: refresh pulls applied state as live');

  const panel = await panelService.buildMainPanel(crcon, 'Server 1', 1, refreshed, store.getSummary(refreshed));
  assert.ok(panel && panel.embeds && panel.components, 'panel built');
  assert.equal(panel.components.length, 5);
  console.log('PASS: seeding panel renders with phase-3 controls');

  console.log('E2E Smoke: success');
}

run().catch((err) => {
  console.error('E2E Smoke: FAILED');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
