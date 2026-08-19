const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { serverError } = require('../lib/respond');
const { encrypt, decrypt } = require('../lib/crypto');
const acumatica = require('../integrations/acumatica');

// Separate salt from the client-password vault so a compromise of one
// secret domain doesn't help decrypt the other.
const CREDENTIALS_SALT = 'techbase_integration_salt';

async function getUserCreds(db, userId) {
  const result = await db.query(
    "SELECT * FROM user_integration_credentials WHERE user_id = $1 AND provider = 'acumatica'",
    [userId]
  );
  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      baseUrl: row.base_url,
      username: row.username,
      password: decrypt(row.encrypted_password, CREDENTIALS_SALT),
      company: row.company,
      branch: row.branch,
      endpointName: row.endpoint_name,
      endpointVersion: row.endpoint_version,
    };
  }
  // Fall back to a deployment-wide shared account (env vars) if the user
  // hasn't connected their own — optional, useful for a single-tenant shop.
  const fallback = acumatica.envCreds();
  return acumatica.isConfigured(fallback) ? fallback : null;
}

// GET — whether *I* have my own Acumatica account connected (never returns the password)
router.get('/integrations/acumatica/credentials', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      "SELECT base_url, username, company, branch, updated_at FROM user_integration_credentials WHERE user_id = $1 AND provider = 'acumatica'",
      [req.user.id]
    );
    const sharedFallbackAvailable = result.rows.length === 0 && acumatica.isConfigured(acumatica.envCreds());
    res.json({
      connected: result.rows.length > 0,
      credentials: result.rows[0] || null,
      sharedFallbackAvailable,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// PUT — connect/update my own Acumatica account
router.put('/integrations/acumatica/credentials', authenticate, validate({
  base_url: { required: true, type: 'string', maxLength: 500 },
  username: { required: true, type: 'string', maxLength: 255 },
  password: { required: true, type: 'string', maxLength: 500 },
  company: { required: true, type: 'string', maxLength: 255 },
  branch: { type: 'string', maxLength: 255 },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { base_url, username, password, company, branch } = req.body;
  try {
    const encryptedPassword = encrypt(password, CREDENTIALS_SALT);
    await db.query(
      `INSERT INTO user_integration_credentials (user_id, provider, base_url, username, encrypted_password, company, branch)
       VALUES ($1, 'acumatica', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         base_url = $2, username = $3, encrypted_password = $4, company = $5, branch = $6, updated_at = NOW()`,
      [req.user.id, base_url, username, encryptedPassword, company, branch || null]
    );
    res.json({ connected: true });
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE — disconnect my own Acumatica account
router.delete('/integrations/acumatica/credentials', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query(
      "DELETE FROM user_integration_credentials WHERE user_id = $1 AND provider = 'acumatica'",
      [req.user.id]
    );
    res.json({ connected: false });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/integrations/acumatica/test', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const creds = await getUserCreds(db, req.user.id);
    if (!creds) return res.status(400).json({ ok: false, error: 'Aucun compte Acumatica connecté' });
    await acumatica.testConnection(creds);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

router.get('/integrations/acumatica/link-status', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      "SELECT local_id AS client_id, remote_id, last_synced_at FROM erp_links WHERE provider = 'acumatica' AND entity_type = 'client' AND user_id = $1",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/integrations/acumatica/clients/:clientId/push', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const creds = await getUserCreds(db, req.user.id);
    if (!creds) {
      return res.status(400).json({ error: "Aucun compte Acumatica connecté. Connectez votre compte dans l'onglet Intégrations." });
    }

    const clientResult = await db.query('SELECT * FROM clients WHERE id = $1', [req.params.clientId]);
    if (clientResult.rows.length === 0) return res.status(404).json({ error: 'Client non trouvé' });
    const client = clientResult.rows[0];

    const linkResult = await db.query(
      "SELECT remote_id FROM erp_links WHERE provider = 'acumatica' AND entity_type = 'client' AND local_id = $1 AND user_id = $2",
      [client.id, req.user.id]
    );
    const existingRemoteId = linkResult.rows[0]?.remote_id;

    const remoteId = await acumatica.pushCustomer(creds, client, existingRemoteId);
    if (!remoteId) return res.status(502).json({ error: "Acumatica n'a pas renvoyé d'identifiant client" });

    await db.query(
      `INSERT INTO erp_links (provider, entity_type, local_id, remote_id, user_id, last_synced_at)
       VALUES ('acumatica', 'client', $1, $2, $3, NOW())
       ON CONFLICT (user_id, provider, entity_type, local_id) DO UPDATE SET remote_id = $2, last_synced_at = NOW()`,
      [client.id, remoteId, req.user.id]
    );

    res.json({ remoteId, syncedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
