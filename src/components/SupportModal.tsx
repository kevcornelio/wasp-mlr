import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, LifeBuoy, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SupportModal = ({ open, onOpenChange }: Props) => {
  const { user, profile } = useAuth();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const fromEmail = user?.email || email.trim();

  const send = async () => {
    if (message.trim().length < 10) {
      toast.error('Please write at least a short message (10+ characters)');
      return;
    }
    setSending(true);
    try {
      const resp = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          from_email: fromEmail || null,
          from_name: profile?.full_name || user?.email?.split('@')[0] || null,
        }),
      });
      if (!resp.ok) throw new Error('send failed');
      toast.success("Message sent! We'll get back to you soon 🙌");
      setMessage('');
      setEmail('');
      onOpenChange(false);
    } catch {
      toast.error('Could not send — please email admin@wasp-mlr.com directly');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-primary" /> Contact Support
          </DialogTitle>
          <DialogDescription>
            Questions, feedback, or something broken? Send us a note — it goes straight to the Wassup MLR team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!user && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Your email <span className="text-muted-foreground font-normal">(so we can reply)</span>
              </label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={sending}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Message</label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us what's up…"
              className="min-h-[120px] resize-none"
              maxLength={3000}
              disabled={sending}
            />
          </div>
          <Button onClick={send} disabled={sending || !message.trim()} className="w-full gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send message
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">
            Or email us directly: <a href="mailto:admin@wasp-mlr.com" className="text-primary hover:underline">admin@wasp-mlr.com</a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SupportModal;
