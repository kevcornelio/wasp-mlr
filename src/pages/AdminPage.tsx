import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Users, Star, TrendingUp, Heart, ArrowLeft, RefreshCw, BookOpen, CheckCircle, XCircle, Clock } from 'lucide-react';

interface PendingBlog {
  id: string;
  author_name: string;
  author_email: string | null;
  title: string;
  body: string;
  restaurant_name: string | null;
  created_at: string;
}

// 🔒 Admin access restricted to this email
const ADMIN_EMAIL = 'kev.cornelio@gmail.com';

interface Stats {
  totalSessions: number;
  totalMessages: number;
  totalRecommendations: number;
  avgRating: number;
  topRestaurants: { restaurant_name: string; count: number; avg_rating: number }[];
  recentSessions: { id: string; title: string; created_at: string }[];
  dailyChats: { date: string; count: number }[];
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [fetching, setFetching] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [pendingBlogs, setPendingBlogs] = useState<PendingBlog[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchStats = async () => {
    setFetching(true);
    try {
      // Fetch all stats in parallel
      const [
        sessionsResult,
        messagesResult,
        recommendationsResult,
        topRestaurantsResult,
        recentSessionsResult,
      ] = await Promise.all([
        // Total chat sessions
        supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),

        // Total messages
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }),

        // Community recommendations with avg rating
        supabase.from('community_recommendations').select('rating'),

        // Top restaurants from community recommendations
        supabase
          .from('community_recommendations')
          .select('restaurant_name, rating')
          .order('rating', { ascending: false }),

        // Recent sessions
        supabase
          .from('chat_sessions')
          .select('id, title, created_at')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      // Calculate avg rating
      const ratings = (recommendationsResult.data || []).map(r => r.rating).filter(Boolean);
      const avgRating = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;

      // Aggregate top restaurants
      const restaurantMap = new Map<string, { count: number; totalRating: number }>();
      (topRestaurantsResult.data || []).forEach(rec => {
        const key = rec.restaurant_name;
        const existing = restaurantMap.get(key) || { count: 0, totalRating: 0 };
        restaurantMap.set(key, {
          count: existing.count + 1,
          totalRating: existing.totalRating + (rec.rating || 0),
        });
      });

      const topRestaurants = Array.from(restaurantMap.entries())
        .map(([name, data]) => ({
          restaurant_name: name,
          count: data.count,
          avg_rating: data.totalRating / data.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      setStats({
        totalSessions: sessionsResult.count || 0,
        totalMessages: messagesResult.count || 0,
        totalRecommendations: recommendationsResult.data?.length || 0,
        avgRating,
        topRestaurants,
        recentSessions: recentSessionsResult.data || [],
        dailyChats: [],
      });

      // Fetch pending blogs
      const { data: blogsData } = await supabase
        .from('food_blogs')
        .select('id, author_name, author_email, title, body, restaurant_name, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      setPendingBlogs(blogsData || []);

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleBlogAction = async (blogId: string, action: 'approved' | 'rejected') => {
    setReviewingId(blogId);
    await supabase.from('food_blogs').update({ status: action }).eq('id', blogId);
    setPendingBlogs(prev => prev.filter(b => b.id !== blogId));
    setReviewingId(null);
  };

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
    if (!loading && user && !isAdmin) navigate('/chat');
  }, [user, loading, isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchStats();
  }, [isAdmin]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const statCards = [
    {
      label: 'Total Chats',
      value: stats?.totalSessions.toLocaleString() || '0',
      icon: MessageSquare,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Total Messages',
      value: stats?.totalMessages.toLocaleString() || '0',
      icon: TrendingUp,
      color: 'text-green-500',
      bg: 'bg-green-50',
    },
    {
      label: 'Community Saves',
      value: stats?.totalRecommendations.toLocaleString() || '0',
      icon: Heart,
      color: 'text-rose-500',
      bg: 'bg-rose-50',
    },
    {
      label: 'Avg Rating',
      value: stats?.avgRating ? `${stats.avgRating.toFixed(1)} ★` : 'N/A',
      icon: Star,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <div>
              <h1 className="font-semibold text-sm text-foreground">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">Wasp MLR • {user?.email}</p>
            </div>
          </div>
          <button
            onClick={fetchStats}
            disabled={fetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Last refreshed */}
        <p className="text-xs text-muted-foreground">
          Last updated: {lastRefreshed.toLocaleTimeString()}
        </p>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
              <div className={`h-9 w-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} size={18} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Top Restaurants */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-sm text-foreground">Top Community Picks</h2>
            </div>
            {stats?.topRestaurants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No recommendations yet. Be the first to save one! 💾
              </p>
            ) : (
              <div className="space-y-2">
                {stats?.topRestaurants.map((r, i) => (
                  <div key={r.restaurant_name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                      <span className="text-sm font-medium text-foreground truncate max-w-[160px]">
                        {r.restaurant_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-amber-500 font-medium">
                        {r.avg_rating.toFixed(1)} ★
                      </span>
                      <span className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded-md">
                        {r.count} save{r.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Sessions */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-blue-500" />
              <h2 className="font-semibold text-sm text-foreground">Recent Chats</h2>
            </div>
            {stats?.recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No chats yet.
              </p>
            ) : (
              <div className="space-y-1">
                {stats?.recentSessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-foreground truncate max-w-[200px]">
                      {s.title || 'Untitled chat'}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(s.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Blog Approval Queue */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-500" />
              <h2 className="font-semibold text-sm text-foreground">Blog Approval Queue</h2>
            </div>
            {pendingBlogs.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <Clock className="h-3 w-3" />
                {pendingBlogs.length} pending
              </span>
            )}
          </div>

          {pendingBlogs.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <CheckCircle className="h-8 w-8 text-green-400 mx-auto" />
              <p className="text-sm text-muted-foreground">All caught up! No blogs pending review.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingBlogs.map(blog => (
                <div key={blog.id} className="border border-border rounded-xl p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">{blog.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {blog.author_name} {blog.author_email ? `(${blog.author_email})` : ''} ·{' '}
                      {new Date(blog.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                    {blog.restaurant_name && (
                      <span className="inline-block text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1">
                        📍 {blog.restaurant_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 border-l-2 border-border pl-3">
                    {blog.body}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBlogAction(blog.id, 'approved')}
                      disabled={reviewingId === blog.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Approve & Publish
                    </button>
                    <button
                      onClick={() => handleBlogAction(blog.id, 'rejected')}
                      disabled={reviewingId === blog.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-destructive/40 text-destructive text-xs font-medium rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center pb-4">
          🔒 Admin only • Stats pulled from Supabase in real-time
        </p>
      </div>
    </div>
  );
}
