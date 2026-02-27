import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { getDeviceId } from './deviceId';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Creates a Supabase client with the x-device-id header set,
 * allowing anonymous users to pass RLS policies based on device_id.
 */
export function getAnonSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: {
        'x-device-id': getDeviceId(),
      },
    },
  });
}
