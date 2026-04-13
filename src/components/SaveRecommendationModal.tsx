import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Star, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceId } from '@/lib/deviceId';

interface SaveRecommendationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantName?: string;
  sessionId?: string;
  onSuccess?: () => void;
}

const CUISINE_OPTIONS = [
  'Mangalorean',
  'Seafood',
  'Vegetarian',
  'Vegan',
  'Chinese',
  'North Indian',
  'South Indian',
  'Desserts',
  'Bakery',
  'Cafe',
  'Street Food',
  'Other'
];

const PRICE_RANGE_OPTIONS = [
  { value: 'budget', label: '💰 Budget (<300)' },
  { value: 'moderate', label: '💰💰 Moderate (300-700)' },
  { value: 'premium', label: '💰💰💰 Premium (700+)' }
];

const TAG_OPTIONS = [
  { category: 'Cuisine', tags: ['Mangalorean', 'Seafood', 'Vegetarian', 'Vegan', 'Spicy', 'Healthy'] },
  { category: 'Vibe', tags: ['Casual', 'Date-Night', 'Family-Friendly', 'Solo', 'Business', 'Lively'] },
  { category: 'Features', tags: ['Outdoor Seating', 'Late Night', 'Quick Service', 'Delivery', 'AC', 'WiFi'] }
];

export default function SaveRecommendationModal({
  open,
  onOpenChange,
  restaurantName = '',
  sessionId,
  onSuccess
}: SaveRecommendationModalProps) {
  const [name, setName] = useState(restaurantName);
  const [cuisine, setCuisine] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!name.trim()) {
      setError('Please enter a restaurant name');
      return;
    }
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const deviceId = await getDeviceId();

      const { error: insertError } = await supabase
        .from('community_recommendations')
        .insert([
          {
            session_id: sessionId || null,
            user_id: user?.id || null,
            device_id: !user ? deviceId : null,
            restaurant_name: name.trim(),
            cuisine_type: cuisine || null,
            price_range: priceRange || null,
            location: location.trim() || null,
            notes: notes.trim() || null,
            rating,
            tags: selectedTags.length > 0 ? selectedTags : null
          }
        ]);

      if (insertError) {
        setError('Failed to save recommendation. Please try again.');
        console.error('Supabase error:', insertError);
        return;
      }

      // Success
      setName('');
      setCuisine('');
      setPriceRange('');
      setLocation('');
      setNotes('');
      setRating(0);
      setSelectedTags([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save This Recommendation 🍽️</DialogTitle>
          <DialogDescription>
            Help other foodies find great spots in Mangalore! Share your experience.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Restaurant Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Restaurant Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter restaurant name"
              disabled={loading}
            />
          </div>

          {/* Cuisine Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Cuisine Type
            </label>
            <select
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select cuisine...</option>
              {CUISINE_OPTIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Price Range
            </label>
            <div className="flex gap-2">
              {PRICE_RANGE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriceRange(value)}
                  disabled={loading}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    priceRange === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Location (Area)
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Balmatta, Kankanady"
              disabled={loading}
            />
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Your Rating *
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  disabled={loading}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    size={28}
                    className={`${
                      star <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Your Notes
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., Try the Ghee Roast, Great ambiance, Must book ahead..."
              disabled={loading}
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Tags (helps others find this place)
            </label>
            <div className="space-y-2">
              {TAG_OPTIONS.map(({ category, tags }) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {category}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                          selectedTags.includes(tag)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card hover:border-primary/30 text-foreground'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Saving...' : 'Save Recommendation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
