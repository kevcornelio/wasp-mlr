// Dynamic Open Graph share card for blog posts. Renders a branded 1200×630
// PNG from the post's title / restaurant / author, so links shared to
// WhatsApp, iMessage, Facebook, etc. show a rich preview.
//
//   /api/og?id=<blogId>   → card for that approved post
//   /api/og               → generic branded card (fallback, never errors)
//
// Built with @vercel/og (Satori) on the edge runtime. Element trees are plain
// objects (the shape JSX compiles to) to avoid any JSX-transform config in the
// api/ folder.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BG = '#0c0a09';
const ORANGE = '#f97316';
const MUTED = '#a8a29e';

type El = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): El => ({
  type,
  props: { style, children },
});

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

async function fetchPost(id: string): Promise<{ title: string; restaurant: string | null; author: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY || !UUID_RE.test(id)) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${id}&status=eq.approved&select=title,restaurant_name,author_name&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const row = (await res.json())?.[0];
    if (!row?.title) return null;
    return { title: row.title, restaurant: row.restaurant_name ?? null, author: row.author_name ?? null };
  } catch {
    return null;
  }
}

function card(title: string, restaurant: string | null, author: string | null): El {
  const children: El[] = [
    // Wordmark
    h('div', { display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 700, color: '#ffffff' },
      `Wassup MLR 🍛`),
    // Title
    h('div',
      { display: 'flex', fontSize: title.length > 60 ? 62 : 76, fontWeight: 800, color: '#ffffff', lineHeight: 1.08, letterSpacing: '-0.02em' },
      truncate(title, 110)),
    // Meta row (restaurant + author)
    h('div', { display: 'flex', flexDirection: 'column', gap: 10 },
      [
        restaurant
          ? h('div', { display: 'flex', alignItems: 'center', fontSize: 32, color: ORANGE, fontWeight: 600 }, `📍 ${truncate(restaurant, 40)}`)
          : h('div', { display: 'none' }, ''),
        author
          ? h('div', { display: 'flex', alignItems: 'center', fontSize: 28, color: MUTED }, `by ${truncate(author, 40)}`)
          : h('div', { display: 'none' }, ''),
      ]),
  ];

  return h('div',
    {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: BG,
      backgroundImage: `radial-gradient(circle at 85% 15%, rgba(249,115,22,0.22), transparent 45%)`,
      padding: '64px 72px',
      fontFamily: 'sans-serif',
    },
    [
      h('div', { display: 'flex', flexDirection: 'column', gap: 28 }, children),
      // Footer
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        [
          h('div', { display: 'flex', fontSize: 26, color: MUTED }, 'www.wasp-mlr.com'),
          h('div',
            { display: 'flex', alignItems: 'center', fontSize: 24, color: '#ffffff', backgroundColor: ORANGE, padding: '12px 24px', borderRadius: 999, fontWeight: 700 },
            'Read the story →'),
        ]),
    ]);
}

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  const post = id ? await fetchPost(id) : null;

  const el = post
    ? card(post.title, post.restaurant, post.author)
    : card("Mangalore's food, one craving at a time", null, 'The Wassup MLR community');

  return new ImageResponse(el as unknown as never, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
