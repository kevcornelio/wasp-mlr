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
      <div className="bg-card border border-border rounded-xl p-3 text-center">
        <p className="text-xs text-muted-foreground">✅ Feedback submitted — thanks!</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 text-primary" />
          Did you visit any of these places?
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className={`rounded-lg border p-2.5 transition-colors ${item.visited ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => update(idx, { visited: !item.visited })}
                  className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    item.visited ? 'bg-primary border-primary' : 'border-border'
                  }`}
                >
                  {item.visited && <Check className="h-3 w-3 text-primary-foreground" />}
                </button>
                <span className="text-xs font-medium text-foreground flex-1">{item.place}</span>
              </div>
              {item.visited && (
                <div className="mt-2 pl-7 space-y-1.5">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => update(idx, { rating: item.rating === n ? 0 : n })}>
                        <Star className={`h-3.5 w-3.5 ${n <= item.rating ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="Quick comment (optional)"
                    value={item.comment}
                    onChange={e => update(idx, { comment: e.target.value })}
                    className="h-7 text-xs"
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
