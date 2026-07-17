// Weekly community digest: new food spots, new stories, photo count, and
// level-ups from the past 7 days, mailed to every profile that hasn't
// opted out. Skips the send entirely on a quiet week.
//
// The feature is admin-controlled from the Admin page — there is no active
// cron (vercel.json has none), so nothing sends without a person clicking.
//
// Triggers (POST modes below require a valid admin Supabase session):
//   POST { mode: "preview" } — returns this week's counts, sends nothing.
//   POST { mode: "test" } — sends the digest to the admin's own inbox only.
//   POST { mode: "send", confirm: "SEND_DIGEST_TO_ALL" } — full send.
//   GET  — dormant cron hook. Requires Authorization: Bearer CRON_SECRET.
//     Re-arm by adding a crons entry to vercel.json and setting CRON_SECRET.
//
// Deduped per ISO week (digest:<year>-W<week>:<user_id>) so a retry or a
// second click cannot email anyone twice in the same week.

import nodemailer from 'nodemailer';
import { createHmac } from 'crypto';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const CRON_SECRET = process.env.CRON_SECRET;
const SITE_URL = 'https://www.wasp-mlr.com';
const TEST_RECIPIENT = 'kev.cornelio@gmail.com';

// Mirrors is_admin() in the database and src/lib/admin.ts
const ADMIN_EMAILS = ['kev.cornelio@gmail.com', 'admin@wasp-mlr.com'];

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

// Mirrors src/lib/levels.ts — keep in sync (that file is the source of truth).
const FOOD_LEVELS = [
  { name: 'New Foodie', emoji: '🍽️', min: 0 },
  { name: 'Taster', emoji: '🥢', min: 5 },
  { name: 'Food Explorer', emoji: '🍜', min: 25 },
  { name: 'Local Expert', emoji: '🍱', min: 75 },
  { name: 'Connoisseur', emoji: '⭐', min: 150 },
  { name: 'Food Legend', emoji: '👑', min: 300 },
];
const score = (b: number, s: number, p: number, c: number) => b * 15 + s * 3 + p + c;
const levelIndex = (sc: number) => {
  let i = 0;
  FOOD_LEVELS.forEach((l, idx) => { if (sc >= l.min) i = idx; });
  return i;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`db ${path}: ${res.status}`);
  return res.json();
}

async function claimDedupeKey(key: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY!,
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

async function releaseDedupeKey(key: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/notification_log?dedupe_key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  }).catch(() => {});
}

// ISO week label, e.g. 2026-W29 — one digest per user per ISO week.
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const unsubscribeSig = (userId: string) =>
  createHmac('sha256', SUPABASE_KEY!).update(`unsub:${userId}`).digest('hex').slice(0, 32);

type Spot = { restaurant_name: string; location: string | null; dishes: string[] | null; rating: number | null; user_id: string | null };
type Blog = { title: string; author_name: string; id: string };
type LevelUp = { name: string; level: { name: string; emoji: string } };

type DigestData = {
  spots: Spot[];
  blogs: Blog[];
  photoCount: number;
  levelUps: LevelUp[];
  names: Map<string, string>;
};

