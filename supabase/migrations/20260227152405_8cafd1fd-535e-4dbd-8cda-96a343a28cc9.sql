
-- User preferences table (works for both auth and anon users)
CREATE TABLE public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  device_id text,
  diet_type text DEFAULT 'any', -- 'veg', 'non-veg', 'eggetarian', 'vegan', 'any'
  spice_level text DEFAULT 'medium', -- 'mild', 'medium', 'spicy', 'extra-spicy'
  allergies text[] DEFAULT '{}',
  favorite_cuisines text[] DEFAULT '{}',
  budget_range text DEFAULT 'moderate', -- 'budget', 'moderate', 'premium', 'any'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_or_device CHECK (user_id IS NOT NULL OR device_id IS NOT NULL)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS for user_preferences
CREATE POLICY "Auth users manage own prefs" ON user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anon read own prefs" ON user_preferences FOR SELECT USING (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Anon insert own prefs" ON user_preferences FOR INSERT WITH CHECK (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Anon update own prefs" ON user_preferences FOR UPDATE USING (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');

-- Community food spots table (restaurants + dishes users recommend)
CREATE TABLE public.user_food_spots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  device_id text,
  restaurant_name text NOT NULL,
  location text,
  dishes text[] DEFAULT '{}',
  notes text,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_food_spots ENABLE ROW LEVEL SECURITY;

-- Everyone can read food spots (community data)
CREATE POLICY "Anyone can read food spots" ON user_food_spots FOR SELECT USING (true);
-- Auth users can insert
CREATE POLICY "Auth users insert spots" ON user_food_spots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users delete own spots" ON user_food_spots FOR DELETE USING (auth.uid() = user_id);
-- Anon users can insert
CREATE POLICY "Anon insert spots" ON user_food_spots FOR INSERT WITH CHECK (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Anon delete own spots" ON user_food_spots FOR DELETE USING (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');

-- Chat feedback table (post-chat: which places did user visit)
CREATE TABLE public.chat_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users,
  device_id text,
  place_name text NOT NULL,
  visited boolean NOT NULL DEFAULT false,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

-- RLS for chat_feedback
CREATE POLICY "Auth users manage own feedback" ON chat_feedback FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anon read own feedback" ON chat_feedback FOR SELECT USING (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Anon insert own feedback" ON chat_feedback FOR INSERT WITH CHECK (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');
CREATE POLICY "Anon update own feedback" ON chat_feedback FOR UPDATE USING (device_id IS NOT NULL AND device_id = current_setting('request.headers', true)::json->>'x-device-id');
