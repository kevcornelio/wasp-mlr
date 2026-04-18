import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PenLine, ArrowLeft, MapPin, Calendar, ChevronRight } from 'lucide-react';

interface Blog {
  id: string;
  author_name: string;
  title: string;
  body: string;
  restaurant_name: string | null;
  created_at: string;
}

export default function BlogListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlogs = async () => {
      const { data } = await supabase
        .from('food_blogs')
        .select('id, author_name, title, body, restaurant_name, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
      setBlogs(data || []);
      setLoading(false);
    };
    fetchBlogs();
  }, []);

  const excerpt = (text: string, max = 140) =>
    text.length > max ? text.slice(0, max).trimEnd() + '…' : text;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="font-semibold text-sm text-foreground">Food Blogs</h1>
              <p className="text-xs text-muted-foreground">Stories from Mangalore food lovers</p>
            </div>
          </div>
          {user && (
            <button
              onClick={() => navigate('/blog/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <PenLine className="h-3.5 w-3.5" />
              Write
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Hero */}
        <div className="mb-8 text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-2">
            🍛 Community Food Stories
          </div>
          <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Syne', sans-serif" }}>
            Mangalore <span className="text-primary">Food Diaries</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Real stories, real places, real food. Written by people who love Mangalore's culinary scene.
          </p>
          {!user && (
            <button
              onClick={() => navigate('/auth')}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <PenLine className="h-3.5 w-3.5" />
              Sign in to write your story
            </button>
          )}
        </div>

        {/* Blog list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                <div className="h-3 bg-muted rounded w-full mb-2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : blogs.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-5xl">📝</div>
            <h3 className="font-semibold text-foreground">No blogs yet</h3>
            <p className="text-sm text-muted-foreground">Be the first to share your Mangalore food story!</p>
            {user ? (
              <button
                onClick={() => navigate('/blog/new')}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <PenLine className="h-3.5 w-3.5" />
                Write the first blog
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Sign in to write
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {blogs.map(blog => (
              <article
                key={blog.id}
                onClick={() => navigate(`/blog/${blog.id}`)}
                className="group bg-card border border-border rounded-2xl p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-base leading-snug group-hover:text-primary transition-colors mb-2">
                      {blog.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {excerpt(blog.body)}
                    </p>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      {blog.restaurant_name && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                          <MapPin className="h-3 w-3" />
                          {blog.restaurant_name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(blog.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="text-xs text-muted-foreground">by {blog.author_name}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
