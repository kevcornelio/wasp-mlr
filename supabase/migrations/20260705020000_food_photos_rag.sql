-- Make food photo captions searchable by the chat RAG, same pipeline as
-- blogs/spots: pgvector embeddings + a SECURITY DEFINER match function.

ALTER TABLE public.food_photos ADD COLUMN IF NOT EXISTS embedding vector(1024);

CREATE INDEX IF NOT EXISTS idx_food_photos_embedding
  ON public.food_photos
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.match_food_photos(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.2,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  caption text,
  uploader_name text,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.caption,
    f.uploader_name,
    (1 - (f.embedding <=> query_embedding))::float AS similarity
  FROM public.food_photos f
  WHERE f.embedding IS NOT NULL
    AND f.caption IS NOT NULL
    AND (1 - (f.embedding <=> query_embedding)) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_food_photos TO anon, authenticated;
