import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Camera, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Comments from '@/components/Comments';

type FoodPhoto = {
  id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  uploader_name: string | null;
  created_at: string;
};

const ADMIN_EMAIL = 'kev.cornelio@gmail.com';

const PhotosPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [photos, setPhotos] = useState<FoodPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<FoodPhoto | null>(null);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('food_photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);
      if (data) setPhotos(data as FoodPhoto[]);
      setLoading(false);
    };
    load();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from('food-photos')
      .upload(path, file, { contentType: file.type });

    if (storageError) {
      toast.error('Upload failed: ' + storageError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('food-photos').getPublicUrl(path);
    const photo_url = urlData.publicUrl;

    const uploader_name = profile?.full_name || user.email?.split('@')[0] || null;
    const { data, error: dbError } = await supabase
      .from('food_photos')
      .insert({ user_id: user.id, photo_url, caption: caption.trim() || null, uploader_name })
      .select('*')
      .single();

    if (dbError) {
      toast.error('Failed to save photo');
    } else if (data) {
      // Fire-and-forget: make captioned photos searchable by the chat RAG
      if ((data as FoodPhoto).caption) {
        fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'photo', id: (data as FoodPhoto).id }),
        }).catch(() => { /* non-critical */ });
      }
      setPhotos(prev => [data as FoodPhoto, ...prev]);
      setFile(null);
      setPreview(null);
      setCaption('');
      setShowUpload(false);
      toast.success('Photo added!');
    }

    setUploading(false);
  };

  const handleDelete = async (photo: FoodPhoto) => {
    // Extract storage path from public URL
    const url = new URL(photo.photo_url);
    const pathParts = url.pathname.split('/food-photos/');
    const storagePath = pathParts[1];

    await supabase.storage.from('food-photos').remove([storagePath]);
    await supabase.from('food_photos').delete().eq('id', photo.id);
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    toast.success('Removed');
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Food Photos</h1>
        </div>
        {user ? (
          <Button size="sm" onClick={() => setShowUpload(!showUpload)} className="gap-1">
            <Camera className="h-3 w-3" /> Add Photo
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => navigate('/auth')}>
            Sign in to add
          </Button>
        )}
      </div>

      {/* Upload form (auth users only) */}
      {showUpload && user && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full rounded-lg object-cover max-h-64" />
              <button
                onClick={clearFile}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-lg py-10 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm">Click to choose a photo</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Input
            placeholder="Caption (optional)"
            value={caption}
            onChange={e => setCaption(e.target.value)}
          />
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full gap-1"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upload
          </Button>
        </div>
      )}

      {/* Gallery */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          No photos yet. {user ? 'Be the first to share one!' : 'Sign in to add the first one!'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden bg-card border border-border aspect-square">
              <button className="w-full h-full" onClick={() => setSelectedPhoto(photo)}>
                <img
                  src={photo.photo_url}
                  alt={photo.caption ?? 'Food photo'}
                  className="w-full h-full object-cover"
                />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 pointer-events-none">
                {photo.caption && (
                  <p className="text-[10px] text-white truncate">{photo.caption}</p>
                )}
                <p className="text-[9px] text-white/80 truncate">📷 {photo.uploader_name || 'Anonymous'}</p>
              </div>
              {user && (photo.user_id === user.id || isAdmin) && (
                <button
                  onClick={() => handleDelete(photo)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-black/60 rounded-full p-1 text-white hover:bg-destructive transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo detail + comments */}
      <Dialog open={!!selectedPhoto} onOpenChange={(open) => { if (!open) setSelectedPhoto(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {selectedPhoto.caption || 'Food photo'}
                </DialogTitle>
              </DialogHeader>
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption ?? 'Food photo'}
                className="w-full rounded-xl object-contain max-h-[50vh] bg-black/5"
              />
              <p className="text-xs text-muted-foreground">
                📷 Shared by <span className="font-medium text-foreground">{selectedPhoto.uploader_name || 'Anonymous'}</span>
                {' · '}
                {new Date(selectedPhoto.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <div className="pt-2 border-t border-border">
                <Comments photoId={selectedPhoto.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotosPage;
