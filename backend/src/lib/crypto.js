const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.JWT_SECRET || 'change_this_secret_in_production_dev_only';

// Different salts derive different keys for different secret domains
// (client password vault vs. ERP integration credentials), so a leak in
// one doesn't help decrypt the other.
function keyFor(salt) {
  return crypto.scryptSync(SECRET_KEY, salt, 32);
}

function encrypt(text, salt) {
  const key = keyFor(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText, salt) {
  const key = keyFor(salt);
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
