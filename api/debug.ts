export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

// Diagnostic endpoint. Visit /api/debug?q=your+query&t=0
export default async function handler(req: Request) {
  const out: Record<string, unknown> = {};
  const url = new URL(req.url);
  const query = url.searchParams.get('q') || 'best food story recommendation';
  const threshold = parseFloat(url.searchParams.get('t') || '0');

  const sbHeaders = { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` };

  // 1. Blog counts by status + embedding
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const total = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=id`, { headers: { ...sbHeaders, Prefer: 'count=exact' } });
      out.blogsTotal = total.headers.get('content-range');

      const approved = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=id&status=eq.approved`, { headers: { ...sbHeaders, Prefer: 'count=exact' } });
      out.blogsApproved = approved.headers.get('content-range');

      const embedded = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=id&embedding=not.is.null`, { headers: { ...sbHeaders, Prefer: 'count=exact' } });
      out.blogsEmbedded = embedded.headers.get('content-range');

      // Show statuses of all blogs
      const statuses = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=title,status`, { headers: sbHeaders });
      out.blogStatuses = await statuses.json();
    } catch (e) {
      out.dbError = String(e);
    }
  }

  // 2. Embed query + run match_blog_posts
  if (VOYAGE_API_KEY && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const ve = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'voyage-3', input: [query], input_type: 'query' }),
      });
      if (ve.ok) {
        const embedding = (await ve.json()).data[0].embedding;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_blog_posts`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query_embedding: embedding, match_threshold: threshold, match_count: 5 }),
        });
        out.rpcStatus = res.status;
        const body = await res.json();
        out.blogMatches = Array.isArray(body)
          ? body.map((m: any) => ({ title: m.title, similarity: m.similarity }))
          : body;
      } else {
        out.voyageError = await ve.text();
      }
    } catch (e) {
      out.rpcError = String(e);
    }
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } });
}
