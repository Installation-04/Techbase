const jwt = require('jsonwebtoken');

function issueToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET || 'change_this_secret_in_production_dev_only',
    { expiresIn: '8h' }
  );
}

module.exports = { issueToken };