async function gatherWeek(cutoffIso: string): Promise<DigestData> {
  const [spots, blogs, photos, chats, profiles] = await Promise.all([
    dbGet<Spot & { created_at: string }>(`user_food_spots?select=restaurant_name,location,dishes,rating,user_id,created_at&order=created_at.desc`),
    dbGet<Blog & { user_id: string | null; created_at: string; status: string }>(`blog_posts?status=eq.approved&select=id,title,author_name,user_id,created_at,status&order=created_at.desc`),
    dbGet<{ user_id: string | null; created_at: string }>(`food_photos?select=user_id,created_at`),
    dbGet<{ user_id: string | null; created_at: string }>(`chat_sessions?select=user_id,created_at`),
    dbGet<{ id: string; full_name: string | null }>(`profiles?select=id,full_name`),
  ]);

  const names = new Map(profiles.map(p => [p.id, p.full_name?.trim() || 'A foodie']));

  // Per-user counts before the cutoff vs total, to detect level crossings.
  const counts = new Map<string, { b: number; s: number; p: number; c: number; b0: number; s0: number; p0: number; c0: number }>();
  const bump = (uid: string | null, key: 'b' | 's' | 'p' | 'c', createdAt: string) => {
    if (!uid) return;
    const row = counts.get(uid) ?? { b: 0, s: 0, p: 0, c: 0, b0: 0, s0: 0, p0: 0, c0: 0 };
    row[key]++;
    if (createdAt < cutoffIso) row[`${key}0`]++;
    counts.set(uid, row);
  };
  blogs.forEach(x => bump(x.user_id, 'b', x.created_at));
  spots.forEach(x => bump(x.user_id, 's', x.created_at));
  photos.forEach(x => bump(x.user_id, 'p', x.created_at));
  chats.forEach(x => bump(x.user_id, 'c', x.created_at));

  const levelUps: LevelUp[] = [];
  for (const [uid, r] of counts) {
    const before = levelIndex(score(r.b0, r.s0, r.p0, r.c0));
    const now = levelIndex(score(r.b, r.s, r.p, r.c));
    if (now > before) levelUps.push({ name: names.get(uid) ?? 'A foodie', level: FOOD_LEVELS[now] });
  }

  return {
    spots: spots.filter(x => x.created_at >= cutoffIso),
    blogs: blogs.filter(x => x.created_at >= cutoffIso),
    photoCount: photos.filter(x => x.created_at >= cutoffIso).length,
    levelUps,
    names,
  };
}

const section = (title: string, inner: string) => `
  <p style="font-size: 15px; color: #222; font-weight: 700; margin: 20px 0 6px;">${title}</p>
  ${inner}`;

