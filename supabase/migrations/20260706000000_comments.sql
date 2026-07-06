-- Comments on blog posts and food photos. One table serves both targets;
-- exactly one of blog_post_id / photo_id is set, with cascade cleanup when
-- the parent is deleted.

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  photo_id uuid REFERENCES public.food_photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((blog_post_id IS NULL) != (photo_id IS NULL))
);

CREATE INDEX idx_comments_blog ON public.comments(blog_post_id) WHERE blog_post_id IS NOT NULL;
CREATE INDEX idx_comments_photo ON public.comments(photo_id) WHERE photo_id IS NOT NULL;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments"
  ON public.comments FOR SELECT
  USING (true);

CREATE POLICY "Signed-in users can comment as themselves"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Own comments, or the admin (same hardcoded email as other admin policies)
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'email') = 'kev.cornelio@gmail.com');
