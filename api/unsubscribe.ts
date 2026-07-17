// One-click unsubscribe from the weekly digest, linked from the email
// footer. The link carries an HMAC signature derived from the service key,
// so only someone holding a real digest email for that user can opt them
// out — profile ids alone are not enough to forge a link.

import { createHmac, timingSafeEqual } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Must match unsubscribeSig in api/digest.ts.
const expectedSig = (userId: string) =>
  createHmac('sha256', SUPABASE_KEY!).update(`unsub:${userId}`).digest('hex').slice(0, 32);

const page = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Wassup MLR</title></head>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; text-align: center;">
  <h2 style="color: #f97316;">Wassup MLR 🍛</h2>
  <p style="font-size: 16px; color: #222;">${title}</p>
  <p style="font-size: 14px; color: #666;">${body}</p>
  <a href="https://www.wasp-mlr.com" style="color: #f97316; font-weight: 600;">Back to the app →</a>
</body></html>`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'DB not configured' });

  const { uid, sig } = req.query ?? {};
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (typeof uid !== 'string' || !UUID_RE.test(uid) || typeof sig !== 'string' || sig.length !== 32) {
    return res.status(400).send(page('That link looks broken', 'Try the unsubscribe link from your most recent digest email.'));
  }
  const expected = expectedSig(uid);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(403).send(page('That link looks broken', 'Try the unsubscribe link from your most recent digest email.'));
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ digest_opt_out: true }),
    });
    const rows = await r.json();
    if (!r.ok || !Array.isArray(rows) || rows.length === 0) {
      return res.status(404).send(page('Account not found', 'This account may have been deleted.'));
    }
    return res.status(200).send(page(
      "You're unsubscribed from the weekly digest",
      "You won't get the weekly roundup anymore. Likes, comments, and account emails still arrive as usual."
    ));
  } catch (e) {
    console.error('unsubscribe error:', e);
    return res.status(500).send(page('Something went wrong', 'Please try the link again in a minute.'));
  }
}
