export const config = { runtime: 'edge' };

/**
 * RAG Retrieval - Query Supabase for community recommendations
 */
async function getCommunitRecommendations(userMessage: string): Promise<string> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials not configured for RAG');
      return '';
    }

    // Extract simple cuisine/mood keywords from message
    const lowerMsg = userMessage.toLowerCase();
    const cuisineKeywords = [
      'seafood', 'fish', 'vegetarian', 'vegan', 'chinese', 'north indian',
      'spicy', 'healthy', 'mangalorean', 'casual', 'date'
    ];

    const matchedKeywords = cuisineKeywords
      .filter(kw => lowerMsg.includes(kw))
      .slice(0, 3);

    // Query Supabase REST API for matching recommendations
    const query = new URLSearchParams({
      select: 'restaurant_name,cuisine_type,price_range,location,notes,rating,tags,helpful_count',
      order: 'helpful_count.desc,rating.desc,created_at.desc',
      limit: '5'
    });

    // Add tag filter if keywords found
    if (matchedKeywords.length > 0) {
      query.append('tags', `cs.{"${matchedKeywords[0]}"}`);
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/community_recommendations?${query.toString()}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.warn('RAG query failed:', response.status);
      return '';
    }

    const recommendations = await response.json() as Array<{
      restaurant_name: string;
      cuisine_type?: string;
      location?: string;
      notes?: string;
      rating?: number;
      helpful_count?: number;
    }>;

    if (!recommendations.length) {
      return '';
    }

    // Format recommendations as context
    const formattedRecs = recommendations
      .map(rec => {
        const parts = [rec.restaurant_name];
        if (rec.cuisine_type) parts.push(rec.cuisine_type);
        if (rec.location) parts.push(`Loc: ${rec.location}`);
        const rating = rec.rating ? `★${rec.rating}` : '';
        return `• ${parts.join(', ')} ${rating}`.trim();
      })
      .join('\n');

    return `\n\n📍 Community Recommendations:\n${formattedRecs}`;
  } catch (err) {
    console.error('RAG retrieval error:', err);
    return '';
  }
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
8. IMPORTANT: When you recommend specific restaurants/places, format each restaurant name as a Google Maps link using this markdown format:
   [Restaurant Name](https://www.google.com/maps/search/?q=Restaurant+Name+Mangalore)
   Replace spaces in the URL with + signs. Example: [Pabbas](https://www.google.com/maps/search/?q=Pabbas+Mangalore)
9. IMPORTANT: Always end your response with a line in this exact format:
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

    // Retrieve relevant community recommendations
    const ragContext = await getCommunitRecommendations(lastUserMessage);
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
