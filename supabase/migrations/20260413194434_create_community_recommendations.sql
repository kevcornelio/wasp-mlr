-- Create community_recommendations table for crowdsourced restaurant recommendations
CREATE TABLE IF NOT EXISTS public.community_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id TEXT,
  restaurant_name TEXT NOT NULL,
  cuisine_type TEXT,
  price_range TEXT CHECK (price_range IN ('budget', 'moderate', 'premium')),
  location TEXT,
  notes TEXT,
  rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for RAG retrieval and performance
CREATE INDEX idx_community_recommendations_restaurant_name
  ON public.community_recommendations(restaurant_name COLLATE "C");

CREATE INDEX idx_community_recommendations_tags
  ON public.community_recommendations USING GIN(tags);

CREATE INDEX idx_community_recommendations_cuisine_type
  ON public.community_recommendations(cuisine_type);

CREATE INDEX idx_community_recommendations_location
  ON public.community_recommendations(location);

CREATE INDEX idx_community_recommendations_rating_created
  ON public.community_recommendations(rating DESC, created_at DESC);

CREATE INDEX idx_community_recommendations_helpful_rating
  ON public.community_recommendations(helpful_count DESC, rating DESC, created_at DESC);

-- Row Level Security (RLS) Policies
ALTER TABLE public.community_recommendations ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can read community recommendations
CREATE POLICY "Community recommendations are readable by everyone"
  ON public.community_recommendations
  FOR SELECT
  USING (true);

-- Policy 2: Authenticated users can insert their own recommendations
CREATE POLICY "Users can insert their own recommendations"
  ON public.community_recommendations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Authenticated users can update their own recommendations
CREATE POLICY "Users can update their own recommendations"
  ON public.community_recommendations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Authenticated users can delete their own recommendations
CREATE POLICY "Users can delete their own recommendations"
  ON public.community_recommendations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_community_recommendations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER community_recommendations_updated_at_trigger
BEFORE UPDATE ON public.community_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.update_community_recommendations_updated_at();
