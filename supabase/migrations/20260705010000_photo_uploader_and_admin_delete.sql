-- Food photos: show who uploaded each photo, and let the admin remove any
-- photo (both the database row and the storage object).

ALTER TABLE public.food_photos ADD COLUMN IF NOT EXISTS uploader_name text;

-- Backfill names for existing photos from profiles (full name, falling back
-- to the email prefix)
UPDATE public.food_photos fp
SET uploader_name = COALESCE(
  NULLIF((SELECT p.full_name FROM public.profiles p WHERE p.id = fp.user_id), ''),
  (SELECT split_part(p.email, '@', 1) FROM public.profiles p WHERE p.id = fp.user_id)
)
WHERE fp.uploader_name IS NULL;

-- Mirrors the hardcoded ADMIN_EMAIL used in AdminPage and other admin policies
CREATE POLICY "Admin can delete any food photo" ON public.food_photos
  FOR DELETE USING ((auth.jwt() ->> 'email') = 'kev.cornelio@gmail.com');

CREATE POLICY "Admin can delete any food photo file" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'food-photos'
    AND (auth.jwt() ->> 'email') = 'kev.cornelio@gmail.com'
  );
