import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { contributionScore, getLevel, type FoodLevel } from '@/lib/levels';

// Session-wide cache: user_id -> score. Levels change slowly, so a stale
// value within one page visit is fine.
const scoreCache = new Map<string, number>();

// Resolves food levels for a set of user ids, batching uncached ids into a
// single RPC call.
export function useLevels(userIds: (string | null | undefined)[]): Record<string, FoodLevel> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))].sort();
  const key = ids.join(',');
  const [levels, setLevels] = useState<Record<string, FoodLevel>>({});

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;

    const build = () => {
      const out: Record<string, FoodLevel> = {};
      for (const id of ids) {
        const score = scoreCache.get(id);
        if (score !== undefined) out[id] = getLevel(score);
      }
      return out;
    };

    const missing = ids.filter(id => !scoreCache.has(id));
    if (missing.length === 0) {
      setLevels(build());
      return;
    }

    const load = async () => {
      // RPC not in generated types (matches existing `as any` pattern)
      const { data } = await (supabase.rpc as any)('get_contribution_counts', { user_ids: missing });
      for (const row of data ?? []) {
        scoreCache.set(row.user_id, contributionScore(row.blogs, row.spots, row.photos, row.chats));
      }
      if (!cancelled) setLevels(build());
    };
    load();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return levels;
}
