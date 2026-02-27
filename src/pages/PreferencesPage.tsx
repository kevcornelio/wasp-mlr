import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getAnonSupabaseClient } from '@/lib/anonSupabase';
import { getDeviceId } from '@/lib/deviceId';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const DIET_OPTIONS = ['Any', 'Vegetarian', 'Non-Vegetarian', 'Eggetarian', 'Vegan'];
const SPICE_OPTIONS = ['Mild', 'Medium', 'Spicy', 'Extra Spicy'];
const CUISINE_OPTIONS = ['Mangalorean', 'Udupi', 'North Indian', 'Chinese', 'Coastal Seafood', 'Street Food', 'Bakery & Cafe', 'Biryani', 'Italian', 'Continental'];
const BUDGET_OPTIONS = ['Budget', 'Moderate', 'Premium', 'Any'];
const ALLERGY_OPTIONS = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy'];

const PreferencesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const db = useMemo(() => (user ? supabase : getAnonSupabaseClient()), [user]);

  const [dietType, setDietType] = useState('any');
  const [spiceLevel, setSpiceLevel] = useState('medium');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [favCuisines, setFavCuisines] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState('moderate');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await db.from('user_preferences').select('*').limit(1).single();
      if (data) {
        setExistingId(data.id);
        setDietType(data.diet_type || 'any');
        setSpiceLevel(data.spice_level || 'medium');
        setAllergies((data.allergies as string[]) || []);
        setFavCuisines((data.favorite_cuisines as string[]) || []);
        setBudgetRange(data.budget_range || 'moderate');
      }
      setLoading(false);
    };
    load();
  }, [db]);

  const toggleItem = (arr: string[], setArr: (v: string[]) => void, item: string) => {
    setArr(arr.includes(item) ? arr.filter(a => a !== item) : [...arr, item]);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = {
      diet_type: dietType,
      spice_level: spiceLevel,
      allergies,
      favorite_cuisines: favCuisines,
      budget_range: budgetRange,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      await db.from('user_preferences').update(payload).eq('id', existingId);
    } else {
      if (user) payload.user_id = user.id;
      else payload.device_id = getDeviceId();
      const { data } = await db.from('user_preferences').insert(payload as any).select('id').single();
      if (data) setExistingId(data.id);
    }
    setSaving(false);
    toast.success('Preferences saved!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold text-foreground">Food Preferences</h1>
      </div>

      <div className="space-y-6">
        {/* Diet Type */}
        <Section title="Diet Type">
          <div className="flex flex-wrap gap-2">
            {DIET_OPTIONS.map(opt => {
              const val = opt.toLowerCase().replace(' ', '-');
              return (
                <Chip key={opt} label={opt} active={dietType === val} onClick={() => setDietType(val)} />
              );
            })}
          </div>
        </Section>

        {/* Spice Level */}
        <Section title="Spice Level">
          <div className="flex flex-wrap gap-2">
            {SPICE_OPTIONS.map(opt => {
              const val = opt.toLowerCase().replace(' ', '-');
              return (
                <Chip key={opt} label={opt} active={spiceLevel === val} onClick={() => setSpiceLevel(val)} />
              );
            })}
          </div>
        </Section>

        {/* Budget */}
        <Section title="Budget Range">
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map(opt => {
              const val = opt.toLowerCase();
              return (
                <Chip key={opt} label={opt} active={budgetRange === val} onClick={() => setBudgetRange(val)} />
              );
            })}
          </div>
        </Section>

        {/* Favorite Cuisines */}
        <Section title="Favorite Cuisines">
          <div className="flex flex-wrap gap-2">
            {CUISINE_OPTIONS.map(opt => (
              <Chip key={opt} label={opt} active={favCuisines.includes(opt)} onClick={() => toggleItem(favCuisines, setFavCuisines, opt)} />
            ))}
          </div>
        </Section>

        {/* Allergies */}
        <Section title="Allergies / Dietary Restrictions">
          <div className="flex flex-wrap gap-2">
            {ALLERGY_OPTIONS.map(opt => (
              <Chip key={opt} label={opt} active={allergies.includes(opt)} onClick={() => toggleItem(allergies, setAllergies, opt)} />
            ))}
          </div>
        </Section>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-medium text-foreground">{title}</h3>
    {children}
  </div>
);

const Chip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-card text-foreground border-border hover:bg-accent'
    }`}
  >
    {label}
  </button>
);

export default PreferencesPage;
