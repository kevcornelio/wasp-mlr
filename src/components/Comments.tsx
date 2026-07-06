import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Loader2, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ADMIN_EMAIL = 'kev.cornelio@gmail.com';

type Comment = {
  id: string;
  user_id: string;
  author_name: string;
  content: string;
  created_at: string;
};

type Props = {
  blogPostId?: string;
  photoId?: string;
};

// Comments table is not in the generated Supabase types yet
const commentsTable = () => (supabase as any).from('comments');

const Comments = ({ blogPostId, photoId }: Props) => {
  const { user, profile } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const targetCol = blogPostId ? 'blog_post_id' : 'photo_id';
  const targetId = blogPostId ?? photoId;

  const load = useCallback(async () => {
    if (!targetId) return;
    const { data } = await commentsTable()
      .select('id, user_id, author_name, content, created_at')
      .eq(targetCol, targetId)
      .order('created_at', { ascending: true });
    if (data) setComments(data as Comment[]);
    setLoading(false);
  }, [targetCol, targetId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!user || !text.trim() || !targetId) return;
    setSubmitting(true);
    const author_name = profile?.full_name || user.email?.split('@')[0] || 'Anonymous';
    const { data, error } = await commentsTable()
      .insert({ [targetCol]: targetId, user_id: user.id, author_name, content: text.trim() })
      .select('id, user_id, author_name, content, created_at')
      .single();
    if (error) {
      toast.error('Failed to post comment');
    } else if (data) {
      setComments(prev => [...prev, data as Comment]);
      setText('');
    }
    setSubmitting(false);
  };

  const remove = async (id: string) => {
    await commentsTable().delete().eq('id', id);
    setComments(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquare className="h-4 w-4 text-primary" />
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </h3>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet — be the first!</p>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="group bg-muted/40 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">{c.author_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                {user && (c.user_id === user.id || isAdmin) && (
                  <button
                    onClick={() => remove(c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">{c.content}</p>
            </div>
          ))}
        </div>
      )}

      {user ? (
        <div className="flex gap-2 items-end">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a comment…"
            className="min-h-[60px] max-h-40 resize-none text-sm"
            maxLength={2000}
          />
          <Button size="sm" onClick={submit} disabled={!text.trim() || submitting} className="gap-1.5 shrink-0">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Post
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          <a href="/auth" className="text-primary font-medium hover:underline">Sign in</a> to join the conversation
        </p>
      )}
    </div>
  );
};

export default Comments;
