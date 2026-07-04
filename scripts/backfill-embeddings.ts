/**
 * One-time script to generate Voyage AI embeddings for all existing
 * community_recommendations and food_blogs that don't have them yet.
 *
 * Usage:
 *   VOYAGE_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/backfill-embeddings.ts
 */

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!VOYAGE_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required env vars: VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-3', input: texts, input_type: 'document' }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

async function fetchAll(table: string, select: string, filter?: string): Promise<any[]> {
  const params = new URLSearchParams({ select, ...(filter ? { [filter.split('=')[0]]: filter.split('=')[1] } : {}) });
  let url = `${SUPABASE_URL}/rest/v1/${table}?${params}&order=created_at.asc&limit=1000`;
  if (filter) url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&${filter}&order=created_at.asc&limit=1000`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Fetch error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateEmbedding(table: string, id: string, embedding: number[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ embedding: embedding }),
  });
  if (!res.ok) throw new Error(`Update error: ${res.status} ${await res.text()}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function processInBatches(
  items: any[],
  buildText: (item: any) => string,
  table: string,
  batchSize = 8
) {
  let done = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const texts = batch.map(buildText);
    try {
      const embeddings = await getEmbeddings(texts);
      for (let j = 0; j < batch.length; j++) {
        await updateEmbedding(table, batch[j].id, embeddings[j]);
        done++;
      }
      console.log(`  ${done}/${items.length} done`);
    } catch (err) {
      console.error(`  Batch error at ${i}:`, err);
    }
    // Respect Voyage AI rate limits (gentle 300ms pause between batches)
    if (i + batchSize < items.length) await sleep(300);
  }
}

async function main() {
  // ── user_food_spots (primary user-contributed source) ───────────────────────
  console.log('\n── user_food_spots ──');
  const spots = await fetchAll(
    'user_food_spots',
    'id,restaurant_name,location,dishes,notes',
    'embedding=is.null'
  );
  console.log(`Found ${spots.length} without embeddings`);

  if (spots.length > 0) {
    await processInBatches(spots, (s) => {
      return [
        s.restaurant_name,
        s.location ? `in ${s.location}` : null,
        Array.isArray(s.dishes) && s.dishes.length ? `Dishes: ${s.dishes.join(', ')}` : null,
        s.notes,
      ].filter(Boolean).join('. ');
    }, 'user_food_spots');
  }

  // ── community_recommendations (secondary source) ────────────────────────────
  console.log('\n── community_recommendations ──');
  const recs = await fetchAll(
    'community_recommendations',
    'id,restaurant_name,cuisine_type,location,notes,tags,price_range',
    'embedding=is.null'
  );
  console.log(`Found ${recs.length} without embeddings`);

  if (recs.length > 0) {
    await processInBatches(recs, (r) => {
      return [
        r.restaurant_name,
        r.cuisine_type,
        r.location ? `in ${r.location}` : null,
        r.notes,
        Array.isArray(r.tags) ? r.tags.join(', ') : r.tags,
        r.price_range,
      ].filter(Boolean).join('. ');
    }, 'community_recommendations');
  }

  // ── blog_posts ──────────────────────────────────────────────────────────────
  console.log('\n── blog_posts ──');
  const blogs = await fetchAll(
    'blog_posts',
    'id,title,content,restaurant_name',
    'embedding=is.null'
  );
  console.log(`Found ${blogs.length} without embeddings`);

  if (blogs.length > 0) {
    await processInBatches(blogs, (b) => {
      return [b.title, b.restaurant_name, b.content?.slice(0, 2000)].filter(Boolean).join('. ');
    }, 'blog_posts');
  }

  console.log('\nBackfill complete.');
}

main().catch((err) => { console.error(err); process.exit(1); });
