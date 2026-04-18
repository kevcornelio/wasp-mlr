import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MapPin, Calendar, User } from 'lucide-react';

interface Blog {
  id: string;
  author_name: string;
  title: string;
  body: string;
  restaurant_name: string | null;
  created_at: string;
}

export default function BlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchBlog = async () => {
      const { data } = await supabase
        .from('food_blogs')
        .select('id, author_name, title, body, restaurant_name, created_at')
        .eq('id', id)
        .eq('status', 'approved')
        .single();

      if (!data) setNotFound(true);
      else setBlog(data);
      setLoading(false);
    };
    if (id) fetchBlog();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !blog) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <div className="text-4xl">🍛</div>
        <h2 className="font-semibold text-foreground">Blog not found</h2>
        <button
          onClick={() => navigate('/blog')}
          className="text-sm text-primary hover:underline"
        >
          Back to all blogs
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/blog')}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm text-muted-foreground">Food Blogs</span>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-2xl mx-auto px-4 py-8">
        {/* Restaurant tag */}
        {blog.restaurant_name && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 px-3 py-1 rounded-full">
              <MapPin className="h-3 w-3" />
              {blog.restaurant_name}
            </span>
          </div>
        )}

        {/* Title */}
        <h1
          className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          {blog.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-8 pb-6 border-b border-border">
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {blog.author_name}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(blog.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Body */}
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
          {blog.body}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
          <button
            onClick={() => navigate('/blog')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All blogs
          </button>
          <button
            onClick={() => navigate('/chat')}
            className="text-sm text-primary font-medium hover:underline"
          >
            Ask Wasp MLR about {blog.restaurant_name || 'this place'} →
          </button>
        </div>
      </article>
    </div>
  );
}
