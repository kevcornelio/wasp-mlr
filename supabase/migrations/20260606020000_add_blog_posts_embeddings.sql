-- Enable pgvector extension (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to blog_posts (Voyage AI voyage-3 = 1024 dims)
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_blog_posts_embedding
  ON public.blog_posts
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Semantic similarity search for approved blog posts
CREATE OR REPLACE FUNCTION public.match_blog_posts(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.25,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  restaurant_name text,
  author_name text,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.title,
    b.content,
    b.restaurant_name,
    b.author_name,
    (1 - (b.embedding <=> query_embedding))::float AS similarity
  FROM public.blog_posts b
  WHERE b.embedding IS NOT NULL
    AND b.status = 'approved'
    AND (1 - (b.embedding <=> query_embedding)) > match_threshold
  ORDER BY b.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_blog_posts TO anon, authenticated;
