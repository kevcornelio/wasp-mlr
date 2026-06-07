-- Allow the admin account to delete any user-submitted food spot
-- (mirrors the hardcoded ADMIN_EMAIL check in src/pages/AdminPage.tsx)
CREATE POLICY "Admin can delete any food spot" ON public.user_food_spots
  FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'kev.cornelio@gmail.com');
