// Admin-only: send a branded email to any address (registered user or not)
// from the web app. The caller's Supabase session token is verified
// server-side and the account email must be an admin — nobody else can use
// this endpoint.

import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';

// Mirrors is_admin() in the database and src/lib/admin.ts
const ADMIN_EMAILS = ['kev.cornelio@gmail.com', 'admin@wasp-mlr.com'];

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const brandedHtml = (firstName: string | null, message: string) => `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #f97316; margin-bottom: 16px;">Wassup MLR 🍛</h2>
    <p style="font-size: 16px; color: #222; font-weight: 600;">Hey ${firstName ? escapeHtml(firstName) : 'foodie'}!</p>
    <div style="font-size: 14px; color: #444; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message.trim())}</div>
    <a href="https://www.wasp-mlr.com" style="display: inline-block; margin: 16px 0; background: #f97316; color: white; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">Open Wassup MLR →</a>
    <p style="font-size: 14px; color: #444;">Eat well,<br/><b>The Wassup MLR team</b></p>
    <p style="font-size: 11px; color: #999; margin-top: 24px;">You're receiving this because you have an account on wasp-mlr.com.</p>
  </div>`;

// Validates the caller's Supabase JWT and returns their email, or null.
async function getCallerEmail(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authHeader },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.email ?? null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: 'SMTP not configured' });

  try {
    const callerEmail = await getCallerEmail(req.headers.authorization);
    if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { to_email, to_name, subject, message } = req.body ?? {};
    if (typeof to_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) {
      return res.status(400).json({ error: 'Bad recipient email' });
    }
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 200) {
      return res.status(400).json({ error: 'Bad subject' });
    }
    if (typeof message !== 'string' || message.trim().length < 5 || message.length > 5000) {
      return res.status(400).json({ error: 'Message must be between 5 and 5000 characters' });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const firstName = typeof to_name === 'string' && to_name.trim()
      ? to_name.trim().split(/\s+/)[0].slice(0, 50)
      : null;
    await transporter.sendMail({
      from: `"Wassup MLR" <${SMTP_USER}>`,
      to: to_email,
      bcc: 'kev.cornelio@gmail.com',
      replyTo: `"Wassup MLR" <admin@wasp-mlr.com>`,
      subject: subject.trim(),
      html: brandedHtml(firstName, message),
    });

    return res.status(200).json({ sent: true, to: to_email });
  } catch (e) {
    console.error('admin-mail error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
