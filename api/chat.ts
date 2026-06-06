export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

// ── Voyage AI embedding ──────────────────────────────────────────────────────

async function getQueryEmbedding(text: string): Promise<number[] | null> {
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
        input_type: 'query',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data[0].embedding;
  } catch {
    return null;
  }
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function dbGet<T = any>(path: string): Promise<T[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function rpc<T = any>(fnName: string, params: Record<string, unknown>): Promise<T[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── RAG context builder ──────────────────────────────────────────────────────

async function getRagContext(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return '';

  // Build query text from last 3 user turns for richer context
  const queryText = messages
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .join(' ')
    .trim();

  if (!queryText) return '';

  const contextParts: string[] = [];

  // ── 1. Semantic search via pgvector (preferred) ─────────────────────────────
  const embedding = await getQueryEmbedding(queryText);

  if (embedding) {
    // Community food spots (primary user-contributed source) — semantic similarity
    const semSpots = await rpc<{
      restaurant_name: string;
      location: string | null;
      dishes: string[] | null;
      notes: string | null;
      rating: number;
      similarity: number;
    }>('match_food_spots', {
      query_embedding: embedding,
      match_threshold: 0.25,
      match_count: 8,
    });

    if (semSpots?.length) {
      const lines = semSpots.map(s =>
        `• ${s.restaurant_name}${s.location ? ` — ${s.location}` : ''}${s.rating ? ` ★${s.rating}` : ''}${s.dishes?.length ? ` · Try: ${s.dishes.join(', ')}` : ''}${s.notes ? ` · "${s.notes}"` : ''}`
      ).join('\n');
      contextParts.push(`📍 Community Food Spots:\n${lines}`);
    }

    // Community recommendations (secondary source) — semantic similarity
    const semRecs = await rpc<{
      restaurant_name: string;
      cuisine_type: string | null;
      location: string | null;
      notes: string | null;
      rating: number;
      tags: string[] | null;
      helpful_count: number;
      similarity: number;
    }>('match_recommendations', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 4,
    });

    if (semRecs?.length) {
      const lines = semRecs.map(r =>
        `• ${r.restaurant_name}${r.cuisine_type ? ` (${r.cuisine_type})` : ''}${r.location ? ` — ${r.location}` : ''}${r.rating ? ` ★${r.rating}` : ''}${r.notes ? ` · "${r.notes}"` : ''}${r.tags?.length ? ` [${r.tags.join(', ')}]` : ''}`
      ).join('\n');
      contextParts.push(`📍 Community Picks:\n${lines}`);
    }

    // Approved food blogs — semantic similarity
    const semBlogs = await rpc<{
      title: string;
      content: string;
      restaurant_name: string | null;
      author_name: string;
      similarity: number;
    }>('match_blog_posts', {
      query_embedding: embedding,
      match_threshold: 0.15,
      match_count: 2,
    });

    if (semBlogs?.length) {
      const lines = semBlogs.map(b => {
        const excerpt = b.content.replace(/\n/g, ' ').slice(0, 220) + '…';
        return `• "${b.title}"${b.restaurant_name ? ` (${b.restaurant_name})` : ''} by ${b.author_name}: ${excerpt}`;
      }).join('\n');
      contextParts.push(`📝 Food Stories:\n${lines}`);
    }
  }

  // ── 2. Fallback: keyword search if no embeddings available yet ────────────
  if (contextParts.length === 0) {
    const lower = queryText.toLowerCase();
    const KEYWORDS = [
      'seafood', 'fish', 'vegetarian', 'vegan', 'chinese', 'north indian', 'south indian',
      'spicy', 'healthy', 'mangalorean', 'udupi', 'biryani', 'chicken', 'mutton',
      'prawn', 'crab', 'thali', 'dosa', 'idli', 'dessert', 'coffee', 'cafe',
      'hampankatta', 'bunder', 'kadri', 'bejai', 'kankanady', 'falnir', 'bendoor',
      'lalbagh', 'pandeshwar', 'jeppu', 'deralakatte', 'surathkal',
      'date', 'romantic', 'family', 'budget', 'casual', 'late night',
    ];
    const matched = KEYWORDS.filter(kw => lower.includes(kw));
    const kw = matched[0] || '';

    let spotPath = `user_food_spots?select=restaurant_name,location,dishes,notes,rating&order=rating.desc,created_at.desc&limit=6`;
    if (kw) {
      spotPath += `&or=(restaurant_name.ilike.*${encodeURIComponent(kw)}*,notes.ilike.*${encodeURIComponent(kw)}*,location.ilike.*${encodeURIComponent(kw)}*)`;
    }
    const spots = await dbGet(spotPath);
    if (spots?.length) {
      const lines = spots.map((s: any) =>
        `• ${s.restaurant_name}${s.location ? ` — ${s.location}` : ''}${s.rating ? ` ★${s.rating}` : ''}${Array.isArray(s.dishes) && s.dishes.length ? ` · Try: ${s.dishes.join(', ')}` : ''}${s.notes ? ` · "${s.notes}"` : ''}`
      ).join('\n');
      contextParts.push(`📍 Community Food Spots:\n${lines}`);
    }
  }

  // ── 3. High-rated user feedback (always included) ───────────────────────
  const feedback = await dbGet(
    `chat_feedback?select=place_name,rating,comment&rating=gte.4&comment=not.is.null&order=rating.desc,created_at.desc&limit=4`
  );
  if (feedback?.length) {
    const lines = feedback.map((f: any) =>
      `• ${f.place_name} ★${f.rating} — "${f.comment}"`
    ).join('\n');
    contextParts.push(`💬 Real User Reviews:\n${lines}`);
  }

  if (contextParts.length === 0) return '';

  return `\n\n━━━ Live Community Data ━━━\n${contextParts.join('\n\n')}\n━━━ End Community Data ━━━\n\nUse the above real community data to enhance your recommendations. Prioritise places and dishes mentioned there — they are real, recent, user-verified picks from Mangalore locals.`;
}

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "Wasp MLR" — a warm, food-obsessed advisor for Mangalore, Karnataka, India.

Your PRIMARY focus is THE FOOD — the dishes, flavors, and cravings. Restaurants are secondary; you recommend them as the best places to satisfy a specific food craving.

You understand context deeply. When a user shares:
- **Mood** (stressed, celebratory, lazy, adventurous, nostalgic, romantic) → suggest comfort food, festive dishes, street food, etc.
- **Company** (solo, date, family, friends, colleagues) → tailor ambience and portion style
- **Time of day** (breakfast, lunch, evening snack, late night) → match what's available and appropriate
- **Occasion** (birthday, casual hangout, first date, office treat, rainy day) → set the right vibe
- **Craving type** (spicy, sweet, fried, healthy, seafood, vegetarian) → zero in on dishes

Your expertise:
- Mangalorean, Udupi, North Indian, Chinese, coastal seafood, street food, bakeries, cafes, biryani, ice cream, and more
- Iconic dishes: Chicken Ghee Roast, Kori Rotti, Neer Dosa, Fish Gassi, Bangude fry, Pundi, Golibaje, Patrode, Mangalore Buns, Kadubu, etc.
- Localities: Hampankatta, Bunder, Kadri, Bejai, Kankanady, Falnir, Bendoor, Lalbagh, Pandeshwar, Jeppu, Bikarnakatte, Deralakatte, Surathkal, etc.

Rules:
1. ONLY Mangalore city and nearby areas. Politely redirect if asked about other cities.
2. Lead with the FOOD — describe the dish, why it fits their mood/situation, then recommend where to get it.
3. Be specific — dish names, restaurant names, approximate locations, price hints.
4. If unsure about a restaurant's current status, say so and suggest verifying.
5. Be warm, enthusiastic, and use local flavor. Make the user hungry!
6. Ask follow-up questions about mood, company, timing, or cravings to give better suggestions.
7. Keep responses concise. Use bullet points for multiple suggestions.
8. When Live Community Data is provided above, ALWAYS incorporate it — mention those places by name and reference user ratings naturally in your response.
8a. When "📝 Food Stories" are present, you MUST weave in at least one explicitly — cite the author and what they said, e.g. "Kevin Cornelio raves about Cherry Square in his food story…" or "As Dagny Pinto wrote about the seafood spots…". These are real blogs from local foodies; surfacing them makes recommendations feel trusted and personal. Prioritise places mentioned in the Food Stories.
9. IMPORTANT: When you recommend specific restaurants/places, format each restaurant name as a Google Maps link using this markdown format:
   [Restaurant Name](https://www.google.com/maps/search/?q=Restaurant+Name+Mangalore)
   Replace spaces in the URL with + signs. Example: [Pabbas](https://www.google.com/maps/search/?q=Pabbas+Mangalore)
10. IMPORTANT: Always end your response with a line in this exact format:
   [PLACES: Place Name 1, Place Name 2, Place Name 3]
   Only include actual restaurant/cafe/establishment names, NOT dish names. This line will be hidden from the user.

Well-known spots (non-exhaustive):
- Hotel Narayana (Falnir) — fish meals
- Machali — seafood
- Giri Manja's (Hampankatta) — fish thali
- Hotel Deepa Comforts — Mangalorean meals
- Pabbas — ice cream, juices
- Ideal Ice Cream (Hampankatta) — iconic
- Gajalee — seafood
- Shetty Lunch Home — fish meals
- Hao Ming — Chinese
- Froth on Top (Balmatta) — café
- Village Restaurant (Kadri) — Mangalorean
- Lalith Bar & Restaurant — local favorites
- Janatha Deluxe — affordable meals
- Woodlands — vegetarian
- Taj Mahal (Hampankatta) — biryani, North Indian

Always greet warmly and probe for context (mood, who they're with, what they're feeling) to nail the perfect recommendation!`;

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
      },
    });
  }

  try {
    const { messages } = await req.json();
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');

    const ragContext = await getRagContext(messages);

    const enhancedSystemPrompt = SYSTEM_PROMPT + ragContext;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: enhancedSystemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again shortly.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('Anthropic API error:', response.status, t);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('chat error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
