-- Batch contribution counts for showing food levels next to user names
-- anywhere in the app. SECURITY DEFINER so private rows (spots, chats) are
-- countable — only aggregate counts are exposed, never the rows themselves.
-- Score weights live in src/lib/levels.ts; this returns raw counts.

CREATE OR REPLACE FUNCTION public.get_contribution_counts(user_ids uuid[])
RETURNS TABLE (user_id uuid, blogs int, spots int, photos int, chats int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    u.id,
    COALESCE(b.c, 0)::int,
    COALESCE(s.c, 0)::int,
    COALESCE(p.c, 0)::int,
    COALESCE(ch.c, 0)::int
  FROM unnest(user_ids) AS u(id)
  LEFT JOIN (SELECT bp.user_id, count(*) AS c FROM blog_posts bp WHERE bp.status = 'approved' GROUP BY 1) b ON b.user_id = u.id
  LEFT JOIN (SELECT fs.user_id, count(*) AS c FROM user_food_spots fs GROUP BY 1) s ON s.user_id = u.id
  LEFT JOIN (SELECT fp.user_id, count(*) AS c FROM food_photos fp GROUP BY 1) p ON p.user_id = u.id
  LEFT JOIN (SELECT cs.user_id, count(*) AS c FROM chat_sessions cs GROUP BY 1) ch ON ch.user_id = u.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_contribution_counts TO anon, authenticated;
