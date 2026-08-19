const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

router.get('/search', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ clients: [], equipment: [], contacts: [] });
  const term = `%${q.trim()}%`;
  try {
    const [clients, equipment, contacts] = await Promise.all([
      db.query(
        'SELECT id, name, contract_number, manager FROM clients WHERE name ILIKE $1 OR contract_number ILIKE $1 OR manager ILIKE $1 LIMIT 10',
        [term]
      ),
      db.query(
        'SELECT e.id, e.name, e.type, e.serial_number, e.client_id, c.name as client_name FROM equipment e LEFT JOIN clients c ON c.id = e.client_id WHERE e.name ILIKE $1 OR e.serial_number ILIKE $1 OR e.type ILIKE $1 LIMIT 10',
        [term]
      ),
      db.query(
        'SELECT ct.id, ct.name, ct.role, ct.phone, ct.email, ct.client_id, c.name as client_name FROM contacts ct LEFT JOIN clients c ON c.id = ct.client_id WHERE ct.name ILIKE $1 OR ct.email ILIKE $1 OR ct.phone ILIKE $1 LIMIT 10',
        [term]
      )
    ]);
    res.json({ clients: clients.rows, equipment: equipment.rows, contacts: contacts.rows });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
