-- Dedupe log for email notifications (comments/likes on blogs and photos).
-- Written only by the service role from /api/notify; a unique dedupe key
-- ensures repeat events (like/unlike toggling, client retries) send at most
-- one email. RLS enabled with no policies = no client access.

CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
