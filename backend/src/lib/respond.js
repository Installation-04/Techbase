// Centralized error response so route handlers never leak internal details
// (SQL error text, stack traces) to clients in production.
function serverError(res, err) {
  console.error(err);
  const message = process.env.NODE_ENV === 'production' ? 'Erreur serveur' : err.message;
  res.status(500).json({ error: message });
}

module.exports = { serverError };
