-- Centralize the admin identity. Twelve policies hardcoded
-- kev.cornelio@gmail.com; they now delegate to is_admin(), which also
-- recognises admin@wasp-mlr.com. Future admin changes = edit one function.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT auth.email() IN ('kev.cornelio@gmail.com', 'admin@wasp-mlr.com')
$$;

-- blog_posts
DROP POLICY IF EXISTS "Admin full access" ON public.blog_posts;
CREATE POLICY "Admin full access" ON public.blog_posts
  FOR ALL TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Admin can delete blog posts" ON public.blog_posts;
CREATE POLICY "Admin can delete blog posts" ON public.blog_posts
  FOR DELETE TO authenticated USING (is_admin());

-- chat data
DROP POLICY IF EXISTS "Admin can read all sessions" ON public.chat_sessions;
CREATE POLICY "Admin can read all sessions" ON public.chat_sessions
  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Admin can read all messages" ON public.chat_messages;
CREATE POLICY "Admin can read all messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Admin can read all feedback" ON public.chat_feedback;
CREATE POLICY "Admin can read all feedback" ON public.chat_feedback
  FOR SELECT TO authenticated USING (is_admin());

-- profiles
DROP POLICY IF EXISTS "Admin can read all profiles" ON public.profiles;
CREATE POLICY "Admin can read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (is_admin());

-- community recommendations
DROP POLICY IF EXISTS "Admin can read all community recs" ON public.community_recommendations;
CREATE POLICY "Admin can read all community recs" ON public.community_recommendations
  FOR SELECT TO authenticated USING (is_admin());

-- food spots
DROP POLICY IF EXISTS "Admin can delete any food spot" ON public.user_food_spots;
CREATE POLICY "Admin can delete any food spot" ON public.user_food_spots
  FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Admin can view all food spots" ON public.user_food_spots;
CREATE POLICY "Admin can view all food spots" ON public.user_food_spots
  FOR SELECT TO authenticated USING (is_admin());

-- food photos (table + storage)
DROP POLICY IF EXISTS "Admin can delete any food photo" ON public.food_photos;
CREATE POLICY "Admin can delete any food photo" ON public.food_photos
  FOR DELETE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "Admin can delete any food photo file" ON storage.objects;
CREATE POLICY "Admin can delete any food photo file" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'food-photos' AND is_admin());

-- comments (owner OR admin may delete)
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Users can delete own comments" ON public.comments
  FOR DELETE USING (auth.uid() = user_id OR is_admin());
