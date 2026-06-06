-- Enable pgvector extension (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to user_food_spots (Voyage AI voyage-3 = 1024 dims)
ALTER TABLE public.user_food_spots
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_user_food_spots_embedding
  ON public.user_food_spots
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Semantic similarity search for community food spots
CREATE OR REPLACE FUNCTION public.match_food_spots(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  restaurant_name text,
  location text,
  dishes text[],
  notes text,
  rating smallint,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.restaurant_name,
    s.location,
    s.dishes,
    s.notes,
    s.rating,
    (1 - (s.embedding <=> query_embedding))::float AS similarity
  FROM public.user_food_spots s
  WHERE s.embedding IS NOT NULL
    AND (1 - (s.embedding <=> query_embedding)) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_food_spots TO anon, authenticated;
