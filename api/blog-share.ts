// Server-rendered Open Graph tags for a single blog post. Social scrapers
// (WhatsApp, iMessage, Facebook, Twitter) don't run JavaScript, so the SPA's
// static index.html tags can't be personalised client-side. This function
// serves the same index.html but with the post's title / description / image
// (the /api/og card) swapped into the og/twitter meta tags.
//
// Routed via vercel.json: /blog/:id → /api/blog-share?id=:id. Humans get the
// normal SPA HTML (React boots as usual); scrapers get the rich preview.
//
// Fail-safe: on any miss (bad id, post not found, fetch error) it returns the
// unmodified base HTML, so /blog/:id (and /blog/new) always keep working.

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replace the content="" of a specific <meta> tag, matched by its
// property="" or name="" attribute. No-op if the tag isn't present.
function setMeta(html: string, attr: 'property' | 'name', key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
  return html.replace(re, `$1${escapeAttr(value)}$2`);
}

function plainSummary(content: string, restaurant: string | null): string {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/[#*_>`~\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const base = text || (restaurant ? `A food story about ${restaurant} in Mangalore.` : 'A Mangalore food story on Wassup MLR.');
  return base.length > 180 ? base.slice(0, 177).trimEnd() + '…' : base;
}

async function fetchPost(id: string) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${id}&status=eq.approved&select=title,content,restaurant_name,author_name&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const row = (await res.json())?.[0];
    if (!row?.title) return null;
    return {
      title: row.title as string,
      content: (row.content as string) ?? '',
      restaurant: (row.restaurant_name as string) ?? null,
      author: (row.author_name as string) ?? null,
    };
  } catch {
    return null;
  }
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const host = req.headers.get('host') || 'www.wasp-mlr.com';
  const origin = `https://${host}`;

  // Always fetch the real built shell so JS/CSS asset refs stay correct.
  let html: string;
  try {
    const res = await fetch(`${origin}/index.html`, { headers: { 'x-blog-share': '1' } });
    html = await res.text();
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const serve = (body: string) =>
    new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });

  // Non-post routes (e.g. /blog/new) and unknown ids: serve the SPA untouched.
  if (!UUID_RE.test(id)) return serve(html);
  const post = await fetchPost(id);
  if (!post) return serve(html);

  const title = `${post.title} — Wassup MLR 🍛`;
  const description = plainSummary(post.content, post.restaurant);
  const image = `${origin}/api/og?id=${id}`;
  const pageUrl = `${origin}/blog/${id}`;

  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'property', 'og:type', 'article');
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'property', 'og:url', pageUrl);
  html = setMeta(html, 'property', 'og:image', image);
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', description);
  html = setMeta(html, 'name', 'twitter:image', image);

  return serve(html);
}
