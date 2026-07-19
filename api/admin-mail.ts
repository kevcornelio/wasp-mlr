// Admin-only mailer from the web app. The caller's Supabase session token is
// verified server-side and the account email must be an admin — nobody else
// can use this endpoint. Two modes:
//   { to_email, to_name?, subject, message } — one branded email.
//   { recipients: [{ email, name? }], subject, message, kind: "outreach" } —
//     the same branded email to a list, for reaching out to potential users.

import nodemailer from 'nodemailer';

// Outreach can fan out to many recipients sequentially; give it room.
export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const MAX_RECIPIENTS = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors is_admin() in the database and src/lib/admin.ts
const ADMIN_EMAILS = ['kev.cornelio@gmail.com', 'admin@wasp-mlr.com'];

// Footer differs by audience: existing users have an account; outreach targets
// don't, so telling them "you have an account" would be false.
const ACCOUNT_FOOTER = "You're receiving this because you have an account on wasp-mlr.com.";
const OUTREACH_FOOTER =
  "You're receiving this because we thought you'd enjoy Wassup MLR — Mangalore's AI food guide. Not for you? Just reply and we'll leave you be.";

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const brandedHtml = (firstName: string | null, message: string, footer = ACCOUNT_FOOTER) => `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #f97316; margin-bottom: 16px;">Wassup MLR 🍛</h2>
    <p style="font-size: 16px; color: #222; font-weight: 600;">Hey ${firstName ? escapeHtml(firstName) : 'foodie'}!</p>
    <div style="font-size: 14px; color: #444; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message.trim())}</div>
    <a href="https://www.wasp-mlr.com" style="display: inline-block; margin: 16px 0; background: #f97316; color: white; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">Open Wassup MLR →</a>
    <p style="font-size: 14px; color: #444;">Eat well,<br/><b>The Wassup MLR team</b></p>
    <p style="font-size: 11px; color: #999; margin-top: 24px;">${footer}</p>
  </div>`;

const firstNameOf = (name: unknown): string | null =>
  typeof name === 'string' && name.trim() ? name.trim().split(/\s+/)[0].slice(0, 50) : null;

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

    const { to_email, to_name, subject, message, recipients } = req.body ?? {};

    // Shared content validation for both modes.
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
    const FROM = `"Wassup MLR" <${SMTP_USER}>`;
    const REPLY_TO = `"Wassup MLR" <admin@wasp-mlr.com>`;

    // Bulk outreach: same branded email to a list of potential users.
    if (Array.isArray(recipients)) {
      const clean = recipients
        .map((r: unknown) => {
          const rec = r as { email?: unknown; name?: unknown };
          return { email: typeof rec?.email === 'string' ? rec.email.trim() : '', name: rec?.name };
        })
        .filter((r) => EMAIL_RE.test(r.email));
      if (clean.length === 0) return res.status(400).json({ error: 'No valid recipients' });
      if (clean.length > MAX_RECIPIENTS) {
        return res.status(400).json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` });
      }

      const html = (name: unknown) => brandedHtml(firstNameOf(name), message, OUTREACH_FOOTER);
      let sent = 0, failed = 0;
      const results: { email: string; ok: boolean }[] = [];
      for (const r of clean) {
        try {
          await transporter.sendMail({ from: FROM, to: r.email, bcc: 'kev.cornelio@gmail.com', replyTo: REPLY_TO, subject: subject.trim(), html: html(r.name) });
          sent++; results.push({ email: r.email, ok: true });
        } catch (err) {
          console.error(`outreach send failed for ${r.email}:`, err);
          failed++; results.push({ email: r.email, ok: false });
        }
        await new Promise((res2) => setTimeout(res2, 400));
      }
      return res.status(200).json({ sent, failed, total: clean.length, results });
    }

    // Single send to one address (registered user or any typed-in email).
    if (typeof to_email !== 'string' || !EMAIL_RE.test(to_email)) {
      return res.status(400).json({ error: 'Bad recipient email' });
    }
    await transporter.sendMail({
      from: FROM,
      to: to_email,
      bcc: 'kev.cornelio@gmail.com',
      replyTo: REPLY_TO,
      subject: subject.trim(),
      html: brandedHtml(firstNameOf(to_name), message),
    });

    return res.status(200).json({ sent: true, to: to_email });
  } catch (e) {
    console.error('admin-mail error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
