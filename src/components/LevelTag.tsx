import type { FoodLevel } from '@/lib/levels';

// Tiny inline badge shown next to a user's name anywhere it appears.
const LevelTag = ({ level, className = '' }: { level?: FoodLevel; className?: string }) => {
  if (!level) return null;
  return (
    <span
      title={level.name}
      className={`inline-flex items-center gap-0.5 align-middle text-[9px] font-medium text-orange-400 bg-primary/10 border border-primary/25 px-1 py-px rounded-full whitespace-nowrap ${className}`}
    >
      {level.emoji} {level.name}
    </span>
  );
};

export default LevelTag;