function digestHtml(d: DigestData, userId: string | null): string {
  const parts: string[] = [];

  if (d.spots.length) {
    const items = d.spots.slice(0, 8).map(s => {
      const by = s.user_id ? ` <span style="color:#999;">— added by ${escapeHtml(d.names.get(s.user_id) ?? 'a foodie')}</span>` : '';
      const where = s.location ? ` · ${escapeHtml(s.location)}` : '';
      const dish = s.dishes?.length ? `<br/><span style="color:#666; font-size:13px;">Try: ${escapeHtml(s.dishes.slice(0, 3).join(', '))}</span>` : '';
      return `<li style="margin-bottom: 8px;"><b>${escapeHtml(s.restaurant_name)}</b>${where}${by}${dish}</li>`;
    }).join('');
    const more = d.spots.length > 8 ? `<p style="font-size:13px; color:#666;">…and ${d.spots.length - 8} more.</p>` : '';
    parts.push(section(`🍽️ ${d.spots.length} new spot${d.spots.length > 1 ? 's' : ''} on the map`,
      `<ul style="font-size: 14px; color: #444; line-height: 1.5; padding-left: 20px; margin: 0;">${items}</ul>${more}`));
  }

  if (d.blogs.length) {
    const items = d.blogs.map(b =>
      `<li style="margin-bottom: 6px;"><a href="${SITE_URL}/blog/${b.id}" style="color:#f97316; text-decoration:none; font-weight:600;">${escapeHtml(b.title)}</a> <span style="color:#999;">by ${escapeHtml(b.author_name)}</span></li>`
    ).join('');
    parts.push(section(`📖 Fresh food stories`,
      `<ul style="font-size: 14px; color: #444; line-height: 1.5; padding-left: 20px; margin: 0;">${items}</ul>`));
  }

  if (d.photoCount) {
    parts.push(section(`📸 ${d.photoCount} new food photo${d.photoCount > 1 ? 's' : ''}`,
      `<p style="font-size: 14px; color: #444; margin: 0;">The community has been eating well — <a href="${SITE_URL}/photos" style="color:#f97316;">take a look</a>.</p>`));
  }

  if (d.levelUps.length) {
    const items = d.levelUps.map(l =>
      `<li style="margin-bottom: 6px;"><b>${escapeHtml(l.name)}</b> reached ${l.level.emoji} <b>${escapeHtml(l.level.name)}</b></li>`
    ).join('');
    parts.push(section(`🎉 Level-ups this week`,
      `<ul style="font-size: 14px; color: #444; line-height: 1.5; padding-left: 20px; margin: 0;">${items}</ul>`));
  }

  const unsub = userId
    ? `<a href="${SITE_URL}/api/unsubscribe?uid=${userId}&sig=${unsubscribeSig(userId)}" style="color:#999;">Unsubscribe from the weekly digest</a>`
    : '';

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #f97316; margin-bottom: 4px;">Wassup MLR 🍛</h2>
    <p style="font-size: 14px; color: #666; margin-top: 0;">This week in Mangalore food</p>
    ${parts.join('')}
    <a href="${SITE_URL}" style="display: inline-block; margin: 20px 0 0; background: #f97316; color: white; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px;">Ask me what to eat →</a>
    <p style="font-size: 11px; color: #999; margin-top: 24px;">You're receiving this because you have an account on wasp-mlr.com.<br/>${unsub}</p>
  </div>`;
}

const SUBJECT = "🍛 This week's tastiest finds in Mangalore";

export default async function handler(req: any, res: any) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'DB not configured' });

  let mode: 'cron' | 'preview' | 'test' | 'send';
  if (req.method === 'GET') {
    if (!CRON_SECRET) return res.status(503).json({ error: 'CRON_SECRET not configured' });
    if (req.headers?.authorization !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    mode = 'cron';
  } else if (req.method === 'POST') {
    const callerEmail = await getCallerEmail(req.headers?.authorization);
    if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const body = req.body ?? {};
    if (body.mode === 'preview') mode = 'preview';
    else if (body.mode === 'test') mode = 'test';
    else if (body.mode === 'send' && body.confirm === 'SEND_DIGEST_TO_ALL') mode = 'send';
    else return res.status(400).json({ error: 'Bad mode or missing confirmation' });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Preview never sends, so it doesn't need SMTP configured.
  if (mode !== 'preview' && (!SMTP_USER || !SMTP_PASS)) {
    return res.status(500).json({ error: 'SMTP not configured' });
  }

  try {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const data = await gatherWeek(cutoff);

    const quiet = !data.spots.length && !data.blogs.length && !data.photoCount && !data.levelUps.length;

    if (mode === 'preview') {
      return res.status(200).json({
        preview: true,
        quiet,
        spots: data.spots.length,
        blogs: data.blogs.length,
        photos: data.photoCount,
        levelUps: data.levelUps.length,
      });
    }

    if (quiet && mode !== 'test') return res.status(200).json({ skipped: 'no activity this week' });

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    if (mode === 'test') {
      await transporter.sendMail({
        from: `"Wassup MLR" <${SMTP_USER}>`,
        to: TEST_RECIPIENT,
        subject: `[TEST] ${SUBJECT}`,
        html: digestHtml(data, null),
      });
      return res.status(200).json({ sent: true, to: TEST_RECIPIENT, quiet });
    }

    const profiles = await dbGet<{ id: string; email: string | null; digest_opt_out: boolean }>(
      `profiles?select=id,email,digest_opt_out`
    );
    const week = isoWeek(new Date());

    let sent = 0, skipped = 0, failed = 0;
    for (const p of profiles) {
      if (!p.email || p.digest_opt_out) { skipped++; continue; }
      const dedupeKey = `digest:${week}:${p.id}`;
      if (!await claimDedupeKey(dedupeKey)) { skipped++; continue; }
      try {
        await transporter.sendMail({
          from: `"Wassup MLR" <${SMTP_USER}>`,
          to: p.email,
          subject: SUBJECT,
          html: digestHtml(data, p.id),
        });
        sent++;
      } catch (e) {
        console.error(`digest send failed for ${p.email}:`, e);
        await releaseDedupeKey(dedupeKey);
        failed++;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return res.status(200).json({ sent, skipped, failed, total: profiles.length, week });
  } catch (e) {
    console.error('digest error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
