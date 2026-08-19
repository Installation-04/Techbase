// Lightweight, dependency-free request body validator.
// Usage: validate({ email: { required: true, type: 'string', maxLength: 255 } })
function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];
      const present = value !== undefined && value !== null && value !== '';

      if (rules.required && !present) {
        errors.push(`${field} est requis`);
        continue;
      }
      if (!present) continue;

      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push(`${field} doit être une chaîne de caractères`);
        continue;
      }
      if (rules.type === 'number') {
        // HTML forms (<select>, <input type="number">) always submit strings —
        // accept numeric strings too, not just JS numbers from a JSON API client.
        const isNumeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)));
        if (!isNumeric) {
          errors.push(`${field} doit être un nombre`);
          continue;
        }
      }
      if (rules.type === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} doit contenir au moins ${rules.minLength} caractères`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} ne doit pas dépasser ${rules.maxLength} caractères`);
        }
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} doit être l'une des valeurs suivantes : ${rules.enum.join(', ')}`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} est invalide`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }
    next();
  };
}

module.exports = { validate };
