// Email notifications for comments and likes on blogs and food photos.
// Runs on the Node runtime (nodemailer needs TCP). Called fire-and-forget
// from the frontend; every event is re-verified against the database before
// any email is sent, and a unique dedupe key ensures at most one email per
// event (like/unlike toggling or client retries can't spam anyone).
//
// Env: SMTP_USER (admin@wasp-mlr.com), SMTP_PASS (Google App Password),
// SMTP_HOST (default smtp.gmail.com).

import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SITE_URL = 'https://www.wasp-mlr.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function dbGet<T = any>(path: string): Promise<T[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Inserts the dedupe key; returns false if this event was already handled.
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

type Target = {
  ownerId: string;
  label: string;       // e.g. `your food story "Some like it Hot!"`
  link: string;
};

async function getTarget(kind: 'blog' | 'photo', id: string): Promise<Target | null> {
  if (kind === 'blog') {
    const rows = await dbGet<{ user_id: string | null; title: string }>(
      `blog_posts?id=eq.${id}&select=user_id,title&limit=1`
    );
    const b = rows?.[0];
    if (!b?.user_id) return null;
    return { ownerId: b.user_id, label: `your food story "${b.title}"`, link: `${SITE_URL}/blog/${id}` };
  }
  const rows = await dbGet<{ user_id: string | null; caption: string | null }>(
    `food_photos?id=eq.${id}&select=user_id,caption&limit=1`
  );
  const p = rows?.[0];
  if (!p?.user_id) return null;
  const label = p.caption ? `your photo "${p.caption}"` : 'your food photo';
  return { ownerId: p.user_id, label, link: `${SITE_URL}/photos` };
}

async function getProfile(userId: string): Promise<{ email: string | null; full_name: string | null } | null> {
  const rows = await dbGet<{ email: string | null; full_name: string | null }>(
    `profiles?id=eq.${userId}&select=email,full_name&limit=1`
  );
  return rows?.[0] ?? null;
}

async function sendMail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Wassup MLR" <${SMTP_USER}>`,
    to,
    bcc: 'kev.cornelio@gmail.com',
    subject,
    html,
  });
}

const emailHtml = (heading: string, body: string, link: string) => `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #f97316; margin-bottom: 4px;">Wassup MLR 🍛</h2>
    <p style="font-size: 15px; color: #333;">${heading}</p>
    ${body ? `<blockquote style="border-left: 3px solid #f97316; margin: 12px 0; padding: 8px 12px; background: #fff7ed; color: #444; font-size: 14px;">${body}</blockquote>` : ''}
    <a href="${link}" style="display: inline-block; margin-top: 12px; background: #f97316; color: white; padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">Take a look</a>
    <p style="font-size: 11px; color: #999; margin-top: 24px;">You're receiving this because you shared content on wasp-mlr.com.</p>
  </div>`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: 'SMTP not configured' });

  try {
    const { type } = req.body ?? {};

    if (type === 'comment') {
      const { comment_id } = req.body;
      if (!UUID_RE.test(comment_id ?? '')) return res.status(400).json({ error: 'Bad comment_id' });

      const rows = await dbGet<{
        user_id: string; author_name: string; content: string;
        blog_post_id: string | null; photo_id: string | null;
      }>(`comments?id=eq.${comment_id}&select=user_id,author_name,content,blog_post_id,photo_id&limit=1`);
      const comment = rows?.[0];
      if (!comment) return res.status(404).json({ error: 'Not found' });

      const target = await getTarget(comment.blog_post_id ? 'blog' : 'photo', comment.blog_post_id ?? comment.photo_id!);
      if (!target || target.ownerId === comment.user_id) return res.status(200).json({ skipped: true });

      const owner = await getProfile(target.ownerId);
      if (!owner?.email) return res.status(200).json({ skipped: true });

      if (!await claimDedupeKey(`comment:${comment_id}`)) return res.status(200).json({ skipped: true });

      await sendMail(
        owner.email,
        `💬 ${comment.author_name} commented on ${target.label}`,
        emailHtml(
          `<b>${escapeHtml(comment.author_name)}</b> commented on ${escapeHtml(target.label)}:`,
          escapeHtml(comment.content.slice(0, 300)),
          target.link
        )
      );
      return res.status(200).json({ sent: true });
    }

    if (type === 'like') {
      const { target: kind, target_id, actor_id } = req.body;
      if (!['blog', 'photo'].includes(kind) || !UUID_RE.test(target_id ?? '') || !UUID_RE.test(actor_id ?? '')) {
        return res.status(400).json({ error: 'Bad request' });
      }

      // Verify the like actually exists before emailing anyone
      const col = kind === 'blog' ? 'blog_post_id' : 'photo_id';
      const likeRows = await dbGet(`likes?${col}=eq.${target_id}&user_id=eq.${actor_id}&select=id&limit=1`);
      if (!likeRows?.length) return res.status(404).json({ error: 'Not found' });

      const target = await getTarget(kind, target_id);
      if (!target || target.ownerId === actor_id) return res.status(200).json({ skipped: true });

      const [owner, actor] = await Promise.all([getProfile(target.ownerId), getProfile(actor_id)]);
      if (!owner?.email) return res.status(200).json({ skipped: true });

      if (!await claimDedupeKey(`like:${kind}:${target_id}:${actor_id}`)) return res.status(200).json({ skipped: true });

      const actorName = actor?.full_name || 'Someone';
      await sendMail(
        owner.email,
        `❤️ ${actorName} liked ${target.label}`,
        emailHtml(`<b>${escapeHtml(actorName)}</b> liked ${escapeHtml(target.label)}.`, '', target.link)
      );
      return res.status(200).json({ sent: true });
    }

    return res.status(400).json({ error: 'Unknown type' });
  } catch (e) {
    console.error('notify error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
