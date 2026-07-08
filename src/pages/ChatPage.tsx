import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, UtensilsCrossed, MapPin, Loader2, History, Plus, LogOut, Trash2, Settings, Utensils, Heart, BookOpen, ChevronRight, Calendar, Camera, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getAnonSupabaseClient } from '@/lib/anonSupabase';
import { getDeviceId } from '@/lib/deviceId';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import ChatFeedback from '@/components/ChatFeedback';
import SaveRecommendationModal from '@/components/SaveRecommendationModal';
import SupportModal from '@/components/SupportModal';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { isAdminEmail } from '@/lib/admin';
import { contributionScore, getLevel, getNextLevel } from '@/lib/levels';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = '/api/chat';

// Pool of quick-prompt suggestions with topic keywords used to avoid repeating
// questions similar to ones the user has already asked before.
const QUICK_PROMPT_POOL: { text: string; keywords: string[] }[] = [
  { text: "I'm craving something spicy, suggest something!", keywords: ['spicy', 'spice'] },
  { text: "Date night dinner for two — where should we go?", keywords: ['date night', 'romantic', 'couple'] },
  { text: "Late night food options in Mangalore?", keywords: ['late night', 'midnight'] },
  { text: "What's the vibe for a Sunday family lunch?", keywords: ['family', 'sunday lunch'] },
  { text: "Best places for authentic Mangalorean seafood?", keywords: ['seafood', 'fish', 'prawn', 'crab'] },
  { text: "Where can I get a good biryani nearby?", keywords: ['biryani'] },
  { text: "Budget-friendly eats for a student?", keywords: ['budget', 'cheap', 'student'] },
  { text: "Best breakfast spots for dosa or idli?", keywords: ['breakfast', 'dosa', 'idli'] },
  { text: "Where should I go for a birthday celebration?", keywords: ['birthday', 'celebration', 'party'] },
  { text: "Looking for a quiet café to work from — any suggestions?", keywords: ['cafe', 'café', 'coffee', 'work'] },
  { text: "Craving something sweet — best dessert places?", keywords: ['dessert', 'sweet', 'ice cream'] },
  { text: "Rainy day comfort food recommendations?", keywords: ['rain', 'monsoon', 'comfort'] },
  { text: "Best rooftop or outdoor dining spots?", keywords: ['rooftop', 'outdoor', 'view'] },
  { text: "Quick bite before catching a movie?", keywords: ['quick bite', 'movie', 'fast food'] },
  { text: "Vegetarian-friendly restaurants with great variety?", keywords: ['vegetarian', 'veg'] },
  { text: "Where do locals actually eat — hidden gems?", keywords: ['local', 'hidden gem', 'authentic'] },
  { text: "Good spot for a large group hangout?", keywords: ['group', 'hangout', 'friends'] },
  { text: "Best North Indian food in Mangalore?", keywords: ['north indian', 'punjabi'] },
  { text: "Healthy meal options nearby?", keywords: ['healthy', 'diet', 'salad'] },
  { text: "Something new I haven't tried before?", keywords: ['new', 'explore', 'try'] },
];

// Emoji shown on quick-prompt cards, cycled by position.
const PROMPT_EMOJIS = ['🌶️', '🍛', '🦐', '☕', '🍰', '🥘', '🍜', '🍢'];

