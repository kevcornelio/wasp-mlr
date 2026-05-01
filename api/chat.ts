export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Keywords to extract from user messages for RAG matching
const CUISINE_KEYWORDS = [
  'seafood', 'fish', 'vegetarian', 'vegan', 'chinese', 'north indian', 'south indian',
  'spicy', 'healthy', 'mangalorean', 'udupi', 'biryani', 'chicken', 'mutton',
  'prawn', 'crab', 'thali', 'dosa', 'idli', 'roti', 'rice', 'noodles', 'pizza',
  'burger', 'sandwich', 'ice cream', 'dessert', 'sweet', 'snack', 'breakfast',
  'lunch', 'dinner', 'coffee', 'cafe', 'juice', 'bakery',
];
const LOCATION_KEYWORDS = [
  'hampankatta', 'bunder', 'kadri', 'bejai', 'kankanady', 'falnir', 'bendoor',
  'lalbagh', 'pandeshwar', 'jeppu', 'surathkal', 'deralakatte', 'bikarnakatte',
  'attavar', 'valencia', 'kuloor', 'bondel', 'kottara',
];
const MOOD_KEYWORDS = [
  'date', 'romantic', 'family', 'friends', 'solo', 'budget', 'cheap', 'affordable',
  'expensive', 'fancy', 'casual', 'quick', 'late night', 'outdoor', 'cozy',
];

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
    if (!res.ok) {
      console.warn('RAG db query failed:', res.status, path);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('RAG db error:', err);
    return null;
  }
}

async function getRagContext(userMessage: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('RAG: Supabase credentials not set');
    return '';
  }

  const lower = userMessage.toLowerCase();

  const matchedCuisine = CUISINE_KEYWORDS.filter(kw => lower.includes(kw));
  const matchedLocation = LOCATION_KEYWORDS.filter(kw => lower.includes(kw));
  const matchedMood = MOOD_KEYWORDS.filter(kw => lower.includes(kw));
  const allMatched = [...matchedCuisine, ...matchedLocation, ...matchedMood];
  const primaryKeyword = allMatched[0] || '';

  const contextParts: string[] = [];

  // ── 1. Community Recommendations ─────────────────────────────────────────
  // Top-rated spots saved by users, filtered by keyword tag if available
  let recPath = `community_recommendations?select=restaurant_name,cuisine_type,location,notes,rating&order=rating.desc,created_at.desc&limit=4`;
  if (primaryKeyword) {
    recPath += `&or=(restaurant_name.ilike.*${encodeURIComponent(primaryKeyword)}*,notes.ilike.*${encodeURIComponent(primaryKeyword)}*)`;
  }
  const recs = await dbGet(recPath);
  if (recs?.length) {
    const lines = recs.map(r =>
      `• ${r.restaurant_name}${r.cuisine_type ? ` (${r.cuisine_type})` : ''}${r.location ? ` — ${r.location}` : ''}${r.rating ? ` ★${r.rating}` : ''}${r.notes ? ` · "${r.notes}"` : ''}`
    ).join('\n');
    contextParts.push(`📍 Community Picks:\n${lines}`);
  }

  // ── 2. Approved Blog Posts ────────────────────────────────────────────────
  // Real food stories written by users — surface relevant ones by keyword
  if (allMatched.length > 0) {
    const blogKeyword = encodeURIComponent(primaryKeyword);
    const blogPath = `blog_posts?select=title,content,restaurant_name,author_name&status=eq.approved&or=(title.ilike.*${blogKeyword}*,content.ilike.*${blogKeyword}*,restaurant_name.ilike.*${blogKeyword}*)&order=created_at.desc&limit=2`;
    const blogs = await dbGet(blogPath);
    if (blogs?.length) {
      const lines = blogs.map(b => {
        const excerpt = (b.content as string).replace(/\n/g, ' ').slice(0, 200) + '…';
        return `• "${b.title}"${b.restaurant_name ? ` (${b.restaurant_name})` : ''} by ${b.author_name}: ${excerpt}`;
      }).join('\n');
      contextParts.push(`📝 Food Stories from the Community:\n${lines}`);
    }
  }

  // ── 3. User Feedback & Ratings ────────────────────────────────────────────
  // Actual user reviews from past chat sessions — prefer comments with 4–5 stars
  let feedbackPath = `chat_feedback?select=place_name,rating,comment&rating=gte.4&order=rating.desc,created_at.desc&limit=4`;
  if (primaryKeyword) {
    feedbackPath = `chat_feedback?select=place_name,rating,comment&rating=gte.4&place_name=ilike.*${encodeURIComponent(primaryKeyword)}*&order=rating.desc&limit=4`;
  }
  const feedback = await dbGet(feedbackPath);
  const feedbackWithComments = (feedback || []).filter((f: any) => f.comment);
  if (feedbackWithComments.length > 0) {
    const lines = feedbackWithComments.map((f: any) =>
      `• ${f.place_name} ★${f.rating} — "${f.comment}"`
    ).join('\n');
    contextParts.push(`💬 Real User Reviews:\n${lines}`);
  }

  if (contextParts.length === 0) return '';

  return `\n\n━━━ Live Community Data ━━━\n${contextParts.join('\n\n')}\n━━━ End Community Data ━━━\n\nUse the above real community data to enhance your recommendations. Prioritise places and dishes mentioned there — they are real, recent, user-verified picks from Mangalore locals.`;
}

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
8. When Live Community Data is provided above, ALWAYS incorporate it — mention those places by name and reference user ratings or blog insights naturally in your response.
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

    // Get last user message for RAG retrieval
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m: any) => m.role === 'user')?.content || '';

    // Retrieve context from all community data sources in parallel
    const ragContext = await getRagContext(lastUserMessage);
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
