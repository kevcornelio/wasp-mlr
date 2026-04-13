import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, UtensilsCrossed, MapPin, Loader2, History, Plus, LogOut, Trash2, Settings, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getAnonSupabaseClient } from '@/lib/anonSupabase';
import { getDeviceId } from '@/lib/deviceId';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import ChatFeedback from '@/components/ChatFeedback';

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
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="text-xs text-muted-foreground">
          {user ? (
            <span className="text-foreground font-medium">Hi, {firstName}! 👋</span>
          ) : (
            <>
              Chat history saves on this device.{' '}
              <a href="/auth" className="text-primary font-medium hover:underline">Sign in</a>{' '}
              to sync across devices.
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={startNewChat} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="h-7 text-xs gap-1">
            <History className="h-3 w-3" /> History
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/preferences')} className="h-7 text-xs gap-1">
            <Settings className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/spots')} className="h-7 text-xs gap-1">
            <Utensils className="h-3 w-3" />
          </Button>
          {user && (
            <Button variant="ghost" size="sm" onClick={() => { signOut(); }} className="h-7 text-xs gap-1 text-muted-foreground">
              <LogOut className="h-3 w-3" /> Sign out
            </Button>
          )}
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-border bg-card px-4 py-3 max-h-60 overflow-y-auto">
          <h3 className="text-sm font-medium text-foreground mb-2">Past conversations</h3>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            <div className="space-y-1">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between group">
                  <button
                    onClick={() => loadSession(s.id)}
                    className={`flex-1 text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate ${
                      activeSessionId === s.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UtensilsCrossed className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {user && firstName ? `Hey ${firstName}, Wasp!` : "What's the vibe?"}
              </h2>
              <p className="text-muted-foreground text-sm mt-1 max-w-md">
                Your AI-powered food guide for Mangalore! Tell me your mood, who you're with, or what you're craving — I'll find the perfect dish and place for you.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 max-w-lg justify-center">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors text-left"
                >
                  <MapPin className="h-3 w-3 inline mr-1 text-primary" />
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card border border-border text-foreground rounded-bl-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_ul]:mt-1 [&_li]:mt-0.5 [&_p]:mt-1 [&_p:first-child]:mt-0">
                    <ReactMarkdown>{cleanMessage(msg.content)}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        {showFeedback && extractedPlaces.length > 0 && !isLoading && (
          <div className="mt-2">
            <ChatFeedback places={extractedPlaces} onSubmit={handleFeedbackSubmit} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 bg-background">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's the vibe? Tell me your mood, craving, or occasion..."
            className="min-h-[44px] max-h-32 resize-none rounded-xl"
            rows={1}
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="rounded-xl h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
