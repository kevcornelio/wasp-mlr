import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Users, Star, TrendingUp, Heart, ArrowLeft, RefreshCw, BookOpen, CheckCircle, XCircle, Clock, Trash2, MapPin, Mail, Loader2, Send, Newspaper } from 'lucide-react';
import { isAdminEmail } from '@/lib/admin';
import { getLevel, contributionScore } from '@/lib/levels';
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
  recentSessions: { id: string; title: string; created_at: string; user_email: string | null; ip: string | null; country: string | null; region: string | null; city: string | null }[];
  dailyChats: { date: string; count: number }[];
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  chat_count: number;
  blog_count: number;
  spot_count: number;
  photo_count: number;
  // weights defined in src/lib/levels.ts
  contribution_score: number;
}

// ISO 3166-1 alpha-2 code (e.g. "IN") → flag emoji via regional indicators.
const countryFlag = (code: string | null): string => {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Outreach email pre-fill. The branded template adds the "Hey <name>!"
// greeting, an "Open Wassup MLR →" button, and the "The Wassup MLR team"
// sign-off, so the body here is just the middle paragraphs.
const OUTREACH_SUBJECT = "Would love your take on Mangalore's food scene 🍛";
const OUTREACH_BODY = `We've been building something called Wassup MLR — an AI food guide for Mangalore. You tell it your mood or craving and it points you to the right dish at the right spot, drawn from real recommendations by local foodies rather than generic star ratings.

You came to mind because you actually know this city's food — the places worth the drive, the dishes people sleep on. We'd love for you to take it for a spin and, if it clicks, write up your experience as a food story right on the app. Your voice would help shape what the community discovers, and you'd be one of the first names on it.

No catch — we're just keen for honest takes from people who genuinely love eating in Mangalore. Hit reply if you have any questions, or jump straight in below.`;

// Parse a recipients box: one per line, as "email", "Name <email>",
// or "Name, email" / "email, Name".
const parseRecipients = (raw: string): { email: string; name: string }[] =>
  raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const angle = line.match(/^(.*?)<([^>]+)>$/);
      if (angle) return { name: angle[1].trim().replace(/^["']|["']$/g, ''), email: angle[2].trim() };
      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim());
        const email = parts.find(p => p.includes('@')) ?? '';
        const name = parts.find(p => p && !p.includes('@')) ?? '';
        return { name, email };
      }
      return { name: '', email: line };
    });

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

  // Compose-mail dialog state — works for registered users (prefilled) and
  // any outside address typed in manually
  const [mailOpen, setMailOpen] = useState(false);
  const [mailToEmail, setMailToEmail] = useState('');
  const [mailToName, setMailToName] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailSending, setMailSending] = useState(false);

  const openCompose = (email = '', name = '') => {
    setMailToEmail(email);
    setMailToName(name);
    setMailOpen(true);
  };

  // Bulk outreach dialog — invite potential users to try the app and blog.
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachRecipients, setOutreachRecipients] = useState('');
  const [outreachSubject, setOutreachSubject] = useState(OUTREACH_SUBJECT);
  const [outreachBody, setOutreachBody] = useState(OUTREACH_BODY);
  const [outreachSending, setOutreachSending] = useState(false);

  const outreachValid = parseRecipients(outreachRecipients).filter(r => EMAIL_RE.test(r.email));

  const sendOutreach = async () => {
    const recipients = outreachValid;
    if (recipients.length === 0) {
      toast.error('Add at least one valid recipient');
      return;
    }
    if (!outreachSubject.trim() || outreachBody.trim().length < 5) {
      toast.error('Subject and message are required');
      return;
    }
    setOutreachSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch('/api/admin-mail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          recipients: recipients.map(r => ({ email: r.email, name: r.name || null })),
          subject: outreachSubject.trim(),
          message: outreachBody.trim(),
          kind: 'outreach',
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || 'send failed');
      toast.success(`Outreach sent to ${json.sent}/${json.total}${json.failed ? ` · ${json.failed} failed` : ''}`);
      if (!json.failed) {
        setOutreachOpen(false);
        setOutreachRecipients('');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send outreach');
    } finally {
      setOutreachSending(false);
    }
  };

  const sendMailToUser = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailToEmail.trim())) {
      toast.error('Enter a valid recipient email');
      return;
    }
    if (!mailSubject.trim() || mailBody.trim().length < 5) {
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
          to_email: mailToEmail.trim(),
          to_name: mailToName.trim() || null,
          subject: mailSubject.trim(),
          message: mailBody.trim(),
        }),
      });
      if (!resp.ok) throw new Error('send failed');
      toast.success(`Email sent to ${mailToEmail.trim()}`);
      setMailOpen(false);
      setMailSubject('');
      setMailBody('');
    } catch {
      toast.error('Could not send the email');
    } finally {
      setMailSending(false);
    }
  };

  // Weekly digest — admin-controlled, no cron. Preview shows what this
  // week's email would contain; test mails only the admin; send goes to all.
  type DigestPreview = { spots: number; blogs: number; photos: number; levelUps: number; quiet: boolean };
  const [digestPreview, setDigestPreview] = useState<DigestPreview | null>(null);
  const [digestBusy, setDigestBusy] = useState<'preview' | 'test' | 'send' | null>(null);
  const [digestConfirmOpen, setDigestConfirmOpen] = useState(false);

  const callDigest = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch('/api/digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || 'Request failed');
    return json;
  };

  const previewDigest = async () => {
    setDigestBusy('preview');
    try {
      const j = await callDigest({ mode: 'preview' });
      setDigestPreview({ spots: j.spots, blogs: j.blogs, photos: j.photos, levelUps: j.levelUps, quiet: j.quiet });
    } catch {
      toast.error('Could not load the digest preview');
    } finally {
      setDigestBusy(null);
    }
  };

  const testDigest = async () => {
    setDigestBusy('test');
    try {
      const j = await callDigest({ mode: 'test' });
      toast.success(`Test digest sent to ${j.to}${j.quiet ? ' (quiet week — mostly empty)' : ''}`);
    } catch {
      toast.error('Could not send the test digest');
    } finally {
      setDigestBusy(null);
    }
  };

  const sendDigestToAll = async () => {
    setDigestConfirmOpen(false);
    setDigestBusy('send');
    try {
      const j = await callDigest({ mode: 'send', confirm: 'SEND_DIGEST_TO_ALL' });
      if (j.skipped) toast.info('No activity this week — nothing was sent');
      else toast.success(`Digest sent to ${j.sent} · skipped ${j.skipped}${j.failed ? ` · failed ${j.failed}` : ''}`);
    } catch {
      toast.error('Could not send the digest');
    } finally {
      setDigestBusy(null);
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
        blogAuthorsResult,
        spotAuthorsResult,
        photoAuthorsResult,
      ] = await Promise.all([
        supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }),
        supabase.from('community_recommendations').select('rating'),
        supabase.from('community_recommendations').select('restaurant_name, rating').order('rating', { ascending: false }),
        supabase.from('chat_sessions').select('id, title, created_at, user_id, ip, country, region, city').order('created_at', { ascending: false }).limit(10),
        supabase.from('profiles').select('id, full_name, email, created_at').order('created_at', { ascending: false }),
        supabase.from('chat_sessions').select('user_id').not('user_id', 'is', null),
        supabase.from('blog_posts').select('user_id').eq('status', 'approved'),
        supabase.from('user_food_spots').select('user_id'),
        supabase.from('food_photos').select('user_id'),
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

      // Per-user contribution counts
      const countMap = (rows: { user_id: string | null }[] | null) => {
        const m = new Map<string, number>();
        (rows || []).forEach(r => {
          if (r.user_id) m.set(r.user_id, (m.get(r.user_id) || 0) + 1);
        });
        return m;
      };
      const blogCounts = countMap(blogAuthorsResult.data);
      const spotCounts = countMap(spotAuthorsResult.data);
      const photoCounts = countMap(photoAuthorsResult.data);

      // Build profiles list with counts, ranked by weighted contribution
      const profilesWithCounts: UserProfile[] = (profilesResult.data || [])
        .map(p => {
          const blog_count = blogCounts.get(p.id) || 0;
          const spot_count = spotCounts.get(p.id) || 0;
          const photo_count = photoCounts.get(p.id) || 0;
          const chat_count = chatCountMap.get(p.id) || 0;
          return {
            ...p,
            chat_count,
            blog_count,
            spot_count,
            photo_count,
            contribution_score: contributionScore(blog_count, spot_count, photo_count, chat_count),
          };
        })
        .sort((a, b) => b.contribution_score - a.contribution_score
          || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
      <div className="flex items-center justify-center min-h-full bg-background">
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
    <div className="min-h-full bg-background">
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
                {stats?.recentSessions.map(s => {
                  const place = [s.city, s.region].filter(Boolean).join(', ');
                  const location = [countryFlag(s.country), place || s.country].filter(Boolean).join(' ').trim();
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{s.title || 'Untitled chat'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{s.user_email}</p>
                        {(location || s.ip) && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {location}{location && s.ip ? ' · ' : ''}{s.ip && <span className="font-mono">{s.ip}</span>}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Users */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-500" />
              <h2 className="font-semibold text-sm text-foreground">Registered Users</h2>
              <span className="text-xs text-muted-foreground ml-1">({users.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Populate the template if the fields are empty, then open.
                  setOutreachSubject(s => (s.trim() ? s : OUTREACH_SUBJECT));
                  setOutreachBody(b => (b.trim() ? b : OUTREACH_BODY));
                  setOutreachOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/40 hover:bg-primary/15 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Outreach
              </button>
              <button
                onClick={() => openCompose()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/40 hover:bg-primary/15 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Compose to anyone
              </button>
            </div>
          </div>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No users yet.</p>
          ) : (
            <div className="space-y-1">
              {users.map((u, rank) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="w-7 text-center text-sm shrink-0" title={`Rank #${rank + 1}`}>
                      {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : (
                        <span className="text-xs text-muted-foreground">#{rank + 1}</span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.full_name || '—'}</p>
                        <span className="shrink-0 text-[10px] font-medium text-orange-300 bg-primary/15 border border-primary/30 px-1.5 py-0.5 rounded-full">
                          {getLevel(u.contribution_score).emoji} {getLevel(u.contribution_score).name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {u.blog_count} blogs · {u.spot_count} spots · {u.photo_count} photos · {u.chat_count} chats
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      <p className="text-sm font-semibold text-primary">{u.contribution_score}</p>
                      <p className="text-[10px] text-muted-foreground">score</p>
                    </div>
                    <button
                      onClick={() => openCompose(u.email, u.full_name || '')}
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

        {/* Weekly Digest — manual, admin-controlled (no cron) */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Newspaper className="h-4 w-4 text-violet-500" />
            <h2 className="font-semibold text-sm text-foreground">Weekly Digest</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            A roundup of the past 7 days — new spots, stories, photos, and level-ups. Sends only when you click; subscribers can unsubscribe from the email.
          </p>

          {digestPreview && (
            <div className="mb-4 rounded-xl border border-border bg-background/50 p-3">
              {digestPreview.quiet ? (
                <p className="text-xs text-muted-foreground">No activity in the last 7 days — a real send would skip this week.</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
                  <span>🍽️ {digestPreview.spots} spots</span>
                  <span>📖 {digestPreview.blogs} stories</span>
                  <span>📸 {digestPreview.photos} photos</span>
                  <span>🎉 {digestPreview.levelUps} level-ups</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={previewDigest} disabled={digestBusy !== null}>
              {digestBusy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Preview this week
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={testDigest} disabled={digestBusy !== null}>
              {digestBusy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Test to me
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setDigestConfirmOpen(true)} disabled={digestBusy !== null}>
              {digestBusy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send to all
            </Button>
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

      {/* Compose mail — registered user or any address */}
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent className="max-w-md dark">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Mail className="h-4 w-4 text-primary" /> Send an email
            </DialogTitle>
            <DialogDescription>
              Sent from admin@wasp-mlr.com in the Wassup MLR branded template, greeting them by first name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">To</label>
                <Input
                  type="email"
                  value={mailToEmail}
                  onChange={e => setMailToEmail(e.target.value)}
                  placeholder="someone@example.com"
                  disabled={mailSending}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Name <span className="text-muted-foreground font-normal">(for the greeting)</span>
                </label>
                <Input
                  value={mailToName}
                  onChange={e => setMailToName(e.target.value)}
                  placeholder="e.g. Priya"
                  disabled={mailSending}
                />
              </div>
            </div>
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
            <Button onClick={sendMailToUser} disabled={mailSending || !mailToEmail.trim() || !mailSubject.trim() || !mailBody.trim()} className="w-full gap-2">
              {mailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Outreach — invite potential users to try the app and blog */}
      <Dialog open={outreachOpen} onOpenChange={setOutreachOpen}>
        <DialogContent className="max-w-lg dark">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Send className="h-4 w-4 text-primary" /> Outreach email
            </DialogTitle>
            <DialogDescription>
              Invite people to try Wassup MLR and write up their experience. Sent from the branded team
              template — the "Hey &lt;name&gt;!" greeting and "The Wassup MLR team" sign-off are added automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Recipients <span className="text-muted-foreground font-normal">— one per line: <code>email</code>, <code>Name &lt;email&gt;</code>, or <code>Name, email</code></span>
              </label>
              <Textarea
                value={outreachRecipients}
                onChange={e => setOutreachRecipients(e.target.value)}
                placeholder={"priya@example.com\nRahul Shenoy <rahul@example.com>\nAnita, anita@example.com"}
                className="min-h-[110px] resize-none font-mono text-xs"
                disabled={outreachSending}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {outreachValid.length} valid recipient{outreachValid.length === 1 ? '' : 's'} · each person is greeted by their own name
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Subject</label>
              <Input
                value={outreachSubject}
                onChange={e => setOutreachSubject(e.target.value)}
                maxLength={200}
                disabled={outreachSending}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">Message</label>
                <button
                  type="button"
                  onClick={() => { setOutreachSubject(OUTREACH_SUBJECT); setOutreachBody(OUTREACH_BODY); }}
                  className="text-xs text-primary hover:underline"
                >
                  Reset to template
                </button>
              </div>
              <Textarea
                value={outreachBody}
                onChange={e => setOutreachBody(e.target.value)}
                className="min-h-[200px] resize-none"
                maxLength={5000}
                disabled={outreachSending}
              />
            </div>
            <Button
              onClick={sendOutreach}
              disabled={outreachSending || outreachValid.length === 0 || !outreachSubject.trim() || !outreachBody.trim()}
              className="w-full gap-2"
            >
              {outreachSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {outreachValid.length || 0} {outreachValid.length === 1 ? 'person' : 'people'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm full digest send */}
      <Dialog open={digestConfirmOpen} onOpenChange={setDigestConfirmOpen}>
        <DialogContent className="max-w-md dark">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Send className="h-4 w-4 text-primary" /> Send the weekly digest?
            </DialogTitle>
            <DialogDescription>
              This emails the past-7-days roundup to every subscribed user (everyone who hasn't opted out). Each person gets it at most once this week. If there's been no activity, nothing is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDigestConfirmOpen(false)}>Cancel</Button>
            <Button onClick={sendDigestToAll} className="gap-2">
              <Send className="h-4 w-4" />
              Send to all
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
