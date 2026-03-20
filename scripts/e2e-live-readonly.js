const path = require('path');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');

// Load both possible env locations; outer workspace first.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { CRCONService } = require('../src/services/crcon');
const { SeedingDraftStore } = require('../src/services/seedingDraftStore');
const { SeedingPanelService } = require('../src/services/seedingPanel');

function maskUrl(url) {
  if (!url) return '<missing>';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid-url>';
  }
}

async function testServer(serverNum) {
  const suffix = serverNum === 1 ? '' : `_${serverNum}`;
  const url = process.env[`CRCON_API_URL${suffix}`];
  const token = process.env[`CRCON_API_TOKEN${suffix}`];

  if (!url || !token) return { skipped: true, serverNum, reason: 'missing URL/token' };

  const crcon = new CRCONService(url, token, `Server ${serverNum}`);
  if (!crcon.isConfigured()) return { skipped: true, serverNum, reason: 'service not configured' };

  const status = await crcon.getStatus();
  assert.ok(status && status.result, 'status result missing');

  const seeding = await crcon.getSeedingRulesConfig();
  assert.ok(seeding && seeding.result && typeof seeding.result === 'object', 'seeding config missing');

  const seedVip = await crcon.getSeedVipConfig();
  assert.ok(seedVip && seedVip.result && typeof seedVip.result === 'object', 'seed vip config missing');

  // Validate-only checks using live config bodies
  await crcon.validateSeedingRulesConfig(seeding.result);
  await crcon.validateSeedVipConfig(seedVip.result);

  // Exercise panel + draft against live responses, but do not apply.
  const store = new SeedingDraftStore();
  const panelService = new SeedingPanelService();
  const session = await store.getOrCreate(crcon, 'live-guild', 'live-user', serverNum);
  const summary = store.getSummary(session);
  const panel = await panelService.buildMainPanel(crcon, `Server ${serverNum}`, serverNum, session, summary);
  assert.ok(panel?.embeds?.length === 1, 'panel embed missing');

  return {
    skipped: false,
    serverNum,
    host: maskUrl(url),
    players: status.result.current_players,
    seedingEnabled: !!seeding.result.enabled,
    seedVipEnabled: !!seedVip.result.enabled,
    draftInSync: !summary.hasSeedingChanges && !summary.hasSeedVipChanges
  };
}

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.log('WARN: DISCORD_TOKEN is missing from .env');
  } else {
    console.log('PASS: DISCORD_TOKEN present');
  }

  const results = [];
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await testServer(i);
      results.push(res);
    } catch (err) {
      results.push({
        skipped: false,
        serverNum: i,
        failed: true,
        error: err?.message || String(err)
      });
    }
  }

  const tested = results.filter(r => !r.skipped);
  const failed = results.filter(r => r.failed);

  for (const r of results) {
    if (r.skipped) {
      console.log(`SKIP: Server ${r.serverNum} (${r.reason})`);
      continue;
    }
    if (r.failed) {
      console.log(`FAIL: Server ${r.serverNum} (${r.error})`);
      continue;
    }
    console.log(`PASS: Server ${r.serverNum} ${r.host} players=${r.players} seeding=${r.seedingEnabled} seedVip=${r.seedVipEnabled} inSync=${r.draftInSync}`);
  }

  if (tested.length === 0) {
    throw new Error('No CRCON servers configured in .env (CRCON_API_URL/CRCON_API_TOKEN)');
  }

  if (failed.length > 0) {
    throw new Error(`${failed.length} server(s) failed live smoke`);
  }

  console.log('LIVE E2E (read/validate-only): success');
}

main().catch((e) => {
  console.error('LIVE E2E: FAILED');
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
