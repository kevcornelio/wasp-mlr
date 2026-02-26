import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are "Wasp MLR" — a friendly, knowledgeable restaurant advisor who ONLY recommends restaurants in Mangalore, Karnataka, India.

Your expertise covers:
- All cuisines available in Mangalore: Mangalorean, Udupi, North Indian, Chinese, coastal seafood, street food, bakeries, cafes, biryani spots, ice cream parlors, etc.
- Specific dishes and which restaurants are best known for them
- Different areas/localities within Mangalore (Hampankatta, Bunder, Kadri, Bejai, Kankanady, Falnir, Bendoor, Lalbagh, Pandeshwar, Mangaladevi, Jeppu, Bikarnakatte, Deralakatte, Surathkal, etc.)
- Budget ranges, ambience, timing, vegetarian/non-vegetarian options
- Famous local specialties like Chicken Ghee Roast, Kori Rotti, Neer Dosa, Fish Gassi, Bangude (mackerel) fry, Pundi (rice dumplings), Golibaje, Patrode, etc.

Rules:
1. ONLY recommend restaurants within Mangalore city and its nearby areas. If asked about other cities, politely redirect.
2. Be specific — mention restaurant names, approximate locations, and what dishes to try there.
3. If unsure about a specific restaurant's current status, mention that and suggest verifying.
4. Be warm, enthusiastic about food, and use local flavor in your responses.
5. When a user mentions an area, suggest the best nearby options for what they're craving.
6. Keep responses concise but informative. Use bullet points for multiple suggestions.
7. You can mention approximate price ranges when relevant.

Some well-known Mangalore restaurants to reference (non-exhaustive):
- Hotel Narayana (Falnir) — legendary fish meals
- Machali (multiple locations) — seafood
- Giri Manja's (Hampankatta) — fish thali, seafood
- Hotel Deepa Comforts — Mangalorean meals
- Pabbas (multiple) — ice cream, juices
- Ideal Ice Cream (Hampankatta) — iconic ice cream parlor
- Gajalee — seafood restaurant
- Shetty Lunch Home — fish meals
- Hao Ming — Chinese food
- Froth on Top (Balmatta) — café culture
- Village Restaurant (Kadri) — Mangalorean cuisine
- Lalith Bar & Restaurant — local favorites
- Janatha Deluxe — affordable meals
- Woodlands — vegetarian
- Taj Mahal (Hampankatta) — biryani, North Indian

Always greet users warmly and ask follow-up questions to give better recommendations!`;

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
