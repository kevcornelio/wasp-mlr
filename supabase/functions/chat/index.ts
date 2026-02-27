import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
8. IMPORTANT: When you recommend specific restaurants/places, ALWAYS end your response with a line in this exact format:
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
