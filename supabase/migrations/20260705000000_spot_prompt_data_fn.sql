-- Quick-prompt suggestions draw on ALL users' food spots, but direct reads
-- of user_food_spots are RLS-scoped to the owner (the Food Spots page is
-- private). This SECURITY DEFINER function exposes only what suggestions
-- need — restaurant name and one dish, no notes or user identifiers.

CREATE OR REPLACE FUNCTION public.get_spot_prompt_data(max_rows int DEFAULT 8)
RETURNS TABLE (restaurant_name text, dish text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.restaurant_name, s.dishes[1] AS dish
  FROM public.user_food_spots s
  ORDER BY s.created_at DESC
  LIMIT LEAST(GREATEST(max_rows, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.get_spot_prompt_data TO anon, authenticated;
