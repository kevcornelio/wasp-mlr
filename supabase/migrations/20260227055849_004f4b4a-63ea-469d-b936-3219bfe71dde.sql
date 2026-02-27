
-- Make user_id nullable for anonymous sessions
ALTER TABLE chat_sessions ALTER COLUMN user_id DROP NOT NULL;

-- Add device_id column for anonymous user identification
ALTER TABLE chat_sessions ADD COLUMN device_id text;

-- Drop existing RESTRICTIVE policies on chat_sessions
DROP POLICY IF EXISTS "Users can read own sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON chat_sessions;

-- Drop existing RESTRICTIVE policies on chat_messages
DROP POLICY IF EXISTS "Users can read own messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON chat_messages;

-- Recreate as PERMISSIVE policies for authenticated users (chat_sessions)
CREATE POLICY "Auth users can read own sessions" ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Auth users can insert own sessions" ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users can update own sessions" ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Auth users can delete own sessions" ON chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- PERMISSIVE policies for anonymous users via device_id header (chat_sessions)
CREATE POLICY "Anon can read own sessions" ON chat_sessions FOR SELECT USING (
  device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id'
);
CREATE POLICY "Anon can insert own sessions" ON chat_sessions FOR INSERT WITH CHECK (
  device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id'
);
CREATE POLICY "Anon can update own sessions" ON chat_sessions FOR UPDATE USING (
  device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id'
);
CREATE POLICY "Anon can delete own sessions" ON chat_sessions FOR DELETE USING (
  device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id'
);

-- Recreate as PERMISSIVE policies for authenticated users (chat_messages)
CREATE POLICY "Auth users can read own messages" ON chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.user_id = auth.uid())
);
CREATE POLICY "Auth users can insert own messages" ON chat_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.user_id = auth.uid())
);

-- PERMISSIVE policies for anonymous users (chat_messages)
CREATE POLICY "Anon can read own messages" ON chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.device_id IS NOT NULL AND chat_sessions.device_id = current_setting('request.headers', true)::json->>'x-device-id')
);
CREATE POLICY "Anon can insert own messages" ON chat_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM chat_sessions WHERE chat_sessions.id = chat_messages.session_id AND chat_sessions.device_id IS NOT NULL AND chat_sessions.device_id = current_setting('request.headers', true)::json->>'x-device-id')
);
