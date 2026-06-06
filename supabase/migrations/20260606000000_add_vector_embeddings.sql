-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns (Voyage AI voyage-3 produces 1024-dim vectors)
ALTER TABLE public.community_recommendations
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

ALTER TABLE public.food_blogs
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW index for fast approximate nearest-neighbor search on recommendations
CREATE INDEX IF NOT EXISTS idx_community_recommendations_embedding
  ON public.community_recommendations
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW index for food_blogs
CREATE INDEX IF NOT EXISTS idx_food_blogs_embedding
  ON public.food_blogs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Semantic similarity search for community recommendations
CREATE OR REPLACE FUNCTION public.match_recommendations(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.45,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  restaurant_name text,
  cuisine_type text,
  price_range text,
  location text,
  notes text,
  rating smallint,
  tags text[],
  helpful_count integer,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id,
    cr.restaurant_name,
    cr.cuisine_type,
    cr.price_range,
    cr.location,
    cr.notes,
    cr.rating,
    cr.tags,
    cr.helpful_count,
    (1 - (cr.embedding <=> query_embedding))::float AS similarity
  FROM public.community_recommendations cr
  WHERE cr.embedding IS NOT NULL
    AND (1 - (cr.embedding <=> query_embedding)) > match_threshold
  ORDER BY cr.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Semantic similarity search for food blogs
CREATE OR REPLACE FUNCTION public.match_food_blogs(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.45,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  title text,
  body text,
  restaurant_name text,
  author_name text,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fb.id,
    fb.title,
    fb.body,
    fb.restaurant_name,
    fb.author_name,
    (1 - (fb.embedding <=> query_embedding))::float AS similarity
  FROM public.food_blogs fb
  WHERE fb.embedding IS NOT NULL
    AND fb.status = 'approved'
    AND (1 - (fb.embedding <=> query_embedding)) > match_threshold
  ORDER BY fb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to anon and authenticated roles (RLS on underlying tables still applies)
GRANT EXECUTE ON FUNCTION public.match_recommendations TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_food_blogs TO anon, authenticated;
