-- Coarse geo/IP for chat sessions, captured server-side in api/chat.ts from
-- Vercel's edge request headers (never trusted from the client). Set once, on
-- the first message of a session. Used for admin analytics only.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text;
