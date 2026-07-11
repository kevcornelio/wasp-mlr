// One-time welcome email to registered users, from the admin mailbox.
// Modes:
//   { mode: "test" }  — sends the template to the admin's own inbox only.
//   { mode: "user", email } — welcomes a single new signup (fired from the
//     signup flow); deduped per user so repeat calls cannot spam anyone.
//   { mode: "send", confirm: "SEND_WELCOME_TO_ALL" } — sends to every
//     profile, at most once per user ever (deduped via notification_log,
//     key welcome:<user_id>), so repeat calls cannot spam anyone.

import nodemailer from 'nodemailer';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const TEST_RECIPIENT = 'kev.cornelio@gmail.com';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SUBJECT = 'Wassup, foodie! 🍛 Your Mangalore food guide just got tastier';

const welcomeHtml = (firstName: string | null) => `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #f97316; margin-bottom: 16px;">Wassup MLR 🍛</h2>
    <p style="font-size: 16px; color: #222; font-weight: 600;">Hey ${firstName ? escapeHtml(firstName) : 'foodie'}!</p>
    <p style="font-size: 14px; color: #444; line-height: 1.6;">
      Thanks for being one of the early foodies on <b>Wassup MLR</b> — your AI food guide for Mangalore.
      Whether it's a 2&nbsp;AM biryani craving or hunting down the city's best Ghee Roast,
      just ask and we'll point you to the right plate.
    </p>
    <p style="font-size: 14px; color: #444; line-height: 1.6;">Since you signed up, the app has picked up some new tricks:</p>
    <p style="font-size: 14px; color: #444; line-height: 1.6;">
      💬 <b>Smarter recommendations</b> — the more you chat, rate places, and set your preferences
      (spice level, budget, cravings), the more personal your suggestions get.
      Yes, it remembers you loved that seafood place.
    </p>
    <p style="font-size: 14px; color: #444; line-height: 1.6;">
      📸 <b>Food photos &amp; stories</b> — share what you're eating, write about your favourite
      spots, and see what fellow Mangalore foodies are raving about.
    </p>
    <p style="font-size: 14px; color: #444; line-height: 1.6;">
      ❤️ <b>Likes &amp; comments</b> — the community can now cheer on your posts, and you'll
      get an email when someone loves what you shared.
    </p>
    <a href="https://www.wasp-mlr.com" style="display: inline-block; margin: 16px 0; background: #f97316; color: white; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">Ask me what to eat →</a>
    <p style="font-size: 14px; color: #444; line-height: 1.6;">
      Got feedback, ideas, or found a hidden gem we should know about? Just hit reply —
      this mailbox is read by a real human (who is probably eating right now).
    </p>
    <p style="font-size: 14px; color: #444;">Eat well,<br/><b>The Wassup MLR team</b></p>
    <p style="font-size: 11px; color: #999; margin-top: 24px;">You're receiving this because you have an account on wasp-mlr.com.</p>
  </div>`;

async function claimDedupeKey(key: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({ dedupe_key: key }),
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

// If a send fails after its key was claimed, release the key so the next
// attempt can retry instead of being permanently skipped.
async function releaseDedupeKey(key: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/notification_log?dedupe_key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  }).catch(() => {});
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: 'SMTP not configured' });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    const { mode, confirm } = req.body ?? {};

    if (mode === 'test') {
      await transporter.sendMail({
        from: `"Wassup MLR" <${SMTP_USER}>`,
        to: TEST_RECIPIENT,
        subject: `[TEST] ${SUBJECT}`,
        html: welcomeHtml('Kevin'),
      });
      return res.status(200).json({ sent: true, to: TEST_RECIPIENT });
    }

    if (mode === 'user') {
      const { email } = req.body ?? {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Bad email' });
      }
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'DB not configured' });

      const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,full_name&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const profile = (await profRes.json())?.[0];
      if (!profile?.email) return res.status(404).json({ error: 'Not found' });
      const dedupeKey = `welcome:${profile.id}`;
      if (!await claimDedupeKey(dedupeKey)) return res.status(200).json({ skipped: true });

      const firstName = profile.full_name?.trim().split(/\s+/)[0] || null;
      try {
        await transporter.sendMail({
          from: `"Wassup MLR" <${SMTP_USER}>`,
          to: profile.email,
          bcc: 'kev.cornelio@gmail.com',
          subject: SUBJECT,
          html: welcomeHtml(firstName),
        });
      } catch (e) {
        await releaseDedupeKey(dedupeKey);
        throw e;
      }
      return res.status(200).json({ sent: true });
    }

    if (mode === 'send') {
      if (confirm !== 'SEND_WELCOME_TO_ALL') {
        return res.status(400).json({ error: 'Missing confirmation' });
      }
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'DB not configured' });

      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,full_name`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const profiles: { id: string; email: string | null; full_name: string | null }[] = await profRes.json();

      let sent = 0, skipped = 0, failed = 0;
      for (const p of profiles) {
        if (!p.email) { skipped++; continue; }
        const dedupeKey = `welcome:${p.id}`;
        if (!await claimDedupeKey(dedupeKey)) { skipped++; continue; }
        const firstName = p.full_name?.trim().split(/\s+/)[0] || null;
        try {
          await transporter.sendMail({
            from: `"Wassup MLR" <${SMTP_USER}>`,
            to: p.email,
            bcc: 'kev.cornelio@gmail.com',
            subject: SUBJECT,
            html: welcomeHtml(firstName),
          });
          sent++;
        } catch (e) {
          console.error(`welcome send failed for ${p.email}:`, e);
          await releaseDedupeKey(dedupeKey);
          failed++;
        }
        await new Promise(r => setTimeout(r, 400));
      }
      return res.status(200).json({ sent, skipped, failed, total: profiles.length });
    }

    return res.status(400).json({ error: 'Unknown mode' });
  } catch (e) {
    console.error('welcome error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
