-- Create food_blogs table for user-submitted food blog posts
CREATE TABLE IF NOT EXISTS public.food_blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  restaurant_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_food_blogs_status ON public.food_blogs(status);
CREATE INDEX idx_food_blogs_created_at ON public.food_blogs(created_at DESC);
CREATE INDEX idx_food_blogs_user_id ON public.food_blogs(user_id);

-- Enable RLS
ALTER TABLE public.food_blogs ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved blogs
CREATE POLICY "Approved blogs are public"
  ON public.food_blogs FOR SELECT
  USING (status = 'approved');

-- Authenticated users can insert their own blogs
CREATE POLICY "Users can submit blogs"
  ON public.food_blogs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending blogs
CREATE POLICY "Users can update their own pending blogs"
  ON public.food_blogs FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_food_blogs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER food_blogs_updated_at_trigger
BEFORE UPDATE ON public.food_blogs
FOR EACH ROW
EXECUTE FUNCTION public.update_food_blogs_updated_at();
