import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft, Send, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function BlogEditorPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Redirect if not logged in
  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) { setError('Please add a title'); return; }
    if (body.trim().length < 50) { setError('Please write at least 50 characters'); return; }

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase
        .from('food_blogs')
        .insert([{
          user_id: user.id,
          author_name: profile?.full_name || user.email?.split('@')[0] || 'Anonymous',
          author_email: user.email,
          title: title.trim(),
          body: body.trim(),
          restaurant_name: restaurantName.trim() || null,
          status: 'pending',
        }]);

      if (insertError) {
        setError('Failed to submit. Please try again.');
        console.error(insertError);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 px-6 max-w-sm">
          <CheckCircle className="h-14 w-14 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "'Syne', sans-serif" }}>
            Blog submitted! 🎉
          </h2>
          <p className="text-sm text-muted-foreground">
            Your story is under review. Once approved by the admin, it'll go live on the blog page for everyone to read.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigate('/blog')}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors"
            >
              See all blogs
            </button>
            <button
              onClick={() => { setSubmitted(false); setTitle(''); setBody(''); setRestaurantName(''); }}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Write another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/blog')}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="font-semibold text-sm text-foreground">Write a Food Blog</h1>
              <p className="text-xs text-muted-foreground">Submitted blogs are reviewed before going live</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Blog Title *
            </label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Why Pabbas is Mangalore's Best Kept Secret"
              disabled={submitting}
              className="text-base"
            />
          </div>

          {/* Restaurant Tag */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Restaurant / Place
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </label>
            <Input
              value={restaurantName}
              onChange={e => setRestaurantName(e.target.value)}
              placeholder="e.g. Pabbas, Hotel Narayana, Froth on Top..."
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tagging a restaurant helps readers find it on the map 📍
            </p>
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Your Story *
            </label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Share your experience! What did you eat? What made it special? Would you recommend it?\n\nE.g. "Last Sunday, my family and I visited Hotel Narayana for the first time. The fish curry was absolutely mind-blowing — rich, coconut-y, and perfectly spiced..."`}
              disabled={submitting}
              className="min-h-[280px] resize-none leading-relaxed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {body.length} characters {body.length < 50 ? `(min 50)` : '✓'}
            </p>
          </div>

          {/* Author info */}
          <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-2.5 text-sm text-muted-foreground">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {(profile?.full_name || user.email || 'A')[0].toUpperCase()}
              </span>
            </div>
            <span>
              Publishing as <span className="font-medium text-foreground">
                {profile?.full_name || user.email?.split('@')[0]}
              </span>
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 h-11"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
              : <><Send className="h-4 w-4" /> Submit for Review</>
            }
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Your blog will be reviewed by the admin before going live. This usually takes a few hours.
          </p>
        </form>
      </div>
    </div>
  );
}
