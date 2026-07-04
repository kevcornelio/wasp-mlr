-- The Community Food Spots page (and the quick-prompt suggestions) surface
-- user_food_spots to everyone, but the only broad SELECT policy was
-- admin-only — regular users could only ever see their own spots, so the
-- "community" page looked empty. Spots are already shared with all users
-- through AI chat responses, so public read matches intent.

CREATE POLICY "Anyone can view food spots"
  ON public.user_food_spots FOR SELECT
  USING (true);
