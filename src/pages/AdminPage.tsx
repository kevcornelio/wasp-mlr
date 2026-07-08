import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Users, Star, TrendingUp, Heart, ArrowLeft, RefreshCw, BookOpen, CheckCircle, XCircle, Clock, Trash2, MapPin, Mail, Loader2, Send } from 'lucide-react';
import { isAdminEmail } from '@/lib/admin';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface PendingBlog {
  id: string;
  user_id: string | null;
  author_name: string;
  // Resolved from profiles (admin-only readable) — the column itself is no
  // longer exposed through the API
  author_email: string | null;
  title: string;
  content: string;
  restaurant_name: string | null;
  created_at: string;
}

interface FoodSpot {
  id: string;
  user_id: string | null;
  restaurant_name: string;
  location: string | null;
  dishes: string[] | null;
  notes: string | null;
  rating: number | null;
  created_at: string;
  submitted_by: string;
}

interface Stats {
  totalSessions: number;
  totalMessages: number;
  totalRecommendations: number;
  avgRating: number;
  topRestaurants: { restaurant_name: string; count: number; avg_rating: number }[];
  recentSessions: { id: string; title: string; created_at: string; user_email: string | null }[];
  dailyChats: { date: string; count: number }[];
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  chat_count: number;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [fetching, setFetching] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [pendingBlogs, setPendingBlogs] = useState<PendingBlog[]>([]);
  const [allBlogs, setAllBlogs] = useState<(PendingBlog & { status: string })[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [foodSpots, setFoodSpots] = useState<FoodSpot[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingSpotId, setDeletingSpotId] = useState<string | null>(null);

  // Compose-mail dialog state
  const [mailTo, setMailTo] = useState<UserProfile | null>(null);
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailSending, setMailSending] = useState(false);

