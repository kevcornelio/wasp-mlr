import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, UtensilsCrossed, MapPin, Loader2, History, Plus, LogOut, Trash2, Settings, Utensils, Heart } from 'lucide-react';
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

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = '/api/chat';

const QUICK_PROMPTS = [
  "I'm craving something spicy, suggest something!",
  "Date night dinner for two — where should we go?",
  "Late night food options in Mangalore?",
  "What's the vibe for a Sunday family lunch?",
];

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
  const [selectedRestaurantForSave, setSelectedRestaurantForSave] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use authenticated client for logged-in users, anon client otherwise
  const db = useMemo(() => (user ? supabase : getAnonSupabaseClient()), [user]);

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
      body: JSON.stringify({ messages: allMessages }),
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

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto bg-orange-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-orange-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <UtensilsCrossed className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="font-semibold text-sm text-foreground tracking-tight">Wasp MLR</span>
            {user && firstName && (
              <span className="text-xs text-muted-foreground ml-1.5">· Hey {firstName}!</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={startNewChat} className="h-8 text-xs gap-1.5 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className={`h-8 text-xs gap-1.5 rounded-lg ${showHistory ? 'bg-accent' : ''}`}>
            <History className="h-3.5 w-3.5" /> History
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/preferences')} className="h-8 w-8 p-0 rounded-lg">
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/spots')} className="h-8 w-8 p-0 rounded-lg">
            <Utensils className="h-3.5 w-3.5" />
          </Button>
          {user ? (
            <Button variant="ghost" size="sm" onClick={() => { signOut(); }} className="h-8 w-8 p-0 rounded-lg text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <a href="/auth" className="text-xs text-primary font-medium hover:underline px-2">Sign in</a>
          )}
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-border bg-card/95 px-4 py-3 max-h-56 overflow-y-auto shadow-sm">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent conversations</h3>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No conversations yet.</p>
          ) : (
            <div className="space-y-0.5">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between group">
                  <button
                    onClick={() => loadSession(s.id)}
                    className={`flex-1 text-left text-xs px-2.5 py-2 rounded-lg transition-colors truncate ${
                      activeSessionId === s.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all rounded-md"
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
          <div className="hero-bg flex flex-col items-center justify-center min-h-full text-center px-6 py-16 gap-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              <span>🌶️</span> Mangalore's AI Food Guide
            </div>

            {/* Hero text */}
            <div className="space-y-3 max-w-lg">
              <h1 className="text-5xl md:text-6xl text-foreground leading-[1.05] tracking-tight" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
                {user && firstName
                  ? <><span className="text-primary">{firstName},</span><br />what's<br />the craving?</>
                  : <>Find your<br />next <span className="text-primary">favourite</span><br />meal.</>
                }
              </h1>
              <p className="text-muted-foreground text-base leading-relaxed max-w-sm mx-auto">
                Tell me your mood, who you're with, or what you're craving. I'll find the perfect dish and spot in Mangalore.
              </p>
            </div>

            {/* Quick prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="group flex items-start gap-3 px-4 py-3.5 rounded-2xl border border-border bg-card/80 hover:bg-card hover:border-primary/40 hover:shadow-md text-foreground transition-all text-left"
                >
                  <span className="mt-0.5 h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <span className="text-sm leading-snug">{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in`}>
                <div className="flex flex-col gap-2 w-full max-w-[85%]">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-primary to-orange-500 text-white rounded-br-sm'
                        : 'bg-card border border-border text-foreground rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_ul]:mt-1 [&_li]:mt-0.5 [&_p]:mt-1 [&_p:first-child]:mt-0">
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
                      className="self-start flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
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
          <div className="flex justify-start fade-in">
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        {showFeedback && extractedPlaces.length > 0 && !isLoading && (
          <div className="mt-2 fade-in">
            <ChatFeedback places={extractedPlaces} onSubmit={handleFeedbackSubmit} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 bg-card/80 backdrop-blur-sm">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you craving? 🍛"
            className="min-h-[44px] max-h-32 resize-none rounded-xl border-border focus:border-primary/50 bg-background"
            rows={1}
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="rounded-xl h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!user && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            <a href="/auth" className="text-primary font-medium hover:underline">Sign in</a> to sync chat history across devices
          </p>
        )}
      </div>

      {/* Save Recommendation Modal */}
      <SaveRecommendationModal
        open={saveRecommendationOpen}
        onOpenChange={setSaveRecommendationOpen}
        restaurantName={selectedRestaurantForSave}
        sessionId={activeSessionId || undefined}
        onSuccess={() => {
          // Optionally show a success toast here
        }}
      />
    </div>
  );
};

export default ChatPage;
