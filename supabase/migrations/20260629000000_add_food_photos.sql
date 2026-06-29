-- Food photos table (auth users only can upload)
CREATE TABLE public.food_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.food_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view food photos" ON food_photos FOR SELECT USING (true);
CREATE POLICY "Auth users insert own photos" ON food_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users delete own photos" ON food_photos FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for food photos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('food-photos', 'food-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Anyone can view food photos storage" ON storage.objects FOR SELECT USING (bucket_id = 'food-photos');
CREATE POLICY "Auth users can upload food photos" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'food-photos' AND auth.role() = 'authenticated'
);
CREATE POLICY "Auth users can delete own food photos" ON storage.objects FOR DELETE USING (
  bucket_id = 'food-photos' AND auth.uid()::text = (storage.foldername(name))[1]
);
