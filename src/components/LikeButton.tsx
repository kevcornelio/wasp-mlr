import { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Props = {
  blogPostId?: string;
  photoId?: string;
  commentId?: string;
  className?: string;
};

// Likes table is not in the generated Supabase types yet
const likesTable = () => (supabase as any).from('likes');

const LikeButton = ({ blogPostId, photoId, commentId, className = '' }: Props) => {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  const targetCol = blogPostId ? 'blog_post_id' : photoId ? 'photo_id' : 'comment_id';
  const targetId = blogPostId ?? photoId ?? commentId;

  const load = useCallback(async () => {
    if (!targetId) return;
    const { data } = await likesTable().select('user_id').eq(targetCol, targetId);
    if (data) {
      setCount(data.length);
      setLiked(!!user && data.some((l: { user_id: string }) => l.user_id === user.id));
    }
  }, [targetCol, targetId, user]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!targetId || busy) return;
    if (!user) {
      toast('Sign in to like', {
        action: { label: 'Sign in', onClick: () => { window.location.href = '/auth'; } },
      });
      return;
    }
    setBusy(true);
    // Optimistic update, reverted on failure
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount(c => c + (wasLiked ? -1 : 1));
    const { error } = wasLiked
      ? await likesTable().delete().eq(targetCol, targetId).eq('user_id', user.id)
      : await likesTable().insert({ [targetCol]: targetId, user_id: user.id });
    if (error) {
      setLiked(wasLiked);
      setCount(c => c + (wasLiked ? 1 : -1));
      toast.error('Something went wrong');
    } else if (!wasLiked && (blogPostId || photoId)) {
      // Fire-and-forget: email the owner (server dedupes repeat likes)
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'like',
          target: blogPostId ? 'blog' : 'photo',
          target_id: targetId,
          actor_id: user.id,
        }),
      }).catch(() => { /* non-critical */ });
    }
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
        liked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
      } ${className}`}
      aria-label={liked ? 'Unlike' : 'Like'}
    >
      <Heart className={`h-3.5 w-3.5 transition-transform active:scale-125 ${liked ? 'fill-red-500' : ''}`} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
};

export default LikeButton;
