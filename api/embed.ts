export const config = { runtime: 'edge' };

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!VOYAGE_API_KEY) return null;
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-3',
        input: [text],
        input_type: 'document',
      }),
    });
    if (!res.ok) {
      console.error('Voyage AI error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.data[0].embedding;
  } catch (err) {
    console.error('Embedding error:', err);
    return null;
  }
}

async function dbPatch(table: string, id: string, body: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    }
  );
  return res.ok;
}

async function dbGet<T = Record<string, unknown>>(table: string, id: string): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' } });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { type, id } = await req.json() as { type: 'recommendation' | 'spot' | 'blog'; id: string };

    if (!type || !id) {
      return new Response(JSON.stringify({ error: 'Missing type or id' }), { status: 400 });
    }

    let text: string | null = null;

    if (type === 'spot') {
      const spot = await dbGet<{
        restaurant_name: string;
        location?: string;
        dishes?: string[];
        notes?: string;
      }>('user_food_spots', id);

      if (!spot) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

      const parts = [
        spot.restaurant_name,
        spot.location ? `in ${spot.location}` : null,
        spot.dishes?.length ? `Dishes: ${spot.dishes.join(', ')}` : null,
        spot.notes,
      ].filter(Boolean);
      text = parts.join('. ');

    } else if (type === 'recommendation') {
      const rec = await dbGet<{
        restaurant_name: string;
        cuisine_type?: string;
        location?: string;
        notes?: string;
        tags?: string[];
        price_range?: string;
      }>('community_recommendations', id);

      if (!rec) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

      const parts = [
        rec.restaurant_name,
        rec.cuisine_type,
        rec.location ? `in ${rec.location}` : null,
        rec.notes,
        rec.tags?.join(', '),
        rec.price_range,
      ].filter(Boolean);
      text = parts.join('. ');

    } else if (type === 'blog') {
      const blog = await dbGet<{
        title: string;
        body: string;
        restaurant_name?: string;
        author_name?: string;
      }>('food_blogs', id);

      if (!blog) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

      // Use title + first 500 chars of body for embedding
      text = [blog.title, blog.restaurant_name, blog.body.slice(0, 500)].filter(Boolean).join('. ');
    }

    if (!text) return new Response(JSON.stringify({ error: 'No text to embed' }), { status: 400 });

    const embedding = await getEmbedding(text);
    if (!embedding) {
      return new Response(JSON.stringify({ error: 'Embedding generation failed' }), { status: 500 });
    }

    const table =
      type === 'spot' ? 'user_food_spots'
      : type === 'recommendation' ? 'community_recommendations'
      : 'food_blogs';
    const ok = await dbPatch(table, id, { embedding: embedding });

    if (!ok) {
      return new Response(JSON.stringify({ error: 'Failed to save embedding' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('embed handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
