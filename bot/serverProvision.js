const fetch = globalThis.fetch || require('node-fetch');
const db = require('./lib/db');

const PANEL_URL = process.env.PANEL_URL || '';
const PANEL_TOKEN = process.env.PANEL_TOKEN || '';
const SKIP_PAYMENT_FOR_ADMINS = process.env.SKIP_PAYMENT_FOR_ADMINS === 'true';

if (!PANEL_URL) {
  console.warn('PANEL_URL not set - provisioning will fail until configured');
}

async function createServerOnPanel({ telegramUserId, protocol, plan = 'default', meta = {} }) {
  if (!PANEL_URL) {
    return { ok: false, error: 'Panel URL not configured' };
  }
  const payload = { userId: String(telegramUserId), protocol, plan, meta };
  try {
    const res = await fetch(PANEL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PANEL_TOKEN ? { Authorization: `Bearer ${PANEL_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: data && data.message ? data.message : `HTTP ${res.status}` };
    }
    // Expect the panel to return an object like { id, status: 'created'|'pending', details }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function createServer({ telegramUserId, protocol, remark, plan }) {
  // If admin and skip payment enabled, do not check further
  if (SKIP_PAYMENT_FOR_ADMINS && db.isAdmin(telegramUserId)) {
    // Mark pending locally and call panel
  }

  // Create a local pending record first so user sees progress
  const rec = {
    id: `p-${Date.now().toString(36)}`,
    telegramUserId: String(telegramUserId),
    protocol,
    remark: remark || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  db.addServer(rec);

  const res = await createServerOnPanel({ telegramUserId, protocol, plan, meta: { remark } });
  if (!res.ok) {
    db.setServerStatus(rec.id, 'failed', { error: res.error });
    return { ok: false, error: res.error };
  }

  // On success the panel may return final id and details
  const panelData = res.data || {};
  const serverId = panelData.id || `s-${Date.now().toString(36)}`;

  // compute final record depending on protocol
  const final = Object.assign({}, rec, {
    id: serverId,
    status: panelData.status || 'active',
    connectHost: panelData.connectHost || panelData.host || panelData.ip || rec.connectHost || '',
    port: panelData.port || (protocol === 'ssh' ? 22 : 443),
    uuid: panelData.uuid || panelData.clientId || rec.uuid,
    sniHost: panelData.sni || panelData.host || '',
    expiresAt: panelData.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    details: panelData,
  });

  db.setServerStatus(rec.id, 'migrated', { migratedTo: serverId });
  db.addServer(final);
  db.removeServer(rec.id);
  return { ok: true, data: final };
}

module.exports = {
  createServer,
  createServerOnPanel,
};
