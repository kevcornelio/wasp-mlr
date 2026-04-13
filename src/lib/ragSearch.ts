import { getAnonSupabaseClient } from './anonSupabase';
import { supabase } from '@/integrations/supabase/client';

/**
 * RAG Search - Retrieves community recommendations similar to user query
 * Uses keyword matching and tag-based retrieval
 */

interface RetrievedRecommendation {
  restaurant_name: string;
  cuisine_type: string | null;
  price_range: string | null;
  location: string | null;
  notes: string | null;
  rating: number;
  tags: string[] | null;
  helpful_count: number;
}

/**
 * Extract keywords from user message for RAG search
 * Looks for cuisine types, moods, occasions, dietary preferences
 */
export function extractKeywords(userMessage: string): {
  cuisineTerms: string[];
  moodTerms: string[];
  dietaryTerms: string[];
  locationTerms: string[];
} {
  const lowerMsg = userMessage.toLowerCase();

  // Cuisine keywords
  const cuisineMap: Record<string, string[]> = {
    mangalorean: ['mangalorean', 'mangalore cuisine', 'coastal'],
    seafood: ['seafood', 'fish', 'crab', 'shrimp', 'prawn'],
    vegetarian: ['vegetarian', 'veg', 'vegetable'],
    vegan: ['vegan', 'plant-based'],
    chinese: ['chinese', 'chow', 'noodles'],
    'north indian': ['north indian', 'north india', 'punjabi', 'tandoor', 'biryani'],
    'south indian': ['south indian', 'idli', 'dosa', 'filter coffee'],
    desserts: ['dessert', 'sweet', 'cake', 'brownie', 'pastry'],
    bakery: ['bakery', 'bread', 'croissant'],
    cafe: ['cafe', 'coffee', 'espresso', 'latte'],
    'street food': ['street food', 'chaat', 'pani puri', 'samosa']
  };

  // Mood/Occasion keywords
  const moodMap: Record<string, string[]> = {
    'date-night': ['date night', 'romantic', 'intimate', 'candlelight'],
    'family-friendly': ['family', 'kids', 'children'],
    casual: ['casual', 'chill', 'relaxed', 'laid back'],
    solo: ['solo', 'alone', 'by myself'],
    business: ['business', 'meeting', 'professional', 'corporate'],
    lively: ['lively', 'party', 'fun', 'vibrant', 'loud'],
    quiet: ['quiet', 'peaceful', 'serene']
  };

  // Dietary preferences
  const dietaryMap: Record<string, string[]> = {
    spicy: ['spicy', 'spice', 'hot', 'chilly'],
    healthy: ['healthy', 'salad', 'fit', 'light', 'diet'],
    vegetarian: ['vegetarian', 'veg', 'no meat'],
    'no-onion': ['no onion', 'jain', 'onion-free']
  };

  // Location keywords (Mangalore areas)
  const locationMap: Record<string, string[]> = {
    balmatta: ['balmatta', 'balta'],
    kankanady: ['kankanady', 'kankan'],
    bearys: ['bearys', 'beary'],
    'falnir road': ['falnir', 'falnir road'],
    'downtown': ['downtown', 'central']
  };

  const cuisineTerms: string[] = [];
  const moodTerms: string[] = [];
  const dietaryTerms: string[] = [];
  const locationTerms: string[] = [];

  // Match cuisine
  Object.entries(cuisineMap).forEach(([cuisine, keywords]) => {
    if (keywords.some(kw => lowerMsg.includes(kw))) {
      cuisineTerms.push(cuisine);
    }
  });

  // Match mood
  Object.entries(moodMap).forEach(([mood, keywords]) => {
    if (keywords.some(kw => lowerMsg.includes(kw))) {
      moodTerms.push(mood);
    }
  });

  // Match dietary
  Object.entries(dietaryMap).forEach(([dietary, keywords]) => {
    if (keywords.some(kw => lowerMsg.includes(kw))) {
      dietaryTerms.push(dietary);
    }
  });

  // Match location
  Object.entries(locationMap).forEach(([location, keywords]) => {
    if (keywords.some(kw => lowerMsg.includes(kw))) {
      locationTerms.push(location);
    }
  });

  return { cuisineTerms, moodTerms, dietaryTerms, locationTerms };
}

/**
 * Retrieve community recommendations based on keywords
 * Uses Supabase full-text search and tag matching
 */
export async function retrieveRecommendations(
  userMessage: string,
  limit: number = 5
): Promise<RetrievedRecommendation[]> {
  try {
    // Get auth client (works for both authenticated and anonymous users)
    const { data: { user } } = await supabase.auth.getUser();
    const db = user ? supabase : getAnonSupabaseClient();

    // Extract keywords
    const { cuisineTerms, moodTerms, dietaryTerms, locationTerms } = extractKeywords(userMessage);

    // Combine all extracted terms as tags for search
    const searchTags = [...cuisineTerms, ...moodTerms, ...dietaryTerms];

    // Build query
    let query = db
      .from('community_recommendations')
      .select('restaurant_name, cuisine_type, price_range, location, notes, rating, tags, helpful_count')
      .order('helpful_count', { ascending: false })
      .order('rating', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by cuisine if terms found
    if (cuisineTerms.length > 0) {
      query = query.or(
        cuisineTerms.map(c => `cuisine_type.eq.${c}`).join(',')
      );
    }

    // Filter by tags if mood/dietary terms found
    if (searchTags.length > 0) {
      // PostgreSQL @> operator checks if array contains all elements
      query = query.contains('tags', searchTags);
    }

    const { data, error } = await query;

    if (error) {
      console.error('RAG retrieval error:', error);
      return [];
    }

    // Ensure tags are arrays
    const recommendations = (data || []).map(rec => ({
      ...rec,
      tags: Array.isArray(rec.tags) ? rec.tags : []
    }));

    return recommendations as RetrievedRecommendation[];
  } catch (err) {
    console.error('RAG search error:', err);
    return [];
  }
}

/**
 * Format recommendations as RAG context for Claude's system prompt
 */
export function formatRecommendationsContext(recommendations: RetrievedRecommendation[]): string {
  if (recommendations.length === 0) {
    return '';
  }

  const formattedRecs = recommendations
    .map(rec => {
      const parts = [rec.restaurant_name];
      if (rec.cuisine_type) parts.push(rec.cuisine_type);
      if (rec.location) parts.push(`Loc: ${rec.location}`);
      if (rec.notes) parts.push(`"${rec.notes}"`);
      const ratingStr = rec.rating ? `★${rec.rating}` : '';
      const helpfulStr = rec.helpful_count > 0 ? `(+${rec.helpful_count})` : '';
      return `• ${parts.join(', ')} ${ratingStr} ${helpfulStr}`.trim();
    })
    .join('\n');

  return `\nCommunity Recommendations (from other users):\n${formattedRecs}`;
}

/**
 * Main RAG retrieval function - get and format recommendations
 */
export async function getRagContext(userMessage: string): Promise<string> {
  const recommendations = await retrieveRecommendations(userMessage, 5);
  return formatRecommendationsContext(recommendations);
}
