-- Fix: non-admin users cannot submit food stories.
--
-- The editor inserts with .select('id') (INSERT ... RETURNING). PostgREST
-- applies SELECT policies to the returned row, and blog_posts only allowed
-- SELECT on approved posts (or anything for the admin). A regular user's
-- just-inserted 'pending' post could not be read back, so the whole insert
-- failed with RLS error 42501 — while working fine for the admin account.

CREATE POLICY "Users can view their own blogs"
  ON public.blog_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
