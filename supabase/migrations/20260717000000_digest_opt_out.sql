-- Weekly digest opt-out flag. Unsubscribe links in the digest email flip
-- this to true; the digest sender skips those profiles.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_opt_out boolean NOT NULL DEFAULT false;
