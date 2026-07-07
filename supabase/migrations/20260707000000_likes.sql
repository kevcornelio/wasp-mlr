-- Likes on blog posts, food photos, and comments. Exactly one target per
-- row, one like per user per target, cascade cleanup with the parent.

CREATE TABLE public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  photo_id uuid REFERENCES public.food_photos(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(blog_post_id, photo_id, comment_id) = 1)
);

CREATE UNIQUE INDEX uniq_like_blog ON public.likes(user_id, blog_post_id) WHERE blog_post_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_like_photo ON public.likes(user_id, photo_id) WHERE photo_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_like_comment ON public.likes(user_id, comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_likes_blog ON public.likes(blog_post_id) WHERE blog_post_id IS NOT NULL;
CREATE INDEX idx_likes_photo ON public.likes(photo_id) WHERE photo_id IS NOT NULL;
CREATE INDEX idx_likes_comment ON public.likes(comment_id) WHERE comment_id IS NOT NULL;

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see likes"
  ON public.likes FOR SELECT
  USING (true);

CREATE POLICY "Signed-in users can like as themselves"
  ON public.likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own likes"
  ON public.likes FOR DELETE
  USING (auth.uid() = user_id);
