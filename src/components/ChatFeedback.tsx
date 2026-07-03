import { useState } from 'react';
import { Check, Star, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type FeedbackItem = {
  place: string;
  visited: boolean;
  rating: number;
  comment: string;
};

type Props = {
  places: string[];
  onSubmit: (items: FeedbackItem[]) => Promise<void>;
};

const ChatFeedback = ({ places, onSubmit }: Props) => {
  const [expanded, setExpanded] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>(
    places.map(p => ({ place: p, visited: false, rating: 0, comment: '' }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (idx: number, patch: Partial<FeedbackItem>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleSubmit = async () => {
    const visited = items.filter(i => i.visited);
    if (visited.length === 0) { toast.error('Mark at least one place you visited'); return; }
    setSubmitting(true);
    await onSubmit(items.filter(i => i.visited));
    setSubmitted(true);
    setSubmitting(false);
    toast.success('Thanks for the feedback! 🎉');
  };

  if (submitted) {
    return (
      <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-3 text-center">
        <p className="text-xs text-white/60">✅ Feedback submitted — thanks!</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-white hover:bg-white/10 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 text-orange-300" />
          Did you visit any of these places?
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className={`rounded-lg border p-2.5 transition-colors ${item.visited ? 'border-primary/50 bg-primary/15' : 'border-white/15'}`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => update(idx, { visited: !item.visited })}
                  className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    item.visited ? 'bg-primary border-primary' : 'border-white/30'
                  }`}
                >
                  {item.visited && <Check className="h-3 w-3 text-primary-foreground" />}
                </button>
                <span className="text-xs font-medium text-white flex-1">{item.place}</span>
              </div>
              {item.visited && (
                <div className="mt-2 pl-7 space-y-1.5">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => update(idx, { rating: item.rating === n ? 0 : n })}>
                        <Star className={`h-3.5 w-3.5 ${n <= item.rating ? 'fill-warning text-warning' : 'text-white/40'}`} />
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="Quick comment (optional)"
                    value={item.comment}
                    onChange={e => update(idx, { comment: e.target.value })}
                    className="h-7 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
              )}
            </div>
          ))}
          <Button size="sm" onClick={handleSubmit} disabled={submitting} className="w-full text-xs mt-1">
            Submit Feedback
          </Button>
        </div>
      )}
    </div>
  );
};

export default ChatFeedback;
