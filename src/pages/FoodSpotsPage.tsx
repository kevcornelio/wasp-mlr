import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Star, Trash2, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getAnonSupabaseClient } from '@/lib/anonSupabase';
import { getDeviceId } from '@/lib/deviceId';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type FoodSpot = {
  id: string;
  restaurant_name: string;
  location: string | null;
  dishes: string[];
  notes: string | null;
  rating: number | null;
  created_at: string;
  user_id: string | null;
  device_id: string | null;
};

const FoodSpotsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const db = useMemo(() => (user ? supabase : getAnonSupabaseClient()), [user]);

  const [spots, setSpots] = useState<FoodSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [dishes, setDishes] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const deviceId = getDeviceId();

  useEffect(() => {
    const load = async () => {
      const { data } = await db
        .from('user_food_spots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setSpots(data as FoodSpot[]);
      setLoading(false);
    };
    load();
  }, [db]);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Restaurant name is required'); return; }
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      restaurant_name: name.trim(),
      location: location.trim() || null,
      dishes: dishes.split(',').map(d => d.trim()).filter(Boolean),
      notes: notes.trim() || null,
      rating: rating || null,
    };
    if (user) payload.user_id = user.id;
    else payload.device_id = deviceId;

    const { data, error } = await db.from('user_food_spots').insert(payload as any).select('*').single();
    if (error) {
      toast.error('Failed to save');
    } else if (data) {
      setSpots(prev => [data as FoodSpot, ...prev]);
      setName(''); setLocation(''); setDishes(''); setNotes(''); setRating(0);
      setShowForm(false);
      toast.success('Spot added! 🍽️');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await db.from('user_food_spots').delete().eq('id', id);
    setSpots(prev => prev.filter(s => s.id !== id));
    toast.success('Removed');
  };

  const isOwn = (spot: FoodSpot) =>
    (user && spot.user_id === user.id) || (!user && spot.device_id === deviceId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Community Food Spots</h1>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1">
          <Plus className="h-3 w-3" /> Add Spot
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          <Input placeholder="Restaurant name *" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Location (e.g. Hampankatta)" value={location} onChange={e => setLocation(e.target.value)} />
          <Input placeholder="Dishes you loved (comma separated)" value={dishes} onChange={e => setDishes(e.target.value)} />
          <Textarea placeholder="Any notes or tips?" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">Rating:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(rating === n ? 0 : n)}>
                <Star className={`h-4 w-4 ${n <= rating ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
              </button>
            ))}
          </div>
          <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-1">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Spot
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : spots.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          No spots yet. Be the first to share a recommendation! 🍜
        </p>
      ) : (
        <div className="space-y-3">
          {spots.map(spot => (
            <div key={spot.id} className="bg-card border border-border rounded-xl p-4 group">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">{spot.restaurant_name}</h3>
                  {spot.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {spot.location}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {spot.rating && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: spot.rating }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-warning text-warning" />
                      ))}
                    </div>
                  )}
                  {isOwn(spot) && (
                    <button onClick={() => handleDelete(spot.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              {spot.dishes && spot.dishes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {spot.dishes.map((d, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{d}</span>
                  ))}
                </div>
              )}
              {spot.notes && <p className="text-xs text-muted-foreground mt-2">{spot.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FoodSpotsPage;
