import { useApp } from '@/context/AppContext';

export const AppHeader = () => {
  const { currentUser } = useApp();

  const initials = currentUser?.fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-end px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground hidden sm:block">
          {currentUser?.fullName}
        </span>
        <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
          {initials}
        </div>
      </div>
    </header>
  );
};