  const sendMailToUser = async () => {
    if (!mailTo || !mailSubject.trim() || mailBody.trim().length < 5) {
      toast.error('Subject and a short message are required');
      return;
    }
    setMailSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch('/api/admin-mail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          to_user_id: mailTo.id,
          subject: mailSubject.trim(),
          message: mailBody.trim(),
        }),
      });
      if (!resp.ok) throw new Error('send failed');
      toast.success(`Email sent to ${mailTo.full_name || mailTo.email}`);
      setMailTo(null);
      setMailSubject('');
      setMailBody('');
    } catch {
      toast.error('Could not send the email');
    } finally {
      setMailSending(false);
    }
  };

  const isAdmin = isAdminEmail(user?.email);

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
        profilesResult,
        userSessionCountResult,
      ] = await Promise.all([
        supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }),
        supabase.from('community_recommendations').select('rating'),
        supabase.from('community_recommendations').select('restaurant_name, rating').order('rating', { ascending: false }),
        supabase.from('chat_sessions').select('id, title, created_at, user_id').order('created_at', { ascending: false }).limit(10),
        supabase.from('profiles').select('id, full_name, email, created_at').order('created_at', { ascending: false }),
        supabase.from('chat_sessions').select('user_id').not('user_id', 'is', null),
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

      // Build per-user chat counts
      const chatCountMap = new Map<string, number>();
      (userSessionCountResult.data || []).forEach(s => {
        if (s.user_id) chatCountMap.set(s.user_id, (chatCountMap.get(s.user_id) || 0) + 1);
      });

      // Build profiles list with chat counts
      const profilesWithCounts: UserProfile[] = (profilesResult.data || []).map(p => ({
        ...p,
        chat_count: chatCountMap.get(p.id) || 0,
      }));
      setUsers(profilesWithCounts);

      // Build recent sessions with user emails
      const profileEmailMap = new Map((profilesResult.data || []).map(p => [p.id, p.email]));
      const recentSessions = (recentSessionsResult.data || []).map(s => ({
        ...s,
        user_email: s.user_id ? (profileEmailMap.get(s.user_id) || 'Unknown') : 'Anonymous',
      }));

      setStats({
        totalSessions: sessionsResult.count || 0,
        totalMessages: messagesResult.count || 0,
        totalRecommendations: recommendationsResult.data?.length || 0,
        avgRating,
        topRestaurants,
        recentSessions,
        dailyChats: [],
      });

      // Author emails come from profiles (admin can read all profiles);
      // author_email on blog_posts is no longer selectable via the API
      const { data: profilesForEmail } = await supabase
        .from('profiles')
        .select('id, email');
      const emailById = new Map((profilesForEmail || []).map(p => [p.id, p.email]));
      const withEmail = <T extends { user_id: string | null }>(b: T) => ({
        ...b,
        author_email: b.user_id ? emailById.get(b.user_id) ?? null : null,
      });

      // Fetch pending blogs
      const { data: blogsData } = await supabase
        .from('blog_posts')
        .select('id, user_id, author_name, title, content, restaurant_name, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      setPendingBlogs((blogsData || []).map(withEmail));

      // Fetch all blogs (approved + rejected)
      const { data: allBlogsData } = await supabase
        .from('blog_posts')
        .select('id, user_id, author_name, title, content, restaurant_name, created_at, status')
        .in('status', ['approved', 'rejected'])
        .order('created_at', { ascending: false });
      setAllBlogs((allBlogsData || []).map(withEmail));

      // Fetch user-submitted food spots
      const { data: spotsData } = await supabase
        .from('user_food_spots')
        .select('id, user_id, restaurant_name, location, dishes, notes, rating, created_at')
        .order('created_at', { ascending: false });
      const spotsWithSubmitter: FoodSpot[] = (spotsData || []).map(s => ({
        ...s,
        submitted_by: s.user_id ? (profileEmailMap.get(s.user_id) || 'Unknown user') : 'Anonymous',
      }));
      setFoodSpots(spotsWithSubmitter);

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleBlogAction = async (blogId: string, action: 'approved' | 'rejected') => {
    setReviewingId(blogId);
    await supabase.from('blog_posts').update({ status: action }).eq('id', blogId);
    setPendingBlogs(prev => prev.filter(b => b.id !== blogId));
    setReviewingId(null);
  };

  const handleBlogDelete = async (blogId: string) => {
    if (!confirm('Delete this blog post permanently?')) return;
    setDeletingId(blogId);
    await supabase.from('blog_posts').delete().eq('id', blogId);
    setPendingBlogs(prev => prev.filter(b => b.id !== blogId));
    setAllBlogs(prev => prev.filter(b => b.id !== blogId));
    setDeletingId(null);
  };

  const handleSpotDelete = async (spotId: string) => {
    if (!confirm('Delete this food spot permanently?')) return;
    setDeletingSpotId(spotId);
    await supabase.from('user_food_spots').delete().eq('id', spotId);
    setFoodSpots(prev => prev.filter(s => s.id !== spotId));
    setDeletingSpotId(null);
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
      <div className="dark flex items-center justify-center min-h-screen bg-background">
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
      bg: 'bg-blue-500/15',
    },
    {
      label: 'Total Messages',
      value: stats?.totalMessages.toLocaleString() || '0',
      icon: TrendingUp,
      color: 'text-green-500',
      bg: 'bg-green-500/15',
    },
    {
      label: 'Community Saves',
      value: stats?.totalRecommendations.toLocaleString() || '0',
      icon: Heart,
      color: 'text-rose-500',
      bg: 'bg-rose-500/15',
    },
    {
      label: 'Avg Rating',
      value: stats?.avgRating ? `${stats.avgRating.toFixed(1)} ★` : 'N/A',
      icon: Star,
      color: 'text-amber-500',
      bg: 'bg-amber-500/15',
    },
  ];

  return (
    <div className="dark min-h-screen bg-background">
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
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <h2 className="font-semibold text-sm text-foreground">Recent Chats</h2>
            </div>
            {stats?.recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No chats yet.</p>
            ) : (
              <div className="space-y-1">
                {stats?.recentSessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{s.title || 'Untitled chat'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{s.user_email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Users */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-violet-500" />
            <h2 className="font-semibold text-sm text-foreground">Registered Users</h2>
            <span className="text-xs text-muted-foreground ml-1">({users.length})</span>
          </div>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No users yet.</p>
          ) : (
            <div className="space-y-1">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{u.chat_count}</p>
                      <p className="text-[10px] text-muted-foreground">chats</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <button
                      onClick={() => setMailTo(u)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/40 hover:bg-primary/15 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blog Approval Queue */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-500" />
              <h2 className="font-semibold text-sm text-foreground">Blog Approval Queue</h2>
            </div>
            {pendingBlogs.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
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
                    {blog.content}
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
                    <button
                      onClick={() => handleBlogDelete(blog.id)}
                      disabled={deletingId === blog.id}
                      className="flex items-center justify-center px-3 py-2 border border-destructive/40 text-destructive text-xs font-medium rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Published/Rejected Blogs */}
        {allBlogs.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <h2 className="font-semibold text-sm text-foreground">All Blog Posts</h2>
              <span className="text-xs text-muted-foreground ml-1">({allBlogs.length})</span>
            </div>
            <div className="space-y-3">
              {allBlogs.map(blog => (
                <div key={blog.id} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate max-w-[280px]">{blog.title}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        blog.status === 'approved'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {blog.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {blog.author_name} · {new Date(blog.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleBlogDelete(blog.id)}
                    disabled={deletingId === blog.id}
                    className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Food Spots */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-emerald-500" />
            <h2 className="font-semibold text-sm text-foreground">User Food Spots</h2>
            <span className="text-xs text-muted-foreground ml-1">({foodSpots.length})</span>
          </div>
          {foodSpots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No food spots submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {foodSpots.map(spot => (
                <div key={spot.id} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate max-w-[280px]">{spot.restaurant_name}</span>
                      {spot.location && (
                        <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          📍 {spot.location}
                        </span>
                      )}
                      {spot.rating && (
                        <span className="text-xs text-amber-500 font-medium">{spot.rating} ★</span>
                      )}
                    </div>
                    {spot.dishes && spot.dishes.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Dishes: {spot.dishes.join(', ')}</p>
                    )}
                    {spot.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{spot.notes}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      by {spot.submitted_by} · {new Date(spot.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSpotDelete(spot.id)}
                    disabled={deletingSpotId === spot.id}
                    className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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

      {/* Compose mail to user */}
      <Dialog open={!!mailTo} onOpenChange={(open) => { if (!open) setMailTo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Email {mailTo?.full_name || mailTo?.email}
            </DialogTitle>
            <DialogDescription>
              Sent from admin@wasp-mlr.com in the Wassup MLR branded template, greeting them by first name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Subject</label>
              <Input
                value={mailSubject}
                onChange={e => setMailSubject(e.target.value)}
                placeholder="e.g. Your blog is now live! 🎉"
                maxLength={200}
                disabled={mailSending}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Message</label>
              <Textarea
                value={mailBody}
                onChange={e => setMailBody(e.target.value)}
                placeholder={"Write your message… line breaks are kept.\n\nThe greeting (Hey <name>!) and sign-off are added automatically."}
                className="min-h-[160px] resize-none"
                maxLength={5000}
                disabled={mailSending}
              />
            </div>
            <Button onClick={sendMailToUser} disabled={mailSending || !mailSubject.trim() || !mailBody.trim()} className="w-full gap-2">
              {mailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send email
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
