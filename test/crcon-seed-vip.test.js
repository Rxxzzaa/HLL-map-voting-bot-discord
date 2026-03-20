const test = require('node:test');
const assert = require('node:assert/strict');
const { CRCONService } = require('../src/services/crcon');

test('extractSeederVipRewardEnabled supports direct and nested config shapes', () => {
    const svc = new CRCONService('https://example.com', 'token', 'Test');

    assert.equal(svc.extractSeederVipRewardEnabled({ result: { enabled: true } }), true);
    assert.equal(svc.extractSeederVipRewardEnabled({ result: { enabled: 0 } }), false);
    assert.equal(svc.extractSeederVipRewardEnabled({ result: { config: { enabled: 'on' } } }), true);
    assert.equal(svc.extractSeederVipRewardEnabled({ result: { config: { enabled: 'off' } } }), false);
    assert.equal(svc.extractSeederVipRewardEnabled({ result: {} }), null);
});

test('setSeederVipRewardEnabled throws when CRCON reports failed=true', async () => {
    const svc = new CRCONService('https://example.com', 'token', 'Test');
    svc.getSeederVipRewardConfig = async () => ({ result: { enabled: true } });
    svc.post = async () => ({ failed: true, error: 'bad request' });

    await assert.rejects(
        () => svc.setSeederVipRewardEnabled(false),
        /bad request/
    );
});

test('toggleSeederVipRewardEnabled returns persisted state after write', async () => {
    const svc = new CRCONService('https://example.com', 'token', 'Test');
    let state = true;

    svc.getSeederVipRewardConfig = async () => ({ result: { enabled: state } });
    svc.post = async (_endpoint, body) => {
        state = Boolean(body?.config?.enabled);
        return { failed: false };
    };

    const newState = await svc.toggleSeederVipRewardEnabled();
    assert.equal(newState, false);
});

test('setSeederVipRewardEnabled couples dry_run opposite to enabled', async () => {
    const svc = new CRCONService('https://example.com', 'token', 'Test');
    const posted = [];
    let currentEnabled = true;

    svc.getSeederVipRewardConfig = async () => ({ result: { enabled: currentEnabled, dry_run: !currentEnabled } });
    svc.post = async (_endpoint, body) => {
        posted.push(body);
        currentEnabled = Boolean(body?.config?.enabled);
        return { failed: false };
    };

    await svc.setSeederVipRewardEnabled(false);
    await svc.setSeederVipRewardEnabled(true);

    assert.equal(posted[0].config.enabled, false);
    assert.equal(posted[0].config.dry_run, true);
    assert.equal(posted[1].config.enabled, true);
    assert.equal(posted[1].config.dry_run, false);
});
