const { sendEmail } = require('./email');

// Creates an in-app notification and, if the recipient has an email and
// RESEND_API_KEY is configured, sends a matching email. Never throws —
// notification delivery is best-effort and must not break the caller's
// main request (e.g. assigning a bon de service still succeeds even if
// notifying the assignee fails).
async function notifyUser(db, { userId, type, message, link, emailSubject, emailHtml }) {
  try {
    await db.query(
      'INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4)',
      [userId, type, message, link || null]
    );
  } catch (err) {
    console.error('Failed to create in-app notification:', err);
  }

  if (emailSubject && emailHtml) {
    try {
      const result = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
      const email = result.rows[0]?.email;
      if (email) await sendEmail({ to: email, subject: emailSubject, html: emailHtml });
    } catch (err) {
      console.error('Failed to email notification:', err);
    }
  }
}

module.exports = { notifyUser };
