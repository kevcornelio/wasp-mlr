// Food-themed contribution levels. Score = approved blogs ×15 + food spots ×3
// + photos ×1 + chat sessions ×1. Blogs are weighted far above the rest —
// they take real effort and feed the chat RAG. This is the single source of
// truth for the weights.

export type FoodLevel = { name: string; emoji: string; min: number };

// Thresholds widen as levels rise — early wins come quickly, the top
// levels are earned over the long haul.
export const FOOD_LEVELS: FoodLevel[] = [
  { name: 'New Foodie', emoji: '🍽️', min: 0 },
  { name: 'Taster', emoji: '🥢', min: 5 },
  { name: 'Food Explorer', emoji: '🍜', min: 25 },
  { name: 'Local Expert', emoji: '🍱', min: 75 },
  { name: 'Connoisseur', emoji: '⭐', min: 150 },
  { name: 'Food Legend', emoji: '👑', min: 300 },
];

export const contributionScore = (blogs: number, spots: number, photos: number, chats = 0): number =>
  blogs * 15 + spots * 3 + photos + chats;

export const getLevel = (score: number): FoodLevel =>
  [...FOOD_LEVELS].reverse().find(l => score >= l.min) ?? FOOD_LEVELS[0];

// The next level up, or null when already at the top.
export const getNextLevel = (score: number): FoodLevel | null =>
  FOOD_LEVELS.find(l => l.min > score) ?? null;
