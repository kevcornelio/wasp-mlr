export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Diagnostic endpoint — reports config + tests the RAG pipeline end to end.
// Visit /api/debug?q=spicy+seafood to test a query.
export default async function handler(req: Request) {
  const out: Record<string, unknown> = {};
  const url = new URL(req.url);
  const query = url.searchParams.get('q') || 'spicy seafood for dinner';
  const threshold = parseFloat(url.searchParams.get('t') || '0');

  // 1. Which env vars are present (booleans only, no secrets leaked)
  out.env = {
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_KEY,
    VOYAGE_API_KEY: !!VOYAGE_API_KEY,
    ANTHROPIC_API_KEY: !!ANTHROPIC_API_KEY,
  };

  // 2. Count rows + embedded rows in user_food_spots
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const total = await fetch(
        `${SUPABASE_URL}/rest/v1/user_food_spots?select=id`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' } }
      );
      out.foodSpotsTotal = total.headers.get('content-range');

      const embedded = await fetch(
        `${SUPABASE_URL}/rest/v1/user_food_spots?select=id&embedding=not.is.null`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' } }
      );
      out.foodSpotsEmbedded = embedded.headers.get('content-range');
    } catch (e) {
      out.dbError = String(e);
    }
  }

  // 3. Test Voyage embedding
  let embedding: number[] | null = null;
  if (VOYAGE_API_KEY) {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'voyage-3', input: [query], input_type: 'query' }),
      });
      out.voyageStatus = res.status;
      if (res.ok) {
        const data = await res.json();
        embedding = data.data[0].embedding;
        out.embeddingDims = embedding?.length;
      } else {
        out.voyageError = await res.text();
      }
    } catch (e) {
      out.voyageError = String(e);
    }
  }

  // 4. Test the match_food_spots RPC
  if (embedding && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_food_spots`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_embedding: embedding, match_threshold: threshold, match_count: 8 }),
      });
      out.rpcStatus = res.status;
      if (res.ok) {
        const matches = await res.json();
        out.matchCount = Array.isArray(matches) ? matches.length : 0;
        out.matches = Array.isArray(matches)
          ? matches.map((m: any) => ({ name: m.restaurant_name, similarity: m.similarity }))
          : matches;
      } else {
        out.rpcError = await res.text();
      }
    } catch (e) {
      out.rpcError = String(e);
    }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
