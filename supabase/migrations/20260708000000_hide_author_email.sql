-- author_email on blog_posts was readable by anyone via the API (approved
-- posts are public and the table grant covered every column). Replace the
-- blanket grant with a column list that excludes author_email (and the
-- embedding vector, which no client reads). The service role keeps full
-- access; the admin UI now sources emails from profiles, which is already
-- admin-only.

REVOKE SELECT ON public.blog_posts FROM anon, authenticated;
GRANT SELECT (id, user_id, author_name, title, content, restaurant_name, status, created_at, updated_at)
  ON public.blog_posts TO anon, authenticated;
