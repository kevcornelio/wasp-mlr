// Support contact form: emails the user's message to the admin mailbox.
// Node runtime (nodemailer needs TCP). Reply-To is set to the sender's
// email so the admin can respond directly from the inbox.

import nodemailer from 'nodemailer';

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SUPPORT_TO = 'admin@wasp-mlr.com';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: 'SMTP not configured' });

  try {
    const { message, from_email, from_name } = req.body ?? {};

    if (typeof message !== 'string' || message.trim().length < 10 || message.length > 3000) {
      return res.status(400).json({ error: 'Message must be between 10 and 3000 characters' });
    }
    const email = typeof from_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from_email)
      ? from_email
      : null;
    const name = typeof from_name === 'string' && from_name.trim() ? from_name.trim().slice(0, 100) : 'Anonymous';

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Wassup MLR Support" <${SMTP_USER}>`,
      to: SUPPORT_TO,
      bcc: 'kev.cornelio@gmail.com',
      ...(email ? { replyTo: `"${name}" <${email}>` } : {}),
      subject: `🛟 Support message from ${name}`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #f97316; margin-bottom: 4px;">Support message</h2>
          <p style="font-size: 13px; color: #666;">From: <b>${escapeHtml(name)}</b>${email ? ` &lt;${escapeHtml(email)}&gt;` : ' (no email provided)'}</p>
          <blockquote style="border-left: 3px solid #f97316; margin: 12px 0; padding: 10px 14px; background: #fff7ed; color: #333; font-size: 14px; white-space: pre-wrap;">${escapeHtml(message.trim())}</blockquote>
        </div>`,
    });

    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error('support error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
