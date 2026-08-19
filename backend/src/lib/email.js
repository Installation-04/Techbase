// Minimal transactional email sender via Resend's HTTP API (no SDK needed —
// just fetch, so it doesn't add anything to the Netlify Functions bundle).
// A no-op when RESEND_API_KEY isn't set, so email notifications are entirely
// opt-in and never block the app's core functionality.
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'TechIBase <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error('Email send failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Email send error:', err);
  }
}

module.exports = { sendEmail };
