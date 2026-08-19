const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { serverError } = require('../lib/respond');
const acumatica = require('../integrations/acumatica');

router.get('/integrations/acumatica/status', authenticate, (req, res) => {
  res.json({ configured: acumatica.isConfigured() });
});

// Admin-only below: these touch a connected external financial system.

router.post('/integrations/acumatica/test', authenticate, requireAdmin, async (req, res) => {
  try {
    await acumatica.testConnection();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.get('/integrations/acumatica/link-status', authenticate, requireAdmin, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      "SELECT local_id AS client_id, remote_id, last_synced_at FROM erp_links WHERE provider = 'acumatica' AND entity_type = 'client'"
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/integrations/acumatica/clients/:clientId/push', authenticate, requireAdmin, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const clientResult = await db.query('SELECT * FROM clients WHERE id = $1', [req.params.clientId]);
    if (clientResult.rows.length === 0) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientResult.rows[0];

    const linkResult = await db.query(
      "SELECT remote_id FROM erp_links WHERE provider = 'acumatica' AND entity_type = 'client' AND local_id = $1",
      [client.id]
    );
    const existingRemoteId = linkResult.rows[0]?.remote_id;

    const remoteId = await acumatica.pushCustomer(client, existingRemoteId);
    if (!remoteId) return res.status(502).json({ error: "Acumatica n'a pas renvoyé d'identifiant client" });

    await db.query(
      `INSERT INTO erp_links (provider, entity_type, local_id, remote_id, last_synced_at)
       VALUES ('acumatica', 'client', $1, $2, NOW())
       ON CONFLICT (provider, entity_type, local_id) DO UPDATE SET remote_id = $2, last_synced_at = NOW()`,
      [client.id, remoteId]
    );

    res.json({ remoteId, syncedAt: new Date().toISOString() });
  } catch (err) {
    if (!acumatica.isConfigured()) return res.status(400).json({ error: 'Intégration Acumatica non configurée' });
    res.status(502).json({ error: err.message });
  }
});

router.get('/integrations/acumatica/customers', authenticate, requireAdmin, async (req, res) => {
  try {
    const data = await acumatica.listCustomers();
    res.json(data);
  } catch (err) {
    if (!acumatica.isConfigured()) return res.status(400).json({ error: 'Intégration Acumatica non configurée' });
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