// Words that only start a genuine question — used to decide whether a "?" belongs.
const INTERROGATIVE_START =
  /^(what|what's|where|which|who|how|when|why|is|are|can|could|should|would|will|do|does|did|any|got)\b/i;

// Cleans up a raw session title (past user message) into a readable prompt.
const formatPastPrompt = (title: string): string => {
  // Remove trailing ellipsis from 50-char truncation
  let t = title.replace(/\.{2,}$/, '').trim();
  // Capitalize first letter
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Add a question mark only when it actually reads as a question;
  // statements like "I want biryani" stay as-is.
  if (!/[.?!]$/.test(t) && INTERROGATIVE_START.test(t)) t += '?';
  return t;
};

const FOOD_KEYWORDS = [
  'food', 'eat', 'restaurant', 'cafe', 'café', 'hotel', 'dine', 'dining', 'dinner', 'lunch',
  'breakfast', 'brunch', 'snack', 'bite', 'meal', 'dish', 'cuisine', 'menu', 'cook', 'recipe',
  'hungry', 'craving', 'drink', 'juice', 'coffee', 'tea', 'dessert', 'sweet', 'spicy', 'biryani',
  'dosa', 'idli', 'fish', 'seafood', 'chicken', 'mutton', 'veg', 'vegetarian', 'buffet',
  'mangalore', 'mlr', 'udupi', 'mangalorean',
];

// Matches a keyword only as a whole word ("eat" must not match "great" or
// "weather"), using letter guards instead of \b so accented keywords work too.
const isFoodRelated = (title: string): boolean => {
  const lower = title.toLowerCase();
  return FOOD_KEYWORDS.some((k) =>
    new RegExp(`(^|[^a-zà-ÿ])${k}([^a-zà-ÿ]|$)`).test(lower)
  );
};

// Returns true if the title was NOT cut off mid-sentence by the 50-char truncation.
// Truncated titles end with "..." and form incomplete, nonsensical questions.
const isComplete = (title: string): boolean => !title.trimEnd().endsWith('...');

// Filters out greetings, acknowledgements, and fragments too short to be a
// real question ("hi", "thanks", "ok try that").
const isSubstantial = (title: string): boolean => {
  const t = title.trim();
  return t.length >= 15 && t.split(/\s+/).length >= 3;
};

// Turns a blog's restaurant list ("Pabbas, Machli, ...") into one question.
const promptFromBlog = (restaurantName: string | null): string | null => {
  const first = restaurantName?.split(',')[0]?.trim();
  return first ? `What should I try at ${first}?` : null;
};

// Turns a community food spot into a question about its signature dish.
const promptFromSpot = (spot: { restaurant_name: string; dish: string | null }): string => {
  const dish = spot.dish?.trim();
  return dish
    ? `Where can I get good ${dish}?`
    : `Is ${spot.restaurant_name} worth a visit?`;
};

// Builds the full rotating candidate list: past questions, blog-derived and
// spot-derived questions round-robin interleaved (so every window of 4 is a
// mixture of sources), padded with the built-in pool, deduplicated.
const buildPromptCandidates = (
  pastTitles: string[],
  blogs: { restaurant_name: string | null }[],
  spots: { restaurant_name: string; dish: string | null }[],
): string[] => {
  const past = pastTitles
    .filter((t) => isComplete(t) && isSubstantial(t) && isFoodRelated(t))
    .slice(0, 8)
    .map(formatPastPrompt);
  const fromBlogs = blogs.map((b) => promptFromBlog(b.restaurant_name)).filter(Boolean) as string[];
  const fromSpots = spots.slice(0, 8).map(promptFromSpot);
  const pool = QUICK_PROMPT_POOL.map((p) => p.text);

  const sources = [past, fromBlogs, fromSpots, pool];
  const interleaved: string[] = [];
  const longest = Math.max(...sources.map((s) => s.length));
  for (let i = 0; i < longest; i++) {
    for (const source of sources) {
      if (i < source.length) interleaved.push(source[i]);
    }
  }

  const seen = new Set<string>();
  return interleaved.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ChatPage = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [extractedPlaces, setExtractedPlaces] = useState<string[]>([]);
  const [saveRecommendationOpen, setSaveRecommendationOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  // Signed-in user's contribution score, for their food level
  const [myScore, setMyScore] = useState<number | null>(null);
  const [selectedRestaurantForSave, setSelectedRestaurantForSave] = useState('');
  const [latestBlogs, setLatestBlogs] = useState<{
    id: string;
    title: string;
    content: string;
    author_name: string;
    restaurant_name: string | null;
    created_at: string;
  }[]>([]);
  const [latestPhotos, setLatestPhotos] = useState<{ id: string; photo_url: string; caption: string | null }[]>([]);
  const [foodSpots, setFoodSpots] = useState<{ restaurant_name: string; dish: string | null }[]>([]);
  // Like/comment counts for home-page blog cards and photo tiles, keyed by row id
  const [engagement, setEngagement] = useState<Record<string, { likes: number; comments: number }>>({});
  const [promptOffset, setPromptOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use authenticated client for logged-in users, anon client otherwise
  const db = useMemo(() => (user ? supabase : getAnonSupabaseClient()), [user]);

  // Rotating quick prompts — a mixture of the user's past questions and
  // questions generated from submitted blogs and community food spots.
  const promptCandidates = useMemo(
    () => buildPromptCandidates(sessions.map((s) => s.title), latestBlogs, foodSpots),
    [sessions, latestBlogs, foodSpots]
  );

  // Advance the 4-prompt window every few seconds
  useEffect(() => {
    if (promptCandidates.length <= 4) return;
    const timer = setInterval(
      () => setPromptOffset((o) => (o + 4) % promptCandidates.length),
      9000
    );
    return () => clearInterval(timer);
  }, [promptCandidates.length]);

  const quickPrompts = useMemo(() => {
    const count = Math.min(4, promptCandidates.length);
    return Array.from({ length: count }, (_, i) =>
      promptCandidates[(promptOffset + i) % promptCandidates.length]
    );
  }, [promptCandidates, promptOffset]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load sessions list
  useEffect(() => {
    const loadSessions = async () => {
      const { data } = await db
        .from('chat_sessions')
        .select('id, title, created_at')
        .order('updated_at', { ascending: false });
      if (data) setSessions(data);
    };
    loadSessions();
  }, [db]);

  // Load latest approved blogs for home-page preview
  useEffect(() => {
    const loadBlogs = async () => {
      const { data } = await supabase
        .from('blog_posts')
        .select('id, title, content, author_name, restaurant_name, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(3);
      if (data) setLatestBlogs(data);
    };
    loadBlogs();
  }, []);

  // Compute the signed-in user's contribution score for their food level
  useEffect(() => {
    if (!user) { setMyScore(null); return; }
    const load = async () => {
      const [blogs, spots, photos] = await Promise.all([
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'approved'),
        supabase.from('user_food_spots').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('food_photos').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      setMyScore(contributionScore(blogs.count ?? 0, spots.count ?? 0, photos.count ?? 0));
    };
    load();
  }, [user]);

  const myLevel = myScore !== null ? getLevel(myScore) : null;
  const nextLevel = myScore !== null ? getNextLevel(myScore) : null;

  // Load spot data for quick-prompt suggestions. Direct table reads are
  // RLS-scoped to the owner, so this uses a dedicated RPC that exposes only
  // restaurant name + one dish from the whole community pool.
  useEffect(() => {
    const loadSpots = async () => {
      // RPC not in generated types (matches existing `as any` pattern here)
      const { data } = await (supabase.rpc as any)('get_spot_prompt_data', { max_rows: 8 });
      if (data) setFoodSpots(data);
    };
    loadSpots();
  }, []);

  // Load like/comment counts for the previewed blogs and photos
  useEffect(() => {
    const blogIds = latestBlogs.map(b => b.id);
    const photoIds = latestPhotos.map(p => p.id);
    if (blogIds.length === 0 && photoIds.length === 0) return;

    const countBy = (rows: Record<string, string | null>[] | null, col: string) => {
      const map: Record<string, number> = {};
      for (const row of rows ?? []) {
        const id = row[col];
        if (id) map[id] = (map[id] ?? 0) + 1;
      }
      return map;
    };

    const load = async () => {
      // likes/comments tables are not in the generated Supabase types yet
      const sb = supabase as any;
      const [blogLikes, photoLikes, blogComments, photoComments] = await Promise.all([
        blogIds.length ? sb.from('likes').select('blog_post_id').in('blog_post_id', blogIds) : { data: [] },
        photoIds.length ? sb.from('likes').select('photo_id').in('photo_id', photoIds) : { data: [] },
        blogIds.length ? sb.from('comments').select('blog_post_id').in('blog_post_id', blogIds) : { data: [] },
        photoIds.length ? sb.from('comments').select('photo_id').in('photo_id', photoIds) : { data: [] },
      ]);
      const likeMap = { ...countBy(blogLikes.data, 'blog_post_id'), ...countBy(photoLikes.data, 'photo_id') };
      const commentMap = { ...countBy(blogComments.data, 'blog_post_id'), ...countBy(photoComments.data, 'photo_id') };
      const merged: Record<string, { likes: number; comments: number }> = {};
      for (const id of [...blogIds, ...photoIds]) {
        merged[id] = { likes: likeMap[id] ?? 0, comments: commentMap[id] ?? 0 };
      }
      setEngagement(merged);
    };
    load();
  }, [latestBlogs, latestPhotos]);

  // Load latest food photos for home-page preview
  useEffect(() => {
    const loadPhotos = async () => {
      const { data } = await supabase
        .from('food_photos')
        .select('id, photo_url, caption')
        .order('created_at', { ascending: false })
        .limit(6);
      if (data) setLatestPhotos(data);
    };
    loadPhotos();
  }, []);

  const loadSession = async (sessionId: string) => {
    const { data } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (data) {
      setMessages(data as Msg[]);
      setActiveSessionId(sessionId);
      setShowHistory(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    await db.from('chat_sessions').delete().eq('id', sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setMessages([]);
      setActiveSessionId(null);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setActiveSessionId(null);
    setShowHistory(false);
  };

  const saveMessage = async (sessionId: string, role: string, content: string) => {
    await db.from('chat_messages').insert({ session_id: sessionId, role, content });
  };

  const createOrGetSession = async (firstMessage: string): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');

    const insertData: Record<string, unknown> = { title };
    if (user) {
      insertData.user_id = user.id;
    } else {
      insertData.device_id = getDeviceId();
    }

    const { data } = await db
      .from('chat_sessions')
      .insert(insertData as any)
      .select('id')
      .single();
    const id = data!.id;
    setActiveSessionId(id);
    setSessions(prev => [{ id, title, created_at: new Date().toISOString() }, ...prev]);
    return id;
  };

  const streamChat = async (allMessages: Msg[]) => {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: allMessages,
        user_id: user?.id ?? null,
        device_id: user ? null : getDeviceId(),
      }),
    });

    if (!resp.ok || !resp.body) {
      const err = await resp.json().catch(() => ({ error: 'Failed to connect' }));
      throw new Error(err.error || 'Stream failed');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = '';
    let assistantSoFar = '';

    const updateAssistant = (text: string) => {
      assistantSoFar = text;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    let streamDone = false;
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'message_stop') { streamDone = true; break; }
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const content = parsed.delta.text;
            if (content) updateAssistant(assistantSoFar + content);
          }
        } catch {
          textBuffer = line + '\n' + textBuffer;
          break;
        }
      }
    }

    return assistantSoFar;
  };

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    try {
      const sessionId = await createOrGetSession(text.trim());
      await saveMessage(sessionId, 'user', text.trim());

      const assistantContent = await streamChat(newMessages);

      if (sessionId && assistantContent) {
        await saveMessage(sessionId, 'assistant', assistantContent);
        await db.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
        
        // Extract place names from response for feedback
        const places = extractPlaces(assistantContent);
        if (places.length > 0) {
          setExtractedPlaces(places);
          setShowFeedback(true);
        }
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // Extract restaurant names from the structured [PLACES: ...] tag the AI appends
  const extractPlaces = (text: string): string[] => {
    const match = text.match(/\[PLACES:\s*(.+?)\]/i);
    if (!match) return [];
    return match[1]
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 2)
      .slice(0, 6);
  };

  // Strip the [PLACES: ...] tag from displayed messages
  const cleanMessage = (content: string) => content.replace(/\[PLACES:\s*.+?\]/gi, '').trim();

  // Extract the first restaurant name from [PLACES: ...] tag for Save Recommendation modal
  const getFirstRestaurantFromMessage = (content: string): string => {
    const match = content.match(/\[PLACES:\s*([^\]]+)\]/i);
    if (!match) return '';
    const restaurants = match[1].split(',').map(r => r.trim());
    return restaurants[0] || '';
  };

  const handleFeedbackSubmit = async (items: { place: string; visited: boolean; rating: number; comment: string }[]) => {
    if (!activeSessionId) return;
    const payload = items.map(item => ({
      session_id: activeSessionId,
      place_name: item.place,
      visited: true,
      rating: item.rating || null,
      comment: item.comment || null,
      ...(user ? { user_id: user.id } : { device_id: getDeviceId() }),
    }));
    await db.from('chat_feedback').insert(payload as any);
    setShowFeedback(false);
  };

  const firstName = profile?.full_name?.split(' ')[0] || '';

  const sidebarNav = [
    { label: 'Chat', icon: UtensilsCrossed, path: '/chat' },
    { label: 'Add Food Spot', icon: Utensils, path: '/spots' },
    { label: 'Food Photos', icon: Camera, path: '/photos' },
    { label: 'Blog', icon: BookOpen, path: '/blog' },
    { label: 'Preferences', icon: Settings, path: '/preferences' },
    ...(isAdminEmail(user?.email) ? [{ label: 'Admin', icon: ShieldCheck, path: '/admin' }] : []),
  ];

  return (
    <div className="flex h-screen w-full bg-[hsl(222,45%,13%)]">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 sidebar-gradient border-r border-white/10 h-full">
        {/* Brand — click to return home */}
        <button
          onClick={startNewChat}
          className="group flex items-center gap-2.5 px-4 py-4 border-b border-white/10 text-left hover:bg-white/5 transition-colors"
        >
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-red-500 flex items-center justify-center shadow-md shadow-primary/40 shrink-0 group-hover:rotate-[-8deg] group-hover:scale-105 transition-transform duration-200">
            <UtensilsCrossed className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-base leading-none tracking-tight" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
              <span className="text-white">Wassup</span>{' '}
              <span className="text-gradient-bright">MLR</span>
            </span>
            {user && firstName && (
              <p className="text-[11px] text-white/50 leading-none mt-0.5">Hey {firstName}!</p>
            )}
            {myLevel && (
              <p className="text-[10px] text-orange-300 leading-none mt-1" title={`Contribution score: ${myScore}`}>
                {myLevel.emoji} {myLevel.name}
              </p>
            )}
          </div>
        </button>

        {/* Nav links */}
        <nav className="px-2 py-3 space-y-0.5">
          {sidebarNav.map(item => (
            <button
              key={item.path}
              onClick={() => (item.path === '/chat' ? startNewChat() : navigate(item.path))}
              className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-white/80 hover:bg-white/10 hover:text-white hover:translate-x-0.5"
            >
              <item.icon className="h-4 w-4 shrink-0 text-white/40 group-hover:text-orange-300 transition-colors" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mx-4 border-t border-white/10 my-1" />

        {/* New chat button */}
        <div className="px-2 py-2">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Plus className="h-4 w-4 shrink-0 text-white/40" />
            New chat
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-3 mb-1">Recent</p>
          {sessions.length === 0 ? (
            <p className="text-xs text-white/40 px-3 py-1">No conversations yet.</p>
          ) : (
            <div className="space-y-0.5">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center group">
                  <button
                    onClick={() => loadSession(s.id)}
                    className={`flex-1 text-left text-xs px-3 py-2 rounded-lg transition-colors truncate ${
                      activeSessionId === s.id
                        ? 'bg-primary/25 text-orange-200 font-medium'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-white/40 hover:text-red-400 transition-all rounded-md shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact support — prominent */}
        <div className="px-2 py-2 border-t border-white/10">
          <button
            onClick={() => setSupportOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-orange-200 bg-primary/15 border border-primary/30 hover:bg-primary/25 hover:border-primary/50 transition-all"
          >
            <LifeBuoy className="h-4 w-4 shrink-0" />
            Contact Support
          </button>
        </div>

        {/* Sign in / out */}
        <div className="px-2 py-3 border-t border-white/10">
          {user ? (
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:bg-white/10 hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          ) : (
            <a
              href="/auth"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-orange-300 hover:bg-white/10 transition-colors"
            >
              Sign in
            </a>
          )}
        </div>
      </aside>

      {/* ── Main chat column ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        {/* Mobile-only header */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-white/10 sidebar-gradient sticky top-0 z-10">
          <button onClick={startNewChat} className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-red-500 flex items-center justify-center shadow-md shadow-primary/40">
              <UtensilsCrossed className="h-4 w-4 text-white" />
            </div>
            <span className="text-base leading-none tracking-tight" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
              <span className="text-white">Wassup</span>{' '}
              <span className="text-gradient-bright">MLR</span>
            </span>
          </button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={startNewChat} className="h-8 text-xs gap-1.5 rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className={`h-8 text-xs gap-1.5 rounded-lg text-white/80 hover:bg-white/10 hover:text-white ${showHistory ? 'bg-white/15 text-white' : ''}`}>
              <History className="h-3.5 w-3.5" /> History
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/spots')} className="h-8 w-8 p-0 rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
              <Utensils className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/photos')} className="h-8 w-8 p-0 rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
              <Camera className="h-3.5 w-3.5" />
            </Button>
            {user ? (
              <Button variant="ghost" size="sm" onClick={() => signOut()} className="h-8 w-8 p-0 rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <a href="/auth" className="text-xs text-orange-300 font-medium hover:underline px-2">Sign in</a>
            )}
          </div>
        </div>

        {/* Mobile history dropdown */}
        {showHistory && (
          <div className="md:hidden border-b border-white/10 bg-[hsl(222,45%,11%)]/95 backdrop-blur-md px-4 py-3 max-h-56 overflow-y-auto shadow-md">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Recent conversations</h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-white/40 py-2">No conversations yet.</p>
            ) : (
              <div className="space-y-0.5">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between group">
                    <button
                      onClick={() => loadSession(s.id)}
                      className={`flex-1 text-left text-xs px-2.5 py-2 rounded-lg transition-colors truncate ${
                        activeSessionId === s.id
                          ? 'bg-primary/25 text-orange-200 font-medium'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {s.title}
                    </button>
                    <button
                      onClick={() => deleteSession(s.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-white/40 hover:text-red-400 transition-all rounded-md"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            // Desktop: two-column hero. Mobile: stacked
            <div className="hero-photo min-h-full flex flex-col md:flex-row">

              {/* LEFT — hero text */}
              <div className="relative md:w-2/5 flex flex-col justify-start px-10 pt-12 pb-10 gap-6 text-left md:sticky md:top-0 md:self-start">
                {/* Floating food accents */}
                <span aria-hidden className="hidden md:block absolute top-24 right-10 text-5xl float-slow select-none drop-shadow-sm">🍜</span>
                <span aria-hidden className="hidden md:block absolute top-1/2 right-20 text-4xl float-slower select-none drop-shadow-sm">🦐</span>
                <span aria-hidden className="hidden md:block absolute bottom-24 left-12 text-4xl float-slow select-none drop-shadow-sm" style={{ animationDelay: '1.5s' }}>🥘</span>

                <div className="fade-up flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-orange-200 text-xs font-medium w-fit backdrop-blur-md">
                    <span className="relative flex h-2 w-2">
                      <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-primary" />
                    </span>
                    Mangalore's AI Food Guide
                  </span>
                  {myLevel && (
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/40 text-orange-200 text-xs font-medium w-fit backdrop-blur-md"
                      title={nextLevel ? `${nextLevel.min - (myScore ?? 0)} points to ${nextLevel.name}` : 'Max level!'}
                    >
                      {myLevel.emoji} {myLevel.name}
                      {nextLevel && (
                        <span className="text-white/50">· {nextLevel.min - (myScore ?? 0)} pts to {nextLevel.emoji}</span>
                      )}
                    </span>
                  )}
                </div>
                <h1 className="fade-up fade-up-1 text-5xl xl:text-7xl text-white leading-[1.05] tracking-tight drop-shadow-lg" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
                  {user && firstName
                    ? <><span className="text-gradient-warm">{firstName},</span><br />what's<br />the craving?</>
                    : <>Find your<br />next <span className="text-gradient-warm">favourite</span><br />meal.</>
                  }
                </h1>
                <p className="fade-up fade-up-2 text-white/70 text-base leading-relaxed max-w-xs">
                  Tell me your mood, who you're with, or what you're craving. I'll find the perfect dish and spot in Mangalore.
                </p>
                <p className="fade-up fade-up-3 md:hidden text-xs text-white/40">
                  Need help?{' '}
                  <button onClick={() => setSupportOpen(true)} className="text-orange-300 hover:underline">
                    Contact support
                  </button>
                </p>
              </div>

              {/* RIGHT — prompts + content */}
              <div className="md:w-3/5 flex flex-col gap-5 px-8 py-12">

                {/* Quick prompts — rotating mixture of past questions, blogs, and spots */}
                <div className="fade-up fade-up-2">
                <div key={promptOffset} className="fade-in grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={prompt}
                      onClick={() => send(prompt)}
                      className="group flex items-start gap-3 px-4 py-4 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/[0.18] hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 text-white transition-all duration-200 text-left"
                    >
                      <span className="mt-0.5 h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-sm group-hover:bg-primary/30 group-hover:scale-110 transition-all duration-200">
                        {PROMPT_EMOJIS[i % PROMPT_EMOJIS.length]}
                      </span>
                      <span className="text-sm leading-snug">{prompt}</span>
                    </button>
                  ))}
                </div>
                </div>

                {/* Latest blogs */}
                {latestBlogs.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-orange-300" />
                        <h2 className="text-sm font-semibold text-white tracking-tight">Latest food stories</h2>
                      </div>
                      <button onClick={() => navigate('/blog')} className="text-xs text-orange-300 font-medium hover:underline flex items-center gap-0.5">
                        View all <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {latestBlogs.map((blog) => (
                        <button
                          key={blog.id}
                          onClick={() => navigate(`/blog/${blog.id}`)}
                          className="group w-full text-left bg-white/10 hover:bg-white/[0.18] backdrop-blur-md border border-white/15 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 rounded-2xl px-4 py-3 transition-all"
                        >
                          <h3 className="font-semibold text-sm text-white group-hover:text-orange-300 transition-colors leading-snug line-clamp-1">{blog.title}</h3>
                          <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-2">{blog.content}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {blog.restaurant_name && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-orange-200 font-medium bg-primary/20 px-1.5 py-0.5 rounded-full">
                                <MapPin className="h-2.5 w-2.5" />{blog.restaurant_name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] text-white/50">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(blog.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className="text-[10px] text-white/50">by {blog.author_name}</span>
                            <span className="inline-flex items-center gap-1.5 text-[10px] text-white/50 ml-auto">
                              <span className="inline-flex items-center gap-0.5">
                                <Heart className="h-2.5 w-2.5" />{engagement[blog.id]?.likes ?? 0}
                              </span>
                              <span className="inline-flex items-center gap-0.5">
                                <MessageSquare className="h-2.5 w-2.5" />{engagement[blog.id]?.comments ?? 0}
                              </span>
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Latest photos */}
                {latestPhotos.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-orange-300" />
                        <h2 className="text-sm font-semibold text-white tracking-tight">Food photos</h2>
                      </div>
                      <button onClick={() => navigate('/photos')} className="text-xs text-orange-300 font-medium hover:underline flex items-center gap-0.5">
                        View all <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {latestPhotos.map(photo => (
                        <button
                          key={photo.id}
                          onClick={() => navigate('/photos')}
                          className="group relative aspect-square rounded-xl overflow-hidden border border-white/20 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 transition-all"
                        >
                          <img src={photo.photo_url} alt={photo.caption ?? 'Food photo'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          {((engagement[photo.id]?.likes ?? 0) > 0 || (engagement[photo.id]?.comments ?? 0) > 0) && (
                            <div className="absolute top-1 right-1 flex items-center gap-1 bg-black/60 rounded-full px-1.5 py-0.5 text-[9px] text-white">
                              {(engagement[photo.id]?.likes ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Heart className="h-2.5 w-2.5 fill-white" />{engagement[photo.id].likes}
                                </span>
                              )}
                              {(engagement[photo.id]?.comments ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5">
                                  <MessageSquare className="h-2.5 w-2.5" />{engagement[photo.id].comments}
                                </span>
                              )}
                            </div>
                          )}
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-[9px] text-white truncate">{photo.caption}</p>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in`}>
                  <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-primary to-red-500 text-white rounded-br-sm shadow-md shadow-primary/25'
                          : 'bg-white/10 backdrop-blur-sm border border-white/10 text-white rounded-bl-sm shadow-sm'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm prose-invert max-w-none [&_ul]:mt-1 [&_li]:mt-0.5 [&_p]:mt-1 [&_p:first-child]:mt-0">
                          <ReactMarkdown components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2 hover:opacity-75 transition-opacity">
                                {children}
                              </a>
                            )
                          }}>{cleanMessage(msg.content)}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === 'assistant' && msg.content.includes('[PLACES:') && (
                      <button
                        onClick={() => {
                          const restaurant = getFirstRestaurantFromMessage(msg.content);
                          setSelectedRestaurantForSave(restaurant);
                          setSaveRecommendationOpen(true);
                        }}
                        className="self-start flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-orange-300 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Heart className="h-3.5 w-3.5" />
                        Save This
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start px-4 max-w-4xl mx-auto fade-in">
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          {showFeedback && extractedPlaces.length > 0 && !isLoading && (
            <div className="mt-2 px-4 max-w-4xl mx-auto fade-in">
              <ChatFeedback places={extractedPlaces} onSubmit={handleFeedbackSubmit} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 px-6 py-4 sidebar-gradient">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3 items-end rounded-3xl border border-white/15 focus-within:border-primary/60 bg-white/10 backdrop-blur-md px-5 py-3 shadow-lg shadow-black/20 focus-within:shadow-primary/20 transition-all duration-200">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What are you craving? 🍛"
                className="flex-1 min-h-[48px] max-h-48 resize-none border-0 bg-transparent text-lg px-0 py-0 shadow-none focus-visible:ring-0 text-white placeholder:text-white/40 leading-relaxed"
                rows={1}
              />
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                className="rounded-2xl h-12 px-6 shrink-0 bg-gradient-to-br from-primary to-red-500 hover:opacity-90 hover:scale-[1.03] active:scale-[0.98] shadow-md shadow-primary/40 text-base font-semibold gap-2 self-end transition-all duration-200 disabled:opacity-40"
              >
                <Send className="h-5 w-5" />
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
            {!user && (
              <p className="text-center text-xs text-white/50 mt-3">
                <a href="/auth" className="text-orange-300 font-medium hover:underline">Sign in</a> to sync chat history across devices
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Support Modal */}
      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />

      {/* Save Recommendation Modal */}
      <SaveRecommendationModal
        open={saveRecommendationOpen}
        onOpenChange={setSaveRecommendationOpen}
        restaurantName={selectedRestaurantForSave}
        sessionId={activeSessionId || undefined}
        onSuccess={() => {}}
      />
    </div>
  );
};

export default ChatPage;
