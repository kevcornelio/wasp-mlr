import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UtensilsCrossed, Utensils, Camera, BookOpen, Settings, LogOut, LifeBuoy, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isAdminEmail } from '@/lib/admin';
import { useLevels } from '@/hooks/useLevels';
import SupportModal from '@/components/SupportModal';

// Persistent left panel + mobile header wrapped around every page except the
// chat page (which has its own richer sidebar with history) and auth/404.
const AppShell = ({ children }: { children: ReactNode }) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);
  const levels = useLevels([user?.id]);
  const myLevel = user ? levels[user.id] : undefined;
  const firstName = profile?.full_name?.split(' ')[0] || '';

  const nav = [
    { label: 'Chat', icon: UtensilsCrossed, path: '/chat' },
    { label: 'Add Food Spot', icon: Utensils, path: '/spots' },
    { label: 'Food Photos', icon: Camera, path: '/photos' },
    { label: 'Blog', icon: BookOpen, path: '/blog' },
    { label: 'Preferences', icon: Settings, path: '/preferences' },
    ...(isAdminEmail(user?.email) ? [{ label: 'Admin', icon: ShieldCheck, path: '/admin' }] : []),
  ];

  const isActive = (path: string) =>
    path === '/chat' ? location.pathname === '/chat' : location.pathname.startsWith(path);

  return (
    <div className="dark flex h-screen w-full bg-background">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 sidebar-gradient border-r border-white/10 h-full">
        <button
          onClick={() => navigate('/chat')}
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
              <p className="text-[10px] text-orange-300 leading-none mt-1">
                {myLevel.emoji} {myLevel.name}
              </p>
            )}
          </div>
        </button>

        <nav className="px-2 py-3 space-y-0.5">
          {nav.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive(item.path)
                  ? 'bg-primary/20 text-orange-200'
                  : 'text-white/80 hover:bg-white/10 hover:text-white hover:translate-x-0.5'
              }`}
            >
              <item.icon className={`h-4 w-4 shrink-0 transition-colors ${
                isActive(item.path) ? 'text-orange-300' : 'text-white/40 group-hover:text-orange-300'
              }`} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="px-2 py-2 border-t border-white/10">
          <button
            onClick={() => setSupportOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-orange-200 bg-primary/15 border border-primary/30 hover:bg-primary/25 hover:border-primary/50 transition-all"
          >
            <LifeBuoy className="h-4 w-4 shrink-0" />
            Contact Support
          </button>
        </div>

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

      {/* ── Page column ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Mobile header */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-white/10 sidebar-gradient sticky top-0 z-10">
          <button onClick={() => navigate('/chat')} className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-red-500 flex items-center justify-center shadow-md shadow-primary/40">
              <UtensilsCrossed className="h-4 w-4 text-white" />
            </div>
            <span className="text-base leading-none tracking-tight" style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
              <span className="text-white">Wassup</span>{' '}
              <span className="text-gradient-bright">MLR</span>
            </span>
          </button>
          <div className="flex items-center gap-0.5">
            {nav.map(item => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                title={item.label}
                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${
                  isActive(item.path) ? 'bg-primary/20 text-orange-300' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
      </div>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
};

export default AppShell;
